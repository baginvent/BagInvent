import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ensureDemoInventoryAndTransactions,
  isMissingTransactionsTableError,
} from "@/lib/demoData";
import { buildMockTransactions, formatCurrency } from "@/lib/forecastInsights";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;

const getDateKey = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split("T")[0];

export default function Reports() {
  const [isSeeding, setIsSeeding] = useState(false);
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    let active = true;

    const seedDemoData = async () => {
      setIsSeeding(true);

      try {
        const result = await ensureDemoInventoryAndTransactions(user.id);

        if (!active) return;

        if (result.seededProducts || result.seededTransactions) {
          queryClient.invalidateQueries({ queryKey: ["products", user.id] });
          queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
        }
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load reports");
      } finally {
        if (active) setIsSeeding(false);
      }
    };

    seedDemoData();

    return () => {
      active = false;
    };
  }, [queryClient, user]);

  const {
    data: products = [],
    error: productsError,
    isLoading: isProductsLoading,
  } = useQuery<Product[]>({
    queryKey: ["products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user!.id)
        .order("name", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const {
    data: transactionResult,
    error: transactionsError,
    isLoading: isTransactionsLoading,
  } = useQuery<{ items: Transaction[]; source: "db" | "mock" }>({
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
  const usingMockTransactions = transactionResult?.source === "mock";
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;
  const hasLoadError = Boolean(productsError || transactionsError);

  const salesData = useMemo(() => {
    const today = new Date();
    const dailyTotals = new Map<string, number>();

    transactions
      .filter((transaction) => transaction.type === "sale")
      .forEach((transaction) => {
        dailyTotals.set(transaction.date, (dailyTotals.get(transaction.date) ?? 0) + transaction.amount);
      });

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = getDateKey(date);

      return {
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        sales: dailyTotals.get(key) ?? 0,
      };
    });
  }, [transactions]);

  const inventoryMovement = useMemo(() => {
    const now = new Date();
    const monthlyTotals = new Map<string, { incoming: number; outgoing: number }>();

    transactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const currentValue = monthlyTotals.get(key) ?? { incoming: 0, outgoing: 0 };

      monthlyTotals.set(key, {
        incoming:
          transaction.type === "incoming"
            ? currentValue.incoming + transaction.quantity
            : currentValue.incoming,
        outgoing:
          transaction.type === "sale"
            ? currentValue.outgoing + transaction.quantity
            : currentValue.outgoing,
      });
    });

    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const totals = monthlyTotals.get(key) ?? { incoming: 0, outgoing: 0 };

      return {
        incoming: totals.incoming,
        month: date.toLocaleDateString("en-US", { month: "short" }),
        outgoing: totals.outgoing,
      };
    });
  }, [transactions]);

  const stockAging = useMemo(() => {
    const totals = {
      attention: 0,
      critical: 0,
      healthy: 0,
      noExpiry: 0,
    };

    products.forEach((product) => {
      if (product.quantity <= 0) return;

      if (!product.expiry_date) {
        totals.noExpiry += product.quantity;
        return;
      }

      const expiry = new Date(product.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expiry.setHours(0, 0, 0, 0);

      const daysUntilExpiry = Math.round((expiry.getTime() - today.getTime()) / 86400000);

      if (daysUntilExpiry <= 7) {
        totals.critical += product.quantity;
      } else if (daysUntilExpiry <= 30) {
        totals.attention += product.quantity;
      } else {
        totals.healthy += product.quantity;
      }
    });

    const totalUnits = totals.attention + totals.critical + totals.healthy + totals.noExpiry;
    const toPercent = (value: number) =>
      totalUnits === 0 ? 0 : Math.round((value / totalUnits) * 100);

    return [
      { color: "#cf5a5a", name: "Critical (0-7 days)", units: totals.critical, value: toPercent(totals.critical) },
      { color: "#f0d66d", name: "Attention (8-30 days)", units: totals.attention, value: toPercent(totals.attention) },
      { color: "#5aa36c", name: "Healthy (31+ days)", units: totals.healthy, value: toPercent(totals.healthy) },
      { color: "#2d63c8", name: "No Expiry", units: totals.noExpiry, value: toPercent(totals.noExpiry) },
    ].filter((item) => item.units > 0);
  }, [products]);

  return (
    <DashboardLayout pageLabel="Reports">
      <div className="space-y-6">
        <div>
          <h1 className="text-[2rem] font-medium text-[#171717]">Reports</h1>
        </div>

        {hasLoadError ? (
          <div className="workspace-card-soft text-sm text-[#b34d4d]">
            Report data could not be loaded. Refresh after your inventory and transactions tables
            are available.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="workspace-panel">
            <h2 className="mb-4 text-lg font-medium text-[#171717]">Weekly Sales</h2>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData}>
                    <CartesianGrid stroke="#bdb4aa" vertical={false} />
                    <XAxis dataKey="day" stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#f7f4ef",
                        border: "1px solid #d8cfc4",
                        borderRadius: "4px",
                        color: "#171717",
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Sales"]}
                    />
                    <Bar dataKey="sales">
                      {salesData.map((_, index) => (
                        <Cell key={index} fill={index === salesData.length - 1 ? "#cf5a5a" : "#2d63c8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <h2 className="mb-4 text-lg font-medium text-[#171717]">Inventory Movement</h2>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inventoryMovement}>
                    <CartesianGrid stroke="#bdb4aa" vertical={false} />
                    <XAxis dataKey="month" stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#f7f4ef",
                        border: "1px solid #d8cfc4",
                        borderRadius: "4px",
                        color: "#171717",
                      }}
                      formatter={(value: number) => [`${value} units`, "Movement"]}
                    />
                    <Line type="monotone" dataKey="incoming" stroke="#5aa36c" strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="outgoing" stroke="#5642a5" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="workspace-panel xl:col-span-2">
            <h2 className="mb-4 text-lg font-medium text-[#171717]">Stock Aging Distribution</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
              </div>
            ) : stockAging.length === 0 ? (
              <div className="workspace-card-soft text-sm text-[#666]">
                Stock aging will appear here once inventory quantities and expiry dates are available.
              </div>
            ) : (
              <div className="flex flex-col items-center gap-8 lg:flex-row">
                <div className="h-[250px] w-full lg:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stockAging}
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {stockAging.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#f7f4ef",
                          border: "1px solid #d8cfc4",
                          borderRadius: "4px",
                          color: "#171717",
                        }}
                        formatter={(value: number, _name, item) => [
                          `${value}%`,
                          `${item.payload.units} units`,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-3">
                  {stockAging.map((item) => (
                    <div key={item.name} className="flex items-center gap-3 rounded-[4px] bg-[#efebe6] px-4 py-3">
                      <div className="h-4 w-4 rounded" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-[#171717]">{item.name}</span>
                      <span className="ml-auto text-sm text-[#555]">
                        {item.value}% ({item.units} units)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
