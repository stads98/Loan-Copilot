import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertLoanSchema, insertPropertySchema, insertContactSchema, insertTaskSchema, insertDocumentSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import { processLoanDocuments } from "./lib/openai";
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

      // Initial AI analysis message
      await storage.createMessage({
        content: "I've analyzed the documents for your Kiavi DSCR Purchase loan for 321 NW 43rd St. Here's what I found:\n\nDocuments Present:\n- Driver's License\n- Bank Statement (January)\n- Purchase Contract\n- Credit Report\n\nDocuments Missing:\n- Insurance Quote or Binder\n- Title Commitment\n- Entity Documents (if applicable)\n- DSCR Certification Form\n\nNext Steps:\n1. Contact insurance agent to request binder (high priority)\n2. Reach out to title company for preliminary title report\n3. Have borrower complete the DSCR certification form",
        role: "assistant",
        loanId: loan.id
      });

      res.status(201).json({ success: true, loanId: loan.id });
    } catch (error) {
      res.status(500).json({ message: "Error creating demo loan" });
    }
  });

  const httpServer = createServer(app);
  
  return httpServer;
}
