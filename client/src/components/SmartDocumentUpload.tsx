import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Image, File } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface SmartDocumentUploadProps {
  loanId: number;
  onSuccess?: () => void;
}

const documentCategories = [
  { value: "borrower", label: "Borrower Documents" },
  { value: "title", label: "Title Documents" },
  { value: "insurance", label: "Insurance Documents" },
  { value: "current_lender", label: "Current Lender Documents" },
  { value: "other", label: "Other Documents" }
];

const commonDocumentTypes = [
  "Driver's License",
  "Articles of Organization",
  "Operating Agreement",
  "Bank Statements",
  "Voided Check",
  "Property Deed",
  "Title Report",
  "Insurance Policy",
  "Property Tax Bill",
  "Rent Roll",
  "Lease Agreement",
  "Appraisal Report",
  "Other"
];

export default function SmartDocumentUpload({ loanId, onSuccess }: SmartDocumentUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-suggest title based on filename (without extension)
      const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
      setDocumentTitle(nameWithoutExt.replace(/[-_]/g, ' '));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !documentTitle.trim() || !category) {
      toast({
        title: "Missing Information",
        description: "Please select a file, enter a document title, and choose a category.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', documentTitle.trim());
      formData.append('category', category);
      if (documentType && documentType !== 'Other') {
        formData.append('type', documentType);
      }
      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }

      const response = await fetch(`/api/loans/${loanId}/documents`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      
      // Refresh the loan data
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      
      toast({
        title: "Document Uploaded",
        description: `"${documentTitle}" has been successfully uploaded.`
      });

      // Reset form
      setSelectedFile(null);
      setDocumentTitle("");
      setDocumentType("");
      setCategory("");
      setNotes("");
      setIsOpen(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "There was an error uploading your document. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="w-8 h-8 text-blue-500" />;
    } else if (file.type === 'application/pdf') {
      return <FileText className="w-8 h-8 text-red-500" />;
    } else {
      return <File className="w-8 h-8 text-gray-500" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload New Document</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* File Selection */}
          <div>
            <Label htmlFor="file-upload">Select File</Label>
            <div className="mt-2">
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('file-upload')?.click()}
                className="w-full h-20 border-dashed border-2 flex flex-col items-center justify-center"
              >
                {selectedFile ? (
                  <>
                    {getFileIcon(selectedFile)}
                    <span className="text-sm font-medium mt-1">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground mt-1">
                      Click to select a file
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Document Title */}
          <div>
            <Label htmlFor="document-title">Document Title *</Label>
            <Input
              id="document-title"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="e.g., Driver's License - John Smith"
              className="mt-1"
            />
          </div>

          {/* Document Type */}
          <div>
            <Label htmlFor="document-type">Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select document type (optional)" />
              </SelectTrigger>
              <SelectContent>
                {commonDocumentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {documentCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes about this document..."
              className="mt-1"
              rows={2}
            />
          </div>

          {/* Upload Button */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !documentTitle.trim() || !category || isUploading}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}