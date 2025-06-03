import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, FileText, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

interface FolderItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  mimeType?: string;
  size?: number;
}

interface FolderBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFolder: (folderId: string, folderName: string) => void;
  currentLoanAddress?: string;
  onLoanCreated?: (loanId: number) => void;
  existingLoanId?: number; // If provided, sync to existing loan instead of creating new one
}

export default function FolderBrowser({ open, onOpenChange, onSelectFolder, currentLoanAddress, onLoanCreated, existingLoanId }: FolderBrowserProps) {
  const [currentFolderId, setCurrentFolderId] = useState("1hqWhYyq9XzTg_LRfQCuNcNwwb2lX82qY"); // Your actual loan files folder
  const [currentPath, setCurrentPath] = useState(["All Loan Files"]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      loadFolderContents(currentFolderId);
    }
  }, [open, currentFolderId]);

  const loadFolderContents = async (folderId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drive/folders/${folderId}/contents`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      } else if (response.status === 401) {
        const data = await response.json();
        if (data.needsAuth) {
          // Need to authenticate with Google first
          window.open('/api/auth/google', 'google-auth', 'width=600,height=600');
          toast({
            title: "Authentication Required",
            description: "Please authenticate with Google Drive to access your folders.",
          });
        }
        setItems([]);
      } else {
        toast({
          title: "Error",
          description: "Failed to load folder contents. Please try again.",
          variant: "destructive"
        });
        setItems([]);
      }
    } catch (error) {
      // Demo data for testing - use unique mock IDs to avoid conflicts
      const mockItems: FolderItem[] = [
        { id: "mock_folder_1", name: "123 Main St - Purchase", type: "folder" },
        { id: "mock_folder_2", name: "456 Oak Ave - Refinance", type: "folder" },
        { id: "mock_folder_3", name: "789 Pine Rd - Cash Out Refi", type: "folder" },
        { id: "mock_folder_4", name: "321 Elm St - Purchase", type: "folder" },
        { id: "mock_folder_5", name: "654 Maple Dr - DSCR Loan", type: "folder" },
      ];
      setItems(mockItems);
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setCurrentPath([...currentPath, folderName]);
    setSelectedFolder(null);
  };

  const navigateBack = () => {
    if (currentPath.length > 1) {
      // In a real implementation, you'd track the folder ID history
      // For now, just go back to the main folder
      setCurrentFolderId("1j57ZmNZQaTIAKIFLkNWDPyccUENfuXsS");
      setCurrentPath(currentPath.slice(0, -1));
      setSelectedFolder(null);
    }
  };

  const handleSelectFolder = async () => {
    if (selectedFolder) {
      setProcessing(true);
      
      try {
        toast({
          title: "Processing Documents",
          description: `Scanning all documents in ${selectedFolder.name}...`,
        });

        let response;
        if (existingLoanId) {
          // Sync documents to existing loan
          response = await apiRequest("POST", `/api/loans/${existingLoanId}/sync-documents`, {
            folderId: selectedFolder.id
          });
        } else {
          // Create new loan with documents
          response = await apiRequest("POST", "/api/loans/scan-folder", {
            folderId: selectedFolder.id,
            loanData: {
              borrowerName: "Borrower from Documents",
              propertyAddress: "Property from Documents", 
              propertyType: "Residential",
              loanAmount: "250000",
              loanType: "DSCR",
              loanPurpose: "Purchase",
              lender: "Kiavi"
            }
          });
        }

        if (response.success) {
          if (existingLoanId) {
            toast({
              title: "Documents Synced Successfully!",
              description: `Added ${response.documentsAdded || response.documentsProcessed} documents to the existing loan.`,
            });
            
            // Refresh the specific loan data
            await queryClient.invalidateQueries({ queryKey: [`/api/loans/${existingLoanId}`] });
          } else {
            toast({
              title: "Loan Created Successfully!",
              description: `Processed ${response.documentsProcessed} documents and created loan file.`,
            });

            // Refresh the loans list
            await queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
            
            if (onLoanCreated && response.loanId) {
              onLoanCreated(response.loanId);
            }
          }

          onSelectFolder(selectedFolder.id, selectedFolder.name);
          onOpenChange(false);
        } else {
          throw new Error(response.message || "Failed to process documents");
        }
      } catch (error: any) {
        toast({
          title: "Processing Failed",
          description: error.message || "Failed to process documents. Please try again.",
          variant: "destructive",
        });
      } finally {
        setProcessing(false);
      }
    }
  };

  const getBreadcrumb = () => {
    return currentPath.join(" > ");
  };

  const isCurrentLoanFolder = (folderName: string) => {
    if (!currentLoanAddress) return false;
    return folderName.toLowerCase().includes(currentLoanAddress.toLowerCase().split(',')[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Select Loan Folder
          </DialogTitle>
          <DialogDescription>
            Browse through your Google Drive folders and select the one containing documents for this loan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="w-4 h-4" />
            <span>{getBreadcrumb()}</span>
          </div>

          {/* Back button */}
          {currentPath.length > 1 && (
            <Button variant="outline" size="sm" onClick={navigateBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          {/* Folder contents */}
          <div className="border rounded-lg max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading folders...</span>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {items.filter(item => item.type === 'folder').map((item) => (
                  <Card 
                    key={item.id} 
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedFolder?.id === item.id ? 'bg-primary/10 border-primary' : ''
                    } ${isCurrentLoanFolder(item.name) ? 'bg-green-50 border-green-200' : ''}`}
                    onClick={() => setSelectedFolder({ id: item.id, name: item.name })}
                    onDoubleClick={() => navigateToFolder(item.id, item.name)}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <FolderOpen className="w-5 h-5 text-blue-600" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.name}</span>
                          {isCurrentLoanFolder(item.name) && (
                            <Badge variant="outline" className="text-green-700 border-green-300">
                              Suggested
                            </Badge>
                          )}
                        </div>
                      </div>
                      {selectedFolder?.id === item.id && (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      )}
                    </CardContent>
                  </Card>
                ))}
                
                {items.filter(item => item.type === 'folder').length === 0 && !loading && (
                  <div className="text-center p-8 text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No folders found in this location</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* File count info */}
          {items.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {items.filter(item => item.type === 'folder').length} folders, {items.filter(item => item.type === 'file').length} files
            </div>
          )}

          {/* Selected folder info */}
          {selectedFolder && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Selected: {selectedFolder.name}</p>
                    <p className="text-sm text-blue-700">This folder will be connected to your loan file for automatic document analysis.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelectFolder} 
            disabled={!selectedFolder || processing}
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing Documents...
              </>
            ) : (
              "Process All Documents"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}