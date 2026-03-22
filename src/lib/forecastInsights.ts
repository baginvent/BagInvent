import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Clock, Package, TrendingUp } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { demoTransactions } from "@/lib/demoData";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;
type TransactionType = "incoming" | "sale";

export type ForecastTransaction = {
  amount: number;
  category: string;
  created_at: string;
  date: string;
  product_name: string;
  quantity: number;
  type: TransactionType;
};

export type InsightType = "expiry" | "increase" | "overstock";

export type Insight = {
  icon: LucideIcon;
  text: string;
  type: InsightType;
};

export type WasteAlert = {
  expiry: string;
  product: string;
  quantity: number;
  urgency: "high" | "medium";
};

export type Recommendation = {
  action: "Bundle" | "Promote" | "Reduce" | "Restock";
  priority: "high" | "medium";
  product: string;
  reason: string;
};

export type WasteTip = {
  description: string;
  tip: string;
};

export type SalesTrends = {
  avgBasket: number;
  bestDay: string;
  growth: number;
  peakHour: string;
};

export type ForecastPoint = {
  day: string;
  historical: number;
  predicted: number;
};

export const TODAY = new Date();

export const toDateInputValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().split("T")[0];

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);

const formatHourRange = (hour: number) => {
  const start = new Date();
  start.setHours(hour, 0, 0, 0);
  const end = new Date();
  end.setHours((hour + 1) % 24, 0, 0, 0);

  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
  });

  return `${formatter.format(start)}-${formatter.format(end)}`;
};

const formatExpiryLabel = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short" });

const getDaysUntil = (date: string) => {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const getDayName = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { weekday: "long" });

export const buildMockTransactions = (userId: string): Transaction[] =>
  demoTransactions.map((transaction, index) => ({
    amount: transaction.amount,
    created_at: `${transaction.date}T${String(10 + (index % 6)).padStart(2, "0")}:00:00.000Z`,
    date: transaction.date,
    id: `mock-forecast-transaction-${index + 1}`,
    product_id: null,
    product_name: transaction.product_name,
    quantity: transaction.quantity,
    reference: transaction.reference,
    type: transaction.type,
    updated_at: `${transaction.date}T${String(10 + (index % 6)).padStart(2, "0")}:00:00.000Z`,
    user_id: userId,
  }));

export const mapTransactionsToForecastData = (
  products: Product[],
  transactions: Transaction[],
): ForecastTransaction[] => {
  const productById = new Map(products.map((product) => [product.id, product]));
  const productByName = new Map(products.map((product) => [product.name, product]));

  return transactions.map((transaction) => {
    const linkedProduct =
      (transaction.product_id && productById.get(transaction.product_id)) ??
      productByName.get(transaction.product_name);

    return {
      amount: transaction.amount,
      category: linkedProduct?.category ?? "Uncategorized",
      created_at: transaction.created_at,
      date: transaction.date,
      product_name: transaction.product_name,
      quantity: transaction.quantity,
      type: transaction.type as TransactionType,
    };
  });
};

export function calculateSalesTrends(data: ForecastTransaction[]): SalesTrends {
  const saleTransactions = data.filter((transaction) => transaction.type === "sale");

  if (saleTransactions.length === 0) {
    return { avgBasket: 0, bestDay: "N/A", growth: 0, peakHour: "N/A" };
  }

  const lastSevenStart = new Date(TODAY);
  lastSevenStart.setDate(TODAY.getDate() - 6);
  lastSevenStart.setHours(0, 0, 0, 0);

  const previousSevenStart = new Date(lastSevenStart);
  previousSevenStart.setDate(lastSevenStart.getDate() - 7);

  const previousSevenEnd = new Date(lastSevenStart);
  previousSevenEnd.setDate(lastSevenStart.getDate() - 1);
  previousSevenEnd.setHours(23, 59, 59, 999);

  const lastWeekTotal = saleTransactions
    .filter((transaction) => new Date(transaction.date) >= lastSevenStart)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const previousWeekTotal = saleTransactions
    .filter((transaction) => {
      const currentDate = new Date(transaction.date);
      return currentDate >= previousSevenStart && currentDate <= previousSevenEnd;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const growth =
    previousWeekTotal > 0
      ? ((lastWeekTotal - previousWeekTotal) / previousWeekTotal) * 100
      : lastWeekTotal > 0
        ? 100
        : 0;

  const hourlySales = new Map<number, number>();
  saleTransactions.forEach((transaction) => {
    const hour = new Date(transaction.created_at).getHours();
    hourlySales.set(hour, (hourlySales.get(hour) ?? 0) + transaction.amount);
  });

  const peakHour = [...hourlySales.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];

  const weekdaySales = new Map<string, number>();
  saleTransactions.forEach((transaction) => {
    const day = getDayName(transaction.date);
    weekdaySales.set(day, (weekdaySales.get(day) ?? 0) + transaction.amount);
  });

  const bestDay = [...weekdaySales.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];

  return {
    avgBasket: Math.round(
      saleTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) /
        saleTransactions.length,
    ),
    bestDay: bestDay ?? "N/A",
    growth: Math.round(growth * 10) / 10,
    peakHour: peakHour === undefined ? "N/A" : formatHourRange(peakHour),
  };
}

export function generateForecastData(data: ForecastTransaction[], growth: number): ForecastPoint[] {
  const saleTransactions = data.filter((transaction) => transaction.type === "sale");

  if (saleTransactions.length === 0) {
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(TODAY);
      date.setDate(TODAY.getDate() + index);

      return {
        day: date.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        historical: 0,
        predicted: 0,
      };
    });
  }

  const dailySales = new Map<string, number>();
  saleTransactions.forEach((transaction) => {
    dailySales.set(transaction.date, (dailySales.get(transaction.date) ?? 0) + transaction.amount);
  });

  const averageDailySales =
    [...dailySales.values()].reduce((sum, value) => sum + value, 0) / Math.max(dailySales.size, 1);

  const weekdayTotals = new Map<number, { count: number; total: number }>();
  saleTransactions.forEach((transaction) => {
    const day = new Date(transaction.date).getDay();
    const currentValue = weekdayTotals.get(day) ?? { count: 0, total: 0 };

    weekdayTotals.set(day, {
      count: currentValue.count + 1,
      total: currentValue.total + transaction.amount,
    });
  });

  const growthFactor = 1 + Math.max(-0.15, Math.min(0.25, growth / 100));

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(TODAY);
    date.setDate(TODAY.getDate() + index);

    const weekday = date.getDay();
    const weekdayStats = weekdayTotals.get(weekday);
    const weekdayAverage =
      weekdayStats && weekdayStats.count > 0
        ? weekdayStats.total / weekdayStats.count
        : averageDailySales;

    const seasonalAdjustment = 1 + Math.sin((index + 1) / 4) * 0.05;
    const predicted = Math.round(weekdayAverage * growthFactor * seasonalAdjustment);

    return {
      day: date.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
      historical: Math.round(weekdayAverage),
      predicted: Math.max(0, predicted),
    };
  });
}

export const buildWasteAlerts = (products: Product[]): WasteAlert[] =>
  products
    .filter((product) => product.expiry_date && product.quantity > 0)
    .map((product) => ({
      daysUntilExpiry: getDaysUntil(product.expiry_date!),
      expiry: formatExpiryLabel(product.expiry_date!),
      product: product.name,
      quantity: product.quantity,
      urgency: getDaysUntil(product.expiry_date!) <= 3 ? "high" : "medium",
    }))
    .filter((product) => product.daysUntilExpiry <= 14)
    .sort((left, right) => left.daysUntilExpiry - right.daysUntilExpiry)
    .map(({ daysUntilExpiry: _daysUntilExpiry, ...alert }) => alert)
    .slice(0, 4);

export function buildInsights(args: {
  expiryAlerts: WasteAlert[];
  lowStockProduct?: Product;
  overstockProduct?: Product;
  salesTrends: SalesTrends;
  selectedCategory: string;
  topSellerName?: string;
  topSellerUnits?: number;
}): Insight[] {
  const { expiryAlerts, lowStockProduct, overstockProduct, salesTrends, selectedCategory, topSellerName, topSellerUnits } =
    args;
  const categoryLabel = selectedCategory === "All" ? "overall mix" : `${selectedCategory.toLowerCase()} category`;
  const insights: Insight[] = [];

  if (topSellerName && topSellerUnits) {
    insights.push({
      icon: TrendingUp,
      text:
        salesTrends.growth === 0
          ? `${topSellerName} leads the ${categoryLabel} with ${topSellerUnits} units sold recently.`
          : `Sales changed ${salesTrends.growth >= 0 ? "up" : "down"} ${Math.abs(salesTrends.growth)}% week over week, with ${topSellerName} driving ${topSellerUnits} units sold.`,
      type: "increase",
    });
  }

  if (lowStockProduct) {
    insights.push({
      icon: Package,
      text: `${lowStockProduct.name} is down to ${lowStockProduct.quantity} units, which is the main low-stock risk in the current view.`,
      type: "increase",
    });
  } else if (overstockProduct) {
    insights.push({
      icon: Package,
      text: `${overstockProduct.name} has ${overstockProduct.quantity} units on hand and appears slower moving than the rest of the assortment.`,
      type: "overstock",
    });
  }

  if (expiryAlerts.length > 0) {
    const firstAlert = expiryAlerts[0];
    insights.push({
      icon: AlertTriangle,
      text: `${firstAlert.product} has ${firstAlert.quantity} units nearing expiry on ${firstAlert.expiry}, so it should be prioritized for sell-through.`,
      type: "expiry",
    });
  } else {
    insights.push({
      icon: Clock,
      text: "No urgent expiry risk is visible right now, so the main focus can stay on sales velocity and replenishment timing.",
      type: "increase",
    });
  }

  return insights.slice(0, 3);
}

export const buildRecommendations = (args: {
  expiryAlerts: WasteAlert[];
  lowStockProduct?: Product;
  overstockProduct?: Product;
  topSellerName?: string;
}): Recommendation[] => {
  const recommendations: Recommendation[] = [];

  if (args.lowStockProduct) {
    recommendations.push({
      action: "Restock",
      priority: "high",
      product: args.lowStockProduct.name,
      reason: `Stock is down to ${args.lowStockProduct.quantity} units and could miss near-term demand.`,
    });
  }

  if (args.expiryAlerts.length > 0) {
    const firstAlert = args.expiryAlerts[0];
    recommendations.push({
      action: "Reduce",
      priority: firstAlert.urgency === "high" ? "high" : "medium",
      product: firstAlert.product,
      reason: `Move ${firstAlert.quantity} units before the ${firstAlert.expiry} expiry window tightens further.`,
    });
  }

  if (args.overstockProduct) {
    recommendations.push({
      action: "Promote",
      priority: "medium",
      product: args.overstockProduct.name,
      reason: "High on-hand stock suggests a promotion or merchandising push to improve turnover.",
    });
  }

  if (args.topSellerName && !recommendations.some((item) => item.product === args.topSellerName)) {
    recommendations.push({
      action: "Bundle",
      priority: "medium",
      product: args.topSellerName,
      reason: "Pair this consistent seller with slower items to lift basket size and reduce idle stock.",
    });
  }

  return recommendations.slice(0, 4);
};

export const buildWasteTips = (args: {
  expiryAlerts: WasteAlert[];
  lowStockProduct?: Product;
  overstockProduct?: Product;
}): WasteTip[] => {
  const tips: WasteTip[] = [];

  if (args.expiryAlerts.length > 0) {
    tips.push({
      description: "Place expiring products at the front of storage and sales displays so they move before fresher stock.",
      tip: "Rotate soon-to-expire stock first",
    });
  }

  if (args.overstockProduct) {
    tips.push({
      description: `Bundle or discount ${args.overstockProduct.name} to improve sell-through without waiting for demand to catch up.`,
      tip: "Use targeted promotions for slow movers",
    });
  }

  if (args.lowStockProduct) {
    tips.push({
      description: `Set a reorder threshold around ${Math.max(args.lowStockProduct.quantity + 5, 10)} units for ${args.lowStockProduct.name} to avoid emergency replenishment.`,
      tip: "Protect fast-moving low stock items",
    });
  }

  if (tips.length === 0) {
    tips.push({
      description: "Review sell-through weekly and compare it with expiry dates so replenishment stays aligned with actual movement.",
      tip: "Review inventory velocity each week",
    });
  }

  return tips.slice(0, 3);
};
