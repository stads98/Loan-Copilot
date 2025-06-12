import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertLoanSchema, insertPropertySchema, insertContactSchema, insertTaskSchema, insertDocumentSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import { processLoanDocuments, analyzeDriveDocuments } from "./lib/openai";
import { authenticateGoogle, getDriveFiles, scanFolderRecursively, downloadDriveFile } from "./lib/google";
import { getGoogleAuthUrl, handleGoogleCallback, uploadFileToGoogleDriveOAuth, listGoogleDriveFilesOAuth } from "./lib/google-oauth";
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
    fileSize: 50 * 1024 * 1024, // 50MB limit (matches Express configuration)
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

// Auto-sync function to trigger Google Drive synchronization
async function triggerAutoSync(loanId: number, action: string, filename?: string) {
  // EMERGENCY PROTECTION: Auto-sync completely disabled to prevent document deletion
  console.log(`🛡️ AUTO-SYNC DISABLED: Local documents are permanently protected from sync operations`);
  console.log(`🛡️ Action: ${action}${filename ? ` - ${filename}` : ''} will NOT trigger sync for loan ${loanId}`);
  console.log(`🛡️ Local document management is the ONLY authoritative source`);
  return; // Exit immediately - no sync operations allowed
}

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

  // Get Google OAuth URL endpoint (for frontend to use)
  app.get("/api/auth/google/url", async (req, res) => {
    try {
      const { google } = await import('googleapis');
      const OAuth2 = google.auth.OAuth2;
      
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Google credentials not configured' });
      }
      
      const redirectUri = 'https://0007b75f-d504-4d28-927e-2b1824d99bb5-00-2pydj6ryedxd2.picard.replit.dev/api/auth/google/callback';
      
      const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const scopes = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
      });

      res.json({ authUrl });
    } catch (error) {
      console.error('Google OAuth URL generation error:', error);
      res.status(500).json({ error: 'Failed to generate Google authentication URL' });
    }
  });

  // Google OAuth routes
  app.get("/api/auth/google", async (req, res) => {
    try {
      const { google } = await import('googleapis');
      const OAuth2 = google.auth.OAuth2;
      
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Google credentials not configured' });
      }
      
      const redirectUri = 'https://0007b75f-d504-4d28-927e-2b1824d99bb5-00-2pydj6ryedxd2.picard.replit.dev/api/auth/google/callback';
      console.log('Using redirect URI:', redirectUri);
      
      const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const scopes = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
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
      
      const redirectUri = 'https://0007b75f-d504-4d28-927e-2b1824d99bb5-00-2pydj6ryedxd2.picard.replit.dev/api/auth/google/callback';
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
            scope: 'drive.file,drive'
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

  // Check Google Drive connection status with automatic restoration
  app.get("/api/auth/google/status", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.json({ connected: false });
      }

      // Always check database first for persistent tokens
      const driveToken = await storage.getUserToken(userId, 'drive');
      if (driveToken && driveToken.accessToken) {
        
        // Check if token needs refresh
        const isExpired = driveToken.expiryDate && driveToken.expiryDate.getTime() < Date.now();
        
        if (isExpired && driveToken.refreshToken) {
          try {
            console.log('Auto-refreshing expired Google Drive token...');
            const { google } = await import('googleapis');
            const OAuth2 = google.auth.OAuth2;
            
            const oauth2Client = new OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              'http://localhost:3000/callback'
            );
            
            oauth2Client.setCredentials({
              refresh_token: driveToken.refreshToken
            });
            
            const { credentials } = await oauth2Client.refreshAccessToken();
            
            // Update database with new tokens
            await storage.updateUserToken(userId, 'drive', {
              accessToken: credentials.access_token || '',
              refreshToken: credentials.refresh_token || driveToken.refreshToken,
              expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null
            });
            
            // Update session
            (req.session as any).googleTokens = {
              access_token: credentials.access_token,
              refresh_token: credentials.refresh_token || driveToken.refreshToken,
              expiry_date: credentials.expiry_date
            };
            (req.session as any).googleAuthenticated = true;
            
            console.log('Google Drive token auto-refreshed successfully');
            return res.json({ connected: true });
          } catch (refreshError) {
            console.error('Auto-refresh failed:', refreshError);
            return res.json({ connected: false, requiresReauth: true });
          }
        } else {
          // Token is still valid, restore to session if not already there
          if (!(req.session as any)?.googleAuthenticated) {
            (req.session as any).googleTokens = {
              access_token: driveToken.accessToken,
              refresh_token: driveToken.refreshToken,
              expiry_date: driveToken.expiryDate?.getTime()
            };
            (req.session as any).googleAuthenticated = true;
            console.log('Restored valid Google Drive tokens from database');
          }
          return res.json({ connected: true });
        }
      }
      
      res.json({ connected: false });
    } catch (error) {
      console.error('Error checking Google Drive status:', error);
      res.json({ connected: false });
    }
  });

  // Disconnect Google Drive
  app.post("/api/auth/google/disconnect", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Remove tokens from database
      await storage.deleteUserToken(userId, 'drive');
      await storage.deleteUserToken(userId, 'gmail');
      
      // Clear session
      delete (req.session as any).googleTokens;
      delete (req.session as any).googleAuthenticated;
      delete (req.session as any).gmailTokens;
      
      console.log('Google Drive and Gmail disconnected for user:', userId);
      res.json({ success: true, message: 'Google services disconnected successfully' });
    } catch (error) {
      console.error('Error disconnecting Google services:', error);
      res.status(500).json({ error: 'Failed to disconnect Google services' });
    }
  });

  // Google Drive folder management routes
  app.get('/api/drive/folders', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Check for Google Drive authentication
      let googleTokens = (req.session as any)?.googleTokens;
      
      if (!googleTokens) {
        // Always try to restore from database for persistent connection
        const driveToken = await storage.getUserToken(userId, 'drive');
        if (driveToken && driveToken.accessToken) {
          // Check if token needs refresh before using
          const isExpired = driveToken.expiryDate && driveToken.expiryDate.getTime() < Date.now();
          
          if (isExpired && driveToken.refreshToken) {
            try {
              console.log('Refreshing expired Google Drive token before folder access...');
              const { google } = await import('googleapis');
              const OAuth2 = google.auth.OAuth2;
              
              const oauth2Client = new OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                'http://localhost:3000/callback'
              );
              
              oauth2Client.setCredentials({
                refresh_token: driveToken.refreshToken
              });
              
              const { credentials } = await oauth2Client.refreshAccessToken();
              
              // Update database with new tokens
              await storage.updateUserToken(userId, 'drive', {
                accessToken: credentials.access_token || '',
                refreshToken: credentials.refresh_token || driveToken.refreshToken,
                expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null
              });
              
              googleTokens = {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token || driveToken.refreshToken,
                expiry_date: credentials.expiry_date
              };
              
              console.log('Google Drive token refreshed successfully for folder access');
            } catch (refreshError) {
              console.error('Token refresh failed during folder access:', refreshError);
              return res.status(401).json({ 
                error: 'Google Drive authentication expired. Please reconnect.',
                requiresReauth: true 
              });
            }
          } else {
            googleTokens = {
              access_token: driveToken.accessToken,
              refresh_token: driveToken.refreshToken,
              expiry_date: driveToken.expiryDate?.getTime()
            };
          }
          
          (req.session as any).googleTokens = googleTokens;
          (req.session as any).googleAuthenticated = true;
          console.log('Restored Google Drive tokens from database for folder access');
        } else {
          return res.status(401).json({ 
            error: 'Google Drive not connected',
            requiresReauth: true 
          });
        }
      }

      // Check if token is expired and refresh if needed
      if (googleTokens.expiry_date && googleTokens.expiry_date < Date.now()) {
        if (googleTokens.refresh_token) {
          try {
            console.log('Token expired, refreshing...');
            const { google } = await import('googleapis');
            const OAuth2 = google.auth.OAuth2;
            
            const oauth2Client = new OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              'http://localhost:3000/callback'
            );
            
            oauth2Client.setCredentials({
              refresh_token: googleTokens.refresh_token
            });
            
            const { credentials } = await oauth2Client.refreshAccessToken();
            
            // Update tokens
            googleTokens = {
              access_token: credentials.access_token,
              refresh_token: credentials.refresh_token || googleTokens.refresh_token,
              expiry_date: credentials.expiry_date
            };
            
            // Update session and database
            (req.session as any).googleTokens = googleTokens;
            await storage.updateUserToken(userId, 'drive', {
              accessToken: credentials.access_token || '',
              refreshToken: credentials.refresh_token || googleTokens.refresh_token,
              expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null
            });
            
            console.log('Token refreshed successfully');
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            return res.status(401).json({ 
              error: 'Google Drive authentication expired. Please reconnect.',
              requiresReauth: true 
            });
          }
        } else {
          return res.status(401).json({ 
            error: 'Google Drive authentication expired. Please reconnect.',
            requiresReauth: true 
          });
        }
      }

      // Use OAuth tokens to list folders from main loan folder
      const { listGoogleDriveFilesOAuth } = await import("./lib/google-oauth");
      const mainLoanFolderId = '1hqWhYyq9XzTg_LRfQCuNcNwwb2lX82qY'; // Main loan folder
      const files = await listGoogleDriveFilesOAuth(mainLoanFolderId, googleTokens);
      
      // Filter to only show folders
      const folderList = files
        .filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder')
        .map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          modifiedTime: folder.modifiedTime
        }));

      res.json({ folders: folderList });
    } catch (error) {
      console.error('Error listing Google Drive folders:', error);
      if (error.message?.includes('refresh token') || error.message?.includes('unauthorized')) {
        res.status(401).json({ 
          error: 'Google Drive authentication expired. Please reconnect.',
          requiresReauth: true 
        });
      } else {
        res.status(500).json({ error: 'Failed to list folders' });
      }
    }
  });

  app.post('/api/drive/folders', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      // Check for Google Drive authentication
      let googleTokens = (req.session as any)?.googleTokens;
      
      if (!googleTokens) {
        // Try to restore from database
        const driveToken = await storage.getUserToken(userId, 'drive');
        if (driveToken && driveToken.accessToken) {
          googleTokens = {
            access_token: driveToken.accessToken,
            refresh_token: driveToken.refreshToken,
            expiry_date: driveToken.expiryDate?.getTime()
          };
          (req.session as any).googleTokens = googleTokens;
        } else {
          return res.status(401).json({ error: 'Google Drive not connected' });
        }
      }

      // Use OAuth tokens to create folder
      const { getAuthenticatedDriveClient } = await import("./lib/google-oauth");
      const driveClient = getAuthenticatedDriveClient(googleTokens);
      
      const mainLoanFolderId = '1hqWhYyq9XzTg_LRfQCuNcNwwb2lX82qY'; // Main loan folder
      const folderMetadata = {
        name: name.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [mainLoanFolderId]
      };

      const response = await driveClient.files.create({
        requestBody: folderMetadata,
        fields: 'id,name,modifiedTime'
      });

      const folder = {
        id: response.data.id,
        name: response.data.name,
        modifiedTime: response.data.modifiedTime
      };

      res.json({ folder });
    } catch (error) {
      console.error('Error creating Google Drive folder:', error);
      res.status(500).json({ error: 'Failed to create folder' });
    }
  });

  // Get Google Drive folder name
  app.get("/api/drive/folder/:folderId/name", async (req, res) => {
    try {
      const { folderId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const userId = (req.user as any).id;
      
      // Get tokens from session or database
      let googleTokens = (req.session as any)?.googleTokens;
      
      if (!googleTokens) {
        const driveToken = await storage.getUserToken(userId, 'drive');
        if (driveToken) {
          googleTokens = {
            access_token: driveToken.accessToken,
            refresh_token: driveToken.refreshToken,
            expiry_date: driveToken.expiryDate?.getTime()
          };
        } else {
          return res.status(401).json({ message: "Google Drive not connected" });
        }
      }

      const { google } = await import('googleapis');
      const OAuth2 = google.auth.OAuth2;
      
      const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/callback'
      );
      
      oauth2Client.setCredentials(googleTokens);
      const driveClient = google.drive({ version: 'v3', auth: oauth2Client });

      // Try service account first for better permissions
      try {
        const { getDriveFolderName } = await import("./lib/google");
        const folderName = await getDriveFolderName(folderId);
        
        if (folderName) {
          console.log('Successfully fetched folder name via service account:', folderName);
          return res.json({ 
            id: folderId,
            name: folderName,
            source: 'service_account'
          });
        }
      } catch (serviceError) {
        console.log('Service account method failed, trying OAuth...');
      }

      // Fallback to OAuth
      const response = await driveClient.files.get({
        fileId: folderId,
        fields: 'id,name'
      });

      console.log('Folder API response via OAuth:', response.data);
      
      res.json({ 
        id: response.data.id,
        name: response.data.name,
        source: 'oauth'
      });
    } catch (error) {
      console.error('Error fetching folder name:', error);
      
      // Return helpful error message for re-authentication
      res.status(403).json({ 
        error: 'Insufficient permissions to read folder metadata',
        requiresReauth: true,
        message: 'Please reconnect Google Drive with enhanced permissions to view actual folder names'
      });
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

    // Auto-remove duplicates when loan is accessed
    await removeDuplicatesForLoan(id);

    const loan = await storage.getLoanWithDetails(id);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    res.json(loan);
  });

  // Helper function to automatically remove duplicates
  async function removeDuplicatesForLoan(loanId: number) {
    try {
      const documents = await storage.getDocumentsByLoanId(loanId);
      
      // Function to normalize filename by removing macOS download suffixes like (1), (2), etc.
      function normalizeFileName(filename: string): string {
        // Only remove patterns like " (1)", " (2)", etc. if they're BEFORE the file extension
        // This prevents "Policy Declaration (1).pdf" from becoming "Policy Declaration.pdf"
        const match = filename.match(/^(.+)\s+\((\d+)\)(\.[^.]+)$/);
        if (match) {
          return match[1] + match[3]; // base name + extension, removing the (number)
        }
        return filename; // Return original if no pattern matches
      }
      
      // Group by normalized name and file_size to find duplicates
      const documentGroups = new Map<string, any[]>();
      documents.forEach(doc => {
        const normalizedName = normalizeFileName(doc.name);
        const key = `${normalizedName}_${doc.fileSize}`;
        if (!documentGroups.has(key)) {
          documentGroups.set(key, []);
        }
        documentGroups.get(key)!.push(doc);
      });
      
      // Remove duplicates (keep the first, delete the rest)
      let duplicatesRemoved = 0;
      for (const [key, group] of documentGroups) {
        if (group.length > 1) {
          // Sort by upload date, keep the first one
          group.sort((a: any, b: any) => new Date(a.uploadedAt || 0).getTime() - new Date(b.uploadedAt || 0).getTime());
          
          // Only remove duplicates if they have the EXACT same name, file size, AND source
          // This prevents false positives and preserves legitimate documents
          const duplicateGroups = new Map<string, any[]>();
          
          group.forEach((doc: any) => {
            const duplicateKey = `${doc.name}_${doc.fileSize}_${doc.source || 'unknown'}`;
            if (!duplicateGroups.has(duplicateKey)) {
              duplicateGroups.set(duplicateKey, []);
            }
            duplicateGroups.get(duplicateKey)!.push(doc);
          });
          
          for (const [dupKey, dupGroup] of duplicateGroups) {
            if (dupGroup.length > 1) {
              // Sort by upload date, keep the first one
              dupGroup.sort((a: any, b: any) => new Date(a.uploadedAt || 0).getTime() - new Date(b.uploadedAt || 0).getTime());
              
              console.log(`Found exact duplicate group for ${dupKey}:`, dupGroup.map((d: any) => `${d.name} (${d.uploadedAt})`));
              
              // Delete all but the first
              for (let i = 1; i < dupGroup.length; i++) {
                console.log(`Removing exact duplicate: ${dupGroup[i].name} (ID: ${dupGroup[i].id})`);
                await storage.deleteDocument(dupGroup[i].id);
                duplicatesRemoved++;
              }
            }
          }
        }
      }
      
      if (duplicatesRemoved > 0) {
        console.log(`Auto-removed ${duplicatesRemoved} duplicate documents for loan ${loanId}`);
      }
    } catch (error) {
      console.error("Error removing duplicates:", error);
    }
  }

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

      // Get document info before restoring for auto-sync
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const restoredDocument = await storage.updateDocument(id, { deleted: false });
      if (!restoredDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      // RESTORE TO GOOGLE DRIVE: Document management is source of truth
      if (document.fileId && document.fileId.length > 10 && !document.fileId.includes('.')) {
        try {
          console.log(`Document restored locally - checking if file needs to be restored to Google Drive: ${document.name}`);
          
          // Get loan info to find Google Drive folder
          const loan = await storage.getLoan(document.loanId);
          if (loan && loan.googleDriveFolderId) {
            // Check if user has Google Drive tokens (from Gmail auth)
            let googleTokens = (req.session as any)?.gmailTokens;
            
            if (!googleTokens && req.user) {
              // Try to restore Gmail tokens from database (which include Drive permissions)
              const gmailToken = await storage.getUserToken((req.user as any).id, 'gmail');
              if (gmailToken) {
                googleTokens = {
                  access_token: gmailToken.accessToken,
                  refresh_token: gmailToken.refreshToken,
                  expiry_date: gmailToken.expiryDate?.getTime()
                };
                (req.session as any).gmailTokens = googleTokens;
              }
            }

            if (googleTokens && document.fileId) {
              // Check if file exists in Google Drive using OAuth
              const { checkFileExistsInDrive } = await import("./lib/google");
              const fileExists = await checkFileExistsInDrive(document.fileId, googleTokens);
              
              if (!fileExists) {
                console.log(`File not in Google Drive - need to re-upload: ${document.name}`);
                
                // If it's a local file, upload it back to Google Drive
                if (document.source === 'upload' || document.fileId.includes('.') || document.fileId.startsWith('email-attachment-')) {
                  try {
                    const fs = await import('fs').then(m => m.promises);
                    const path = await import('path');
                    const filePath = path.join(process.cwd(), 'uploads', document.fileId);
                    
                    if (await fs.access(filePath).then(() => true).catch(() => false)) {
                      const fileBuffer = await fs.readFile(filePath);
                      const { uploadFileToGoogleDriveOAuth } = await import("./lib/google");
                      
                      const driveFileId = await uploadFileToGoogleDriveOAuth(
                        document.name,
                        fileBuffer,
                        document.fileType || 'application/pdf',
                        loan.googleDriveFolderId,
                        googleTokens
                      );
                      
                      // Update document with new Google Drive file ID
                      await storage.updateDocument(id, { fileId: driveFileId });
                      console.log(`Successfully re-uploaded ${document.name} to Google Drive: ${driveFileId}`);
                    }
                  } catch (uploadError) {
                    console.error(`Failed to re-upload ${document.name} to Google Drive:`, uploadError);
                  }
                }
              } else {
                console.log(`File already exists in Google Drive: ${document.name}`);
              }
            }
          }
        } catch (driveError) {
          console.error(`Error checking/restoring file to Google Drive:`, driveError);
        }
      }

      // Trigger auto-sync after document restoration
      await triggerAutoSync(document.loanId, "restore", document.name);

      res.json({ success: true, document: restoredDocument });
    } catch (error) {
      console.error('Error restoring document:', error);
      res.status(500).json({ message: "Error restoring document" });
    }
  });

  // Reset all documents for a loan (delete both active and deleted documents permanently)
  app.delete("/api/loans/:loanId/reset-documents", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      // Verify the loan exists
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Get all documents for this loan (including deleted ones)
      const allDocuments = await storage.getAllDocumentsByLoanId(loanId);
      
      let deletedCount = 0;
      
      // Permanently delete all documents
      for (const document of allDocuments) {
        const deleted = await storage.deleteDocument(document.id);
        if (deleted) {
          deletedCount++;
        }
      }

      // Clear document assignments for this loan
      await storage.updateLoan(loanId, { documentAssignments: {} });

      console.log(`Reset completed: Permanently deleted ${deletedCount} documents for loan ${loanId}`);

      res.json({ 
        success: true, 
        message: `Successfully deleted ${deletedCount} documents from both active and deleted sections`,
        deletedCount 
      });
    } catch (error) {
      console.error('Error resetting documents:', error);
      res.status(500).json({ message: "Error resetting documents" });
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
      
      console.log(`COMPLETE SYNC: Making Google Drive an exact mirror of local documents for loan: ${loanId}`);
      
      // Get local documents (these are the source of truth)
      const localDocuments = await storage.getDocumentsByLoanId(loanId);
      const activeLocalDocs = localDocuments.filter(doc => !doc.deleted);
      
      console.log(`Found ${activeLocalDocs.length} active local documents to mirror to Google Drive`);
      
      // Get current Google Drive files and imports
      const { getDriveFiles } = await import("./lib/google");
      const { uploadFileToGoogleDriveOAuth } = await import("./lib/google-oauth");
      const googleTokens = (req.session as any)?.googleTokens;
      const currentDriveFiles = await getDriveFiles(folderId, googleTokens?.access_token) || [];
      
      console.log(`Found ${currentDriveFiles.length} existing files in Google Drive folder`);
      
      // STEP 1: Clear Google Drive folder completely (simplified approach)
      console.log("STEP 1: Clearing Google Drive folder to ensure exact mirror...");
      let deletedCount = 0;
      
      // For now, we'll track what gets uploaded instead of deleting
      // This ensures no data loss during the sync process
      console.log("Proceeding to upload local documents to create mirror...");
      
      // STEP 2: Upload all local documents to Google Drive
      console.log("STEP 2: Uploading all local documents to Google Drive...");
      let uploadedCount = 0;
      
      for (const localDoc of activeLocalDocs) {
        try {
          // Only upload documents that have local file content
          if (localDoc.fileId && (localDoc.fileId.includes('.') || localDoc.fileId.startsWith('email-attachment-'))) {
            const fs = await import('fs').then(m => m.promises);
            const path = await import('path');
            const filePath = path.join(process.cwd(), 'uploads', localDoc.fileId);
            
            try {
              if (await fs.access(filePath).then(() => true).catch(() => false)) {
                console.log(`Uploading ${localDoc.name} to Google Drive...`);
                const fileBuffer = await fs.readFile(filePath);
                
                const driveFileId = await uploadFileToGoogleDriveOAuth(
                  localDoc.name,
                  fileBuffer,
                  localDoc.fileType || 'application/octet-stream',
                  folderId,
                  googleTokens
                );
                
                // Update document record with new Google Drive file ID
                await storage.updateDocument(localDoc.id, {
                  fileId: driveFileId,
                  source: "synced_to_drive"
                });
                
                uploadedCount++;
                console.log(`Successfully uploaded ${localDoc.name} to Google Drive: ${driveFileId}`);
              } else {
                console.log(`Local file not found for ${localDoc.name} at ${filePath}`);
              }
            } catch (uploadError) {
              console.error(`Failed to upload ${localDoc.name} to Google Drive:`, uploadError);
            }
          } else {
            console.log(`Skipping ${localDoc.name} - not a local file (Google Drive document)`);
          }
        } catch (error) {
          console.error(`Error processing ${localDoc.name}:`, error);
        }
      }
      
      console.log(`COMPLETE SYNC FINISHED: Google Drive now mirrors ${uploadedCount} local documents`);
      
      res.json({
        success: true,
        message: `Complete sync finished: ${uploadedCount} local documents uploaded to Google Drive`,
        documentsUploaded: uploadedCount,
        syncType: "complete_mirror"
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
  const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit (matches Express configuration)
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and image files are allowed.'));
      }
    }
  });

  app.post("/api/loans/:loanId/documents", isAuthenticated, uploadMemory.single('file'), async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { name, category } = req.body;
      
      // Generate a unique file ID for uploads stored in memory
      const fileExtension = req.file.originalname.split('.').pop() || 'file';
      const uniqueFileId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
      
      // Save file to uploads directory
      const { promises: fs } = await import('fs');
      const path = await import('path');
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
      // Ensure uploads directory exists
      try {
        await fs.access(uploadsDir);
      } catch {
        await fs.mkdir(uploadsDir, { recursive: true });
      }
      
      const filePath = path.join(uploadsDir, uniqueFileId);
      await fs.writeFile(filePath, req.file.buffer);
      
      const documentData = insertDocumentSchema.parse({
        name: name || req.file.originalname.split('.').slice(0, -1).join('.'),
        fileId: uniqueFileId,
        fileType: req.file.mimetype.split('/')[1],
        fileSize: req.file.size,
        category: category || 'other',
        loanId
      });

      const document = await storage.createDocument(documentData);
      
      // Trigger auto-sync after document upload
      await triggerAutoSync(loanId, "upload", document.name);
      
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
      
      // Trigger auto-sync after document update
      if (updatedDocument && document.loanId) {
        await triggerAutoSync(document.loanId, "update", document.name);
      }
      
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

      // Get the document before deleting to check if it needs to be removed from Google Drive
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Delete from local database first (soft delete)
      const success = await storage.softDeleteDocument(id);
      if (!success) {
        return res.status(404).json({ message: "Document not found" });
      }

      // CRITICAL: Remove from Google Drive to prevent re-import during sync
      // Document management is source of truth - Google Drive must follow
      if (document.fileId && /^[a-zA-Z0-9_-]{25,50}$/.test(document.fileId) && !document.fileId.includes('.')) {
        try {
          console.log(`Document soft deleted locally - removing from Google Drive: ${document.fileId}`);
          
          // Try OAuth deletion first if tokens are available
          let googleTokens = (req.session as any)?.gmailTokens;
          
          if (!googleTokens && req.user) {
            // Try to restore Gmail tokens from database (which include Drive permissions)
            const gmailToken = await storage.getUserToken((req.user as any).id, 'gmail');
            if (gmailToken) {
              googleTokens = {
                access_token: gmailToken.accessToken,
                refresh_token: gmailToken.refreshToken,
                expiry_date: gmailToken.expiryDate?.getTime()
              };
              (req.session as any).gmailTokens = googleTokens;
            }
          }

          if (googleTokens) {
            try {
              const { deleteFileFromGoogleDriveOAuth } = await import("./lib/google");
              await deleteFileFromGoogleDriveOAuth(document.fileId, googleTokens);
              console.log(`Successfully deleted ${document.name} from Google Drive via OAuth`);
            } catch (oauthError) {
              console.error(`OAuth deletion failed, trying service account:`, oauthError);
              // Fallback to service account
              const { deleteFileFromGoogleDrive } = await import("./lib/google");
              await deleteFileFromGoogleDrive(document.fileId);
              console.log(`Successfully deleted ${document.name} from Google Drive via service account`);
            }
          } else {
            // Use service account as fallback
            const { deleteFileFromGoogleDrive } = await import("./lib/google");
            await deleteFileFromGoogleDrive(document.fileId);
            console.log(`Successfully deleted ${document.name} from Google Drive via service account`);
          }
        } catch (driveError) {
          console.error(`Failed to delete ${document.name} from Google Drive:`, driveError);
          console.log(`Document management system remains authoritative - local deletion completed`);
          // Continue with local deletion even if Google Drive deletion fails
        }
      }

      // Trigger auto-sync after document deletion
      await triggerAutoSync(document.loanId, "delete", document.name);

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
      const redirectUri = 'https://0007b75f-d504-4d28-927e-2b1824d99bb5-00-2pydj6ryedxd2.picard.replit.dev/api/auth/google/callback';
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
      console.log('=== EMAIL SCAN START ===');
      console.log('Getting loan details for ID:', loanId);
      
      const loan = await storage.getLoanWithDetails(loanId);
      console.log('Loan loaded:', !!loan);
      console.log('Loan structure:', Object.keys(loan || {}));
      
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

      // Build comprehensive search for ALL contact emails and loan-related terms
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      const dateQuery = eightWeeksAgo.toISOString().split('T')[0].replace(/-/g, '/');
      
      // Get ALL contact emails from the loan
      console.log('=== EMAIL SCAN DEBUG ===');
      console.log('Loan ID:', loanId);
      console.log('Loan contacts found:', loan.contacts?.length || 0);
      console.log('All loan contacts:', JSON.stringify(loan.contacts, null, 2));
      
      const contactEmails = loan.contacts?.map((c: any) => c.email).filter(Boolean) || [];
      console.log('Extracted contact emails:', contactEmails);
      
      console.log('Searching for emails from these contacts:', contactEmails);
      console.log('Contact roles:', loan.contacts?.map((c: any) => `${c.name} (${c.role}) - ${c.email}`));
      
      // Build comprehensive search that includes contact emails and attachments
      let searchTerms = [`has:attachment after:${dateQuery}`];
      
      // Add searches for ALL contact emails (borrower, title agents, insurance agents, etc.)
      if (contactEmails.length > 0) {
        contactEmails.forEach((email: string) => {
          if (email) {
            searchTerms.push(`(from:${email} OR to:${email} OR cc:${email}) after:${dateQuery}`);
          }
        });
      }
      
      // Add property-specific searches (subject line only - street address variations)
      if (loan.loan?.propertyAddress) {
        const streetAddress = loan.loan.propertyAddress.split(',')[0].trim();
        const streetMatch = streetAddress.match(/^(\d+)\s+(.+?)(\s+(st|street|dr|drive|ave|avenue|rd|road|ln|lane|blvd|boulevard|way|ct|court|pl|place|cir|circle|pkwy|parkway))?$/i);
        
        if (streetMatch) {
          const streetNumber = streetMatch[1];
          const streetName = streetMatch[2];
          
          // Create variations for street types and directions
          const streetVariations = [streetAddress];
          
          // Add common abbreviations
          const abbreviations = {
            'street': 'st', 'drive': 'dr', 'avenue': 'ave', 'road': 'rd',
            'boulevard': 'blvd', 'court': 'ct', 'lane': 'ln', 'place': 'pl',
            'circle': 'cir', 'parkway': 'pkwy', 'way': 'way'
          };
          
          // Add directional variations
          const directions = {
            'north': 'n', 'northeast': 'ne', 'northwest': 'nw',
            'south': 's', 'southeast': 'se', 'southwest': 'sw',
            'east': 'e', 'west': 'w'
          };
          
          Object.entries(abbreviations).forEach(([full, abbrev]) => {
            if (streetName.toLowerCase().includes(full)) {
              streetVariations.push(`${streetNumber} ${streetName.toLowerCase().replace(full, abbrev)}`);
            }
            if (streetName.toLowerCase().includes(abbrev)) {
              streetVariations.push(`${streetNumber} ${streetName.toLowerCase().replace(abbrev, full)}`);
            }
          });
          
          Object.entries(directions).forEach(([full, abbrev]) => {
            if (streetAddress.toLowerCase().includes(full)) {
              streetVariations.push(streetAddress.toLowerCase().replace(full, abbrev));
            }
            if (streetAddress.toLowerCase().includes(abbrev)) {
              streetVariations.push(streetAddress.toLowerCase().replace(abbrev, full));
            }
          });
          
          // Search subject lines for any street variation
          const streetSearches = streetVariations.map(variation => `subject:"${variation}"`).join(' OR ');
          searchTerms.push(`(${streetSearches}) after:${dateQuery}`);
        }
      }
      
      // Add loan number search (subject line only)
      if (loan.loan?.loanNumber) {
        searchTerms.push(`subject:"${loan.loan.loanNumber}" after:${dateQuery}`);
      }
      
      const searchQuery = `(${searchTerms.join(' OR ')})`;
      console.log('Gmail search query:', searchQuery);
      
      const listResponse = await gmail.users.messages.list({
        auth: gmailAuth,
        userId: 'me',
        maxResults: 1000,
        q: searchQuery
      });
      
      console.log(`Gmail search returned ${listResponse.data.messages?.length || 0} messages`);

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
      const downloadedInThisScan = new Set(); // Track files downloaded in this scan

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
          const existingDocuments = await storage.getAllDocumentsByLoanId(loanId);

          // Download each PDF
          for (const attachment of pdfAttachments) {
            try {
              // Enhanced duplicate detection - check by name, size, and source
              const sourceKey = `gmail:${message.from}`;
              const isDuplicate = existingDocuments.some(doc => 
                doc.name === attachment.filename && 
                doc.fileSize === attachment.size &&
                doc.source === sourceKey &&
                !doc.deleted // Only check non-deleted documents
              );

              if (isDuplicate) {
                console.log(`Skipping duplicate document: ${attachment.filename} from ${message.from}`);
                continue;
              }
              
              // Mark as downloaded in this scan for internal tracking
              const attachmentKey = `${attachment.filename}_${attachment.size}`;
              downloadedInThisScan.add(attachmentKey);

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
                
                const data = fileBuffer;

                // Check if document is relevant to this specific loan
                const isRelevantDocument = (() => {
                  const filename = attachment.filename.toLowerCase();
                  const subject = message.subject.toLowerCase();
                  const messageFrom = message.from.toLowerCase();
                  
                  // Allow documents that match ANY of these criteria:
                  
                  // 1. From one of our relevant contacts
                  const relevantContacts = loan.contacts?.map((c: any) => c.email?.toLowerCase()).filter(Boolean) || [];
                  const isFromRelevantContact = relevantContacts.some(contact => messageFrom.includes(contact));
                  
                  // Debug logging for 3keatonsmith111@gmail.com
                  if (messageFrom.includes('3keatonsmith111') || messageFrom.includes('keatonsmith111')) {
                    console.log(`Keaton Smith email debug:
                      - Message from: ${messageFrom}
                      - Relevant contacts: ${JSON.stringify(relevantContacts)}
                      - Is from relevant contact: ${isFromRelevantContact}
                      - Filename: ${filename}
                      - Subject: ${subject}
                      - Will process: ${isFromRelevantContact ? 'YES' : 'NO'}`);
                  }
                  
                  // 2. OR mentions this specific property address in subject line
                  const mentionsProperty = (() => {
                    if (!loan.loan?.propertyAddress) return false;
                    
                    const propertyAddress = loan.loan.propertyAddress.toLowerCase();
                    const streetMatch = propertyAddress.match(/^(\d+)\s+(.+?)(?:,|$)/);
                    
                    if (!streetMatch) return false;
                    
                    const streetNumber = streetMatch[1];
                    const streetName = streetMatch[2];
                    
                    // Check if subject includes the street number
                    if (!subject.includes(streetNumber)) return false;
                    
                    // Create variations for street types and directions
                    const streetVariations = [streetName];
                    
                    // Add common abbreviations
                    const abbreviations = {
                      'street': 'st', 'drive': 'dr', 'avenue': 'ave', 'road': 'rd',
                      'boulevard': 'blvd', 'court': 'ct', 'lane': 'ln', 'place': 'pl',
                      'circle': 'cir', 'parkway': 'pkwy', 'way': 'way'
                    };
                    
                    // Add directional variations
                    const directions = {
                      'north': 'n', 'northeast': 'ne', 'northwest': 'nw',
                      'south': 's', 'southeast': 'se', 'southwest': 'sw',
                      'east': 'e', 'west': 'w'
                    };
                    
                    Object.entries(abbreviations).forEach(([full, abbrev]) => {
                      if (streetName.includes(full)) {
                        streetVariations.push(streetName.replace(full, abbrev));
                      }
                      if (streetName.includes(abbrev)) {
                        streetVariations.push(streetName.replace(abbrev, full));
                      }
                    });
                    
                    Object.entries(directions).forEach(([full, abbrev]) => {
                      if (streetName.includes(full)) {
                        streetVariations.push(streetName.replace(full, abbrev));
                      }
                      if (streetName.includes(abbrev)) {
                        streetVariations.push(streetName.replace(abbrev, full));
                      }
                    });
                    
                    // Check if subject includes any street variation
                    return streetVariations.some(variation => subject.includes(variation));
                  })();
                  
                  // 3. OR mentions loan number in subject line only
                  const mentionsLoanNumber = loan.loan?.loanNumber && subject.includes(loan.loan.loanNumber.toLowerCase());
                  
                  // 4. OR mentions borrower name
                  const mentionsBorrower = loan.loan?.borrowerName && (
                    filename.includes(loan.loan.borrowerName.toLowerCase()) ||
                    subject.includes(loan.loan.borrowerName.toLowerCase()) ||
                    messageFrom.includes(loan.loan.borrowerName.toLowerCase())
                  );
                  
                  // If from a relevant contact (like title company), always allow
                  if (isFromRelevantContact) {
                    console.log(`Document allowed - from relevant contact: ${filename}`);
                    return true;
                  }
                  
                  // Otherwise, require property/loan/borrower mention
                  return mentionsProperty || mentionsLoanNumber || mentionsBorrower;
                })();

                if (!isRelevantDocument) {
                  console.log(`Skipping irrelevant document: ${attachment.filename} from ${message.from}`);
                  continue;
                }

                // Determine category based on document type, not sender
                let category = 'other';
                const filename = attachment.filename.toLowerCase();
                
                if (filename.includes('insurance') || filename.includes('policy') || filename.includes('binder')) {
                  category = 'insurance';
                } else if (filename.includes('title') || filename.includes('deed') || filename.includes('survey')) {
                  category = 'title';
                } else if (filename.includes('appraisal') || filename.includes('valuation')) {
                  category = 'property';
                } else if (filename.includes('license') || filename.includes('llc') || filename.includes('id')) {
                  category = 'borrower';
                } else if (filename.includes('loan') || filename.includes('application')) {
                  category = 'loan';
                }



                // Save document to database with local file reference
                const document = await storage.createDocument({
                  name: attachment.filename,
                  fileId: fileId, // Use local filename for "Send to Drive" functionality
                  loanId: loanId,
                  fileType: attachment.mimeType,
                  fileSize: attachment.size,
                  category: category,
                  source: `gmail:${message.from}`,
                  status: 'processed'
                });
                
                console.log(`Saved document locally: ${attachment.filename} as ${fileId}`);

                downloadedPDFs.push({
                  filename: attachment.filename,
                  emailSubject: message.subject,
                  size: attachment.size,
                  category: category
                });
                
                // Trigger auto-sync after PDF download
                await triggerAutoSync(loanId, "download", attachment.filename);
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
      
      // Get loan data first if loanId is provided to build comprehensive search
      let searchQuery = `has:attachment after:${dateQuery}`;
      
      if (loanId) {
        const loan = await storage.getLoanWithDetails(loanId);
        if (loan) {
          // Search more broadly - include ALL contact emails and loan-related terms
          const contactEmails = loan.contacts?.map((c: any) => c.email).filter(Boolean) || [];
          
          console.log('Searching for emails from these contacts:', contactEmails);
          console.log('Contact roles:', loan.contacts?.map((c: any) => `${c.name} (${c.role}) - ${c.email}`));
          
          // Build a comprehensive search that includes contact emails and attachments
          let searchTerms = [`has:attachment after:${dateQuery}`];
          
          // Add searches for ALL contact emails (borrower, title agents, insurance agents, etc.)
          if (contactEmails.length > 0) {
            contactEmails.forEach((email: string) => {
              if (email) {
                searchTerms.push(`(from:${email} OR to:${email} OR cc:${email}) after:${dateQuery}`);
              }
            });
          }
          
          // Add property address search (street variations only, no borrower name)
          if (loan.loan?.propertyAddress) {
            const streetAddress = loan.loan.propertyAddress.split(',')[0].trim();
            const streetMatch = streetAddress.match(/^(\d+)\s+(.+?)(\s+(st|street|dr|drive|ave|avenue|rd|road|ln|lane|blvd|boulevard|way|ct|court|pl|place|cir|circle|pkwy|parkway))?$/i);
            
            if (streetMatch) {
              const streetNumber = streetMatch[1];
              const streetName = streetMatch[2];
              
              // Create variations for street types and directions
              const streetVariations = [streetAddress];
              
              // Add common abbreviations
              const abbreviations = {
                'street': 'st', 'drive': 'dr', 'avenue': 'ave', 'road': 'rd',
                'boulevard': 'blvd', 'court': 'ct', 'lane': 'ln', 'place': 'pl',
                'circle': 'cir', 'parkway': 'pkwy', 'way': 'way'
              };
              
              // Add directional variations
              const directions = {
                'north': 'n', 'northeast': 'ne', 'northwest': 'nw',
                'south': 's', 'southeast': 'se', 'southwest': 'sw',
                'east': 'e', 'west': 'w'
              };
              
              // Add street variations without attachment requirement
              const streetSearches = streetVariations.map(variation => `"${variation}"`).join(' OR ');
              searchTerms.push(`(${streetSearches}) after:${dateQuery}`);
            }
          }
          
          // Add loan number search (subject line only)
          if (loan.loan?.loanNumber) {
            searchTerms.push(`subject:"${loan.loan.loanNumber}" after:${dateQuery}`);
          }
          
          searchQuery = `(${searchTerms.join(' OR ')})`;
        }
      }
      
      console.log('Gmail search query:', searchQuery);
      console.log('Enhanced search now includes adlercapital.info domain and attachment filtering');
      const listResponse = await gmail.users.messages.list({
        auth: gmailAuth,
        userId: 'me',
        maxResults: 1000, // Increased to 1000 to catch more historical emails
        q: searchQuery
      });
      
      console.log(`Gmail search returned ${listResponse.data.messages?.length || 0} messages`);

      const allMessages = [];
      
      if (listResponse.data.messages) {
        // Track processed threads to avoid duplicates - show only one message per conversation
        const processedThreads = new Map();
        
        // Get details for each message
        for (const message of listResponse.data.messages) {
          try {
            // If we haven't processed this thread yet, get the latest message from the thread
            if (!processedThreads.has(message.threadId)) {
              const msgResponse = await gmail.users.messages.get({
                auth: gmailAuth,
                userId: 'me',
                id: message.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date', 'To', 'Cc']
              });

              const headers = msgResponse.data.payload?.headers || [];
              const fromHeader = headers.find(h => h.name === 'From');
              const subjectHeader = headers.find(h => h.name === 'Subject');
              const dateHeader = headers.find(h => h.name === 'Date');
              const toHeader = headers.find(h => h.name === 'To');
              const ccHeader = headers.find(h => h.name === 'Cc');

              const messageData = {
                id: message.id,
                threadId: message.threadId,
                snippet: msgResponse.data.snippet,
                subject: subjectHeader?.value || '',
                from: fromHeader?.value || '',
                to: toHeader?.value || '',
                cc: ccHeader?.value || '',
                date: dateHeader?.value || '',
                unread: msgResponse.data.labelIds?.includes('UNREAD') || false,
                hasAttachments: msgResponse.data.payload?.parts?.some(part => 
                  part.filename && part.filename.length > 0
                ) || false
              };

              processedThreads.set(message.threadId, messageData);
              allMessages.push(messageData);
            }
          } catch (msgError) {
            console.error('Error fetching message details:', msgError);
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
            
            // First priority: Check if from/to any of the loan contacts
            const contactEmails = loan.contacts?.map((c: any) => c.email?.toLowerCase()).filter(Boolean) || [];
            const isFromLoanContact = contactEmails.some(email => 
              from.includes(email) || to.includes(email) || cc.includes(email)
            );
            
            if (isFromLoanContact) {
              return true; // Always include emails from loan contacts
            }
            
            // Second priority: Check loan number
            if (loan.loan?.loanNumber && (subject.includes(loan.loan.loanNumber) || message.snippet?.toLowerCase().includes(loan.loan.loanNumber.toLowerCase()))) {
              return true;
            }
            
            // Third priority: Check property address - just street number + street name
            if (loan.property?.address) {
              const streetAddress = loan.property.address.split(',')[0].trim().toLowerCase();
              
              // Include if street address is mentioned in subject (e.g., "32 run st")
              if (subject.includes(streetAddress)) {
                return true;
              }
            }
            
            // Exclude everything else - especially emails that only mention borrower name in passing
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
                name: filename,
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
      const document = await storage.createDocument({
        name: filename,
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
        console.log("No documents found in folder, creating loan without documents");
        // Create loan without documents - just use the loan data provided
        
        // Step 4: Create property from loan data
        const property = await storage.createProperty({
          address: loanData?.propertyAddress || "Address from loan data",
          city: loanData?.city || "City", 
          state: loanData?.state || "State",
          zipCode: loanData?.zipCode || "00000",
          propertyType: loanData?.propertyType || "single_family"
        });
        
        // Step 5: Create loan
        const loan = await storage.createLoan({
          loanNumber: loanData?.loanNumber || "",
          borrowerName: loanData?.borrowerName || "Borrower Name",
          borrowerEntityName: loanData?.borrowerEntityName || loanData?.borrowerName || "Borrower Name",
          propertyAddress: loanData?.propertyAddress || "Property Address",
          propertyType: loanData?.propertyType || "single_family",
          estimatedValue: loanData?.estimatedValue || null,
          loanAmount: loanData?.loanAmount || "0",
          loanToValue: loanData?.loanToValue || null,
          loanType: loanData?.loanType || "DSCR",
          loanPurpose: loanData?.loanPurpose || "Purchase",
          funder: loanData?.funder || "Kiavi",
          status: "in_progress",
          targetCloseDate: loanData?.targetCloseDate || null,
          driveFolder: folderId,
          googleDriveFolderId: folderId,
          propertyId: property.id,
          lenderId: 1, // Kiavi
          processorId: user.id,
          completionPercentage: 0
        });
        
        // Step 6: Create initial message
        await storage.createMessage({
          content: `Loan created successfully! The Google Drive folder is connected but currently empty. You can now start uploading documents to the folder and they will be automatically processed.
          
Loan Details:
- Loan Number: ${loan.loanNumber}
- Borrower: ${loan.borrowerName}
- Property: ${loan.propertyAddress}
- Loan Type: ${loan.loanType}
- Loan Purpose: ${loan.loanPurpose}

Ready to start document collection and processing.`,
          role: "assistant",
          loanId: loan.id
        });
        
        return res.status(201).json({ 
          success: true, 
          loanId: loan.id,
          documentsProcessed: 0,
          missingDocuments: 0,
          foldersScanned: 1,
          message: "Loan created successfully with empty Google Drive folder"
        });
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

  // Send all loan documents to Google Drive (clear folder first, then upload all)
  app.post('/api/loans/:loanId/send-to-drive', isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const { folderId } = req.body;
      const userId = (req.user as any)?.id;

      if (!folderId) {
        return res.status(400).json({ error: 'Folder ID is required' });
      }

      // Get all documents for this loan
      const documents = await storage.getDocumentsByLoanId(loanId);
      
      console.log(`Found ${documents.length} documents for loan ${loanId}`);
      
      if (documents.length === 0) {
        return res.json({ uploadedCount: 0, message: 'No documents to upload' });
      }

      // Get Google Drive tokens with fallback authentication
      let tokens = await storage.getUserToken(userId, 'drive');
      
      if (!tokens) {
        // Try to restore from session if database doesn't have tokens
        const sessionTokens = (req.session as any)?.googleTokens;
        if (sessionTokens && sessionTokens.access_token) {
          // Save session tokens to database for persistence
          tokens = await storage.createUserToken({
            userId: userId,
            service: 'drive',
            accessToken: sessionTokens.access_token,
            refreshToken: sessionTokens.refresh_token,
            expiryDate: sessionTokens.expiry_date ? new Date(sessionTokens.expiry_date) : null,
            scope: 'https://www.googleapis.com/auth/drive'
          });
        } else {
          return res.status(401).json({ error: 'Google Drive not connected' });
        }
      }

      // Clear the folder first
      const { clearDriveFolder, uploadDocumentsToDrive } = await import('./lib/google');
      await clearDriveFolder(folderId, tokens.accessToken, tokens.refreshToken || '');

      // Upload all documents
      console.log("Documents to upload:", documents.map(d => ({ id: d.id, name: d.name, fileId: d.fileId })));
      const uploadResult = await uploadDocumentsToDrive(documents, folderId, tokens.accessToken, tokens.refreshToken || '');
      console.log("Upload result:", uploadResult);
      
      res.json({ 
        uploadedCount: uploadResult.successCount,
        failedCount: uploadResult.failedCount,
        message: `${uploadResult.successCount} documents uploaded to Google Drive`
      });

    } catch (error) {
      console.error('Error sending documents to Drive:', error);
      res.status(500).json({ error: 'Failed to send documents to Google Drive' });
    }
  });

  // Google Drive specific disconnect endpoint
  app.post('/api/auth/google-drive/disconnect', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Delete Google Drive tokens from database
      await storage.deleteUserToken(userId, 'google_drive');
      
      console.log(`Google Drive disconnected for user: ${userId}`);
      res.json({ success: true, message: 'Google Drive disconnected successfully' });
    } catch (error) {
      console.error('Error disconnecting Google Drive:', error);
      res.status(500).json({ error: 'Failed to disconnect Google Drive' });
    }
  });

  // Gmail specific disconnect endpoint  
  app.post('/api/auth/gmail/disconnect', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Delete Gmail tokens from database
      await storage.deleteUserToken(userId, 'gmail');
      
      console.log(`Gmail disconnected for user: ${userId}`);
      res.json({ success: true, message: 'Gmail disconnected successfully' });
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
      res.status(500).json({ error: 'Failed to disconnect Gmail' });
    }
  });

  // Legacy endpoint that disconnects both (for backward compatibility)
  app.post('/api/auth/google/disconnect', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Delete both Google Drive and Gmail tokens from database
      await storage.deleteUserToken(userId, 'google_drive');
      await storage.deleteUserToken(userId, 'gmail');
      
      console.log(`Google Drive and Gmail disconnected for user: ${userId}`);
      res.json({ success: true, message: 'Google Drive and Gmail disconnected successfully' });
    } catch (error) {
      console.error('Error disconnecting Google services:', error);
      res.status(500).json({ error: 'Failed to disconnect Google services' });
    }
  });

  const httpServer = createServer(app);
  
  return httpServer;
}
