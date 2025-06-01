import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Edit, Save, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EditableLoanDetailsProps {
  loanId: number;
  loanDetails: any;
}

export default function EditableLoanDetails({ loanId, loanDetails }: EditableLoanDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    loanNumber: loanDetails?.loan?.loanNumber || "",
    borrowerName: loanDetails?.loan?.borrowerName || "",
    borrowerEntityName: loanDetails?.loan?.borrowerEntityName || "",
    propertyAddress: loanDetails?.property?.address || "",
    propertyType: loanDetails?.property?.propertyType || "",
    loanAmount: loanDetails?.loan?.loanAmount || "",
    loanType: loanDetails?.loan?.loanType || "",
    loanPurpose: loanDetails?.loan?.loanPurpose || "",
    status: loanDetails?.loan?.status || "",
    targetCloseDate: loanDetails?.loan?.targetCloseDate || "",
    notes: loanDetails?.loan?.notes || ""
  });

  const { toast } = useToast();

  const updateLoanMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/loans/${loanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update loan');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId] });
      queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Loan details updated successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update loan details",
        variant: "destructive"
      });
    }
  });

  const handleSave = () => {
    updateLoanMutation.mutate(editData);
  };

  const handleCancel = () => {
    setEditData({
      loanNumber: loanDetails?.loan?.loanNumber || "",
      borrowerName: loanDetails?.loan?.borrowerName || "",
      borrowerEntityName: loanDetails?.loan?.borrowerEntityName || "",
      propertyAddress: loanDetails?.property?.address || "",
      propertyType: loanDetails?.property?.propertyType || "",
      loanAmount: loanDetails?.loan?.loanAmount || "",
      loanType: loanDetails?.loan?.loanType || "",
      loanPurpose: loanDetails?.loan?.loanPurpose || "",
      status: loanDetails?.loan?.status || "",
      targetCloseDate: loanDetails?.loan?.targetCloseDate || "",
      notes: loanDetails?.loan?.notes || ""
    });
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Loan Details</CardTitle>
        {!isEditing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateLoanMutation.isPending}
            >
              <Save className="w-4 h-4 mr-1" />
              {updateLoanMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Loan Information */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">Loan Information</h3>
            
            <div>
              <Label htmlFor="loanNumber">Loan Number</Label>
              {isEditing ? (
                <Input
                  id="loanNumber"
                  value={editData.loanNumber}
                  onChange={(e) => setEditData({...editData, loanNumber: e.target.value})}
                  className="mt-1"
                  placeholder="LN-0001"
                />
              ) : (
                <p className="mt-1 text-sm font-medium">{loanDetails?.loan?.loanNumber || "Not assigned"}</p>
              )}
            </div>

            <div>
              <Label htmlFor="borrowerName">Borrower Name</Label>
              {isEditing ? (
                <Input
                  id="borrowerName"
                  value={editData.borrowerName}
                  onChange={(e) => setEditData({...editData, borrowerName: e.target.value})}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.borrowerName || "Not specified"}</p>
              )}
            </div>

            <div>
              <Label htmlFor="borrowerEntityName">Entity Name</Label>
              {isEditing ? (
                <Input
                  id="borrowerEntityName"
                  value={editData.borrowerEntityName}
                  onChange={(e) => setEditData({...editData, borrowerEntityName: e.target.value})}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.borrowerEntityName || "Not specified"}</p>
              )}
            </div>
          </div>

          {/* Property Information */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">Property Information</h3>
            
            <div>
              <Label htmlFor="propertyAddress">Property Address</Label>
              {isEditing ? (
                <Input
                  id="propertyAddress"
                  value={editData.propertyAddress}
                  onChange={(e) => setEditData({...editData, propertyAddress: e.target.value})}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.property?.address || "Not specified"}</p>
              )}
            </div>

            <div>
              <Label htmlFor="propertyType">Property Type</Label>
              {isEditing ? (
                <Select
                  value={editData.propertyType}
                  onValueChange={(value) => setEditData({...editData, propertyType: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select property type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_family">Single Family</SelectItem>
                    <SelectItem value="condo">Condo</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                    <SelectItem value="multi_family">Multi Family</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.property?.propertyType || "Not specified"}</p>
              )}
            </div>
          </div>

          {/* Loan Information */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">Loan Information</h3>
            
            <div>
              <Label htmlFor="loanAmount">Loan Amount</Label>
              {isEditing ? (
                <Input
                  id="loanAmount"
                  value={editData.loanAmount}
                  onChange={(e) => setEditData({...editData, loanAmount: e.target.value})}
                  className="mt-1"
                  placeholder="$500,000"
                />
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.loanAmount || "Not specified"}</p>
              )}
            </div>

            <div>
              <Label htmlFor="loanType">Loan Type</Label>
              {isEditing ? (
                <Select
                  value={editData.loanType}
                  onValueChange={(value) => setEditData({...editData, loanType: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select loan type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dscr">DSCR</SelectItem>
                    <SelectItem value="conventional">Conventional</SelectItem>
                    <SelectItem value="fix_and_flip">Fix & Flip</SelectItem>
                    <SelectItem value="bridge">Bridge</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.loanType || "Not specified"}</p>
              )}
            </div>

            <div>
              <Label htmlFor="loanPurpose">Loan Purpose</Label>
              {isEditing ? (
                <Select
                  value={editData.loanPurpose}
                  onValueChange={(value) => setEditData({...editData, loanPurpose: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select loan purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="refinance">Refinance</SelectItem>
                    <SelectItem value="cash_out_refinance">Cash-Out Refinance</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.loanPurpose || "Not specified"}</p>
              )}
            </div>
          </div>

          {/* Status & Timeline */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">Status & Timeline</h3>
            
            <div>
              <Label htmlFor="status">Status</Label>
              {isEditing ? (
                <Select
                  value={editData.status}
                  onValueChange={(value) => setEditData({...editData, status: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application">Application</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="underwriting">Underwriting</SelectItem>
                    <SelectItem value="approval">Approval</SelectItem>
                    <SelectItem value="closing">Closing</SelectItem>
                    <SelectItem value="funded">Funded</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.status || "Not specified"}</p>
              )}
            </div>

            <div>
              <Label htmlFor="targetCloseDate">Target Close Date</Label>
              {isEditing ? (
                <Input
                  id="targetCloseDate"
                  type="date"
                  value={editData.targetCloseDate}
                  onChange={(e) => setEditData({...editData, targetCloseDate: e.target.value})}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{loanDetails?.loan?.targetCloseDate || "Not specified"}</p>
              )}
            </div>
          </div>
        </div>

        {/* Notes Section */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          {isEditing ? (
            <Textarea
              id="notes"
              value={editData.notes}
              onChange={(e) => setEditData({...editData, notes: e.target.value})}
              className="mt-1"
              rows={3}
              placeholder="Add any additional notes about this loan..."
            />
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {loanDetails?.loan?.notes || "No notes added"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}