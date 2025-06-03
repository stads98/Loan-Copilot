import { Request, Response } from 'express';
import { google } from 'googleapis';

// Get the correct domain for OAuth redirect
const getRedirectUri = () => {
  // Use REPLIT_DOMAINS which contains the actual domain
  if (process.env.REPLIT_DOMAINS) {
    const uri = `https://${process.env.REPLIT_DOMAINS}/api/auth/google/callback`;
    console.log('Using REPLIT_DOMAINS redirect URI:', uri);
    return uri;
  }
  // Check if we're in Replit environment
  if (process.env.REPLIT_DEV_DOMAIN) {
    const uri = `${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
    console.log('Using REPLIT_DEV_DOMAIN redirect URI:', uri);
    return uri;
  }
  // Check for other environment variables that might contain the correct URL
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    const uri = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/auth/google/callback`;
    console.log('Using REPL_SLUG/REPL_OWNER redirect URI:', uri);
    return uri;
  }
  // Fallback to localhost for development
  const uri = 'http://localhost:5000/api/auth/google/callback';
  console.log('Using localhost fallback redirect URI:', uri);
  return uri;
};

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  getRedirectUri()
);

// Generate OAuth URL for user consent
export function getGoogleAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

// Handle OAuth callback and store tokens
export async function handleGoogleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.query;
    
    if (!code) {
      res.status(400).json({ error: 'Authorization code not provided' });
      return;
    }

    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Store tokens in session
    req.session.googleTokens = tokens;

    console.log('Google OAuth tokens stored successfully');
    res.redirect('/?auth=success');
    
  } catch (error) {
    console.error('Error handling Google callback:', error);
    res.redirect('/?auth=error');
  }
}

// Get authenticated Google Drive client
export function getAuthenticatedDriveClient(tokens: any) {
  oauth2Client.setCredentials(tokens);
  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Upload file to Google Drive with OAuth
export async function uploadFileToGoogleDriveOAuth(
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderId: string,
  tokens: any
): Promise<string> {
  try {
    const drive = getAuthenticatedDriveClient(tokens);
    
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: mimeType,
        body: require('stream').Readable.from(fileBuffer)
      },
      fields: 'id'
    });

    console.log(`File uploaded to Google Drive with OAuth: ${response.data.id}`);
    return response.data.id!;
    
  } catch (error) {
    console.error('Error uploading file with OAuth:', error);
    throw new Error(`Could not upload file to Google Drive: ${error}`);
  }
}

// List files in Google Drive folder with OAuth
export async function listGoogleDriveFilesOAuth(folderId: string, tokens: any) {
  try {
    const drive = getAuthenticatedDriveClient(tokens);
    
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      pageSize: 1000
    });

    return response.data.files || [];
    
  } catch (error) {
    console.error('Error listing Drive files with OAuth:', error);
    throw new Error(`Could not list Google Drive files: ${error}`);
  }
}