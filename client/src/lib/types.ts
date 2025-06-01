// Types shared with server schema

export interface User {
  id: number;
  username: string;
  name?: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
  createdAt?: Date;
}

export interface Lender {
  id: number;
  name: string;
  requirements?: string[];
}

export interface LoanType {
  id: number;
  name: string;
  description?: string;
}

export interface Property {
  id: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType?: string;
}

export interface Contact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role: string; // borrower, title, insurance, analyst, etc.
  loanId: number;
  isAnalyst?: boolean; // Flag to identify analysts
}

export interface Loan {
  id: number;
  borrowerName: string;
  loanAmount?: string;
  loanType: string; // DSCR, etc.
  loanPurpose: string; // Purchase, Refinance, etc.
  status?: string;
  targetCloseDate?: string;
  driveFolder?: string;
  propertyId: number;
  lenderId: number;
  lenderName?: string; // Added for convenience in UI
  processorId: number;
  completionPercentage?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Document {
  id: number;
  name: string;
  fileId: string; // Google Drive file ID
  fileType?: string;
  fileSize?: number;
  category?: string; // borrower, property, title, insurance, etc.
  loanId: number;
  uploadedAt?: Date;
}

export interface Task {
  id: number;
  description: string;
  dueDate?: string;
  priority?: string; // high, medium, low
  completed: boolean;
  loanId: number;
  createdAt?: Date;
}

export interface Message {
  id: number;
  content: string;
  role: string; // user or assistant
  loanId: number;
  createdAt: Date;
}

export interface LoanWithDetails {
  loan: Loan;
  property: Property;
  lender: Lender;
  contacts: Contact[];
  documents: Document[];
  tasks: Task[];
}
