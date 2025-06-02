import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, RefreshCw, ExternalLink, User, Calendar, Paperclip } from "lucide-react";
import { format } from "date-fns";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  hasAttachments: boolean;
}

interface GmailInboxProps {
  className?: string;
}

export default function GmailInbox({ className }: GmailInboxProps) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const { toast } = useToast();

  const checkGmailConnection = async () => {
    try {
      const response = await apiRequest("GET", "/api/gmail/status");
      setIsConnected(response.connected);
      if (response.connected) {
        fetchMessages();
      }
    } catch (error) {
      setIsConnected(false);
    }
  };

  const connectGmail = async () => {
    try {
      const response = await apiRequest("GET", "/api/gmail/auth-url");
      window.open(response.authUrl, '_blank', 'width=500,height=600');
      
      // Poll for connection status
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await apiRequest("GET", "/api/gmail/status");
          if (statusResponse.connected) {
            setIsConnected(true);
            clearInterval(pollInterval);
            await fetchMessages();
            toast({
              title: "Gmail Connected",
              description: "Successfully connected to your Gmail account."
            });
          }
        } catch (error) {
          // Continue polling
        }
      }, 2000);

      // Stop polling after 60 seconds
      setTimeout(() => clearInterval(pollInterval), 60000);
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Failed to connect to Gmail.",
        variant: "destructive"
      });
    }
  };

  const disconnectGmail = async () => {
    try {
      await apiRequest("POST", "/api/gmail/disconnect");
      setIsConnected(false);
      setMessages([]);
      setLastSync(null);
      toast({
        title: "Gmail Disconnected",
        description: "Successfully disconnected from Gmail."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disconnect Gmail.",
        variant: "destructive"
      });
    }
  };

  const fetchMessages = async () => {
    if (!isConnected) return;
    
    setIsLoading(true);
    try {
      const response = await apiRequest("GET", "/api/gmail/messages?maxResults=20");
      setMessages(response.messages || []);
      setLastSync(new Date());
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch Gmail messages.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openGmail = () => {
    window.open('https://mail.google.com', '_blank');
  };

  const openMessage = (messageId: string) => {
    window.open(`https://mail.google.com/mail/u/0/#inbox/${messageId}`, '_blank');
  };

  useEffect(() => {
    checkGmailConnection();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      if (isConnected) {
        fetchMessages();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const unreadCount = messages.filter(msg => msg.unread).length;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Gmail Inbox
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unreadCount} unread
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="text-xs text-gray-500">
              Last sync: {format(lastSync, 'HH:mm')}
            </span>
          )}
          {isConnected ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchMessages}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openGmail}
                className="h-8 w-8 p-0"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={connectGmail}
            >
              Connect Gmail
            </Button>
          )}
          {isConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={disconnectGmail}
              className="text-red-600 hover:text-red-700"
            >
              Disconnect
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <div className="text-center py-8">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Connect Your Gmail</h3>
            <p className="text-gray-500 mb-4">
              View and manage your emails directly from the dashboard
            </p>
            <Button onClick={connectGmail}>
              Connect Gmail Account
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {isLoading ? "Loading messages..." : "No messages found"}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                  message.unread ? 'bg-blue-50 border-blue-200' : 'bg-white'
                }`}
                onClick={() => openMessage(message.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className={`text-sm truncate ${message.unread ? 'font-semibold' : 'font-medium'}`}>
                        {message.from}
                      </span>
                      {message.hasAttachments && (
                        <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      )}
                    </div>
                    <h4 className={`text-sm mb-1 truncate ${message.unread ? 'font-semibold' : 'font-normal'}`}>
                      {message.subject || '(No Subject)'}
                    </h4>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {message.snippet}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(message.date), 'MMM dd')}
                    </div>
                    {message.unread && (
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}