import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

interface SettingsProps {
  user: any;
  onLogout: () => void;
}

export default function Settings({ user, onLogout }: SettingsProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    company: "",
    avatarUrl: user?.avatarUrl || "",
  });
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    loanUpdates: true,
    documentUploads: true,
    taskReminders: true,
    marketingEmails: false,
  });
  const [apiSettings, setApiSettings] = useState({
    openaiApiKey: "",
    googleDriveApiKey: "",
  });

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleNotificationChange = (name: string) => {
    setNotifications(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleApiSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setApiSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Profile updated",
        description: "Your profile information has been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Notification preferences updated",
        description: "Your notification preferences have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update notification preferences. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApiSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "API settings updated",
        description: "Your API keys have been saved securely.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update API settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="py-6 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold">Settings</h2>
              <p className="mt-1 text-sm text-blue-100">
                Manage your account preferences and settings
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="api">API Settings</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <form onSubmit={handleProfileSubmit}>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    Update your personal information and profile settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <img
                        src={userProfile.avatarUrl || "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100"}
                        alt="Profile Avatar"
                        className="h-20 w-20 rounded-full object-cover border-2 border-blue-400"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="absolute bottom-0 right-0 rounded-full h-8 w-8 p-0 border-2 border-white"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="8.5" cy="7" r="4"></circle>
                          <line x1="20" y1="8" x2="20" y2="14"></line>
                          <line x1="23" y1="11" x2="17" y2="11"></line>
                        </svg>
                        <span className="sr-only">Change avatar</span>
                      </Button>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">{user?.name || userProfile.name || "User"}</h3>
                      <p className="text-sm text-gray-500">{user?.role || "Loan Processor"}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        name="name"
                        value={userProfile.name}
                        onChange={handleProfileChange}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={userProfile.email}
                        onChange={handleProfileChange}
                        placeholder="Enter your email address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={userProfile.phone}
                        onChange={handleProfileChange}
                        placeholder="Enter your phone number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        name="company"
                        value={userProfile.company}
                        onChange={handleProfileChange}
                        placeholder="Enter your company name"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <form onSubmit={handleNotificationsSubmit}>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>
                    Customize how and when you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="emailAlerts">Email Alerts</Label>
                        <p className="text-sm text-gray-500">
                          Receive important alerts via email
                        </p>
                      </div>
                      <Switch
                        id="emailAlerts"
                        checked={notifications.emailAlerts}
                        onCheckedChange={() => handleNotificationChange("emailAlerts")}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="loanUpdates">Loan Status Updates</Label>
                        <p className="text-sm text-gray-500">
                          Get notified when loan status changes
                        </p>
                      </div>
                      <Switch
                        id="loanUpdates"
                        checked={notifications.loanUpdates}
                        onCheckedChange={() => handleNotificationChange("loanUpdates")}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="documentUploads">Document Uploads</Label>
                        <p className="text-sm text-gray-500">
                          Receive notifications when new documents are uploaded
                        </p>
                      </div>
                      <Switch
                        id="documentUploads"
                        checked={notifications.documentUploads}
                        onCheckedChange={() => handleNotificationChange("documentUploads")}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="taskReminders">Task Reminders</Label>
                        <p className="text-sm text-gray-500">
                          Get reminders for approaching task deadlines
                        </p>
                      </div>
                      <Switch
                        id="taskReminders"
                        checked={notifications.taskReminders}
                        onCheckedChange={() => handleNotificationChange("taskReminders")}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="marketingEmails">Marketing Emails</Label>
                        <p className="text-sm text-gray-500">
                          Receive updates about new features and promotions
                        </p>
                      </div>
                      <Switch
                        id="marketingEmails"
                        checked={notifications.marketingEmails}
                        onCheckedChange={() => handleNotificationChange("marketingEmails")}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save Preferences"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="api">
            <Card>
              <form onSubmit={handleApiSettingsSubmit}>
                <CardHeader>
                  <CardTitle>API Settings</CardTitle>
                  <CardDescription>
                    Configure your API keys for external services integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
                    <Input
                      id="openaiApiKey"
                      name="openaiApiKey"
                      type="password"
                      value={apiSettings.openaiApiKey}
                      onChange={handleApiSettingsChange}
                      placeholder="Enter your OpenAI API key"
                    />
                    <p className="text-sm text-gray-500">
                      Used for AI-powered document analysis and assistant features
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="googleDriveApiKey">Google Drive API Key</Label>
                    <Input
                      id="googleDriveApiKey"
                      name="googleDriveApiKey"
                      type="password"
                      value={apiSettings.googleDriveApiKey}
                      onChange={handleApiSettingsChange}
                      placeholder="Enter your Google Drive API key"
                    />
                    <p className="text-sm text-gray-500">
                      Required for Google Drive integration and document storage
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save API Settings"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="subscription">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Plan</CardTitle>
                <CardDescription>
                  Manage your subscription and billing information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <div className="bg-blue-600 text-white p-2 rounded-md mr-4">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-md font-semibold text-blue-800">
                        Professional Plan
                      </h3>
                      <p className="text-sm text-blue-600">
                        $49.99/month, billed monthly
                      </p>
                      <div className="mt-2 flex">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Plan Features</h4>
                  <ul className="space-y-2">
                    <li className="flex items-center text-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 mr-2 text-green-500"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Unlimited loan files
                    </li>
                    <li className="flex items-center text-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 mr-2 text-green-500"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Advanced AI assistant
                    </li>
                    <li className="flex items-center text-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 mr-2 text-green-500"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      20GB document storage
                    </li>
                    <li className="flex items-center text-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 mr-2 text-green-500"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Priority support
                    </li>
                  </ul>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Payment Method</h4>
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-8 w-8 text-blue-500"
                      >
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                        <line x1="1" y1="10" x2="23" y2="10"></line>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Visa ending in 4242</p>
                      <p className="text-xs text-gray-500">Expires 12/2025</p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-start space-y-2 sm:flex-row sm:justify-between sm:space-y-0">
                <Button variant="outline" className="sm:mr-2">
                  Change Plan
                </Button>
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                  Cancel Subscription
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}