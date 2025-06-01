import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface SidebarProps {
  user: any;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const [location] = useLocation();
  
  // Fetch loans for Recent Loan Files section
  const { data: loans = [] } = useQuery({
    queryKey: ['/api/loans'],
  });
  
  return (
    <aside className="bg-gradient-to-b from-blue-800 to-blue-900 text-white w-64 flex-shrink-0 hidden md:flex md:flex-col shadow-lg">
      <div className="p-5 border-b border-blue-700 bg-blue-800">
        <div className="text-xl font-heading font-bold flex items-center cursor-pointer" onClick={() => window.location.href = "/dashboard"}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Loan Co-Pilot
        </div>
        <p className="text-xs text-blue-200 mt-1 ml-8">DSCR Loan Processor</p>
      </div>
      
      <nav className="mt-6 px-3 flex-1">
        <div className="space-y-1">
          <div 
            onClick={() => window.location.href = "/dashboard"}
            className={`group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
              location === "/dashboard" || location === "/" 
                ? "bg-blue-700 text-white shadow-md" 
                : "text-blue-100 hover:bg-blue-700/50 hover:text-white"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-blue-300 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            Dashboard
          </div>
          
          <div 
            onClick={() => window.location.href = "/loans"}
            className={`group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
              location.startsWith("/loans") && location !== "/loans/1" && location !== "/loans/2" && location !== "/loans/3"
                ? "bg-blue-700 text-white shadow-md" 
                : "text-blue-100 hover:bg-blue-700/50 hover:text-white"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-blue-300 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Loan Files
            <span className="ml-auto bg-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full">3</span>
          </div>
          
          <div 
            onClick={() => window.location.href = "/contacts"}
            className={`group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
              location === "/contacts" 
                ? "bg-blue-700 text-white shadow-md" 
                : "text-blue-100 hover:bg-blue-700/50 hover:text-white"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-blue-300 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Contacts
          </div>
          
          <div 
            onClick={() => window.location.href = "/templates"}
            className={`group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
              location === "/templates" 
                ? "bg-blue-700 text-white shadow-md" 
                : "text-blue-100 hover:bg-blue-700/50 hover:text-white"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-blue-300 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            Email Templates
          </div>
          
          <div 
            onClick={() => window.location.href = "/settings"}
            className={`group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
              location === "/settings" 
                ? "bg-blue-700 text-white shadow-md" 
                : "text-blue-100 hover:bg-blue-700/50 hover:text-white"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-blue-300 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </div>
        </div>
        
        <div className="pt-6 mt-6 border-t border-blue-700">
          <h3 className="px-3 text-xs font-semibold text-blue-300 uppercase tracking-wider mb-3">
            Recent Loan Files
          </h3>
          <div className="space-y-1">
            {loans && loans.length > 0 ? (
              loans.map((loan: any) => {
                const initials = loan.borrowerName
                  .split(' ')
                  .map((name: string) => name.charAt(0).toUpperCase())
                  .join('')
                  .slice(0, 2);
                
                const statusColor = loan.status === 'completed' ? 'bg-green-600' :
                                  loan.status === 'on_hold' ? 'bg-yellow-600' : 'bg-blue-600';
                const dotColor = loan.status === 'completed' ? 'bg-green-400' :
                               loan.status === 'on_hold' ? 'bg-yellow-400' : 'bg-blue-400';
                
                return (
                  <div 
                    key={loan.id}
                    onClick={() => window.location.href = `/loans/${loan.id}`}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 cursor-pointer ${
                      location === `/loans/${loan.id}` 
                        ? "bg-blue-700 text-white" 
                        : "text-blue-100 hover:bg-blue-700/50 hover:text-white"
                    }`}>
                    <div className={`flex-shrink-0 h-8 w-8 ${statusColor} text-white rounded-md flex items-center justify-center mr-3`}>
                      <span className="text-xs font-bold">{initials}</span>
                    </div>
                    <div className="flex-1 truncate">
                      <div className="font-medium truncate">{loan.borrowerName}</div>
                      <div className="text-xs text-blue-300 truncate">{loan.propertyAddress}</div>
                    </div>
                    <span className={`ml-2 w-2 h-2 ${dotColor} rounded-full flex-shrink-0`}></span>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center">
                <div className="text-xs text-blue-300 mb-2">No loan files yet</div>
                <div className="text-xs text-blue-400">Create your first loan to see it here</div>
              </div>
            )}
          </div>
        </div>
      </nav>
      
      <div className="p-4 border-t border-blue-700 bg-blue-800/60">
        <div className="flex items-center">
          <img src={user?.avatarUrl || "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100"} 
               alt="User avatar" 
               className="h-9 w-9 rounded-full object-cover border-2 border-blue-400" />
          <div className="ml-3">
            <p className="text-sm font-medium text-white">{user?.name || "Demo User"}</p>
            <p className="text-xs text-blue-300">{user?.role || "VA Processor"}</p>
          </div>
          <button 
            onClick={onLogout}
            className="ml-auto bg-blue-700 hover:bg-blue-600 p-1.5 rounded-md text-blue-100 hover:text-white transition-colors duration-200"
            aria-label="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
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
