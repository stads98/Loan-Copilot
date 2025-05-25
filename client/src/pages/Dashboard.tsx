import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import LoanPropertyCard from "@/components/LoanPropertyCard";
import DocumentProgress from "@/components/DocumentProgress";
import ContactList from "@/components/ContactList";
import GoogleDriveConnect from "@/components/GoogleDriveConnect";
import AIAssistant from "@/components/AIAssistant";
import TaskList from "@/components/TaskList";
import DocumentManager from "@/components/DocumentManager";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loan, Property, Document, Contact, Task, Message, Lender } from "@/lib/types";

interface DashboardProps {
  user: any;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [activeLoanId, setActiveLoanId] = useState<number | null>(null);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const { toast } = useToast();
  
  // Fetch loans for the current user
  const { data: loans, isLoading: isLoadingLoans } = useQuery({
    queryKey: ['/api/loans'],
  });
  
  // Fetch active loan details
  const { data: loanDetails, isLoading: isLoadingLoanDetails } = useQuery({
    queryKey: [`/api/loans/${activeLoanId}`],
    enabled: !!activeLoanId,
  });
  
  // Fetch chat messages for the active loan
  const { data: messages, isLoading: isLoadingMessages } = useQuery({
    queryKey: [`/api/loans/${activeLoanId}/messages`],
    enabled: !!activeLoanId,
  });
  
  // Create a demo loan if no loans exist
  const createDemoLoan = async () => {
    try {
      const response = await apiRequest("POST", "/api/demo-loan", {});
      const data = await response.json();
      setActiveLoanId(data.loanId);
      toast({
        title: "Demo loan created",
        description: "A sample loan has been created for demonstration."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create demo loan. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Set the first loan as active loan if none is selected
  useEffect(() => {
    if (loans && loans.length > 0 && !activeLoanId) {
      setActiveLoanId(loans[0].id);
    }
  }, [loans, activeLoanId]);
  
  // Define document categories and requirements
  const documentRequirements = {
    borrower: ["Driver's License", "Bank Statements", "Credit Report", "Tax Returns"],
    property: ["Purchase Contract", "Appraisal", "Inspection Report"],
    title: ["Title Commitment", "Preliminary Title Report", "Closing Disclosure"],
    insurance: ["Insurance Binder", "Insurance Quote", "Proof of Insurance"]
  };
  
  if (isLoadingLoans) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }
  
  // No loans yet - show create demo loan button
  if (!loans || loans.length === 0) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="py-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">Welcome to Loan Processing Co-Pilot</h2>
            <p className="text-lg text-gray-600 mb-8">
              Your smart assistant for processing DSCR real estate loans. To get started, you need to create your first loan file.
            </p>
            <Button 
              onClick={createDemoLoan}
              size="lg"
              className="inline-flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              Create Demo Loan
            </Button>
          </div>
        </div>
      </Layout>
    );
  }
  
  if (isLoadingLoanDetails && activeLoanId) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }
  
  // Active loan data
  const loan = loanDetails?.loan as Loan | undefined;
  const property = loanDetails?.property as Property | undefined;
  const lender = loanDetails?.lender as Lender | undefined;
  const contacts = loanDetails?.contacts as Contact[] | undefined;
  const documents = loanDetails?.documents as Document[] | undefined;
  const tasks = loanDetails?.tasks as Task[] | undefined;
  
  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="py-6 px-4 sm:px-6 lg:px-8" data-component="loan-dashboard">
        <div className="border-b border-gray-200 pb-5 mb-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold text-gray-900">Active Loan File</h2>
              <p className="mt-1 text-sm text-gray-500">
                Process your loan file with AI-assisted guidance
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              <Button className="inline-flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Loan
              </Button>
            </div>
          </div>
        </div>

        {/* Loan Files Container */}
        {loan && property && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Loan Info & Status */}
            <div className="lg:col-span-1 space-y-6">
              {/* Loan Property Card */}
              <LoanPropertyCard 
                loan={{
                  ...loan,
                  lenderName: lender?.name || "Unknown"
                }} 
                property={property} 
              />

              {/* Document Progress */}
              <DocumentProgress 
                documents={documents || []}
                requiredDocuments={documentRequirements}
              />

              {/* Contact List */}
              <ContactList 
                contacts={contacts || []}
                loanId={loan.id}
              />
            </div>

            {/* Middle Column: AI Guidance & Tasks */}
            <div className="lg:col-span-2 space-y-6">
              {/* Google Drive Connection */}
              <GoogleDriveConnect 
                loanId={loan.id}
                onConnect={() => setIsDriveConnected(true)}
                isConnected={isDriveConnected}
              />

              {/* AI Assistant */}
              <AIAssistant 
                loanId={loan.id}
                messages={messages || []}
              />

              {/* Task List */}
              <TaskList 
                tasks={tasks || []}
                loanId={loan.id}
              />

              {/* Document Manager */}
              <DocumentManager 
                documents={documents || []}
                loanId={loan.id}
                requiredDocuments={documentRequirements}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
