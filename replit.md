# Overview

The Loan Processing Co-Pilot is an AI-powered web application designed to streamline the processing of DSCR (Debt Service Coverage Ratio) real estate loans. The application serves as an intelligent assistant for junior processors and overseas virtual assistants, providing expert-level guidance, document management, and automated communication capabilities. It integrates with multiple lenders (Kiavi, Roc Capital, AHL, etc.), automatically analyzes loan documents, tracks completion status, and generates professional email templates for borrowers, title companies, insurance agents, and lenders.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The application uses React with TypeScript as the frontend framework, built with Vite for fast development and optimized production builds. The UI is constructed using shadcn/ui components with Tailwind CSS for styling, providing a modern and responsive interface. The frontend implements a single-page application (SPA) architecture using Wouter for client-side routing, with React Query (TanStack Query) for efficient data fetching and caching.

## Backend Architecture
The backend is built on Node.js with Express.js, following RESTful API principles. The server uses TypeScript throughout for type safety and better development experience. The application implements session-based authentication with secure cookie handling. The backend serves both API endpoints and static files, with a catch-all route handler to support client-side routing in production.

## Database Architecture
The application uses Drizzle ORM with PostgreSQL for data persistence. The database schema includes tables for users, loans, properties, lenders, contacts, documents, and tasks. The system is configured to work with both local PostgreSQL instances and cloud providers like Neon. Database migrations are handled through Drizzle Kit, ensuring consistent schema evolution across environments.

## AI Integration
OpenAI's GPT API is integrated as the core intelligence layer, providing document analysis, task generation, and email template creation. The AI system understands DSCR loan requirements, can analyze document completeness against lender-specific checklists, and generates contextual recommendations for next steps in the loan processing workflow.

## Document Management
The system implements comprehensive document handling through Google Drive integration and local file upload capabilities. Documents are automatically categorized by type (borrower, property, title, insurance, etc.) and tracked against lender-specific requirements. The application supports both automated document ingestion from Google Drive folders and manual uploads with intelligent categorization.

# External Dependencies

## Google Services Integration
- **Google OAuth 2.0**: Handles user authentication and authorization for Google services access
- **Google Drive API**: Enables automated document retrieval and folder management for loan files
- **Gmail API**: Provides email integration for automated communication and message scanning

## AI and Communication Services
- **OpenAI API**: Powers the intelligent loan processing recommendations, document analysis, and email generation capabilities
- **SendGrid**: Handles transactional email delivery for automated notifications and communications

## Database and Infrastructure
- **PostgreSQL**: Primary database for storing loan data, user information, and application state
- **Neon Database**: Cloud PostgreSQL provider option for scalable database hosting
- **Docker**: Containerization platform for consistent deployment across environments

## Development and Build Tools
- **Vite**: Frontend build tool and development server for optimized React application bundling
- **TypeScript**: Type-safe development environment for both frontend and backend code
- **Drizzle ORM**: Type-safe database ORM for PostgreSQL with migration management
- **Tailwind CSS**: Utility-first CSS framework for responsive UI development