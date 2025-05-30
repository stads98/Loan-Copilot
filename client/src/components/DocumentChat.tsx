import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Send, Bot, User, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DocumentChatProps {
  loanId: number;
}

interface Message {
  id: number;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
}

export default function DocumentChat({ loanId }: DocumentChatProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch messages for this loan
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ['/api/loans', loanId, 'messages'],
  });

  // Fetch documents for context
  const { data: documents = [] } = useQuery({
    queryKey: ['/api/loans', loanId, 'documents'],
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, role }: { content: string; role: "user" | "assistant" }) => {
      return apiRequest(`/api/loans/${loanId}/messages`, {
        method: 'POST',
        body: { content, role }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId, 'messages'] });
    }
  });

  // Chat with AI mutation
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      setIsLoading(true);
      
      // First save the user message
      await sendMessageMutation.mutateAsync({ content: userMessage, role: "user" });
      
      // Then send to AI for response
      const response = await apiRequest(`/api/loans/${loanId}/chat`, {
        method: 'POST',
        body: { message: userMessage }
      });
      
      // Save AI response
      await sendMessageMutation.mutateAsync({ 
        content: response.response, 
        role: "assistant" 
      });
      
      return response;
    },
    onSettled: () => {
      setIsLoading(false);
    }
  });

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message;
    setMessage("");
    
    try {
      await chatMutation.mutateAsync(userMessage);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Count document categories
  const documentStats = documents.reduce((acc: any, doc: any) => {
    const category = doc.category || 'Other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const hasAnalysisMessage = messages.some((msg: Message) => 
    msg.role === "assistant" && msg.content.includes("comprehensive scan")
  );

  return (
    <div className="space-y-4">
      {/* Document Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Analysis Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{documents.length}</div>
              <div className="text-sm text-muted-foreground">Total Documents</div>
            </div>
            {Object.entries(documentStats).slice(0, 3).map(([category, count]) => (
              <div key={category} className="text-center">
                <div className="text-2xl font-bold text-green-600">{count as number}</div>
                <div className="text-sm text-muted-foreground">{category}</div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            {hasAnalysisMessage ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">AI Analysis Complete</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-600">Ready for Analysis</span>
              </>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2">
            {Object.entries(documentStats).map(([category, count]) => (
              <Badge key={category} variant="secondary">
                {category}: {count as number}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chat Interface */}
      <Card className="h-[500px] flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Loan Processing Assistant
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col p-0">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {isLoadingMessages ? (
              <div className="text-center text-muted-foreground">Loading conversation...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium mb-2">Welcome to your Loan Processing Assistant</p>
                <p className="text-sm">I can help you analyze documents, identify missing items, and guide you through the loan process.</p>
                {documents.length > 0 && (
                  <p className="text-sm mt-2 text-blue-600">
                    I have access to {documents.length} documents from your recent scan.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg: Message) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                      }`}>
                        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`rounded-lg p-3 ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-muted'
                      }`}>
                        <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                        <div className={`text-xs mt-1 ${
                          msg.role === 'user' ? 'text-blue-100' : 'text-muted-foreground'
                        }`}>
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>

          <Separator />

          {/* Message Input */}
          <div className="p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about the documents, missing items, or next steps..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1"
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!message.trim() || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}