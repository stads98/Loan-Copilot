import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
}

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Must be a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  role: z.string().min(1, "Role is required")
});

export default function ContactList({ contacts, loanId }: ContactListProps) {
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<number | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
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
        await apiRequest("PATCH", `/api/contacts/${editingContact.id}`, data);
        toast({
          title: "Contact updated",
          description: "The contact has been updated successfully."
        });
      } else {
        // Add new contact
        await apiRequest("POST", `/api/loans/${loanId}/contacts`, data);
        toast({
          title: "Contact added",
          description: "The contact has been added successfully."
        });
      }
      
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      setIsAddContactOpen(false);
      setEditingContact(null);
      form.reset({
        name: "",
        email: "",
        phone: "",
        company: "",
        role: "borrower"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${editingContact ? 'update' : 'add'} contact. Please try again.`,
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteContact = (contactId: number) => {
    setContactToDelete(contactId);
    setIsDeleteDialogOpen(true);
  };
  
  const confirmDeleteContact = async () => {
    if (!contactToDelete) return;
    
    try {
      await apiRequest("DELETE", `/api/contacts/${contactToDelete}`, {});
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      toast({
        title: "Contact deleted",
        description: "The contact has been deleted successfully."
      });
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
  
  const handleEmailClick = (email: string) => {
    if (email) {
      window.location.href = `mailto:${email}`;
    }
  };
  
  const handlePhoneClick = (phone: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
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
          <button 
            onClick={() => setIsAddContactOpen(true)}
            className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Contact
          </button>
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
            <div className="grid gap-3">
              {contacts.map((contact) => {
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
                        <button 
                          className={`${textColor} bg-white p-1 rounded-md border border-gray-200 hover:bg-gray-50`}
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
                          className="bg-white p-1 rounded-md border border-gray-200 hover:bg-red-50 text-red-500"
                          onClick={() => handleDeleteContact(contact.id)}
                          title="Delete Contact"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-xs mb-1 flex items-center">
                      <span className={`font-medium ${textColor}`}>
                        {contact.role.charAt(0).toUpperCase() + contact.role.slice(1)}
                      </span>
                      {contact.company && (
                        <span className="text-gray-500 ml-1">
                          • {contact.company}
                        </span>
                      )}
                    </div>
                    
                    {(contact.email || contact.phone) && (
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        {contact.phone && (
                          <div className="flex items-center justify-between bg-white rounded-md px-3 py-1.5 border border-gray-100">
                            <div className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span className="text-xs">{contact.phone}</span>
                            </div>
                            <div className="flex space-x-1">
                              <button 
                                onClick={() => copyToClipboard(contact.phone || '')}
                                className="p-1 rounded-md hover:bg-gray-100"
                                title="Copy Phone"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {contact.email && (
                          <div className="flex items-center justify-between bg-white rounded-md px-3 py-1.5 border border-gray-100">
                            <div className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span className="text-xs truncate max-w-[150px]">{contact.email}</span>
                            </div>
                            <div className="flex space-x-1">
                              <button 
                                onClick={() => copyToClipboard(contact.email || '')}
                                className="p-1 rounded-md hover:bg-gray-100"
                                title="Copy Email"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Add Contact Dialog */}
      <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Smith" {...field} />
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
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="borrower">Borrower</SelectItem>
                        <SelectItem value="title">Title Company</SelectItem>
                        <SelectItem value="insurance">Insurance Agent</SelectItem>
                        <SelectItem value="payoff">Payoff Lender</SelectItem>
                        <SelectItem value="lender">Current Lender</SelectItem>
                        <SelectItem value="realtor">Realtor</SelectItem>
                        <SelectItem value="attorney">Attorney</SelectItem>
                        <SelectItem value="cpa">CPA/Accountant</SelectItem>
                        <SelectItem value="property_manager">Property Manager</SelectItem>
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
                    <FormLabel>Company (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Company name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="email@example.com" {...field} />
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
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsAddContactOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Contact</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
