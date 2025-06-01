import { Document, Contact } from "@/lib/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, FileText, Users, Send } from "lucide-react";
import { format } from "date-fns";

interface SendToAnalystProps {
  documents: Document[];
  contacts: Contact[];
  loanId: number;
  propertyAddress: string;
  documentAssignments?: Record<string, string[]>; // requirement name -> document IDs
}

export default function SendToAnalyst({ 
  documents, 
  contacts, 
  loanId, 
  propertyAddress,
  documentAssignments = {}
}: SendToAnalystProps) {
  const [open, setOpen] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [selectedAnalysts, setSelectedAnalysts] = useState<number[]>([]);
  const [customMessage, setCustomMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  // Filter analysts from contacts
  const analysts = contacts.filter(contact => 
    contact.role === "analyst" || contact.isAnalyst
  );

  const toggleDocument = (docId: number) => {
    setSelectedDocuments(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const toggleAnalyst = (contactId: number) => {
    setSelectedAnalysts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAllDocuments = () => {
    setSelectedDocuments(documents.map(doc => doc.id));
  };

  const clearAllDocuments = () => {
    setSelectedDocuments([]);
  };

  const generateEmailContent = () => {
    const selectedDocs = documents.filter(doc => selectedDocuments.includes(doc.id));
    const selectedAnalystContacts = contacts.filter(contact => selectedAnalysts.includes(contact.id));
    
    // Create a mapping of document ID to requirement name
    const docToRequirement: Record<string, string> = {};
    Object.entries(documentAssignments).forEach(([requirementName, docIds]) => {
      docIds.forEach(docId => {
        docToRequirement[docId] = requirementName;
      });
    });
    
    const documentList = selectedDocs.map(doc => {
      const requirementName = docToRequirement[doc.id.toString()];
      const category = requirementName || (doc.category ? doc.category.toUpperCase() : 'DOCUMENT');
      return `• ${doc.name} (${category})`;
    }).join('\n');

    // Create greeting with analyst names
    const greeting = selectedAnalystContacts.length > 1 
      ? `Dear ${selectedAnalystContacts.map(contact => contact.name.split(' ')[0]).join(' and ')},`
      : `Dear ${selectedAnalystContacts[0]?.name.split(' ')[0] || 'Analyst'},`;

    const emailContent = `
Subject: ${propertyAddress} (Loan #${loanId}) - Documents Attached

${greeting}

Please review the attached documents for the loan file:

Property: ${propertyAddress}
Loan ID: ${loanId}
Date: ${format(new Date(), 'MMMM dd, yyyy')}

Documents attached (${selectedDocs.length}):
${documentList}

${customMessage ? `Additional Notes:\n${customMessage}\n` : ''}
Please review and let us know if you need any additional documentation.

Best regards,
Loan Processing Team
    `.trim();

    return {
      content: emailContent,
      recipients: selectedAnalystContacts.map(contact => contact.email).filter(Boolean),
      documentIds: selectedDocuments
    };
  };

  const sendToAnalyst = async () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one document to send.",
        variant: "destructive"
      });
      return;
    }

    if (selectedAnalysts.length === 0) {
      toast({
        title: "Error", 
        description: "Please select at least one analyst to send to.",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const emailData = generateEmailContent();
      
      const response = await apiRequest("POST", `/api/loans/${loanId}/send-to-analyst`, {
        documentIds: selectedDocuments,
        analystIds: selectedAnalysts,
        customMessage,
        emailContent: emailData.content,
        recipients: emailData.recipients
      });

      toast({
        title: "Success",
        description: `Email drafted and ready to send to ${selectedAnalysts.length} analyst(s) with ${selectedDocuments.length} document(s).`
      });

      setOpen(false);
      setSelectedDocuments([]);
      setSelectedAnalysts([]);
      setCustomMessage("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to prepare email for analysts.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Mail className="w-4 h-4" />
          Send to Analyst
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Send Documents to Analyst
          </DialogTitle>
          <DialogDescription>
            Select documents and analysts to create an email package for review.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Document Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Select Documents ({selectedDocuments.length}/{documents.length})
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllDocuments}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAllDocuments}
                >
                  Clear All
                </Button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-3">
              {documents.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No documents available
                </p>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedDocuments.includes(doc.id)}
                      onCheckedChange={() => toggleDocument(doc.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <label 
                        htmlFor={`doc-${doc.id}`}
                        className="text-sm font-medium cursor-pointer truncate block"
                      >
                        {doc.name}
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        {doc.category && (
                          <Badge variant="outline" className="text-xs">
                            {doc.category}
                          </Badge>
                        )}
                        {doc.fileSize && (
                          <span className="text-xs text-gray-500">
                            {(doc.fileSize / 1024 / 1024).toFixed(1)} MB
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Analyst Selection */}
          <div className="space-y-4">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Select Analysts ({selectedAnalysts.length}/{analysts.length})
            </Label>

            <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-3">
              {analysts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No analysts assigned to this loan.
                  <br />
                  Add analysts in the Contacts section.
                </p>
              ) : (
                analysts.map((analyst) => (
                  <div key={analyst.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                    <Checkbox
                      id={`analyst-${analyst.id}`}
                      checked={selectedAnalysts.includes(analyst.id)}
                      onCheckedChange={() => toggleAnalyst(analyst.id)}
                    />
                    <div className="flex-1">
                      <label 
                        htmlFor={`analyst-${analyst.id}`}
                        className="text-sm font-medium cursor-pointer block"
                      >
                        {analyst.name}
                      </label>
                      {analyst.email && (
                        <p className="text-xs text-gray-500">{analyst.email}</p>
                      )}
                      {analyst.company && (
                        <p className="text-xs text-gray-400">{analyst.company}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Custom Message */}
        <div className="space-y-2">
          <Label htmlFor="custom-message" className="text-sm font-medium">
            Additional Notes (Optional)
          </Label>
          <Textarea
            id="custom-message"
            placeholder="Add any additional notes or instructions for the analysts..."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={3}
          />
        </div>

        {/* Email Preview */}
        {selectedDocuments.length > 0 && selectedAnalysts.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <Label className="text-sm font-medium mb-2 block">Email Preview:</Label>
              <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-line max-h-32 overflow-y-auto">
                {generateEmailContent().content}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={sendToAnalyst}
            disabled={isSending || selectedDocuments.length === 0 || selectedAnalysts.length === 0}
            className="gap-2"
          >
            {isSending ? (
              "Preparing..."
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Draft Email ({selectedDocuments.length} docs)
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}