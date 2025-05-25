import { Document } from "@/lib/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { format } from "date-fns";

interface DocumentManagerProps {
  documents: Document[];
  loanId: number;
  requiredDocuments: {
    borrower: string[];
    property: string[];
    title: string[];
    insurance: string[];
  };
}

const documentSchema = z.object({
  name: z.string().min(1, "Filename is required"),
  fileId: z.string().min(1, "File ID is required"),
  fileType: z.string().optional(),
  fileSize: z.number().optional(),
  category: z.string().min(1, "Category is required")
});

export default function DocumentManager({ documents, loanId, requiredDocuments }: DocumentManagerProps) {
  const [activeTab, setActiveTab] = useState("document-list");
  const [isAddDocumentOpen, setIsAddDocumentOpen] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof documentSchema>>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      name: "",
      fileId: "",
      fileType: "pdf",
      fileSize: 0,
      category: "borrower"
    }
  });
  
  const onSubmit = async (data: z.infer<typeof documentSchema>) => {
    try {
      await apiRequest("POST", `/api/loans/${loanId}/documents`, data);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      setIsAddDocumentOpen(false);
      form.reset();
      toast({
        title: "Document added",
        description: "The document has been added successfully."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add document. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // All missing documents based on requirements
  const missingDocuments = {
    borrower: requiredDocuments.borrower.filter(
      doc => !documents.some(d => d.category === "borrower" && d.name.toLowerCase().includes(doc.toLowerCase()))
    ),
    property: requiredDocuments.property.filter(
      doc => !documents.some(d => d.category === "property" && d.name.toLowerCase().includes(doc.toLowerCase()))
    ),
    title: requiredDocuments.title.filter(
      doc => !documents.some(d => d.category === "title" && d.name.toLowerCase().includes(doc.toLowerCase()))
    ),
    insurance: requiredDocuments.insurance.filter(
      doc => !documents.some(d => d.category === "insurance" && d.name.toLowerCase().includes(doc.toLowerCase()))
    )
  };
  
  const allMissingDocuments = [
    ...missingDocuments.borrower.map(doc => ({ name: doc, category: "borrower" })),
    ...missingDocuments.property.map(doc => ({ name: doc, category: "property" })),
    ...missingDocuments.title.map(doc => ({ name: doc, category: "title" })),
    ...missingDocuments.insurance.map(doc => ({ name: doc, category: "insurance" }))
  ];
  
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  
  return (
    <>
      <div className="bg-white rounded-lg shadow" data-component="document-manager">
        <Tabs defaultValue="document-list" value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b border-gray-200">
            <TabsList className="flex">
              <TabsTrigger 
                value="document-list" 
                className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm"
                data-state={activeTab === "document-list" ? "active" : ""}
              >
                Document List
              </TabsTrigger>
              <TabsTrigger 
                value="missing-documents" 
                className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm"
                data-state={activeTab === "missing-documents" ? "active" : ""}
              >
                Missing Documents
              </TabsTrigger>
              <TabsTrigger 
                value="upload-new" 
                className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm"
                data-state={activeTab === "upload-new" ? "active" : ""}
                onClick={() => setIsAddDocumentOpen(true)}
              >
                Upload New
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="document-list" className="overflow-hidden">
            {documents.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                No documents uploaded yet
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {documents.map((document) => (
                  <li key={document.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 text-lg mr-3 w-5 h-5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {document.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {document.uploadedAt 
                              ? `Added ${format(new Date(document.uploadedAt), 'MMM d, yyyy')}` 
                              : 'Recently added'} · {document.fileSize ? formatFileSize(document.fileSize) : 'Unknown size'}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button className="text-gray-400 hover:text-primary-600">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                        </button>
                        <button className="text-gray-400 hover:text-primary-600">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          
          <TabsContent value="missing-documents" className="overflow-hidden">
            {allMissingDocuments.length === 0 ? (
              <div className="px-4 py-6 text-center text-green-500 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto mb-2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <p className="font-medium">All required documents are present!</p>
              </div>
            ) : (
              <div className="p-4">
                <p className="text-sm text-gray-700 mb-4">The following documents are still needed:</p>
                
                {missingDocuments.borrower.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm text-gray-900 mb-2">Borrower Documents</h4>
                    <ul className="pl-5 list-disc text-sm text-gray-600 space-y-1">
                      {missingDocuments.borrower.map((doc, index) => (
                        <li key={index}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {missingDocuments.property.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm text-gray-900 mb-2">Property Documents</h4>
                    <ul className="pl-5 list-disc text-sm text-gray-600 space-y-1">
                      {missingDocuments.property.map((doc, index) => (
                        <li key={index}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {missingDocuments.title.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm text-gray-900 mb-2">Title Documents</h4>
                    <ul className="pl-5 list-disc text-sm text-gray-600 space-y-1">
                      {missingDocuments.title.map((doc, index) => (
                        <li key={index}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {missingDocuments.insurance.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm text-gray-900 mb-2">Insurance Documents</h4>
                    <ul className="pl-5 list-disc text-sm text-gray-600 space-y-1">
                      {missingDocuments.insurance.map((doc, index) => (
                        <li key={index}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <Button 
                  onClick={() => setIsAddDocumentOpen(true)}
                  className="mt-4"
                >
                  Upload Missing Document
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="upload-new">
            {/* This tab just opens the dialog */}
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Add Document Dialog */}
      <Dialog open={isAddDocumentOpen} onOpenChange={setIsAddDocumentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Insurance Binder.pdf" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="borrower">Borrower</SelectItem>
                        <SelectItem value="property">Property</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="insurance">Insurance</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="mt-4">
                <Label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">
                  Upload File
                </Label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                      >
                        <span>Upload a file</span>
                        <input 
                          id="file-upload" 
                          name="file-upload" 
                          type="file" 
                          className="sr-only"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              form.setValue("name", file.name);
                              form.setValue("fileSize", file.size);
                              form.setValue("fileType", file.type.split('/')[1]);
                              form.setValue("fileId", `temp-${Date.now()}`); // Temporary ID
                            }
                          }}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">PDF, DOC, DOCX, JPG, PNG up to 10MB</p>
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsAddDocumentOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Document</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
