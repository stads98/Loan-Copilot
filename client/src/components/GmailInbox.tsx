import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Mail, RefreshCw, ExternalLink, User, Calendar, Paperclip, ArrowLeft, Eye, Download, Save, Search, Loader2 } from "lucide-react";
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

export function GmailInbox({ className, loanId }: GmailInboxProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [messageAttachments, setMessageAttachments] = useState<any[]>([]);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isScanningSelected, setIsScanningSelected] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  
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

  const toggleThread = (threadId: string) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(threadId)) {
      newExpanded.delete(threadId);
    } else {
      newExpanded.add(threadId);
    }
    setExpandedThreads(newExpanded);
  };

  const openMessage = (message: GmailMessage) => {
    setSelectedMessage(message);
    setMessageContent('');
    setMessageAttachments([]);
    setIsLoadingMessage(true);
    
    apiRequest("GET", `/api/gmail/messages/${message.id}`)
      .then(response => {
        setMessageContent(response.content || 'No content available');
        setMessageAttachments(response.attachments || []);
      })
      .catch(error => {
        console.error('Error fetching message:', error);
        setMessageContent('Error loading message content');
      })
      .finally(() => {
        setIsLoadingMessage(false);
      });
  };

  const closeMessage = () => {
    setSelectedMessage(null);
    setShowReply(false);
    setReplyContent("");
  };

  const toggleEmailSelection = (emailId: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(emailId)) {
      newSelected.delete(emailId);
    } else {
      newSelected.add(emailId);
    }
    setSelectedEmails(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedEmails.size === messages.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(messages.map(m => m.id)));
    }
  };

  // Function to parse email threads and separate individual messages
  const parseEmailThread = (emailContent: string): ParsedEmail[] => {
    if (!emailContent) return [{ header: false, from: '', subject: '', date: '', content: 'No content available' }];
    
    const emails: ParsedEmail[] = [];
    
    // Only split on clear email thread separators that indicate multiple different emails
    // Be more conservative to avoid splitting single emails into multiple parts
    const sections = emailContent.split(/(?=^From:\s*.+?\n.*?Subject:\s*.+?\n)/gm);
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;
      
      // Only treat as separate email if it has a complete email header structure
      const hasCompleteHeader = section.match(/^From:\s*.+?\n.*?Subject:\s*.+?\n/m);
      
      let content = section;
      let hasHeader = false;
      let from = '';
      let subject = '';
      let date = '';
      
      if (hasCompleteHeader) {
        hasHeader = true;
        
        // Extract header information
        const fromMatch = section.match(/From:\s*(.+?)(?:\n|$)/i);
        const sentMatch = section.match(/Sent:\s*(.+?)(?:\n|$)/i);
        const subjectMatch = section.match(/Subject:\s*(.+?)(?:\n|$)/i);
        
        from = fromMatch ? fromMatch[1].trim() : '';
        subject = subjectMatch ? subjectMatch[1].trim() : '';
        date = sentMatch ? sentMatch[1].trim() : '';
        
        // Remove the header from content
        content = section.replace(/^From:\s*.+?\n.*?Subject:\s*.+?\n.*?(?:Sent|Date):\s*.+?\n/m, '').trim();
      }
      
      emails.push({
        header: hasHeader,
        from,
        subject,
        date,
        content: content || section
      });
    }
    
    return emails.length > 0 ? emails : [{ header: false, from: '', subject: '', date: '', content: emailContent }];
  };

  const downloadAttachment = async (messageId: string, attachment: any) => {
    try {
      const response = await fetch(`/api/gmail/messages/${messageId}/attachments/${attachment.attachmentId}`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error('Failed to download attachment');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Complete",
        description: `Downloaded ${attachment.filename}`
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Could not download attachment. Please try again.",
        variant: "destructive"
      });
    }
  };

  const previewAttachment = async (messageId: string, attachment: any) => {
    try {
      console.log('Previewing attachment:', attachment);
      
      const response = await fetch(`/api/gmail/messages/${messageId}/attachments/${attachment.attachmentId}`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load attachment');
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);
      
      console.log('Gmail API attachment response:', {
        hasData: !!arrayBuffer,
        dataKeys: Object.keys(arrayBuffer),
        size: arrayBuffer.byteLength,
        hasAttachmentData: binaryData.length > 0
      });
      
      if (!binaryData || binaryData.length === 0) {
        throw new Error('Failed to decode attachment data');
      }
      
      const blob = new Blob([binaryData], { type: attachment.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      // Open preview in new tab
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Could not preview attachment. Please try again.",
        variant: "destructive"
      });
    }
  };

  const sendReply = async () => {
    if (!selectedMessage || !replyContent.trim()) return;
    
    setIsSendingReply(true);
    try {
      // Create form data to match server expectations
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
      
      // Refresh messages to show the new reply
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

  useEffect(() => {
    checkGmailConnection();
  }, []);

  useEffect(() => {
    if (isConnected) {
      fetchMessages();
      // Auto-processing disabled - only manual operations allowed
    }
  }, [isConnected, loanId]);

  // Auto-processing disabled - only manual operations allowed;

  // Selective email scanning function
  const scanSelectedEmails = async () => {
    if (selectedEmails.size === 0) {
      toast({
        title: "No emails selected",
        description: "Please select emails to scan for PDFs",
        variant: "destructive"
      });
      return;
    }

    if (!loanId) {
      toast({
        title: "No loan selected",
        description: "Please select a loan to add documents to",
        variant: "destructive"
      });
      return;
    }

    setIsScanningSelected(true);
    let totalPDFs = 0;

    try {
      for (const emailId of Array.from(selectedEmails)) {
        try {
          // Get email details and attachments
          const response = await apiRequest("GET", `/api/gmail/messages/${emailId}`);
          const attachments = response.attachments || [];
          
          // Filter for PDF attachments
          const pdfAttachments = attachments.filter((att: any) => 
            att.mimeType?.includes('pdf') || att.filename?.toLowerCase().endsWith('.pdf')
          );

          if (pdfAttachments.length > 0) {
            console.log(`Found ${pdfAttachments.length} PDFs in email ${emailId}`);
            
            // Process each PDF attachment
            for (const attachment of pdfAttachments) {
              try {
                const result = await apiRequest("POST", "/api/documents", {
                  loanId: loanId,
                  filename: attachment.filename,
                  source: 'gmail',
                  sourceId: emailId,
                  attachmentId: attachment.attachmentId,
                  category: 'other' // Will be auto-categorized by the server
                });
                
                if (result) {
                  totalPDFs++;
                }
              } catch (attachmentError) {
                console.error(`Error processing attachment ${attachment.filename}:`, attachmentError);
              }
            }
          }
        } catch (emailError) {
          console.error(`Error processing email ${emailId}:`, emailError);
        }
      }

      if (totalPDFs > 0) {
        toast({
          title: "Documents Added",
          description: `Successfully added ${totalPDFs} PDF documents to the loan.`,
        });
        
        // Clear selection and refresh data
        setSelectedEmails(new Set());
        queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId] });
        queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      } else {
        toast({
          title: "No PDFs Found",
          description: "No PDF attachments were found in the selected emails.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error scanning selected emails:', error);
      toast({
        title: "Scan Failed",
        description: "Failed to scan selected emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsScanningSelected(false);
    }
  };

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
              {loanId && (
                <Button
                  onClick={scanSelectedEmails}
                  disabled={isScanningSelected || selectedEmails.size === 0}
                  variant="outline"
                  size="sm"
                  className="ml-2"
                >
                  {isScanningSelected ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Scan Selected ({selectedEmails.size})
                    </>
                  )}
                </Button>
              )}
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
            {/* Select All Checkbox */}
            {loanId && messages.length > 0 && (
              <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50 rounded-lg">
                <Checkbox
                  id="select-all"
                  checked={selectedEmails.size === messages.length && messages.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({messages.length} emails)
                </label>
              </div>
            )}
            {(() => {
              // Group messages by thread
              const threadGroups = new Map();
              messages.forEach(message => {
                if (!threadGroups.has(message.threadId)) {
                  threadGroups.set(message.threadId, []);
                }
                threadGroups.get(message.threadId).push(message);
              });

              // Sort threads by most recent message
              const sortedThreads = Array.from(threadGroups.entries()).sort((a, b) => {
                const aLatest = Math.max(...a[1].map((m: any) => new Date(m.date).getTime()));
                const bLatest = Math.max(...b[1].map((m: any) => new Date(m.date).getTime()));
                return bLatest - aLatest;
              });

              return sortedThreads.map(([threadId, threadMessages]) => {
                // Sort messages within thread by date (oldest first)
                const sortedMessages = threadMessages.sort((a: any, b: any) => 
                  new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                
                const latestMessage = sortedMessages[sortedMessages.length - 1];
                const isExpanded = expandedThreads.has(threadId);
                const threadCount = sortedMessages.length;
                const unreadInThread = sortedMessages.filter((m: any) => m.unread).length;

                return (
                  <div key={threadId} className="border rounded-lg bg-white border-gray-200 overflow-hidden mb-2">
                    {/* Thread Header - Latest Message */}
                    <div 
                      className={`group relative transition-colors hover:bg-gray-50 cursor-pointer ${
                        latestMessage.unread ? 'bg-blue-50' : 'bg-white'
                      } ${selectedEmails.has(latestMessage.id) ? 'ring-2 ring-blue-500' : ''}`}
                      onClick={() => threadCount > 1 ? toggleThread(threadId) : openMessage(latestMessage)}
                    >
                      <div className="p-3">
                        <div className="flex items-start gap-3">
                          {loanId && (
                            <div className="flex items-center mt-1">
                              <Checkbox
                                checked={selectedEmails.has(latestMessage.id)}
                                onCheckedChange={() => toggleEmailSelection(latestMessage.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {latestMessage.from.split('<')[0].trim() || latestMessage.from}
                                </span>
                                {threadCount > 1 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {threadCount} messages
                                  </Badge>
                                )}
                                {unreadInThread > 0 && (
                                  <Badge variant="destructive" className="text-xs">
                                    {unreadInThread} new
                                  </Badge>
                                )}
                                {latestMessage.hasAttachments && (
                                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-gray-500">
                                  {format(new Date(latestMessage.date), 'MMM d')}
                                </span>
                              </div>
                            </div>
                            <h4 className={`text-sm mb-1 line-clamp-1 ${latestMessage.unread ? 'font-semibold text-black' : 'font-normal text-gray-800'}`}>
                              {latestMessage.subject || '(No Subject)'}
                            </h4>
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {latestMessage.snippet}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMessage(latestMessage);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Thread Messages */}
                    {isExpanded && threadCount > 1 && (
                      <div className="border-t border-gray-200 bg-gray-50">
                        {sortedMessages.slice(0, -1).reverse().map((message: any, index: any) => (
                          <div 
                            key={message.id}
                            className={`border-b border-gray-200 last:border-b-0 hover:bg-gray-100 transition-colors cursor-pointer ${
                              message.unread ? 'bg-blue-50' : 'bg-white'
                            } ${selectedEmails.has(message.id) ? 'ring-2 ring-blue-500' : ''}`}
                            onClick={() => openMessage(message)}
                          >
                            <div className="p-3 pl-8">
                              <div className="flex items-start gap-3">
                                {loanId && (
                                  <div className="flex items-center mt-1">
                                    <Checkbox
                                      checked={selectedEmails.has(message.id)}
                                      onCheckedChange={() => toggleEmailSelection(message.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                      <span className="text-xs font-medium text-gray-700 truncate">
                                        {message.from.split('<')[0].trim() || message.from}
                                      </span>
                                      {message.hasAttachments && (
                                        <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                      )}
                                      {message.unread && (
                                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0"></div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <span className="text-xs text-gray-500">
                                        {format(new Date(message.date), 'MMM d, HH:mm')}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-600 line-clamp-1">
                                    {message.snippet}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMessage(message);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
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
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="truncate">
                  {selectedMessage?.subject || '(No Subject)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {selectedMessage && format(new Date(selectedMessage.date), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Email Content */}
          <div className="max-h-96 overflow-y-auto">
            {isLoadingMessage ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {parseEmailThread(messageContent).map((email, index) => (
                  <div 
                    key={index} 
                    className={`p-4 rounded-lg border-2 ${
                      index === 0 
                        ? 'border-blue-200 bg-blue-50' 
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    {email.header && (
                      <div className="border-b border-gray-300 pb-2 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {index === 0 ? 'Latest Message' : `Previous Message ${index}`}
                          </span>
                          {email.date && (
                            <span className="text-xs text-gray-500">{email.date}</span>
                          )}
                        </div>
                        {email.from && (
                          <div className="mt-1">
                            <span className="text-xs text-gray-500 font-medium">FROM: </span>
                            <span className="text-sm font-medium text-gray-800">{email.from}</span>
                          </div>
                        )}
                        {email.subject && (
                          <div className="mt-1">
                            <span className="text-xs text-gray-500 font-medium">SUBJECT: </span>
                            <span className="text-sm font-medium text-gray-800">{email.subject}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {email.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attachments Section */}
          {messageAttachments && messageAttachments.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">
                Attachments ({messageAttachments.length})
              </h4>
              <div className="space-y-2">
                {messageAttachments.map((attachment, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="text-sm font-medium">{attachment.filename}</div>
                        <div className="text-xs text-gray-500">
                          {attachment.mimeType} • {attachment.size ? `${(attachment.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => previewAttachment(selectedMessage!.id, attachment)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadAttachment(selectedMessage!.id, attachment)}
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
              onClick={() => setShowReply(!showReply)}
              variant="outline"
              size="sm"
              className="mb-3"
            >
              {showReply ? 'Cancel Reply' : 'Reply'}
            </Button>

            {showReply && (
              <div className="space-y-3">
                <div className="text-sm">
                  <strong>To:</strong> {selectedMessage?.from}
                  <br />
                  <strong>Subject:</strong> {selectedMessage?.subject?.startsWith('Re:') ? selectedMessage.subject : `Re: ${selectedMessage?.subject}`}
                </div>
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Type your reply..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setShowReply(false);
                      setReplyContent("");
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={sendReply}
                    disabled={!replyContent.trim() || isSendingReply}
                    size="sm"
                  >
                    {isSendingReply ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reply'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}