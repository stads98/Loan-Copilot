import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, ArrowRight, ArrowLeft } from "lucide-react";

interface LoanSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  loanId?: number;
}

interface Step {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  completed: boolean;
  optional?: boolean;
}

export default function LoanSetupWizard({ isOpen, onClose, loanId }: LoanSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  
  const steps: Step[] = [
    {
      id: "loan-details",
      title: "Enter Loan Details",
      description: "Set up the basic loan information",
      instructions: [
        "Fill in the borrower name and contact information",
        "Enter the property address and details",
        "Select the loan type (Purchase, Refinance, etc.)",
        "Set the loan amount and target close date",
        "Choose the lender from the dropdown"
      ],
      completed: false
    },
    {
      id: "google-drive",
      title: "Connect Google Drive",
      description: "Link the loan documents folder",
      instructions: [
        "Click 'Connect Google Drive' in the Documents section",
        "Authorize access to your Google Drive account",
        "Either select an existing folder or create a new one",
        "Name the folder: '[Borrower Name] - [Property Address]'",
        "Upload or organize loan documents in the folder"
      ],
      completed: false
    },
    {
      id: "add-contacts",
      title: "Add Key Contacts",
      description: "Set up all people involved in the loan",
      instructions: [
        "Add the borrower with their email and phone number",
        "Add title company contact (for title services)",
        "Add insurance agent contact (for property insurance)",
        "Add current lender contact (for payoff requests)",
        "Add any loan analysts from your team",
        "Verify all email addresses are correct"
      ],
      completed: false
    },
    {
      id: "send-emails",
      title: "Send Initial Emails",
      description: "Notify all parties about the new loan file",
      instructions: [
        "Review the contact list for accuracy",
        "Click 'Email' button next to each contact",
        "Review and customize each email template",
        "Send title request to title company",
        "Send insurance request to insurance agent",
        "Send payoff request to current lender",
        "Send document request to borrower"
      ],
      completed: false
    },
    {
      id: "setup-tasks",
      title: "Create Action Items",
      description: "Set up follow-up tasks and reminders",
      instructions: [
        "Review the automatically generated missing documents list",
        "Create tasks for document follow-ups",
        "Set due dates for time-sensitive items",
        "Add any custom tasks specific to this loan",
        "Assign priority levels to urgent items"
      ],
      completed: false,
      optional: true
    },
    {
      id: "review",
      title: "Final Review",
      description: "Confirm everything is set up correctly",
      instructions: [
        "Review loan details for accuracy",
        "Confirm all contacts have been notified",
        "Check that Google Drive folder is properly connected",
        "Verify initial emails have been sent",
        "Review the dashboard for any missing items",
        "The loan is now ready for processing!"
      ],
      completed: false
    }
  ];

  const progress = (currentStep / (steps.length - 1)) * 100;

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const markStepComplete = () => {
    steps[currentStep].completed = true;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            Loan Setup Wizard
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>

          {/* Step Navigation */}
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  currentStep === index
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : step.completed
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {step.completed ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                <span>{step.title}</span>
                {step.optional && (
                  <span className="text-xs bg-blue-200 text-blue-700 px-1 rounded">Optional</span>
                )}
              </button>
            ))}
          </div>

          {/* Current Step Content */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <div className="mt-1">
                {steps[currentStep].completed ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <Circle className="h-6 w-6 text-blue-600" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {steps[currentStep].title}
                  {steps[currentStep].optional && (
                    <span className="ml-2 text-sm font-normal text-blue-600">(Optional)</span>
                  )}
                </h3>
                <p className="text-gray-700 mb-4">{steps[currentStep].description}</p>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900">Instructions:</h4>
                  <ul className="space-y-1">
                    {steps[currentStep].instructions.map((instruction, index) => (
                      <li key={index} className="flex items-start space-x-2 text-sm text-gray-700">
                        <span className="bg-blue-200 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium mt-0.5">
                          {index + 1}
                        </span>
                        <span>{instruction}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Step-specific action buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {currentStep === 0 && (
                    <Button size="sm" onClick={() => window.location.href = `#/loans/${loanId || 'new'}`}>
                      Go to Loan Details
                    </Button>
                  )}
                  {currentStep === 1 && (
                    <Button size="sm" onClick={() => window.location.href = '#/documents'}>
                      Connect Google Drive
                    </Button>
                  )}
                  {currentStep === 2 && (
                    <Button size="sm" onClick={() => window.location.href = `#/loans/${loanId}/contacts`}>
                      Add Contacts
                    </Button>
                  )}
                  {currentStep === 3 && (
                    <Button size="sm" onClick={() => window.location.href = `#/loans/${loanId}/contacts`}>
                      Send Emails
                    </Button>
                  )}
                  {currentStep === 4 && (
                    <Button size="sm" onClick={() => window.location.href = `#/loans/${loanId}/tasks`}>
                      Create Tasks
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Previous</span>
            </Button>

            <div className="flex space-x-2">
              {!steps[currentStep].completed && (
                <Button
                  variant="outline"
                  onClick={markStepComplete}
                  className="text-green-600 border-green-300 hover:bg-green-50"
                >
                  Mark Complete
                </Button>
              )}
              
              {currentStep === steps.length - 1 ? (
                <Button onClick={onClose} className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Finish Setup</span>
                </Button>
              ) : (
                <Button onClick={nextStep} className="flex items-center space-x-2">
                  <span>Next</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Tips Section */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">💡 Pro Tips:</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• You can come back to this wizard anytime from the loan dashboard</li>
              <li>• Complete steps in order for the best workflow experience</li>
              <li>• Optional steps can be skipped if not needed for your loan type</li>
              <li>• All contact emails will use your loan-specific templates automatically</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}