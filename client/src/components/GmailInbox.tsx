import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Mail, 
  RefreshCw, 
  ExternalLink, 
  ArrowLeft, 
  User, 
  Calendar, 
  Reply,
  Download,
  Eye,
  Paperclip
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ParsedEmail {
  header: boolean;
  from: string;
  subject: string;
  date: string;
  content: string;
}

interface GmailInboxProps {
  className?: string;
  loanId?: number;
}

export default function GmailInbox({ className, loanId }: GmailInboxProps) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [messageContent, setMessageContent] = useState<string>("");
  const [messageAttachments, setMessageAttachments] = useState<any[]>([]);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isScanningSelected, setIsScanningSelected] = useState(false);

  const { toast } = useToast();

  const checkGmailConnection = async () => {
    try {
      const response = await apiRequest("GET", "/api/gmail/status");
      setIsConnected(response.connected);
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
            toast({
              title: "Gmail Connected",
              description: "Successfully connected to your Gmail account.",
            });
            fetchMessages();
          }
        } catch (error) {
          // Continue polling
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Could not connect to Gmail. Please try again.",
        variant: "destructive",
      });
    }
  };

  const fetchMessages = async () => {
    if (!isConnected) return;
    
    setIsLoading(true);
    try {
      const url = loanId 
        ? `/api/gmail/messages?maxResults=20&loanId=${loanId}`
        : "/api/gmail/messages?maxResults=20";
      const response = await apiRequest("GET", url);
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

  const openMessage = async (message: GmailMessage) => {
    setSelectedMessage(message);
    setIsLoadingMessage(true);
    setShowReply(false);
    setReplyContent("");

    try {
      const response = await apiRequest("GET", `/api/gmail/message/${message.id}`);
      setMessageContent(response.content || "");
      setMessageAttachments(response.attachments || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load message content.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMessage(false);
    }
  };

  const closeMessage = () => {
    setSelectedMessage(null);
    setMessageContent("");
    setMessageAttachments([]);
    setShowReply(false);
    setReplyContent("");
  };

  const parseEmailThread = (content: string): ParsedEmail[] => {
    const sections = content.split(/(?=From:|Subject:|Date:|On .* wrote:)/);
    return sections.map((section, index) => {
      const isHeader = section.includes('From:') || section.includes('Subject:') || section.includes('Date:');
      const fromMatch = section.match(/From:\s*(.+)/);
      const subjectMatch = section.match(/Subject:\s*(.+)/);
      const dateMatch = section.match(/Date:\s*(.+)/);
      
      return {
        header: isHeader,
        from: fromMatch?.[1] || '',
        subject: subjectMatch?.[1] || '',
        date: dateMatch?.[1] || '',
        content: section.replace(/^(From:|Subject:|Date:).*/gm, '').trim()
      };
    }).filter(email => email.content.length > 0);
  };

  const downloadAttachment = async (attachmentId: string, filename: string) => {
    try {
      const response = await fetch(`/api/gmail/attachment/${selectedMessage?.id}/${attachmentId}`, {
        method: 'GET',
      });
      
      if (!response.ok) throw new Error('Failed to download attachment');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download Complete",
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not download attachment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const previewAttachment = (attachment: any) => {
    if (attachment.mimeType?.startsWith('image/')) {
      window.open(`/api/gmail/attachment/${selectedMessage?.id}/${attachment.attachmentId}`, '_blank');
    } else {
      downloadAttachment(attachment.attachmentId, attachment.filename);
    }
  };

  const sendReply = async () => {
    if (!selectedMessage || !replyContent.trim()) return;
    
    setIsSendingReply(true);
    try {
      const formData = new FormData();
      formData.append('to', JSON.stringify([selectedMessage.from]));
      formData.append('subject', selectedMessage.subject.startsWith('Re:') ? selectedMessage.subject : `Re: ${selectedMessage.subject}`);
      formData.append('body', replyContent);

      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to send reply');
      }

      toast({
        title: "Reply Sent",
        description: "Your reply has been sent successfully.",
      });
      
      setReplyContent("");
      setShowReply(false);
      
      fetchMessages();
    } catch (error) {
      console.error('Error sending reply:', error);
      toast({
        title: "Send Failed",
        description: "Could not send your reply. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  const toggleEmailSelection = (messageId: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedEmails(newSelected);
  };

  const scanSelectedEmails = async () => {
    if (selectedEmails.size === 0) {
      toast({
        title: "No Emails Selected",
        description: "Please select at least one email to scan for PDFs.",
        variant: "destructive",
      });
      return;
    }

    if (!loanId) {
      toast({
        title: "No Loan Selected",
        description: "Please select a loan before scanning emails.",
        variant: "destructive",
      });
      return;
    }

    setIsScanningSelected(true);
    try {
      const messageIds = Array.from(selectedEmails);
      console.log(`Scanning ${messageIds.length} selected emails for PDFs...`);
      
      const response = await apiRequest("POST", `/api/loans/${loanId}/scan-visible-emails`, {
        messageIds: messageIds
      });
      
      toast({
        title: "Email Scan Complete",
        description: response.message,
      });
      
      // Clear selection after successful scan
      setSelectedEmails(new Set());
      
    } catch (error) {
      console.error('Selected email scan error:', error);
      toast({
        title: "Scan Failed",
        description: "Failed to scan selected emails for PDFs. Please ensure Gmail is connected.",
        variant: "destructive",
      });
    } finally {
      setIsScanningSelected(false);
    }
  };

  useEffect(() => {
    checkGmailConnection();
  }, []);

  useEffect(() => {
    if (isConnected) {
      fetchMessages();
    }
  }, [isConnected, loanId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        fetchMessages();
      }
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const unreadCount = messages.filter(msg => msg.unread).length;

  // Group messages by thread ID like Gmail
  const threadGroups = new Map<string, GmailMessage[]>();
  messages.forEach(message => {
    if (!threadGroups.has(message.threadId)) {
      threadGroups.set(message.threadId, []);
    }
    threadGroups.get(message.threadId)!.push(message);
  });

  // Convert to array and show only one conversation per thread
  const conversations = Array.from(threadGroups.values()).map((threadMessages) => {
    const latestMessage = threadMessages.reduce((latest, current) => 
      new Date(current.date) > new Date(latest.date) ? current : latest
    );
    const messageCount = threadMessages.length;
    const hasUnread = threadMessages.some(m => m.unread);
    
    return {
      latestMessage,
      messageCount,
      hasUnread
    };
  });

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
              {selectedEmails.size > 0 && loanId && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={scanSelectedEmails}
                  disabled={isScanningSelected}
                  className="text-xs"
                >
                  {isScanningSelected ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    `Scan ${selectedEmails.size} Selected`
                  )}
                </Button>
              )}
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
            <Button size="sm" onClick={connectGmail}>
              Connect
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
            {conversations.map(({ latestMessage, messageCount, hasUnread }) => (
              <div
                key={latestMessage.threadId}
                className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                  hasUnread ? 'bg-blue-50 border-blue-200' : 'bg-white'
                }`}
                onClick={() => openMessage(latestMessage)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {messageCount > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full font-medium">
                          {messageCount} messages
                        </span>
                      )}
                      {latestMessage.hasAttachments && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs bg-orange-50 text-orange-700 rounded-full font-medium">
                          <Paperclip className="w-3 h-3 mr-1" />
                          ATTACHMENTS
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="text-xs text-gray-500 font-medium">FROM:</span>
                        <span className={`text-sm font-medium ${hasUnread ? 'text-black' : 'text-gray-700'}`}>
                          {latestMessage.from}
                        </span>
                      </div>
                    </div>
                    <h4 className={`text-sm mb-1 ${hasUnread ? 'font-semibold text-black' : 'font-normal text-gray-800'}`}>
                      {latestMessage.subject?.replace(/^(Re:|Fwd:)\s*/, '') || '(No Subject)'}
                    </h4>
                    <p className="text-xs text-gray-600 line-clamp-2 mt-1">
                      {latestMessage.snippet}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {hasUnread ? (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">UNREAD</span>
                        </div>
                      ) : (
                        <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {latestMessage.date && format(new Date(latestMessage.date), 'MMM d, HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Email Content Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => closeMessage()}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeMessage}
                  className="h-8 w-8 p-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {selectedMessage?.subject || "No Subject"}
              </div>
              <div className="flex items-center gap-2">
                {selectedMessage?.hasAttachments && (
                  <Badge variant="secondary" className="text-xs">
                    <Paperclip className="w-3 h-3 mr-1" />
                    Attachments
                  </Badge>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedMessage && (
            <div className="space-y-4">
              {/* Message Details */}
              <div className="border-b pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">{selectedMessage.from}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(selectedMessage.date), 'PPP p')}
                </div>
              </div>

              {/* Message Content */}
              <div className="flex-1 overflow-y-auto max-h-96">
                {isLoadingMessage ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {parseEmailThread(messageContent).map((email, index) => (
                      <div key={index} className={`p-4 rounded-lg ${email.header ? 'bg-gray-50' : 'bg-white'} border`}>
                        {email.header && (
                          <div className="space-y-1 mb-3 text-xs text-gray-600">
                            <div><strong>From:</strong> {email.from}</div>
                            <div><strong>Subject:</strong> {email.subject}</div>
                            <div><strong>Date:</strong> {email.date}</div>
                          </div>
                        )}
                        <div className="text-sm whitespace-pre-wrap">{email.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attachments */}
              {messageAttachments.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Attachments</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {messageAttachments.map((attachment, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Paperclip className="w-4 h-4 text-gray-500" />
                          <div>
                            <div className="text-sm font-medium">{attachment.filename}</div>
                            <div className="text-xs text-gray-500">
                              {attachment.mimeType} • {Math.round(attachment.size / 1024)} KB
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => previewAttachment(attachment)}
                            className="h-8 w-8 p-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadAttachment(attachment.attachmentId, attachment.filename)}
                            className="h-8 w-8 p-0"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reply Section */}
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReply(!showReply)}
                  className="mb-3"
                >
                  <Reply className="w-4 h-4 mr-2" />
                  Reply
                </Button>
                
                {showReply && (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600">
                      <div><strong>To:</strong> {selectedMessage.from}</div>
                      <div><strong>Subject:</strong> Re: {selectedMessage.subject?.replace(/^Re:\s*/, '')}</div>
                    </div>
                    <Textarea
                      placeholder="Type your reply..."
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className="min-h-32"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={sendReply}
                        disabled={!replyContent.trim() || isSendingReply}
                        size="sm"
                      >
                        {isSendingReply ? "Sending..." : "Send Reply"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowReply(false);
                          setReplyContent("");
                        }}
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}