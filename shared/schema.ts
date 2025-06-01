import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  email: text("email"),
  role: text("role").default("processor"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lenders = pgTable("lenders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  requirements: json("requirements").$type<string[]>(),
});

export const loanTypes = pgTable("loan_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  propertyType: text("property_type"),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  role: text("role").notNull(), // borrower, title, insurance, analyst, etc.
  loanId: integer("loan_id").notNull(),
  isAnalyst: boolean("is_analyst").default(false), // Flag to identify analysts
});

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  borrowerName: text("borrower_name").notNull(),
  borrowerEntityName: text("borrower_entity_name"), // LLC or individual name
  propertyAddress: text("property_address").notNull(),
  propertyType: text("property_type").notNull(), // single_family, duplex, triplex, quadplex, condo, multi_family_5plus, commercial
  estimatedValue: integer("estimated_value"), // Property value in dollars
  loanAmount: text("loan_amount"),
  loanToValue: integer("loan_to_value"), // LTV as percentage
  loanType: text("loan_type").notNull(), // DSCR, etc.
  loanPurpose: text("loan_purpose").notNull(), // Purchase, Refinance, etc.
  funder: text("funder").notNull(), // kiavi, ahl, visio, roc_capital, velocity
  status: text("status").default("in_progress"),
  targetCloseDate: text("target_close_date"),
  driveFolder: text("drive_folder"),
  googleDriveFolderId: text("google_drive_folder_id"), // Optional - can be added later
  propertyId: integer("property_id").notNull(),
  lenderId: integer("lender_id").notNull(),
  processorId: integer("processor_id").notNull(),
  completionPercentage: integer("completion_percentage").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fileId: text("file_id").notNull(), // Google Drive file ID
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  category: text("category"), // borrower, property, title, insurance, etc.
  status: text("status").default("pending"), // pending, synced, processed, etc.
  loanId: integer("loan_id").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  dueDate: text("due_date"),
  priority: text("priority").default("medium"), // high, medium, low
  completed: boolean("completed").default(false),
  loanId: integer("loan_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  role: text("role").notNull(), // user or assistant
  loanId: integer("loan_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertLenderSchema = createInsertSchema(lenders).omit({ id: true });
export const insertLoanTypeSchema = createInsertSchema(loanTypes).omit({ id: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertLender = z.infer<typeof insertLenderSchema>;
export type InsertLoanType = z.infer<typeof insertLoanTypeSchema>;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type User = typeof users.$inferSelect;
export type Lender = typeof lenders.$inferSelect;
export type LoanType = typeof loanTypes.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Message = typeof messages.$inferSelect;

// Extended schema types
export const loanWithDetailsSchema = z.object({
  loan: z.object(createInsertSchema(loans).shape),
  property: z.object(createInsertSchema(properties).shape),
  lender: z.object(createInsertSchema(lenders).shape),
  contacts: z.array(z.object(createInsertSchema(contacts).shape)),
  documents: z.array(z.object(createInsertSchema(documents).shape)),
  tasks: z.array(z.object(createInsertSchema(tasks).shape)),
});

export type LoanWithDetails = z.infer<typeof loanWithDetailsSchema>;
