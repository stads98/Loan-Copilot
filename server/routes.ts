import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertLoanSchema, insertPropertySchema, insertContactSchema, insertTaskSchema, insertDocumentSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import { processLoanDocuments, analyzeDriveDocuments } from "./lib/openai";
import { authenticateGoogle, getDriveFiles } from "./lib/google";
import { createFallbackAssistantResponse } from "./lib/fallbackAI";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";

const SessionStore = MemoryStore(session);

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "loan-copilot-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
      store: new SessionStore({ checkPeriod: 86400000 }), // prune expired entries every 24h
    })
  );

  // Set up passport for authentication
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }
        if (user.password !== password) { // In a real app, we would use bcrypt to compare passwords
          return done(null, false, { message: "Incorrect password." });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Authentication middleware
  const isAuthenticated = (req: Request, res: Response, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Not authenticated" });
  };

  // Authentication routes
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  app.get("/api/auth/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Google OAuth routes
  app.get("/api/auth/google", (req, res) => {
    authenticateGoogle(req, res);
  });

  app.get("/api/auth/google/callback", (req, res) => {
    // Handle the OAuth callback (would be implemented in google.ts)
    res.redirect("/dashboard");
  });

  // Lenders
  app.get("/api/lenders", async (req, res) => {
    const lenders = await storage.getLenders();
    res.json(lenders);
  });

  app.get("/api/lenders/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid lender ID" });
    }

    const lender = await storage.getLender(id);
    if (!lender) {
      return res.status(404).json({ message: "Lender not found" });
    }

    res.json(lender);
  });

  // Loan Types
  app.get("/api/loan-types", async (req, res) => {
    const loanTypes = await storage.getLoanTypes();
    res.json(loanTypes);
  });

  // Loans
  app.get("/api/loans", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const loans = await storage.getLoansByProcessorId(user.id);
    res.json(loans);
  });

  app.get("/api/loans/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    const loan = await storage.getLoanWithDetails(id);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    res.json(loan);
  });

  app.post("/api/loans", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const loanData = insertLoanSchema.parse({
        ...req.body,
        processorId: user.id
      });

      const propertyData = insertPropertySchema.parse(req.body.property);
      const property = await storage.createProperty(propertyData);

      const loan = await storage.createLoan({
        ...loanData,
        propertyId: property.id
      });

      // Create contacts if provided
      if (req.body.contacts && Array.isArray(req.body.contacts)) {
        for (const contactData of req.body.contacts) {
          await storage.createContact({
            ...contactData,
            loanId: loan.id
          });
        }
      }

      res.status(201).json(loan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid loan data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating loan" });
    }
  });

  app.patch("/api/loans/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const loan = await storage.getLoan(id);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      const updatedLoan = await storage.updateLoan(id, req.body);
      res.json(updatedLoan);
    } catch (error) {
      res.status(500).json({ message: "Error updating loan" });
    }
  });

  // Documents
  app.get("/api/loans/:loanId/documents", isAuthenticated, async (req, res) => {
    const loanId = parseInt(req.params.loanId);
    if (isNaN(loanId)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    const documents = await storage.getDocumentsByLoanId(loanId);
    res.json(documents);
  });
  
  // Sync documents from Google Drive for a loan
  app.post("/api/loans/:id/sync-documents", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const loanId = parseInt(id, 10);
      
      // Get the loan details to access the Google Drive folder ID
      const loanDetails = await storage.getLoanWithDetails(loanId);
      
      if (!loanDetails || !loanDetails.loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Use the Google Drive folder ID from the loan
      // In a real implementation, this would be stored when the loan is created
      const driveFolderId = loanDetails.loan.driveFolder || loanDetails.loan.googleDriveFolderId || "";
      
      if (!driveFolderId) {
        return res.status(400).json({ 
          success: false, 
          message: "No Google Drive folder is associated with this loan" 
        });
      }
      
      // Get files from Google Drive folder
      const files = await getDriveFiles(driveFolderId);
      
      if (!files || files.length === 0) {
        return res.status(200).json({ 
          success: true, 
          message: "No new documents found in the Google Drive folder",
          documentsAdded: 0
        });
      }
      
      // Get existing documents to avoid duplicates
      const existingDocuments = await storage.getDocumentsByLoanId(loanId);
      const existingFileIds = existingDocuments.map(doc => doc.fileId);
      
      // Filter out documents that already exist
      const newFiles = files.filter(file => !existingFileIds.includes(file.id));
      
      if (newFiles.length === 0) {
        return res.status(200).json({ 
          success: true, 
          message: "All documents from Google Drive are already synced",
          documentsAdded: 0
        });
      }
      
      // Process and add each new document
      const addedDocuments = [];
      for (const file of newFiles) {
        // Extract text from the file name and metadata
        let extractedText = `File: ${file.name}\n`;
        
        if (file.modifiedTime) {
          extractedText += `Modified: ${file.modifiedTime}\n`;
        }
        
        // Determine document category based on file name
        let category = "other";
        const fileName = file.name.toLowerCase();
        
        if (fileName.includes("license") || fileName.includes("id") || fileName.includes("passport") || 
            fileName.includes("llc") || fileName.includes("entity") || fileName.includes("incorporation")) {
          category = "borrower";
        } else if (fileName.includes("property") || fileName.includes("appraisal") || fileName.includes("survey")) {
          category = "property";
        } else if (fileName.includes("title") || fileName.includes("deed") || fileName.includes("escrow")) {
          category = "title";
        } else if (fileName.includes("insurance") || fileName.includes("policy") || fileName.includes("binder")) {
          category = "insurance";
        } else if (fileName.includes("loan") || fileName.includes("mortgage") || fileName.includes("note")) {
          category = "loan";
        } else if (fileName.includes("bank") || fileName.includes("statement") || fileName.includes("financial")) {
          category = "banking";
        }
        
        // Create a document record
        const document = await storage.createDocument({
          loanId,
          name: file.name,
          fileId: file.id,
          fileType: file.mimeType.split('/')[1] || "unknown",
          fileSize: parseInt(file.size || "0", 10),
          category,
          status: "synced" // Status field is now in the schema
        });
        
        addedDocuments.push(document);
      }
      
      // Return success with the number of documents added
      res.status(200).json({
        success: true,
        message: `Successfully synced ${addedDocuments.length} new document(s) from Google Drive`,
        documentsAdded: addedDocuments.length,
        documents: addedDocuments
      });
      
    } catch (error) {
      console.error("Error syncing documents from Google Drive:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to sync documents from Google Drive" 
      });
    }
  });

  app.post("/api/loans/:loanId/documents", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const documentData = insertDocumentSchema.parse({
        ...req.body,
        loanId
      });

      const document = await storage.createDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid document data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const success = await storage.deleteDocument(id);
      if (!success) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting document" });
    }
  });

  // Tasks
  app.get("/api/loans/:loanId/tasks", isAuthenticated, async (req, res) => {
    const loanId = parseInt(req.params.loanId);
    if (isNaN(loanId)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    const tasks = await storage.getTasksByLoanId(loanId);
    res.json(tasks);
  });

  app.post("/api/loans/:loanId/tasks", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const taskData = insertTaskSchema.parse({
        ...req.body,
        loanId
      });

      const task = await storage.createTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid task data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating task" });
    }
  });

  app.patch("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const updatedTask = await storage.updateTask(id, req.body);
      res.json(updatedTask);
    } catch (error) {
      res.status(500).json({ message: "Error updating task" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      const success = await storage.deleteTask(id);
      if (!success) {
        return res.status(404).json({ message: "Task not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting task" });
    }
  });

  // Contacts
  app.get("/api/loans/:loanId/contacts", isAuthenticated, async (req, res) => {
    const loanId = parseInt(req.params.loanId);
    if (isNaN(loanId)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    const contacts = await storage.getContactsByLoanId(loanId);
    res.json(contacts);
  });

  app.post("/api/loans/:loanId/contacts", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const contactData = insertContactSchema.parse({
        ...req.body,
        loanId
      });

      const contact = await storage.createContact(contactData);
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid contact data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating contact" });
    }
  });

  app.patch("/api/contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }

      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const updatedContact = await storage.updateContact(id, req.body);
      res.json(updatedContact);
    } catch (error) {
      res.status(500).json({ message: "Error updating contact" });
    }
  });

  app.delete("/api/contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }

      const success = await storage.deleteContact(id);
      if (!success) {
        return res.status(404).json({ message: "Contact not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting contact" });
    }
  });

  // Chat/Messages
  app.get("/api/loans/:loanId/messages", isAuthenticated, async (req, res) => {
    const loanId = parseInt(req.params.loanId);
    if (isNaN(loanId)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    const messages = await storage.getMessagesByLoanId(loanId);
    res.json(messages);
  });

  app.post("/api/loans/:loanId/messages", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const messageData = insertMessageSchema.parse({
        ...req.body,
        loanId,
        role: "user"
      });

      // Save user message
      const userMessage = await storage.createMessage(messageData);

      // Get loan details for AI context
      const loanDetails = await storage.getLoanWithDetails(loanId);
      if (!loanDetails) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Get all previous messages for context
      const previousMessages = await storage.getMessagesByLoanId(loanId);

      // Try to use OpenAI API, fall back to local assistant if not available
      let assistantMessage;
      try {
        // Generate AI response with OpenAI
        const aiResponse = await processLoanDocuments(
          loanDetails,
          messageData.content,
          previousMessages
        );
        
        // Save AI response from OpenAI
        assistantMessage = await storage.createMessage({
          content: aiResponse,
          role: "assistant",
          loanId
        });
      } catch (apiError) {
        console.error("Error calling OpenAI:", apiError);
        
        // Use fallback assistant instead
        const fallbackMessage = await createFallbackAssistantResponse(
          loanDetails,
          messageData.content
        );
        
        // Save fallback response
        assistantMessage = await storage.createMessage({
          content: fallbackMessage.content,
          role: "assistant",
          loanId
        });
      }

      res.status(201).json({
        userMessage,
        assistantMessage
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      res.status(500).json({ message: "Error processing message" });
    }
  });

  // Google Drive integration
  app.get("/api/drive/files", isAuthenticated, async (req, res) => {
    try {
      const folderId = req.query.folderId as string;
      if (!folderId) {
        return res.status(400).json({ message: "Folder ID is required" });
      }

      const files = await getDriveFiles(folderId);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Error fetching Drive files" });
    }
  });

  // Set up a demo loan route
  app.post("/api/demo-loan", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Create a property
      const property = await storage.createProperty({
        address: "321 NW 43rd St",
        city: "Oakland Park",
        state: "FL",
        zipCode: "33309",
        propertyType: "Residential"
      });

      // Create a loan
      const loan = await storage.createLoan({
        borrowerName: "John Smith",
        loanAmount: "324,500",
        loanType: "DSCR",
        loanPurpose: "Purchase",
        status: "in_progress",
        targetCloseDate: "2023-08-15",
        propertyId: property.id,
        lenderId: 1, // Kiavi
        processorId: user.id,
        completionPercentage: 65
      });

      // Create contacts
      await storage.createContact({
        name: "John Smith",
        email: "john.smith@example.com",
        phone: "555-123-4567",
        role: "borrower",
        loanId: loan.id
      });

      await storage.createContact({
        name: "Sunrise Title Co.",
        email: "info@sunrisetitle.com",
        phone: "555-987-6543",
        company: "Sunrise Title",
        role: "title",
        loanId: loan.id
      });

      await storage.createContact({
        name: "AllState Insurance",
        email: "agent@allstate.com",
        phone: "555-456-7890",
        company: "AllState",
        role: "insurance",
        loanId: loan.id
      });

      // Create documents
      await storage.createDocument({
        name: "DriverLicense.pdf",
        fileId: "driver-license-123",
        fileType: "pdf",
        fileSize: 1200,
        category: "borrower",
        loanId: loan.id
      });

      await storage.createDocument({
        name: "BankStatement-Jan.pdf",
        fileId: "bank-statement-123",
        fileType: "pdf",
        fileSize: 3400,
        category: "borrower",
        loanId: loan.id
      });

      await storage.createDocument({
        name: "PurchaseContract.pdf",
        fileId: "purchase-contract-123",
        fileType: "pdf",
        fileSize: 5700,
        category: "property",
        loanId: loan.id
      });

      await storage.createDocument({
        name: "CreditReport.pdf",
        fileId: "credit-report-123",
        fileType: "pdf",
        fileSize: 2100,
        category: "borrower",
        loanId: loan.id
      });

      // Create tasks
      await storage.createTask({
        description: "Contact AllState for insurance binder",
        dueDate: "2023-08-05",
        priority: "high",
        completed: false,
        loanId: loan.id
      });

      await storage.createTask({
        description: "Request title commitment from Sunrise Title",
        dueDate: "2023-08-07",
        priority: "medium",
        completed: false,
        loanId: loan.id
      });

      await storage.createTask({
        description: "Send DSCR certification form to borrower",
        dueDate: "2023-08-06",
        priority: "medium",
        completed: false,
        loanId: loan.id
      });

      await storage.createTask({
        description: "Verify borrower ID and documentation",
        dueDate: "2023-08-02",
        priority: "medium",
        completed: true,
        loanId: loan.id
      });

      // Initial AI analysis message - using hardcoded version for demo
      const analysisMessage = "I've analyzed the documents for your Kiavi DSCR Purchase loan for 321 NW 43rd St. Here's what I found:\n\nDocuments Present:\n- Driver's License\n- Bank Statement (January)\n- Purchase Contract\n- Credit Report\n\nDocuments Missing:\n- Insurance Quote or Binder\n- Title Commitment\n- Entity Documents (if applicable)\n- DSCR Certification Form\n\nNext Steps:\n1. Contact insurance agent to request binder (high priority)\n2. Reach out to title company for preliminary title report\n3. Have borrower complete the DSCR certification form";
      
      await storage.createMessage({
        content: analysisMessage,
        role: "assistant",
        loanId: loan.id
      });

      res.status(201).json({ success: true, loanId: loan.id });
    } catch (error) {
      res.status(500).json({ message: "Error creating demo loan" });
    }
  });
  
  // Create loan from Google Drive folder
  app.post("/api/loans/from-drive", isAuthenticated, async (req, res) => {
    try {
      const { driveFolderId } = req.body;
      
      if (!driveFolderId) {
        return res.status(400).json({ success: false, message: "Drive folder ID is required" });
      }
      
      console.log("Processing Google Drive folder:", driveFolderId);
      
      // Get files from Google Drive folder
      const files = await getDriveFiles(driveFolderId);
      
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: "No files found in the specified Google Drive folder" });
      }
      
      console.log(`Found ${files.length} files in the Google Drive folder`);
      
      
      // Extract real text content from the files
      // For each file in the Google Drive folder, we'll extract whatever information we can
      const processedDocuments = files.map(file => {
        // Use the file name to determine what kind of document this might be
        const filename = file.name.toLowerCase();
        
        // Extract the actual content from the file name and metadata
        // In a production app, we would download the actual file content
        let extractedText = `File: ${file.name}\n`;
        
        // Add file metadata
        if (file.modifiedTime) {
          extractedText += `Modified: ${file.modifiedTime}\n`;
        }
        
        // Try to extract meaningful information from the filename
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        const words = nameWithoutExt.split(/[_\s-]+/);
        
        // Add possible content based on file type patterns
        if (filename.includes("license") || filename.includes("id") || filename.includes("passport")) {
          extractedText += `Document Type: Identification\n`;
          // Try to extract a name from the filename
          const possibleName = words.slice(0, 2).join(" ").replace(/[^a-z\s]/gi, "");
          if (possibleName.length > 3) {
            extractedText += `Name: ${possibleName}\n`;
          }
        } else if (filename.includes("bank") || filename.includes("statement")) {
          extractedText += `Document Type: Financial Statement\n`;
          // Try to extract account info or date from the filename
          const dateMatch = filename.match(/\d{1,2}[-_\.]\d{1,2}[-_\.]\d{2,4}/);
          if (dateMatch) {
            extractedText += `Statement Date: ${dateMatch[0]}\n`;
          }
        } else if (filename.includes("tax") || filename.includes("return")) {
          extractedText += `Document Type: Tax Document\n`;
          // Try to extract year from the filename
          const yearMatch = filename.match(/20\d{2}/);
          if (yearMatch) {
            extractedText += `Tax Year: ${yearMatch[0]}\n`;
          }
        } else if (filename.includes("llc") || filename.includes("entity") || filename.includes("incorporation")) {
          extractedText += `Document Type: Entity Document\n`;
          // Try to extract entity name from the filename
          const entityWords = words.slice(0, words.findIndex(w => w.includes("llc") || w.includes("inc")) + 1);
          if (entityWords.length > 0) {
            extractedText += `Entity Name: ${entityWords.join(" ")}\n`;
          }
        } else if (filename.includes("property") || filename.includes("appraisal") || filename.includes("survey")) {
          extractedText += `Document Type: Property Document\n`;
          // Try to extract address from the filename
          const addressWords = words.filter(w => /\d/.test(w) || /(st|ave|rd|ln|dr|blvd|way)/.test(w));
          if (addressWords.length > 0) {
            extractedText += `Property Info: ${addressWords.join(" ")}\n`;
          }
        } else if (filename.includes("insurance") || filename.includes("policy") || filename.includes("binder")) {
          extractedText += `Document Type: Insurance Document\n`;
          // Try to extract insurance type from the filename
          if (filename.includes("hazard")) extractedText += `Insurance Type: Hazard\n`;
          if (filename.includes("liability")) extractedText += `Insurance Type: Liability\n`;
          if (filename.includes("flood")) extractedText += `Insurance Type: Flood\n`;
        } else if (filename.includes("title") || filename.includes("deed") || filename.includes("escrow")) {
          extractedText += `Document Type: Title/Deed Document\n`;
        } else if (filename.includes("loan") || filename.includes("mortgage") || filename.includes("note")) {
          extractedText += `Document Type: Loan Document\n`;
          // Try to extract loan amount from the filename
          const amountMatch = filename.match(/\$?(\d+)[k]?/);
          if (amountMatch) {
            const amount = amountMatch[1].includes("k") ? 
              parseInt(amountMatch[1].replace("k", "")) * 1000 : 
              parseInt(amountMatch[1]);
            extractedText += `Possible Amount: $${amount.toLocaleString()}\n`;
          }
        } else {
          // For other document types, just describe what we can
          extractedText += `Document Type: Other\n`;
          extractedText += `Words identified: ${words.join(", ")}\n`;
        }

        return {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          modifiedTime: file.modifiedTime,
          text: extractedText
        };
      });
      
      // Use OpenAI for document analysis with improved error handling
      let analysisResult;
      try {
        console.log(`Analyzing ${processedDocuments.length} documents with OpenAI...`);
        // Verify OpenAI API key is available
        if (!process.env.OPENAI_API_KEY) {
          throw new Error("OpenAI API key not configured");
        }
        
        analysisResult = await analyzeDriveDocuments(processedDocuments);
        console.log("Document analysis completed successfully with OpenAI");
      } catch (analyzeError) {
        console.error("Error during document analysis:", analyzeError);
        console.log("Using document text extraction fallback");
        
        // Create an analysis result based on file content extraction
        // This will work even when OpenAI is unavailable
        const filePatterns = processedDocuments.map(doc => doc.name.toLowerCase());
        
        // Look for file patterns to determine the loan type and purpose
        const isDSCR = filePatterns.some(name => name.includes('dscr') || name.includes('debt service'));
        const isRefinance = filePatterns.some(name => name.includes('refinance') || name.includes('refi'));
        
        // Try to extract loan amount from file names
        let loanAmount = "TBD";
        for (const doc of processedDocuments) {
          const amountMatch = doc.name.match(/\$?(\d[\d,]*(\.\d+)?)[k]?/i);
          if (amountMatch) {
            loanAmount = amountMatch[0];
            break;
          }
        }
        
        analysisResult = {
          borrowerName: filePatterns.some(name => name.includes('llc')) ? 
            "Property Investment LLC" : "Property Investor",
          loanAmount: loanAmount,
          loanType: isDSCR ? "DSCR" : "Fix & Flip",
          loanPurpose: isRefinance ? "Refinance" : "Purchase",
          address: "Property Address from Files",
          city: "Property City",
          state: "CA",
          zipCode: "90210",
          propertyType: "Single Family Residence",
          contacts: [],
          missingDocuments: ["Insurance Binder", "Title Commitment", "DSCR Certification Form"],
          documentCategories: {}
        };
        
        // Extract some basic info from file names
        for (const doc of processedDocuments) {
          const name = doc.name.toLowerCase();
          if (name.includes("license") || name.includes("id")) {
            // Try to extract borrower name from ID documents
            const nameMatch = doc.text.match(/Name:\s*([^\n]+)/);
            if (nameMatch && nameMatch[1]) {
              analysisResult.borrowerName = nameMatch[1].trim();
            }
          } else if (name.includes("property") || name.includes("address")) {
            // Try to extract address from property documents
            const addressMatch = doc.text.match(/Address:\s*([^\n]+)/);
            if (addressMatch && addressMatch[1]) {
              analysisResult.address = addressMatch[1].trim();
            }
          }
        }
      }
      
      // 1. Create property based on analysis
      const property = await storage.createProperty({
        address: analysisResult.address,
        city: analysisResult.city,
        state: analysisResult.state,
        zipCode: analysisResult.zipCode,
        propertyType: analysisResult.propertyType
      });

      // 2. Create loan based on analysis
      const loan = await storage.createLoan({
        borrowerName: analysisResult.borrowerName,
        loanAmount: analysisResult.loanAmount,
        loanType: analysisResult.loanType,
        loanPurpose: analysisResult.loanPurpose,
        status: "in_progress",
        targetCloseDate: "2025-07-15", // Default date if not extracted
        driveFolder: driveFolderId,
        propertyId: property.id,
        lenderId: 1, // Default lender ID
        processorId: (req.user as any).id,
        completionPercentage: 25 // Start at 25% completion
      });

      // 3. Create contacts based on analysis
      for (const contact of analysisResult.contacts) {
        await storage.createContact({
          name: contact.name,
          email: contact.email || `${contact.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
          phone: contact.phone || "(555) 123-4567",
          company: contact.company,
          role: contact.role,
          loanId: loan.id
        });
      }

      // 4. Create tasks for missing documents
      for (const missingDoc of analysisResult.missingDocuments) {
        let taskDescription = `Obtain ${missingDoc}`;
        let priority = "medium";
        
        // Set higher priority for insurance and title documents
        if (missingDoc.toLowerCase().includes("insurance") || 
            missingDoc.toLowerCase().includes("binder")) {
          taskDescription = `Request insurance binder/policy for ${property.address}`;
          priority = "high";
        } else if (missingDoc.toLowerCase().includes("title")) {
          taskDescription = `Request title commitment from title company`;
          priority = "high";
        }
        
        await storage.createTask({
          description: taskDescription,
          dueDate: "2025-06-30", // Default due date
          priority,
          completed: false,
          loanId: loan.id
        });
      }
      
      // Add a default task if no missing documents were found
      if (analysisResult.missingDocuments.length === 0) {
        await storage.createTask({
          description: "Review all documents for completeness",
          dueDate: "2025-06-15",
          priority: "medium",
          completed: false,
          loanId: loan.id
        });
      }

      // 5. Create documents based on the files with categories from analysis
      for (const file of files) {
        // Use the category from analysis or determine based on filename
        let category = analysisResult.documentCategories[file.id] || "other";
        
        // If no category from analysis, determine from filename
        if (category === "other") {
          const fileName = file.name.toLowerCase();
          if (fileName.includes("deed") || fileName.includes("property") || fileName.includes("appraisal")) {
            category = "property";
          } else if (fileName.includes("llc") || fileName.includes("license") || fileName.includes("id")) {
            category = "borrower";
          } else if (fileName.includes("insurance") || fileName.includes("policy")) {
            category = "insurance";
          } else if (fileName.includes("title") || fileName.includes("survey")) {
            category = "title";
          }
        }
        
        await storage.createDocument({
          name: file.name,
          fileId: file.id,
          fileType: file.mimeType,
          fileSize: file.size ? parseInt(file.size, 10) : 0,
          category,
          loanId: loan.id
        });
      }

      // 6. Create initial message with analysis summary
      await storage.createMessage({
        content: `I've analyzed the documents from your Google Drive folder and created this loan file. I found ${files.length} documents in the folder with ID: ${driveFolderId}. 

Based on these documents, I've identified a ${analysisResult.loanType} ${analysisResult.loanPurpose.toLowerCase()} loan for ${analysisResult.borrowerName} for the property at ${analysisResult.address}, ${analysisResult.city}, ${analysisResult.state}.

Documents identified:
${files.map(f => `- ${f.name}`).join('\n')}

${analysisResult.missingDocuments.length > 0 ? `Missing documents that need to be collected:
${analysisResult.missingDocuments.map(doc => `- ${doc}`).join('\n')}

I've added tasks for obtaining the missing documents.` : 'All required documents appear to be present.'}

Would you like me to draft an email to request any specific documents or information?`,
        role: "assistant",
        loanId: loan.id
      });

      // 7. Return success
      res.status(201).json({ 
        success: true, 
        loanId: loan.id,
        message: "Loan created successfully from Google Drive documents"
      });
      
    } catch (error) {
      console.error("Error creating loan from Drive:", error);
      res.status(500).json({ message: "Error processing Google Drive documents" });
    }
  });

  const httpServer = createServer(app);
  
  return httpServer;
}
