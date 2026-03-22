import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ensureDemoInventoryAndTransactions, isMissingTransactionsTableError } from "@/lib/demoData";
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
          toast.success("Reports updated from your current inventory data.");
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
      { color: "hsl(var(--destructive))", name: "Critical (0-7 days)", units: totals.critical, value: toPercent(totals.critical) },
      { color: "hsl(var(--warning))", name: "Attention (8-30 days)", units: totals.attention, value: toPercent(totals.attention) },
      { color: "hsl(var(--success))", name: "Healthy (31+ days)", units: totals.healthy, value: toPercent(totals.healthy) },
      { color: "hsl(var(--primary))", name: "No Expiry", units: totals.noExpiry, value: toPercent(totals.noExpiry) },
    ].filter((item) => item.units > 0);
  }, [products]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Analyze your business performance</p>
        </div>

        {usingMockTransactions && !hasLoadError && (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Reports are currently using seeded mock transaction history.
          </div>
        )}

        {hasLoadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">
            Report data could not be loaded. Refresh after your inventory and transactions tables are available.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="chart-container">
            <h3 className="text-lg font-semibold text-foreground mb-4">Weekly Sales</h3>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Sales"]}
                    />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="chart-container">
            <h3 className="text-lg font-semibold text-foreground mb-4">Inventory Movement</h3>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inventoryMovement}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
                      }}
                      formatter={(value: number) => [`${value} units`, "Movement"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="incoming"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--success))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="outgoing"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-2))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground">Incoming</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-2" />
                <span className="text-sm text-muted-foreground">Outgoing</span>
              </div>
            </div>
          </div>

          <div className="chart-container lg:col-span-2">
            <h3 className="text-lg font-semibold text-foreground mb-4">Stock Aging Distribution</h3>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : stockAging.length === 0 ? (
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">
                  Stock aging will appear here once inventory quantities and expiry dates are available.
                </p>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row items-center gap-8">
                <div className="h-[250px] w-full lg:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stockAging}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {stockAging.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--foreground))",
                        }}
                        formatter={(value: number, _name, item) => [
                          `${value}%`,
                          `${item.payload.units} units`,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3 w-full">
                  {stockAging.map((item) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-foreground">{item.name}</span>
                      <span className="text-sm text-muted-foreground ml-auto">
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
