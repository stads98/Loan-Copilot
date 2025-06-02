import { Document, Contact } from "@/lib/types";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, FileText, Image, File, Download, Trash2, Eye, Check, Plus, X, Upload } from "lucide-react";



interface DocumentManagerProps {
  documents: Document[];
  loanId: number;
  loanNumber: string;
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
  loanNumber,
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
  const [customDocuments, setCustomDocuments] = useState<Array<{name: string, category: string}>>([]); // Custom missing documents
  const [newCustomDocumentName, setNewCustomDocumentName] = useState("");
  const [showAddCustomDocument, setShowAddCustomDocument] = useState(false);
  const [showInlineUpload, setShowInlineUpload] = useState<string | null>(null); // Track which requirement is showing upload
  const { toast } = useToast();
  
  // Use external completed requirements if provided, otherwise use local state
  const completedRequirements = externalCompletedRequirements || localCompletedRequirements;

  // Load document assignments from database when component mounts
  useEffect(() => {
    const loadLoanData = async () => {
      try {
        const response = await fetch(`/api/loans/${loanId}`);
        const data = await response.json();
        console.log('Loaded loan data:', data);
        
        if (data.loan?.documentAssignments) {
          console.log('Setting document assignments:', data.loan.documentAssignments);
          setAssignedDocuments(data.loan.documentAssignments);
        } else {
          console.log('No document assignments found in loan data');
        }
      } catch (error) {
        console.error("Failed to load document assignments:", error);
      }
    };
    
    loadLoanData();
  }, [loanId]);

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
  const assignDocumentToRequirement = async (requirementName: string, documentId: string) => {
    const newAssignments = {
      ...assignedDocuments,
      [requirementName]: [...(assignedDocuments[requirementName] || []), documentId]
    };
    setAssignedDocuments(newAssignments);
    
    // Persist to database
    try {
      await apiRequest("PATCH", `/api/loans/${loanId}/document-assignments`, {
        documentAssignments: newAssignments
      });
    } catch (error) {
      console.error("Failed to save document assignments:", error);
    }
  };

  const removeDocumentFromRequirement = async (requirementName: string, documentId: string) => {
    const newAssignments = {
      ...assignedDocuments,
      [requirementName]: (assignedDocuments[requirementName] || []).filter(id => id !== documentId)
    };
    setAssignedDocuments(newAssignments);
    
    // Persist to database
    try {
      await apiRequest("PATCH", `/api/loans/${loanId}/document-assignments`, {
        documentAssignments: newAssignments
      });
    } catch (error) {
      console.error("Failed to save document assignments:", error);
    }
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

  // Functions for custom missing documents
  const addCustomDocument = () => {
    if (newCustomDocumentName.trim()) {
      const newCustomDoc = {
        name: newCustomDocumentName.trim(),
        category: "custom"
      };
      setCustomDocuments(prev => [...prev, newCustomDoc]);
      setNewCustomDocumentName("");
      setShowAddCustomDocument(false);
      toast({
        title: "Custom Document Added",
        description: `"${newCustomDoc.name}" has been added to missing documents.`
      });
    }
  };

  const removeCustomDocument = (documentName: string) => {
    setCustomDocuments(prev => prev.filter(doc => doc.name !== documentName));
    // Also remove from completed requirements if it was marked complete
    const newCompleted = new Set(completedRequirements);
    newCompleted.delete(documentName);
    if (onCompletedRequirementsChange) {
      onCompletedRequirementsChange(newCompleted);
    } else {
      setLocalCompletedRequirements(newCompleted);
    }
    toast({
      title: "Custom Document Removed",
      description: `"${documentName}" has been removed from missing documents.`
    });
  };

  // Calculate missing and completed documents
  const allRequirements = [
    ...requiredDocuments.borrower.map(doc => ({ name: doc, category: "borrower" })),
    ...requiredDocuments.property.map(doc => ({ name: doc, category: "property" })),
    ...requiredDocuments.title.map(doc => ({ name: doc, category: "title" })),
    ...requiredDocuments.insurance.map(doc => ({ name: doc, category: "insurance" })),
    ...customDocuments // Include custom documents in the list
  ];

  const missingDocuments = allRequirements.filter(req => !completedRequirements.has(req.name));
  const completedDocuments = allRequirements.filter(req => completedRequirements.has(req.name));

  // Handle document preview
  const handleDocumentPreview = async (document: Document) => {
    try {
      console.log('Previewing document:', document);
      const response = await fetch(`/api/documents/${document.id}/view`);
      const data = await response.json();
      console.log('Preview response:', data);
      
      if (data.type === 'drive' && data.viewUrl) {
        console.log('Opening Google Drive URL:', data.viewUrl);
        window.open(data.viewUrl, '_blank');
      } else if (data.type === 'upload' && data.fileUrl) {
        console.log('Opening upload URL:', data.fileUrl);
        window.open(data.fileUrl, '_blank');
      } else {
        console.error('Invalid preview data:', data);
        toast({
          title: "Error",
          description: "Invalid document preview data",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Error",
        description: "Failed to preview document",
        variant: "destructive"
      });
    }
  };

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
      // Call the view endpoint to determine document type and get view URL
      const response = await apiRequest("GET", `/api/documents/${doc.id}/view`);
      
      if (response.type === 'drive') {
        // Open Google Drive document in new tab
        window.open(response.viewUrl, '_blank');
      } else if (response.type === 'upload') {
        // For uploaded documents, open the file directly
        window.open(response.fileUrl, '_blank');
      }
    } catch (error) {
      console.error("View document error:", error);
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
              loanNumber={loanNumber}
              propertyAddress={propertyAddress}
              documentAssignments={assignedDocuments}
              completedRequirements={Array.from(completedRequirements)}
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
                {documents
                  .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())
                  .map((doc) => (
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
                                {format(new Date(doc.uploadedAt), "MMM dd, yyyy 'at' h:mm a")}
                              </span>
                            )}
                            {doc.fileSize && (
                              <span>
                                {doc.fileSize >= 1024 * 1024 
                                  ? `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB`
                                  : `${Math.round(doc.fileSize / 1024)} KB`
                                }
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
                {/* Add Custom Document Section */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Add Custom Requirement</h4>
                    {!showAddCustomDocument && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setShowAddCustomDocument(true)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Custom Requirement
                      </Button>
                    )}
                  </div>
                  
                  {showAddCustomDocument && (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="e.g., Bank statement for account ending in 5466"
                        value={newCustomDocumentName}
                        onChange={(e) => setNewCustomDocumentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addCustomDocument()}
                        className="flex-1"
                      />
                      <Button 
                        size="sm" 
                        onClick={addCustomDocument}
                        disabled={!newCustomDocumentName.trim()}
                      >
                        Add
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => {
                          setShowAddCustomDocument(false);
                          setNewCustomDocumentName("");
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

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
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => markRequirementComplete(req.name)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Mark Complete
                            </Button>
                            {req.category === "custom" && (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => removeCustomDocument(req.name)}
                                className="text-red-600 hover:text-red-700"
                                title="Remove custom document"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => setShowInlineUpload(showInlineUpload === req.name ? null : req.name)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            {showInlineUpload === req.name ? 'Cancel Upload' : 'Upload New'}
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
                                        onClick={() => handleDocumentPreview(doc)}
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
                        
                        {/* Inline Upload Section */}
                        {showInlineUpload === req.name && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-sm font-medium text-blue-900">Upload for {req.name}</h5>
                              <Button size="sm" variant="ghost" onClick={() => setShowInlineUpload(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            
                            <div className="space-y-3">
                              <div>
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                  multiple
                                  onChange={async (e) => {
                                    const files = Array.from(e.target.files || []);
                                    if (files.length > 0) {
                                      // Handle multiple file uploads
                                      const uploadPromises = files.map(async (file) => {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        formData.append('name', `${req.name} - ${file.name.split('.').slice(0, -1).join('.')}`);
                                        formData.append('category', 'borrower');
                                        
                                        return fetch(`/api/loans/${loanId}/documents`, {
                                          method: 'POST',
                                          body: formData
                                        });
                                      });
                                      
                                      try {
                                        const responses = await Promise.all(uploadPromises);
                                        const successCount = responses.filter(r => r.ok).length;
                                        const failCount = responses.length - successCount;
                                        
                                        // Get the uploaded document IDs and assign them to the requirement
                                        const uploadedDocumentIds = [];
                                        for (let i = 0; i < responses.length; i++) {
                                          if (responses[i].ok) {
                                            const docData = await responses[i].json();
                                            uploadedDocumentIds.push(docData.id.toString());
                                          }
                                        }
                                        
                                        // Assign all successfully uploaded documents to this requirement
                                        uploadedDocumentIds.forEach(docId => {
                                          assignDocumentToRequirement(req.name, docId);
                                        });
                                        
                                        queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
                                        setShowInlineUpload(null);
                                        
                                        if (failCount === 0) {
                                          toast({
                                            title: "Documents uploaded successfully",
                                            description: `${successCount} document${successCount > 1 ? 's' : ''} uploaded for ${req.name}`,
                                          });
                                        } else {
                                          toast({
                                            title: "Partial upload success",
                                            description: `${successCount} uploaded, ${failCount} failed`,
                                            variant: "destructive"
                                          });
                                        }
                                      } catch (error) {
                                        toast({
                                          title: "Upload Failed",
                                          description: "There was an error uploading your documents.",
                                          variant: "destructive"
                                        });
                                      }
                                    }
                                  }}
                                  className="hidden"
                                  id={`file-upload-${req.name}`}
                                />
                                <Button
                                  variant="outline"
                                  onClick={() => document.getElementById(`file-upload-${req.name}`)?.click()}
                                  className="w-full h-12 border-dashed border-2 flex items-center justify-center"
                                >
                                  <Upload className="w-4 h-4 mr-2" />
                                  Select Files to Upload
                                </Button>
                              </div>
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
                                            onClick={() => handleDocumentPreview(doc)}
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