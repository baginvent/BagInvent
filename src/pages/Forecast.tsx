import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Recycle,
  Clock,
  ShoppingCart,
  Calendar,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ensureDemoInventoryAndTransactions, isMissingTransactionsTableError } from "@/lib/demoData";
import {
  buildInsights,
  buildMockTransactions,
  buildRecommendations,
  buildWasteAlerts,
  buildWasteTips,
  calculateSalesTrends,
  formatCurrency,
  generateForecastData,
  mapTransactionsToForecastData,
} from "@/lib/forecastInsights";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;

export default function Forecast() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [forecastVersion, setForecastVersion] = useState(0);
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
          toast.success("Forecast insights updated from your current data.");
          queryClient.invalidateQueries({ queryKey: ["products", user.id] });
          queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
        }
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load forecast data");
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

  const categories = useMemo(() => {
    const options = new Set<string>(["All"]);
    products.forEach((product) => {
      if (product.category.trim()) options.add(product.category);
    });
    return Array.from(options);
  }, [products]);

  useEffect(() => {
    if (!categories.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [categories, selectedCategory]);

  const mappedTransactions = useMemo(
    () => mapTransactionsToForecastData(products, transactions),
    [products, transactions],
  );

  const scopedProducts = useMemo(
    () =>
      selectedCategory === "All"
        ? products
        : products.filter((product) => product.category === selectedCategory),
    [products, selectedCategory],
  );

  const scopedTransactions = useMemo(
    () =>
      selectedCategory === "All"
        ? mappedTransactions
        : mappedTransactions.filter((transaction) => transaction.category === selectedCategory),
    [mappedTransactions, selectedCategory],
  );

  const salesByProduct = useMemo(() => {
    const totals = new Map<string, { amount: number; quantity: number }>();

    scopedTransactions
      .filter((transaction) => transaction.type === "sale")
      .forEach((transaction) => {
        const currentValue = totals.get(transaction.product_name) ?? { amount: 0, quantity: 0 };
        totals.set(transaction.product_name, {
          amount: currentValue.amount + transaction.amount,
          quantity: currentValue.quantity + transaction.quantity,
        });
      });

    return totals;
  }, [scopedTransactions]);

  const topSeller = useMemo(() => {
    const [name, totals] =
      [...salesByProduct.entries()].sort((left, right) => right[1].quantity - left[1].quantity)[0] ??
      [];

    if (!name || !totals) return undefined;
    return { name, quantity: totals.quantity };
  }, [salesByProduct]);

  const lowStockProduct = useMemo(
    () =>
      [...scopedProducts]
        .filter((product) => product.quantity <= 10)
        .sort(
          (left, right) =>
            (salesByProduct.get(right.name)?.quantity ?? 0) - (salesByProduct.get(left.name)?.quantity ?? 0),
        )[0],
    [salesByProduct, scopedProducts],
  );

  const overstockProduct = useMemo(
    () =>
      [...scopedProducts]
        .filter((product) => product.quantity >= 20)
        .sort(
          (left, right) =>
            (salesByProduct.get(left.name)?.quantity ?? 0) - (salesByProduct.get(right.name)?.quantity ?? 0),
        )[0],
    [salesByProduct, scopedProducts],
  );

  const wasteAlerts = useMemo(() => buildWasteAlerts(scopedProducts), [scopedProducts]);
  const salesTrends = useMemo(() => calculateSalesTrends(scopedTransactions), [scopedTransactions]);
  const forecastData = useMemo(
    () => generateForecastData(scopedTransactions, salesTrends.growth + forecastVersion),
    [forecastVersion, salesTrends.growth, scopedTransactions],
  );
  const aiInsights = useMemo(
    () =>
      buildInsights({
        expiryAlerts: wasteAlerts,
        lowStockProduct,
        overstockProduct,
        salesTrends,
        selectedCategory,
        topSellerName: topSeller?.name,
        topSellerUnits: topSeller?.quantity,
      }),
    [lowStockProduct, overstockProduct, salesTrends, selectedCategory, topSeller, wasteAlerts],
  );
  const recommendations = useMemo(
    () =>
      buildRecommendations({
        expiryAlerts: wasteAlerts,
        lowStockProduct,
        overstockProduct,
        topSellerName: topSeller?.name,
      }),
    [lowStockProduct, overstockProduct, topSeller, wasteAlerts],
  );
  const wasteTips = useMemo(
    () => buildWasteTips({ expiryAlerts: wasteAlerts, lowStockProduct, overstockProduct }),
    [lowStockProduct, overstockProduct, wasteAlerts],
  );

  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;
  const hasLoadError = Boolean(productsError || transactionsError);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Forecast</h1>
            <p className="text-muted-foreground mt-1">
              AI-powered demand predictions and insights based on your current inventory and transaction history.
            </p>
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground animate-pulse-glow"
            onClick={() => setForecastVersion((currentValue) => currentValue + 1)}
            disabled={isLoading || hasLoadError}
          >
            <Brain className="w-4 h-4 mr-2" />
            Generate New Forecast
          </Button>
        </div>

        {usingMockTransactions && !hasLoadError && (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Forecast insights are currently using seeded mock transaction history.
          </div>
        )}

        {hasLoadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">
            Forecast data could not be loaded. Refresh after your inventory and transactions tables are available.
          </div>
        )}

        {isLoading ? (
          <div className="chart-container">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : (
          <>
            <div className="chart-container">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">AI Insights Summary</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {aiInsights.map((insight, index) => (
                  <div key={index} className="insight-card flex items-start gap-3">
                    <insight.icon
                      className={cn(
                        "w-5 h-5 mt-0.5",
                        insight.type === "increase" && "text-success",
                        insight.type === "overstock" && "text-warning",
                        insight.type === "expiry" && "text-destructive",
                      )}
                    />
                    <p className="text-sm text-foreground">{insight.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="chart-container">
                <h3 className="text-lg font-semibold text-foreground mb-4">Sales Trends</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className={cn("w-4 h-4", salesTrends.growth >= 0 ? "text-success" : "text-destructive")} />
                      <span className="text-sm text-muted-foreground">Weekly Growth</span>
                    </div>
                    <span className={cn("text-lg font-bold", salesTrends.growth >= 0 ? "text-success" : "text-destructive")}>
                      {salesTrends.growth >= 0 ? "+" : ""}
                      {salesTrends.growth}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-chart-2" />
                      <span className="text-sm text-muted-foreground">Peak Hour</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">{salesTrends.peakHour}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-chart-5" />
                      <span className="text-sm text-muted-foreground">Best Day</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">{salesTrends.bestDay}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Avg Basket</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">{formatCurrency(salesTrends.avgBasket)}</span>
                  </div>
                </div>
              </div>

              <div className="chart-container lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  <h3 className="text-lg font-semibold text-foreground">Waste Alerts</h3>
                </div>
                <div className="space-y-3">
                  {wasteAlerts.length === 0 ? (
                    <div className="rounded-lg border border-border bg-secondary/20 p-4">
                      <p className="text-sm text-muted-foreground">
                        No products are currently nearing expiry in the selected inventory scope.
                      </p>
                    </div>
                  ) : (
                    wasteAlerts.map((alert, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border",
                          alert.urgency === "high" ? "bg-destructive/10 border-destructive/30" : "bg-warning/10 border-warning/30",
                        )}
                      >
                        <div>
                          <p className="font-medium text-foreground">{alert.product}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.quantity} units | Expires {alert.expiry}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            alert.urgency === "high" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground",
                          )}
                        >
                          {alert.urgency === "high" ? "Urgent" : "Warning"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="chart-container">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-semibold text-foreground">30-Day Demand Forecast</h3>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                        selectedCategory === category ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastData}>
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
                    />
                    <Legend />
                    <Line type="monotone" dataKey="predicted" name="Predicted Demand" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="historical" name="Historical Baseline" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: "hsl(var(--muted-foreground))", strokeWidth: 1 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="chart-container">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-warning" />
                  <h3 className="text-lg font-semibold text-foreground">AI Recommended Actions</h3>
                </div>
                <div className="space-y-3">
                  {recommendations.length === 0 ? (
                    <div className="rounded-lg border border-border bg-secondary/20 p-4">
                      <p className="text-sm text-muted-foreground">
                        Recommendations will appear as soon as the system detects stock pressure or expiry risk.
                      </p>
                    </div>
                  ) : (
                    recommendations.map((recommendation, index) => (
                      <div key={index} className="insight-card">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-xs font-bold",
                                  recommendation.action === "Restock" && "bg-success/20 text-success",
                                  recommendation.action === "Reduce" && "bg-warning/20 text-warning",
                                  recommendation.action === "Promote" && "bg-chart-2/20 text-chart-2",
                                  recommendation.action === "Bundle" && "bg-chart-5/20 text-chart-5",
                                )}
                              >
                                {recommendation.action}
                              </span>
                              <span className="font-medium text-foreground">{recommendation.product}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{recommendation.reason}</p>
                          </div>
                          <span className={cn("text-xs px-2 py-1 rounded-full", recommendation.priority === "high" ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground")}>
                            {recommendation.priority}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="chart-container">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Recycle className="w-5 h-5 text-success" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Waste Reduction Tips</h3>
                </div>
                <div className="space-y-3">
                  {wasteTips.map((item, index) => (
                    <div key={index} className="insight-card">
                      <p className="font-medium text-foreground">{item.tip}</p>
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
