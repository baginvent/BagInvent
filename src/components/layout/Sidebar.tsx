import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Brain,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";
 
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

  const companyName = profile?.company_name || "Your Company";
  const nameParts = companyName.split(" ");
  const lines =
    nameParts.length <= 2
      ? [companyName]
      : [
          nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(" "),
          nameParts.slice(Math.ceil(nameParts.length / 2)).join(" "),
        ];

  return (
    <aside className="flex min-h-screen flex-col bg-[#231f20] text-white">
      <div className="px-4 pb-6 pt-4">
        <div className="flex items-center gap-3">
          <BrandMark className="h-14 w-14" tone="light" />
          <div className="min-w-0 space-y-1">
            {lines.map((line) => (
              <p
                key={line}
                className="text-sm font-semibold uppercase leading-tight tracking-[0.14em] text-[#f6f3ee]"
              >
                {line}
              </p>
            ))}
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#ce5a5a]">
              Inventory System
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 pb-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-5 py-3 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-[#ce5a5a] text-white"
                  : "text-[#f2ece4] hover:bg-white/5",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-[11px] font-medium text-[#f2ece4] transition-colors hover:bg-white/5"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
