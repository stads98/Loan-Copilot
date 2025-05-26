import { Document, Contact } from "@/lib/types";

interface DocumentProgressProps {
  documents: Document[];
  requiredDocuments: {
    borrower: string[];
    property: string[];
    title: string[];
    insurance: string[];
  };
  contacts?: Contact[];
}

export default function DocumentProgress({ documents, requiredDocuments, contacts = [] }: DocumentProgressProps) {
  // Helper function to find contact by role
  const findContactByRole = (role: string) => {
    return contacts.find(contact => 
      contact.role.toLowerCase().includes(role.toLowerCase())
    );
  };

  // Find specific contacts
  const titleContact = findContactByRole("title");
  const insuranceContact = findContactByRole("insurance");

  // Calculate the number of documents present in each category
  const borrowerDocs = documents.filter(doc => doc.category === "borrower").length;
  const titleDocs = documents.filter(doc => doc.category === "title").length;
  const insuranceDocs = documents.filter(doc => doc.category === "insurance").length;
  
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-100" data-component="document-progress">
      <div className="px-4 py-4 sm:px-6 border-b border-gray-100 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-heading font-medium text-gray-900 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Document Status
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Current progress of required documents
          </p>
        </div>
        <button className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center">
          View full checklist
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      <div className="px-4 py-4 sm:px-6">
        {/* Overall progress bar */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Overall Completion
            </span>
            <span className="text-sm font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              {overallPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mt-2">
            <div 
              className={`h-3 rounded-full ${
                overallPercentage < 30 ? 'bg-red-500' : 
                overallPercentage < 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${overallPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* Main document categories */}
        <div className="space-y-5 mt-6">
          {/* Borrower Documents */}
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-medium text-gray-800">Borrower Documents</span>
              </div>
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  borrowerPercentage === 100 
                    ? 'bg-green-100 text-green-800' 
                    : borrowerPercentage > 0 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-red-100 text-red-800'
                }`}>
                  {borrowerDocs}/{borrowerRequired}
                </span>
              </div>
            </div>
            <div className="w-full bg-white rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  borrowerPercentage === 100 
                    ? 'bg-green-500' 
                    : borrowerPercentage > 0 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                }`}
                style={{ width: `${borrowerPercentage}%` }}
              ></div>
            </div>
            <div className="mt-1 text-xs text-blue-800">
              John Smith • Copy: (555) 123-4567 • john.smith@example.com
            </div>
          </div>
          
          {/* Title Documents */}
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-sm font-medium text-gray-800">Title Documents</span>
              </div>
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  titlePercentage === 100 
                    ? 'bg-green-100 text-green-800' 
                    : titlePercentage > 0 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-red-100 text-red-800'
                }`}>
                  {titleDocs}/{titleRequired}
                </span>
              </div>
            </div>
            <div className="w-full bg-white rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  titlePercentage === 100 
                    ? 'bg-green-500' 
                    : titlePercentage > 0 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                }`}
                style={{ width: `${titlePercentage}%` }}
              ></div>
            </div>
            {titleContact && (
              <div className="mt-1 text-xs text-purple-800">
                {titleContact.company ? titleContact.company : titleContact.name} • {titleContact.phone} • {titleContact.email}
              </div>
            )}
          </div>
          
          {/* Insurance Documents */}
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-sm font-medium text-gray-800">Insurance Documents</span>
              </div>
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  insurancePercentage === 100 
                    ? 'bg-green-100 text-green-800' 
                    : insurancePercentage > 0 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-red-100 text-red-800'
                }`}>
                  {insuranceDocs}/{insuranceRequired}
                </span>
              </div>
            </div>
            <div className="w-full bg-white rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  insurancePercentage === 100 
                    ? 'bg-green-500' 
                    : insurancePercentage > 0 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                }`}
                style={{ width: `${insurancePercentage}%` }}
              ></div>
            </div>
            {insuranceContact && (
              <div className="mt-1 text-xs text-green-800">
                {insuranceContact.company ? insuranceContact.company : insuranceContact.name} • {insuranceContact.phone} • {insuranceContact.email}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}