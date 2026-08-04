import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BellRing, Clock, DollarSign, Loader2, Package, PackageX } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { TopSellingChart } from "@/components/dashboard/TopSellingChart";
import { AIForecastCard } from "@/components/dashboard/AIForecastCard";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  ensureDemoInventoryAndTransactions,
  isMissingTransactionsTableError,
} from "@/lib/demoData";
import { buildMockTransactions, formatCurrency } from "@/lib/forecastInsights";
import { getDaysUntilExpiry, getInventoryThresholds, getStockLevel, type InventoryThresholds } from "@/lib/inventoryInsights";
import { toast } from "sonner";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;
const EMPTY_TRANSACTIONS: Transaction[] = [];

const getTodayDateKey = () =>
  new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const [isSeeding, setIsSeeding] = useState(false);
  const [thresholds, setThresholds] = useState<InventoryThresholds>(() => getInventoryThresholds(user?.id));
  const todayDateKey = getTodayDateKey();

  useEffect(() => {
    const syncThresholds = () => setThresholds(getInventoryThresholds(user?.id));
    syncThresholds();
    window.addEventListener("baginvent:inventory-thresholds", syncThresholds);
    return () => window.removeEventListener("baginvent:inventory-thresholds", syncThresholds);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    const seedDemoData = async () => {
      setIsSeeding(true);

      try {
        const result = await ensureDemoInventoryAndTransactions(user.id);

        if (!active) {
          return;
        }

        if (result.seededProducts || result.seededTransactions) {
          queryClient.invalidateQueries({ queryKey: ["products", user.id] });
          queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
        }
      } catch (error) {
        if (!active) {
          return;
        }

        toast.error(error instanceof Error ? error.message : "Failed to load dashboard");
      } finally {
        if (active) {
          setIsSeeding(false);
        }
      }
    };

    seedDemoData();

    return () => {
      active = false;
    };
  }, [queryClient, user]);

  const { data: products = [], isLoading: isProductsLoading } = useQuery<Product[]>({
    queryKey: ["products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data;
    },
  });

  const { data: transactionResult, isLoading: isTransactionsLoading } = useQuery<{
    items: Transaction[];
    source: "db" | "mock";
  }>({
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
        if (isMissingTransactionsTableError(error)) {
          return { items: buildMockTransactions(user!.id), source: "mock" as const };
        }

        throw error;
      }

      return { items: data, source: "db" as const };
    },
  });

  const transactions = transactionResult?.items ?? EMPTY_TRANSACTIONS;
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;

  const stats = useMemo(() => {
    const totalUnits = products.reduce((sum, product) => sum + product.quantity, 0);
    const lowStockItems = products.filter((product) => getStockLevel(product.quantity, thresholds) === "low").length;
    const criticalStockItems = products.filter((product) => getStockLevel(product.quantity, thresholds) === "critical").length;
    const outOfStockItems = products.filter((product) => getStockLevel(product.quantity, thresholds) === "out").length;
    const expiringSoon = products.filter((product) => {
      const daysUntilExpiry = getDaysUntilExpiry(product.expiry_date);
      return product.quantity > 0 && daysUntilExpiry >= 0 && daysUntilExpiry <= thresholds.expiryDays;
    }).length;
    const todaySales = transactions
      .filter((transaction) => transaction.type === "sale" && transaction.date === todayDateKey)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      criticalStockItems,
      expiringSoon,
      lowStockItems,
      outOfStockItems,
      todaySales,
      totalUnits,
    };
  }, [products, thresholds, todayDateKey, transactions]);

  const alerts = useMemo(() => [
    ...products.filter((product) => getStockLevel(product.quantity, thresholds) === "out").map((product) => ({ product, tone: "critical", text: "Out of stock — replenish immediately" })),
    ...products.filter((product) => getStockLevel(product.quantity, thresholds) === "critical").map((product) => ({ product, tone: "critical", text: `${product.quantity} units left — critical threshold is ${thresholds.critical}` })),
    ...products.filter((product) => getStockLevel(product.quantity, thresholds) === "low").map((product) => ({ product, tone: "warning", text: `${product.quantity} units left — low threshold is ${thresholds.low}` })),
    ...products.filter((product) => {
      const days = getDaysUntilExpiry(product.expiry_date);
      return product.quantity > 0 && days >= 0 && days <= thresholds.expiryDays;
    }).map((product) => ({ product, tone: "warning", text: `Expires in ${getDaysUntilExpiry(product.expiry_date)} day(s)` })),
  ].slice(0, 6), [products, thresholds]);

  return (
    <DashboardLayout pageLabel="Dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-[2rem] font-medium text-[#171717]">Dashboard Overview</h1>
        </div>

        {isLoading ? (
          <div className="workspace-panel">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard
                title="Total products"
                value={stats.totalUnits.toLocaleString()}
                icon={Package}
                badgeText="12% From last month"
                onClick={() => navigate("/inventory")}
              />
              <StatCard
                title="Out of Stock"
                value={stats.outOfStockItems}
                icon={PackageX}
                badgeText="Reorder now"
                variant="danger"
                onClick={() => navigate("/inventory")}
              />
              <StatCard
                title="Low Stock Items"
                value={stats.lowStockItems + stats.criticalStockItems}
                icon={AlertTriangle}
                badgeText="Attention!"
                variant="warning"
                onClick={() => navigate("/inventory")}
              />
              <StatCard
                title="Expiring Soon"
                value={stats.expiringSoon}
                icon={Clock}
                badgeText="Alert!"
                variant="danger"
                onClick={() => navigate("/inventory")}
              />
              <StatCard
                title="Today's Sale"
                value={formatCurrency(stats.todaySales)}
                icon={DollarSign}
                badgeText="10% From yesterday"
                variant="success"
                onClick={() => navigate("/transactions")}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_1fr]">
              <TopSellingChart />
              <AIForecastCard products={products} transactions={transactions} />
            </div>

            <div className="workspace-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-medium text-[#171717]">Inventory notifications</h2>
                </div>
                <button onClick={() => navigate("/inventory")} className="text-sm font-medium text-primary hover:underline">Manage inventory</button>
              </div>
              {alerts.length === 0 ? <p className="text-sm text-[#666]">All inventory is within your thresholds and no products are expiring soon.</p> : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {alerts.map((alert, index) => <button key={`${alert.product.id}-${alert.text}-${index}`} onClick={() => navigate("/inventory")} className="rounded-[4px] bg-[#efebe6] p-3 text-left hover:bg-[#e8e2db]">
                    <p className="text-sm font-medium text-[#171717]">{alert.product.name}</p>
                    <p className={alert.tone === "critical" ? "mt-1 text-xs text-primary" : "mt-1 text-xs text-[#9a6a08]"}>{alert.text}</p>
                  </button>)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Index;
