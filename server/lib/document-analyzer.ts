import OpenAI from "openai";
import { getDriveFiles } from "./google";
import { InsertLoan, InsertProperty, InsertContact, InsertTask, InsertDocument } from "../../shared/schema";
import { DocumentInfo, LoanInfo, PropertyInfo, ContactInfo, TaskInfo, DriveDocumentData } from "../types";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyze text from a document using OpenAI
 */
export async function analyzeDocumentText(text: string, documentName: string): Promise<any> {
  try {
    // Extract document type from name or content
    const documentType = determineDocumentType(documentName, text);
    
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert loan document analyzer specialized in DSCR real estate loans. 
          Your task is to extract key information from loan documents.
          Return your analysis in a structured JSON format with relevant fields.`
        },
        {
          role: "user",
          content: `This is a ${documentType} document titled "${documentName}". 
          Please analyze the following text and extract all relevant information.
          For documents containing personal information, extract borrower details, contacts, and property information.
          For financial documents, extract loan amounts, terms, and conditions.
          For property documents, extract property details, addresses, and valuation information.
          
          Document text:
          ${text}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      documentType,
      analysis: result
    };
  } catch (error) {
    console.error("Error analyzing document text:", error);
    throw new Error("Failed to analyze document text");
  }
}

/**
 * Analyze a batch of documents and extract comprehensive loan information
 */
export async function analyzeDriveDocuments(documents: DriveDocumentData[]): Promise<{
  loanInfo: LoanInfo;
  propertyInfo: PropertyInfo;
  contactInfo: ContactInfo[];
  taskInfo: TaskInfo[];
  documentInfo: DocumentInfo[];
  missingDocuments: string[];
}> {
  try {
    // Process each document to extract text and analyze
    const documentAnalyses = await Promise.all(
      documents.map(async (doc) => {
        const analysis = await analyzeDocumentText(doc.text, doc.name);
        return {
          name: doc.name,
          fileId: doc.id,
          fileType: doc.mimeType,
          fileSize: doc.size ? parseInt(doc.size, 10) : 0,
          analysis: analysis.analysis,
          documentType: analysis.documentType,
        };
      })
    );

    // Send the collective analyses to OpenAI to extract structured information
    const summarizationResponse = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an expert loan processor who organizes information from loan documents.
          Your task is to analyze multiple document analyses and consolidate them into comprehensive loan information.
          Return your consolidated information in JSON format with specific sections.`
        },
        {
          role: "user",
          content: `I've analyzed the following loan documents from a Google Drive folder. 
          Based on these analyses, please extract and organize:
          
          1. Loan information (borrowerName, loanAmount, loanType, loanPurpose, status, targetCloseDate)
          2. Property information (address, city, state, zipCode, propertyType)
          3. Contact information (array of contacts with name, email, phone, company, role)
          4. Tasks that need to be completed (array of tasks with description, dueDate, priority)
          5. Document information (what documents were found and their categories)
          6. Missing documents (what standard loan documents are missing)
          
          Here are the document analyses:
          ${JSON.stringify(documentAnalyses, null, 2)}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const consolidatedInfo = JSON.parse(summarizationResponse.choices[0].message.content || "{}");
    
    return {
      loanInfo: consolidatedInfo.loanInfo || {},
      propertyInfo: consolidatedInfo.propertyInfo || {},
      contactInfo: consolidatedInfo.contactInfo || [],
      taskInfo: consolidatedInfo.taskInfo || [],
      documentInfo: consolidatedInfo.documentInfo || [],
      missingDocuments: consolidatedInfo.missingDocuments || []
    };
  } catch (error) {
    console.error("Error analyzing drive documents:", error);
    throw new Error("Failed to analyze drive documents");
  }
}

/**
 * Determine the type of document based on name and content
 */
function determineDocumentType(documentName: string, text: string): string {
  const name = documentName.toLowerCase();
  
  // Check document name for clues
  if (name.includes("driver") && (name.includes("license") || name.includes("licence"))) {
    return "Driver's License";
  } else if (name.includes("ein") || name.includes("tax id")) {
    return "EIN Document";
  } else if (name.includes("article") && name.includes("organization")) {
    return "Articles of Organization";
  } else if (name.includes("operating") && name.includes("agreement")) {
    return "Operating Agreement";
  } else if (name.includes("lease") || name.includes("rental agreement")) {
    return "Lease Agreement";
  } else if (name.includes("title") && (name.includes("report") || name.includes("preliminary"))) {
    return "Title Report";
  } else if (name.includes("insurance") || name.includes("policy")) {
    return "Insurance Policy";
  } else if (name.includes("bank") && name.includes("statement")) {
    return "Bank Statement";
  } else if (name.includes("loan") && name.includes("application")) {
    return "Loan Application";
  } else if (name.includes("credit") && name.includes("report")) {
    return "Credit Report";
  } else if (name.includes("deed") || name.includes("trust")) {
    return "Deed of Trust";
  } else if (name.includes("appraisal")) {
    return "Property Appraisal";
  } else if (name.includes("tax") && name.includes("return")) {
    return "Tax Return";
  } else if (name.includes("income") && name.includes("verification")) {
    return "Income Verification";
  } else if (name.includes("purchase") && name.includes("agreement")) {
    return "Purchase Agreement";
  } else if (name.includes("certificate") && (name.includes("good standing") || name.includes("existence"))) {
    return "Certificate of Good Standing";
  }
  
  // Fallback to content analysis
  const content = text.toLowerCase();
  if (content.includes("driver") && content.includes("license")) {
    return "Driver's License";
  } else if (content.includes("employer identification number") || content.includes("ein")) {
    return "EIN Document";
  } else if (content.includes("articles of organization") || content.includes("certificate of formation")) {
    return "Articles of Organization";
  } else if (content.includes("operating agreement")) {
    return "Operating Agreement";
  } else if (content.includes("lease agreement") || content.includes("rental agreement")) {
    return "Lease Agreement";
  } else if (content.includes("title report") || content.includes("title commitment")) {
    return "Title Report";
  } else if (content.includes("insurance policy") || content.includes("coverage")) {
    return "Insurance Policy";
  }
  
  // Default
  return "General Document";
}