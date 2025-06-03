import { Document, Contact } from "@/lib/types";
import { useState } from "react";
import DocumentChecklist from "./DocumentChecklist";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DocumentProgressProps {
  documents: Document[];
  requiredDocuments: {
    borrower: string[];
    property: string[];
    title: string[];
    insurance: string[];
  };
  contacts?: Contact[];
  loanDetails?: any;
  completedRequirements?: Set<string>;
  onCompletedRequirementsChange?: (completed: Set<string>) => void;
  documentAssignments?: Record<string, string[]>;
}

export default function DocumentProgress({ documents, requiredDocuments, contacts = [], loanDetails, completedRequirements = new Set(), onCompletedRequirementsChange, documentAssignments = {} }: DocumentProgressProps) {
  const [showChecklist, setShowChecklist] = useState(false);
  const [showAssignments, setShowAssignments] = useState(false);
  
  // Get all assigned document IDs
  const assignedDocumentIds = new Set(
    Object.values(documentAssignments).flat()
  );
  
  // Get unassigned documents (not assigned to any requirement, regardless of category)
  const unassignedDocs = documents.filter(doc => 
    !assignedDocumentIds.has(doc.id.toString())
  );
  
  // Get all required document names for assignment dropdown
  const allRequiredDocs = [
    ...requiredDocuments.borrower.map(name => ({ name, category: 'borrower' })),
    ...requiredDocuments.title.map(name => ({ name, category: 'title' })),
    ...requiredDocuments.insurance.map(name => ({ name, category: 'insurance' }))
  ];

  // Helper function to find contact by role
  const findContactByRole = (role: string) => {
    return contacts.find(contact => 
      contact.role.toLowerCase().includes(role.toLowerCase())
    );
  };

  // Find specific contacts
  const titleContact = findContactByRole("title");
  const insuranceContact = findContactByRole("insurance");

  // Calculate completed requirements for each category based on manual assignments
  const borrowerDocs = requiredDocuments.borrower.filter(req => completedRequirements.has(req)).length;
  const titleDocs = requiredDocuments.title.filter(req => completedRequirements.has(req)).length;
  const insuranceDocs = requiredDocuments.insurance.filter(req => completedRequirements.has(req)).length;
  
  // Calculate required counts
  const borrowerRequired = requiredDocuments.borrower.length;
  const titleRequired = requiredDocuments.title.length;
  const insuranceRequired = requiredDocuments.insurance.length;
  
  // Calculate percentages
  const borrowerPercentage = Math.round((borrowerDocs / borrowerRequired) * 100) || 0;
  const titlePercentage = Math.round((titleDocs / titleRequired) * 100) || 0;
  const insurancePercentage = Math.round((insuranceDocs / insuranceRequired) * 100) || 0;
  
  // Calculate overall percentage
  const totalDocs = borrowerDocs + titleDocs + insuranceDocs;
  const totalRequired = borrowerRequired + titleRequired + insuranceRequired;
  const overallPercentage = Math.round((totalDocs / totalRequired) * 100) || 0;
  
  return (
    <div>

      {/* Document Checklist Modal */}
      <Dialog open={showChecklist} onOpenChange={setShowChecklist}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Document Checklist</DialogTitle>
          </DialogHeader>
          <DocumentChecklist 
            loanDetails={loanDetails || { lender: { name: "AHL" } }}
          />
        </DialogContent>
      </Dialog>

      {/* File Assignment Modal */}
      <Dialog open={showAssignments} onOpenChange={setShowAssignments}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Uploaded Files to Document Requirements</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Match your uploaded Google Drive files to the specific document requirements below.
            </p>
            
            {unassignedDocs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>All files have been assigned to document requirements.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {unassignedDocs.map((doc, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900 mb-1">{doc.name}</h4>
                        <p className="text-xs text-gray-500 mb-3">
                          Uploaded: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'Date unknown'}
                        </p>
                        
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">
                            Assign to requirement:
                          </label>
                          <Select onValueChange={(value) => {
                            const [category, docName] = value.split('|');
                            // Handle assignment logic here
                            console.log(`Assigning ${doc.name} to ${docName} in ${category} category`);
                          }}>
                            <SelectTrigger className="w-64">
                              <SelectValue placeholder="Select document type..." />
                            </SelectTrigger>
                            <SelectContent>
                              <div className="p-2 text-xs font-medium text-blue-700 bg-blue-50">Borrower Documents</div>
                              {requiredDocuments.borrower.map((reqDoc, idx) => (
                                <SelectItem key={`borrower-${idx}`} value={`borrower|${reqDoc}`}>
                                  {reqDoc}
                                </SelectItem>
                              ))}
                              <div className="p-2 text-xs font-medium text-purple-700 bg-purple-50 mt-2">Title Documents</div>
                              {requiredDocuments.title.map((reqDoc, idx) => (
                                <SelectItem key={`title-${idx}`} value={`title|${reqDoc}`}>
                                  {reqDoc}
                                </SelectItem>
                              ))}
                              <div className="p-2 text-xs font-medium text-green-700 bg-green-50 mt-2">Insurance Documents</div>
                              {requiredDocuments.insurance.map((reqDoc, idx) => (
                                <SelectItem key={`insurance-${idx}`} value={`insurance|${reqDoc}`}>
                                  {reqDoc}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <Button variant="outline" onClick={() => setShowAssignments(false)}>
                    Done Assigning
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}