import { Document } from "@/lib/types";

interface DocumentProgressProps {
  documents: Document[];
  requiredDocuments: {
    borrower: string[];
    property: string[];
    title: string[];
    insurance: string[];
  };
}

export default function DocumentProgress({ documents, requiredDocuments }: DocumentProgressProps) {
  // Calculate the number of documents present in each category
  const borrowerDocs = documents.filter(doc => doc.category === "borrower").length;
  const propertyDocs = documents.filter(doc => doc.category === "property").length;
  const titleDocs = documents.filter(doc => doc.category === "title").length;
  const insuranceDocs = documents.filter(doc => doc.category === "insurance").length;
  
  // Calculate required counts
  const borrowerRequired = requiredDocuments.borrower.length;
  const propertyRequired = requiredDocuments.property.length;
  const titleRequired = requiredDocuments.title.length;
  const insuranceRequired = requiredDocuments.insurance.length;
  
  // Calculate percentages
  const borrowerPercentage = Math.round((borrowerDocs / borrowerRequired) * 100) || 0;
  const propertyPercentage = Math.round((propertyDocs / propertyRequired) * 100) || 0;
  const titlePercentage = Math.round((titleDocs / titleRequired) * 100) || 0;
  const insurancePercentage = Math.round((insuranceDocs / insuranceRequired) * 100) || 0;
  
  // Calculate overall percentage
  const totalDocs = borrowerDocs + propertyDocs + titleDocs + insuranceDocs;
  const totalRequired = borrowerRequired + propertyRequired + titleRequired + insuranceRequired;
  const overallPercentage = Math.round((totalDocs / totalRequired) * 100) || 0;
  
  return (
    <div className="bg-white rounded-lg shadow" data-component="document-progress">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">Document Status</h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Current progress of required documents
        </p>
      </div>
      <div className="px-4 py-5 sm:p-6">
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700">Overall Completion</span>
            <span className="text-sm font-medium text-gray-700">{overallPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-primary-600 h-2.5 rounded-full" 
              style={{ width: `${overallPercentage}%` }}
            ></div>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">Borrower Documents</span>
              <span className="text-sm font-medium text-gray-700">{borrowerDocs}/{borrowerRequired}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-green-500 h-1.5 rounded-full" 
                style={{ width: `${borrowerPercentage}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">Property Documents</span>
              <span className="text-sm font-medium text-gray-700">{propertyDocs}/{propertyRequired}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-green-500 h-1.5 rounded-full" 
                style={{ width: `${propertyPercentage}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">Title Documents</span>
              <span className="text-sm font-medium text-gray-700">{titleDocs}/{titleRequired}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className={`${titlePercentage > 0 ? 'bg-yellow-500' : 'bg-red-500'} h-1.5 rounded-full`}
                style={{ width: `${titlePercentage}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">Insurance Documents</span>
              <span className="text-sm font-medium text-gray-700">{insuranceDocs}/{insuranceRequired}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className={`${insurancePercentage > 0 ? 'bg-yellow-500' : 'bg-red-500'} h-1.5 rounded-full`}
                style={{ width: `${insurancePercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <a href="#" className="text-sm font-medium text-primary-600 hover:text-primary-500">
            View full document checklist 
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 ml-1 inline">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
