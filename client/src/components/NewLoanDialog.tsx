import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

interface NewLoanDialogProps {
  onLoanCreated?: (loanId: number) => void;
}

export default function NewLoanDialog({ onLoanCreated }: NewLoanDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driveLink, setDriveLink] = useState("");
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleLinkSubmit = async () => {
    if (!driveLink) {
      toast({
        title: "Missing information",
        description: "Please enter a Google Drive folder link",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setProcessingStatus("Validating Google Drive link...");

    try {
      // Extract folder ID from Google Drive link
      let folderId = "";
      if (driveLink.includes("folders/")) {
        folderId = driveLink.split("folders/")[1].split("?")[0].split("/")[0];
      } else if (driveLink.includes("id=")) {
        folderId = driveLink.split("id=")[1].split("&")[0];
      } else {
        toast({
          title: "Invalid link format",
          description: "Could not extract folder ID from the provided link",
          variant: "destructive",
        });
        setLoading(false);
        setProcessingStatus(null);
        return;
      }

      setProcessingStatus("Accessing Google Drive folder...");
      
      // Call the backend API to process the Google Drive folder
      const response = await apiRequest("POST", "/api/loans/from-drive", { 
        driveFolderId: folderId
      });
      
      if (!response.ok) {
        throw new Error("Failed to process Google Drive folder");
      }

      setProcessingStatus("Analyzing documents...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProcessingStatus("Extracting information...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProcessingStatus("Creating loan file...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const data = await response.json();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
      
      toast({
        title: "Loan created successfully",
        description: "A new loan has been created from your Google Drive documents.",
      });

      // Close the dialog and call the callback with the new loan ID
      setOpen(false);
      if (onLoanCreated && data.loanId) {
        onLoanCreated(data.loanId);
      }
      
      // Navigate to the new loan page
      window.location.href = `/loans/${data.loanId}`;
    } catch (error) {
      console.error("Error processing Google Drive folder:", error);
      toast({
        title: "Error",
        description: "Failed to process Google Drive folder. Please check the link and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setProcessingStatus(null);
      setDriveLink("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-white text-blue-700 hover:bg-blue-50 inline-flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Loan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Loan from Google Drive</DialogTitle>
          <DialogDescription>
            Enter a Google Drive folder link containing loan documents. Our AI will analyze the documents, extract information, and create a loan file automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="driveLink" className="text-right">
              Drive Link
            </Label>
            <Input
              id="driveLink"
              placeholder="https://drive.google.com/drive/folders/..."
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              className="col-span-3"
              disabled={loading}
            />
          </div>
          {processingStatus && (
            <div className="col-span-4 bg-blue-50 p-3 rounded-md">
              <div className="flex items-center">
                <div className="mr-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                </div>
                <div className="text-sm text-blue-700">{processingStatus}</div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleLinkSubmit} disabled={loading}>
            {loading ? "Processing..." : "Process Documents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}