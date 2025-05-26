import OpenAI from "openai";
import { getRequirementsForFunder } from "./document-requirements";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface LoanAnalysisRequest {
  lender: string;
  loanPurpose: string;
  uploadedDocuments: string[];
  contactDetails?: {
    titleAgent?: string;
    insuranceAgent?: string;
    currentLender?: string;
  };
  propertyAddress: string;
  borrowerName: string;
}

interface LoanAnalysisResponse {
  providedDocuments: string[];
  missingDocuments: string[];
  nextSteps: string[];
  recommendedEmails: {
    recipient: string;
    subject: string;
    body: string;
  }[];
}

/**
 * DSCR Loan Processing Assistant
 * Analyzes loan files and provides guidance like a senior loan processor
 */
export async function analyzeLoanFile(request: LoanAnalysisRequest): Promise<LoanAnalysisResponse> {
  const systemPrompt = `You are a DSCR Loan Processing Assistant at Adler Capital.

Your job is to help a junior processor manage and complete loan files being submitted to lenders like Kiavi, Roc Capital, Visio, and AHL.

You will receive:
- The lender name
- Loan purpose (Purchase, Refi, Cash-Out)
- A list of uploaded document filenames
- Contact details (if available)
- Property address

Your tasks:
1. Match uploaded docs against the required checklist for that lender.
2. Identify what's missing.
3. Suggest clear next steps for the processor.
4. Recommend who to contact (title agent, insurance agent, borrower, current lender).
5. Generate email drafts that the processor can copy and send.

Use this checklist as your reference:

---

🟢 REQUIRED ON ALL FILES:
- Completed Roc Capital Background/Credit Link (if Roc)
- Driver's License (front and back)
- Articles of Organization / Incorporation
- Operating Agreement
- Certificate of Good Standing
- EIN Letter from IRS
- Appraisal (must be ordered through AMC and confirmed by phone for fairness)
- Insurance Policy
- Insurance Agent Contact Info (name, email, phone)
- Flood Policy (if applicable)
- Flood Insurance Agent Contact Info (if applicable)
- Title Agent Contact Info (name, email, phone)
- Current Lender Contact Info (if property has a mortgage – for payoff and VOM)
- HUD or proof of property ownership
- All current leases
- Voided check
- 2 most recent bank statements

---

KIAVI-SPECIFIC:
- Signed Borrowing Authorization Form (from portal)
- Signed Disclosure Form (from portal)

VISIO-SPECIFIC:
- VFS Loan Application
- Broker Submission Form
- Broker W9
- Proof of liquidity via Plaid
- Rent collection deposits (if lease rents exceed market)

ROC CAPITAL-SPECIFIC:
- ACH Consent Form
- Proof of Receipt of Security Deposit (<30-day leases)
- Property Tax Document
- Proof of 3 months rent collection (all units)

AHL-SPECIFIC:
- Entity Resolution (using AHL template)
- Borrower's Statement of Business Purpose (using AHL template)
- VOM (12 months payment history from current lender)
- 2 Recent Mortgage Statements (for any reported open mortgages)
- Proof of liquidity
- 6 months PITI reserves

---

When you respond:
- Begin with ✅ Provided Documents and ❌ Missing Documents
- Then list 📋 Next Steps
- Then suggest ✉️ Draft Emails to each party as needed (title, insurance, borrower, payoff lender)
- Return your response in JSON format with the structure: {
  "providedDocuments": ["doc1", "doc2"],
  "missingDocuments": ["missing1", "missing2"],
  "nextSteps": ["step1", "step2"],
  "recommendedEmails": [{"recipient": "title agent", "subject": "subject", "body": "email body"}]
}

Be concise, clear, and guide the junior processor like a highly competent team lead.`;

  const userPrompt = `Please analyze this loan file:

Lender: ${request.lender}
Loan Purpose: ${request.loanPurpose}
Property Address: ${request.propertyAddress}
Borrower Name: ${request.borrowerName}

Uploaded Documents:
${request.uploadedDocuments.map(doc => `- ${doc}`).join('\n')}

Contact Details:
${request.contactDetails?.titleAgent ? `Title Agent: ${request.contactDetails.titleAgent}` : 'Title Agent: Not provided'}
${request.contactDetails?.insuranceAgent ? `Insurance Agent: ${request.contactDetails.insuranceAgent}` : 'Insurance Agent: Not provided'}
${request.contactDetails?.currentLender ? `Current Lender: ${request.contactDetails.currentLender}` : 'Current Lender: Not provided'}

Please provide your analysis in JSON format.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      providedDocuments: analysis.providedDocuments || [],
      missingDocuments: analysis.missingDocuments || [],
      nextSteps: analysis.nextSteps || [],
      recommendedEmails: analysis.recommendedEmails || []
    };

  } catch (error) {
    console.error('Error analyzing loan file:', error);
    throw new Error('Failed to analyze loan file');
  }
}

/**
 * Generate lender-specific priority action items
 */
export function generateLenderSpecificActions(
  loanDetails: any,
  missingDocuments: string[]
): string[] {
  const funder = loanDetails.funder?.toLowerCase();
  const loanPurpose = loanDetails.loanPurpose?.toLowerCase();
  const actions: string[] = [];

  // Base actions for all lenders
  if (missingDocuments.includes("Insurance Policy") || missingDocuments.includes("insurance_policy")) {
    actions.push("Contact insurance agent immediately - insurance binder required for all lenders");
  }

  if (missingDocuments.includes("Appraisal") || missingDocuments.includes("appraisal")) {
    actions.push("Order appraisal through approved AMC - call to confirm valuation expectations");
  }

  // Lender-specific priority actions
  switch (funder) {
    case 'kiavi':
      if (missingDocuments.some(doc => doc.includes("Authorization") || doc.includes("Disclosure"))) {
        actions.push("URGENT: Access Kiavi portal and download signed Authorization & Disclosure forms");
      }
      if (missingDocuments.includes("Title") || missingDocuments.includes("title_contact")) {
        actions.push("Send Kiavi title requirements immediately - specific ALTA endorsements required");
      }
      if (loanPurpose === "refinance" && missingDocuments.includes("Payoff")) {
        actions.push("Request payoff statement from current lender with per diem interest");
      }
      actions.push("Confirm AMC appraisal meets Kiavi valuation guidelines");
      break;

    case 'ahl':
      if (missingDocuments.some(doc => doc.includes("Entity Resolution") || doc.includes("Business Purpose"))) {
        actions.push("CRITICAL: Download AHL-specific Entity Resolution and Business Purpose forms from portal");
      }
      if (missingDocuments.includes("PITI Reserves")) {
        actions.push("Document 6 months PITI reserves - AHL requires verified proof of liquidity");
      }
      if (missingDocuments.includes("VOM")) {
        actions.push("Request 12-month payment history VOM from current lender - AHL requirement");
      }
      actions.push("Verify all mortgage statements match credit report for AHL background check");
      break;

    case 'visio':
      if (missingDocuments.some(doc => doc.includes("VFS") || doc.includes("Broker"))) {
        actions.push("Complete VFS Loan Application and Broker Submission Form immediately");
      }
      if (missingDocuments.includes("Plaid")) {
        actions.push("Set up Plaid connection for proof of liquidity - Visio requires automated verification");
      }
      if (missingDocuments.includes("Rent Collection")) {
        actions.push("Provide rent roll and collection proof if lease rents exceed market rates");
      }
      actions.push("Submit Broker W9 for Visio processing");
      break;

    case 'roc_capital':
      if (missingDocuments.includes("Background") || missingDocuments.includes("Credit Link")) {
        actions.push("IMMEDIATE: Complete ROC Capital background/credit check link - cannot proceed without");
      }
      if (missingDocuments.includes("ACH Consent")) {
        actions.push("Execute ACH Consent Form for ROC Capital funding");
      }
      if (missingDocuments.includes("Property Tax")) {
        actions.push("Pull property tax document from county website for ROC submission");
      }
      if (missingDocuments.includes("3 Months Rent")) {
        actions.push("Provide 3 months rent collection proof for all units - ROC requirement");
      }
      if (missingDocuments.includes("Security Deposit")) {
        actions.push("Document security deposit receipts for leases under 30 days old");
      }
      break;

    case 'velocity':
      // Velocity-specific actions (add as requirements are provided)
      if (missingDocuments.includes("Title")) {
        actions.push("Coordinate with title agent for Velocity-specific requirements");
      }
      break;

    default:
      actions.push("Review lender-specific requirements for this funder");
  }

  // Common final actions
  if (actions.length === 0) {
    actions.push("All major documents appear complete - review for final submission readiness");
  }

  return actions.slice(0, 5); // Limit to top 5 priority actions
}

/**
 * Generate email drafts for missing documents
 */
export async function generateMissingDocumentEmails(
  loanDetails: any,
  missingDocuments: string[]
): Promise<{ recipient: string; subject: string; body: string }[]> {
  
  const emailPrompt = `You are a professional loan processor. Generate email drafts to request missing documents for this loan:

Property: ${loanDetails.propertyAddress}
Borrower: ${loanDetails.borrowerName}
Lender: ${loanDetails.funder}
Loan Purpose: ${loanDetails.loanPurpose}

Missing Documents:
${missingDocuments.map(doc => `- ${doc}`).join('\n')}

Generate professional, concise email drafts for the appropriate recipients (borrower, title agent, insurance agent, current lender). Use a helpful but professional tone.

Return the response in JSON format with this structure:
{
  "emails": [
    {
      "recipient": "borrower",
      "subject": "Missing Documents Required - [Property Address]",
      "body": "Email content here"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "user", content: emailPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"emails": []}');
    return result.emails || [];

  } catch (error) {
    console.error('Error generating email drafts:', error);
    return [];
  }
}

/**
 * Smart document categorization based on filename
 */
export function categorizeDocument(filename: string): {
  category: string;
  confidence: number;
  matchedRequirement?: string;
} {
  const filename_lower = filename.toLowerCase();
  
  // Driver's License patterns
  if (/driver|license|dl|id/.test(filename_lower)) {
    return { category: "borrower_entity", confidence: 0.9, matchedRequirement: "drivers_license" };
  }
  
  // Articles of Organization
  if (/article|organization|incorporation|llc|corp/.test(filename_lower)) {
    return { category: "borrower_entity", confidence: 0.85, matchedRequirement: "articles_org" };
  }
  
  // Operating Agreement
  if (/operating|agreement/.test(filename_lower)) {
    return { category: "borrower_entity", confidence: 0.85, matchedRequirement: "operating_agreement" };
  }
  
  // Bank Statements
  if (/bank|statement|checking|savings/.test(filename_lower)) {
    return { category: "financials", confidence: 0.8, matchedRequirement: "bank_statements" };
  }
  
  // Insurance
  if (/insurance|policy|coverage|binder/.test(filename_lower)) {
    return { category: "insurance", confidence: 0.8, matchedRequirement: "insurance_policy" };
  }
  
  // Appraisal
  if (/appraisal|valuation|bpo/.test(filename_lower)) {
    return { category: "appraisal", confidence: 0.9, matchedRequirement: "appraisal" };
  }
  
  // Lease
  if (/lease|rental|rent/.test(filename_lower)) {
    return { category: "property", confidence: 0.8, matchedRequirement: "current_leases" };
  }
  
  // Title documents
  if (/title|deed|hud|settlement/.test(filename_lower)) {
    return { category: "title", confidence: 0.8, matchedRequirement: "property_ownership" };
  }
  
  return { category: "unknown", confidence: 0.1 };
}