# Loan Processing Co-Pilot

## Overview

This is a DSCR (Debt Service Coverage Ratio) loan processing application that helps loan processors manage real estate investment loans. The system integrates with Google Drive for document management, Gmail for email communications, and OpenAI for intelligent assistance in processing loan files. The application streamlines the workflow for submitting loans to various lenders (Kiavi, Roc Capital, AHL, etc.) by tracking documents, managing contacts, and providing AI-powered guidance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React with TypeScript, using Vite as the build tool and development server.

**UI Framework**: Shadcn UI component library built on Radix UI primitives, styled with Tailwind CSS using the "new-york" style preset. The design system uses CSS variables for theming with a neutral color palette.

**State Management**: TanStack Query (React Query) for server state management, with React Context API for specific features like Google Drive integration (`GoogleDriveProvider`).

**Routing**: Wouter for lightweight client-side routing, handling pages for Dashboard, Loans, Contacts, Templates, and Settings.

**Form Handling**: React Hook Form with Zod schema validation for type-safe form inputs and validation.

**Key Design Decisions**:
- Component-based architecture with reusable UI components in `@/components/ui`
- Path aliases configured for clean imports (`@/`, `@shared/`, `@assets/`)
- Separation of concerns with dedicated components for features (AIAssistant, ContactList, ChecklistGenerator)
- Custom fonts (Inter for body, Poppins for headings) for improved typography

### Backend Architecture

**Technology Stack**: Node.js with Express.js server, written in TypeScript using ES modules.

**Database**: PostgreSQL via Neon serverless with Drizzle ORM for type-safe database operations. WebSocket support added for serverless environment compatibility.

**Session Management**: Express-session with in-memory store (MemoryStore) for development, Passport.js with LocalStrategy for authentication.

**File Upload**: Multer configured with disk storage, supporting up to 50MB files with validation for common document types (PDF, DOC, images, spreadsheets).

**Architecture Pattern**: Layered architecture with clear separation:
- **Routes Layer** (`routes.ts`): API endpoint definitions and request handling
- **Storage Layer** (`storage.ts`, `db-storage.ts`): Abstract storage interface with database implementation
- **Service Layer** (`lib/` directory): Business logic for document analysis, OCR, Gmail integration, Google Drive operations

**Key Design Decisions**:
- Storage abstraction allows for potential migration to different databases
- Service-oriented architecture for external integrations (OpenAI, Google services)
- Centralized error handling middleware
- Development-only Vite integration for hot module replacement

### Database Schema

**Core Entities**:
- **Users**: Processor accounts with roles and authentication
- **Loans**: Central entity tracking loan applications with status, amounts, and relationships
- **Properties**: Real estate property information linked to loans
- **Contacts**: Borrowers, title agents, insurance agents, analysts per loan
- **Documents**: File tracking with categories, upload sources, and Google Drive sync status
- **Tasks**: Action items with priorities and completion tracking
- **Messages**: AI assistant conversation history per loan
- **Lenders**: Lender information with JSON-stored requirements
- **UserTokens**: Google OAuth token storage for API access

**Relationships**:
- Loans have one-to-many relationships with documents, contacts, tasks, and messages
- Loans reference properties, lenders, and loan types via foreign keys
- Support for soft deletes on documents (deletedAt timestamp)

### External Dependencies

**OpenAI Integration**:
- GPT-4o model for intelligent document analysis and loan processing assistance
- Vision capabilities for OCR (text extraction from scanned documents)
- Structured JSON output for extracting loan data from documents
- Rate limit handling with exponential backoff for reliability
- Fallback AI system for offline/limited connectivity scenarios

**Google Services**:
- **Drive API**: Document storage, folder scanning, file downloads via both Service Account and OAuth
- **Gmail API**: Email reading, sending, and inbox management with OAuth2
- OAuth2 flow with offline access for persistent token storage
- Service account credentials for server-to-server authentication
- Scopes: drive, gmail.readonly, gmail.send, userinfo.email

**SendGrid**: Email delivery service for transactional emails (template-based email generation for loan communications)

**Neon Database**: Serverless PostgreSQL with WebSocket support for scalable data persistence

**Authentication & Security**:
- Passport.js for local authentication strategy
- Session-based authentication with secure cookie handling
- Google OAuth2 for third-party service access
- Environment variable management for sensitive credentials

**Development Tools**:
- Replit-specific plugins for runtime error overlay and cartographer (development environment integration)
- ESBuild for production bundling
- Drizzle Kit for database migrations and schema management