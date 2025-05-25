import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Define lender-specific document requirements
const lenderRequirements = {
  kiavi: {
    name: "Kiavi",
    documents: [
      "HUD Settlement Statement",
      "Deed (proof of ownership)",
      "All Current Leases",
      "Insurance Policy",
      "Insurance Agent Information",
      "Title/Closing Agent Information",
      "Title Documents",
      "Payoff Letter",
      "Existing Lender Contact Info",
      "LLC Docs (Articles, Operating Agreement, Good Standing, EIN)",
      "Voided Check or ACH Form",
      "2 Recent Bank Statements"
    ]
  },
  roc360: {
    name: "Roc360",
    documents: [
      "Driver's License",
      "Entity Documents",
      "DSCR Eligibility Form",
      "Insurance Declaration Page",
      "Closing Disclosure",
      "Title Commitment",
      "Lease Agreements",
      "Bank Statements (2 months)",
      "Purchase Agreement (if purchase)",
      "Capital Reserve Verification"
    ]
  },
  coreVest: {
    name: "CoreVest",
    documents: [
      "Personal Guarantor Documentation",
      "Entity Formation Documents",
      "Purchase Contract (if purchase)",
      "Insurance Evidence",
      "Rent Roll",
      "Property Management Agreement",
      "Lease Agreements",
      "Title Report",
      "Appraisal Order Form",
      "Bank Statements (2 months)"
    ]
  },
  civic: {
    name: "Civic Financial",
    documents: [
      "Driver's License",
      "Purchase Contract (if purchase)",
      "Entity Documents",
      "Property Insurance",
      "Title Report",
      "Lease Agreements",
      "Bank Statements (2 months)",
      "Credit Authorization",
      "Borrower Certification",
      "Flood Certification"
    ]
  }
};

interface ChecklistGeneratorProps {
  loanId: number;
  onAddTasks: (tasks: string[]) => Promise<void>;
}

export default function ChecklistGenerator({ loanId, onAddTasks }: ChecklistGeneratorProps) {
  const [selectedLender, setSelectedLender] = useState<string>("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const { toast } = useToast();

  const handleLenderChange = (value: string) => {
    setSelectedLender(value);
    setSelectedDocs([]);
  };

  const toggleDocument = (doc: string) => {
    if (selectedDocs.includes(doc)) {
      setSelectedDocs(selectedDocs.filter(d => d !== doc));
    } else {
      setSelectedDocs([...selectedDocs, doc]);
    }
  };

  const selectAll = () => {
    if (selectedLender) {
      setSelectedDocs([...lenderRequirements[selectedLender as keyof typeof lenderRequirements].documents]);
    }
  };

  const clearAll = () => {
    setSelectedDocs([]);
  };

  const generateTasks = async () => {
    if (selectedDocs.length === 0) {
      toast({
        title: "No documents selected",
        description: "Please select at least one document to create tasks",
        variant: "destructive"
      });
      return;
    }

    try {
      // Generate tasks from selected documents
      const tasks = selectedDocs.map(doc => `Collect ${doc}`);
      await onAddTasks(tasks);
      
      toast({
        title: "Tasks created",
        description: `Successfully created ${tasks.length} tasks for document collection`,
      });
      
      // Reset selections
      setSelectedDocs([]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create tasks. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-heading flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Lender Checklist Generator
        </CardTitle>
        <CardDescription>Create tasks based on lender-specific document requirements</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Lender</label>
            <Select value={selectedLender} onValueChange={handleLenderChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a lender" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(lenderRequirements).map((lender) => (
                  <SelectItem key={lender} value={lender}>
                    {lenderRequirements[lender as keyof typeof lenderRequirements].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedLender && (
            <>
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium text-gray-900">Required Documents</h4>
                <div className="space-x-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>Clear All</Button>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md space-y-3 max-h-60 overflow-y-auto">
                {lenderRequirements[selectedLender as keyof typeof lenderRequirements].documents.map((doc, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`doc-${index}`} 
                      checked={selectedDocs.includes(doc)}
                      onCheckedChange={() => toggleDocument(doc)}
                    />
                    <label 
                      htmlFor={`doc-${index}`}
                      className="text-sm text-gray-700 flex items-center justify-between w-full"
                    >
                      <span>{doc}</span>
                      <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
                    </label>
                  </div>
                ))}
              </div>
              
              <div className="pt-2">
                <p className="text-sm text-gray-500">
                  Selected {selectedDocs.length} of {lenderRequirements[selectedLender as keyof typeof lenderRequirements].documents.length} documents
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={generateTasks} 
          disabled={selectedDocs.length === 0 || !selectedLender}
          className="w-full"
        >
          Generate Tasks from Checklist
        </Button>
      </CardFooter>
    </Card>
  );
}