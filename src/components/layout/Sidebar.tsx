import { Link, useLocation } from "react-router-dom";
 import {
   LayoutDashboard,
   Package,
   Receipt,
   BarChart3,
   Brain,
  Store,
  LogOut,
 } from "lucide-react";
 import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/AuthContext";
 
 const navItems = [
   { name: "Dashboard", path: "/", icon: LayoutDashboard },
   { name: "Inventory", path: "/inventory", icon: Package },
   { name: "Transactions", path: "/transactions", icon: Receipt },
   { name: "Reports", path: "/reports", icon: BarChart3 },
   { name: "Forecast", path: "/forecast", icon: Brain },
 ];
 
 export function Sidebar() {
   const location = useLocation();
  const { profile, signOut } = useAuthContext();

  // Parse company name for display
  const companyName = profile?.company_name || "Your Company";
  const nameParts = companyName.split(" ");
  const line1 = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(" ");
  const line2 = nameParts.slice(Math.ceil(nameParts.length / 2)).join(" ");
 
   return (
     <aside
      className="fixed left-0 top-0 h-screen w-56 bg-[#1a1a1a] flex flex-col z-50"
     >
       {/* Logo */}
      <div className="p-4">
        <div className="bg-[#2a2a2a] rounded-lg p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/90 flex items-center justify-center flex-shrink-0">
            <Store className="w-6 h-6 text-primary-foreground" />
           </div>
          <div>
            <h1 className="text-foreground font-semibold text-sm leading-tight">{line1}</h1>
            {line2 && <h2 className="text-foreground font-semibold text-sm leading-tight">{line2}</h2>}
          </div>
         </div>
       </div>
 
      {/* Divider */}
      <div className="mx-4 h-px bg-[#333]" />

       {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
         {navItems.map((item) => {
           const isActive = location.pathname === item.path;
           const Icon = item.icon;
           
           return (
             <Link
               key={item.path}
               to={item.path}
               className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-[#888] hover:text-foreground hover:bg-[#2a2a2a]"
               )}
             >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.name}</span>
             </Link>
           );
         })}
       </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[#333]">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium text-[#888] hover:text-foreground hover:bg-[#2a2a2a] w-full transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          <span>Log out</span>
        </button>
      </div>
     </aside>
   );
 }