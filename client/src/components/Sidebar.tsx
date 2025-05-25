import { useLocation } from "wouter";

interface SidebarProps {
  user: any;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const [location] = useLocation();
  
  return (
    <aside className="bg-primary-800 text-white w-64 flex-shrink-0 hidden md:flex md:flex-col shadow-lg">
      <div className="p-5 border-b border-primary-700">
        <h1 className="text-xl font-heading font-bold">Loan Co-Pilot</h1>
        <p className="text-xs text-primary-200 mt-1">Adler Capital</p>
      </div>
      
      <nav className="mt-6 px-3 flex-1">
        <div className="space-y-1">
          <a href="/dashboard" className={`sidebar-link ${location === "/dashboard" || location === "/" ? "active" : ""}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            Dashboard
          </a>
          <a href="#" className="sidebar-link">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Loan Files
          </a>
          <a href="#" className="sidebar-link">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Contacts
          </a>
          <a href="#" className="sidebar-link">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            Email Templates
          </a>
          <a href="#" className="sidebar-link">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </a>
        </div>
        
        <div className="pt-6 mt-6 border-t border-primary-700">
          <h3 className="px-3 text-xs font-semibold text-primary-200 uppercase tracking-wider">
            Recent Loan Files
          </h3>
          <div className="mt-3 space-y-1">
            <a href="#" className="flex items-center px-3 py-2 text-sm text-primary-100 hover:bg-primary-700 rounded-md">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
              Smith - 123 Main St
            </a>
            <a href="#" className="flex items-center px-3 py-2 text-sm text-primary-100 hover:bg-primary-700 rounded-md">
              <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
              Johnson - 456 Oak Ave
            </a>
            <a href="#" className="flex items-center px-3 py-2 text-sm text-primary-100 hover:bg-primary-700 rounded-md">
              <span className="w-2 h-2 bg-red-400 rounded-full mr-2"></span>
              Martinez - 789 Pine Ln
            </a>
          </div>
        </div>
      </nav>
      
      <div className="p-4 border-t border-primary-700">
        <div className="flex items-center">
          <img src={user?.avatarUrl || "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100"} 
               alt="User avatar" 
               className="h-8 w-8 rounded-full object-cover" />
          <div className="ml-3">
            <p className="text-sm font-medium">{user?.name || "Demo User"}</p>
            <p className="text-xs text-primary-300">{user?.role || "VA Processor"}</p>
          </div>
          <button 
            onClick={onLogout}
            className="ml-auto text-primary-300 hover:text-white"
            aria-label="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
