import { google } from 'googleapis';

const gmail = google.gmail('v1');

interface EmailData {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: {
    filename: string;
    mimeType: string;
    data: Buffer;
  }[];
}

export async function sendGmailEmail(auth: any, emailData: EmailData): Promise<boolean> {
  try {
    const { to, cc, subject, body, attachments = [] } = emailData;

    // Create the email message headers
    const headers = [
      `To: ${to.join(', ')}`,
    ];
    
    if (cc && cc.length > 0) {
      headers.push(`Cc: ${cc.join(', ')}`);
    }
    
    headers.push(`Subject: ${subject}`);

    // Create the email message
    let message = [
      ...headers,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\n');

    // If there are attachments, we need to create a multipart message
    if (attachments.length > 0) {
      const boundary = `boundary_${Date.now()}`;
      
      message = [
        `To: ${to.join(', ')}`,
        `Subject: ${subject}`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
        ''
      ].join('\n');

      // Add each attachment
      for (const attachment of attachments) {
        message += [
          `--${boundary}`,
          `Content-Type: ${attachment.mimeType}`,
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          'Content-Transfer-Encoding: base64',
          '',
          attachment.data.toString('base64'),
          ''
        ].join('\n');
      }

      message += `--${boundary}--`;
    }

    // Encode the message in base64url format
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send the email
    const response = await gmail.users.messages.send({
      auth,
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log('Email sent successfully:', response.data.id);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export function getGmailAuthUrl(clientId: string, redirectUri: string): string {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
}

export async function getGmailTokens(code: string, clientId: string, redirectUri: string) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function createGmailAuth(accessToken: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}