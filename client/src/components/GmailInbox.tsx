import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Mail, RefreshCw, ExternalLink, User, Calendar, Paperclip, ArrowLeft, Eye, Download, Save } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [messageContent, setMessageContent] = useState<string>("");
  const [messageAttachments, setMessageAttachments] = useState<any[]>([]);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [messageCache, setMessageCache] = useState<Map<string, {content: string, attachments: any[]}>>(new Map());
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const { toast } = useToast();

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
        
        // Remove header lines from content
        content = content
          .replace(/From:\s*.+?\n/gi, '')
          .replace(/Sent:\s*.+?\n/gi, '')
          .replace(/To:\s*.+?\n/gi, '')
          .replace(/Cc:\s*.+?\n/gi, '')
          .replace(/Subject:\s*.+?\n/gi, '')
          .trim();
      }
      
      // Clean up content
      content = content
        .replace(/^[\s\n\r]+/, '')
        .replace(/[\s\n\r]+$/, '')
        .replace(/\n{3,}/g, '\n\n');
      
      if (content) {
        emails.push({
          header: hasHeader,
          from,
          subject,
          date,
          content
        });
      }
    }
    
    // If no sections were found, treat the entire content as one email
    if (emails.length === 0) {
      emails.push({
        header: false,
        from: '',
        subject: '',
        date: '',
        content: emailContent
      });
    }
    
    return emails;
  };

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

  const openMessage = async (message: GmailMessage) => {
    setSelectedMessage(message);
    setIsLoadingMessage(true);
    
    // Check cache first
    const cached = messageCache.get(message.id);
    if (cached) {
      setMessageContent(cached.content);
      setMessageAttachments(cached.attachments);
      setIsLoadingMessage(false);
      
      // Auto-download PDFs if not already processed
      autoDownloadPDFs(cached.attachments, message.id);
      return;
    }
    
    try {
      const response = await apiRequest("GET", `/api/gmail/messages/${message.id}`);
      const content = response.content || message.snippet;
      const attachments = response.attachments || [];
      
      // Cache the response
      setMessageCache(prev => new Map(prev).set(message.id, { content, attachments }));
      
      setMessageContent(content);
      setMessageAttachments(attachments);
      
      // Auto-download PDFs when message opens
      autoDownloadPDFs(attachments, message.id);
    } catch (error) {
      setMessageContent(message.snippet);
      setMessageAttachments([]);
      toast({
        title: "Could not load full email",
        description: "Showing preview instead",
        variant: "destructive"
      });
    } finally {
      setIsLoadingMessage(false);
    }
  };

  const closeMessage = () => {
    setSelectedMessage(null);
    setMessageContent("");
    setMessageAttachments([]);
  };

  // Auto-download PDFs function
  const autoDownloadPDFs = async (attachments: any[], messageId: string) => {
    const pdfAttachments = attachments.filter(att => att.mimeType?.includes('pdf'));
    
    for (const attachment of pdfAttachments) {
      try {
        console.log('Auto-downloading PDF:', attachment.filename);
        const response = await apiRequest("GET", `/api/gmail/messages/${messageId}/attachments/${attachment.attachmentId}`);
        
        if (!response || !response.data) {
          console.log('No attachment data for:', attachment.filename);
          continue;
        }
        
        // Save PDF to loan documents and Google Drive
        await apiRequest("POST", `/api/loans/${loanId}/documents/from-email`, {
          attachmentData: response.data,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          emailSubject: selectedMessage?.subject,
          emailFrom: selectedMessage?.from
        });
        
        console.log('Auto-downloaded PDF:', attachment.filename);
      } catch (error) {
        console.error('Auto-download failed for:', attachment.filename, error);
      }
    }
    
    if (pdfAttachments.length > 0) {
      // Refresh documents list after auto-downloads
      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId] });
    }
  };

  const downloadAttachment = async (attachment: any) => {
    try {
      console.log('Downloading attachment:', attachment);
      const response = await apiRequest("GET", `/api/gmail/messages/${selectedMessage?.id}/attachments/${attachment.attachmentId}`);
      console.log('Attachment response:', response);
      
      // The server returns { data: base64String }
      if (!response || !response.data) {
        throw new Error('No attachment data received');
      }
      
      // Save files (images only via manual save) to loan documents and Google Drive
      const saveResponse = await apiRequest("POST", `/api/loans/${loanId}/documents/from-email`, {
        attachmentData: response.data, // Use the base64 data directly
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        emailSubject: selectedMessage?.subject,
        emailFrom: selectedMessage?.from
      });
      
      // Invalidate documents cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId] });
      
      const fileType = attachment.mimeType?.includes('pdf') ? 'PDF' : 
                       attachment.mimeType?.includes('image') ? 'Image' : 'File';
      
      toast({
        title: `${fileType} Saved Successfully`,
        description: `${attachment.filename} has been added to loan documents and uploaded to Google Drive`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Could not download attachment. Please try again.",
        variant: "destructive"
      });
    }
  };

  const previewAttachment = async (attachment: any) => {
    try {
      console.log('Previewing attachment:', attachment);
      const response = await apiRequest("GET", `/api/gmail/messages/${selectedMessage?.id}/attachments/${attachment.attachmentId}`);
      
      if (!response || !response.data) {
        throw new Error('No attachment data received');
      }
      
      // Decode base64 data safely (Gmail uses URL-safe base64)
      let binaryData;
      try {
        let base64Data = response.data;
        base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
        while (base64Data.length % 4) {
          base64Data += '=';
        }
        binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      } catch (decodeError) {
        console.error('Base64 decode error:', decodeError);
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
    }
  }, [isConnected, loanId]);

  useEffect(() => {
    // Auto-refresh every minute
    const interval = setInterval(() => {
      if (isConnected) {
        fetchMessages();
      }
    }, 60 * 1000);

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
            {messages.map((message, index) => {
              // Check if this message is part of a thread
              const isThreadStart = index === 0 || messages[index - 1].threadId !== message.threadId;
              const isThreadEnd = index === messages.length - 1 || messages[index + 1].threadId !== message.threadId;
              const hasThread = messages.some(m => m.threadId === message.threadId && m.id !== message.id);
              
              return (
                <div key={message.id} className={`relative ${hasThread && !isThreadEnd ? 'border-l-4 border-l-gray-300 ml-2 pl-4' : ''}`}>
                  {hasThread && isThreadStart && (
                    <div className="text-xs text-gray-500 font-medium mb-2 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                      </div>
                      CONVERSATION THREAD
                    </div>
                  )}
                  <div
                    className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                      message.unread ? 'bg-blue-50 border-blue-200' : 'bg-white'
                    } ${hasThread ? 'ml-4' : ''}`}
                    onClick={() => openMessage(message)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {message.subject?.startsWith('Re:') ? (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full font-medium">
                                REPLY
                              </span>
                            </div>
                          ) : message.subject?.startsWith('Fwd:') ? (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full font-medium">
                                FORWARD
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-gray-50 text-gray-700 rounded-full font-medium">
                                ORIGINAL
                              </span>
                            </div>
                          )}
                          {message.hasAttachments && (
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
                            <span className={`text-sm font-medium ${message.unread ? 'text-black' : 'text-gray-700'}`}>
                              {message.from}
                            </span>
                          </div>
                        </div>
                        <h4 className={`text-sm mb-1 ${message.unread ? 'font-semibold text-black' : 'font-normal text-gray-800'}`}>
                          {message.subject?.replace(/^(Re:|Fwd:)\s*/, '') || '(No Subject)'}
                        </h4>
                        <p className="text-xs text-gray-600 line-clamp-2 mt-1">
                          {message.snippet}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          {message.unread ? (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">UNREAD</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 uppercase tracking-wide">READ</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(message.date), 'MMM dd, h:mm a')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
              {/* Email Header */}
              <div className="border-b pb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <User className="w-4 h-4" />
                  <span className="font-medium">{selectedMessage.from}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  <span>{format(new Date(selectedMessage.date), "PPp")}</span>
                </div>
              </div>

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
                              <p className="text-sm font-medium text-gray-800 mt-1">
                                From: {email.from}
                              </p>
                            )}
                            {email.subject && (
                              <p className="text-sm text-gray-700">
                                Subject: {email.subject}
                              </p>
                            )}
                          </div>
                        )}
                        <div 
                          className="prose prose-sm max-w-none text-gray-700"
                          dangerouslySetInnerHTML={{ 
                            __html: email.content.replace(/\n/g, '<br>') 
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attachments */}
              {messageAttachments.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attachments ({messageAttachments.length})
                  </h4>
                  <div className="space-y-2">
                    {messageAttachments.map((attachment, index) => {
                      const isPDF = attachment.mimeType?.includes('pdf');
                      const isImage = attachment.mimeType?.includes('image');
                      
                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded border hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3">
                            {isPDF ? (
                              <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center">
                                <span className="text-red-600 text-xs font-bold">PDF</span>
                              </div>
                            ) : isImage ? (
                              <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                                <span className="text-blue-600 text-xs font-bold">IMG</span>
                              </div>
                            ) : (
                              <Paperclip className="w-6 h-6 text-gray-500" />
                            )}
                            <div>
                              <span className="text-sm font-medium block">{attachment.filename}</span>
                              {attachment.size && (
                                <span className="text-xs text-gray-500">
                                  {Math.round(attachment.size / 1024)} KB
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPDF && (
                              <Badge variant="secondary" className="text-xs">
                                Auto-downloaded
                              </Badge>
                            )}
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => previewAttachment(attachment)}
                                className="text-xs"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Preview
                              </Button>
                              {isImage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadAttachment(attachment)}
                                  className="text-xs"
                                >
                                  <Save className="w-3 h-3 mr-1" />
                                  Save
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReply(!showReply)}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Reply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`https://mail.google.com/mail/u/0/#inbox/${selectedMessage.id}`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Gmail
                </Button>
              </div>

              {/* Reply Composer */}
              {showReply && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-800 mb-2">
                      Replying to: <strong>{selectedMessage.from}</strong>
                    </p>
                    <p className="text-sm text-blue-600">
                      Subject: {selectedMessage.subject.startsWith('Re:') ? selectedMessage.subject : `Re: ${selectedMessage.subject}`}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Your Reply:
                    </label>
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Type your reply here..."
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowReply(false);
                        setReplyContent("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={sendReply}
                      disabled={!replyContent.trim() || isSendingReply}
                    >
                      {isSendingReply ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Reply
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}