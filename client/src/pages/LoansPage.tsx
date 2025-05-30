import { useState } from "react";
import Layout from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loan } from "@/lib/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import NewLoanDialog from "@/components/NewLoanDialog";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";

interface LoansPageProps {
  user: any;
  onLogout: () => void;
}

export default function LoansPage({ user, onLogout }: LoansPageProps) {
  const { toast } = useToast();

  // Fetch all loans
  const { data: loans, isLoading: isLoadingLoans, refetch } = useQuery({
    queryKey: ['/api/loans'],
  });

  // Fetch all lenders for filtering
  const { data: lenders, isLoading: isLoadingLenders } = useQuery({
    queryKey: ['/api/lenders'],
  });

  // Create a demo loan
  const createDemoLoan = async () => {
    try {
      const response = await apiRequest("POST", "/api/demo-loan", {});
      const data = await response.json();
      toast({
        title: "Demo loan created",
        description: "A sample loan has been created for demonstration."
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create demo loan. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Delete a loan
  const deleteLoan = async (loanId: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click navigation
    
    if (!confirm("Are you sure you want to delete this loan? This action cannot be undone.")) {
      return;
    }

    try {
      const result = await apiRequest("DELETE", `/api/loans/${loanId}`, {});
      
      // Force refresh the loans list
      queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
      refetch();
      
      toast({
        title: "Success",
        description: result.message || "Loan deleted successfully."
      });
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete loan. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (isLoadingLoans || isLoadingLenders) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  // Display a loading message while real loans are being fetched
  const combinedLoans = Array.isArray(loans) ? loans : [];

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="py-6 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold">Adler Capital Loan Files</h2>
              <p className="mt-1 text-sm text-blue-100">
                Manage all your DSCR loan files in one place
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              <NewLoanDialog />
              <Button 
                onClick={createDemoLoan}
                className="bg-white text-blue-700 hover:bg-blue-50 inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                Demo Loan
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {combinedLoans && combinedLoans.length > 0 ? (
            combinedLoans.map((loan: any) => (
              <Card 
                key={loan.id} 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => window.location.href = `/loans/${loan.id}`}
              >
                <div className={`h-2 ${
                  loan.status === 'completed' ? 'bg-green-500' :
                  loan.status === 'on_hold' ? 'bg-yellow-500' : 'bg-blue-500'
                }`}></div>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{loan.borrowerName}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        loan.status === 'completed' ? 'default' :
                        loan.status === 'on_hold' ? 'secondary' : 'outline'
                      }>
                        {loan.status === 'in_progress' ? 'In Progress' :
                         loan.status === 'completed' ? 'Completed' :
                         loan.status === 'on_hold' ? 'On Hold' : 'New'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => deleteLoan(loan.id, event)}
                        className="p-1 h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Loan Type:</span>
                      <span className="font-medium">{loan.loanType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Purpose:</span>
                      <span className="font-medium">{loan.loanPurpose}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amount:</span>
                      <span className="font-medium">{loan.loanAmount || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Target Close Date:</span>
                      <span className="font-medium">
                        {loan.targetCloseDate ? 
                          format(new Date(loan.targetCloseDate), "MMMM do, yyyy") : 
                          'Not specified'
                        }
                      </span>
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium">Completion</span>
                        <span className="text-xs font-medium">{loan.completionPercentage || 0}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            (loan.completionPercentage || 0) < 30 ? 'bg-red-500' : 
                            (loan.completionPercentage || 0) < 70 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${loan.completionPercentage || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-blue-100 p-3 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No Loan Files Yet</h3>
              <p className="text-gray-500 mb-4 text-center max-w-md">
                You haven't created any loan files yet. Click the button below to create your first loan.
              </p>
              <div className="flex space-x-3">
                <NewLoanDialog />
                <Button 
                  onClick={createDemoLoan}
                  size="sm"
                  variant="outline"
                  className="inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                  Demo Loan
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}