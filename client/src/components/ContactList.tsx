import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Contact } from "@/lib/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface ContactListProps {
  contacts: Contact[];
  loanId: number;
  loanNumber?: string;
  propertyAddress?: string;
  borrowerName?: string;
}

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Must be a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  role: z.string().min(1, "Role is required")
});

export default function ContactList({ contacts, loanId, loanNumber, propertyAddress, borrowerName }: ContactListProps) {
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<number | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [emailContent, setEmailContent] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailAttachments, setEmailAttachments] = useState<File[]>([]);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      role: "borrower"
    }
  });
  
  const onSubmit = async (data: z.infer<typeof contactSchema>) => {
    try {
      if (editingContact) {
        // Update existing contact
        await apiRequest("PUT", `/api/loans/${loanId}/contacts/${editingContact.id}`, data);
        toast({
          title: "Contact updated",
          description: "Contact has been updated successfully"
        });
      } else {
        // Create new contact
        await apiRequest("POST", `/api/loans/${loanId}/contacts`, data);
        toast({
          title: "Contact added",
          description: "New contact has been added successfully"
        });
      }
      
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      setIsAddContactOpen(false);
      setEditingContact(null);
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save contact. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const handleDelete = async () => {
    if (!contactToDelete) return;
    
    try {
      await apiRequest("DELETE", `/api/loans/${loanId}/contacts/${contactToDelete}`);
      
      toast({
        title: "Contact deleted",
        description: "Contact has been deleted successfully"
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete contact. Please try again.",
        variant: "destructive"
      });
    } finally {
      setContactToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "Text has been copied to your clipboard",
        duration: 2000
      });
    });
  };

  const generateEmailTemplate = (contact: Contact, propertyAddress: string, borrowerName: string) => {
    const getSubjectAndBody = () => {
      switch (contact.role) {
        case 'title':
          return {
            subject: `${propertyAddress} (Loan #${loanNumber || loanId}) - Title Order Request`,
            body: `Hi ${contact.name},

I am working on originating a loan for my borrower, ${borrowerName}, who is [purchasing/refinancing] the property located at ${propertyAddress}. The title for this transaction is under the entity "[LLC Name]". Please process the title order in line with the attached instructions. 

Please confirm Receipt of this email.

If you need further clarification or additional details, don't hesitate to reach me directly here or on my cell at (917) 963-0181.

I appreciate your help and look forward to working with you.

Best regards,

Dan

Daniel Adler
Private Lending Advisor
Adler Capital
dan@adlercapital.us
(917) 963-0181`
          };
        
        case 'insurance':
          return {
            subject: `${propertyAddress} (Loan #${loanNumber || loanId}) – Insurance Requirements`,
            body: `Hi ${contact.name},

I'm working on originating a loan for my borrower, ${borrowerName}, who is [purchasing/refinancing] the property located at ${propertyAddress}. The policyholder must be listed as "[LLC Name]".

Attached below you will find the Insurance requirements for this transaction.

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

Daniel Adler
Private Lending Advisor
Adler Capital
dan@adlercapital.us
(917) 963-0181`
          };
        
        case 'lender':
          return {
            subject: `${propertyAddress} (Loan #${loanNumber || loanId}) - Payoff Request`,
            body: `Hi ${contact.name},

I am working on originating a loan for my borrower, ${borrowerName}, who is [purchasing/refinancing] the property located at ${propertyAddress}. The title for this transaction is under the entity "[LLC Name]".

To proceed, we need a payoff letter for the existing loan (#[Loan Number]). Please provide a written payoff statement that includes the following details:

Current outstanding balance
Per diem interest amount
Payoff amount good through [Requested Date]
Wiring instructions for final payment
Any additional fees required for loan payoff

If a borrower authorization form is required, please let me know, and I will provide it promptly.

Please confirm receipt of this request, and let me know if you need any additional information to process it efficiently.

Thanks for your help. I look forward to working with you.

Best regards,

Dan

Daniel Adler
Private Lending Advisor
Adler Capital
dan@adlercapital.us
(917) 963-0181`
          };
        
        case 'borrower':
          return {
            subject: `${propertyAddress} (Loan #${loanNumber || loanId}) - Required Items`,
            body: `Hi ${borrowerName},

Please share the following documents/information to the secure portal below at your earliest convenience.

Signed/Completed borrowing authorization form
Signed/Completed disclosure form
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
Dan

Daniel Adler
Private Lending Advisor
https://adlercapital.us/
dan@adlercapital.us
(917) 963-0181`
          };
        
        default:
          return {
            subject: `${propertyAddress} (#${loanNumber || loanId}) - Loan Coordination`,
            body: `Dear ${contact.name},

We have a new loan file and wanted to coordinate with you on the next steps.

Loan Details:
• Property Address: ${propertyAddress}
• Borrower: ${borrowerName}
• Loan Number: ${loanNumber || loanId}

Please let us know if you need any additional information from our side.

Best regards,
Daniel Adler
Loan Processing Team`
          };
      }
    };

    return getSubjectAndBody();
  };

  const handleSendInitialEmail = async (contact: Contact) => {
    const template = generateEmailTemplate(
      contact, 
      propertyAddress || "Property Address", 
      borrowerName || "Borrower Name"
    );
    setSelectedContact(contact);
    setEmailContent(template.body);
    setEmailSubject(template.subject);
    setEmailTo(contact.email || "");
    setEmailCc("");
    setEmailAttachments([]);
    setIsEmailDialogOpen(true);
  };
  
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-100" data-component="contact-list">
        <div className="px-4 py-4 sm:px-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-heading font-medium text-gray-900 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Key Contacts
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              People involved in this loan file
            </p>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={() => {
                setEditingContact(null);
                form.reset({
                  name: "",
                  email: "",
                  phone: "",
                  company: "",
                  role: "analyst"
                });
                setIsAddContactOpen(true);
              }}
              className="flex items-center px-3 py-1.5 bg-orange-50 text-orange-700 rounded-md text-sm font-medium hover:bg-orange-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Add Analyst
            </button>
            <button 
              onClick={() => {
                setEditingContact(null);
                form.reset({
                  name: "",
                  email: "",
                  phone: "",
                  company: "",
                  role: "borrower"
                });
                setIsAddContactOpen(true);
              }}
              className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Contact
            </button>
          </div>
        </div>
        
        <div className="px-4 py-3 sm:px-4">
          {contacts.length === 0 ? (
            <div className="py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="mt-2 text-gray-500">No contacts added yet</p>
              <button 
                onClick={() => setIsAddContactOpen(true)}
                className="mt-3 inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add your first contact
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Analysts Section */}
              {contacts.filter(contact => contact.role === 'analyst').length > 0 && (
                <div>
                  <div className="flex items-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <h4 className="text-sm font-medium text-gray-900">Loan Analysts</h4>
                    <span className="ml-2 bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded-full">
                      {contacts.filter(contact => contact.role === 'analyst').length}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {contacts.filter(contact => contact.role === 'analyst').map((contact) => (
                      <div key={contact.id} className="p-3 rounded-lg border border-orange-100 bg-orange-50 ring-1 ring-orange-200">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            <span className="ml-2 font-medium text-gray-900">{contact.name}</span>
                            <span className="ml-2 bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded-full">Analyst</span>
                          </div>
                          <div className="flex space-x-1">
                            <button 
                              className="text-orange-800 bg-white p-1 rounded-md border border-gray-200 hover:bg-gray-50"
                              onClick={() => copyToClipboard(contact.name)}
                              title="Copy Name"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <button 
                              className="bg-white p-1 rounded-md border border-gray-200 hover:bg-gray-50 text-blue-600"
                              onClick={() => {
                                setEditingContact(contact);
                                setIsAddContactOpen(true);
                                form.reset({
                                  name: contact.name,
                                  email: contact.email || "",
                                  phone: contact.phone || "",
                                  company: contact.company || "",
                                  role: contact.role
                                });
                              }}
                              title="Edit Contact"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button 
                              className="bg-white p-1 rounded-md border border-gray-200 hover:bg-red-50 text-red-600"
                              onClick={() => {
                                setContactToDelete(contact.id);
                                setIsDeleteDialogOpen(true);
                              }}
                              title="Delete Contact"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {contact.email && (
                            <div className="flex items-center text-sm text-gray-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                              </svg>
                              <span onClick={() => copyToClipboard(contact.email || "")} className="cursor-pointer hover:text-gray-800">
                                {contact.email}
                              </span>
                              <button 
                                onClick={() => copyToClipboard(contact.email || "")}
                                className="ml-1 p-0.5 hover:bg-gray-200 rounded"
                                title="Copy Email"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center text-sm text-gray-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span onClick={() => copyToClipboard(contact.phone || "")} className="cursor-pointer hover:text-gray-800">
                                {contact.phone}
                              </span>
                              <button 
                                onClick={() => copyToClipboard(contact.phone || "")}
                                className="ml-1 p-0.5 hover:bg-gray-200 rounded"
                                title="Copy Phone"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {contact.company && (
                            <div className="flex items-center text-sm text-gray-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span>{contact.company}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Contacts Section */}
              {contacts.filter(contact => contact.role !== 'analyst').length > 0 && (
                <div>
                  <div className="flex items-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <h4 className="text-sm font-medium text-gray-900">Other Contacts</h4>
                    <span className="ml-2 bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded-full">
                      {contacts.filter(contact => contact.role !== 'analyst').length}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {contacts.filter(contact => contact.role !== 'analyst').map((contact) => {
                      // Determine background color based on role
                      let bgColor, textColor, borderColor, roleIcon;
                      switch(contact.role) {
                        case 'borrower':
                          bgColor = 'bg-blue-50';
                          textColor = 'text-blue-800';
                          borderColor = 'border-blue-100';
                          roleIcon = (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          );
                          break;
                        case 'title':
                          bgColor = 'bg-purple-50';
                          textColor = 'text-purple-800';
                          borderColor = 'border-purple-100';
                          roleIcon = (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          );
                          break;
                        case 'insurance':
                          bgColor = 'bg-green-50';
                          textColor = 'text-green-800';
                          borderColor = 'border-green-100';
                          roleIcon = (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          );
                          break;
                        default:
                          bgColor = 'bg-gray-50';
                          textColor = 'text-gray-800';
                          borderColor = 'border-gray-100';
                          roleIcon = (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          );
                      }
                      
                      return (
                        <div key={contact.id} className={`p-3 rounded-lg border ${borderColor} ${bgColor}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center">
                              {roleIcon}
                              <span className="ml-2 font-medium text-gray-900">{contact.name}</span>
                            </div>
                            <div className="flex space-x-1">
                              {/* Send Initial Email Button - only show for non-analysts with email */}
                              {contact.role !== 'analyst' && contact.email && (
                                <button 
                                  className="bg-blue-600 text-white p-1 rounded-md border border-blue-600 hover:bg-blue-700 text-xs px-2"
                                  onClick={() => handleSendInitialEmail(contact)}
                                  title="Send Initial Email"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.44a2 2 0 001.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  Email
                                </button>
                              )}
                              <button 
                                className={`${textColor} bg-white p-1 rounded-md border border-gray-200 hover:bg-gray-50`}
                                onClick={() => copyToClipboard(contact.name)}
                                title="Copy Name"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                              <button 
                                className="bg-white p-1 rounded-md border border-gray-200 hover:bg-gray-50 text-blue-600"
                                onClick={() => {
                                  setEditingContact(contact);
                                  setIsAddContactOpen(true);
                                  form.reset({
                                    name: contact.name,
                                    email: contact.email || "",
                                    phone: contact.phone || "",
                                    company: contact.company || "",
                                    role: contact.role
                                  });
                                }}
                                title="Edit Contact"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button 
                                className="bg-white p-1 rounded-md border border-gray-200 hover:bg-red-50 text-red-600"
                                onClick={() => {
                                  setContactToDelete(contact.id);
                                  setIsDeleteDialogOpen(true);
                                }}
                                title="Delete Contact"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {contact.email && (
                              <div className="flex items-center text-sm text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                                <span onClick={() => copyToClipboard(contact.email || "")} className="cursor-pointer hover:text-gray-800">
                                  {contact.email}
                                </span>
                                <button 
                                  onClick={() => copyToClipboard(contact.email || "")}
                                  className="ml-1 p-0.5 hover:bg-gray-200 rounded"
                                  title="Copy Email"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            {contact.phone && (
                              <div className="flex items-center text-sm text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span onClick={() => copyToClipboard(contact.phone || "")} className="cursor-pointer hover:text-gray-800">
                                  {contact.phone}
                                </span>
                                <button 
                                  onClick={() => copyToClipboard(contact.phone || "")}
                                  className="ml-1 p-0.5 hover:bg-gray-200 rounded"
                                  title="Copy Phone"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            {contact.company && (
                              <div className="flex items-center text-sm text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span>{contact.company}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add New Contact'}</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="analyst">Loan Analyst</SelectItem>
                        <SelectItem value="borrower">Borrower</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="insurance">Insurance</SelectItem>
                        <SelectItem value="lender">Lender</SelectItem>
                        <SelectItem value="appraiser">Appraiser</SelectItem>
                        <SelectItem value="attorney">Attorney</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input placeholder="Company name (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Email address (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Phone number (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddContactOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingContact ? 'Update Contact' : 'Add Contact'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this contact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Send Initial Email to {selectedContact?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Sending to:</strong> {selectedContact?.name} ({selectedContact?.role})
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To (separate multiple emails with commas)
              </label>
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md text-sm"
                placeholder="recipient@example.com, another@example.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CC (optional)
              </label>
              <input
                type="text"
                value={emailCc}
                onChange={(e) => setEmailCc(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md text-sm"
                placeholder="cc@example.com, manager@example.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md text-sm"
                placeholder="Email subject..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attachments (optional)
              </label>
              <div className="space-y-2">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx"
                  onChange={(e) => {
                    if (e.target.files) {
                      setEmailAttachments(Array.from(e.target.files));
                    }
                  }}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                />
                {emailAttachments.length > 0 && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Selected files ({emailAttachments.length}):
                    </p>
                    <div className="space-y-1">
                      {emailAttachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            {file.name} ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                          <button
                            onClick={() => {
                              setEmailAttachments(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Content
              </label>
              <textarea
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                rows={12}
                className="w-full p-3 border border-gray-300 rounded-md text-sm font-mono"
                placeholder="Email content will appear here..."
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={async () => {
              if (!emailTo || !emailSubject || !emailContent) {
                toast({
                  title: "Missing information",
                  description: "Please fill in To, Subject and Email Content fields",
                  variant: "destructive"
                });
                return;
              }

              // Parse email addresses from comma-separated strings
              const toEmails = emailTo.split(',').map(email => email.trim()).filter(email => email);
              const ccEmails = emailCc ? emailCc.split(',').map(email => email.trim()).filter(email => email) : [];

              try {
                // Create form data for file uploads
                const formData = new FormData();
                formData.append('to', JSON.stringify(toEmails));
                if (ccEmails.length > 0) {
                  formData.append('cc', JSON.stringify(ccEmails));
                }
                formData.append('subject', emailSubject);
                formData.append('body', emailContent);
                
                // Add attachments
                emailAttachments.forEach((file, index) => {
                  formData.append(`attachment_${index}`, file);
                });

                // Send with fetch to handle file uploads
                const response = await fetch('/api/gmail/send', {
                  method: 'POST',
                  body: formData,
                  credentials: 'include'
                });

                if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
                }

                toast({
                  title: "Email sent",
                  description: `Email sent to ${toEmails.length} recipient(s)${ccEmails.length > 0 ? ` with ${ccEmails.length} CC` : ''}`,
                });
                setIsEmailDialogOpen(false);
                
                // Show follow-up call reminder
                setTimeout(() => {
                  toast({
                    title: "📞 Follow-up Reminder",
                    description: `Please call ${selectedContact?.name} to confirm they received your email and discuss next steps.`,
                    duration: 8000,
                  });
                }, 1500);
              } catch (error) {
                toast({
                  title: "Failed to send email",
                  description: "Please make sure Gmail is connected and try again.",
                  variant: "destructive"
                });
              }
            }}>
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}