import { Document, Contact } from "@/lib/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartDocumentUpload from "@/components/SmartDocumentUpload";
import SendToAnalyst from "@/components/SendToAnalyst";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2, FileText, Image, File, Download, Trash2, Eye, Check, Plus, X } from "lucide-react";

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
  completedRequirements?: Set<string>;
  onCompletedRequirementsChange?: (completed: Set<string>) => void;
}

export default function DocumentManager({ 
  documents, 
  loanId, 
  contacts, 
  propertyAddress, 
  requiredDocuments, 
  completedRequirements: externalCompletedRequirements,
  onCompletedRequirementsChange 
}: DocumentManagerProps) {
  const [activeTab, setActiveTab] = useState("document-list");
  const [isSyncing, setIsSyncing] = useState(false);
  const [localCompletedRequirements, setLocalCompletedRequirements] = useState<Set<string>>(new Set());
  const [assignedDocuments, setAssignedDocuments] = useState<Record<string, string[]>>({}); // requirement -> document IDs
  const { toast } = useToast();
  
  // Use external completed requirements if provided, otherwise use local state
  const completedRequirements = externalCompletedRequirements || localCompletedRequirements;

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
  
  // Helper functions for managing requirements
  const assignDocumentToRequirement = (requirementName: string, documentId: string) => {
    setAssignedDocuments(prev => ({
      ...prev,
      [requirementName]: [...(prev[requirementName] || []), documentId]
    }));
  };

  const removeDocumentFromRequirement = (requirementName: string, documentId: string) => {
    setAssignedDocuments(prev => ({
      ...prev,
      [requirementName]: (prev[requirementName] || []).filter(id => id !== documentId)
    }));
  };

  const markRequirementComplete = (requirementName: string) => {
    const newCompleted = new Set(Array.from(completedRequirements).concat(requirementName));
    if (onCompletedRequirementsChange) {
      onCompletedRequirementsChange(newCompleted);
    } else {
      setLocalCompletedRequirements(newCompleted);
    }
    toast({
      title: "Requirement Completed",
      description: `"${requirementName}" has been marked as complete.`
    });
  };

  const unmarkRequirementComplete = (requirementName: string) => {
    const newCompleted = new Set(completedRequirements);
    newCompleted.delete(requirementName);
    if (onCompletedRequirementsChange) {
      onCompletedRequirementsChange(newCompleted);
    } else {
      setLocalCompletedRequirements(newCompleted);
    }
  };

  // Calculate missing and completed documents
  const allRequirements = [
    ...requiredDocuments.borrower.map(doc => ({ name: doc, category: "borrower" })),
    ...requiredDocuments.property.map(doc => ({ name: doc, category: "property" })),
    ...requiredDocuments.title.map(doc => ({ name: doc, category: "title" })),
    ...requiredDocuments.insurance.map(doc => ({ name: doc, category: "insurance" }))
  ];

  const missingDocuments = allRequirements.filter(req => !completedRequirements.has(req.name));
  const completedDocuments = allRequirements.filter(req => completedRequirements.has(req.name));

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
              documentAssignments={documentAssignments}
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
              Missing ({missingDocuments.length})
            </TabsTrigger>
            <TabsTrigger value="upload">
              Upload
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedDocuments.length})
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
                  These documents are required but haven't been completed yet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {missingDocuments.length === 0 ? (
                  <p className="text-center text-gray-500">
                    All required documents have been completed!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {missingDocuments.map((req, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <File className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{req.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {req.category}
                            </Badge>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => markRequirementComplete(req.name)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Mark Complete
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <Select onValueChange={(value) => assignDocumentToRequirement(req.name, value)}>
                            <SelectTrigger className="w-[300px]">
                              <SelectValue placeholder="Assign uploaded document..." />
                            </SelectTrigger>
                            <SelectContent>
                              {documents.map((doc) => (
                                <SelectItem key={doc.id} value={doc.id.toString()}>
                                  {doc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="ghost">
                            <Plus className="w-4 h-4 mr-1" />
                            Upload New
                          </Button>
                        </div>
                        
                        {assignedDocuments[req.name] && assignedDocuments[req.name].length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <p className="text-sm text-gray-600 mb-1">Assigned documents:</p>
                            <div className="space-y-1">
                              {assignedDocuments[req.name].map((docId) => {
                                const doc = documents.find(d => d.id.toString() === docId);
                                return doc ? (
                                  <div key={docId} className="flex items-center justify-between p-2 bg-green-50 rounded text-sm">
                                    <div className="flex items-center gap-2">
                                      {getFileIcon(doc)}
                                      <span className="text-green-700">{doc.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => window.open(`/api/documents/${doc.id}/view`, '_blank')}
                                        className="h-6 px-2 text-blue-600 hover:text-blue-700"
                                      >
                                        <Eye className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeDocumentFromRequirement(req.name, docId)}
                                        className="h-6 px-2 text-red-600 hover:text-red-700"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}
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

          <TabsContent value="completed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Completed Requirements</CardTitle>
                <CardDescription>
                  Document requirements that have been satisfied and marked as complete.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completedDocuments.length === 0 ? (
                  <p className="text-center text-gray-500">
                    No requirements have been completed yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {completedDocuments.map((req, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                        <div className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-green-600" />
                          <div>
                            <span className="font-medium text-green-800">{req.name}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {req.category}
                            </Badge>
                            {assignedDocuments[req.name] && assignedDocuments[req.name].length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-green-600 mb-1">Assigned documents:</p>
                                <div className="space-y-1">
                                  {assignedDocuments[req.name].map((docId) => {
                                    const doc = documents.find(d => d.id.toString() === docId);
                                    return doc ? (
                                      <div key={docId} className="flex items-center justify-between p-2 bg-green-100 rounded text-sm">
                                        <div className="flex items-center gap-2">
                                          {getFileIcon(doc)}
                                          <span className="text-green-800">{doc.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => window.open(`/api/documents/${doc.id}/view`, '_blank')}
                                            className="h-6 px-2 text-blue-600 hover:text-blue-700"
                                          >
                                            <Eye className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => removeDocumentFromRequirement(req.name, docId)}
                                            className="h-6 px-2 text-red-600 hover:text-red-700"
                                          >
                                            <X className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => unmarkRequirementComplete(req.name)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Unmark
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}