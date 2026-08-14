import { useMemo, useState } from "react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { BarChart3, Bell, ChevronRight, Package, ReceiptText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { isMissingTransactionsTableError } from "@/lib/demoData";
import { buildMockTransactions } from "@/lib/forecastInsights";
import { getInventoryThresholds, getStockLevel } from "@/lib/inventoryInsights";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;

type NotificationItem = {
  description: string;
  id: string;
  source: "Inventory" | "Transactions" | "Reports";
  title: string;
  path: string;
};

type NotificationSource = NotificationItem["source"];

const formatNotificationTime = (value: string) => {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? "Recently" : `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
};

export function NotificationMenu() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [activeSource, setActiveSource] = useState<NotificationSource>("Inventory");
  const thresholds = getInventoryThresholds(user?.id);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: transactionResult } = useQuery<{ items: Transaction[] }>({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        if (isMissingTransactionsTableError(error)) return { items: buildMockTransactions(user!.id) };
        throw error;
      }

      return { items: data };
    },
  });

  const notifications = useMemo(() => {
    const inventory: NotificationItem[] = products
      .filter((product) => getStockLevel(product.quantity, thresholds) !== "normal")
      .slice(0, 4)
      .map((product) => {
        const level = getStockLevel(product.quantity, thresholds);
        const description =
          level === "out"
            ? "Out of stock — replenish immediately"
            : `${product.quantity} units left — ${level} stock level`;
        return { id: `inventory-${product.id}`, source: "Inventory", title: product.name, description, path: "/inventory" };
      });

    const transactions: NotificationItem[] = (transactionResult?.items ?? []).slice(0, 3).map((transaction) => ({
      id: `transaction-${transaction.id}`,
      source: "Transactions",
      title: transaction.type === "sale" ? "Sale recorded" : "Stock received",
      description: `${transaction.quantity} unit${transaction.quantity === 1 ? "" : "s"} · ${transaction.product_name} · ${formatNotificationTime(transaction.created_at)}`,
      path: "/transactions",
    }));

    const reports: NotificationItem[] = products.length || transactionResult?.items.length
      ? [{
          id: "report-overview",
          source: "Reports",
          title: "Your latest business insights are ready",
          description: "Review sales, stock movement, and inventory trends.",
          path: "/reports",
        }]
      : [];

    return [...inventory, ...transactions, ...reports];
  }, [products, thresholds, transactionResult?.items]);

  const groups = [
    { name: "Inventory", icon: Package },
    { name: "Transactions", icon: ReceiptText },
    { name: "Reports", icon: BarChart3 },
  ] as const;
  const visibleNotifications = notifications.filter((notification) => notification.source === activeSource);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-rose-50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <Bell className="h-5 w-5" />
          {notifications.length > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white" /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-[360px] rounded-xl border-slate-200 bg-white p-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-500">Updates across your workspace</p>
          </div>
          {notifications.length > 0 ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{notifications.length} new</span> : null}
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-3 py-3">
          {groups.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveSource(name)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeSource === name
                  ? "bg-blue-50 text-blue-600"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {name}
            </button>
          ))}
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {visibleNotifications.length === 0 ? <p className="px-3 py-8 text-center text-sm text-slate-500">No {activeSource.toLowerCase()} notifications.</p> : visibleNotifications.map((notification) => (
            <button key={notification.id} type="button" onClick={() => navigate(notification.path)} className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800">{notification.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{notification.description}</span>
              </span>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
