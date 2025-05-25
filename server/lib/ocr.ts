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
 * Implements proper rate limit handling with exponential backoff
 */
export async function extractTextFromImage(imageUrl: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is required for OCR functionality");
  }

  try {
    // First download the image to a temporary file
    const tempFilePath = await downloadFile(imageUrl);
    
    // Convert to base64
    const base64Image = imageToBase64(tempFilePath);
    
    // Prepare the messages for the API call
    const messages = [
      {
        role: "system" as const,
        content: "You are an OCR assistant. Extract all text from the image in a clean, readable format. Preserve paragraphs, lists, and tables as much as possible."
      },
      {
        role: "user" as const,
        content: [
          { 
            type: "text" as const, 
            text: "Please extract all text from this document image:" 
          },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ];
    
    // Implement rate limit handling with exponential backoff
    const maxRetries = 5;
    let retryCount = 0;
    let delayMs = 5000; // Start with 5 seconds
    
    while (true) {
      try {
        // If this isn't our first attempt, log that we're retrying
        if (retryCount > 0) {
          console.log(`Attempting OCR retry ${retryCount}...`);
        }
        
        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages,
        });
        
        // Clean up temporary file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (err) {
          console.error("Error deleting temporary file:", err);
        }
        
        // If successful, return the extracted text
        return response.choices[0].message.content || "";
      } catch (error: any) {
        console.error("Error in OCR API call:", error);
        
        // Check if it's a rate limit error
        if (error?.status === 429 || error?.type === 'insufficient_quota' || error?.code === 'insufficient_quota') {
          retryCount++;
          
          // If we've exceeded our retry limit, throw an error
          if (retryCount > maxRetries) {
            // Make sure to clean up the temp file before throwing
            try {
              fs.unlinkSync(tempFilePath);
            } catch (err) {
              console.error("Error deleting temporary file:", err);
            }
            
            throw new Error("Failed to process OCR after maximum retry attempts due to rate limits. Please try again later.");
          }
          
          // Log the retry attempt
          console.log(`OCR rate limit encountered. Retry attempt ${retryCount}/${maxRetries} after ${delayMs/1000} seconds...`);
          
          // Wait for the exponential backoff period
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          // Increase the delay for the next retry (exponential backoff)
          delayMs *= 2;
          
          // Continue to the next iteration of the loop
          continue;
        }
        
        // For any other types of errors, clean up and throw
        try {
          fs.unlinkSync(tempFilePath);
        } catch (err) {
          console.error("Error deleting temporary file:", err);
        }
        
        throw new Error(`OpenAI OCR error: ${error?.message || "Unknown error"}`);
      }
    }
  } catch (error: any) {
    console.error("Error in OCR processing:", error);
    throw error;
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