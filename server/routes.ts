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
      
      console.log(`Syncing documents from Google Drive folder: ${folderId} for loan: ${loanId}`);
      
      // Get files from Google Drive folder
      const { getDriveFiles } = await import("./lib/google");
      const { uploadFileToGoogleDriveOAuth } = await import("./lib/google-oauth");
      const googleTokens = (req.session as any)?.googleTokens;
      const files = await getDriveFiles(folderId, googleTokens?.access_token) || [];
      
      console.log(`Found ${files.length} files to sync`);
      
      // CRITICAL: LOCAL DOCUMENT MANAGEMENT IS PRIMARY SOURCE
      // Implement comprehensive protection against document deletion
      const { logProtectedOperation } = await import("./lib/sync-protection");
      
      // Update existing documents or create new ones
      let documentsUpdated = 0;
      let documentsCreated = 0;
      let documentsUploaded = 0;
      
      // LOCAL DOCUMENT MANAGEMENT IS PRIMARY SOURCE
      // Upload-Only Sync: Local → Google Drive + Delete Synchronization
      const existingDocs = await storage.getDocumentsByLoanId(loanId);
      // Get documents that were soft-deleted (marked as deleted)
      const allDocs = await storage.getAllDocumentsByLoanId(loanId);
      const deletedDocs = allDocs.filter(doc => doc.deleted === true);
      
      console.log(`📁 LOCAL-FIRST SYNC: Managing ${existingDocs.length} local documents as primary source`);
      console.log(`🗑️ Processing ${deletedDocs.length} deleted documents for removal from Google Drive`);
      logProtectedOperation("Upload-Only Google Drive Sync", existingDocs.length);
      
      // Step 1: Delete from Google Drive any documents that were deleted locally
      const { deleteFileFromGoogleDrive } = await import("./lib/google");
      let documentsDeleted = 0;
      
      for (const deletedDoc of deletedDocs) {
        if (deletedDoc.fileId && /^[a-zA-Z0-9_-]{25,50}$/.test(deletedDoc.fileId)) {
          try {
            console.log(`🗑️ Deleting ${deletedDoc.name} from Google Drive...`);
            await deleteFileFromGoogleDrive(deletedDoc.fileId);
            documentsDeleted++;
            console.log(`✅ Successfully deleted ${deletedDoc.name} from Google Drive`);
          } catch (deleteError) {
            console.error(`❌ Failed to delete ${deletedDoc.name} from Google Drive:`, deleteError);
          }
        }
      }

      // Step 2: Upload local documents TO Google Drive (prevent duplicates)
      console.log("Starting upload-only sync - uploading local documents to Google Drive...");
      try {
        const allLocalDocs = await storage.getDocumentsByLoanId(loanId);
        const driveFileNames = new Set(files.map(f => f.name));
        
        console.log(`Found ${allLocalDocs.length} local documents to check for upload`);
        
        for (const localDoc of allLocalDocs) {
          // Skip deleted documents - they should not sync to Google Drive
          if (localDoc.deleted) {
            console.log(`Skipping deleted document: ${localDoc.name}`);
            continue;
          }
          
          // Check if a file with the same name already exists in Drive
          if (driveFileNames.has(localDoc.name)) {
            console.log(`Skipping ${localDoc.name} - already in Google Drive`);
            continue;
          }
          
          // Only upload documents that have local file content (uploaded files or email attachments)
          // Google Drive IDs are long strings without extensions, local files have extensions or email-attachment prefix
          if (localDoc.fileId && (localDoc.fileId.includes('.') || localDoc.fileId.startsWith('email-attachment-'))) {
            // This is a local file (has extension in fileId or is an email attachment)
            try {
              const fs = await import('fs').then(m => m.promises);
              const path = await import('path');
              const filePath = path.join(process.cwd(), 'uploads', localDoc.fileId);
              
              console.log(`Checking if file exists at: ${filePath}`);
              if (await fs.access(filePath).then(() => true).catch(() => false)) {
                console.log(`Uploading ${localDoc.name} to Google Drive...`);
                const fileBuffer = await fs.readFile(filePath);
                
                // Try OAuth upload first if tokens are available
                const googleTokens = (req.session as any)?.googleTokens;
                if (googleTokens) {
                  try {
                    const driveFileId = await uploadFileToGoogleDriveOAuth(
                      localDoc.name,
                      fileBuffer,
                      `application/${localDoc.fileType}`,
                      folderId,
                      googleTokens
                    );
                    
                    // Update document record with Google Drive file ID
                    await storage.updateDocument(localDoc.id, {
                      fileId: driveFileId,
                      source: "synced_to_drive"
                    });
                    
                    documentsUploaded++;
                    console.log(`Successfully uploaded ${localDoc.name} to Google Drive with OAuth: ${driveFileId}`);
                  } catch (oauthError) {
                    console.error(`OAuth upload failed for ${localDoc.name}, trying service account:`, oauthError);
                    
                    // Fallback to service account upload
                    try {
                      const { uploadFileToGoogleDrive } = await import("./lib/google");
                      const driveFileId = await uploadFileToGoogleDrive(
                        localDoc.name,
                        fileBuffer,
                        `application/${localDoc.fileType}`,
                        folderId
                      );
                      
                      await storage.updateDocument(localDoc.id, {
                        fileId: driveFileId,
                        source: "synced_to_drive"
                      });
                      
                      documentsUploaded++;
                      console.log(`Successfully uploaded ${localDoc.name} with service account: ${driveFileId}`);
                    } catch (serviceError) {
                      console.error(`Both OAuth and service account upload failed for ${localDoc.name}:`, serviceError);
                    }
                  }
                } else {
                  console.log(`No OAuth tokens available, skipping upload for ${localDoc.name}`);
                }
              } else {
                console.log(`Local file not found for ${localDoc.name} at ${filePath}`);
              }
            } catch (uploadError) {
              console.error(`Failed to upload ${localDoc.name} to Google Drive:`, uploadError);
              // Don't fail the entire sync if one upload fails
            }
          } else {
            console.log(`Skipping ${localDoc.name} - no local file to upload`);
          }
        }
        
        console.log(`Bi-directional sync completed: ${documentsUploaded} documents uploaded to Google Drive`);
      } catch (syncError) {
        console.error("Error during bi-directional sync:", syncError);
        // Don't fail the entire sync if upload portion fails
      }
      
      const syncMessage = documentsUploaded > 0 
        ? `Bi-directional sync completed: ${documentsCreated} new from Drive, ${documentsUpdated} updated from Drive, ${documentsUploaded} uploaded to Drive`
        : `Sync from Drive completed: ${documentsCreated} new documents, ${documentsUpdated} updated. Upload to Drive requires folder write permissions.`;

      res.json({
        success: true,
        message: `Upload-only sync completed: ${documentsUploaded} uploaded, ${documentsDeleted} deleted from Google Drive`,
        documentsUploaded,
        documentsDeleted,
        syncDirection: "upload_only_with_delete"
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

  // Get Gmail messages with loan-specific filtering
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

      // Get loan details for filtering if loanId provided
      let loan = null;
      if (loanId) {
        loan = await storage.getLoanWithDetails(loanId);
      }

      // Get list of messages with PDF attachments
      const listResponse = await gmail.users.messages.list({
        auth: gmailAuth,
        userId: 'me',
        maxResults: maxResults * 3, // Get more to filter down
        q: 'has:attachment filename:pdf'
      });

      const messages = [];
      
      if (listResponse.data.messages) {
        // Filter messages based on loan details
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
            const date = headers.find(h => h.name === 'Date')?.value || '';
            
            let isRelevant = false;

            if (loan) {
              // Check property address (street address only)
              if (loan.loan?.propertyAddress) {
                const streetAddress = loan.loan.propertyAddress.split(',')[0].trim().toLowerCase();
                if (subject.includes(streetAddress) || from.includes(streetAddress) || to.includes(streetAddress)) {
                  isRelevant = true;
                }
              }

              // Check contact emails from the current loan
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
            }

            // If no loan context, show all emails with PDF attachments
            if (!loan) {
              isRelevant = true;
            }

            if (isRelevant) {
              // Check for attachments
              const hasAttachments = msgResponse.data.payload?.parts?.some(part => 
                part.filename && part.filename.length > 0
              ) || false;

              messages.push({
                id: message.id,
                threadId: message.threadId,
                snippet: msgResponse.data.snippet || '',
                subject: headers.find(h => h.name === 'Subject')?.value || '',
                from: headers.find(h => h.name === 'From')?.value || '',
                date: date,
                unread: msgResponse.data.labelIds?.includes('UNREAD') || false,
                hasAttachments: hasAttachments
              });

              // Stop when we have enough relevant messages
              if (messages.length >= maxResults) {
                break;
              }
            }
          } catch (msgError) {
            console.error(`Error getting message ${message.id}:`, msgError);
            // Continue with other messages
          }
        }
      }

      res.json({ messages });
    } catch (error) {
      console.error("Error fetching Gmail messages:", error);
      res.status(500).json({ message: "Error fetching messages" });
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

  // Scan emails visible in Gmail Inbox and download PDFs
  app.post("/api/loans/:loanId/scan-visible-emails", isAuthenticated, async (req, res) => {
    try {
      if (!(req.session as any)?.gmailTokens) {
        return res.status(401).json({ message: "Gmail authentication required" });
      }

      const loanId = parseInt(req.params.loanId);
      const { messageIds } = req.body; // Get the message IDs from the request body
      
      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: "No email message IDs provided" });
      }

      console.log(`=== SCANNING ${messageIds.length} VISIBLE EMAILS ===`);
      
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

      // Process only the specific message IDs provided from the visible Gmail Inbox
      const downloadedPDFs: any[] = [];
      let totalPDFs = 0;

      for (const messageId of messageIds) {
        try {
          // Get full message with attachments
          const msgResponse = await gmail.users.messages.get({
            auth: gmailAuth,
            userId: 'me',
            id: messageId,
            format: 'full'
          });

          const headers = msgResponse.data.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const from = headers.find(h => h.name === 'From')?.value || '';

          const parts = msgResponse.data.payload?.parts || [];
          const attachments: any[] = [];

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

          // Process PDF attachments
          for (const attachment of attachments) {
            if (attachment.mimeType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf')) {
              totalPDFs++;
              
              try {
                // Download the attachment
                const attachmentResponse = await gmail.users.messages.attachments.get({
                  auth: gmailAuth,
                  userId: 'me',
                  messageId: messageId,
                  id: attachment.attachmentId
                });

                if (!attachmentResponse.data.data) {
                  console.error(`No data for attachment ${attachment.filename}`);
                  continue;
                }

                let base64Data = attachmentResponse.data.data;
                // Ensure proper base64 padding
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

                // Determine category
                let category = 'other';
                const filename = attachment.filename.toLowerCase();
                if (filename.includes('title') || filename.includes('deed')) {
                  category = 'title';
                } else if (filename.includes('insurance') || filename.includes('policy')) {
                  category = 'insurance';
                } else if (filename.includes('license') || filename.includes('llc') || filename.includes('id')) {
                  category = 'borrower';
                } else if (filename.includes('loan') || filename.includes('application')) {
                  category = 'loan';
                }

                // Upload to Google Drive and create document record
                try {
                  const { uploadFileToGoogleDrive } = await import('./lib/google');
                  const loanData = await storage.getLoanWithDetails(loanId);
                  
                  if (loanData?.loan?.driveFolder) {
                    console.log(`Uploading ${attachment.filename} to Google Drive folder: ${loanData.loan.driveFolder}`);
                    
                    const driveFileId = await uploadFileToGoogleDrive(
                      attachment.filename,
                      data,
                      attachment.mimeType,
                      loanData.loan.driveFolder
                    );
                    
                    console.log(`Successfully uploaded ${attachment.filename} to Google Drive with ID: ${driveFileId}`);
                    
                    // Create document record with Google Drive file ID
                    await storage.createDocument({
                      name: attachment.filename,
                      fileId: driveFileId,
                      loanId: loanId,
                      fileType: attachment.mimeType,
                      fileSize: attachment.size,
                      category: category,
                      source: `gmail:${from}`,
                      status: 'processed'
                    });
                  } else {
                    // Fallback: create local document record if no Drive folder
                    await storage.createDocument({
                      name: attachment.filename,
                      fileId: fileId,
                      loanId: loanId,
                      fileType: attachment.mimeType,
                      fileSize: attachment.size,
                      category: category,
                      source: `gmail:${from}`,
                      status: 'processed'
                    });
                  }
                } catch (driveError) {
                  console.error(`Failed to upload ${attachment.filename} to Google Drive:`, driveError);
                  
                  // Create local document record as fallback
                  await storage.createDocument({
                    name: attachment.filename,
                    fileId: fileId,
                    loanId: loanId,
                    fileType: attachment.mimeType,
                    fileSize: attachment.size,
                    category: category,
                    source: `gmail:${from}`,
                    status: 'processed'
                  });
                }

                downloadedPDFs.push({
                  filename: attachment.filename,
                  emailSubject: subject,
                  size: attachment.size,
                  category: category
                });
                
                // Trigger auto-sync after PDF download
                await triggerAutoSync(loanId, "download", attachment.filename);
              } catch (downloadError) {
                console.error(`Failed to download PDF ${attachment.filename}:`, downloadError);
              }
            }
          }
        } catch (error) {
          console.error(`Error scanning message ${messageId} for attachments:`, error);
        }
      }

      res.json({
        success: true,
        message: `Scan complete! Found ${downloadedPDFs.length} PDFs across ${messageIds.length} emails.`,
        totalScanned: messageIds.length,
        pdfsFound: totalPDFs,
        downloaded: downloadedPDFs
      });

    } catch (error) {
      console.error('Error scanning visible emails for PDFs:', error);
      res.status(500).json({ message: "Error scanning visible emails for PDFs" });
    }
  });

  // Create HTTP server  
  const httpServer = createServer(app);
  
  return httpServer;
}
