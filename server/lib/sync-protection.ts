// EMERGENCY PROTECTION: Prevent any deletion of local documents during sync
// Local document management is the PRIMARY SOURCE - Google Drive is backup only

export const SYNC_PROTECTION_ENABLED = true;

export function preventDocumentDeletion(operation: string, documentName: string): boolean {
  if (SYNC_PROTECTION_ENABLED) {
    console.log(`🛡️ SYNC PROTECTION ACTIVE: Blocking deletion of "${documentName}" during ${operation}`);
    console.log(`🛡️ LOCAL DOCUMENTS ARE PROTECTED - Primary source cannot be deleted`);
    return false; // Block the deletion
  }
  return true; // Allow deletion if protection is disabled
}

export function logProtectedOperation(operation: string, documentCount: number): void {
  console.log(`🛡️ PROTECTION: ${operation} preserved ${documentCount} local documents as primary source`);
  console.log(`🛡️ Google Drive serves as backup destination only`);
}