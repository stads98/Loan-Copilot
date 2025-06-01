import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import LoanPropertyCard from "@/components/LoanPropertyCard";
import DocumentProgress from "@/components/DocumentProgress";
import ContactList from "@/components/ContactList";
import GoogleDriveConnect from "@/components/GoogleDriveConnect";
import AIAssistant from "@/components/AIAssistant";
import TaskList from "@/components/TaskList";
import DocumentManager from "@/components/DocumentManager";
import NewLoanDialog from "@/components/NewLoanDialog";
import EditableLoanDetails from "@/components/EditableLoanDetails";
import GmailInbox from "@/components/GmailInbox";
import { getDocumentRequirements } from "@/components/DocumentChecklist";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loan, Property, Document, Contact, Task, Message, Lender } from "@/lib/types";
import { useLocation, useRoute } from "wouter";

interface DashboardProps {
  user: any;
  onLogout: () => void;
  activeLoanId?: number | null;
  currentPath?: string;
}

export default function Dashboard({ user, onLogout, activeLoanId: externalLoanId, currentPath }: DashboardProps) {
  const [activeLoanId, setActiveLoanId] = useState<number | null>(externalLoanId || null);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [completedRequirements, setCompletedRequirements] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Use loan ID from props if provided, otherwise extract from URL
  useEffect(() => {
    if (externalLoanId) {
      setActiveLoanId(externalLoanId);
    } else {
      const path = window.location.pathname;
      const match = path.match(/\/loans\/(\d+)/);
      if (match && match[1]) {
        const loanId = parseInt(match[1], 10);
        setActiveLoanId(loanId);
      }
    }
  }, [externalLoanId, window.location.pathname]);
  
  // Fetch loans for the current user
  const { data: loans, isLoading: isLoadingLoans } = useQuery({
    queryKey: ['/api/loans'],
  });
  
  // Fetch all tasks across all loans for dashboard overview
  const { data: allTasks = [], isLoading: isLoadingAllTasks } = useQuery({
    queryKey: ['/api/tasks/all'],
    enabled: !!loans && loans.length > 0
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
  
  // Get lender-specific document requirements
  const getLenderSpecificRequirements = (lenderName: string) => {
    const requirements = getDocumentRequirements(lenderName);
    
    // Group requirements by category for DocumentManager format
    const grouped = {
      borrower: [] as string[],
      property: [] as string[],
      title: [] as string[],
      insurance: [] as string[]
    };
    
    requirements.forEach((req: any) => {
      if (req.category === "borrower_entity" || req.category === "financials" || req.category === "lender_specific") {
        grouped.borrower.push(req.name);
      } else if (req.category === "property" || req.category === "appraisal") {
        grouped.property.push(req.name);
      } else if (req.category === "title") {
        grouped.title.push(req.name);
      } else if (req.category === "insurance") {
        grouped.insurance.push(req.name);
      } else if (req.category === "payoff") {
        // Add payoff documents to property category
        grouped.property.push(req.name);
      }
    });
    
    return grouped;
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
      <div className="py-6 px-4 sm:px-6 lg:px-8 bg-gray-50" data-component="loan-dashboard">
        <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold">Loan Processing Co-Pilot</h2>
              <p className="mt-1 text-sm text-blue-100">
                Smart assistance for processing DSCR real estate loans
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              <NewLoanDialog />
            </div>
          </div>
        </div>

        {/* Loan Files Container - Show detailed view only when on a specific loan URL */}
        {activeLoanId && currentPath && currentPath.includes('/loans/') && loan && property && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Loan Info & Status */}
            <div className="lg:col-span-1 space-y-6">
              {/* Editable Loan Details */}
              <EditableLoanDetails 
                loanId={loan.id}
                loanDetails={{ loan, property, lender }}
              />

              {/* Document Progress */}
              <DocumentProgress 
                documents={documents || []}
                requiredDocuments={getLenderSpecificRequirements(lender?.name || "AHL")}
                contacts={contacts || []}
                loanDetails={{ ...loan, lender, property }}
              />

              {/* Contact List */}
              <ContactList 
                contacts={contacts || []}
                loanId={loan.id}
                propertyAddress={`${property.address}, ${property.city}, ${property.state} ${property.zipCode}`}
                borrowerName={loan.borrowerName}
              />

              {/* Gmail Inbox */}
              <GmailInbox />
            </div>

            {/* Middle Column: AI Guidance & Tasks */}
            <div className="lg:col-span-2 space-y-6">
              {/* Action Items Section - Moved to top for priority */}
              <div className="bg-white rounded-lg shadow-md border-l-4 border-amber-500" data-component="task-priority">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg leading-6 font-heading font-medium text-gray-900 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-2 text-amber-500">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    Priority Action Items
                  </h3>
                </div>
                <div>
                  <TaskList 
                    tasks={tasks || []}
                    loanId={loan.id}
                  />
                </div>
              </div>

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

              {/* Document Manager */}
              <DocumentManager 
                documents={documents || []}
                loanId={loan.id}
                contacts={contacts || []}
                propertyAddress={property?.address || ""}
                requiredDocuments={getLenderSpecificRequirements(lender?.name || "AHL")}
              />
            </div>
          </div>
        )}

        {/* Dashboard Overview - Show when on dashboard page, not individual loan pages */}
        {(!currentPath || currentPath === '/' || currentPath === '/dashboard' || (!currentPath.includes('/loans/') && !activeLoanId)) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: All Loan Files Overview */}
            <div className="lg:col-span-2 space-y-6">
              {/* All Loan Files */}
              <div className="bg-white rounded-lg shadow-md">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg leading-6 font-heading font-medium text-gray-900 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-2 text-blue-500">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    All Loan Files
                    <span className="ml-auto bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {loans?.length || 0}
                    </span>
                  </h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {loans?.sort((a: any, b: any) => new Date(a.targetCloseDate || '9999-12-31').getTime() - new Date(b.targetCloseDate || '9999-12-31').getTime())
                    .map((loan: any) => {
                      const daysUntilDue = loan.targetCloseDate ? 
                        Math.ceil((new Date(loan.targetCloseDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                      const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                      const isUrgent = daysUntilDue !== null && daysUntilDue <= 7;
                      
                      return (
                        <div key={loan.id} className="px-4 py-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                             onClick={() => window.location.href = `/loans/${loan.id}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{loan.borrowerName}</p>
                              <p className="text-xs text-gray-500">{loan.propertyAddress}</p>
                              <p className="text-xs text-gray-600 mt-1">
                                {(() => {
                                  const lenderName = loan.funder;
                                  if (lenderName?.toLowerCase() === 'ahl') return 'American Heritage Lending (AHL)';
                                  if (lenderName?.toLowerCase() === 'visio') return 'Visio Lending';
                                  if (lenderName?.toLowerCase() === 'kiavi') return 'Kiavi Funding';
                                  if (lenderName?.toLowerCase() === 'roc capital' || lenderName?.toLowerCase() === 'roc') return 'Roc Capital 360';
                                  return lenderName;
                                })()} • ${loan.loanAmount}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-gray-900'}`}>
                                {loan.targetCloseDate}
                              </p>
                              {daysUntilDue !== null && (
                                <p className={`text-xs ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-gray-500'}`}>
                                  {isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : 
                                   daysUntilDue === 0 ? 'Due today' :
                                   `${daysUntilDue} days left`}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  (loan.completionPercentage || 0) < 30 ? 'bg-red-500' : 
                                  (loan.completionPercentage || 0) < 70 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${loan.completionPercentage || 0}%` }}
                              ></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{loan.completionPercentage || 0}% Complete</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Priority Action Items Across All Loans */}
              <div className="bg-white rounded-lg shadow-md border-l-4 border-blue-500">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg leading-6 font-heading font-medium text-gray-900 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-2 text-blue-500">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    Priority Action Items (All Loans)
                    <span className="ml-auto bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {Array.isArray(allTasks) ? allTasks.filter((task: any) => !task.completed).length : 0}
                    </span>
                  </h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {Array.isArray(allTasks) && allTasks
                    .filter((task: any) => !task.completed)
                    .sort((a: any, b: any) => new Date(a.dueDate || '9999-12-31').getTime() - new Date(b.dueDate || '9999-12-31').getTime())
                    .map((task: any) => {
                      const loanData = loans?.find((l: any) => l.id === task.loanId);
                      return (
                        <div key={task.id} className="px-4 py-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                             onClick={() => window.location.href = `/loans/${task.loanId}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{task.description}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Loan: {loanData?.borrowerName} - {loanData?.propertyAddress}
                              </p>
                              {task.dueDate && (
                                <p className="text-xs text-red-600 mt-1">Due: {task.dueDate}</p>
                              )}
                            </div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              task.priority === 'high' 
                                ? 'bg-red-100 text-red-800' 
                                : task.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1) || 'Low'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  {(!Array.isArray(allTasks) || allTasks.filter((task: any) => task.priority === 'high' && !task.completed).length === 0) && (
                    <div className="px-4 py-8 text-center">
                      <div className="text-sm text-gray-500">No high priority tasks</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Quick Actions & Summary */}
            <div className="lg:col-span-1 space-y-6">
              {/* Portfolio Summary */}
              <div className="bg-white rounded-lg shadow-md">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">Portfolio Summary</h3>
                </div>
                <div className="px-4 py-4">
                  <dl className="space-y-4">
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-500">Total Loans</dt>
                      <dd className="text-sm font-semibold text-gray-900">{loans?.length || 0}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-500">High Priority Tasks</dt>
                      <dd className="text-sm font-semibold text-red-600">
                        {Array.isArray(allTasks) ? allTasks.filter((task: any) => task.priority === 'high' && !task.completed).length : 0}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-500">Due This Week</dt>
                      <dd className="text-sm font-semibold text-amber-600">
                        {loans?.filter((loan: any) => {
                          const daysUntilDue = loan.targetCloseDate ? 
                            Math.ceil((new Date(loan.targetCloseDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                          return daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue >= 0;
                        }).length || 0}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-500">Overdue</dt>
                      <dd className="text-sm font-semibold text-red-600">
                        {loans?.filter((loan: any) => {
                          const daysUntilDue = loan.targetCloseDate ? 
                            Math.ceil((new Date(loan.targetCloseDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                          return daysUntilDue !== null && daysUntilDue < 0;
                        }).length || 0}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-md">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">Quick Actions</h3>
                </div>
                <div className="px-4 py-4 space-y-3">
                  <NewLoanDialog />
                  <Button 
                    onClick={() => window.location.href = "/loans"}
                    variant="outline" 
                    className="w-full justify-start"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View All Loans
                  </Button>
                  <Button 
                    onClick={() => window.location.href = "/templates"}
                    variant="outline" 
                    className="w-full justify-start"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email Templates
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
