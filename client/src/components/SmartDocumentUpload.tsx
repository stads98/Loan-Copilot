import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, CheckCircle, AlertCircle } from "lucide-react";

interface SmartDocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: number;
  existingDocuments: any[];
  missingDocuments: string[];
  onUploadComplete: () => void;
}

export default function SmartDocumentUpload({ 
  open, 
  onOpenChange, 
  loanId, 
  existingDocuments, 
  missingDocuments,
  onUploadComplete 
}: SmartDocumentUploadProps) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Categorize
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [linkType, setLinkType] = useState<'missing' | 'existing' | 'new'>('missing');
  const [selectedMissing, setSelectedMissing] = useState('');
  const [selectedExisting, setSelectedExisting] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (!uploadedFile) return;

    setIsUploading(true);
    try {
      // Simulate file upload and categorization
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      let category = '';
      let action = '';
      
      if (linkType === 'missing') {
        category = selectedMissing;
        action = `Linked to missing requirement: ${selectedMissing}`;
      } else if (linkType === 'existing') {
        category = selectedExisting;
        action = `Replaced existing document: ${selectedExisting}`;
      } else {
        category = newCategory;
        action = `Added as new document: ${newCategory}`;
      }

      toast({
        title: "Document Uploaded Successfully!",
        description: action,
      });

      onUploadComplete();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setUploadedFile(null);
    setLinkType('missing');
    setSelectedMissing('');
    setSelectedExisting('');
    setNewCategory('');
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetForm();
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Smart Document Upload
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <div className="space-y-2">
                <Label htmlFor="file-upload" className="text-lg font-medium cursor-pointer">
                  Choose a document to upload
                </Label>
                <p className="text-sm text-gray-500">
                  PDF, DOC, or image files up to 10MB
                </p>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button asChild className="mt-4">
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    Select File
                  </Label>
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && uploadedFile && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Selected File</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-medium">{uploadedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Label className="text-base font-medium">How should this document be categorized?</Label>
              
              <RadioGroup value={linkType} onValueChange={(value: 'missing' | 'existing' | 'new') => setLinkType(value)}>
                {/* Link to Missing Document */}
                {missingDocuments.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="missing" id="missing" />
                      <Label htmlFor="missing" className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        Link to missing requirement
                      </Label>
                    </div>
                    {linkType === 'missing' && (
                      <Select value={selectedMissing} onValueChange={setSelectedMissing}>
                        <SelectTrigger className="ml-6">
                          <SelectValue placeholder="Select missing document" />
                        </SelectTrigger>
                        <SelectContent>
                          {missingDocuments.map((doc, index) => (
                            <SelectItem key={index} value={doc}>
                              {doc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Replace Existing Document */}
                {existingDocuments.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="existing" id="existing" />
                      <Label htmlFor="existing" className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Replace existing document
                      </Label>
                    </div>
                    {linkType === 'existing' && (
                      <Select value={selectedExisting} onValueChange={setSelectedExisting}>
                        <SelectTrigger className="ml-6">
                          <SelectValue placeholder="Select document to replace" />
                        </SelectTrigger>
                        <SelectContent>
                          {existingDocuments.map((doc, index) => (
                            <SelectItem key={index} value={doc.name}>
                              {doc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Add as New Document */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="new" id="new" />
                    <Label htmlFor="new" className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      Add as new document
                    </Label>
                  </div>
                  {linkType === 'new' && (
                    <div className="ml-6">
                      <Input
                        placeholder="Enter document category"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </RadioGroup>
            </div>

            {/* Summary */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900">Upload Summary</p>
                    <p className="text-sm text-blue-700">
                      {linkType === 'missing' && selectedMissing && `Will fulfill missing requirement: ${selectedMissing}`}
                      {linkType === 'existing' && selectedExisting && `Will replace: ${selectedExisting}`}
                      {linkType === 'new' && newCategory && `Will add as: ${newCategory}`}
                      {!((linkType === 'missing' && selectedMissing) || (linkType === 'existing' && selectedExisting) || (linkType === 'new' && newCategory)) && 
                        "Please complete the categorization above"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={isUploading || !((linkType === 'missing' && selectedMissing) || (linkType === 'existing' && selectedExisting) || (linkType === 'new' && newCategory))}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload Document'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}