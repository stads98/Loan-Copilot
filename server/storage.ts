import { 
  users, type User, type InsertUser,
  lenders, type Lender, type InsertLender,
  loanTypes, type LoanType, type InsertLoanType,
  properties, type Property, type InsertProperty,
  contacts, type Contact, type InsertContact,
  loans, type Loan, type InsertLoan,
  documents, type Document, type InsertDocument,
  tasks, type Task, type InsertTask,
  messages, type Message, type InsertMessage,
  type LoanWithDetails
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Lenders
  getLender(id: number): Promise<Lender | undefined>;
  getLenders(): Promise<Lender[]>;
  createLender(lender: InsertLender): Promise<Lender>;

  // Loan Types
  getLoanType(id: number): Promise<LoanType | undefined>;
  getLoanTypes(): Promise<LoanType[]>;
  createLoanType(loanType: InsertLoanType): Promise<LoanType>;

  // Properties
  getProperty(id: number): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;

  // Contacts
  getContact(id: number): Promise<Contact | undefined>;
  getContactsByLoanId(loanId: number): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;

  // Loans
  getLoan(id: number): Promise<Loan | undefined>;
  getLoansByProcessorId(processorId: number): Promise<Loan[]>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoan(id: number, loan: Partial<InsertLoan>): Promise<Loan | undefined>;
  getLoanWithDetails(id: number): Promise<LoanWithDetails | undefined>;

  // Documents
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsByLoanId(loanId: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<boolean>;

  // Tasks
  getTask(id: number): Promise<Task | undefined>;
  getTasksByLoanId(loanId: number): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;

  // Messages
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByLoanId(loanId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private lenders: Map<number, Lender>;
  private loanTypes: Map<number, LoanType>;
  private properties: Map<number, Property>;
  private contacts: Map<number, Contact>;
  private loans: Map<number, Loan>;
  private documents: Map<number, Document>;
  private tasks: Map<number, Task>;
  private messages: Map<number, Message>;

  private currentUserId: number;
  private currentLenderId: number;
  private currentLoanTypeId: number;
  private currentPropertyId: number;
  private currentContactId: number;
  private currentLoanId: number;
  private currentDocumentId: number;
  private currentTaskId: number;
  private currentMessageId: number;

  constructor() {
    this.users = new Map();
    this.lenders = new Map();
    this.loanTypes = new Map();
    this.properties = new Map();
    this.contacts = new Map();
    this.loans = new Map();
    this.documents = new Map();
    this.tasks = new Map();
    this.messages = new Map();

    this.currentUserId = 1;
    this.currentLenderId = 1;
    this.currentLoanTypeId = 1;
    this.currentPropertyId = 1;
    this.currentContactId = 1;
    this.currentLoanId = 1;
    this.currentDocumentId = 1;
    this.currentTaskId = 1;
    this.currentMessageId = 1;

    // Seed some initial data
    this.seedData();
  }

  private seedData() {
    // Add default lenders
    this.createLender({ name: "Kiavi Funding", requirements: ["Driver's License", "Bank Statements", "Purchase Contract", "Insurance Binder", "Title Commitment", "DSCR Certification"] });
    this.createLender({ name: "Roc Capital 360", requirements: ["Driver's License", "Bank Statements", "Purchase Contract", "Insurance Binder", "Title Commitment"] });
    this.createLender({ name: "American Heritage Lending (AHL)", requirements: ["Driver's License", "Bank Statements", "Purchase Contract", "Insurance Binder", "Title Commitment", "Entity Documents"] });
    this.createLender({ name: "Visio Lending", requirements: ["Driver's License", "Bank Statements", "Purchase Contract", "Insurance Binder", "Title Commitment"] });

    // Add default loan types
    this.createLoanType({ name: "DSCR", description: "Debt Service Coverage Ratio" });
    this.createLoanType({ name: "Bridge", description: "Short-term financing" });
    this.createLoanType({ name: "Fix and Flip", description: "Rehabilitation loans" });

    // Add a default user
    this.createUser({
      username: "demo",
      password: "password", // In a real app, this would be hashed
      name: "Maria Santos",
      email: "maria@adlercapital.com",
      role: "processor",
      avatarUrl: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100"
    });
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  // Lenders
  async getLender(id: number): Promise<Lender | undefined> {
    return this.lenders.get(id);
  }

  async getLenders(): Promise<Lender[]> {
    return Array.from(this.lenders.values());
  }

  async createLender(insertLender: InsertLender): Promise<Lender> {
    const id = this.currentLenderId++;
    const lender: Lender = { ...insertLender, id };
    this.lenders.set(id, lender);
    return lender;
  }

  // Loan Types
  async getLoanType(id: number): Promise<LoanType | undefined> {
    return this.loanTypes.get(id);
  }

  async getLoanTypes(): Promise<LoanType[]> {
    return Array.from(this.loanTypes.values());
  }

  async createLoanType(insertLoanType: InsertLoanType): Promise<LoanType> {
    const id = this.currentLoanTypeId++;
    const loanType: LoanType = { ...insertLoanType, id };
    this.loanTypes.set(id, loanType);
    return loanType;
  }

  // Properties
  async getProperty(id: number): Promise<Property | undefined> {
    return this.properties.get(id);
  }

  async createProperty(insertProperty: InsertProperty): Promise<Property> {
    const id = this.currentPropertyId++;
    const property: Property = { ...insertProperty, id };
    this.properties.set(id, property);
    return property;
  }

  // Contacts
  async getContact(id: number): Promise<Contact | undefined> {
    return this.contacts.get(id);
  }

  async getContactsByLoanId(loanId: number): Promise<Contact[]> {
    return Array.from(this.contacts.values()).filter(
      (contact) => contact.loanId === loanId,
    );
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const id = this.currentContactId++;
    const contact: Contact = { ...insertContact, id };
    this.contacts.set(id, contact);
    return contact;
  }

  async updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const existingContact = this.contacts.get(id);
    if (!existingContact) return undefined;

    const updatedContact = { ...existingContact, ...contact };
    this.contacts.set(id, updatedContact);
    return updatedContact;
  }

  async deleteContact(id: number): Promise<boolean> {
    return this.contacts.delete(id);
  }

  // Loans
  async getLoan(id: number): Promise<Loan | undefined> {
    return this.loans.get(id);
  }

  async getLoansByProcessorId(processorId: number): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(
      (loan) => loan.processorId === processorId,
    );
  }

  async createLoan(insertLoan: InsertLoan): Promise<Loan> {
    const id = this.currentLoanId++;
    const loan: Loan = { 
      ...insertLoan, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.loans.set(id, loan);
    return loan;
  }

  async updateLoan(id: number, loan: Partial<InsertLoan>): Promise<Loan | undefined> {
    const existingLoan = this.loans.get(id);
    if (!existingLoan) return undefined;

    const updatedLoan = { 
      ...existingLoan, 
      ...loan, 
      updatedAt: new Date() 
    };
    this.loans.set(id, updatedLoan);
    return updatedLoan;
  }

  async getLoanWithDetails(id: number): Promise<LoanWithDetails | undefined> {
    const loan = await this.getLoan(id);
    if (!loan) return undefined;

    const property = await this.getProperty(loan.propertyId);
    if (!property) return undefined;

    const lender = await this.getLender(loan.lenderId);
    if (!lender) return undefined;

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
    return this.documents.get(id);
  }

  async getDocumentsByLoanId(loanId: number): Promise<Document[]> {
    return Array.from(this.documents.values()).filter(
      (document) => document.loanId === loanId,
    );
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = this.currentDocumentId++;
    const document: Document = { ...insertDocument, id, uploadedAt: new Date() };
    this.documents.set(id, document);
    return document;
  }

  async deleteDocument(id: number): Promise<boolean> {
    return this.documents.delete(id);
  }

  // Tasks
  async getTask(id: number): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async getTasksByLoanId(loanId: number): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      (task) => task.loanId === loanId,
    );
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const task: Task = { ...insertTask, id, createdAt: new Date() };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined> {
    const existingTask = this.tasks.get(id);
    if (!existingTask) return undefined;

    const updatedTask = { ...existingTask, ...task };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: number): Promise<boolean> {
    return this.tasks.delete(id);
  }

  // Messages
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByLoanId(loanId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.loanId === loanId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const message: Message = { ...insertMessage, id, createdAt: new Date() };
    this.messages.set(id, message);
    return message;
  }
}

// Import and use DatabaseStorage for real document persistence
import { DatabaseStorage } from "./db-storage";
export const storage = new DatabaseStorage();
