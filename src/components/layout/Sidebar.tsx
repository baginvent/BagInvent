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
import { useUserTheme } from "@/hooks/useUserTheme";
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
  const { themeId, themes, setUserTheme } = useUserTheme();

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
    <aside className="flex min-h-screen flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-4 pb-6 pt-4">
        <div className="flex items-center gap-3">
          <BrandMark className="h-14 w-14" tone="light" />
          <div className="min-w-0 space-y-1">
            {lines.map((line) => (
              <p
                key={line}
                className="text-sm font-semibold uppercase leading-tight tracking-[0.14em] text-sidebar-foreground"
              >
                {line}
              </p>
            ))}
            <p className="text-[10px] uppercase tracking-[0.28em] text-sidebar-accent">
              Inventory System
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto pb-20">
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
                  ? "text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-white/5",
              )}
              style={isActive ? { backgroundColor: "hsl(var(--sidebar-primary))" } : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="fixed bottom-0 left-0 md:w-[220px] border-t border-sidebar-border bg-sidebar p-3">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white">
            Theme
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setUserTheme(theme.id)}
                className={cn(
                  "inline-flex items-center justify-center rounded-full px-3 py-1 text-[10px] font-semibold transition-all",
                  themeId === theme.id
                    ? "ring-2 ring-white text-white"
                    : "opacity-80 hover:opacity-100",
                )}
                style={{
                  backgroundColor: `hsl(${theme.primary})`,
                  color: `hsl(${theme.primaryForeground})`,
                }}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-[11px] font-medium text-sidebar-foreground transition-colors hover:bg-white/5"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
