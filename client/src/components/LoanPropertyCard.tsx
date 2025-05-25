import { Loan, Property } from "@/lib/types";

interface LoanPropertyCardProps {
  loan: Loan;
  property: Property;
}

export default function LoanPropertyCard({ loan, property }: LoanPropertyCardProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden" data-component="loan-property-card">
      {/* Property image */}
      <img 
        src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=500" 
        alt="Property image" 
        className="w-full h-48 object-cover" 
      />
      
      <div className="px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">
            {property.address}
          </h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {loan.loanType} {loan.loanPurpose}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          {property.city}, {property.state} {property.zipCode}
        </p>
      </div>
      
      <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="col-span-1">
            <dt className="text-xs font-medium text-gray-500">Lender</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{loan.lenderName}</dd>
          </div>
          <div className="col-span-1">
            <dt className="text-xs font-medium text-gray-500">Loan Amount</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">${loan.loanAmount}</dd>
          </div>
          <div className="col-span-1">
            <dt className="text-xs font-medium text-gray-500">Borrower</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{loan.borrowerName}</dd>
          </div>
          <div className="col-span-1">
            <dt className="text-xs font-medium text-gray-500">Target Close Date</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{loan.targetCloseDate}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
