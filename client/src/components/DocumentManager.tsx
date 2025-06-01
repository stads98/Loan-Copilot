import { Document, Contact } from "@/lib/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SmartDocumentUpload from "@/components/SmartDocumentUpload";
import SendToAnalyst from "@/components/SendToAnalyst";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2, FileText, Image, File, Download, Trash2, Eye } from "lucide-react";

interface DocumentManagerProps {
  documents: Document[];
  loanId: number;
  contacts: Contact[];
  propertyAddress: string;
  requiredDocuments: {
    borrower: string[];
    property: string[];
    title: string[];
    insurance: string[];
  };
}

export default function DocumentManager({ documents, loanId, contacts, propertyAddress, requiredDocuments }: DocumentManagerProps) {
  const [activeTab, setActiveTab] = useState("document-list");
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const syncGoogleDrive = async () => {
    setIsSyncing(true);
    try {
      const response = await apiRequest("POST", `/api/loans/${loanId}/sync-drive`, {});
      if (!response.ok) {
        throw new Error('Sync failed');
      }
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      toast({
        title: "Success",
        description: "Documents synced from Google Drive successfully."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync documents from Google Drive.",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Helper function to check if a document is uploaded
  const isDocumentUploaded = (requiredDocName: string, category: string) => {
    // For now, since we want to show ALL missing documents accurately,
    // only consider a document uploaded if there's an exact or very close match
    // This is a more conservative approach to ensure we show all missing docs
    return documents.some(doc => {
      // Document must be in the correct category
      if (doc.category !== category) return false;
      
      // For very specific matching, we need substantial overlap
      const docNameLower = doc.name.toLowerCase();
      const requiredNameLower = requiredDocName.toLowerCase();
      
      // Check for very specific patterns that indicate a match
      if (requiredNameLower.includes("driver") && docNameLower.includes("driver")) return true;
      if (requiredNameLower.includes("articles") && docNameLower.includes("articles")) return true;
      if (requiredNameLower.includes("operating agreement") && docNameLower.includes("operating")) return true;
      if (requiredNameLower.includes("certificate") && docNameLower.includes("certificate")) return true;
      if (requiredNameLower.includes("ein") && docNameLower.includes("ein")) return true;
      if (requiredNameLower.includes("bank statements") && docNameLower.includes("bank")) return true;
      if (requiredNameLower.includes("voided check") && docNameLower.includes("void")) return true;
      if (requiredNameLower.includes("hud") && docNameLower.includes("hud")) return true;
      if (requiredNameLower.includes("lease") && docNameLower.includes("lease")) return true;
      if (requiredNameLower.includes("appraisal") && docNameLower.includes("appraisal")) return true;
      if (requiredNameLower.includes("insurance policy") && docNameLower.includes("insurance") && !docNameLower.includes("contact")) return true;
      if (requiredNameLower.includes("insurance agent") && docNameLower.includes("insurance") && docNameLower.includes("contact")) return true;
      if (requiredNameLower.includes("title agent") && docNameLower.includes("title") && docNameLower.includes("contact")) return true;
      if (requiredNameLower.includes("kiavi") && docNameLower.includes("kiavi")) return true;
      
      return false;
    });
  };

  // Calculate missing documents based on requirements
  console.log('Required documents received:', requiredDocuments);
  console.log('Current uploaded documents:', documents);
  
  const missingDocuments = {
    borrower: requiredDocuments.borrower.filter(doc => !isDocumentUploaded(doc, "borrower")),
    property: requiredDocuments.property?.filter(doc => !isDocumentUploaded(doc, "property")) || [],
    title: requiredDocuments.title.filter(doc => !isDocumentUploaded(doc, "title")),
    insurance: requiredDocuments.insurance.filter(doc => !isDocumentUploaded(doc, "insurance"))
  };
  
  console.log('Missing documents by category:', missingDocuments);
  
  const allMissingDocuments = [
    ...missingDocuments.borrower.map(doc => ({ name: doc, category: "borrower" })),
    ...missingDocuments.property.map(doc => ({ name: doc, category: "property" })),
    ...missingDocuments.title.map(doc => ({ name: doc, category: "title" })),
    ...missingDocuments.insurance.map(doc => ({ name: doc, category: "insurance" }))
  ];
  
  console.log('All missing documents:', allMissingDocuments);

  const getFileIcon = (document: Document) => {
    if (document.fileType?.includes('image')) {
      return <Image className="w-4 h-4 text-blue-500" />;
    } else if (document.fileType?.includes('pdf')) {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    return <File className="w-4 h-4 text-gray-500" />;
  };

  const viewDocument = async (doc: Document) => {
    try {
      // Open the document in a new tab using Google Drive file ID
      const viewUrl = `https://drive.google.com/file/d/${doc.fileId}/view`;
      window.open(viewUrl, '_blank');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open document.",
        variant: "destructive"
      });
    }
  };

  const downloadDocument = async (doc: Document) => {
    try {
      const response = await apiRequest("GET", `/api/documents/${doc.id}/download`);
      if (response.downloadUrl) {
        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = response.downloadUrl;
        link.download = doc.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Success",
          description: "Download started successfully."
        });
      } else {
        throw new Error('Download URL not available');
      }
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Error",
        description: "Failed to download document.",
        variant: "destructive"
      });
    }
  };

  const deleteDocument = async (docId: number) => {
    try {
      const response = await apiRequest("DELETE", `/api/documents/${docId}`);
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
        toast({
          title: "Success",
          description: "Document deleted successfully."
        });
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete document.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Document Management</h3>
          <div className="flex gap-2">
            <SendToAnalyst 
              documents={documents}
              contacts={contacts}
              loanId={loanId}
              propertyAddress={propertyAddress}
            />
            <Button 
              onClick={syncGoogleDrive}
              disabled={isSyncing}
              variant="outline"
              size="sm"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                "Sync Google Drive"
              )}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="document-list">
              All Documents ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="missing">
              Missing ({allMissingDocuments.length})
            </TabsTrigger>
            <TabsTrigger value="upload">
              Upload
            </TabsTrigger>
            <TabsTrigger value="categories">
              Categories
            </TabsTrigger>
          </TabsList>

          <TabsContent value="document-list" className="space-y-4">
            {documents.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-gray-500">
                    No documents uploaded yet. Use the Upload tab to add documents.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {documents.map((doc) => (
                  <Card key={doc.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc)}
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            {doc.category && (
                              <Badge variant="outline" className="text-xs">
                                {doc.category}
                              </Badge>
                            )}
                            {doc.uploadedAt && (
                              <span>
                                {format(new Date(doc.uploadedAt), "MMM dd, yyyy")}
                              </span>
                            )}
                            {doc.fileSize && (
                              <span>
                                {(doc.fileSize / 1024 / 1024).toFixed(1)} MB
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => viewDocument(doc)}
                          title="View document"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => downloadDocument(doc)}
                          title="Download document"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => deleteDocument(doc.id)}
                          title="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="missing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Missing Documents</CardTitle>
                <CardDescription>
                  These documents are required but haven't been uploaded yet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allMissingDocuments.length === 0 ? (
                  <p className="text-center text-gray-500">
                    All required documents have been uploaded!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allMissingDocuments.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-3">
                          <File className="w-4 h-4 text-gray-400" />
                          <span>{doc.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {doc.category}
                          </Badge>
                        </div>
                        <Button size="sm" variant="outline">
                          Upload
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <SmartDocumentUpload 
              loanId={loanId} 
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
                setActiveTab("document-list");
              }} 
            />
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'borrower', name: 'Borrower Documents', docs: documents.filter(d => d.category === 'borrower') },
                { key: 'property', name: 'Property Documents', docs: documents.filter(d => d.category === 'property') },
                { key: 'title', name: 'Title Documents', docs: documents.filter(d => d.category === 'title') },
                { key: 'insurance', name: 'Insurance Documents', docs: documents.filter(d => d.category === 'insurance') }
              ].map(category => (
                <Card key={category.key}>
                  <CardHeader>
                    <CardTitle className="text-base">{category.name}</CardTitle>
                    <CardDescription>
                      {category.docs.length} documents
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {category.docs.length === 0 ? (
                      <p className="text-sm text-gray-500">No documents in this category</p>
                    ) : (
                      <div className="space-y-2">
                        {category.docs.map(doc => (
                          <div key={doc.id} className="flex items-center gap-2 text-sm">
                            {getFileIcon(doc)}
                            <span className="truncate">{doc.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}