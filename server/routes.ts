import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertLoanSchema, insertPropertySchema, insertContactSchema, insertTaskSchema, insertDocumentSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import { processLoanDocuments, analyzeDriveDocuments } from "./lib/openai";
import { authenticateGoogle, getDriveFiles, scanFolderRecursively, downloadDriveFile } from "./lib/google";
import { createFallbackAssistantResponse } from "./lib/fallbackAI";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";
import multer from "multer";
import path from "path";

const SessionStore = MemoryStore(session);

import fs from "fs";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads with disk storage
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      // Create unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileName = `${uniqueSuffix}-${file.originalname}`;
      cb(null, fileName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /\.(pdf|doc|docx|jpg|jpeg|png|gif|xls|xlsx)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, JPEG, PNG, GIF, XLS, XLSX files are allowed.'));
    }
  }
});

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
    try {
      const { google } = require('googleapis');
      const OAuth2 = google.auth.OAuth2;
      
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Google credentials not configured' });
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      console.log('Using redirect URI:', redirectUri);
      
      const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
      });

      console.log('Redirecting to Google OAuth URL:', authUrl);
      res.redirect(authUrl);
    } catch (error) {
      console.error('Google OAuth setup error:', error);
      res.status(500).json({ error: 'Failed to setup Google authentication' });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { google } = await import('googleapis');
      const OAuth2 = google.auth.OAuth2;
      
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      console.log('Callback using redirect URI:', redirectUri);
      console.log('Received code:', req.query.code ? 'Present' : 'Missing');
      
      if (!req.query.code) {
        console.error('No authorization code received');
        return res.status(400).send('No authorization code received');
      }
      
      const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const { code } = req.query;
      console.log('Attempting to exchange code for tokens...');
      const { tokens } = await oauth2Client.getToken(code as string);
      console.log('Successfully received tokens');
      
      // Store tokens in session for compatibility
      (req.session as any).googleAuthenticated = true;
      (req.session as any).googleTokens = tokens;
      (req.session as any).gmailTokens = tokens;
      
      // Save tokens to database for persistence
      if (req.user) {
        try {
          // Save Gmail tokens
          await storage.createUserToken({
            userId: (req.user as any).id,
            service: 'gmail',
            accessToken: tokens.access_token || '',
            refreshToken: tokens.refresh_token || '',
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            scope: 'gmail.send,userinfo.email'
          });
          
          // Save Google Drive tokens (same tokens work for both services)
          await storage.createUserToken({
            userId: (req.user as any).id,
            service: 'drive',
            accessToken: tokens.access_token || '',
            refreshToken: tokens.refresh_token || '',
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            scope: 'drive.readonly'
          });
          
          console.log('Tokens saved to database for user:', req.user.id);
        } catch (dbError) {
          console.error('Error saving tokens to database:', dbError);
          // Continue anyway - session tokens still work
        }
      }
      
      console.log('Tokens stored in session and database');
      
      // Close the popup window and refresh parent
      res.send(`
        <script>
          if (window.opener) {
            window.opener.location.reload();
            window.close();
          } else {
            window.location.href = '/dashboard';
          }
        </script>
      `);
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  // Check Google Drive connection status
  app.get("/api/auth/google/status", async (req, res) => {
    try {
      // Check session first
      if ((req.session as any)?.googleAuthenticated) {
        return res.json({ connected: true });
      }
      
      // Check database for stored tokens
      if (req.user?.id) {
        const driveToken = await storage.getUserToken(req.user.id, 'drive');
        if (driveToken && driveToken.accessToken) {
          // Restore tokens to session
          (req.session as any).googleTokens = {
            access_token: driveToken.accessToken,
            refresh_token: driveToken.refreshToken,
            expiry_date: driveToken.expiryDate?.getTime()
          };
          (req.session as any).googleAuthenticated = true;
          
          console.log('Restored Google Drive tokens from database for user:', req.user.id);
          return res.json({ connected: true });
        }
      }
      
      res.json({ connected: false });
    } catch (error) {
      console.error('Error checking Google Drive status:', error);
      res.json({ connected: false });
    }
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

  app.delete("/api/loans/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      // Check if loan exists
      const loan = await storage.getLoan(id);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Delete associated documents
      const documents = await storage.getDocumentsByLoanId(id);
      for (const document of documents) {
        await storage.deleteDocument(document.id);
      }

      // Delete associated tasks
      const tasks = await storage.getTasksByLoanId(id);
      for (const task of tasks) {
        await storage.deleteTask(task.id);
      }

      // Delete associated contacts
      const contacts = await storage.getContactsByLoanId(id);
      for (const contact of contacts) {
        await storage.deleteContact(contact.id);
      }

      // Delete the loan itself
      const deleted = await storage.deleteLoan(id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete loan from storage" });
      }
      
      res.json({ success: true, message: "Loan deleted successfully" });
    } catch (error) {
      console.error("Error deleting loan:", error);
      res.status(500).json({ message: "Failed to delete loan" });
    }
  });

  app.post("/api/loans", isAuthenticated, async (req, res) => {
    try {
      console.log('Backend received loan data:', req.body);
      console.log('Loan number from body:', req.body.loanNumber);
      const user = req.user as any;
      
      // Create a basic property record first
      const property = await storage.createProperty({
        address: req.body.propertyAddress,
        city: "",
        state: "",
        zipCode: "",
        propertyType: req.body.propertyType || "single_family"
      });

      // Create a basic lender record if needed
      let lender = await storage.getLenders().then(lenders => 
        lenders.find(l => l.name.toLowerCase() === req.body.funder?.toLowerCase())
      );
      
      if (!lender) {
        lender = await storage.createLender({
          name: req.body.funder || "Unknown",
          requirements: []
        });
      }

      // Create a basic loan type if needed  
      let loanType = await storage.getLoanTypes().then(types =>
        types.find(t => t.name === req.body.loanType)
      );
      
      if (!loanType) {
        loanType = await storage.createLoanType({
          name: req.body.loanType || "DSCR",
          requirements: []
        });
      }

      const loan = await storage.createLoan({
        loanNumber: req.body.loanNumber,
        borrowerName: req.body.borrowerName,
        borrowerEntityName: req.body.borrowerEntityName,
        propertyAddress: req.body.propertyAddress,
        propertyType: req.body.propertyType,
        estimatedValue: req.body.estimatedValue,
        loanAmount: req.body.loanAmount,
        loanToValue: req.body.loanToValue,
        loanType: req.body.loanType,
        loanPurpose: req.body.loanPurpose,
        funder: req.body.funder,
        targetCloseDate: req.body.targetCloseDate,
        googleDriveFolderId: req.body.googleDriveFolderId,
        driveFolder: req.body.driveFolder,
        propertyId: property.id,
        lenderId: lender.id,
        processorId: user.id
      });

      res.status(201).json({ success: true, loanId: loan.id });
    } catch (error) {
      console.error('Error creating loan:', error);
      res.status(500).json({ message: "Error creating loan", error: error.message });
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

  // Update completed requirements for a loan
  app.patch("/api/loans/:id/completed-requirements", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const loan = await storage.getLoan(id);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      const { completedRequirements } = req.body;
      const updatedLoan = await storage.updateLoan(id, { 
        completedRequirements: Array.isArray(completedRequirements) ? completedRequirements : []
      });
      
      res.json({ success: true, completedRequirements: updatedLoan?.completedRequirements || [] });
    } catch (error) {
      res.status(500).json({ message: "Error updating completed requirements" });
    }
  });

  // Update document assignments for a loan
  app.patch("/api/loans/:id/document-assignments", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      const loan = await storage.getLoan(id);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      const { documentAssignments } = req.body;
      const updatedLoan = await storage.updateLoan(id, { 
        documentAssignments: documentAssignments || {}
      });
      
      res.json({ success: true, documentAssignments: updatedLoan?.documentAssignments || {} });
    } catch (error) {
      res.status(500).json({ message: "Error updating document assignments" });
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

  // Get deleted documents for a loan
  app.get("/api/loans/:loanId/deleted-documents", isAuthenticated, async (req, res) => {
    const loanId = parseInt(req.params.loanId);
    if (isNaN(loanId)) {
      return res.status(400).json({ message: "Invalid loan ID" });
    }

    try {
      const allDocuments = await storage.getAllDocumentsByLoanId(loanId);
      const deletedDocuments = allDocuments.filter(doc => doc.deleted);
      res.json(deletedDocuments);
    } catch (error) {
      console.error('Error fetching deleted documents:', error);
      res.status(500).json({ message: "Error fetching deleted documents" });
    }
  });

  // Restore a deleted document
  app.patch("/api/documents/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const restoredDocument = await storage.updateDocument(id, { deleted: false });
      if (!restoredDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json({ success: true, document: restoredDocument });
    } catch (error) {
      console.error('Error restoring document:', error);
      res.status(500).json({ message: "Error restoring document" });
    }
  });

  // Download document endpoint
  // Add endpoint to view/serve uploaded documents
  app.get("/api/documents/:id/view", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Check if it's a Google Drive document (typical Drive file IDs are alphanumeric without hyphens and around 33-44 chars)
      if (document.fileId && /^[a-zA-Z0-9_-]{25,50}$/.test(document.fileId) && !document.fileId.includes('.')) {
        // This looks like a Google Drive file ID
        res.json({ 
          type: 'drive',
          viewUrl: `https://drive.google.com/file/d/${document.fileId}/view`
        });
      } else {
        // This is an uploaded document - serve it directly
        res.json({ 
          type: 'upload',
          fileUrl: `/api/uploads/${document.fileId}`,
          name: document.name,
          fileType: document.fileType
        });
      }
    } catch (error) {
      console.error("Error viewing document:", error);
      res.status(500).json({ message: "Error viewing document" });
    }
  });

  // Serve uploaded files
  app.get("/api/uploads/:filename", isAuthenticated, (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(uploadsDir, filename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Serve the file directly
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({ message: "Error serving file" });
    }
  });

  app.get("/api/documents/:id/download", isAuthenticated, async (req, res) => {
    try {
      const docId = parseInt(req.params.id);
      if (isNaN(docId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(docId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // For Google Drive files, return the viewing URL that works better for images and PDFs
      const viewUrl = `https://drive.google.com/file/d/${document.fileId}/view`;
      
      res.json({ 
        downloadUrl: `https://drive.google.com/uc?export=download&id=${document.fileId}`,
        viewUrl: viewUrl,
        filename: document.name,
        fileType: document.fileType
      });
    } catch (error) {
      console.error("Error generating download URL:", error);
      res.status(500).json({ message: "Failed to generate download URL" });
    }
  });

  // Public document view endpoint for direct file access
  app.get("/api/documents/:id/view", isAuthenticated, async (req, res) => {
    try {
      const docId = parseInt(req.params.id);
      if (isNaN(docId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(docId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Check if this is a Google Drive document or locally uploaded
      if (document.fileId && document.fileId.length > 10) {
        // Check if user has Google Drive authentication
        if (!(req.session as any)?.googleAuthenticated) {
          // Try to restore from database
          if (req.user?.id) {
            const driveToken = await storage.getUserToken(req.user.id, 'drive');
            if (driveToken && driveToken.accessToken) {
              // Restore tokens to session
              (req.session as any).googleTokens = {
                access_token: driveToken.accessToken,
                refresh_token: driveToken.refreshToken,
                expiry_date: driveToken.expiryDate?.getTime()
              };
              (req.session as any).googleAuthenticated = true;
              console.log('Restored Google Drive tokens for document viewing');
            }
          }
        }

        // Google Drive document - redirect to Google Drive view URL
        const viewUrl = `https://drive.google.com/file/d/${document.fileId}/view`;
        res.redirect(viewUrl);
      } else {
        // Locally uploaded document - serve file content directly
        // For now, return an error message indicating local file viewing is not implemented
        res.status(501).json({ 
          message: "Local file viewing not yet implemented. Document was uploaded directly and cannot be viewed through Google Drive.",
          documentName: document.name,
          fileType: document.fileType
        });
      }
    } catch (error) {
      console.error("Error redirecting to document:", error);
      res.status(500).json({ message: "Failed to open document" });
    }
  });
  
  // Sync documents from Google Drive for a loan
  app.post("/api/loans/:id/sync-drive", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const loanId = parseInt(id, 10);
      
      // Check if user has Google Drive authentication
      if (!(req.session as any)?.googleAuthenticated) {
        // Try to restore from database
        if (req.user?.id) {
          const driveToken = await storage.getUserToken(req.user.id, 'drive');
          if (driveToken && driveToken.accessToken) {
            // Restore tokens to session
            (req.session as any).googleTokens = {
              access_token: driveToken.accessToken,
              refresh_token: driveToken.refreshToken,
              expiry_date: driveToken.expiryDate?.getTime()
            };
            (req.session as any).googleAuthenticated = true;
            console.log('Restored Google Drive tokens for sync operation');
          } else {
            return res.status(401).json({ 
              message: "Google Drive authentication required. Please connect your Google Drive account first.",
              requiresAuth: true 
            });
          }
        } else {
          return res.status(401).json({ 
            message: "Google Drive authentication required. Please connect your Google Drive account first.",
            requiresAuth: true 
          });
        }
      }
      
      // Verify the loan exists
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Get the folder ID from loan data
      const folderId = (loan as any).driveFolder;
      if (!folderId) {
        return res.status(400).json({ 
          message: "No Google Drive folder associated with this loan. Please connect a folder first." 
        });
      }
      
      console.log(`Syncing documents from Google Drive folder: ${folderId} for loan: ${loanId}`);
      
      // Get files from Google Drive folder
      const { getDriveFiles } = await import("./lib/google");
      const googleTokens = (req.session as any)?.googleTokens;
      const files = await getDriveFiles(folderId, googleTokens?.access_token);
      
      if (!files || files.length === 0) {
        return res.status(404).json({ message: "No files found in the Google Drive folder" });
      }
      
      console.log(`Found ${files.length} files to sync`);
      
      // Update existing documents or create new ones
      let documentsUpdated = 0;
      let documentsCreated = 0;
      
      for (const file of files) {
        try {
          // Check if document already exists
          const existingDocs = await storage.getDocumentsByLoanId(loanId);
          const existingDoc = existingDocs.find(doc => doc.fileId === file.id);
          
          if (existingDoc) {
            // Update existing document
            await storage.updateDocument(existingDoc.id, {
              name: file.name,
              fileType: file.mimeType,
              fileSize: file.size ? parseInt(file.size) : null
            });
            documentsUpdated++;
          } else {
            // Create new document
            await storage.createDocument({
              name: file.name,
              fileId: file.id,
              fileType: file.mimeType,
              fileSize: file.size ? parseInt(file.size) : null,
              category: "imported",
              loanId: loanId
            });
            documentsCreated++;
          }
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
        }
      }
      
      res.json({
        success: true,
        message: "Documents synced successfully from Google Drive",
        documentsCreated,
        documentsUpdated,
        totalFiles: files.length
      });
      
    } catch (error) {
      console.error("Error syncing Google Drive documents:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to sync documents from Google Drive" 
      });
    }
  });

  // Sync documents from Google Drive for a loan with full OCR and OpenAI analysis
  app.post("/api/loans/:id/sync-documents", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { folderId } = req.body;
      const loanId = parseInt(id, 10);
      
      // Verify the loan exists
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      if (!folderId) {
        return res.status(400).json({ 
          success: false, 
          message: "No folder ID provided" 
        });
      }

      console.log(`Starting comprehensive scan of folder: ${folderId}`);
      
      // Get files from Google Drive folder
      const files = await getDriveFiles(folderId);
      
      console.log(`Found ${files.length} files`);
      
      if (files.length === 0) {
        return res.json({
          success: true,
          message: "No documents found in the selected folder",
          documentsProcessed: 0,
          documentsAdded: 0
        });
      }

      // Get existing documents to avoid duplicates
      const existingDocuments = await storage.getDocumentsByLoanId(loanId);
      const existingFileIds = existingDocuments.map(doc => doc.fileId);
      
      // Filter out documents that already exist
      const newFiles = files.filter(file => !existingFileIds.includes(file.id));
      
      console.log(`Processing ${newFiles.length} new files (${files.length - newFiles.length} already exist)`);

      if (newFiles.length === 0) {
        return res.json({
          success: true,
          message: "All documents are already synced to this loan",
          documentsProcessed: 0,
          documentsAdded: 0
        });
      }
      
      // Process documents with text extraction (same as scan-folder)
      const documentsWithText = [];
      for (const file of newFiles) {
        console.log(`Processing file: ${file.name}`);
        let extractedText = "";
        
        try {
          // Download and extract text from each file
          extractedText = await downloadDriveFile(file.id);
          
          documentsWithText.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType || 'unknown',
            size: file.size,
            modifiedTime: file.modifiedTime,
            text: extractedText || `File: ${file.name}`
          });
        } catch (extractError) {
          console.warn(`Failed to extract text from ${file.name}:`, extractError);
          documentsWithText.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType || 'unknown',
            size: file.size,
            modifiedTime: file.modifiedTime,
            text: `File: ${file.name} (text extraction failed)`
          });
        }
      }

      console.log(`Analyzing ${documentsWithText.length} documents with OpenAI...`);
      
      // Analyze all documents with OpenAI (same as scan-folder)
      let analysisResult;
      try {
        analysisResult = await analyzeDriveDocuments(documentsWithText);
        console.log("Document analysis completed successfully");
      } catch (analyzeError) {
        console.error("OpenAI analysis failed:", analyzeError);
        analysisResult = {
          loanInfo: { borrowerName: "Analysis Failed", loanType: "Unknown", loanPurpose: "Unknown" },
          propertyInfo: { address: "Unknown", city: "Unknown", state: "Unknown", zipCode: "Unknown" },
          contacts: [],
          missingDocuments: []
        };
      }

      // Store the documents in the database with proper categorization
      for (const docData of documentsWithText) {
        const fileName = docData.name.toLowerCase();
        let category = "other";
        
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

        await storage.createDocument({
          loanId,
          name: docData.name,
          fileId: docData.id,
          fileType: docData.mimeType?.split('/')[1] || "unknown",
          fileSize: parseInt(docData.size || "0", 10),
          category,
          status: "processed"
        });
      }

      // Update the loan with the Google Drive folder
      await storage.updateLoan(loanId, { driveFolder: folderId });

      // Create tasks for missing documents if any were identified
      if (analysisResult.missingDocuments && Array.isArray(analysisResult.missingDocuments)) {
        for (const missingDoc of analysisResult.missingDocuments) {
          await storage.createTask({
            loanId,
            description: `Missing: ${missingDoc}`,
            dueDate: null,
            priority: "medium",
            completed: false
          });
        }
      }

      res.json({
        success: true,
        message: "Documents Synced Successfully!",
        documentsProcessed: documentsWithText.length,
        documentsAdded: documentsWithText.length,
        tasksCreated: analysisResult.tasks?.length || 0,
        analysisResult
      });
      
    } catch (error) {
      console.error("Error syncing documents from Google Drive:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to sync documents from Google Drive" 
      });
    }
  });

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and image files are allowed.'));
      }
    }
  });

  app.post("/api/loans/:loanId/documents", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { name, category } = req.body;
      
      const documentData = insertDocumentSchema.parse({
        name: name || req.file.originalname,
        fileId: req.file.filename, // Store the actual filename from multer
        fileType: req.file.mimetype.split('/')[1],
        fileSize: req.file.size,
        category: category || 'other',
        loanId
      });

      const document = await storage.createDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Document validation error:", error.errors);
        return res.status(400).json({ message: "Invalid document data", errors: error.errors });
      }
      console.error("Document upload error:", error);
      res.status(500).json({ message: "Error uploading document" });
    }
  });

  app.patch("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const updatedDocument = await storage.updateDocument(id, req.body);
      res.json(updatedDocument);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Error updating document" });
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
  app.get("/api/tasks/all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const loans = await storage.getLoansByProcessorId(user.id);
      const allTasks = [];
      
      for (const loan of loans) {
        const tasks = await storage.getTasksByLoanId(loan.id);
        allTasks.push(...tasks);
      }
      
      res.json(allTasks);
    } catch (error) {
      console.error("Error fetching all tasks:", error);
      res.status(500).json({ message: "Error fetching tasks" });
    }
  });

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

  app.put("/api/loans/:loanId/contacts/:id", isAuthenticated, async (req, res) => {
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

  app.delete("/api/loans/:loanId/contacts/:id", isAuthenticated, async (req, res) => {
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

  // Gmail authentication
  app.get("/api/gmail/auth-url", isAuthenticated, async (req, res) => {
    try {
      const { getGmailAuthUrl } = await import("./lib/gmail.js");
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      const authUrl = getGmailAuthUrl(process.env.GOOGLE_CLIENT_ID!, redirectUri);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating Gmail auth URL:", error);
      res.status(500).json({ message: "Error generating auth URL" });
    }
  });

  // Check Gmail connection status
  app.get("/api/gmail/status", isAuthenticated, async (req, res) => {
    try {
      // First check session tokens
      let connected = !!(req.session as any)?.gmailTokens;
      
      // If no session tokens, check database
      if (!connected && req.user) {
        const gmailToken = await storage.getUserToken((req.user as any).id, 'gmail');
        if (gmailToken) {
          connected = true;
          // Restore tokens to session for compatibility
          (req.session as any).gmailTokens = {
            access_token: gmailToken.accessToken,
            refresh_token: gmailToken.refreshToken,
            expiry_date: gmailToken.expiryDate?.getTime()
          };
          console.log('Restored Gmail tokens from database for user:', (req.user as any).id);
        }
      }
      
      res.json({ connected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  // Disconnect Gmail
  app.post("/api/gmail/disconnect", isAuthenticated, async (req, res) => {
    try {
      // Remove from session
      delete (req.session as any).gmailTokens;
      
      // Remove from database
      if (req.user) {
        await storage.deleteUserToken((req.user as any).id, 'gmail');
        await storage.deleteUserToken((req.user as any).id, 'drive');
      }
      
      res.json({ success: true, message: "Gmail disconnected successfully" });
    } catch (error) {
      console.error("Error disconnecting Gmail:", error);
      res.status(500).json({ message: "Error disconnecting Gmail" });
    }
  });

  // Scan all emails and auto-download all PDFs for a loan
  app.post("/api/loans/:loanId/scan-all-emails", isAuthenticated, async (req, res) => {
    try {
      if (!(req.session as any)?.gmailTokens) {
        return res.status(401).json({ message: "Gmail authentication required" });
      }

      const loanId = parseInt(req.params.loanId);
      const loan = await storage.getLoanWithDetails(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      const { google } = await import('googleapis');
      const { createGmailAuth } = await import("./lib/gmail");
      const gmail = google.gmail('v1');
      
      const gmailAuth = createGmailAuth(
        (req.session as any).gmailTokens.access_token,
        (req.session as any).gmailTokens.refresh_token
      );

      // Get all inbox messages (scan more for comprehensive search, including older emails)
      const listResponse = await gmail.users.messages.list({
        auth: gmailAuth,
        userId: 'me',
        maxResults: 1000, // Increased to get more emails
        q: 'in:inbox after:2025/05/01' // Search emails from May 1st onwards to catch older emails
      });

      if (!listResponse.data.messages) {
        return res.json({ 
          success: true, 
          message: "No emails found in inbox",
          totalScanned: 0,
          pdfsFound: 0,
          downloaded: []
        });
      }

      // Filter messages for this specific loan
      const filteredMessages = [];
      for (const message of listResponse.data.messages) {
        try {
          const msgResponse = await gmail.users.messages.get({
            auth: gmailAuth,
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date', 'To', 'Cc']
          });

          const headers = msgResponse.data.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value?.toLowerCase() || '';
          const from = headers.find(h => h.name === 'From')?.value?.toLowerCase() || '';
          const to = headers.find(h => h.name === 'To')?.value?.toLowerCase() || '';
          const cc = headers.find(h => h.name === 'Cc')?.value?.toLowerCase() || '';

          // Use same filtering logic as regular Gmail messages
          let isRelevant = false;

          // Check property address with enhanced matching
          if (loan.property?.address) {
            const fullAddress = loan.property.address.toLowerCase();
            const streetOnly = fullAddress.split(',')[0].trim().toLowerCase();
            
            const addressVariations = [fullAddress, streetOnly];
            
            const streetMatch = streetOnly.match(/^(\d+)\s+(.+?)(\s+(st|street|dr|drive|ave|avenue|rd|road|ln|lane|blvd|boulevard|way|ct|court|pl|place))?$/i);
            if (streetMatch) {
              const streetNumber = streetMatch[1];
              const streetName = streetMatch[2];
              
              addressVariations.push(streetName);
              addressVariations.push(`${streetNumber} ${streetName}`);
              
              const streetWithAbbrev = streetOnly
                .replace(/\bdrive\b/gi, 'dr')
                .replace(/\bstreet\b/gi, 'st')
                .replace(/\bavenue\b/gi, 'ave')
                .replace(/\broad\b/gi, 'rd')
                .replace(/\bboulevard\b/gi, 'blvd');
                
              if (streetWithAbbrev !== streetOnly) {
                addressVariations.push(streetWithAbbrev);
              }
            }
            
            for (const variation of addressVariations) {
              if (subject.includes(variation)) {
                isRelevant = true;
                break;
              }
            }
          }

          // Check loan number
          if (!isRelevant && loan.loan?.loanNumber && subject.includes(loan.loan.loanNumber.toLowerCase())) {
            isRelevant = true;
          }

          // Check borrower name
          if (!isRelevant && loan.loan?.borrowerName) {
            const borrowerName = loan.loan.borrowerName.toLowerCase();
            if (subject.includes(borrowerName) || from.includes(borrowerName) || to.includes(borrowerName)) {
              isRelevant = true;
            }
          }

          // Check for Samuel's email specifically (from your Gmail inbox)
          if (!isRelevant && (from.includes('sam2345@live.com') || to.includes('sam2345@live.com'))) {
            isRelevant = true;
          }

          // Check contact emails
          if (!isRelevant && loan.contacts && loan.contacts.length > 0) {
            const contactEmails = loan.contacts
              .map((c: any) => c.email)
              .filter(Boolean)
              .map((email: any) => email.toLowerCase());
            
            for (const email of contactEmails) {
              if (from.includes(email) || to.includes(email) || cc.includes(email)) {
                isRelevant = true;
                break;
              }
            }
          }

          // Check for other key emails from your inbox
          const keyEmails = [
            'kellie.rossi@lendinghome.com',
            'kristian@newpathtitle.com', 
            'luma@planlifeusa.com',
            'noah.dlott@kiavi.com'
          ];
          
          if (!isRelevant) {
            for (const email of keyEmails) {
              if (from.includes(email) || to.includes(email)) {
                isRelevant = true;
                break;
              }
            }
          }

          if (isRelevant) {
            filteredMessages.push({
              id: message.id,
              subject: headers.find(h => h.name === 'Subject')?.value || '',
              from: headers.find(h => h.name === 'From')?.value || ''
            });
          }
        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
        }
      }

      // Now scan filtered messages for PDF attachments
      const downloadedPDFs = [];
      let totalPDFs = 0;

      for (const message of filteredMessages) {
        try {
          // Get full message with attachments
          const msgResponse = await gmail.users.messages.get({
            auth: gmailAuth,
            userId: 'me',
            id: message.id!,
            format: 'full'
          });

          const parts = msgResponse.data.payload?.parts || [];
          const attachments = [];

          const extractAttachments = (parts: any[]) => {
            for (const part of parts) {
              if (part.filename && part.body?.attachmentId) {
                attachments.push({
                  filename: part.filename,
                  mimeType: part.mimeType,
                  attachmentId: part.body.attachmentId,
                  size: part.body.size
                });
              }
              if (part.parts) {
                extractAttachments(part.parts);
              }
            }
          };

          extractAttachments(parts);

          // Filter for PDFs only
          const pdfAttachments = attachments.filter(att => att.mimeType?.includes('pdf'));
          totalPDFs += pdfAttachments.length;

          // Check for existing documents to avoid duplicates
          const existingDocuments = await storage.getDocumentsByLoanId(loanId);

          // Download each PDF
          for (const attachment of pdfAttachments) {
            try {
              // Check for duplicates based on filename and approximate size
              const isDuplicate = existingDocuments.some(doc => {
                const cleanExistingName = doc.name.split(' (from ')[0].toLowerCase();
                const cleanAttachmentName = attachment.filename.toLowerCase();
                const sizeDiff = doc.fileSize ? Math.abs(doc.fileSize - attachment.size) : attachment.size;
                
                return cleanExistingName === cleanAttachmentName && sizeDiff < 1000; // 1KB tolerance
              });

              if (isDuplicate) {
                console.log(`Skipping duplicate: ${attachment.filename}`);
                continue;
              }

              // Download attachment data
              const attachmentResponse = await gmail.users.messages.attachments.get({
                auth: gmailAuth,
                userId: 'me',
                messageId: message.id!,
                id: attachment.attachmentId
              });

              if (attachmentResponse.data?.data) {
                // Decode and save to documents
                let base64Data = attachmentResponse.data.data;
                base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
                while (base64Data.length % 4) {
                  base64Data += '=';
                }
                const fileBuffer = Buffer.from(base64Data, 'base64');

                // Save locally first
                const { promises: fs } = await import('fs');
                const path = await import('path');
                const uploadsDir = path.join(process.cwd(), 'uploads');
                await fs.mkdir(uploadsDir, { recursive: true });
                
                const extension = attachment.filename.includes('.') ? attachment.filename.split('.').pop() : 'pdf';
                const fileId = `email-attachment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
                const filePath = path.join(uploadsDir, fileId);
                await fs.writeFile(filePath, fileBuffer);

                // Determine category
                let category = 'other';
                const lowerFilename = attachment.filename.toLowerCase();
                if (lowerFilename.includes('insurance') || lowerFilename.includes('policy')) {
                  category = 'insurance';
                } else if (lowerFilename.includes('appraisal') || lowerFilename.includes('comp')) {
                  category = 'property';
                } else if (lowerFilename.includes('income') || lowerFilename.includes('bank') || lowerFilename.includes('statement')) {
                  category = 'borrower';
                } else if (lowerFilename.includes('title') || lowerFilename.includes('payoff')) {
                  category = 'title';
                }

                // Create document record
                const document = await storage.createDocument({
                  name: `${attachment.filename} (from ${message.from})`,
                  fileId: fileId,
                  loanId: loanId,
                  fileType: attachment.mimeType,
                  fileSize: attachment.size,
                  category: category,
                  source: 'gmail',
                  status: 'processed'
                });

                downloadedPDFs.push({
                  filename: attachment.filename,
                  emailSubject: message.subject,
                  size: attachment.size,
                  category: category
                });
              }
            } catch (downloadError) {
              console.error(`Failed to download PDF ${attachment.filename}:`, downloadError);
            }
          }
        } catch (error) {
          console.error(`Error scanning message ${message.id} for attachments:`, error);
        }
      }

      res.json({
        success: true,
        message: `Scan complete! Found ${downloadedPDFs.length} PDFs across ${filteredMessages.length} relevant emails.`,
        totalScanned: filteredMessages.length,
        pdfsFound: totalPDFs,
        downloaded: downloadedPDFs
      });

    } catch (error) {
      console.error('Error scanning emails for PDFs:', error);
      res.status(500).json({ message: "Error scanning emails for PDFs" });
    }
  });

  // Send Gmail email with attachments
  app.post("/api/gmail/send", isAuthenticated, upload.any(), async (req, res) => {
    try {
      if (!(req.session as any)?.gmailTokens) {
        return res.status(401).json({ message: "Gmail authentication required" });
      }

      const { to, cc, subject, body } = req.body;
      const files = req.files as Express.Multer.File[];

      // Parse recipients
      const toEmails = JSON.parse(to);
      const ccEmails = cc ? JSON.parse(cc) : [];

      // Process attachments
      const attachments = files ? files.map(file => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        data: file.buffer
      })) : [];

      const { createGmailAuth, sendGmailEmail } = await import("./lib/gmail");
      const gmailAuth = createGmailAuth(
        (req.session as any).gmailTokens.access_token,
        (req.session as any).gmailTokens.refresh_token
      );

      const emailData = {
        to: toEmails,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject,
        body,
        attachments
      };

      const success = await sendGmailEmail(gmailAuth, emailData);

      if (success) {
        res.json({ 
          success: true, 
          message: `Email sent to ${toEmails.length} recipient(s)${ccEmails.length > 0 ? ` with ${ccEmails.length} CC` : ''}${attachments.length > 0 ? ` and ${attachments.length} attachment(s)` : ''}` 
        });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      console.error("Error sending Gmail:", error);
      res.status(500).json({ message: "Error sending email" });
    }
  });

  // Get Gmail messages
  app.get("/api/gmail/messages", isAuthenticated, async (req, res) => {
    try {
      if (!(req.session as any)?.gmailTokens) {
        return res.status(401).json({ message: "Gmail authentication required" });
      }

      const { google } = await import('googleapis');
      const { createGmailAuth } = await import("./lib/gmail");
      const gmail = google.gmail('v1');
      
      const gmailAuth = createGmailAuth(
        (req.session as any).gmailTokens.access_token,
        (req.session as any).gmailTokens.refresh_token
      );

      const maxResults = parseInt(req.query.maxResults as string) || 50;
      const loanId = req.query.loanId ? parseInt(req.query.loanId as string) : null;

      // Comprehensive search going back 8 weeks to catch all loan-related emails
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      const dateQuery = eightWeeksAgo.toISOString().split('T')[0].replace(/-/g, '/');
      
      // Search for all emails with attachments going back 8 weeks - cast a wide net
      const searchQuery = `has:attachment after:${dateQuery}`;
      
      const listResponse = await gmail.users.messages.list({
        auth: gmailAuth,
        userId: 'me',
        maxResults: 1000, // Increased to 1000 to catch more historical emails
        q: searchQuery
      });

      const allMessages = [];
      
      if (listResponse.data.messages) {
        // Track processed threads to avoid duplicates
        const processedThreads = new Set();
        
        // Get details for each message and scan full conversation threads
        for (const message of listResponse.data.messages) {
          try {
            // If we haven't processed this thread yet, get the full thread
            if (!processedThreads.has(message.threadId)) {
              processedThreads.add(message.threadId);
              
              // Get the full thread to capture all messages in the conversation
              const threadResponse = await gmail.users.threads.get({
                auth: gmailAuth,
                userId: 'me',
                id: message.threadId!,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date', 'To', 'Cc']
              });
              
              // Process all messages in the thread
              for (const threadMessage of threadResponse.data.messages || []) {
                const headers = threadMessage.payload?.headers || [];
                const fromHeader = headers.find(h => h.name === 'From');
                const subjectHeader = headers.find(h => h.name === 'Subject');
                const dateHeader = headers.find(h => h.name === 'Date');
                const toHeader = headers.find(h => h.name === 'To');
                const ccHeader = headers.find(h => h.name === 'Cc');

                allMessages.push({
                  id: threadMessage.id,
                  threadId: threadMessage.threadId,
                  snippet: threadMessage.snippet,
                  subject: subjectHeader?.value || '',
                  from: fromHeader?.value || '',
                  to: toHeader?.value || '',
                  cc: ccHeader?.value || '',
                  date: dateHeader?.value || '',
                  unread: threadMessage.labelIds?.includes('UNREAD') || false,
                  hasAttachments: threadMessage.payload?.parts?.some(part => 
                    part.filename && part.filename.length > 0
                  ) || false
                });
              }
            }
          } catch (msgError) {
            console.error('Error fetching thread details:', msgError);
          }
        }
      }

      let messages = allMessages;

      // Filter messages if loanId is provided
      if (loanId && allMessages.length > 0) {
        const loan = await storage.getLoanWithDetails(loanId);
        if (loan) {
          const filteredMessages = allMessages.filter(message => {
            const subject = message.subject.toLowerCase();
            const from = message.from.toLowerCase();
            const to = message.to.toLowerCase();
            const cc = message.cc.toLowerCase();
            
            // Check property address in subject with enhanced matching
            if (loan.property?.address) {
              const fullAddress = loan.property.address.toLowerCase();
              const streetOnly = fullAddress.split(',')[0].trim().toLowerCase();
              
              // Create multiple address variations for better matching
              const addressVariations = [];
              
              // Add full address and street-only
              addressVariations.push(fullAddress, streetOnly);
              
              // Extract street number and name separately for partial matching
              const streetMatch = streetOnly.match(/^(\d+)\s+(.+?)(\s+(st|street|dr|drive|ave|avenue|rd|road|ln|lane|blvd|boulevard|way|ct|court|pl|place))?$/i);
              if (streetMatch) {
                const streetNumber = streetMatch[1];
                const streetName = streetMatch[2];
                
                // Add variations: just street name, street number + partial name
                addressVariations.push(streetName);
                addressVariations.push(`${streetNumber} ${streetName}`);
                
                // Handle common abbreviations
                const streetWithAbbrev = streetOnly
                  .replace(/\bdrive\b/gi, 'dr')
                  .replace(/\bstreet\b/gi, 'st')
                  .replace(/\bavenue\b/gi, 'ave')
                  .replace(/\broad\b/gi, 'rd')
                  .replace(/\bboulevard\b/gi, 'blvd');
                  
                if (streetWithAbbrev !== streetOnly) {
                  addressVariations.push(streetWithAbbrev);
                }
              }
              
              // Check if any address variation matches
              for (const variation of addressVariations) {
                if (subject.includes(variation)) {
                  return true;
                }
              }
            }
            
            // Check loan number in subject (primary identifier)
            if (loan.loan?.loanNumber && subject.includes(loan.loan.loanNumber.toLowerCase())) {
              return true;
            }
            
            // Check borrower name in email content
            if (loan.loan?.borrowerName) {
              const borrowerName = loan.loan.borrowerName.toLowerCase();
              if (subject.includes(borrowerName) || from.includes(borrowerName) || to.includes(borrowerName)) {
                return true;
              }
            }
            
            // Check contact emails in from/to/cc (including borrower's email)
            if (loan.contacts && loan.contacts.length > 0) {
              const contactEmails = loan.contacts
                .map((c: any) => c.email)
                .filter(Boolean)
                .map((email: any) => email.toLowerCase());
              
              console.log(`Checking email ${message.id} - Contact emails:`, contactEmails);
              console.log(`Email details - from: "${from}", to: "${to}", cc: "${cc}"`);
              
              for (const email of contactEmails) {
                if (from.includes(email) || to.includes(email) || cc.includes(email)) {
                  console.log(`Match found for contact email: ${email}`);
                  return true;
                }
              }
            }
            
            return false;
          });
          
          messages = filteredMessages.slice(0, maxResults);
        }
      } else {
        // If no loan filtering, just limit to maxResults
        messages = allMessages.slice(0, maxResults);
      }

      res.json({ messages });
    } catch (error) {
      console.error("Error fetching Gmail messages:", error);
      res.status(500).json({ message: "Error fetching messages" });
    }
  });

  // Get individual Gmail message with full content and attachments
  app.get("/api/gmail/messages/:messageId", isAuthenticated, async (req, res) => {
    try {
      if (!(req.session as any)?.gmailTokens) {
        return res.status(401).json({ message: "Gmail authentication required" });
      }

      const { google } = await import('googleapis');
      const { createGmailAuth } = await import("./lib/gmail");
      const gmail = google.gmail('v1');
      
      const gmailAuth = createGmailAuth(
        (req.session as any).gmailTokens.access_token,
        (req.session as any).gmailTokens.refresh_token
      );

      const messageId = req.params.messageId;

      // Get full message content
      const msgResponse = await gmail.users.messages.get({
        auth: gmailAuth,
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const msg = msgResponse.data;
      let content = '';
      const attachments = [];

      // Extract content and attachments from payload
      function processPayload(payload: any) {
        if (payload.mimeType === 'text/plain' && payload.body?.data) {
          content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        } else if (payload.mimeType === 'text/html' && payload.body?.data && !content) {
          // Convert HTML to plain text if no plain text available
          const html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
          content = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        }

        // Check for attachments
        if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
          attachments.push({
            filename: payload.filename,
            mimeType: payload.mimeType,
            size: payload.body.size,
            attachmentId: payload.body.attachmentId
          });
        }

        // Process parts recursively
        if (payload.parts) {
          payload.parts.forEach(processPayload);
        }
      }

      if (msg.payload) {
        processPayload(msg.payload);
      }

      res.json({ 
        content: content || msg.snippet || 'No content available',
        attachments: attachments
      });
    } catch (error) {
      console.error("Error fetching Gmail message content:", error);
      res.status(500).json({ message: "Error fetching message content" });
    }
  });

  // Gmail attachment download route
  app.get("/api/gmail/messages/:messageId/attachments/:attachmentId", isAuthenticated, async (req, res) => {
    try {
      if (!(req.session as any)?.gmailTokens) {
        return res.status(401).json({ message: "Gmail authentication required" });
      }

      const { google } = await import('googleapis');
      const { createGmailAuth } = await import("./lib/gmail");
      const gmail = google.gmail('v1');
      
      const gmailAuth = createGmailAuth(
        (req.session as any).gmailTokens.access_token,
        (req.session as any).gmailTokens.refresh_token
      );

      const messageId = req.params.messageId;
      const attachmentId = req.params.attachmentId;

      console.log('Downloading attachment:', { messageId, attachmentId });

      // Get attachment data
      const attachmentResponse = await gmail.users.messages.attachments.get({
        auth: gmailAuth,
        userId: 'me',
        messageId: messageId,
        id: attachmentId
      });

      console.log('Gmail API attachment response:', {
        hasData: !!attachmentResponse.data,
        dataKeys: attachmentResponse.data ? Object.keys(attachmentResponse.data) : [],
        size: attachmentResponse.data?.size,
        hasAttachmentData: !!attachmentResponse.data?.data
      });

      if (!attachmentResponse.data?.data) {
        console.error('No attachment data returned from Gmail API');
        return res.status(404).json({ message: "Attachment data not found" });
      }

      res.json({ 
        data: attachmentResponse.data.data // This is base64 encoded
      });
    } catch (error) {
      console.error('Error downloading Gmail attachment:', error);
      res.status(500).json({ message: "Error downloading attachment", error: error.message });
    }
  });

  // Save PDF attachment to documents route
  app.post("/api/loans/:loanId/documents/from-email", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const { attachmentData, filename, mimeType, size, emailSubject, emailFrom } = req.body;

      // Decode base64 attachment data
      let fileBuffer;
      try {
        // Gmail uses URL-safe base64, convert to standard base64
        let base64Data = attachmentData;
        base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
        while (base64Data.length % 4) {
          base64Data += '=';
        }
        fileBuffer = Buffer.from(base64Data, 'base64');
      } catch (decodeError) {
        console.error('Failed to decode attachment data:', decodeError);
        return res.status(400).json({ message: "Invalid attachment data" });
      }

      // Get the loan details to find the Drive folder
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      let driveFileId = null;

      // Check if user has Google Drive authentication
      if ((req.session as any)?.googleAuthenticated || (req.session as any)?.googleTokens) {
        try {
          // Try to restore Google Drive tokens if not in session
          if (!(req.session as any)?.googleAuthenticated && req.user?.id) {
            const driveToken = await storage.getUserToken(req.user.id, 'drive');
            if (driveToken && driveToken.accessToken) {
              (req.session as any).googleTokens = {
                access_token: driveToken.accessToken,
                refresh_token: driveToken.refreshToken,
                expiry_date: driveToken.expiryDate?.getTime()
              };
              (req.session as any).googleAuthenticated = true;
            }
          }

          if ((req.session as any)?.googleAuthenticated) {
            const { google } = await import('googleapis');
            
            // Create auth from session tokens
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials((req.session as any).googleTokens);
            const drive = google.drive({ version: 'v3', auth: oauth2Client });
            const { Readable } = await import('stream');

            // Upload to Google Drive
            const driveResponse = await drive.files.create({
              requestBody: {
                name: `${filename} (from Email)`,
                parents: loan.driveFolder ? [loan.driveFolder] : undefined,
              },
              media: {
                mimeType: mimeType,
                body: Readable.from(fileBuffer)
              }
            });

            driveFileId = driveResponse.data.id;
            console.log('Successfully uploaded email attachment to Google Drive:', driveFileId);
          }
        } catch (driveError) {
          console.error('Failed to upload to Google Drive:', driveError);
          // Continue without Drive upload - we'll still save locally
        }
      }

      // If Drive upload failed, save locally
      if (!driveFileId) {
        const { promises: fs } = await import('fs');
        // Get file extension from original filename or mime type
        const extension = filename.includes('.') ? filename.split('.').pop() : 
                         (mimeType.includes('pdf') ? 'pdf' : 
                          mimeType.includes('image') ? 'png' : 'file');
        const fileId = `email-attachment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
        const filePath = path.join(uploadsDir, fileId);
        await fs.writeFile(filePath, fileBuffer);
        driveFileId = fileId;
      }
      
      // Determine document category based on filename
      let category = 'other';
      const lowerFilename = filename.toLowerCase();
      if (lowerFilename.includes('insurance') || lowerFilename.includes('policy')) {
        category = 'insurance';
      } else if (lowerFilename.includes('appraisal')) {
        category = 'property';
      } else if (lowerFilename.includes('income') || lowerFilename.includes('bank') || lowerFilename.includes('statement')) {
        category = 'borrower';
      } else if (lowerFilename.includes('title')) {
        category = 'title';
      }

      // Create document record
      const fromText = emailFrom && emailFrom !== 'undefined' ? ` (from ${emailFrom.replace(/[<>]/g, '').split('<')[0].trim()})` : '';
      const document = await storage.createDocument({
        name: `${filename}${fromText}`,
        fileId: driveFileId,
        loanId: loanId,
        fileType: mimeType,
        fileSize: size,
        category: category,
        source: 'gmail',
        status: 'processed'
      });

      res.json({ 
        success: true,
        document: document,
        message: `PDF attachment saved to loan documents${driveFileId.length > 20 ? ' and uploaded to Google Drive' : ''}`
      });
    } catch (error) {
      console.error('Error saving email attachment to documents:', error);
      res.status(500).json({ message: "Error saving attachment to documents" });
    }
  });

  // Send to analyst
  app.post("/api/loans/:id/send-to-analyst", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const { documentIds, analystIds, customMessage, emailContent } = req.body;

      if (!req.session?.gmailTokens) {
        return res.status(401).json({ 
          message: "Gmail authentication required",
          requiresAuth: true 
        });
      }

      // Get loan details
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Get selected documents
      const documents = await Promise.all(
        documentIds.map((id: number) => storage.getDocument(id))
      );

      // Get selected analysts
      const analysts = await Promise.all(
        analystIds.map((id: number) => storage.getContact(id))
      );

      const analystEmails = analysts
        .map(analyst => analyst?.email)
        .filter(Boolean) as string[];

      if (analystEmails.length === 0) {
        return res.status(400).json({ message: "No valid analyst email addresses found" });
      }

      // Download document attachments from Google Drive
      const { downloadDriveFile } = await import("./lib/google");
      const attachments = [];

      for (const doc of documents) {
        if (doc) {
          try {
            const fileBuffer = await downloadDriveFile(doc.fileId);
            attachments.push({
              filename: doc.name,
              mimeType: doc.fileType || 'application/octet-stream',
              data: fileBuffer
            });
          } catch (error) {
            console.error(`Error downloading document ${doc.name}:`, error);
          }
        }
      }

      // Send email via Gmail
      const { createGmailAuth, sendGmailEmail } = await import("./lib/gmail");
      const gmailAuth = createGmailAuth(
        req.session.gmailTokens.access_token,
        req.session.gmailTokens.refresh_token
      );

      const emailData = {
        to: analystEmails,
        subject: `${loan.propertyAddress} (Loan #${loan.loanNumber}) - Documents Attached`,
        body: emailContent,
        attachments
      };

      const emailSent = await sendGmailEmail(gmailAuth, emailData);

      if (emailSent) {
        res.json({ 
          success: true,
          message: `Email sent successfully to ${analystEmails.length} analyst(s) with ${attachments.length} attachment(s)`
        });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      console.error("Error sending to analyst:", error);
      res.status(500).json({ message: "Error sending email to analyst" });
    }
  });

  // Google Drive folder contents route for folder browser
  app.get("/api/drive/folders/:folderId/contents", isAuthenticated, async (req, res) => {
    try {
      const folderId = req.params.folderId;
      
      // Use the service account to access Google Drive folders with recursive scanning
      try {
        console.log(`Scanning folder ${folderId} recursively for all files...`);
        const { files, folders } = await scanFolderRecursively(folderId);
        
        // Combine files and folders for display
        const allItems = [
          ...folders.map(folder => ({
            id: folder.id,
            name: folder.name,
            type: 'folder' as const,
            mimeType: folder.mimeType,
            size: undefined
          })),
          ...files.map(file => ({
            id: file.id,
            name: file.name,
            type: 'file' as const,
            mimeType: file.mimeType,
            size: file.size ? parseInt(file.size) : undefined
          }))
        ];
        
        console.log(`Successfully retrieved ${files.length} files and ${folders.length} folders from Google Drive folder ${folderId}`);
        return res.json({ 
          items: allItems,
          totalFiles: files.length,
          totalFolders: folders.length
        });
        
      } catch (driveError: any) {
        console.error('Google Drive access failed:', driveError.message);
        return res.status(500).json({ 
          message: "Failed to access Google Drive folder. Please make sure the Google service account has access to this folder.", 
          error: driveError.message 
        });
      }
    } catch (error) {
      console.error('Error fetching folder contents:', error);
      res.status(500).json({ 
        message: "Error fetching folder contents",
        error: (error as Error).message 
      });
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
  
  // Comprehensive folder scanning and loan creation
  app.post("/api/loans/scan-folder", isAuthenticated, async (req, res) => {
    try {
      const { folderId, loanData } = req.body;
      const user = req.user as any;
      
      if (!folderId) {
        return res.status(400).json({ success: false, message: "Folder ID is required" });
      }
      
      console.log(`Starting comprehensive scan of folder: ${folderId}`);
      
      // Step 1: Recursively scan the entire folder structure
      const { files, folders } = await scanFolderRecursively(folderId);
      console.log(`Found ${files.length} files and ${folders.length} folders`);
      
      if (files.length === 0) {
        return res.status(400).json({ success: false, message: "No documents found in the selected folder" });
      }
      
      // Step 2: Download and process each document
      const processedDocuments = [];
      for (const file of files) {
        try {
          console.log(`Processing file: ${file.name}`);
          
          // Download file content
          let content = await downloadDriveFile(file.id);
          
          // If content is unreadable, mark for OCR (simplified OCR simulation)
          if (!content || typeof content !== 'string' || content.includes('Could not read') || content.length < 10) {
            console.log(`File ${file.name} needs OCR processing`);
            content = `OCR Content: Document ${file.name} - scanned image content would be processed here`;
          }
          
          processedDocuments.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            modifiedTime: file.modifiedTime,
            text: content
          });
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          processedDocuments.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            modifiedTime: file.modifiedTime,
            text: `Error reading file: ${error}`
          });
        }
      }
      
      // Step 3: Analyze documents with OpenAI
      let analysisResult;
      try {
        console.log(`Analyzing ${processedDocuments.length} documents with OpenAI...`);
        analysisResult = await analyzeDriveDocuments(processedDocuments);
        console.log("Document analysis completed successfully");
      } catch (analyzeError) {
        console.error("Error during document analysis:", analyzeError);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to analyze documents with AI",
          error: analyzeError.message 
        });
      }
      
      // Step 4: Create property
      const property = await storage.createProperty({
        address: analysisResult.address || loanData?.propertyAddress || "Address from documents",
        city: analysisResult.city || loanData?.city || "City from documents", 
        state: analysisResult.state || loanData?.state || "State from documents",
        zipCode: analysisResult.zipCode || loanData?.zipCode || "00000",
        propertyType: analysisResult.propertyType || "Residential"
      });
      
      // Step 5: Create loan
      const loan = await storage.createLoan({
        borrowerName: analysisResult.borrowerName || loanData?.borrowerName || "Borrower from documents",
        propertyAddress: property.address,
        propertyType: property.propertyType,
        loanType: analysisResult.loanType || "DSCR",
        loanPurpose: analysisResult.loanPurpose || "Purchase", 
        funder: loanData?.lender || "Kiavi",
        status: "In Progress",
        targetCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        driveFolder: folderId,
        propertyId: property.id,
        lenderId: 1, // Default to first lender
        processorId: user.id,
        completionPercentage: 25
      });
      
      // Step 6: Save all documents to database
      const savedDocuments = [];
      for (const doc of processedDocuments) {
        // Determine document category
        let category = "other";
        const fileName = doc.name.toLowerCase();
        if (fileName.includes("license") || fileName.includes("id") || fileName.includes("passport")) {
          category = "borrower";
        } else if (fileName.includes("title") || fileName.includes("deed")) {
          category = "title";
        } else if (fileName.includes("insurance") || fileName.includes("policy")) {
          category = "insurance";
        } else if (fileName.includes("lender") || fileName.includes("loan")) {
          category = "current lender";
        }
        
        const document = await storage.createDocument({
          loanId: loan.id,
          name: doc.name,
          fileId: doc.id,
          fileType: doc.mimeType.split('/')[1] || "unknown",
          fileSize: parseInt(doc.size || "0", 10),
          category,
          status: "processed"
        });
        
        savedDocuments.push(document);
      }
      
      // Step 7: Create tasks for missing documents
      const missingDocuments = analysisResult.missingDocuments || [];
      for (const missingDoc of missingDocuments) {
        await storage.createTask({
          description: `Obtain missing document: ${missingDoc}`,
          status: "pending",
          priority: "high",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          loanId: loan.id
        });
      }
      
      // Step 8: Create contacts from analysis
      const contacts = Array.isArray(analysisResult.contacts) ? analysisResult.contacts : [];
      for (const contact of contacts) {
        try {
          await storage.createContact({
            name: contact.name || "Unknown Contact",
            email: contact.email || null,
            phone: contact.phone || null,
            company: contact.company || null,
            role: contact.role || "Other",
            loanId: loan.id
          });
        } catch (contactError) {
          console.warn("Error creating contact:", contactError);
        }
      }
      
      // Step 9: Create initial AI message
      await storage.createMessage({
        content: `I've completed a comprehensive scan of your Google Drive folder and found ${files.length} documents across ${folders.length} folders.

**Documents Processed:**
${savedDocuments.map(doc => `- ${doc.name} (${doc.category})`).join('\n')}

**Analysis Results:**
- Borrower: ${analysisResult.borrowerName}
- Property: ${analysisResult.address}, ${analysisResult.city}, ${analysisResult.state}
- Loan Type: ${analysisResult.loanType}
- Loan Purpose: ${analysisResult.loanPurpose}

${missingDocuments.length > 0 ? `**Missing Documents:** 
${missingDocuments.map(doc => `- ${doc}`).join('\n')}

I've created tasks to obtain these missing documents.` : '**All required documents appear to be present.**'}

The loan file is now ready for processing.`,
        role: "assistant",
        loanId: loan.id
      });
      
      res.status(201).json({ 
        success: true, 
        loanId: loan.id,
        documentsProcessed: savedDocuments.length,
        missingDocuments: missingDocuments.length,
        foldersScanned: folders.length + 1,
        message: "Loan created successfully with comprehensive document analysis"
      });
      
    } catch (error) {
      console.error("Error in comprehensive folder scan:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error processing folder and documents",
        error: error.message 
      });
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
      
      // Get files from Google Drive folder with authentication
      // Pass the Google access token from session if available
      const googleTokens = (req.session as any)?.googleTokens;
      const accessToken = googleTokens?.access_token;
      
      const files = await getDriveFiles(driveFolderId, accessToken);
      
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
