import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface GoogleDriveContextType {
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  checkStatus: () => Promise<void>;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | undefined>(undefined);

export const useGoogleDrive = () => {
  const context = useContext(GoogleDriveContext);
  if (!context) {
    throw new Error('useGoogleDrive must be used within a GoogleDriveProvider');
  }
  return context;
};

interface GoogleDriveProviderProps {
  children: ReactNode;
}

export const GoogleDriveProvider: React.FC<GoogleDriveProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/auth/google/status');
      const data = await response.json();
      setIsConnected(data.connected);
    } catch (error) {
      console.error('Error checking Google Drive status:', error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const connect = async () => {
    try {
      setIsLoading(true);
      
      // Get the unified Google OAuth URL
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      
      if (data.authUrl) {
        // Redirect to Google OAuth for unified authentication
        window.location.href = data.authUrl;
      } else {
        throw new Error('Failed to get authentication URL');
      }
    } catch (error) {
      console.error('Error connecting to Google services:', error);
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Error disconnecting Google Drive:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check connection status on mount and periodically
  useEffect(() => {
    checkStatus();
    
    // Check status every 5 minutes to ensure persistent connection
    const statusInterval = setInterval(checkStatus, 300000);
    
    return () => clearInterval(statusInterval);
  }, []);

  const value = {
    isConnected,
    isLoading,
    connect,
    disconnect,
    checkStatus,
  };

  return (
    <GoogleDriveContext.Provider value={value}>
      {children}
    </GoogleDriveContext.Provider>
  );
};