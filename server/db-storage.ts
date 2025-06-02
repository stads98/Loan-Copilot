import { db } from "./db";
import { 
  users, lenders, loanTypes, properties, contacts,
  loans, documents, tasks, messages,
  type User, type Lender, type LoanType, type Property, 
  type Contact, type Loan, type Document, type Task, type Message,
  type InsertUser, type InsertLender, type InsertLoanType, type InsertProperty,
  type InsertContact, type InsertLoan, type InsertDocument, type InsertTask, type InsertMessage
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Lenders
  async getLender(id: number): Promise<Lender | undefined> {
    const [lender] = await db.select().from(lenders).where(eq(lenders.id, id));
    return lender || undefined;
  }

  async getLenders(): Promise<Lender[]> {
    return db.select().from(lenders);
  }

  async createLender(insertLender: InsertLender): Promise<Lender> {
    const [lender] = await db
      .insert(lenders)
      .values(insertLender)
      .returning();
    return lender;
  }

  // Loan Types
  async getLoanType(id: number): Promise<LoanType | undefined> {
    const [loanType] = await db.select().from(loanTypes).where(eq(loanTypes.id, id));
    return loanType || undefined;
  }

  async getLoanTypes(): Promise<LoanType[]> {
    return db.select().from(loanTypes);
  }

  async createLoanType(insertLoanType: InsertLoanType): Promise<LoanType> {
    const [loanType] = await db
      .insert(loanTypes)
      .values(insertLoanType)
      .returning();
    return loanType;
  }

  // Properties
  async getProperty(id: number): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property || undefined;
  }

  async createProperty(insertProperty: InsertProperty): Promise<Property> {
    const [property] = await db
      .insert(properties)
      .values(insertProperty)
      .returning();
    return property;
  }

  // Contacts
  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async getContactsByLoanId(loanId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.loanId, loanId));
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const [contact] = await db
      .insert(contacts)
      .values(insertContact)
      .returning();
    return contact;
  }

  async updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updatedContact] = await db
      .update(contacts)
      .set(contact)
      .where(eq(contacts.id, id))
      .returning();
    return updatedContact;
  }

  async deleteContact(id: number): Promise<boolean> {
    const [deletedContact] = await db
      .delete(contacts)
      .where(eq(contacts.id, id))
      .returning();
    return !!deletedContact;
  }

  // Loans
  async getLoan(id: number): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(eq(loans.id, id));
    return loan || undefined;
  }

  async getLoansByProcessorId(processorId: number): Promise<Loan[]> {
    return db.select().from(loans).where(eq(loans.processorId, processorId));
  }

  async createLoan(insertLoan: InsertLoan): Promise<Loan> {
    const now = new Date();
    const [loan] = await db
      .insert(loans)
      .values({
        ...insertLoan,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return loan;
  }

  async updateLoan(id: number, loan: Partial<InsertLoan>): Promise<Loan | undefined> {
    const [updatedLoan] = await db
      .update(loans)
      .set({
        ...loan,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, id))
      .returning();
    return updatedLoan;
  }

  async deleteLoan(id: number): Promise<boolean> {
    const [deletedLoan] = await db
      .delete(loans)
      .where(eq(loans.id, id))
      .returning();
    return !!deletedLoan;
  }

  async getLoanWithDetails(id: number): Promise<any | undefined> {
    const loan = await this.getLoan(id);
    if (!loan) return undefined;

    const property = await this.getProperty(loan.propertyId);
    const lender = await this.getLender(loan.lenderId);
    const contacts = await this.getContactsByLoanId(id);
    const documents = await this.getDocumentsByLoanId(id);
    const tasks = await this.getTasksByLoanId(id);

    return {
      loan,
      property,
      lender,
      contacts,
      documents,
      tasks
    };
  }

  // Documents
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getDocumentsByLoanId(loanId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.loanId, loanId));
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values({
        ...insertDocument,
        uploadedAt: new Date(),
      })
      .returning();
    return document;
  }

  async updateDocument(id: number, document: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updatedDocument] = await db
      .update(documents)
      .set(document)
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteDocument(id: number): Promise<boolean> {
    const [deletedDocument] = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();
    return !!deletedDocument;
  }

  // Tasks
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTasksByLoanId(loanId: number): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.loanId, loanId));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values({
        ...insertTask,
        createdAt: new Date(),
      })
      .returning();
    return task;
  }

  async updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined> {
    const [updatedTask] = await db
      .update(tasks)
      .set(task)
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async deleteTask(id: number): Promise<boolean> {
    const [deletedTask] = await db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning();
    return !!deletedTask;
  }

  // Messages
  async getMessage(id: number): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async getMessagesByLoanId(loanId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.loanId, loanId));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values({
        ...insertMessage,
        createdAt: new Date(),
      })
      .returning();
    return message;
  }
}