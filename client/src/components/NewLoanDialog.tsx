import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import GoogleDriveFolderSelector from "@/components/GoogleDriveFolderSelector";

const loanFormSchema = z.object({
  loanNumber: z.string().min(1, "Loan number is required"),
  borrowerName: z.string().min(2, "Borrower name is required"),
  borrowerEntityName: z.string().optional(),
  propertyAddress: z.string().min(5, "Property address is required"),
  propertyType: z.string().min(1, "Property type is required"),
  estimatedValue: z.string().optional(),
  loanAmount: z.string().min(1, "Loan amount is required"),
  loanToValue: z.string().optional(),
  loanType: z.string().min(1, "Loan type is required"),
  loanPurpose: z.string().min(1, "Loan purpose is required"),
  funder: z.string().min(1, "Funder is required"),
  targetCloseDate: z.string().optional(),
  googleDriveFolderId: z.string().optional(),
});

type LoanFormData = z.infer<typeof loanFormSchema>;

interface NewLoanDialogProps {
  onLoanCreated?: (loanId: number) => void;
}

export default function NewLoanDialog({ onLoanCreated }: NewLoanDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [selectedFolderName, setSelectedFolderName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<LoanFormData>({
    resolver: zodResolver(loanFormSchema),
    defaultValues: {
      loanNumber: "",
      borrowerName: "",
      borrowerEntityName: "",
      propertyAddress: "",
      propertyType: "",
      estimatedValue: "",
      loanAmount: "",
      loanToValue: "",
      loanType: "DSCR",
      loanPurpose: "",
      funder: "",
      targetCloseDate: "",
      googleDriveFolderId: "",
    },
  });

  const onSubmit = async (data: LoanFormData) => {
    setLoading(true);
    
    console.log('Form data being submitted:', data);

    try {
      // Use selected Google Drive folder ID
      const folderId = selectedFolderId;

      // Calculate LTV if both values provided
      let calculatedLTV = null;
      if (data.loanAmount && data.estimatedValue) {
        const loanAmt = parseInt(data.loanAmount.replace(/[,$]/g, ''));
        const propValue = parseInt(data.estimatedValue.replace(/[,$]/g, ''));
        if (propValue > 0) {
          calculatedLTV = Math.round((loanAmt / propValue) * 100);
        }
      }

      // Use manual LTV if provided, otherwise use calculated
      const finalLTV = data.loanToValue ? parseInt(data.loanToValue) : calculatedLTV;

      const loanData = {
        loanNumber: data.loanNumber,
        borrowerName: data.borrowerName,
        borrowerEntityName: data.borrowerEntityName || data.borrowerName,
        propertyAddress: data.propertyAddress,
        propertyType: data.propertyType,
        estimatedValue: data.estimatedValue ? parseInt(data.estimatedValue.replace(/[,$]/g, '')) : null,
        loanAmount: data.loanAmount,
        loanToValue: finalLTV,
        loanType: data.loanType,
        loanPurpose: data.loanPurpose,
        funder: data.funder,
        targetCloseDate: data.targetCloseDate,
        googleDriveFolderId: folderId || null,
        driveFolder: data.googleDriveLink || null,
      };

      // If Google Drive folder is provided, use comprehensive scanning
      let response;
      if (folderId) {
        toast({
          title: "Scanning Documents",
          description: "Processing all documents in the Google Drive folder...",
        });
        
        response = await apiRequest("POST", "/api/loans/scan-folder", {
          folderId: folderId,
          loanData: loanData
        });
      } else {
        // Regular loan creation without document scanning
        response = await apiRequest("POST", "/api/loans", loanData);
      }

      if (response.success) {
        const successMessage = folderId 
          ? `Loan created with ${response.documentsProcessed || 0} documents processed across ${response.foldersScanned || 1} folders. ${response.missingDocuments || 0} missing documents identified.`
          : "Loan created successfully";
          
        toast({
          title: "Success!",
          description: successMessage,
        });
        
        await queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
        
        setOpen(false);
        form.reset();
        
        if (onLoanCreated) {
          onLoanCreated(response.loanId);
        }
      }
    } catch (error: any) {
      console.error('Error creating loan:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create loan",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Loan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Loan</DialogTitle>
          <DialogDescription>
            Enter the loan details. Google Drive folder is optional and can be added later.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="loanNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Number</FormLabel>
                  <FormControl>
                    <Input placeholder="LN-0001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="borrowerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Borrower Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="borrowerEntityName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity Name (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC Properties LLC" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="propertyAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, City, State 12345" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="propertyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="single_family">Single Family</SelectItem>
                        <SelectItem value="duplex">Duplex</SelectItem>
                        <SelectItem value="triplex">Triplex</SelectItem>
                        <SelectItem value="quadplex">Quadplex</SelectItem>
                        <SelectItem value="condo">Condo</SelectItem>
                        <SelectItem value="multi_family_5plus">Multi-Family (5+ Units)</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estimatedValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Value</FormLabel>
                    <FormControl>
                      <Input placeholder="500000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="loanAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount</FormLabel>
                    <FormControl>
                      <Input placeholder="400000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="loanToValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LTV % (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="80" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="loanType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select loan type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DSCR">DSCR</SelectItem>
                        <SelectItem value="Fix & Flip">Fix & Flip</SelectItem>
                        <SelectItem value="Bridge">Bridge</SelectItem>
                        <SelectItem value="Commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="loanPurpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Purpose</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Purchase">Purchase</SelectItem>
                        <SelectItem value="Refinance">Refinance</SelectItem>
                        <SelectItem value="Cash-Out Refinance">Cash-Out Refinance</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="funder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Funder</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select funder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="kiavi">Kiavi</SelectItem>
                        <SelectItem value="ahl">AHL</SelectItem>
                        <SelectItem value="visio">Visio</SelectItem>
                        <SelectItem value="roc_capital">ROC Capital</SelectItem>
                        <SelectItem value="velocity">Velocity</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetCloseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Close Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Google Drive Folder (Optional)</label>
              <GoogleDriveFolderSelector
                onFolderSelected={(folderId, folderName) => {
                  setSelectedFolderId(folderId);
                  setSelectedFolderName(folderName);
                }}
                propertyAddress={form.watch("propertyAddress")}
                currentFolderId={selectedFolderId}
              />
              {selectedFolderName && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedFolderName}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Loan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}