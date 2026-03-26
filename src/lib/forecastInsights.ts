import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Clock, Package, TrendingUp } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getMockTransactions } from "@/lib/demoData";

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

export type DemandLevel = "High demand" | "Medium demand" | "Low demand";
export type StockDecision = "Increase stock" | "Maintain stock" | "Reduce stock";
export type ForecastConfidence = "high" | "medium" | "low";

export type ProductDemandForecast = {
  anomaly: string | null;
  category: string;
  confidence: ForecastConfidence;
  currentInventory: number | null;
  demandLevel: DemandLevel;
  forecastDailyAverage: number;
  forecastNextPeriod: number;
  historicalDailyAverage: number;
  inventoryCoverageDays: number | null;
  productId: string;
  productName: string;
  reasoning: string;
  saleDaysObserved: number;
  stockDecision: StockDecision;
  trendPct: number;
};

export type ProductPurchaseRecommendation = {
  category: string;
  confidence: ForecastConfidence;
  coverageDays: number | null;
  currentInventory: number | null;
  forecastNextPeriod: number;
  productName: string;
  reason: string;
  score: number;
};

export type DemandPlanningResult = {
  assumptions: string[];
  buyLess: ProductPurchaseRecommendation[];
  buyMore: ProductPurchaseRecommendation[];
  insights: string[];
  methodology: string[];
  periodDays: number;
  productForecasts: ProductDemandForecast[];
};

export const TODAY = new Date();

export const toDateInputValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().split("T")[0];

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);

const roundTo = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const position = (sortedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  return (
    sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
  );
};

const getDateKey = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split("T")[0];

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getAnalysisAnchorDate = (transactions: ForecastTransaction[]) => {
  const latestTransactionDate = transactions
    .map((transaction) => new Date(`${transaction.date}T00:00:00`))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return latestTransactionDate ?? TODAY;
};

const buildWindowDates = (endDate: Date, windowDays: number) =>
  Array.from({ length: windowDays }, (_, index) => addDays(endDate, -(windowDays - 1 - index)));

const getConfidence = (saleDaysObserved: number, historyDays: number): ForecastConfidence => {
  if (saleDaysObserved >= 5 && historyDays >= 21) {
    return "high";
  }

  if (saleDaysObserved >= 2 && historyDays >= 10) {
    return "medium";
  }

  return "low";
};

const getDemandLevel = ({
  forecast,
  highThreshold,
  lowThreshold,
  saleDaysObserved,
}: {
  forecast: number;
  highThreshold: number;
  lowThreshold: number;
  saleDaysObserved: number;
}): DemandLevel => {
  if (forecast <= 1 && saleDaysObserved <= 1) {
    return "Low demand";
  }

  if (forecast >= highThreshold && forecast > 0) {
    return "High demand";
  }

  if (forecast <= lowThreshold) {
    return "Low demand";
  }

  return "Medium demand";
};

const getStockDecision = (demandLevel: DemandLevel): StockDecision => {
  switch (demandLevel) {
    case "High demand":
      return "Increase stock";
    case "Low demand":
      return "Reduce stock";
    default:
      return "Maintain stock";
  }
};

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

export const buildMockTransactions = (userId: string): Transaction[] => getMockTransactions(userId);

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

export function buildDemandPlanningResult(args: {
  periodDays?: number;
  products: Product[];
  transactions: ForecastTransaction[];
}): DemandPlanningResult {
  const { products, transactions } = args;
  const periodDays = args.periodDays ?? 7;
  const saleTransactions = transactions.filter((transaction) => transaction.type === "sale");
  const anchorDate = getAnalysisAnchorDate(saleTransactions);

  const rawForecasts = products.map((product) => {
    const productSales = saleTransactions.filter(
      (transaction) => transaction.product_name === product.name,
    );

    const earliestSaleDate =
      productSales.length > 0
        ? productSales
            .map((transaction) => new Date(`${transaction.date}T00:00:00`))
            .sort((left, right) => left.getTime() - right.getTime())[0]
        : null;

    const historyDays = earliestSaleDate
      ? clamp(
          Math.round((anchorDate.getTime() - earliestSaleDate.getTime()) / 86400000) + 1,
          7,
          28,
        )
      : 7;

    const windowDates = buildWindowDates(anchorDate, historyDays);
    const dailyDemand = new Map<string, number>();

    productSales.forEach((transaction) => {
      dailyDemand.set(
        transaction.date,
        (dailyDemand.get(transaction.date) ?? 0) + transaction.quantity,
      );
    });

    const datedSeries = windowDates.map((date) => {
      const key = getDateKey(date);

      return {
        date,
        quantity: dailyDemand.get(key) ?? 0,
      };
    });

    const series = datedSeries.map((entry) => entry.quantity);
    const shortWindow = Math.min(7, series.length);
    const recentSeries = series.slice(-shortWindow);
    const priorSeries = series.slice(-shortWindow * 2, -shortWindow);
    const recentAverage = average(recentSeries);
    const historicalAverage = average(series);
    const previousAverage = average(priorSeries);

    const trendPct =
      priorSeries.length > 0 && previousAverage > 0
        ? roundTo(((recentAverage - previousAverage) / previousAverage) * 100, 1)
        : recentAverage > 0
          ? 100
          : 0;

    const trendFactor =
      priorSeries.length > 0 && previousAverage > 0
        ? clamp(1 + (trendPct / 100) * 0.35, 0.75, 1.35)
        : 1;

    const baseDailyForecast =
      recentAverage === 0 && historicalAverage === 0
        ? 0
        : recentAverage * 0.65 + historicalAverage * 0.35;

    const weekdayMultipliers =
      historicalAverage > 0 && datedSeries.length >= 14
        ? new Map(
            Array.from({ length: 7 }, (_, weekday) => {
              const weekdayValues = datedSeries
                .filter((entry) => entry.date.getDay() === weekday)
                .map((entry) => entry.quantity);
              const weekdayAverage = average(weekdayValues);

              return [weekday, clamp(weekdayAverage / historicalAverage || 1, 0.7, 1.3)] as const;
            }),
          )
        : new Map<number, number>();

    const forecastDays = Array.from({ length: periodDays }, (_, index) => {
      const forecastDate = addDays(anchorDate, index + 1);
      const weekdayMultiplier = weekdayMultipliers.get(forecastDate.getDay()) ?? 1;

      return Math.max(0, baseDailyForecast * trendFactor * weekdayMultiplier);
    });

    const forecastNextPeriod = roundTo(
      forecastDays.reduce((sum, value) => sum + value, 0),
      1,
    );
    const forecastDailyAverage =
      periodDays > 0 ? roundTo(forecastNextPeriod / periodDays, 2) : 0;
    const inventoryCoverageDays =
      forecastDailyAverage > 0 ? roundTo(product.quantity / forecastDailyAverage, 1) : null;
    const saleDaysObserved = productSales.length;
    const maxDailyDemand = Math.max(...series, 0);
    const anomaly =
      maxDailyDemand >= Math.max(3, historicalAverage * 2.5)
        ? `A one-day spike of ${maxDailyDemand} units suggests promo or event-driven demand.`
        : null;

    const confidence = getConfidence(saleDaysObserved, historyDays);
    const reasoningParts: string[] = [];

    if (saleDaysObserved === 0) {
      reasoningParts.push(
        "No direct sales history is available, so the forecast stays conservative until more data is captured.",
      );
    } else {
      reasoningParts.push(
        `Weighted moving average uses ${roundTo(recentAverage, 1)} recent units/day and ${roundTo(
          historicalAverage,
          1,
        )} baseline units/day.`,
      );

      if (Math.abs(trendPct) >= 10) {
        reasoningParts.push(
          `Recent demand is ${trendPct >= 0 ? "up" : "down"} ${Math.abs(trendPct)}% versus the prior comparable window.`,
        );
      }

      if (inventoryCoverageDays !== null) {
        reasoningParts.push(
          `Current stock covers about ${inventoryCoverageDays} days at the projected run rate.`,
        );
      }
    }

    if (anomaly) {
      reasoningParts.push(anomaly);
    }

    return {
      anomaly,
      category: product.category,
      confidence,
      currentInventory: product.quantity,
      forecastDailyAverage,
      forecastNextPeriod,
      historicalDailyAverage: roundTo(historicalAverage, 2),
      inventoryCoverageDays,
      productId: product.id,
      productName: product.name,
      reasoning: reasoningParts.join(" "),
      saleDaysObserved,
      trendPct,
    };
  });

  const forecastValues = rawForecasts.map((item) => item.forecastNextPeriod);
  const highThreshold = percentile(forecastValues, 0.67);
  const lowThreshold = percentile(forecastValues, 0.33);

  const productForecasts: ProductDemandForecast[] = rawForecasts
    .map((forecast) => {
      const demandLevel = getDemandLevel({
        forecast: forecast.forecastNextPeriod,
        highThreshold,
        lowThreshold,
        saleDaysObserved: forecast.saleDaysObserved,
      });

      return {
        ...forecast,
        demandLevel,
        stockDecision: getStockDecision(demandLevel),
      };
    })
    .sort(
      (left, right) =>
        right.forecastNextPeriod - left.forecastNextPeriod ||
        right.trendPct - left.trendPct ||
        left.productName.localeCompare(right.productName),
    );

  const buyMore = productForecasts
    .filter(
      (forecast) =>
        forecast.stockDecision === "Increase stock" ||
        (forecast.inventoryCoverageDays !== null && forecast.inventoryCoverageDays <= periodDays),
    )
    .map((forecast) => {
      const shortagePressure =
        forecast.inventoryCoverageDays === null
          ? 0
          : Math.max(0, periodDays * 1.5 - forecast.inventoryCoverageDays);
      const score = roundTo(
        forecast.forecastNextPeriod * 1.5 +
          shortagePressure * 4 +
          Math.max(0, forecast.trendPct),
        1,
      );

      return {
        category: forecast.category,
        confidence: forecast.confidence,
        coverageDays: forecast.inventoryCoverageDays,
        currentInventory: forecast.currentInventory,
        forecastNextPeriod: forecast.forecastNextPeriod,
        productName: forecast.productName,
        reason: `${forecast.productName} is projected at ${forecast.forecastNextPeriod} units for the next ${periodDays} days${forecast.inventoryCoverageDays !== null ? ` with only ${forecast.inventoryCoverageDays} days of stock coverage` : ""}. ${forecast.reasoning}`,
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const buyLess = productForecasts
    .filter(
      (forecast) =>
        forecast.stockDecision === "Reduce stock" ||
        (forecast.inventoryCoverageDays !== null && forecast.inventoryCoverageDays >= periodDays * 4),
    )
    .map((forecast) => {
      const excessCoverage =
        forecast.inventoryCoverageDays === null
          ? 0
          : Math.max(0, forecast.inventoryCoverageDays - periodDays * 2);
      const score = roundTo(
        (highThreshold - forecast.forecastNextPeriod + Math.max(highThreshold, 1)) +
          excessCoverage * 3 +
          Math.max(0, -forecast.trendPct),
        1,
      );

      return {
        category: forecast.category,
        confidence: forecast.confidence,
        coverageDays: forecast.inventoryCoverageDays,
        currentInventory: forecast.currentInventory,
        forecastNextPeriod: forecast.forecastNextPeriod,
        productName: forecast.productName,
        reason: `${forecast.productName} is only projected at ${forecast.forecastNextPeriod} units for the next ${periodDays} days${forecast.inventoryCoverageDays !== null ? ` while current stock already covers ${forecast.inventoryCoverageDays} days` : ""}. ${forecast.reasoning}`,
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const categoryForecasts = new Map<string, number>();

  productForecasts.forEach((forecast) => {
    categoryForecasts.set(
      forecast.category,
      (categoryForecasts.get(forecast.category) ?? 0) + forecast.forecastNextPeriod,
    );
  });

  const topCategory =
    [...categoryForecasts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const strongestRisers = productForecasts.filter((forecast) => forecast.trendPct >= 15).length;
  const weakestMovers = productForecasts.filter((forecast) => forecast.trendPct <= -15).length;
  const lowConfidenceCount = productForecasts.filter(
    (forecast) => forecast.confidence === "low",
  ).length;
  const anomalyProducts = productForecasts.filter((forecast) => forecast.anomaly).map(
    (forecast) => forecast.productName,
  );

  const insights: string[] = [];

  if (topCategory) {
    insights.push(
      `${topCategory[0]} contributes the largest projected demand with ${roundTo(
        topCategory[1],
        1,
      )} forecast units in the next ${periodDays} days.`,
    );
  }

  if (strongestRisers > 0) {
    insights.push(
      `${strongestRisers} product${strongestRisers === 1 ? "" : "s"} show accelerating demand with at least 15% recent growth.`,
    );
  }

  if (weakestMovers > 0) {
    insights.push(
      `${weakestMovers} product${weakestMovers === 1 ? "" : "s"} are slowing by at least 15%, which points to excess stock risk.`,
    );
  }

  if (anomalyProducts.length > 0) {
    insights.push(
      `Potential anomalies were detected for ${anomalyProducts.slice(0, 3).join(", ")}${anomalyProducts.length > 3 ? ", and others" : ""}.`,
    );
  }

  if (lowConfidenceCount > 0) {
    insights.push(
      `${lowConfidenceCount} product${lowConfidenceCount === 1 ? "" : "s"} have limited sales history, so their forecasts should be treated as directional.`,
    );
  }

  if (insights.length === 0) {
    insights.push(
      "Demand is relatively stable across the current assortment, with no major seasonal or anomaly signals in the available history.",
    );
  }

  return {
    assumptions: [
      `Next period is assumed to be the next ${periodDays} days because no replenishment cycle was provided.`,
      "The latest sales date in the dataset is used as the forecast anchor when live dates extend beyond the recorded history.",
      "Products with little or no sales history keep low-confidence forecasts and should be reviewed manually.",
    ],
    buyLess,
    buyMore,
    insights,
    methodology: [
      "Demand is modeled with a weighted moving average that blends recent daily sales with the broader historical baseline.",
      "A damped trend factor adjusts the base forecast using the difference between the latest window and the previous comparable window.",
      "Weekday seasonality is applied only when enough history exists to avoid overfitting sparse data.",
    ],
    periodDays,
    productForecasts,
  };
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
