import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertCircle, FileText, Users, DollarSign, Home, ClipboardList, Shield, Building, CreditCard } from "lucide-react";

interface DocumentRequirement {
  id: string;
  name: string;
  required: boolean;
  category: string;
  description?: string;
  funderSpecific?: boolean;
}

interface DocumentChecklistProps {
  loanDetails: any;
  onDocumentToggle?: (documentId: string, completed: boolean) => void;
}

const categoryIcons: Record<string, any> = {
  "borrower_entity": Users,
  "financials": DollarSign,
  "property": Home,
  "appraisal": ClipboardList,
  "insurance": Shield,
  "title": Building,
  "payoff": CreditCard,
  "lender_specific": FileText,
};

const categoryNames: Record<string, string> = {
  "borrower_entity": "Borrower & Entity Documents",
  "financials": "Financial Documents",
  "property": "Property Ownership",
  "appraisal": "Appraisal",
  "insurance": "Insurance",
  "title": "Title",
  "payoff": "Payoff Information",
  "lender_specific": "Lender-Specific Documents"
};

// Document requirements by funder
export const getDocumentRequirements = (funder: string): DocumentRequirement[] => {
  const baseRequirements: DocumentRequirement[] = [
    // Borrower & Entity Docs
    { id: "drivers_license", name: "Driver's License (front and back)", required: true, category: "borrower_entity" },
    { id: "articles_org", name: "Articles of Organization / Incorporation", required: true, category: "borrower_entity" },
    { id: "operating_agreement", name: "Operating Agreement", required: true, category: "borrower_entity" },
    { id: "good_standing", name: "Certificate of Good Standing", required: true, category: "borrower_entity" },
    { id: "ein_letter", name: "EIN Letter from IRS", required: true, category: "borrower_entity" },
    
    // Financials
    { id: "bank_statements", name: "2 most recent Bank Statements", required: true, category: "financials" },
    { id: "voided_check", name: "Voided Check", required: true, category: "financials" },
    
    // Property Ownership
    { id: "property_ownership", name: "HUD or Other Documentation of Property Ownership", required: true, category: "property" },
    { id: "current_leases", name: "All Current Leases", required: true, category: "property" },
    
    // Appraisal
    { id: "appraisal", name: "Appraisal (Ordered through AMC)", required: true, category: "appraisal" },
    
    // Insurance
    { id: "insurance_policy", name: "Insurance Policy", required: true, category: "insurance" },
    { id: "insurance_contact", name: "Insurance Agent Contact Info", required: true, category: "insurance" },
    { id: "flood_policy", name: "Flood Policy (If applicable)", required: false, category: "insurance" },
    { id: "flood_contact", name: "Flood Insurance Agent Contact Info", required: false, category: "insurance" },
    
    // Title
    { id: "title_contact", name: "Title Agent Contact Info", required: true, category: "title" },
    
    // Payoff (if applicable)
    { id: "lender_contact", name: "Current Lender Contact Info", required: false, category: "payoff" },
    { id: "payoff_statement", name: "Payoff Statement and VOM", required: false, category: "payoff" },
  ];

  switch (funder?.toLowerCase()) {
    case 'kiavi':
      return [
        ...baseRequirements,
        { id: "kiavi_auth_form", name: "Kiavi Borrowing Authorization Form (from Kiavi Portal)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "kiavi_disclosure", name: "Kiavi Disclosure Form (from Kiavi Portal)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "kiavi_liquidity", name: "Proof of Liquidity/Down Payment", required: true, category: "lender_specific", funderSpecific: true },
        { id: "kiavi_reserves", name: "Proof of Reserves (6 months PITI)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "kiavi_background", name: "Kiavi Background Check Authorization (from Kiavi Portal)", required: true, category: "lender_specific", funderSpecific: true },
      ];

    case 'visio':
      return [
        ...baseRequirements,
        { id: "visio_application", name: "Visio Financial Services Loan Application (from Visio Portal)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "visio_broker_submission", name: "Broker Submission Form (from Visio Portal)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "visio_broker_w9", name: "Broker W9 Form (from Visio Portal)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "visio_plaid_liquidity", name: "Proof of Liquidity via Plaid Connection (from loan analysis email)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "visio_rent_collection", name: "Proof of Rent Collection Deposits", required: false, category: "lender_specific", funderSpecific: true, description: "Required if lease rents exceed market rents" },
        { id: "visio_asset_verification", name: "Asset Verification Documentation", required: true, category: "lender_specific", funderSpecific: true },
      ];

    case 'roc_capital':
      return [
        ...baseRequirements,
        { id: "roc_background", name: "ROC Capital Background/Credit Authorization", required: true, category: "lender_specific", funderSpecific: true },
        { id: "roc_ach_consent", name: "ROC ACH Consent Form", required: true, category: "lender_specific", funderSpecific: true },
        { id: "roc_property_tax", name: "Current Property Tax Bill", required: true, category: "lender_specific", funderSpecific: true },
        { id: "roc_liquidity", name: "Proof of Liquidity and Down Payment", required: true, category: "lender_specific", funderSpecific: true },
        { id: "roc_business_purpose", name: "ROC Business Purpose Statement", required: true, category: "lender_specific", funderSpecific: true },
        { id: "roc_rent_collection", name: "3 Months Rent Collection History", required: false, category: "lender_specific", funderSpecific: true, description: "Required for all rental units" },
        { id: "roc_security_deposits", name: "Security Deposit Documentation", required: false, category: "lender_specific", funderSpecific: true, description: "Required for new leases under 30 days" },
      ];

    case 'ahl':
      return [
        ...baseRequirements,
        { id: "ahl_entity_resolution", name: "Entity Resolution (AHL template)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "ahl_business_purpose", name: "Borrower's Statement of Business Purpose (AHL template)", required: true, category: "lender_specific", funderSpecific: true },
        { id: "ahl_liquidity_proof", name: "Proof of Liquidity / Funds to Close", required: true, category: "lender_specific", funderSpecific: true },
        { id: "ahl_piti_reserves", name: "6 Months PITI Reserves", required: true, category: "lender_specific", funderSpecific: true, description: "Must be documented" },
        { id: "ahl_vom_12mo", name: "VOM showing 12 months payment history", required: false, category: "lender_specific", funderSpecific: true },
        { id: "ahl_mortgage_statements", name: "2 Recent Mortgage Statements", required: false, category: "lender_specific", funderSpecific: true, description: "For any open accounts on background check" },
        // AHL-specific title documents
        { id: "ahl_preliminary_title", name: "Preliminary Title Report / Title Commitment", required: true, category: "title", funderSpecific: true },
        { id: "ahl_closing_protection", name: "Closing Protection Letter (CPL)", required: true, category: "title", funderSpecific: true },
        { id: "ahl_wire_instructions", name: "Wire Instructions", required: true, category: "title", funderSpecific: true },
      ];

    default:
      return baseRequirements;
  }
};

export default function DocumentChecklist({ loanDetails, onDocumentToggle }: DocumentChecklistProps) {
  const [completedDocs, setCompletedDocs] = useState<Set<string>>(new Set());
  const requirements = getDocumentRequirements(loanDetails?.funder);

  // Group requirements by category
  const groupedRequirements = requirements.reduce((acc, req) => {
    if (!acc[req.category]) {
      acc[req.category] = [];
    }
    acc[req.category].push(req);
    return acc;
  }, {} as Record<string, DocumentRequirement[]>);

  const handleDocumentToggle = (documentId: string, completed: boolean) => {
    const newCompletedDocs = new Set(completedDocs);
    if (completed) {
      newCompletedDocs.add(documentId);
    } else {
      newCompletedDocs.delete(documentId);
    }
    setCompletedDocs(newCompletedDocs);
    onDocumentToggle?.(documentId, completed);
  };

  // Calculate progress
  const requiredDocs = requirements.filter(req => req.required);
  const completedRequiredDocs = requiredDocs.filter(req => completedDocs.has(req.id));
  const progressPercentage = requiredDocs.length > 0 ? (completedRequiredDocs.length / requiredDocs.length) * 100 : 0;

  const getFunderDisplayName = (funder: string) => {
    const names: Record<string, string> = {
      kiavi: "Kiavi",
      visio: "Visio",
      roc_capital: "ROC Capital",
      ahl: "AHL (American Heritage Lending)",
      velocity: "Velocity"
    };
    return names[funder?.toLowerCase()] || funder;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Document Checklist - {getFunderDisplayName(loanDetails?.funder)}
          </CardTitle>
          <CardDescription>
            Track required documents for {loanDetails?.propertyAddress}
          </CardDescription>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress: {completedRequiredDocs.length} of {requiredDocs.length} required documents</span>
              <span className="font-medium">{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        </CardHeader>
      </Card>

      {Object.entries(groupedRequirements).map(([category, docs]) => {
        const Icon = categoryIcons[category] || FileText;
        const categoryCompleted = docs.filter(doc => completedDocs.has(doc.id)).length;
        const categoryRequired = docs.filter(doc => doc.required).length;
        
        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icon className="w-5 h-5" />
                {categoryNames[category]}
                <Badge variant="outline" className="ml-auto">
                  {categoryCompleted}/{docs.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {docs.map((doc) => {
                  const isCompleted = completedDocs.has(doc.id);
                  return (
                    <div key={doc.id} className="flex items-start gap-3 p-3 rounded-lg border">
                      <Checkbox
                        id={doc.id}
                        checked={isCompleted}
                        onCheckedChange={(checked) => handleDocumentToggle(doc.id, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 space-y-1">
                        <label
                          htmlFor={doc.id}
                          className={`text-sm font-medium cursor-pointer ${
                            isCompleted ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {doc.name}
                        </label>
                        {doc.description && (
                          <p className="text-xs text-muted-foreground">{doc.description}</p>
                        )}
                        <div className="flex items-center gap-2">
                          {doc.required ? (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Optional</Badge>
                          )}
                          {doc.funderSpecific && (
                            <Badge variant="outline" className="text-xs">
                              {getFunderDisplayName(loanDetails?.funder)} Specific
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        {!isCompleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUploadClick(doc)}
                            className="text-xs px-2 py-1 h-7"
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Upload
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={isCompleted ? "secondary" : "default"}
                          onClick={() => handleSaveProgress(doc.id, !isCompleted)}
                          className="text-xs px-2 py-1 h-7"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {isCompleted ? 'Saved' : 'Save'}
                        </Button>
                        {isCompleted && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}