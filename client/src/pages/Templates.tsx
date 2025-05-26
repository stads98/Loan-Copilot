import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface TemplatesProps {
  user: any;
  onLogout: () => void;
}

// Template categories
const templateCategories = [
  { id: "borrower", name: "Borrower" },
  { id: "title", name: "Title Agent" },
  { id: "insurance", name: "Insurance" },
  { id: "lender", name: "Existing Lender" },
];

// Pre-defined email templates
const emailTemplates = [
  {
    id: 1,
    category: "borrower",
    title: "Initial Required Items",
    subject: "{PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) - Required Items",
    body: `Hi {BORROWER_NAME},

Please sign/date the attached borrowing authorization form and disclosure form, and please return them to me as soon as possible to get the file into processing.

Afterwards, please share or upload the following documents/information to the secure portal below at your earliest convenience.

{SECURE_PORTAL_LINK}

HUD (or Deed to show property ownership)
2 recent bank statements
Voided Check
All Current Leases 
Insurance Certificate and Proof of Premium Payment
Insurance Agent Info (Name, Email, Phone)
Title/Closing Agent Info (Name, Email, Phone)
Payoff Letter from Existing Lenders (or if owned free and clear please specify here)
Existing Lender Contact Info (Name, Email, Phone)
LLC Docs:
Articles of Organization
Operating Agreement
Certificate of Good Standing
EIN Letter

Please let me know if you have any questions or would like to discuss any of the above items.

Thanks,
{PROCESSOR_NAME}`,
  },
  {
    id: 2,
    category: "borrower",
    title: "Missing Documents Reminder",
    subject: "URGENT: Missing Documents for Your Loan Application",
    body: `Dear {BORROWER_NAME},

I hope this email finds you well. I'm writing regarding your DSCR loan application for {PROPERTY_ADDRESS}.

Our underwriting team has reviewed your file and noted that we still need the following documents to proceed:

{MISSING_DOCUMENTS}

Without these documents, we cannot move forward with your loan. Please submit them at your earliest convenience.

Let me know if you have any questions or need assistance gathering these documents.

Thank you for your prompt attention to this matter.

Best regards,
{PROCESSOR_NAME}
Loan Processor
{COMPANY_NAME}`,
  },
  {
    id: 3,
    category: "title",
    title: "Kiavi Title Order Request",
    subject: "{PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) - Title Order Request",
    body: `Hi {TITLE_AGENT_NAME},

I am working on originating a loan for my borrower, {BORROWER_NAME}, who is {LOAN_PURPOSE} the property located at {PROPERTY_ADDRESS}. The title for this transaction is under the entity "{BORROWER_ENTITY_NAME}". Please process the title order in line with the attached instructions. 

Please confirm Receipt of this email.

If you need further clarification or additional details, don't hesitate to reach me directly here or on my cell at (917) 963-0181.

I appreciate your help and look forward to working with you.

Best regards,
{PROCESSOR_NAME}

ATTACHED: Kiavi Title Requirements Document

------------- KEY REQUIREMENTS SUMMARY -------------

Please provide the following documents:

1. Preliminary title report or title commitment (must include coverage amount)
2. A 24-month chain of title, including deeds
3. Property address and APN referenced in report
4. Vested owner matches seller on the purchase contract
5. Estimated HUD-1 that includes all fees for this transaction
6. Closing Protection Letter
7. Tax Certificate
8. Contact information for closing documents
9. Wire instructions
10. Confirm property type and if there is an HOA associated with the property
11. Title Endorsements: Environmental endorsement, ALTA 9 (except FL, OH, TX), PUD/condo endorsements if applicable, ALTA 19 & 20 for multiple parcels

LOAN INFORMATION:
Loan Number: {LOAN_NUMBER}
Loan Amount: {LOAN_AMOUNT}
Borrower: {BORROWER_ENTITY_NAME}
Property Address: {PROPERTY_ADDRESS}
Target Signing Date: {TARGET_CLOSING_DATE}
Loan Purpose: {LOAN_PURPOSE}

Loss Payee / Proposed Insured:
Adler Capital Funding, LLC
Its Successors and/or Assigns
RE: Loan no: {LOAN_NUMBER}

Title policy must insure Adler Capital in 1st lien position. ALTA standard form title policy required (2016, 2021, or Short Form acceptable).`,
  },
  {
    id: 4,
    category: "lender",
    title: "Existing Lender Payoff Request",
    subject: "{PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) - Payoff Request",
    body: `Hi {EXISTING_LENDER_NAME},

I am working on originating a loan for my borrower, {BORROWER_NAME}, who is {LOAN_PURPOSE} the property located at {PROPERTY_ADDRESS}. The title for this transaction is under the entity "{BORROWER_ENTITY_NAME}".

To proceed, we need a payoff letter for the existing loan (#{EXISTING_LOAN_NUMBER}). Please provide a written payoff statement that includes the following details:

Current outstanding balance
Per diem interest amount
Payoff amount good through {REQUESTED_PAYOFF_DATE}
Wiring instructions for final payment
Any additional fees required for loan payoff

If a borrower authorization form is required, please let me know, and I will provide it promptly.

Please confirm receipt of this request, and let me know if you need any additional information to process it efficiently.

Thanks for your help. I look forward to working with you.

Best regards,
{PROCESSOR_NAME}`,
  },
  {
    id: 5,
    category: "insurance",
    title: "Kiavi Insurance Requirements",
    subject: "{PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) – Insurance Requirements",
    body: `Hi {INSURANCE_AGENT_NAME},

I'm working on originating a loan for my borrower, {BORROWER_NAME}, who is {LOAN_PURPOSE} the property located at {PROPERTY_ADDRESS}. The policyholder must be listed as "{BORROWER_ENTITY_NAME}".

Attached below you will find the Insurance requirements for this transaction.

Attached is a document outlining the insurance requirements for this transaction.

Below is a summary of the lender's requirements and instructions for approval. Please review carefully and respond accordingly to help avoid delays or follow-up revision requests.

______________________________________________________________________

REQUIRED COVERAGES

Provide a Bound Evidence of Insurance (EOI) or Binder – quotes are not accepted

Dwelling Coverage: Must be listed with a dollar amount

Coverage must be equal to or greater than the loan amount — OR — provide a Replacement Cost Estimate (If you cannot provide this, confirm that the existing amount represents 100% of the replacement cost and also state that you are unable to provide it)

Named Storm/Hurricane (Florida only): Must be explicitly named on policy (Deductible must also be listed and not exceed 10% of coverage)

Loss of Rent: Must be listed with a dollar amount (If not labeled as "Loss of Rent," attach the full document outlining coverages)

List the Annual Premium on the policy — or confirm it in your reply

Confirm on that policy AND via email that Wind and Fire are included in the policy

Confirm via email whether the premium is paid in full or what balance is due

Policy must include the Mortgagee Clause exactly as shown:

Shellpoint Mortgage Servicing ISAOA ATIMA
P.O. Box 7050, Troy, MI 48007-7050

Include the Loan Number on the policy

List the Borrower Name as the named insured exactly as legally spelled

______________________________________________________________________

Thanks,
{PROCESSOR_NAME}`,
  },
  {
    id: 6,
    category: "title",
    title: "Title Follow-up",
    subject: "FOLLOW-UP: {PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) - Title Order",
    body: `Hi {TITLE_AGENT_NAME},

I wanted to follow up on the title order request I sent for {PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}).

We're working toward a target closing date of {TARGET_CLOSING_DATE}, so I wanted to check on the status of the following items:

- Preliminary title report
- 24-month chain of title
- Estimated HUD-1
- Closing Protection Letter
- Wire instructions

Please let me know if you need any additional information from our end to expedite the process.

Thanks for your assistance!

Best regards,
{PROCESSOR_NAME}`,
  },
  {
    id: 7,
    category: "insurance",
    title: "Insurance Follow-up",
    subject: "FOLLOW-UP: {PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) - Insurance Requirements",
    body: `Hi {INSURANCE_AGENT_NAME},

I wanted to follow up on the insurance requirements I sent for {PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}).

We're working toward a target closing date of {TARGET_CLOSING_DATE}, so I wanted to check on the status of the insurance binder.

As a reminder, we still need:
- Bound Evidence of Insurance (EOI) or Binder
- Dwelling coverage equal to or greater than loan amount
- Loss of Rent coverage with dollar amount
- Mortgagee clause: Shellpoint Mortgage Servicing ISAOA ATIMA
- Confirmation that Wind and Fire are included
- Premium payment status

Please let me know if you have any questions or need additional information.

Thanks for your help!

Best regards,
{PROCESSOR_NAME}`,
  },
  {
    id: 8,
    category: "lender",
    title: "Payoff Follow-up",
    subject: "FOLLOW-UP: {PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}) - Payoff Request",
    body: `Hi {EXISTING_LENDER_NAME},

I wanted to follow up on the payoff letter request I sent for the existing loan on {PROPERTY_ADDRESS} (Loan #{LOAN_NUMBER}).

We're working toward a target closing date of {TARGET_CLOSING_DATE}, so I wanted to check on the status of the payoff statement.

As a reminder, we need:
- Current outstanding balance
- Per diem interest amount
- Payoff amount good through {REQUESTED_PAYOFF_DATE}
- Wiring instructions for final payment
- Any additional fees required for loan payoff

Please let me know if you need any additional information to process this request.

Thanks for your assistance!

Best regards,
{PROCESSOR_NAME}`,
  },
];

export default function Templates({ user, onLogout }: TemplatesProps) {
  const [activeTab, setActiveTab] = useState("borrower");
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [newTemplate, setNewTemplate] = useState({
    category: "borrower",
    title: "",
    subject: "",
    body: "",
  });

  const { toast } = useToast();

  const handleCopyTemplate = (template: any) => {
    // Copy template to clipboard
    const fullTemplate = `Subject: ${template.subject}\n\n${template.body}`;
    navigator.clipboard.writeText(fullTemplate);
    
    toast({
      title: "Template copied",
      description: "Email template has been copied to clipboard.",
    });
  };

  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template);
    setOpenDialog(true);
  };

  const handleNewTemplate = () => {
    setSelectedTemplate(null);
    setNewTemplate({
      category: activeTab,
      title: "",
      subject: "",
      body: "",
    });
    setOpenDialog(true);
  };

  const handleSaveTemplate = () => {
    // In a real app, this would save to the backend
    toast({
      title: selectedTemplate ? "Template updated" : "Template created",
      description: `The email template "${selectedTemplate ? selectedTemplate.title : newTemplate.title}" has been saved.`,
    });
    setOpenDialog(false);
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="py-6 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold">Email Templates</h2>
              <p className="mt-1 text-sm text-blue-100">
                Manage email templates for common loan processing communications
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <Button
                onClick={handleNewTemplate}
                className="bg-white text-blue-700 hover:bg-blue-50 inline-flex items-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 mr-2"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Template
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="borrower" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            {templateCategories.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {templateCategories.map((category) => (
            <TabsContent key={category.id} value={category.id}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {emailTemplates
                  .filter((template) => template.category === category.id)
                  .map((template) => (
                    <Card key={template.id}>
                      <CardHeader>
                        <CardTitle>{template.title}</CardTitle>
                        <CardDescription>Subject: {template.subject}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-40 overflow-y-auto text-sm text-gray-600 whitespace-pre-line">
                          {template.body.length > 200
                            ? `${template.body.substring(0, 200)}...`
                            : template.body}
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between">
                        <Button
                          variant="outline"
                          onClick={() => handleEditTemplate(template)}
                        >
                          Edit
                        </Button>
                        <Button onClick={() => handleCopyTemplate(template)}>
                          Copy
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
              {emailTemplates.filter((template) => template.category === category.id)
                .length === 0 && (
                <div className="text-center py-12">
                  <div className="rounded-full bg-blue-100 p-3 mx-auto w-fit mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    No Templates Found
                  </h3>
                  <p className="text-gray-500 mb-4">
                    No email templates found for this category.
                  </p>
                  <Button onClick={handleNewTemplate} size="sm">
                    Create Template
                  </Button>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>
                {selectedTemplate ? "Edit Email Template" : "Create New Email Template"}
              </DialogTitle>
              <DialogDescription>
                Fill in the details for your email template. Use placeholders like
                {"{BORROWER_NAME}"} for dynamic content.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="title" className="text-right">
                  Template Name
                </Label>
                <Input
                  id="title"
                  value={selectedTemplate ? selectedTemplate.title : newTemplate.title}
                  onChange={(e) =>
                    selectedTemplate
                      ? setSelectedTemplate({
                          ...selectedTemplate,
                          title: e.target.value,
                        })
                      : setNewTemplate({ ...newTemplate, title: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right">
                  Category
                </Label>
                <select
                  id="category"
                  value={
                    selectedTemplate ? selectedTemplate.category : newTemplate.category
                  }
                  onChange={(e) =>
                    selectedTemplate
                      ? setSelectedTemplate({
                          ...selectedTemplate,
                          category: e.target.value,
                        })
                      : setNewTemplate({ ...newTemplate, category: e.target.value })
                  }
                  className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {templateCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="subject" className="text-right">
                  Email Subject
                </Label>
                <Input
                  id="subject"
                  value={
                    selectedTemplate ? selectedTemplate.subject : newTemplate.subject
                  }
                  onChange={(e) =>
                    selectedTemplate
                      ? setSelectedTemplate({
                          ...selectedTemplate,
                          subject: e.target.value,
                        })
                      : setNewTemplate({ ...newTemplate, subject: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="body" className="text-right pt-2">
                  Email Body
                </Label>
                <Textarea
                  id="body"
                  value={selectedTemplate ? selectedTemplate.body : newTemplate.body}
                  onChange={(e) =>
                    selectedTemplate
                      ? setSelectedTemplate({
                          ...selectedTemplate,
                          body: e.target.value,
                        })
                      : setNewTemplate({ ...newTemplate, body: e.target.value })
                  }
                  className="col-span-3"
                  rows={15}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate}>Save Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}