import { useState } from "react";
import Layout from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Contact } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

interface ContactsProps {
  user: any;
  onLogout: () => void;
}

export default function Contacts({ user, onLogout }: ContactsProps) {
  const [openDialog, setOpenDialog] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    role: "borrower",
    loanId: 1, // Default to the first loan
  });
  
  const { toast } = useToast();
  
  // Fetch all contacts
  const { data: contacts, isLoading: isLoadingContacts, refetch } = useQuery({
    queryKey: ['/api/contacts'],
  });
  
  // Fetch all loans for the loan selection dropdown
  const { data: loans, isLoading: isLoadingLoans } = useQuery({
    queryKey: ['/api/loans'],
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewContact(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setNewContact(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiRequest("POST", "/api/contacts", newContact);
      if (response.ok) {
        toast({
          title: "Contact created",
          description: "The contact was successfully added."
        });
        setOpenDialog(false);
        setNewContact({
          name: "",
          email: "",
          phone: "",
          company: "",
          role: "borrower",
          loanId: 1,
        });
        refetch();
      } else {
        toast({
          title: "Error",
          description: "Failed to create contact. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive"
      });
    }
  };

  if (isLoadingContacts || isLoadingLoans) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="py-6 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold">Contact Management</h2>
              <p className="mt-1 text-sm text-blue-100">
                Manage all loan-related contacts in one place
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-white text-blue-700 hover:bg-blue-50 inline-flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Contact
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Add New Contact</DialogTitle>
                    <DialogDescription>
                      Enter contact details below. Click save when you're done.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                          Name
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          value={newContact.name}
                          onChange={handleInputChange}
                          className="col-span-3"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="email" className="text-right">
                          Email
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={newContact.email}
                          onChange={handleInputChange}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="phone" className="text-right">
                          Phone
                        </Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={newContact.phone}
                          onChange={handleInputChange}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="company" className="text-right">
                          Company
                        </Label>
                        <Input
                          id="company"
                          name="company"
                          value={newContact.company}
                          onChange={handleInputChange}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="role" className="text-right">
                          Role
                        </Label>
                        <Select
                          value={newContact.role}
                          onValueChange={(value) => handleSelectChange("role", value)}
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="borrower">Borrower</SelectItem>
                            <SelectItem value="title">Title Agent</SelectItem>
                            <SelectItem value="insurance">Insurance Agent</SelectItem>
                            <SelectItem value="appraiser">Appraiser</SelectItem>
                            <SelectItem value="realtor">Realtor</SelectItem>
                            <SelectItem value="attorney">Attorney</SelectItem>
                            <SelectItem value="lender">Lender</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="loanId" className="text-right">
                          Loan
                        </Label>
                        <Select
                          value={newContact.loanId.toString()}
                          onValueChange={(value) => handleSelectChange("loanId", value)}
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select loan" />
                          </SelectTrigger>
                          <SelectContent>
                            {loans && loans.length > 0 ? (
                              loans.map((loan: any) => (
                                <SelectItem key={loan.id} value={loan.id.toString()}>
                                  {loan.borrowerName} - {loan.loanType}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="1">No loans available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit">Save Contact</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts && contacts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Loan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact: Contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {contact.role.charAt(0).toUpperCase() + contact.role.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>{contact.email}</TableCell>
                      <TableCell>{contact.phone}</TableCell>
                      <TableCell>{contact.company}</TableCell>
                      <TableCell>
                        {loans && loans.find((loan: any) => loan.id === contact.loanId)?.borrowerName || 
                          `Loan #${contact.loanId}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No contacts found. Add your first contact to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}