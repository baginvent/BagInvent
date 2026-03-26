import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, DollarSign, Loader2, Package } from "lucide-react";
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
import { toast } from "sonner";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;

const getTodayDateKey = () =>
  new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

const getDaysUntil = (date: string | null) => {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const expiry = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
};

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const [isSeeding, setIsSeeding] = useState(false);
  const todayDateKey = getTodayDateKey();

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

  const transactions = transactionResult?.items ?? [];
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;

  const stats = useMemo(() => {
    const totalUnits = products.reduce((sum, product) => sum + product.quantity, 0);
    const lowStockItems = products.filter((product) => product.quantity > 0 && product.quantity <= 10)
      .length;
    const expiringSoon = products.filter((product) => {
      const daysUntilExpiry = getDaysUntil(product.expiry_date);
      return product.quantity > 0 && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
    }).length;
    const todaySales = transactions
      .filter((transaction) => transaction.type === "sale" && transaction.date === todayDateKey)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      expiringSoon,
      lowStockItems,
      todaySales,
      totalUnits,
    };
  }, [products, todayDateKey, transactions]);

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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total products"
                value={stats.totalUnits.toLocaleString()}
                icon={Package}
                badgeText="12% From last month"
                onClick={() => navigate("/inventory")}
              />
              <StatCard
                title="Low Stock Items"
                value={stats.lowStockItems}
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
              <AIForecastCard />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Index;
