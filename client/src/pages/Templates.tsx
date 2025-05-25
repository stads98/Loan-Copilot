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
  { id: "closing", name: "Closing" },
  { id: "status", name: "Status Update" },
];

// Pre-defined email templates
const emailTemplates = [
  {
    id: 1,
    category: "borrower",
    title: "Initial Loan Application",
    subject: "Your DSCR Loan Application - Next Steps",
    body: `Dear {BORROWER_NAME},

Thank you for choosing us for your DSCR loan needs. I'm {PROCESSOR_NAME}, your dedicated loan processor, and I'll be assisting you throughout the entire process.

To begin processing your loan application, I'll need the following documents:

1. Driver's License (front and back)
2. Articles of Organization
3. Operating Agreement
4. EIN Letter from IRS
5. Recent bank statements (2 months)
6. Current lease agreements for the property

You can securely upload these documents by replying to this email or using our secure portal.

If you have any questions, please don't hesitate to contact me directly at {PROCESSOR_PHONE}.

Best regards,
{PROCESSOR_NAME}
Loan Processor
{COMPANY_NAME}`,
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
    title: "Title Request",
    subject: "Title Order Request - {PROPERTY_ADDRESS}",
    body: `Dear {TITLE_AGENT_NAME},

I would like to request a title search and preliminary title report for the following property:

Property Address: {PROPERTY_ADDRESS}
Borrower Name: {BORROWER_NAME}
Loan Amount: {LOAN_AMOUNT}
Expected Closing Date: {CLOSING_DATE}

Please provide the following:
1. Preliminary title report
2. Copies of all exceptions
3. Current property tax information
4. Any HOA information if applicable

Our lender also requires a closing protection letter and wire instructions for closing.

Please let me know if you need any additional information from our end.

Best regards,
{PROCESSOR_NAME}
Loan Processor
{COMPANY_NAME}`,
  },
  {
    id: 4,
    category: "insurance",
    title: "Insurance Requirements",
    subject: "Insurance Requirements for {PROPERTY_ADDRESS}",
    body: `Dear {INSURANCE_AGENT_NAME},

I'm reaching out regarding the insurance requirements for a DSCR loan on the following property:

Property Address: {PROPERTY_ADDRESS}
Borrower/Insured: {BORROWER_NAME}
Loan Amount: {LOAN_AMOUNT}
Property Type: {PROPERTY_TYPE}

Our lender requires the following coverage:
1. Hazard Insurance with minimum coverage of {LOAN_AMOUNT}
2. Flood Insurance (if in flood zone)
3. Liability coverage of at least $1,000,000
4. Loss of Rents coverage
5. Named Insured must match the vesting exactly as: {BORROWER_ENTITY_NAME}

The lender should be listed as Mortgagee as follows:
{LENDER_NAME}
{LENDER_ADDRESS}
Loan #: {LOAN_NUMBER}

Please provide a quote and insurance binder at your earliest convenience. The closing is scheduled for {CLOSING_DATE}.

Thank you,
{PROCESSOR_NAME}
Loan Processor
{COMPANY_NAME}`,
  },
  {
    id: 5,
    category: "closing",
    title: "Closing Confirmation",
    subject: "Closing Confirmation - {PROPERTY_ADDRESS}",
    body: `Dear {BORROWER_NAME},

I'm pleased to inform you that your DSCR loan for {PROPERTY_ADDRESS} has been approved and is cleared to close!

Closing Details:
Date: {CLOSING_DATE}
Time: {CLOSING_TIME}
Location: {CLOSING_LOCATION}

Please bring the following to closing:
1. Government-issued photo ID
2. Cashier's check for closing costs in the amount of: {CLOSING_COSTS}
   (made payable to: {TITLE_COMPANY})
3. Evidence of insurance
4. Any other documents requested by the title company

Let me know if you have any questions before the closing date. I'm here to ensure everything goes smoothly.

Congratulations on your upcoming loan closing!

Best regards,
{PROCESSOR_NAME}
Loan Processor
{COMPANY_NAME}`,
  },
  {
    id: 6,
    category: "status",
    title: "Weekly Status Update",
    subject: "Status Update - {PROPERTY_ADDRESS} Loan",
    body: `Dear {BORROWER_NAME},

I wanted to provide you with a weekly update on the status of your DSCR loan for {PROPERTY_ADDRESS}.

Current Status: {LOAN_STATUS}

Completed Items:
{COMPLETED_ITEMS}

Pending Items:
{PENDING_ITEMS}

Next Steps:
{NEXT_STEPS}

Expected Timeline:
- Underwriting Review: {UNDERWRITING_DATE}
- Conditional Approval: {APPROVAL_DATE}
- Clear to Close: {CLEAR_TO_CLOSE_DATE}
- Closing: {CLOSING_DATE}

Please let me know if you have any questions or concerns.

Best regards,
{PROCESSOR_NAME}
Loan Processor
{COMPANY_NAME}`,
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