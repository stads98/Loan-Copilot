import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Message } from "@/lib/types";

interface AIAssistantProps {
  loanId: number;
  messages: Message[];
}

export default function AIAssistant({ loanId, messages }: AIAssistantProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);
  
  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;
    
    // Add user message to local state immediately for UI responsiveness
    const tempUserMessage: Message = {
      id: Date.now(),
      content: inputMessage,
      role: "user",
      loanId,
      createdAt: new Date()
    };
    
    setLocalMessages(prev => [...prev, tempUserMessage]);
    setIsLoading(true);
    
    try {
      const response = await apiRequest("POST", `/api/loans/${loanId}/messages`, {
        content: inputMessage
      });
      
      const data = await response.json();
      
      // Update local messages with the actual server response
      setLocalMessages(prev => {
        // Remove the temp message
        const filteredMessages = prev.filter(msg => msg.id !== tempUserMessage.id);
        // Add the actual user and assistant messages
        return [...filteredMessages, data.userMessage, data.assistantMessage];
      });
      
      // Invalidate the messages query to keep things in sync
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/messages`] });
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
      
      // Remove the temporary message on error
      setLocalMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      setInputMessage("");
      setIsLoading(false);
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied!",
        description: "Text copied to clipboard."
      });
    }).catch(() => {
      toast({
        title: "Failed to copy",
        description: "Please try again or copy manually.",
        variant: "destructive"
      });
    });
  };
  
  const formatMessageContent = (content: string) => {
    // Format email templates
    if (content.includes("Subject:") && content.includes("Hello") && content.includes("Thank you")) {
      const parts = content.split(/(?=Subject:)/);
      const intro = parts[0];
      const emailTemplate = parts[1];
      
      return (
        <>
          {intro && <p className="text-sm text-gray-800 mb-3">{intro}</p>}
          <div className="bg-gray-50 p-3 rounded border border-gray-200 text-sm whitespace-pre-line">
            {emailTemplate}
          </div>
          <div className="mt-3 flex justify-end">
            <button 
              onClick={() => copyToClipboard(emailTemplate)}
              className="text-sm font-medium text-primary-600 hover:text-primary-500 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              Copy to clipboard
            </button>
          </div>
        </>
      );
    }
    
    // Format lists
    const formattedContent = content.replace(/\n- /g, "\n• ").replace(/\n\d+\. /g, (match) => {
      return `\n${match.trim()} `;
    });
    
    return <p className="text-sm text-gray-800 whitespace-pre-line">{formattedContent}</p>;
  };
  
  return (
    <div className="bg-white rounded-lg shadow" data-component="ai-assistant">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-heading font-medium text-gray-900">Loan Processing Co-Pilot</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            AI-powered guidance and document analysis
          </p>
        </div>
        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
          Active
        </span>
      </div>

      <div className="bg-gray-50 p-4 h-80 overflow-y-auto" id="chat-messages">
        {localMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            <p>Send a message to get started</p>
          </div>
        ) : (
          localMessages.map((message) => (
            <div 
              key={message.id} 
              className={`flex items-start mb-4 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 mr-3">
                  <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M12 8V4H8"></path>
                      <rect x="2" y="2" width="20" height="8" rx="2"></rect>
                      <path d="M2 14h20"></path>
                      <path d="M2 20h20"></path>
                      <path d="M6 14v6"></path>
                      <path d="M18 14v6"></path>
                      <path d="M14 14v6"></path>
                      <path d="M10 14v6"></path>
                    </svg>
                  </div>
                </div>
              )}
              
              <div className={`${message.role === 'assistant' ? 'bg-white' : 'bg-primary-50'} rounded-lg shadow-sm p-3 max-w-3xl`}>
                {formatMessageContent(message.content)}
              </div>
              
              {message.role === 'user' && (
                <div className="flex-shrink-0 ml-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex items-start mb-4">
            <div className="flex-shrink-0 mr-3">
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center text-white">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M12 8V4H8"></path>
                  <rect x="2" y="2" width="20" height="8" rx="2"></rect>
                  <path d="M2 14h20"></path>
                  <path d="M2 20h20"></path>
                  <path d="M6 14v6"></path>
                  <path d="M18 14v6"></path>
                  <path d="M14 14v6"></path>
                  <path d="M10 14v6"></path>
                </svg>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-200">
        <form onSubmit={handleSendMessage}>
          <div className="flex rounded-md shadow-sm">
            <Input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isLoading}
              className="focus:ring-primary-500 focus:border-primary-500 flex-grow block rounded-l-md sm:text-sm"
              placeholder="Ask for guidance or request an email template..."
            />
            <Button 
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
