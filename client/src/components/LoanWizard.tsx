import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Home, Users, Building, Phone, Upload, CheckCircle, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

// Step schemas
const propertySchema = z.object({
  address: z.string().min(5, "Property address is required"),
  propertyType: z.string().min(1, "Property type is required"),
  estimatedValue: z.string().optional(),
});

const borrowerSchema = z.object({
  borrowerName: z.string().min(2, "Borrower name is required"),
  borrowerEntityName: z.string().optional(),
  loanAmount: z.string().min(1, "Loan amount is required"),
  loanToValue: z.string().optional(),
  loanType: z.string().min(1, "Loan type is required"),
  loanPurpose: z.string().min(1, "Loan purpose is required"),
  targetCloseDate: z.string().optional(),
});

const funderSchema = z.object({
  funder: z.string().min(1, "Funder is required"),
});

const contactsSchema = z.object({
  borrowerPhone: z.string().optional(),
  borrowerEmail: z.string().optional(),
  titleAgentName: z.string().optional(),
  titleAgentPhone: z.string().optional(),
  titleAgentEmail: z.string().optional(),
  insuranceAgentName: z.string().optional(),
  insuranceAgentPhone: z.string().optional(),
  insuranceAgentEmail: z.string().optional(),
  currentLenderName: z.string().optional(),
  currentLenderPhone: z.string().optional(),
  currentLenderEmail: z.string().optional(),
});

type PropertyData = z.infer<typeof propertySchema>;
type BorrowerData = z.infer<typeof borrowerSchema>;
type FunderData = z.infer<typeof funderSchema>;
type ContactsData = z.infer<typeof contactsSchema>;

interface LoanWizardProps {
  onComplete?: (loanId: number) => void;
  onCancel?: () => void;
}

const steps = [
  { id: 1, title: "Property Details", icon: Home },
  { id: 2, title: "Borrower Info", icon: Users },
  { id: 3, title: "Select Funder", icon: Building },
  { id: 4, title: "Contact Information", icon: Phone },
  { id: 5, title: "Document Upload", icon: Upload },
];

export default function LoanWizard({ onComplete, onCancel }: LoanWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [propertyData, setPropertyData] = useState<PropertyData | null>(null);
  const [borrowerData, setBorrowerData] = useState<BorrowerData | null>(null);
  const [funderData, setFunderData] = useState<FunderData | null>(null);
  const [contactsData, setContactsData] = useState<ContactsData | null>(null);
  const [createdLoanId, setCreatedLoanId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const propertyForm = useForm<PropertyData>({
    resolver: zodResolver(propertySchema),
    defaultValues: { address: "", propertyType: "", estimatedValue: "" },
  });

  const borrowerForm = useForm<BorrowerData>({
    resolver: zodResolver(borrowerSchema),
    defaultValues: {
      borrowerName: "",
      borrowerEntityName: "",
      loanAmount: "",
      loanToValue: "",
      loanType: "DSCR",
      loanPurpose: "",
      targetCloseDate: "",
    },
  });

  const funderForm = useForm<FunderData>({
    resolver: zodResolver(funderSchema),
    defaultValues: { funder: "" },
  });

  const contactsForm = useForm<ContactsData>({
    resolver: zodResolver(contactsSchema),
    defaultValues: {
      borrowerPhone: "",
      borrowerEmail: "",
      titleAgentName: "",
      titleAgentPhone: "",
      titleAgentEmail: "",
      insuranceAgentName: "",
      insuranceAgentPhone: "",
      insuranceAgentEmail: "",
      currentLenderName: "",
      currentLenderPhone: "",
      currentLenderEmail: "",
    },
  });

  const progress = (currentStep / steps.length) * 100;

  const handlePropertyNext = async (data: PropertyData) => {
    setPropertyData(data);
    setCurrentStep(2);
  };

  const handleBorrowerNext = async (data: BorrowerData) => {
    setBorrowerData(data);
    setCurrentStep(3);
  };

  const handleFunderNext = async (data: FunderData) => {
    setFunderData(data);
    setCurrentStep(4);
  };

  const handleContactsNext = async (data: ContactsData) => {
    setContactsData(data);
    
    // Create the loan with all collected data
    if (propertyData && borrowerData && funderData) {
      setLoading(true);
      try {
        // Calculate LTV if both values provided
        let calculatedLTV = null;
        if (borrowerData.loanAmount && propertyData.estimatedValue) {
          const loanAmt = parseInt(borrowerData.loanAmount.replace(/[,$]/g, ''));
          const propValue = parseInt(propertyData.estimatedValue.replace(/[,$]/g, ''));
          if (propValue > 0) {
            calculatedLTV = Math.round((loanAmt / propValue) * 100);
          }
        }

        const finalLTV = borrowerData.loanToValue ? parseInt(borrowerData.loanToValue) : calculatedLTV;

        const loanData = {
          borrowerName: borrowerData.borrowerName,
          borrowerEntityName: borrowerData.borrowerEntityName || borrowerData.borrowerName,
          propertyAddress: propertyData.address,
          propertyType: propertyData.propertyType,
          estimatedValue: propertyData.estimatedValue ? parseInt(propertyData.estimatedValue.replace(/[,$]/g, '')) : null,
          loanAmount: borrowerData.loanAmount,
          loanToValue: finalLTV,
          loanType: borrowerData.loanType,
          loanPurpose: borrowerData.loanPurpose,
          funder: funderData.funder,
          targetCloseDate: borrowerData.targetCloseDate,
          contacts: data,
        };

        const response = await apiRequest("/api/loans", {
          method: "POST",
          body: loanData
        });

        if (response.success) {
          setCreatedLoanId(response.loanId);
          await queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
          setCurrentStep(5);
          toast({
            title: "Success!",
            description: "Loan file created successfully. Now you can upload documents.",
          });
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to create loan",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="w-5 h-5" />
                Property Details
              </CardTitle>
              <CardDescription>
                Let's start by gathering information about the property.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...propertyForm}>
                <form onSubmit={propertyForm.handleSubmit(handlePropertyNext)} className="space-y-4">
                  <FormField
                    control={propertyForm.control}
                    name="address"
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
                      control={propertyForm.control}
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
                      control={propertyForm.control}
                      name="estimatedValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Value (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="500000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit">
                      Next <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Borrower Information
              </CardTitle>
              <CardDescription>
                Now let's gather the borrower and loan details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...borrowerForm}>
                <form onSubmit={borrowerForm.handleSubmit(handleBorrowerNext)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={borrowerForm.control}
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
                      control={borrowerForm.control}
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={borrowerForm.control}
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
                      control={borrowerForm.control}
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
                      control={borrowerForm.control}
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
                      control={borrowerForm.control}
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

                  <FormField
                    control={borrowerForm.control}
                    name="targetCloseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Close Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={handlePrevious}>
                      <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                    </Button>
                    <Button type="submit">
                      Next <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5" />
                Select Funder
              </CardTitle>
              <CardDescription>
                Choose the lender for this loan. This will determine the required documents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...funderForm}>
                <form onSubmit={funderForm.handleSubmit(handleFunderNext)} className="space-y-4">
                  <FormField
                    control={funderForm.control}
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
                            <SelectItem value="ahl">AHL (American Heritage Lending)</SelectItem>
                            <SelectItem value="visio">Visio</SelectItem>
                            <SelectItem value="roc_capital">ROC Capital</SelectItem>
                            <SelectItem value="velocity">Velocity</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={handlePrevious}>
                      <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                    </Button>
                    <Button type="submit">
                      Next <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Contact Information
              </CardTitle>
              <CardDescription>
                Gather contact details for all parties involved in the loan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...contactsForm}>
                <form onSubmit={contactsForm.handleSubmit(handleContactsNext)} className="space-y-6">
                  
                  <div className="space-y-4">
                    <h4 className="font-medium">Borrower Contact</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={contactsForm.control}
                        name="borrowerPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 123-4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="borrowerEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="borrower@email.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Title Agent</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={contactsForm.control}
                        name="titleAgentName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Agent Name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="titleAgentPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 123-4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="titleAgentEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="title@company.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Insurance Agent</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={contactsForm.control}
                        name="insuranceAgentName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Agent Name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="insuranceAgentPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 123-4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="insuranceAgentEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="insurance@company.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Current Lender (if refinance)</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={contactsForm.control}
                        name="currentLenderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lender Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Current Lender" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="currentLenderPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 123-4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactsForm.control}
                        name="currentLenderEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="lender@company.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={handlePrevious}>
                      <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Creating Loan..." : "Create Loan & Continue"}
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        );

      case 5:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Loan Created Successfully!
              </CardTitle>
              <CardDescription>
                Your loan file has been created. You can now start uploading documents and use the document checklist.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">Loan ID: {createdLoanId}</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Property: {propertyData?.address}
                  </p>
                  <p className="text-sm text-green-700">
                    Borrower: {borrowerData?.borrowerName}
                  </p>
                  <p className="text-sm text-green-700">
                    Funder: {funderData?.funder}
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => onComplete?.(createdLoanId!)}>
                    <FileText className="w-4 h-4 mr-2" />
                    Go to Document Checklist
                  </Button>
                  <Button variant="outline" onClick={onCancel}>
                    Close Wizard
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <CardTitle>New Loan Setup Wizard</CardTitle>
          <CardDescription>
            Step {currentStep} of {steps.length}
          </CardDescription>
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.id} className={`flex items-center gap-1 ${currentStep >= step.id ? 'text-primary' : ''}`}>
                    <Icon className="w-3 h-3" />
                    <span>{step.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Step Content */}
      {renderStepContent()}
    </div>
  );
}