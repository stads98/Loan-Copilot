import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import FolderBrowser from "./FolderBrowser";

interface GoogleDriveConnectProps {
  loanId: number;
  onConnect: () => void;
  isConnected: boolean;
}

export default function GoogleDriveConnect({ loanId, onConnect, isConnected }: GoogleDriveConnectProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(isConnected);
  const [currentFolderName, setCurrentFolderName] = useState<string>("");
  const { toast } = useToast();
  
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  // Poll for connection status changes and fetch folder info
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        const response = await fetch('/api/auth/google/status');
        const data = await response.json();
        setConnectionStatus(data.connected);
        
        // If connected, fetch actual Google Drive folder name
        if (data.connected && loanId) {
          try {
            const loanResponse = await fetch(`/api/loans/${loanId}`);
            const loanData = await loanResponse.json();
            if (loanData.loan?.driveFolder) {
              // Fetch actual folder name from Google Drive
              try {
                const folderResponse = await fetch(`/api/drive/folder/${loanData.loan.driveFolder}/name`);
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json();
                  setCurrentFolderName(folderData.name || 'Unknown Folder');
                } else if (folderResponse.status === 403) {
                  // Permission error - show helpful message
                  const errorData = await folderResponse.json();
                  if (errorData.requiresReauth) {
                    setCurrentFolderName('⚠️ Re-authentication required for folder names');
                  } else {
                    setCurrentFolderName('⚠️ Permission denied for folder access');
                  }
                } else {
                  // Fallback to loan-based name
                  const folderName = `${loanData.loan.borrowerName || 'Borrower'} - ${loanData.loan.propertyAddress || loanData.loan.loanNumber}`;
                  setCurrentFolderName(folderName);
                }
              } catch (folderError) {
                console.error('Error fetching folder name:', folderError);
                // Fallback to loan-based name
                const folderName = `${loanData.loan.borrowerName || 'Borrower'} - ${loanData.loan.propertyAddress || loanData.loan.loanNumber}`;
                setCurrentFolderName(folderName);
              }
            }
          } catch (error) {
            console.error('Error fetching loan folder info:', error);
          }
        } else if (!data.connected) {
          setCurrentFolderName('');
        }
      } catch (error) {
        console.error('Error checking connection status:', error);
      }
    };

    // Check immediately
    checkConnectionStatus();

    // Poll every 2 seconds for real-time updates
    const interval = setInterval(checkConnectionStatus, 2000);

    return () => clearInterval(interval);
  }, [loanId]);

  // Update local state when prop changes
  useEffect(() => {
    setConnectionStatus(isConnected);
  }, [isConnected]);

  const handleConnectDrive = async () => {
    try {
      setIsLoading(true);
      
      // Use direct OAuth endpoint instead of getting URL first
      // This avoids potential CORS/security issues with iframe blocking
      window.location.href = '/api/auth/google';
    } catch (error) {
      console.error('Error connecting to Google:', error);
      toast({
        title: "Connection Failed",
        description: "Unable to connect to Google services. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const handleFolderSelected = (folderId: string, folderName: string) => {
    onConnect();
    toast({
      title: "Google Drive Connected",
      description: `Successfully connected to: ${folderName}`
    });
  };
  
  return (
    <div className="bg-white rounded-lg shadow" data-component="google-drive-connect">
      <div className="px-4 py-5 sm:p-6">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">Google Integration</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Connect to Gmail and Google Drive for full document management
            </p>
          </div>
          <div className="mt-5 sm:mt-0">
            <Button 
              onClick={connectionStatus ? async () => {
                try {
                  setIsLoading(true);
                  const response = await fetch('/api/auth/google/disconnect', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  });
                  
                  if (response.ok) {
                    setConnectionStatus(false);
                    onConnect();
                    toast({
                      title: "Disconnected",
                      description: "Google services have been disconnected"
                    });
                  }
                } catch (error) {
                  console.error('Error disconnecting Google services:', error);
                  toast({
                    title: "Error",
                    description: "Failed to disconnect Google services",
                    variant: "destructive"
                  });
                } finally {
                  setIsLoading(false);
                }
              } : handleConnectDrive}
              disabled={isLoading}
              className={`inline-flex items-center ${connectionStatus ? 'text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400' : ''}`}
              variant={connectionStatus ? "outline" : "default"}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.433 22l-4.433-7.667 4.527-7.833h9.005l4.433 7.667-4.527 7.833h-9.005z" fill="#4285f4"/>
                <path d="M23.071 14.333l-4.433 7.667-4.527-7.833h-9.006l4.433-7.667 4.527 7.833h9.006z" fill="#4285f4"/>
                <path d="M8.96 14.333h9.006l-4.527-7.833h-9.005l4.527 7.833z" fill="#4285f4"/>
              </svg>
              {connectionStatus ? "Disconnect" : "Connect Google"}
            </Button>
          </div>
        </div>
        
        {!connectionStatus ? (
          <div className="mt-6 border border-gray-300 border-dashed rounded-lg p-6 flex flex-col items-center justify-center">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 text-primary-600 sm:mx-0 sm:h-10 sm:w-10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div className="mt-3 text-center sm:mt-5">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Select Loan Folder
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Connect to Google Drive to access your loan documents and analyze them automatically.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-primary-600" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4.433 22l-4.433-7.667 4.527-7.833h9.005l4.433 7.667-4.527 7.833h-9.005z" fill="#4285f4"/>
                  <path d="M23.071 14.333l-4.433 7.667-4.527-7.833h-9.006l4.433-7.667 4.527 7.833h9.006z" fill="#4285f4"/>
                  <path d="M8.96 14.333h9.006l-4.527-7.833h-9.005l4.527 7.833z" fill="#4285f4"/>
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Connected to Google Services
                </h3>
                <p className="text-sm text-gray-500">
                  Gmail and Google Drive connected - documents are being analyzed automatically
                </p>
                {currentFolderName && (
                  <p className="text-sm text-blue-600 mt-1">
                    📁 Connected to: {currentFolderName}
                  </p>
                )}
              </div>
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={() => setShowFolderBrowser(true)}>
                  Change Folder
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <FolderBrowser 
        open={showFolderBrowser}
        onOpenChange={setShowFolderBrowser}
        onSelectFolder={handleFolderSelected}
        currentLoanAddress="Your loan address here"
        existingLoanId={loanId}
      />
    </div>
  );
}
