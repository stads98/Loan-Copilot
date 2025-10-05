# LoanPilot - DSCR Loan Processing Co-Pilot

## Overview

LoanPilot is an intelligent web application designed to help loan processors manage DSCR (Debt Service Coverage Ratio) real estate investment loans efficiently. The system integrates with Google Drive for document management, Gmail for email communications, and OpenAI for AI-powered assistance in processing loan files.

## 🎯 Purpose

This application streamlines the workflow for submitting loans to various lenders (Kiavi, Roc Capital, AHL, etc.) by:
- Tracking documents and requirements
- Managing contacts and communications
- Providing AI-powered guidance
- Automating repetitive tasks
- Ensuring compliance with lender-specific requirements

## 🏠 Main Dashboard Features

### Loan Overview Section
- **Loan Files Grid**: Visual cards showing all active loan files
- **Quick Stats**: Completion percentages, status indicators
- **Search & Filter**: Find loans by borrower name, property address, or loan number
- **Status Badges**: Visual indicators for loan progress (In Progress, Under Review, Approved, etc.)

### Quick Actions Panel
- **New Loan Button**: Create new loan files
- **Create Demo Loan**: Generate sample loan for testing
- **View All Loans**: Navigate to comprehensive loan list
- **Recent Activity**: Show latest updates across all loans

## 📋 Individual Loan File Page Features

### Left Column - Loan Information & Status

#### 1. Editable Loan Details Card
**Buttons & Actions:**
- **Edit Button**: Switch to edit mode for loan details
- **Save Button**: Commit changes to loan information
- **Cancel Button**: Discard unsaved changes

**Editable Fields:**
- Borrower Name
- Loan Amount
- Loan Type (DSCR, etc.)
- Loan Purpose (Purchase, Refinance, Cash-Out)
- Target Close Date
- Property Address
- Lender Selection

#### 2. Document Progress Card
**Features:**
- **Progress Bar**: Visual completion percentage
- **Category Breakdown**: Documents organized by type (Borrower, Property, Title, Insurance)
- **Missing Documents Alert**: Red indicators for required missing items
- **Completion Checkboxes**: Mark requirements as satisfied
- **Document Assignment**: Assign specific documents to requirements

#### 3. Contact Management Card
**Buttons & Actions:**
- **Add Contact Button**: Create new contact entries
- **Edit Contact Button**: Modify existing contact information
- **Delete Contact Button**: Remove contacts from loan file
- **Copy Contact Info**: One-click copy of names, emails, phone numbers
- **Email Contact**: Direct email composition

**Contact Types Supported:**
- Borrower
- Title Agent
- Insurance Agent
- Current Lender
- Loan Analyst
- Real Estate Agent
- Attorney

### Right Column - Tasks & Communications

#### 4. Task Management Panel
**Buttons & Actions:**
- **Add Task Button**: Create new tasks with priority levels
- **Task Checkboxes**: Mark tasks as complete/incomplete
- **Priority Indicators**: High/Medium/Low priority badges
- **Auto-Task Creation**: System suggests next steps based on loan status

**Task Features:**
- Due date tracking
- Priority levels (High, Medium, Low)
- Automatic task suggestions
- Progress tracking

#### 5. Google Drive Integration
**Buttons & Actions:**
- **Connect Drive Button**: Link Google Drive account
- **Scan Folder Button**: Automatically detect documents in Drive folder
- **Send to Drive Button**: Upload local documents to connected folder
- **Sync Documents**: Refresh document list from Drive

**Features:**
- Automatic document detection
- Folder structure creation
- Real-time synchronization
- Document categorization

#### 6. AI Assistant (Loan Processing Co-Pilot)
**Interactive Features:**
- **Chat Interface**: Natural language queries about loan processing
- **Send Message Button**: Submit questions to AI assistant
- **Clear Chat**: Reset conversation history
- **Copy Response**: Copy AI suggestions to clipboard

**AI Capabilities:**
- Document requirement analysis
- Email template generation
- Next step recommendations
- Lender-specific guidance
- Missing document identification

### Center Column - Document Management

#### 7. Document Manager (Tabbed Interface)

##### Tab 1: Document List
**Buttons & Actions:**
- **Search Documents**: Filter by document name
- **Clear Search**: Reset document filter
- **View Document**: Open documents in new tab
- **Download Document**: Save documents locally
- **Delete Document**: Remove documents from loan file

**Features:**
- Document thumbnails
- File size and type indicators
- Upload date tracking
- Category organization

##### Tab 2: Requirements Checklist
**Interactive Elements:**
- **Requirement Checkboxes**: Mark requirements as complete
- **Upload for Requirement**: Direct file upload for specific requirements
- **Add Custom Requirement**: Create additional document requirements
- **Bulk Upload**: Upload multiple files at once

**Lender-Specific Checklists:**
- Kiavi requirements
- Roc Capital requirements
- AHL requirements
- Visio requirements
- Custom lender requirements

##### Tab 3: Upload Documents
**Upload Features:**
- **File Selection**: Choose multiple files (PDF, JPG, PNG, DOC, DOCX)
- **Drag & Drop**: Drag files directly to upload area
- **Document Categorization**: Assign categories during upload
- **Document Naming**: Custom naming with auto-suggestions
- **Bulk Upload**: Process multiple files simultaneously

##### Tab 4: Email Integration
**Gmail Features:**
- **Connect Gmail**: Link Gmail account for email management
- **Inbox View**: Display recent emails related to loan
- **Compose Email**: Create new emails with templates
- **Email Templates**: Pre-built templates for common scenarios
- **Attachment Management**: Attach documents from loan file

## 📧 Email Template System

### Template Categories
1. **Borrower Communications**
   - Initial required items request
   - Document follow-up
   - Status updates
   - Closing coordination

2. **Title Agent Communications**
   - Title commitment request
   - Title update requests
   - Closing coordination

3. **Insurance Communications**
   - Insurance requirements
   - Policy updates
   - Coverage verification

4. **Lender Communications**
   - Payoff requests
   - Status updates
   - Document submissions

### Template Features
- **Variable Substitution**: Automatic insertion of loan details
- **Customizable Content**: Edit templates for specific situations
- **Save as Draft**: Store emails for later sending
- **CC/BCC Support**: Include multiple recipients
- **Attachment Integration**: Attach relevant documents

## 🔧 Advanced Features

### Smart Document Upload
- **AI-Powered Categorization**: Automatic document type detection
- **Duplicate Detection**: Prevent duplicate document uploads
- **Version Control**: Track document versions and updates
- **Batch Processing**: Handle multiple document uploads efficiently

### Workflow Automation
- **Status Progression**: Automatic loan status updates
- **Task Generation**: AI-suggested next steps
- **Deadline Tracking**: Monitor important dates
- **Notification System**: Alerts for overdue items

### Integration Capabilities
- **Google Drive**: Document storage and synchronization
- **Gmail**: Email management and templates
- **OpenAI**: AI-powered assistance and analysis
- **Multi-Lender Support**: Adapt to different lender requirements

## 🚀 Getting Started

### Creating a New Loan
1. Click "New Loan" button
2. Fill in basic loan information
3. Select lender and loan type
4. Add property details
5. Connect Google Drive folder (optional)
6. Begin document collection process

### Setting Up Contacts
1. Navigate to loan file
2. Click "Add Contact" in Contact List
3. Fill in contact information
4. Assign appropriate role
5. Save contact for future communications

### Document Management Workflow
1. Upload documents via Document Manager
2. Review AI-generated document analysis
3. Check off completed requirements
4. Follow up on missing documents
5. Coordinate with contacts as needed

## 📱 User Interface Highlights

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Intuitive Navigation**: Clear visual hierarchy and organization
- **Real-time Updates**: Live synchronization across all components
- **Progress Tracking**: Visual indicators for completion status
- **Smart Notifications**: Contextual alerts and reminders

## 🔒 Security Features

- **OAuth Authentication**: Secure Google account integration
- **Session Management**: Automatic logout and session protection
- **Data Encryption**: Secure handling of sensitive loan information
- **Access Control**: User-specific data isolation

## 🔍 Detailed Button & Action Reference

### Document Manager Specific Actions

#### Document List Tab Actions
- **Search Input Field**: Real-time filtering of documents by name
- **Clear Search (X) Button**: Reset search filter to show all documents
- **Document Card Actions**:
  - **View Button**: Opens document in new browser tab
  - **Download Button**: Downloads document to local device
  - **Delete Button**: Removes document from loan file (with confirmation)
  - **Category Badge**: Shows document classification (Borrower, Property, etc.)

#### Requirements Tab Actions
- **Category Expansion**: Click category headers to expand/collapse sections
- **Requirement Checkboxes**: Mark individual requirements as satisfied
- **Upload Button (per requirement)**: Direct file upload for specific requirement
- **Add Custom Document Button**: Create additional requirements not in standard checklist
- **Bulk Actions**:
  - **Select All Checkbox**: Select all requirements in a category
  - **Mark Selected Complete**: Batch completion of multiple requirements

#### Upload Tab Actions
- **File Input Button**: Opens file browser for document selection
- **Drag & Drop Zone**: Visual area for dragging files directly
- **Document Title Field**: Custom naming for uploaded documents
- **Category Dropdown**: Assign document to specific category
- **Document Type Dropdown**: Specify exact document type (Bank Statement, Tax Return, etc.)
- **Notes Field**: Add additional context or comments
- **Upload Button**: Process and save selected documents

### Contact Management Detailed Actions

#### Contact List Actions
- **Add Contact Button**: Opens contact creation dialog
- **Contact Card Actions**:
  - **Edit Button (Pencil Icon)**: Modify existing contact information
  - **Delete Button (Trash Icon)**: Remove contact with confirmation dialog
  - **Copy Name Button**: Copy contact name to clipboard
  - **Copy Email Button**: Copy email address to clipboard
  - **Copy Phone Button**: Copy phone number to clipboard
  - **Email Button**: Open email composition with contact pre-filled

#### Contact Form Fields
- **Name Field**: Required field for contact identification
- **Email Field**: Validated email address input
- **Phone Field**: Optional phone number with formatting
- **Company Field**: Organization or business name
- **Role Dropdown**: Predefined roles (Borrower, Title Agent, Insurance Agent, etc.)
- **Save Button**: Create or update contact information
- **Cancel Button**: Discard changes and close dialog

### AI Assistant Interaction Details

#### Chat Interface Actions
- **Message Input Field**: Type questions or requests
- **Send Button**: Submit message to AI assistant
- **Message History**: Scrollable conversation log
- **Copy Response Button**: Copy AI suggestions to clipboard
- **Clear Chat Button**: Reset conversation history

#### AI Response Types
- **Document Analysis**: Detailed breakdown of uploaded documents
- **Missing Items List**: Specific requirements still needed
- **Email Templates**: Generated email drafts for various scenarios
- **Next Steps**: Prioritized action items for loan progression
- **Lender Guidance**: Specific requirements for selected lender

### Task Management Detailed Actions

#### Task List Actions
- **Add Task Button**: Create new task with priority and description
- **Task Checkboxes**: Toggle completion status
- **Priority Badges**: Visual indicators (High/Medium/Low priority)
- **Task Description**: Editable task details
- **Due Date Picker**: Set task deadlines
- **Delete Task Button**: Remove tasks from list

#### Task Creation Dialog
- **Description Field**: Required task details
- **Priority Dropdown**: Set task importance level
- **Due Date Field**: Optional deadline setting
- **Assign To Dropdown**: Assign task to team member
- **Create Button**: Save new task
- **Cancel Button**: Discard task creation

### Google Drive Integration Actions

#### Drive Connection
- **Connect Drive Button**: Initiate OAuth flow for Google Drive
- **Authorization Popup**: Google account selection and permission granting
- **Folder Selection**: Choose specific Drive folder for loan documents
- **Sync Status Indicator**: Shows connection and sync status

#### Drive Operations
- **Scan Folder Button**: Analyze Drive folder for existing documents
- **Send to Drive Button**: Upload local documents to connected folder
- **Refresh Button**: Update document list from Drive
- **Disconnect Button**: Remove Drive integration

### Email System Detailed Actions

#### Gmail Integration
- **Connect Gmail Button**: Link Gmail account via OAuth
- **Inbox Refresh Button**: Update email list
- **Compose Email Button**: Create new email
- **Reply Button**: Respond to existing email
- **Forward Button**: Forward email to other contacts

#### Email Composition
- **To Field**: Primary recipient selection
- **CC Field**: Carbon copy recipients
- **BCC Field**: Blind carbon copy recipients
- **Subject Field**: Email subject line
- **Template Dropdown**: Select pre-built email template
- **Body Editor**: Rich text email content editing
- **Attach Documents**: Select documents from loan file
- **Send Button**: Deliver email
- **Save Draft Button**: Store email for later sending

### Loan Setup Wizard Actions

#### Step Navigation
- **Next Step Button**: Progress to next setup phase
- **Previous Step Button**: Return to previous setup phase
- **Skip Step Button**: Bypass optional setup steps
- **Complete Setup Button**: Finish loan creation process

#### Step-Specific Actions
- **Step 1 - Loan Details**: "Go to Loan Details" button
- **Step 2 - Drive Connection**: "Connect Google Drive" button
- **Step 3 - Contact Setup**: "Add Contacts" button
- **Step 4 - Email Setup**: "Send Emails" button
- **Step 5 - Task Creation**: "Create Tasks" button

---

## 🧪 Feature Testing Guide

### Testing Document Upload
1. Navigate to Document Manager → Upload tab
2. Select multiple files of different types (PDF, JPG, DOC)
3. Verify automatic categorization suggestions
4. Test drag-and-drop functionality
5. Confirm documents appear in Document List tab

### Testing AI Assistant
1. Ask about missing documents: "What documents are still needed?"
2. Request email template: "Generate email for title agent"
3. Query lender requirements: "What does Kiavi require for DSCR loans?"
4. Test document analysis: Upload documents and ask for analysis

### Testing Contact Management
1. Add contacts for each role type
2. Test email composition with contact auto-fill
3. Verify contact information copying functionality
4. Test contact editing and deletion

### Testing Google Drive Integration
1. Connect Google Drive account
2. Create or select loan folder
3. Upload documents and verify sync
4. Test automatic document detection

### Testing Email Templates
1. Navigate to Templates section
2. Select different template categories
3. Customize template variables
4. Test email sending functionality

---

*This comprehensive README documents every interactive element in LoanPilot. Use this reference to systematically test each feature and evaluate the application's functionality.*
