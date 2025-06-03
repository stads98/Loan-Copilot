import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Folder, FolderPlus, Search, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GoogleDriveFolder {
  id: string;
  name: string;
  parents?: string[];
  modifiedTime?: string;
}

interface GoogleDriveFolderSelectorProps {
  onFolderSelected: (folderId: string, folderName: string) => void;
  propertyAddress: string;
  currentFolderId?: string;
}

export default function GoogleDriveFolderSelector({ 
  onFolderSelected, 
  propertyAddress, 
  currentFolderId 
}: GoogleDriveFolderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<GoogleDriveFolder | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const { toast } = useToast();

  const [requiresAuth, setRequiresAuth] = useState(false);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/drive/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
        setRequiresAuth(false);
      } else {
        const errorData = await response.json();
        if (errorData.requiresReauth) {
          setRequiresAuth(true);
          toast({
            title: "Google Drive Authentication Required",
            description: "Please reconnect your Google Drive account to access folders.",
            variant: "destructive"
          });
        } else {
          throw new Error('Failed to load folders');
        }
      }
    } catch (error) {
      console.error('Error loading Google Drive folders:', error);
      setRequiresAuth(true);
      toast({
        title: "Google Drive Authentication Required",
        description: "Please reconnect your Google Drive account to access folders.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a folder name.",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/drive/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName.trim()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newFolder = data.folder;
        
        toast({
          title: "Success",
          description: `Created folder "${newFolder.name}" in Google Drive.`
        });

        onFolderSelected(newFolder.id, newFolder.name);
        setIsOpen(false);
        
        // Refresh folder list
        loadFolders();
      } else {
        throw new Error('Failed to create folder');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error",
        description: "Failed to create folder in Google Drive.",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const selectFolder = () => {
    if (selectedFolder) {
      onFolderSelected(selectedFolder.id, selectedFolder.name);
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  useEffect(() => {
    // Auto-populate new folder name with property address when it changes
    if (propertyAddress && !newFolderName) {
      setNewFolderName(propertyAddress);
    }
  }, [propertyAddress, newFolderName]);

  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Folder className="w-4 h-4 mr-2" />
          {currentFolderId ? "Change Google Drive Folder" : "Select Google Drive Folder"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select or Create Google Drive Folder</DialogTitle>
          <DialogDescription>
            Choose an existing folder or create a new one for this loan's documents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {requiresAuth ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-sm text-destructive">
                  Google Drive Authentication Required
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your Google Drive connection has expired. Please reconnect to access your loan folders.
                </p>
                <Button 
                  onClick={() => window.open('/api/auth/google', '_blank')} 
                  className="w-full"
                >
                  Reconnect Google Drive
                </Button>
                <p className="text-xs text-muted-foreground">
                  After reconnecting, refresh this page and try again.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Create New Folder Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center">
                    <FolderPlus className="w-4 h-4 mr-2" />
                    Create New Folder
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                  <Button 
                    onClick={createNewFolder} 
                    disabled={creating || !newFolderName.trim()}
                    className="w-full"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Folder
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* Select Existing Folder Section */}
          {!requiresAuth && (
            <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center">
                <Folder className="w-4 h-4 mr-2" />
                Select Existing Folder
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" onClick={loadFolders} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
                </Button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    Loading folders...
                  </div>
                ) : filteredFolders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery ? "No folders match your search." : "No folders found."}
                  </div>
                ) : (
                  filteredFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedFolder?.id === folder.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedFolder(folder)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Folder className="w-4 h-4 text-blue-500" />
                          <span className="font-medium">{folder.name}</span>
                        </div>
                        {folder.modifiedTime && (
                          <Badge variant="secondary" className="text-xs">
                            {new Date(folder.modifiedTime).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button 
                onClick={selectFolder} 
                disabled={!selectedFolder}
                className="w-full"
              >
                Select Folder
              </Button>
            </CardContent>
          </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}