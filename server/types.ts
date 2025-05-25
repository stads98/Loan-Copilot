// Additional server-side types

export interface DriveDocumentData {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  text: string; // Extracted text content
}

export interface DocumentInfo {
  name: string;
  fileId: string;
  fileType: string;
  fileSize: number;
  category: string;
}

export interface LoanInfo {
  borrowerName: string;
  loanAmount?: string;
  loanType: string;
  loanPurpose: string;
  status?: string;
  targetCloseDate?: string;
}

export interface PropertyInfo {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType?: string;
}

export interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role: string;
}

export interface TaskInfo {
  description: string;
  dueDate?: string;
  priority?: string;
  completed: boolean;
}