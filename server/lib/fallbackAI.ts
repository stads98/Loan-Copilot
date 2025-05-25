/**
 * Fallback AI Assistant for Loan Processing Co-Pilot
 * 
 * This module provides a local AI assistant that can respond to loan processing queries
 * without requiring an external API connection.
 */

import { LoanWithDetails, Message } from "@shared/schema";

interface FallbackResponse {
  content: string;
  sources?: string[];
}

// Knowledge base for DSCR loans
const dcsrLoanKnowledge = {
  documents: {
    required: [
      "Driver's License or ID",
      "Tax Returns (2 years)",
      "Bank Statements (2 months)",
      "Purchase Agreement (if purchase)",
      "Current Mortgage Statement (if refinance)",
      "Property Insurance Declaration",
      "Property Tax Bill",
      "Lease Agreement (if property is rented)",
      "DSCR Calculator Worksheet",
      "Business Formation Documents (if applicable)"
    ],
    insurance: [
      "HO-6 Policy (for condos)",
      "Flood Insurance (if in flood zone)",
      "Hazard Insurance",
      "Liability Insurance",
      "Property Insurance Declaration Page"
    ],
    title: [
      "Title Commitment",
      "Property Survey",
      "HOA Documents (if applicable)",
      "Property Deed",
      "Chain of Title"
    ],
    common_issues: [
      "Missing pages in tax returns",
      "Expired insurance policies",
      "Unclear property survey",
      "Unsigned documents",
      "Missing notarization",
      "Incomplete application forms",
      "Outdated bank statements"
    ]
  },
  
  processes: {
    initial_submission: [
      "Collect all borrower documents",
      "Complete loan application",
      "Run credit check",
      "Calculate DSCR ratio",
      "Submit to underwriting"
    ],
    conditional_approval: [
      "Address all underwriting conditions",
      "Order property appraisal",
      "Request title commitment",
      "Verify insurance coverage",
      "Finalize loan terms"
    ],
    closing: [
      "Review closing disclosure",
      "Schedule closing appointment",
      "Verify all conditions are cleared",
      "Confirm funds for closing",
      "Complete final walkthrough (if purchase)"
    ]
  },
  
  common_questions: {
    "what is dscr": "DSCR (Debt Service Coverage Ratio) is a measure used by lenders to determine if a property generates enough income to cover its mortgage payments. For investment properties, lenders typically require a DSCR of 1.25 or higher, meaning the property generates 25% more income than the debt payments.",
    "dscr calculation": "DSCR is calculated by dividing the annual net operating income (NOI) by the annual debt service. Formula: DSCR = NOI ÷ Annual Debt Service. A DSCR of 1.0 means the property's income exactly covers the debt payments.",
    "kiavi requirements": "Kiavi typically requires a minimum DSCR of 1.25, a minimum credit score of 660, and focuses on the property's income potential rather than the borrower's personal income. They also have specific requirements for property types and condition.",
    "document checklist": "The essential documents for a DSCR loan include: government ID, property details, purchase contract (if applicable), insurance information, entity documents (if using an LLC), and information about existing rental income or projected rental income.",
    "timeline": "The typical timeline for a DSCR loan is 2-3 weeks from application to closing, though this can vary based on property complexity and how quickly documents are provided.",
    "rates": "DSCR loan rates are typically 1-2% higher than conventional mortgage rates due to the higher risk profile of investment properties. Rates vary based on DSCR ratio, credit score, loan-to-value ratio, and property type."
  },
  
  templates: {
    title_agent_email: "Subject: Title Commitment Request for [Property Address]\n\nHello [Title Agent Name],\n\nI'm [Your Name] from [Your Company], and I'm working on a DSCR loan for the property at [Property Address]. We need to order a title commitment for this property.\n\nBorrower: [Borrower Name]\nProperty Address: [Property Address]\nLoan Type: DSCR Investment Property Loan\nTarget Closing Date: [Date]\n\nPlease provide the following:\n1. Title Commitment\n2. Property Survey (if available)\n3. Any HOA documents (if applicable)\n4. Any existing title issues that may affect closing\n\nPlease let me know if you need any additional information.\n\nThank you,\n[Your Name]\n[Your Contact Information]",
    
    insurance_request_email: "Subject: Insurance Requirements for DSCR Loan - [Property Address]\n\nHello [Insurance Agent Name],\n\nI'm working with [Borrower Name] on a DSCR investment property loan for [Property Address]. We need to ensure the property has adequate insurance coverage that meets our lender's requirements.\n\nRequired Coverage:\n1. Hazard Insurance with minimum coverage equal to the loan amount\n2. Liability Insurance with minimum coverage of $1,000,000\n3. Flood Insurance (if property is in flood zone)\n4. [Any additional requirements]\n\nLender must be listed as mortgagee:\n[Lender Name]\n[Lender Address]\nLoan #: [Loan Number]\n\nPlease provide a quote and declaration page that includes all required coverages. Our target closing date is [Date].\n\nThank you,\n[Your Name]\n[Your Contact Information]"
  }
};

/**
 * Generates a response to a user query based on loan details
 * This function simulates an AI assistant response without external API calls
 */
export function generateFallbackResponse(
  loanDetails: LoanWithDetails,
  userQuery: string
): FallbackResponse {
  // Convert query to lowercase for easier matching
  const query = userQuery.toLowerCase();
  
  // Check for document-related questions
  if (query.includes("document") || query.includes("checklist") || query.includes("need") || query.includes("missing")) {
    return generateDocumentResponse(loanDetails, query);
  }
  
  // Check for process/timeline related questions
  if (query.includes("next step") || query.includes("timeline") || query.includes("process") || query.includes("what should i do")) {
    return generateProcessResponse(loanDetails, query);
  }
  
  // Check for email template requests
  if (query.includes("email") || query.includes("template") || query.includes("message")) {
    return generateEmailTemplateResponse(loanDetails, query);
  }
  
  // Check for DSCR information questions
  if (query.includes("dscr") || query.includes("debt service") || query.includes("ratio") || query.includes("calculation")) {
    return generateDSCRInfoResponse(query);
  }
  
  // Handle general inquiries about the loan
  return generateGeneralLoanResponse(loanDetails, query);
}

function generateDocumentResponse(
  loanDetails: LoanWithDetails,
  query: string
): FallbackResponse {
  const { documents } = loanDetails;
  
  // Create lists of documents we have and might need
  const existingDocCategories = new Set(documents.map(doc => doc.category));
  const missingCategories = [];
  
  if (!existingDocCategories.has("borrower")) {
    missingCategories.push("borrower");
  }
  
  if (!existingDocCategories.has("title")) {
    missingCategories.push("title");
  }
  
  if (!existingDocCategories.has("insurance")) {
    missingCategories.push("insurance");
  }
  
  // Generate appropriate response based on query and loan state
  if (missingCategories.length > 0) {
    let response = "Based on the current loan file, you're missing some important document categories:\n\n";
    
    missingCategories.forEach(category => {
      response += `- ${category.charAt(0).toUpperCase() + category.slice(1)} Documents\n`;
      
      if (category === "borrower") {
        response += "  (Driver's License, Tax Returns, Bank Statements)\n";
      } else if (category === "title") {
        response += "  (Title Commitment, Property Survey, HOA Documents if applicable)\n";
      } else if (category === "insurance") {
        response += "  (Property Insurance Declaration, Flood Insurance if required)\n";
      }
    });
    
    response += "\nWould you like me to help you create a task list for obtaining these documents?";
    
    return { content: response };
  } else if (query.includes("checklist")) {
    return {
      content: "Here's a standard document checklist for DSCR loans:\n\n" +
        "**Borrower Documents:**\n" +
        dcsrLoanKnowledge.documents.required.map(doc => `- ${doc}`).join("\n") + 
        "\n\n**Insurance Documents:**\n" +
        dcsrLoanKnowledge.documents.insurance.map(doc => `- ${doc}`).join("\n") +
        "\n\n**Title Documents:**\n" +
        dcsrLoanKnowledge.documents.title.map(doc => `- ${doc}`).join("\n")
    };
  }
  
  return {
    content: "To proceed with this DSCR loan, make sure you have all necessary documentation from the borrower, title company, and insurance provider. Would you like me to provide a specific checklist for any of these categories?"
  };
}

function generateProcessResponse(
  loanDetails: LoanWithDetails,
  query: string
): FallbackResponse {
  const { loan, documents, tasks } = loanDetails;
  
  // Determine loan stage based on available information
  let stage = "initial_submission";
  const documentCount = documents.length;
  const completedTasksCount = tasks.filter(task => task.completed).length;
  
  if (documentCount >= 5 && completedTasksCount >= 3) {
    stage = "conditional_approval";
  }
  
  if (documentCount >= 10 && completedTasksCount >= 7) {
    stage = "closing";
  }
  
  // Generate response based on loan stage
  const nextSteps = dcsrLoanKnowledge.processes[stage];
  
  let response = `Based on the current status of this loan file, here are the next steps in the ${stage.replace('_', ' ')} phase:\n\n`;
  
  nextSteps.forEach((step, index) => {
    response += `${index + 1}. ${step}\n`;
  });
  
  if (stage === "initial_submission") {
    response += "\nFocus on collecting all required documents and calculating an accurate DSCR ratio before submission to underwriting.";
  } else if (stage === "conditional_approval") {
    response += "\nAddress any underwriting conditions promptly and ensure all third-party reports (appraisal, title) are ordered and received.";
  } else {
    response += "\nReview all closing documents carefully and ensure all final conditions are cleared before the closing date.";
  }
  
  return { content: response };
}

function generateEmailTemplateResponse(
  loanDetails: LoanWithDetails,
  query: string
): FallbackResponse {
  // Determine which template to provide based on query
  if (query.includes("title") || query.includes("commitment")) {
    return {
      content: "Here's a template for requesting a title commitment:\n\n" + 
        dcsrLoanKnowledge.templates.title_agent_email
    };
  }
  
  if (query.includes("insurance")) {
    return {
      content: "Here's a template for requesting insurance information:\n\n" + 
        dcsrLoanKnowledge.templates.insurance_request_email
    };
  }
  
  return {
    content: "I can provide email templates for various loan processing needs. Would you like a template for contacting a title agent, insurance agent, or something else?"
  };
}

function generateDSCRInfoResponse(query: string): FallbackResponse {
  // Match the query to our knowledge base
  for (const [key, value] of Object.entries(dcsrLoanKnowledge.common_questions)) {
    if (query.includes(key)) {
      return { content: value };
    }
  }
  
  return {
    content: "DSCR (Debt Service Coverage Ratio) is a key metric for investment property loans. It measures the property's ability to cover debt payments with its income. Would you like to know how to calculate DSCR, or what specific requirements lenders like Kiavi have for DSCR loans?"
  };
}

function generateGeneralLoanResponse(
  loanDetails: LoanWithDetails,
  query: string
): FallbackResponse {
  const { loan, property, tasks } = loanDetails;
  
  // Provide a summary of the loan file
  return {
    content: `This is a ${loan.loanType} loan for the property at ${property.address}, ${property.city}, ${property.state}. The borrower is ${loan.borrowerName} and the loan amount is ${loan.loanAmount || "not yet specified"}.\n\n` +
      `There are currently ${tasks.filter(t => !t.completed).length} open tasks on this file. The loan status is ${loan.status || "In Process"}.\n\n` +
      `How else can I assist you with this loan file? I can help with document checklists, process guidance, or email templates.`
  };
}

/**
 * Create a simulated assistant response to a user message
 * This function serves as the fallback when OpenAI API is unavailable
 */
export async function createFallbackAssistantResponse(
  loanDetails: LoanWithDetails,
  userMessage: string
): Promise<Message> {
  const response = generateFallbackResponse(loanDetails, userMessage);
  
  return {
    id: Math.floor(Math.random() * 1000000),
    content: response.content,
    role: "assistant",
    loanId: loanDetails.loan.id,
    createdAt: new Date()
  };
}