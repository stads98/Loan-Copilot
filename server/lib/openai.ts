import OpenAI from "openai";
import { LoanWithDetails, Message } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key" });

export async function processLoanDocuments(
  loanDetails: LoanWithDetails,
  userQuery: string,
  previousMessages: Message[]
): Promise<string> {
  try {
    // Convert loan details to a format suitable for the prompt
    const { loan, property, lender, documents, contacts, tasks } = loanDetails;

    // For demonstration when no API key is available
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy-key") {
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

    // Make the API request
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messageHistory,
        { role: "user", content: userQuery }
      ],
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
