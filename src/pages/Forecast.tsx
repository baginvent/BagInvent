import { useEffect, useMemo, useRef, useState } from "react";
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
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  Brain,
  CalendarDays,
  Clock,
  Clock3,
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
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
const EMPTY_TRANSACTIONS: Transaction[] = [];

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

const summarizeForecastText = (text: string, maxWords = 16) => {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const normalizedText = firstSentence || text.trim();
  const words = normalizedText.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return normalizedText;
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
};

export default function Forecast() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [forecastVersion, setForecastVersion] = useState(0);
  const [isSeeding, setIsSeeding] = useState(false);
  const forecastContentRef = useRef<HTMLDivElement | null>(null);

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

  const transactions = transactionResult?.items ?? EMPTY_TRANSACTIONS;
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
  const GrowthIcon = salesTrends.growth >= 0 ? TrendingUp : TrendingDown;

  const handleExportPDF = async () => {
    if (!forecastContentRef.current) {
      toast.error("Nothing is ready to export yet.");
      return;
    }

    const canvas = await html2canvas(forecastContentRef.current, {
      backgroundColor: "#fbfaf7",
      scale: 2,
    });

    const document = new jsPDF({ format: "a4", unit: "mm" });
    const pageWidth = document.internal.pageSize.getWidth();
    const pageHeight = document.internal.pageSize.getHeight();
    const horizontalMargin = 10;
    const topMargin = 12;
    const imageWidth = pageWidth - horizontalMargin * 2;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const imageData = canvas.toDataURL("image/png");

    document.setFontSize(18);
    document.text("AI Demand Forecasting", horizontalMargin, topMargin);
    document.setFontSize(10);
    document.setTextColor(95, 90, 86);
    document.text(`Category filter: ${selectedCategory}`, horizontalMargin, topMargin + 6);

    const contentTopY = topMargin + 10;
    let remainingImageHeight = imageHeight - (pageHeight - contentTopY);
    let imagePositionY = contentTopY;

    document.addImage(
      imageData,
      "PNG",
      horizontalMargin,
      contentTopY,
      imageWidth,
      imageHeight,
    );
    remainingImageHeight -= pageHeight - contentTopY;

    while (remainingImageHeight > 0) {
      document.addPage();
      imagePositionY -= pageHeight - topMargin;
      document.addImage(
        imageData,
        "PNG",
        horizontalMargin,
        imagePositionY,
        imageWidth,
        imageHeight,
      );
      remainingImageHeight -= pageHeight - topMargin;
    }

    document.save(`bag-invent-forecast-${selectedCategory.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <DashboardLayout pageLabel="AI Demand Forecasting">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-[2rem] font-medium text-[#171717]">AI Demand Forecasting</h1>
          <div className="flex flex-wrap gap-3">
            <Button
              className="h-10 rounded-[4px] bg-[#d8d8d8] px-5 text-[#171717] hover:bg-[#cccccc]"
              onClick={handleExportPDF}
              disabled={isLoading || hasLoadError}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            <Button
              className="h-10 rounded-[4px] bg-[#cf5a5a] px-5 text-white hover:bg-[#c55252]"
              onClick={() => setForecastVersion((currentValue) => currentValue + 1)}
              disabled={isLoading || hasLoadError}
            >
              <Brain className="mr-2 h-4 w-4" />
              Refresh Forecast
            </Button>
          </div>
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
          <div ref={forecastContentRef} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">AI Insight Summary</h2>
                <div className="mt-4 space-y-4 text-sm text-[#333]">
                  {aiInsights.map((insight) => (
                    <div key={insight.text} className="space-y-1">
                      <p>{summarizeForecastText(insight.text, 16)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="workspace-panel">
                <h2 className="text-lg font-medium text-[#171717]">Sales Trends</h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[4px] bg-[#efebe6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Weekly Growth</p>
                        <p className="mt-2 text-2xl font-medium text-[#171717]">
                          {salesTrends.growth >= 0 ? "+" : ""}
                          {salesTrends.growth}%
                        </p>
                      </div>
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          salesTrends.growth >= 0
                            ? "bg-[#d7f6e3] text-[#2f7b54]"
                            : "bg-[#ffd9d9] text-[#b34d4d]"
                        }`}
                      >
                        <GrowthIcon className="h-5 w-5" />
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[4px] bg-[#efebe6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Best Day</p>
                        <p className="mt-2 text-2xl font-medium text-[#171717]">
                          {salesTrends.bestDay}
                        </p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dce8ff] text-[#2d63c8]">
                        <CalendarDays className="h-5 w-5" />
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[4px] bg-[#efebe6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Peak Hour</p>
                        <p className="mt-2 text-2xl font-medium text-[#171717]">
                          {salesTrends.peakHour}
                        </p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffe8c8] text-[#c57a17]">
                        <Clock3 className="h-5 w-5" />
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[4px] bg-[#efebe6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[#666]">Avg. Basket</p>
                        <p className="mt-2 text-2xl font-medium text-[#171717]">
                          {formatCurrency(salesTrends.avgBasket)}
                        </p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d7f6e3] text-[#2f7b54]">
                        <Wallet className="h-5 w-5" />
                      </span>
                    </div>
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
                          {summarizeForecastText(item, 14)}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#171717]">Assumptions</p>
                    <div className="mt-2 space-y-2">
                      {demandPlanning.assumptions.map((item) => (
                        <p key={item} className="text-sm text-[#555]">
                          {summarizeForecastText(item, 14)}
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
                      <p className="text-sm text-[#333]">{summarizeForecastText(insight, 15)}</p>
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
                          <p className="mt-1 text-xs text-[#666]">
                            {summarizeForecastText(forecast.reasoning, 14)}
                          </p>
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
                            <p className="mt-1 text-sm text-[#555]">
                              {summarizeForecastText(item.reason, 16)}
                            </p>
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
                            <p className="mt-1 text-sm text-[#555]">
                              {summarizeForecastText(item.reason, 16)}
                            </p>
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

            <div className="grid grid-cols-1">
              <div className="workspace-panel">
                <div className="mb-4 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-[#666]" />
                  <h2 className="text-lg font-medium text-[#171717]">Waste Prevention Tips</h2>
                </div>
                <div className="space-y-5">
                  {wasteTips.map((item) => (
                    <div key={item.tip}>
                      <p className="font-medium text-[#171717]">{item.tip}</p>
                      <p className="mt-1 text-sm text-[#555]">
                        {summarizeForecastText(item.description, 15)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
