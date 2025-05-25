/**
 * OCR (Optical Character Recognition) functionality for processing scanned documents
 * Uses OpenAI's vision capabilities to extract text from images
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";
import https from "https";
import { promisify } from "util";
import os from "os";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Download a file from a URL to a temporary location
 */
async function downloadFile(url: string): Promise<string> {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `document-${Date.now()}.pdf`);
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempFile);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(tempFile);
      });
    }).on('error', (err) => {
      fs.unlink(tempFile, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

/**
 * Convert image to base64
 */
function imageToBase64(filepath: string): string {
  const data = fs.readFileSync(filepath);
  return data.toString('base64');
}

/**
 * Extract text from an image using OpenAI's vision capabilities
 */
export async function extractTextFromImage(imageUrl: string): Promise<string> {
  try {
    // First download the image to a temporary file
    const tempFilePath = await downloadFile(imageUrl);
    
    // Convert to base64
    const base64Image = imageToBase64(tempFilePath);
    
    // Use OpenAI's vision capabilities to extract text
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an OCR assistant. Extract all text from the image in a clean, readable format. Preserve paragraphs, lists, and tables as much as possible."
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Please extract all text from this document image:" 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });
    
    // Clean up temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (err) {
      console.error("Error deleting temporary file:", err);
    }
    
    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("Error extracting text from image:", error);
    return "";
  }
}

/**
 * Determine if a file is likely a scanned document based on mime type
 */
export function isScannedDocument(mimeType: string): boolean {
  return mimeType.includes('image/') || 
         mimeType.includes('application/pdf') ||
         mimeType.includes('image-');
}

/**
 * Process a document that might be scanned, extracting its text
 */
export async function processDocumentWithOCR(fileUrl: string, mimeType: string): Promise<string> {
  if (isScannedDocument(mimeType)) {
    return await extractTextFromImage(fileUrl);
  }
  
  // For non-scanned documents, return empty string
  // The caller will need to use Google Drive API to get the text content
  return "";
}