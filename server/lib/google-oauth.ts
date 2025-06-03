import { Request, Response } from 'express';
import { google } from 'googleapis';

// Force the correct redirect URI for Replit environment
const REDIRECT_URI = 'https://0007b75f-d504-4d28-927e-2b1824d99bb5-00-2pydj6ryedxd2.picard.replit.dev/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// Generate OAuth URL for user consent
export function getGoogleAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
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