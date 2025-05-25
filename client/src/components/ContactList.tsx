import { Contact } from "@/lib/types";
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
      await apiRequest("POST", `/api/loans/${loanId}/contacts`, data);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      setIsAddContactOpen(false);
      form.reset();
      toast({
        title: "Contact added",
        description: "The contact has been added successfully."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add contact. Please try again.",
        variant: "destructive"
      });
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
  
  return (
    <>
      <div className="bg-white rounded-lg shadow" data-component="contact-list">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">Key Contacts</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            People involved in this loan file
          </p>
        </div>
        <div className="divide-y divide-gray-200">
          {contacts.map((contact) => (
            <div key={contact.id} className="px-4 py-3 sm:px-6">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                  <p className="text-xs text-gray-500">{contact.role}{contact.company ? `, ${contact.company}` : ''}</p>
                </div>
                <div className="flex space-x-2">
                  <button 
                    className={`text-gray-400 hover:text-primary-600 ${!contact.email ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => handleEmailClick(contact.email || '')}
                    disabled={!contact.email}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                  </button>
                  <button 
                    className={`text-gray-400 hover:text-primary-600 ${!contact.phone ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => handlePhoneClick(contact.phone || '')}
                    disabled={!contact.phone}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {contacts.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              No contacts added yet
            </div>
          )}
        </div>
        <div className="px-4 py-3 sm:px-6 border-t border-gray-200">
          <button 
            onClick={() => setIsAddContactOpen(true)}
            className="text-sm font-medium text-primary-600 hover:text-primary-500 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add contact
          </button>
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
                        <SelectItem value="lender">Lender</SelectItem>
                        <SelectItem value="realtor">Realtor</SelectItem>
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
