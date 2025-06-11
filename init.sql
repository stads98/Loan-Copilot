-- Database initialization script for Loan Processing Co-Pilot
-- This script will be executed when PostgreSQL container starts

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE loancopilot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'loancopilot');

-- Connect to the database
\c loancopilot;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create necessary extensions for full text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;