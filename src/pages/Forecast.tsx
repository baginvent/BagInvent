import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Brain, Clock, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ensureDemoInventoryAndTransactions,
  isMissingTransactionsTableError,
} from "@/lib/demoData";
import {
  buildInsights,
  buildDemandPlanningResult,
  buildMockTransactions,
  buildRecommendations,
  buildWasteAlerts,
  buildWasteTips,
  calculateSalesTrends,
  formatCurrency,
  generateForecastData,
  mapTransactionsToForecastData,
  type ForecastConfidence,
} from "@/lib/forecastInsights";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;

const demandLevelStyles = {
  "High demand": "bg-[#d7f6e3] text-[#2f7b54]",
  "Medium demand": "bg-[#fff2ab] text-[#8a6b08]",
  "Low demand": "bg-[#ffd9d9] text-[#b34d4d]",
} as const;

const stockDecisionStyles = {
  "Increase stock": "bg-[#d7f6e3] text-[#2f7b54]",
  "Maintain stock": "bg-[#fff2ab] text-[#8a6b08]",
  "Reduce stock": "bg-[#ffd9d9] text-[#b34d4d]",
} as const;

const confidenceStyles: Record<ForecastConfidence, string> = {
  high: "bg-[#d7f6e3] text-[#2f7b54]",
  low: "bg-[#ffd9d9] text-[#b34d4d]",
  medium: "bg-[#fff2ab] text-[#8a6b08]",
};

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
            (salesByProduct.get(right.name)?.quantity ?? 0) -
            (salesByProduct.get(left.name)?.quantity ?? 0),
        )[0],
    [salesByProduct, scopedProducts],
  );

  const overstockProduct = useMemo(
    () =>
      [...scopedProducts]
        .filter((product) => product.quantity >= 20)
        .sort(
          (left, right) =>
            (salesByProduct.get(left.name)?.quantity ?? 0) -
            (salesByProduct.get(right.name)?.quantity ?? 0),
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
  const demandPlanning = useMemo(
    () =>
      buildDemandPlanningResult({
        periodDays: 7,
        products: scopedProducts,
        transactions: scopedTransactions,
      }),
    [scopedProducts, scopedTransactions],
  );

  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;
  const hasLoadError = Boolean(productsError || transactionsError);

  return (
    <DashboardLayout pageLabel="AI Demand Forecasting">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-[2rem] font-medium text-[#171717]">AI Demand Forecasting</h1>
          <Button
            className="h-10 rounded-[4px] bg-[#cf5a5a] px-5 text-white hover:bg-[#c55252]"
            onClick={() => setForecastVersion((currentValue) => currentValue + 1)}
            disabled={isLoading || hasLoadError}
          >
            <Brain className="mr-2 h-4 w-4" />
            Refresh Forecast
          </Button>
        </div>

        {hasLoadError ? (
          <div className="workspace-card-soft text-sm text-[#b34d4d]">
            Forecast data could not be loaded. Refresh after your inventory and transactions
            tables are available.
          </div>
        ) : null}

        {isLoading ? (
          <div className="workspace-panel">
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">AI Insight Summary</h2>
                <div className="mt-4 space-y-4 text-sm text-[#333]">
                  {aiInsights.map((insight) => (
                    <div key={insight.text} className="space-y-1">
                      <p>{insight.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Sales Trends</h2>
                <div className="mt-4 grid grid-cols-2 gap-4 text-[#171717]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Weekly Growth</p>
                    <p className="mt-2 text-2xl font-medium">
                      {salesTrends.growth >= 0 ? "+" : ""}
                      {salesTrends.growth}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Best Day</p>
                    <p className="mt-2 text-2xl font-medium">{salesTrends.bestDay}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Peak Hour</p>
                    <p className="mt-2 text-2xl font-medium">{salesTrends.peakHour}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Avg. Basket</p>
                    <p className="mt-2 text-2xl font-medium">{formatCurrency(salesTrends.avgBasket)}</p>
                  </div>
                </div>
              </div>

              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Waste Alerts</h2>
                <div className="mt-4 space-y-4">
                  {wasteAlerts.length === 0 ? (
                    <p className="text-sm text-[#666]">
                      No products are currently nearing expiry in the selected inventory scope.
                    </p>
                  ) : (
                    wasteAlerts.map((alert) => (
                      <div key={`${alert.product}-${alert.expiry}`} className="space-y-1">
                        <p className="text-sm text-[#333]">
                          {alert.product} ({alert.quantity} units)
                        </p>
                        <p className="text-xs text-[#c45c5c]">Expires in {alert.expiry}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="workspace-panel">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-lg font-medium text-[#171717]">30-Day Demand Forecast</h2>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={
                        selectedCategory === category
                          ? "rounded-full bg-[#cf5a5a] px-4 py-1.5 text-xs font-medium text-white"
                          : "rounded-full bg-[#efebe6] px-4 py-1.5 text-xs font-medium text-[#171717]"
                      }
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastData}>
                    <CartesianGrid stroke="#979797" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="day" stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#f7f4ef",
                        border: "1px solid #d8cfc4",
                        borderRadius: "4px",
                        color: "#171717",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted Demand"
                      stroke="#5642a5"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="historical"
                      name="Average"
                      stroke="#58c85c"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Forecast Method And Assumptions</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-[#171717]">Methodology</p>
                    <div className="mt-2 space-y-2">
                      {demandPlanning.methodology.map((item) => (
                        <p key={item} className="text-sm text-[#555]">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#171717]">Assumptions</p>
                    <div className="mt-2 space-y-2">
                      {demandPlanning.assumptions.map((item) => (
                        <p key={item} className="text-sm text-[#555]">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Key Insights</h2>
                <div className="mt-4 space-y-3">
                  {demandPlanning.insights.map((insight) => (
                    <div key={insight} className="workspace-card-soft">
                      <p className="text-sm text-[#333]">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="workspace-panel">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-medium text-[#171717]">
                    Demand Forecast By Product
                  </h2>
                  <p className="text-sm text-[#666]">
                    Forecast horizon: next {demandPlanning.periodDays} days
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse">
                  <thead>
                    <tr className="border-b border-white/40 text-left">
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Product
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Category
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Forecast
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Trend
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Demand
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Action
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Inventory
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Coverage
                      </th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#555]">
                        Confidence
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandPlanning.productForecasts.map((forecast) => (
                      <tr key={forecast.productId} className="border-b border-white/20 align-top">
                        <td className="px-3 py-4">
                          <p className="font-medium text-[#171717]">{forecast.productName}</p>
                          <p className="mt-1 text-xs text-[#666]">{forecast.reasoning}</p>
                        </td>
                        <td className="px-3 py-4 text-sm text-[#333]">{forecast.category}</td>
                        <td className="px-3 py-4">
                          <p className="font-medium text-[#171717]">
                            {forecast.forecastNextPeriod} units
                          </p>
                          <p className="text-xs text-[#666]">
                            {forecast.forecastDailyAverage}/day
                          </p>
                        </td>
                        <td className="px-3 py-4 text-sm text-[#333]">
                          {forecast.trendPct >= 0 ? "+" : ""}
                          {forecast.trendPct}%
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${demandLevelStyles[forecast.demandLevel]}`}
                          >
                            {forecast.demandLevel}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${stockDecisionStyles[forecast.stockDecision]}`}
                          >
                            {forecast.stockDecision}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm text-[#333]">
                          {forecast.currentInventory ?? "N/A"}
                        </td>
                        <td className="px-3 py-4 text-sm text-[#333]">
                          {forecast.inventoryCoverageDays !== null
                            ? `${forecast.inventoryCoverageDays} days`
                            : "N/A"}
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium uppercase ${confidenceStyles[forecast.confidence]}`}
                          >
                            {forecast.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Top Products To BUY MORE</h2>
                <div className="mt-4 space-y-3">
                  {demandPlanning.buyMore.length === 0 ? (
                    <div className="workspace-card-soft">
                      <p className="text-sm text-[#555]">
                        No urgent restock candidates were identified from the current forecast.
                      </p>
                    </div>
                  ) : (
                    demandPlanning.buyMore.map((item) => (
                      <div key={item.productName} className="workspace-card-soft">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-[#171717]">{item.productName}</p>
                            <p className="mt-1 text-sm text-[#555]">{item.reason}</p>
                          </div>
                          <span className="rounded-full bg-[#d7f6e3] px-3 py-1 text-xs font-medium text-[#2f7b54]">
                            Buy More
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Top Products To BUY LESS</h2>
                <div className="mt-4 space-y-3">
                  {demandPlanning.buyLess.length === 0 ? (
                    <div className="workspace-card-soft">
                      <p className="text-sm text-[#555]">
                        No clear reduction candidates were identified from the current forecast.
                      </p>
                    </div>
                  ) : (
                    demandPlanning.buyLess.map((item) => (
                      <div key={item.productName} className="workspace-card-soft">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-[#171717]">{item.productName}</p>
                            <p className="mt-1 text-sm text-[#555]">{item.reason}</p>
                          </div>
                          <span className="rounded-full bg-[#ffd9d9] px-3 py-1 text-xs font-medium text-[#b34d4d]">
                            Buy Less
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_1fr]">
              <div className="workspace-panel">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-[#cf5a5a]" />
                  <h2 className="text-lg font-medium text-[#171717]">AI Recommended Actions</h2>
                </div>
                <div className="space-y-3">
                  {recommendations.map((recommendation) => (
                    <div key={`${recommendation.action}-${recommendation.product}`} className="workspace-card-soft">
                      <p className="font-medium text-[#171717]">
                        {recommendation.action} {recommendation.product}
                      </p>
                      <p className="mt-1 text-sm text-[#555]">{recommendation.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="workspace-panel">
                <div className="mb-4 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-[#666]" />
                  <h2 className="text-lg font-medium text-[#171717]">Waste Prevention Tips</h2>
                </div>
                <div className="space-y-5">
                  {wasteTips.map((item) => (
                    <div key={item.tip}>
                      <p className="font-medium text-[#171717]">{item.tip}</p>
                      <p className="mt-1 text-sm text-[#555]">{item.description}</p>
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
