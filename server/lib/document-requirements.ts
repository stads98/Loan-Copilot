/**
 * Master DSCR Loan Document Requirements by Funder
 * This defines what documents are required for each lender
 */

export interface DocumentRequirement {
  id: string;
  name: string;
  required: boolean;
  category: string;
  description?: string;
  funderSpecific?: boolean;
}

export interface FunderRequirements {
  name: string;
  requirements: DocumentRequirement[];
}

// Base requirements that apply to ALL funders
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

// Kiavi-specific requirements
const kiaviRequirements: DocumentRequirement[] = [
  ...baseRequirements,
  { id: "kiavi_auth_form", name: "Kiavi Borrowing Authorization Form", required: true, category: "lender_specific", funderSpecific: true },
  { id: "kiavi_disclosure", name: "Kiavi Disclosure Form", required: true, category: "lender_specific", funderSpecific: true },
  { id: "kiavi_liquidity", name: "Proof of Liquidity/Down Payment", required: true, category: "lender_specific", funderSpecific: true },
  { id: "kiavi_reserves", name: "Proof of Reserves (6 months PITI)", required: true, category: "lender_specific", funderSpecific: true },
  { id: "kiavi_background", name: "Kiavi Background Check Authorization", required: true, category: "lender_specific", funderSpecific: true },
];

// Visio-specific requirements
const visioRequirements: DocumentRequirement[] = [
  ...baseRequirements,
  { id: "visio_application", name: "Visio Financial Services Loan Application", required: true, category: "lender_specific", funderSpecific: true },
  { id: "visio_broker_submission", name: "Broker Submission Form", required: true, category: "lender_specific", funderSpecific: true },
  { id: "visio_broker_w9", name: "Broker W9 Form", required: true, category: "lender_specific", funderSpecific: true },
  { id: "visio_plaid_liquidity", name: "Proof of Liquidity via Plaid Connection", required: true, category: "lender_specific", funderSpecific: true },
  { id: "visio_borrower_statement", name: "Borrower Statement of Business Purpose", required: true, category: "lender_specific", funderSpecific: true },
  { id: "visio_rent_collection", name: "Proof of Rent Collection Deposits", required: false, category: "lender_specific", funderSpecific: true, description: "Required if lease rents exceed market rents" },
  { id: "visio_asset_verification", name: "Asset Verification Documentation", required: true, category: "lender_specific", funderSpecific: true },
];

// ROC Capital/ROC360-specific requirements
const rocRequirements: DocumentRequirement[] = [
  ...baseRequirements,
  { id: "roc_background", name: "ROC Capital Background/Credit Authorization", required: true, category: "lender_specific", funderSpecific: true },
  { id: "roc_ach_consent", name: "ROC ACH Consent Form", required: true, category: "lender_specific", funderSpecific: true },
  { id: "roc_property_tax", name: "Current Property Tax Bill", required: true, category: "lender_specific", funderSpecific: true },
  { id: "roc_liquidity", name: "Proof of Liquidity and Down Payment", required: true, category: "lender_specific", funderSpecific: true },
  { id: "roc_business_purpose", name: "ROC Business Purpose Statement", required: true, category: "lender_specific", funderSpecific: true },
  { id: "roc_rent_collection", name: "3 Months Rent Collection History", required: false, category: "lender_specific", funderSpecific: true, description: "Required for all rental units" },
  { id: "roc_security_deposits", name: "Security Deposit Documentation", required: false, category: "lender_specific", funderSpecific: true, description: "Required for new leases under 30 days" },
];

// AHL (American Heritage Lending)-specific requirements
const ahlRequirements: DocumentRequirement[] = [
  ...baseRequirements,
  { id: "ahl_entity_resolution", name: "Entity Resolution (AHL template)", required: true, category: "lender_specific", funderSpecific: true },
  { id: "ahl_business_purpose", name: "Borrower's Statement of Business Purpose (AHL template)", required: true, category: "lender_specific", funderSpecific: true },
  { id: "ahl_liquidity_proof", name: "Proof of Liquidity / Funds to Close", required: true, category: "lender_specific", funderSpecific: true },
  { id: "ahl_piti_reserves", name: "6 Months PITI Reserves", required: true, category: "lender_specific", funderSpecific: true, description: "Must be documented" },
  { id: "ahl_vom_12mo", name: "VOM showing 12 months payment history", required: false, category: "lender_specific", funderSpecific: true },
  { id: "ahl_mortgage_statements", name: "2 Recent Mortgage Statements", required: false, category: "lender_specific", funderSpecific: true, description: "For any open accounts on background check" },
];

// Velocity-specific requirements
const velocityRequirements: DocumentRequirement[] = [
  ...baseRequirements,
  { id: "velocity_app", name: "Velocity Loan Application", required: true, category: "lender_specific", funderSpecific: true },
  { id: "velocity_borrower_cert", name: "Borrower Certification Form", required: true, category: "lender_specific", funderSpecific: true },
  { id: "velocity_liquidity", name: "Proof of Liquidity Documentation", required: true, category: "lender_specific", funderSpecific: true },
  { id: "velocity_piti_reserves", name: "PITI Reserves Documentation", required: true, category: "lender_specific", funderSpecific: true },
  { id: "velocity_asset_verification", name: "Asset Verification Form", required: true, category: "lender_specific", funderSpecific: true },
];

// Map funders to their requirements
export const funderRequirements: Record<string, DocumentRequirement[]> = {
  kiavi: kiaviRequirements,
  visio: visioRequirements,
  roc_capital: rocRequirements,
  ahl: ahlRequirements,
  velocity: velocityRequirements,
};

export function getRequirementsForFunder(funder: string): DocumentRequirement[] {
  return funderRequirements[funder.toLowerCase()] || baseRequirements;
}

export function getDocumentCategories(): string[] {
  return [
    "borrower_entity",
    "financials", 
    "property",
    "appraisal",
    "insurance",
    "title",
    "payoff",
    "lender_specific"
  ];
}

export function getCategoryDisplayName(category: string): string {
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
  
  return categoryNames[category] || category;
}