import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  
  // Start automatic email scanning every minute
  setInterval(async () => {
    try {
      // Get all loans that might need email scanning
      const { storage } = await import('./db-storage');
      
      // For demonstration, scan loan 35 (Samuel Anicette's loan)
      // In production, you'd loop through all active loans
      const loanId = 35;
      const loan = await storage.getLoanWithDetails(loanId);
      
      if (!loan) return;
      
      console.log(`[Auto-scan] Checking for new emails for loan ${loanId}...`);
      
      // Import Gmail utilities
      const { google } = await import('googleapis');
      const { createGmailAuth } = await import("./lib/gmail");
      const { pool } = await import('./db');
      
      // Get Gmail tokens from database
      const tokensResult = await pool.query(
        'SELECT access_token, refresh_token FROM user_tokens WHERE service = $1 AND user_id = $2', 
        ['gmail', 1]
      );
      
      if (tokensResult.rows.length === 0) {
        return; // No Gmail connection
      }
      
      const tokens = tokensResult.rows[0];
      const gmail = google.gmail('v1');
      const gmailAuth = createGmailAuth(tokens.access_token, tokens.refresh_token);
      
      // Quick check for new messages (last 10 messages)
      const listResponse = await gmail.users.messages.list({
        auth: gmailAuth,
        userId: 'me',
        maxResults: 10,
        q: 'in:inbox'
      });
      
      if (!listResponse.data.messages) return;
      
      let newPDFsFound = 0;
      
      // Check recent messages for PDFs
      for (const message of listResponse.data.messages.slice(0, 5)) { // Check last 5 messages
        try {
          const msgResponse = await gmail.users.messages.get({
            auth: gmailAuth,
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']
          });
          
          const headers = msgResponse.data.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value?.toLowerCase() || '';
          
          // Check if message is relevant to this loan
          const propertyAddress = loan.loan?.propertyAddress?.split(',')[0]?.trim()?.toLowerCase() || '';
          const loanNumber = loan.loan?.loanNumber || '';
          const borrowerName = loan.loan?.borrowerName?.toLowerCase() || '';
          
          const isRelevant = (propertyAddress && subject.includes(propertyAddress)) || 
                           (loanNumber && subject.includes(loanNumber)) || 
                           (borrowerName && subject.includes(borrowerName));
          
          if (isRelevant) {
            // Get full message to check for PDF attachments
            const fullMessage = await gmail.users.messages.get({
              auth: gmailAuth,
              userId: 'me',
              id: message.id!,
              format: 'full'
            });
            
            const parts = fullMessage.data.payload?.parts || [];
            const hasPDF = parts.some(part => 
              part.filename && part.mimeType?.includes('pdf')
            );
            
            if (hasPDF) {
              console.log(`[Auto-scan] Found new PDF in recent email: ${subject}`);
              newPDFsFound++;
            }
          }
        } catch (error) {
          // Skip errors for individual messages
        }
      }
      
      if (newPDFsFound > 0) {
        console.log(`[Auto-scan] Found ${newPDFsFound} new PDFs - triggering full scan`);
        // Here you could trigger a full scan or notify the user
      }
      
    } catch (error) {
      // Silent fail for auto-scan to avoid spamming logs
    }
  }, 60000); // Every 60 seconds
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    log(`Auto email scanning enabled - checking every minute for new PDFs`);
  });
})();
