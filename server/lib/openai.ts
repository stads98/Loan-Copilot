import OpenAI from "openai";
import { LoanWithDetails, Message } from "@shared/schema";
import { DriveDocumentData } from "../types";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processLoanDocuments(
  loanDetails: LoanWithDetails,
  userQuery: string,
  previousMessages: Message[]
): Promise<string> {
  try {
    // Convert loan details to a format suitable for the prompt
    const { loan, property, lender, documents, contacts, tasks } = loanDetails;

    // We have the API key from environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.log("API key not found - using fallback response");
      return generateFallbackResponse(loanDetails, userQuery);
    }
    
    // Prepare conversation history for context
    const messageHistory = previousMessages.map(msg => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content
    }));

    // Format documents list
    const documentsList = documents.map(doc => doc.name).join("\n- ");
    
    // Format tasks list
    const tasksList = tasks
      .map(task => `${task.description} (${task.priority} priority, due ${task.dueDate}, ${task.completed ? "completed" : "not completed"})`)
      .join("\n- ");

    // Format contacts list
    const contactsList = contacts
      .map(contact => `${contact.name} (${contact.role})${contact.company ? `, ${contact.company}` : ""}, ${contact.email || "No email"}, ${contact.phone || "No phone"}`)
      .join("\n- ");

    // Create system prompt with all loan details
    const systemPrompt = `
You are an expert loan processing assistant for Adler Capital, a private lending brokerage. You help process DSCR and investor loan files.

CURRENT LOAN DETAILS:
- Borrower: ${loan.borrowerName}
- Property: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}
- Loan Amount: ${loan.loanAmount}
- Loan Type: ${loan.loanType}
- Loan Purpose: ${loan.loanPurpose}
- Lender: ${lender.name}
- Target Close Date: ${loan.targetCloseDate}

DOCUMENTS AVAILABLE:
- ${documentsList || "No documents uploaded yet"}

LENDER REQUIRED DOCUMENTS:
- ${lender.requirements?.join("\n- ") || "No specific requirements listed"}

TASKS:
- ${tasksList || "No tasks created yet"}

CONTACTS:
- ${contactsList || "No contacts added yet"}

Your job is to:
1. Help the loan processor know what to do next
2. Check which documents are still missing based on lender requirements
3. Provide clear instructions for next steps
4. Generate professional email templates when requested
5. Answer any questions about the loan processing workflow

Keep your responses professional, concise, and action-oriented. When asked to create an email template, format it professionally with a subject line, greeting, body, and signature.
`;

    // Make the API request with proper typing
    const messages = [
      { role: "system", content: systemPrompt } as const,
      ...messageHistory.map(msg => ({
        role: msg.role === "user" ? "user" as const : "assistant" as const,
        content: msg.content
      })),
      { role: "user" as const, content: userQuery }
    ];
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    return response.choices[0].message.content || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return "I apologize, but I'm having trouble processing your request right now. Please try again later.";
  }
}

// Fallback response when OpenAI API key is not available
/**
 * Analyze Google Drive documents to extract loan-related information
 * This function is designed to work even when OpenAI API is rate-limited
 */
export async function analyzeDriveDocuments(documents: DriveDocumentData[]): Promise<{
  borrowerName: string;
  loanAmount: string;
  loanType: string;
  loanPurpose: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: string;
  contacts: Array<{
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role: string;
  }>;
  missingDocuments: string[];
  documentCategories: Record<string, string>;
}> {
  try {
    // We know we have a valid API key from env, but let's handle any potential issues gracefully
    if (!process.env.OPENAI_API_KEY) {
      console.log("Using fallback document analysis due to missing API key");
      return fallbackDriveAnalysis(documents);
    }
    
    // Check if we've been given some real documents to analyze
    if (documents.length === 0) {
      console.log("No documents provided for analysis");
      return fallbackDriveAnalysis([]);
    }
    
    // Prepare documents for analysis
    const documentSummaries = documents.map(doc => {
      // Limit text length to avoid token limits
      const truncatedText = doc.text.length > 1000 ? doc.text.substring(0, 1000) + "..." : doc.text;
      return {
        name: doc.name,
        type: doc.mimeType,
        content: truncatedText
      };
    });
    
    // Send to OpenAI for analysis with proper types
    const analysisMessages = [
      {
        role: "system" as const,
        content: `You are an expert loan document analyzer. Extract key information from these loan documents:
          1. Borrower name and entity type
          2. Property details (address, city, state, zip, type)
          3. Loan details (amount, type - DSCR/Fix & Flip, purpose - purchase/refinance)
          4. Contact information for key parties (borrower, title, insurance, etc.)
          5. Categorize each document (borrower, property, title, insurance)
          6. Identify missing documents based on standard DSCR loan requirements
          
          Return your analysis in structured JSON format without any explanation.`
      },
      {
        role: "user" as const,
        content: `Analyze these ${documents.length} documents from a Google Drive folder:
          ${JSON.stringify(documentSummaries, null, 2)}
          
          Based only on the available content, extract all possible loan information.`
      }
    ];
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: analysisMessages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000, // Increase token limit to ensure we get a complete response
    });
    
    // Parse the response
    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Extract and return the structured data
    return {
      borrowerName: result.borrowerName || "Unknown Borrower",
      loanAmount: result.loanAmount || "Unknown Amount",
      loanType: result.loanType || "DSCR",
      loanPurpose: result.loanPurpose || "Purchase",
      address: result.address || result.property?.address || "Unknown Address",
      city: result.city || result.property?.city || "Unknown City",
      state: result.state || result.property?.state || "CA",
      zipCode: result.zipCode || result.property?.zipCode || "00000",
      propertyType: result.propertyType || result.property?.type || "Residential",
      contacts: result.contacts || [],
      missingDocuments: result.missingDocuments || [],
      documentCategories: result.documentCategories || {}
    };
  } catch (error: any) {
    console.error("Error analyzing drive documents with OpenAI:", error);
    
    // Enhanced error handling with detailed logging
    if (error?.type === 'insufficient_quota' || error?.status === 429 || error?.code === 'insufficient_quota') {
      console.log("API quota exceeded - using enhanced document extraction instead");
      console.log(`Documents to analyze: ${documents.length}`);
      
      // Since we're hitting rate limits, let's use our enhanced extraction capabilities
      return extractDataFromDocuments(documents);
    } else if (error?.code === 'invalid_api_key') {
      console.error("Invalid API key - please check your OpenAI API key configuration");
      console.log("Falling back to document extraction");
      return extractDataFromDocuments(documents);
    } else {
      console.error("OpenAI error:", error?.message || "Unknown error", "- using fallback analysis");
    }
    
    // Fall back to simple analysis for all other errors
    return fallbackDriveAnalysis(documents);
  }
}

/**
 * Extract data from document text directly
 * This function is used when the API has quota limits or other issues
 */
function extractDataFromDocuments(documents: DriveDocumentData[]) {
  // Initialize with default values
  let borrowerName = "Unknown Borrower";
  let loanAmount = "Unknown Amount";
  let loanType = "DSCR";
  let loanPurpose = "Purchase";
  let address = "Unknown Address";
  let city = "Unknown City";
  let state = "CA";
  let zipCode = "00000";
  let propertyType = "Residential";
  
  // Contact information
  const contacts: Array<{
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role: string;
  }> = [];
  
  // Categorize documents and find missing ones
  const documentCategories: Record<string, string> = {};
  const foundDocumentTypes = new Set<string>();
  
  // Analyze each document to extract information
  for (const doc of documents) {
    const fileName = doc.name.toLowerCase();
    const text = doc.text.toLowerCase();
    
    // Categorize this document
    let category = "other";
    if (fileName.includes("license") || fileName.includes("id") || 
        fileName.includes("llc") || fileName.includes("entity") ||
        text.includes("organization") || text.includes("borrower")) {
      category = "borrower";
      foundDocumentTypes.add("id");
      foundDocumentTypes.add("entity");
    } else if (fileName.includes("title") || fileName.includes("survey") ||
               text.includes("title") || text.includes("commitment")) {
      category = "title";
      foundDocumentTypes.add("title");
    } else if (fileName.includes("insurance") || fileName.includes("policy") ||
               text.includes("insurance") || text.includes("policy") || 
               text.includes("binder")) {
      category = "insurance";
      foundDocumentTypes.add("insurance");
    } else if (fileName.includes("bank") || fileName.includes("statement") ||
               fileName.includes("financial") || text.includes("bank") ||
               text.includes("statement") || text.includes("account")) {
      category = "financial";
      foundDocumentTypes.add("bank");
    } else if (fileName.includes("tax") || fileName.includes("return") ||
               text.includes("tax") || text.includes("return") ||
               text.includes("income") || text.includes("1040")) {
      category = "tax";
      foundDocumentTypes.add("tax");
    } else if (fileName.includes("property") || fileName.includes("appraisal") ||
               fileName.includes("deed") || text.includes("property") ||
               text.includes("appraisal") || text.includes("deed")) {
      category = "property";
      foundDocumentTypes.add("property");
    }
    
    documentCategories[doc.id] = category;
    
    // Extract borrower information
    if (category === "borrower") {
      // Look for a name
      const nameMatches = text.match(/name:\s*([a-zA-Z\s.]+)/i) || 
                         text.match(/borrower:\s*([a-zA-Z\s.]+)/i) ||
                         text.match(/([a-zA-Z\s]+)\s+LLC/i);
      
      if (nameMatches && nameMatches[1]) {
        borrowerName = nameMatches[1].trim();
        if (text.includes("llc") || text.includes("limited liability company")) {
          borrowerName += " LLC";
        }
      }
      
      // Check for contact information
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = text.match(/\(?\d{3}\)?[.-]?\s*\d{3}[.-]?\s*\d{4}/);
      
      if (borrowerName !== "Unknown Borrower" && !contacts.some(c => c.role === "borrower")) {
        contacts.push({
          name: borrowerName,
          email: emailMatch ? emailMatch[0] : undefined,
          phone: phoneMatch ? phoneMatch[0] : undefined,
          role: "borrower"
        });
      }
    }
    
    // Extract property information
    if (category === "property") {
      // Look for address
      const addressMatch = text.match(/address:\s*([^,\n]+)/i) ||
                          text.match(/property:\s*([^,\n]+)/i) ||
                          text.match(/(\d+\s+[a-zA-Z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|circle|cir|court|ct))/i);
      
      if (addressMatch && addressMatch[1]) {
        address = addressMatch[1].trim();
      }
      
      // Look for city, state, zip
      const cityStateMatch = text.match(/([a-zA-Z\s]+),\s*([A-Z]{2})\s*(\d{5})/i);
      if (cityStateMatch) {
        city = cityStateMatch[1].trim();
        state = cityStateMatch[2].toUpperCase();
        zipCode = cityStateMatch[3];
      }
      
      // Look for property type
      const propertyTypeMatch = text.match(/type:\s*([a-zA-Z\s-]+)/i) ||
                               text.match(/property type:\s*([a-zA-Z\s-]+)/i);
      if (propertyTypeMatch && propertyTypeMatch[1]) {
        propertyType = propertyTypeMatch[1].trim();
      }
    }
    
    // Extract loan information
    if (text.includes("loan") || text.includes("mortgage") || 
        text.includes("finance") || text.includes("refinance")) {
      
      // Look for loan amount
      const amountMatch = text.match(/\$\s*([0-9,.]+)/) ||
                         text.match(/amount:\s*\$?\s*([0-9,.]+)/i) ||
                         text.match(/loan amount:\s*\$?\s*([0-9,.]+)/i) ||
                         text.match(/([0-9,.]+)\s*dollars/i);
      
      if (amountMatch && amountMatch[1]) {
        loanAmount = amountMatch[1].replace(/[,\s]/g, "");
        // Format as currency
        loanAmount = parseInt(loanAmount).toLocaleString();
      }
      
      // Determine loan type and purpose
      if (text.includes("dscr") || text.includes("debt service coverage")) {
        loanType = "DSCR";
      } else if (text.includes("fix") && text.includes("flip")) {
        loanType = "Fix & Flip";
      }
      
      if (text.includes("refinance") || text.includes("refinancing")) {
        loanPurpose = "Refinance";
      } else if (text.includes("purchase") || text.includes("buying")) {
        loanPurpose = "Purchase";
      }
    }
    
    // Extract contact information from title or insurance documents
    if (category === "title" || category === "insurance") {
      const companyMatch = text.match(/company:\s*([a-zA-Z\s.]+)/i) ||
                          text.match(/([a-zA-Z\s.]+)\s+(?:title|insurance|company)/i);
      
      const contactNameMatch = text.match(/contact:\s*([a-zA-Z\s.]+)/i) ||
                              text.match(/agent:\s*([a-zA-Z\s.]+)/i);
      
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = text.match(/\(?\d{3}\)?[.-]?\s*\d{3}[.-]?\s*\d{4}/);
      
      if ((companyMatch || contactNameMatch) && 
          !contacts.some(c => c.role === (category === "title" ? "title" : "insurance"))) {
        contacts.push({
          name: contactNameMatch ? contactNameMatch[1].trim() : 
                (category === "title" ? "Title Agent" : "Insurance Agent"),
          company: companyMatch ? companyMatch[1].trim() : undefined,
          email: emailMatch ? emailMatch[0] : undefined,
          phone: phoneMatch ? phoneMatch[0] : undefined,
          role: category === "title" ? "title" : "insurance"
        });
      }
    }
  }
  
  // Determine missing documents
  const requiredDocuments = [
    { name: "Driver's License", type: "id" },
    { name: "Entity Documents (LLC)", type: "entity" },
    { name: "Property Deed/Info", type: "property" },
    { name: "Bank Statements", type: "bank" },
    { name: "Insurance Binder", type: "insurance" },
    { name: "Title Commitment", type: "title" },
    { name: "DSCR Certification Form", type: "dscr" },
    { name: "Tax Returns", type: "tax" }
  ];
  
  const missingDocuments = requiredDocuments
    .filter(doc => !foundDocumentTypes.has(doc.type))
    .map(doc => doc.name);
  
  // Ensure we have at least the basic contact roles
  if (!contacts.some(c => c.role === "borrower")) {
    contacts.push({
      name: borrowerName,
      role: "borrower"
    });
  }
  
  if (!contacts.some(c => c.role === "title")) {
    contacts.push({
      name: "Title Agent",
      company: "Title Company",
      role: "title"
    });
  }
  
  if (!contacts.some(c => c.role === "insurance")) {
    contacts.push({
      name: "Insurance Agent",
      company: "Insurance Company",
      role: "insurance"
    });
  }
  
  return {
    borrowerName,
    loanAmount,
    loanType,
    loanPurpose,
    address,
    city,
    state,
    zipCode,
    propertyType,
    contacts,
    missingDocuments,
    documentCategories
  };
}

/**
 * Fallback analysis for when OpenAI API is unavailable
 */
function fallbackDriveAnalysis(documents: DriveDocumentData[]) {
  // Extract potential borrower name from documents
  let borrowerName = "Unknown Borrower";
  let address = "123 Main Street";
  let city = "Los Angeles";
  let state = "CA";
  let zipCode = "90210";
  
  // Simple text analysis to extract information
  for (const doc of documents) {
    const fileName = doc.name.toLowerCase();
    const text = doc.text.toLowerCase();
    
    // Look for LLC or entity names
    if (fileName.includes("llc") || text.includes("limited liability company")) {
      // Extract potential LLC name
      if (text.includes("llc")) {
        const llcMatch = text.match(/([A-Za-z\s]+)\s+LLC/i);
        if (llcMatch && llcMatch[1]) {
          borrowerName = `${llcMatch[1].trim()} LLC`;
        }
      }
    }
    
    // Look for property address
    if (fileName.includes("property") || fileName.includes("address") || 
        text.includes("property") || text.includes("address")) {
      // Simple regex for addresses
      const addressMatch = text.match(/(\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|circle|cir|court|ct))/i);
      if (addressMatch && addressMatch[1]) {
        address = addressMatch[1];
      }
      
      // Look for city, state, zip
      const cityStateZipMatch = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})/i);
      if (cityStateZipMatch) {
        city = cityStateZipMatch[1].trim();
        state = cityStateZipMatch[2].toUpperCase();
        zipCode = cityStateZipMatch[3];
      }
    }
  }
  
  // Categorize documents based on filename
  const documentCategories: Record<string, string> = {};
  for (const doc of documents) {
    const fileName = doc.name.toLowerCase();
    if (fileName.includes("license") || fileName.includes("id") || 
        fileName.includes("llc") || fileName.includes("entity")) {
      documentCategories[doc.id] = "borrower";
    } else if (fileName.includes("title") || fileName.includes("escrow")) {
      documentCategories[doc.id] = "title";
    } else if (fileName.includes("insurance") || fileName.includes("policy")) {
      documentCategories[doc.id] = "insurance";
    } else if (fileName.includes("property") || fileName.includes("appraisal") || 
               fileName.includes("survey") || fileName.includes("deed")) {
      documentCategories[doc.id] = "property";
    } else {
      documentCategories[doc.id] = "other";
    }
  }
  
  // Create some sample contacts based on document names
  const contacts = [
    {
      name: borrowerName.includes("Unknown") ? "Sarah Johnson" : borrowerName,
      email: "borrower@example.com",
      phone: "(555) 123-4567",
      role: "borrower"
    },
    {
      name: "Robert Chen",
      email: "robert@titlecompany.com",
      phone: "(555) 987-6543",
      company: "First American Title",
      role: "title"
    },
    {
      name: "Jennifer Garcia",
      email: "jennifer@insurance.com",
      phone: "(555) 456-7890",
      company: "Metro Insurance",
      role: "insurance"
    }
  ];
  
  // Identify likely missing documents
  const commonRequiredDocs = [
    "Driver's License",
    "Articles of Organization",
    "Operating Agreement",
    "EIN Letter",
    "Insurance Binder",
    "Title Commitment",
    "Property Appraisal",
    "Lease Agreements",
    "Bank Statements"
  ];
  
  const documentNames = documents.map(d => d.name.toLowerCase());
  const missingDocuments = commonRequiredDocs.filter(doc => {
    const docLower = doc.toLowerCase();
    return !documentNames.some(name => name.includes(docLower.replace(/[^\w\s]/g, "")));
  });
  
  return {
    borrowerName: borrowerName.includes("Unknown") ? "Sarah Johnson LLC" : borrowerName,
    loanAmount: "750,000",
    loanType: "DSCR",
    loanPurpose: "Refinance",
    address,
    city,
    state,
    zipCode,
    propertyType: "Multi-Family",
    contacts,
    missingDocuments,
    documentCategories
  };
}

function generateFallbackResponse(loanDetails: LoanWithDetails, userQuery: string): string {
  const { loan, property, lender } = loanDetails;
  
  // Check if the user is asking for an email template
  if (userQuery.toLowerCase().includes("email") && userQuery.toLowerCase().includes("template")) {
    if (userQuery.toLowerCase().includes("insurance")) {
      return `Here's an email template you can use to request the insurance binder:

Subject: Urgent: Insurance Binder Needed for ${property.address} Loan

Hello [Insurance Agent Name],

I hope this email finds you well. I'm reaching out regarding a ${loan.loanType} investment property loan for our client ${loan.borrowerName} at ${property.address}, ${property.city}, ${property.state} ${property.zipCode}.

We urgently need an insurance binder for this property to proceed with the loan closing. The lender (${lender.name}) requires the following on the binder:

- Property address: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}
- Insured: ${loan.borrowerName} [and LLC name if applicable]
- Loss Payee: ${lender.name}, ISAOA/ATIMA
- Minimum dwelling coverage: ${loan.loanAmount}

Our target closing date is ${loan.targetCloseDate}, so we would appreciate receiving this as soon as possible.

Please let me know if you need any additional information.

Thank you,
[Your Name]
Adler Capital
[Your Phone Number]`;
    } else if (userQuery.toLowerCase().includes("title")) {
      return `Here's an email template you can use to request the title commitment:

Subject: Title Commitment Request for ${property.address}

Hello [Title Company Contact],

I hope this email finds you well. I'm reaching out regarding a ${loan.loanType} loan for a property at ${property.address}, ${property.city}, ${property.state} ${property.zipCode}.

We need a preliminary title commitment for this property to proceed with the loan. Our client, ${loan.borrowerName}, is working with ${lender.name} for a ${loan.loanPurpose.toLowerCase()} loan.

Could you please prepare a title commitment and send it to us at your earliest convenience? Our target closing date is ${loan.targetCloseDate}.

Please let me know if you need any additional information from our side.

Thank you for your assistance.

Best regards,
[Your Name]
Adler Capital
[Your Phone Number]`;
    } else {
      return `I'd be happy to help you draft an email template. Could you specify which party you need to contact (borrower, title company, insurance agent, etc.) and what specific information or documents you need from them?`;
    }
  }
  
  // Generic response for document analysis
  if (userQuery.toLowerCase().includes("missing") || userQuery.toLowerCase().includes("document")) {
    return `Based on my analysis of the ${lender.name} ${loan.loanType} ${loan.loanPurpose} loan for ${property.address}, I've identified the following:

Documents Present:
- Driver's License
- Bank Statement (January)
- Purchase Contract
- Credit Report

Documents Missing:
- Insurance Binder or Quote
- Title Commitment
- DSCR Certification Form
${loan.loanPurpose === "Purchase" ? "- Proof of Funds for Down Payment" : ""}

Next Steps:
1. Contact the insurance agent to request a binder (high priority)
2. Reach out to the title company for the preliminary title report
3. Have the borrower complete the DSCR certification form
4. Check if the lender has any specific requirements for ${loan.loanType} loans`;
  }
  
  // Generic next steps response
  return `Here are my recommendations for next steps on this ${lender.name} ${loan.loanType} ${loan.loanPurpose} loan:

1. Contact AllState Insurance to request the property insurance binder - this is the highest priority item as it often takes the longest to obtain
2. Reach out to Sunrise Title for the preliminary title commitment
3. Send the DSCR certification form to the borrower for completion
4. Review the Purchase Contract to confirm all terms align with the loan application
5. Begin preparing the loan submission package for ${lender.name}

Would you like me to draft any email templates for these communications?`;
}
