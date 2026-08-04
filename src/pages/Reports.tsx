import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
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
import { Download, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
type DateFilterType = "all" | "week" | "month" | "custom";

const EMPTY_TRANSACTIONS: Transaction[] = [];
const DATE_FILTER_OPTIONS: Array<{ label: string; value: DateFilterType }> = [
  { label: "All", value: "all" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Custom Date Range", value: "custom" },
];

const getDateKey = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split("T")[0];

const toDateInputValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().split("T")[0];

const getToday = () => toDateInputValue(new Date());

const getCustomDateRange = (customFromDate: string, customToDate: string) => {
  const fallbackDate = customFromDate || customToDate || getToday();
  const normalizedFromDate = customFromDate || fallbackDate;
  const normalizedToDate = customToDate || fallbackDate;

  if (normalizedFromDate.localeCompare(normalizedToDate) <= 0) {
    return {
      fromDate: normalizedFromDate,
      toDate: normalizedToDate,
    };
  }

  return {
    fromDate: normalizedToDate,
    toDate: normalizedFromDate,
  };
};

const getDateRange = (filterType: DateFilterType, customFromDate: string, customToDate: string) => {
  const today = new Date();

  switch (filterType) {
    case "week": {
      const fromDate = toDateInputValue(startOfWeek(today));
      const toDate = toDateInputValue(endOfWeek(today));

      return {
        fromDate,
        toDate,
        label: `This week: ${format(parseISO(fromDate), "MMM d")} - ${format(parseISO(toDate), "MMM d")}`,
      };
    }
    case "month": {
      const fromDate = toDateInputValue(startOfMonth(today));
      const toDate = toDateInputValue(endOfMonth(today));

      return {
        fromDate,
        toDate,
        label: `This month: ${format(parseISO(fromDate), "MMM d")} - ${format(parseISO(toDate), "MMM d, yyyy")}`,
      };
    }
    case "custom": {
      const { fromDate, toDate } = getCustomDateRange(customFromDate, customToDate);

      return {
        fromDate,
        toDate,
        label: `Custom range: ${format(parseISO(fromDate), "MMM d, yyyy")} - ${format(parseISO(toDate), "MMM d, yyyy")}`,
      };
    }
    default: {
      return {
        fromDate: "",
        toDate: "",
        label: "All dates",
      };
    }
  }
};

const isDateInRange = (value: string, fromDate: string, toDate: string) => {
  const targetDate = parseISO(value);
  const startDate = parseISO(fromDate);
  const endDate = parseISO(toDate);

  return (
    (isAfter(targetDate, startDate) || isEqual(targetDate, startDate)) &&
    (isBefore(targetDate, endDate) || isEqual(targetDate, endDate))
  );
};

const buildDateSeries = (fromDate: string, toDate: string) => {
  const dates: Date[] = [];
  let currentDate = parseISO(fromDate);
  const endDate = parseISO(toDate);

  while (currentDate.getTime() <= endDate.getTime()) {
    dates.push(currentDate);
    currentDate = addDays(currentDate, 1);
  }

  return dates;
};

const formatRangeLabel = (date: Date, totalDays: number) =>
  totalDays <= 7
    ? date.toLocaleDateString("en-US", { weekday: "short" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Reports() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>("all");
  const [customFromDate, setCustomFromDate] = useState(getToday);
  const [customToDate, setCustomToDate] = useState(getToday);
  const salesPanelRef = useRef<HTMLDivElement | null>(null);
  const movementPanelRef = useRef<HTMLDivElement | null>(null);
  const agingPanelRef = useRef<HTMLDivElement | null>(null);
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

  const transactions = transactionResult?.items ?? EMPTY_TRANSACTIONS;
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;
  const hasLoadError = Boolean(productsError || transactionsError);
  const activeDateRange =
    dateFilterType === "all" ? null : getDateRange(dateFilterType, customFromDate, customToDate);

  const filteredTransactions = useMemo(() => {
    if (!activeDateRange) {
      return transactions;
    }

    return transactions.filter((transaction) =>
      isDateInRange(transaction.date, activeDateRange.fromDate, activeDateRange.toDate),
    );
  }, [activeDateRange, transactions]);

  const filteredProducts = useMemo(() => {
    if (!activeDateRange) {
      return products;
    }

    const touchedProductIds = new Set(
      filteredTransactions
        .map((transaction) => transaction.product_id)
        .filter((productId): productId is string => Boolean(productId)),
    );
    const touchedProductNames = new Set(
      filteredTransactions.map((transaction) => transaction.product_name.trim().toLowerCase()),
    );

    return products.filter((product) => {
      const createdDate = toDateInputValue(new Date(product.created_at));

      return (
        touchedProductIds.has(product.id) ||
        touchedProductNames.has(product.name.trim().toLowerCase()) ||
        isDateInRange(createdDate, activeDateRange.fromDate, activeDateRange.toDate)
      );
    });
  }, [activeDateRange, filteredTransactions, products]);

  const salesData = useMemo(() => {
    const dailyTotals = new Map<string, number>();

    filteredTransactions
      .filter((transaction) => transaction.type === "sale")
      .forEach((transaction) => {
        dailyTotals.set(transaction.date, (dailyTotals.get(transaction.date) ?? 0) + transaction.amount);
      });

    if (!activeDateRange) {
      const today = new Date();

      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (6 - index));
        const key = getDateKey(date);

        return {
          label: date.toLocaleDateString("en-US", { weekday: "short" }),
          sales: dailyTotals.get(key) ?? 0,
        };
      });
    }

    const rangeDates = buildDateSeries(activeDateRange.fromDate, activeDateRange.toDate);

    return rangeDates.map((date) => {
      const key = getDateKey(date);
      return {
        label: formatRangeLabel(date, rangeDates.length),
        sales: dailyTotals.get(key) ?? 0,
      };
    });
  }, [activeDateRange, filteredTransactions]);

  const inventoryMovement = useMemo(() => {
    if (!activeDateRange) {
      const now = new Date();
      const monthlyTotals = new Map<string, { incoming: number; outgoing: number }>();

      filteredTransactions.forEach((transaction) => {
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
          label: date.toLocaleDateString("en-US", { month: "short" }),
          outgoing: totals.outgoing,
        };
      });
    }

    const dailyTotals = new Map<string, { incoming: number; outgoing: number }>();
    const rangeDates = buildDateSeries(activeDateRange.fromDate, activeDateRange.toDate);

    filteredTransactions.forEach((transaction) => {
      const currentValue = dailyTotals.get(transaction.date) ?? { incoming: 0, outgoing: 0 };

      dailyTotals.set(transaction.date, {
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

    return rangeDates.map((date) => {
      const key = getDateKey(date);
      const totals = dailyTotals.get(key) ?? { incoming: 0, outgoing: 0 };

      return {
        incoming: totals.incoming,
        label: formatRangeLabel(date, rangeDates.length),
        outgoing: totals.outgoing,
      };
    });
  }, [activeDateRange, filteredTransactions]);

  const stockAging = useMemo(() => {
    const totals = {
      attention: 0,
      critical: 0,
      healthy: 0,
      noExpiry: 0,
    };

    filteredProducts.forEach((product) => {
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
      { color: "#d95454", name: "Critical (0-7 days)", units: totals.critical, value: toPercent(totals.critical) },
      { color: "#e2a31b", name: "Attention (8-30 days)", units: totals.attention, value: toPercent(totals.attention) },
      { color: "#46a36b", name: "Healthy (31+ days)", units: totals.healthy, value: toPercent(totals.healthy) },
      { color: "#4d78cc", name: "No Expiry", units: totals.noExpiry, value: toPercent(totals.noExpiry) },
    ].filter((item) => item.units > 0);
  }, [filteredProducts]);

  const inventorySummary = useMemo(() => {
    const salesByName = new Map<string, number>();
    const priceByName = new Map<string, number>();
    [...transactions]
      .sort((left, right) => right.date.localeCompare(left.date) || right.created_at.localeCompare(left.created_at))
      .forEach((transaction) => {
        if (transaction.type === "sale") {
          salesByName.set(transaction.product_name, (salesByName.get(transaction.product_name) ?? 0) + transaction.quantity);
        }
        if (!priceByName.has(transaction.product_name) && transaction.quantity > 0) {
          priceByName.set(transaction.product_name, transaction.amount);
        }
      });

    const totalSalesUnits = [...salesByName.values()].reduce((sum, quantity) => sum + quantity, 0);
    const currentUnits = filteredProducts.reduce((sum, product) => sum + product.quantity, 0);
    const turnover = currentUnits === 0 ? 0 : totalSalesUnits / currentUnits;
    const slowMoving = filteredProducts
      .map((product) => ({ product, sold: salesByName.get(product.name) ?? 0 }))
      .filter((item) => item.sold <= 2)
      .sort((left, right) => left.sold - right.sold || right.product.quantity - left.product.quantity)
      .slice(0, 5);
    const valuation = filteredProducts.reduce(
      (sum, product) => sum + product.quantity * (priceByName.get(product.name) ?? 0),
      0,
    );

    return { currentUnits, slowMoving, totalSalesUnits, turnover, valuation };
  }, [filteredProducts, transactions]);

  const handleExportPDF = async () => {
    const reportPanels = [
      { element: salesPanelRef.current, title: activeDateRange ? "Sales Trend" : "Weekly Sales" },
      { element: movementPanelRef.current, title: "Inventory Movement" },
      { element: agingPanelRef.current, title: "Stock Aging Distribution" },
    ].filter((panel): panel is { element: HTMLDivElement; title: string } => Boolean(panel.element));

    if (reportPanels.length === 0) {
      toast.error("Nothing is ready to export yet.");
      return;
    }

    const document = new jsPDF({ format: "a4", unit: "mm" });
    const pageHeight = document.internal.pageSize.getHeight();
    const pageWidth = document.internal.pageSize.getWidth();
    const horizontalMargin = 12;
    const maxImageWidth = pageWidth - horizontalMargin * 2;
    const filterLabel = activeDateRange?.label ?? "All dates";
    let currentY = 18;

    document.setFontSize(18);
    document.text("Reports", horizontalMargin, currentY);
    currentY += 7;

    document.setFontSize(10);
    document.setTextColor(95, 90, 86);
    document.text(`Date filter: ${filterLabel}`, horizontalMargin, currentY);
    currentY += 8;

    for (const panel of reportPanels) {
      const canvas = await html2canvas(panel.element, {
        backgroundColor: "#fbfaf7",
        scale: 2,
      });

      const imageWidth = maxImageWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      if (currentY + imageHeight + 12 > pageHeight) {
        document.addPage();
        currentY = 18;
      }

      document.setFontSize(12);
      document.setTextColor(23, 23, 23);
      document.text(panel.title, horizontalMargin, currentY);
      currentY += 4;

      document.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        horizontalMargin,
        currentY,
        imageWidth,
        imageHeight,
      );
      currentY += imageHeight + 10;
    }

    const fileDateFragment = (activeDateRange?.toDate ?? getToday()).replaceAll("-", "");
    document.save(`bag-invent-reports-${fileDateFragment}.pdf`);
  };

  return (
    <DashboardLayout pageLabel="Reports">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[2rem] font-medium text-[#171717]">Reports</h1>
              {activeDateRange ? (
                <p className="mt-2 text-sm text-[#5f5a56]">{activeDateRange.label}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <Button
                type="button"
                onClick={handleExportPDF}
                disabled={isLoading || hasLoadError}
                className="h-10 rounded-[4px] bg-muted px-4 text-sm font-medium text-muted-foreground hover:bg-muted/90"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </Button>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                {DATE_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDateFilterType(option.value)}
                    className={
                      dateFilterType === option.value
                        ? "rounded-[4px] border border-primary bg-primary/10 px-3 py-2 text-xs font-medium text-foreground"
                        : "rounded-[4px] border border-border bg-popover px-3 py-2 text-xs font-medium text-foreground hover:bg-popover/90"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {dateFilterType === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:max-w-[360px] xl:ml-auto">
              <Input
                aria-label="Custom report start date"
                type="date"
                value={customFromDate}
                onChange={(event) => setCustomFromDate(event.target.value)}
                className="h-10 rounded-[4px] border-border bg-popover text-sm text-foreground focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
              />
              <Input
                aria-label="Custom report end date"
                type="date"
                value={customToDate}
                onChange={(event) => setCustomToDate(event.target.value)}
                className="h-10 rounded-[4px] border-border bg-popover text-sm text-foreground focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
              />
            </div>
          ) : null}
        </div>

        {hasLoadError ? (
          <div className="workspace-card-soft text-sm text-primary">
            Report data could not be loaded. Refresh after your inventory and transactions tables
            are available.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div ref={salesPanelRef} className="workspace-panel">
            <h2 className="mb-4 text-lg font-medium text-[#171717]">
              {activeDateRange ? "Sales Trend" : "Weekly Sales"}
            </h2>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData}>
                    <CartesianGrid stroke="#bdb4aa" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#3a3a3a"
                      fontSize={11}
                      tickLine={false}
                      minTickGap={8}
                    />
                    <YAxis stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--foreground)",
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Sales"]}
                    />
                    <Bar dataKey="sales">
                      {salesData.map((_, index) => (
                          <Cell key={index} fill={index === salesData.length - 1 ? "#d95454" : "#4d78cc"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div ref={movementPanelRef} className="workspace-panel">
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
                    <XAxis
                      dataKey="label"
                      stroke="#3a3a3a"
                      fontSize={11}
                      tickLine={false}
                      minTickGap={8}
                    />
                    <YAxis stroke="#3a3a3a" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--foreground)",
                      }}
                      formatter={(value: number) => [`${value} units`, "Movement"]}
                    />
                    <Line type="monotone" dataKey="incoming" name="Incoming" stroke="#46a36b" strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="outgoing" name="Outgoing" stroke="#4d78cc" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div ref={agingPanelRef} className="workspace-panel xl:col-span-2">
            <h2 className="mb-4 text-lg font-medium text-[#171717]">Stock Aging Distribution</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
              </div>
            ) : stockAging.length === 0 ? (
              <div className="workspace-card-soft text-sm text-[#666]">
                {activeDateRange
                  ? "No stock aging data matches the selected date range."
                  : "Stock aging will appear here once inventory quantities and expiry dates are available."}
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
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          color: "var(--foreground)",
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
                    <div key={item.name} className="flex items-center gap-3 rounded-[4px] bg-popover px-4 py-3">
                      <div className="h-4 w-4 rounded" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-foreground">{item.name}</span>
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

        <div className="workspace-panel">
          <div className="mb-5">
            <h2 className="text-lg font-medium text-[#171717]">Inventory summary</h2>
            <p className="mt-1 text-sm text-[#666]">A concise view of turnover, slow-moving inventory, and current product valuation.</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#666]" /></div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[4px] bg-[#efebe6] p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#666]">Inventory turnover rate</p><p className="mt-2 text-2xl font-medium text-[#171717]">{inventorySummary.turnover.toFixed(2)}×</p><p className="mt-1 text-xs text-[#666]">{inventorySummary.totalSalesUnits} sold / {inventorySummary.currentUnits} units on hand</p></div>
                <div className="rounded-[4px] bg-[#efebe6] p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#666]">Slow-moving items</p><p className="mt-2 text-2xl font-medium text-[#171717]">{inventorySummary.slowMoving.length}</p><p className="mt-1 text-xs text-[#666]">Products with two or fewer recorded sales</p></div>
                <div className="rounded-[4px] bg-[#efebe6] p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#666]">Product valuation</p><p className="mt-2 text-2xl font-medium text-[#171717]">{formatCurrency(inventorySummary.valuation)}</p><p className="mt-1 text-xs text-[#666]">Based on latest recorded unit price</p></div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b border-white/40 text-left"><th className="px-3 py-3 text-xs uppercase tracking-[0.12em] text-[#666]">Slow-moving product</th><th className="px-3 py-3 text-xs uppercase tracking-[0.12em] text-[#666]">Category</th><th className="px-3 py-3 text-xs uppercase tracking-[0.12em] text-[#666]">Sold</th><th className="px-3 py-3 text-xs uppercase tracking-[0.12em] text-[#666]">On hand</th></tr></thead><tbody>{inventorySummary.slowMoving.length === 0 ? <tr><td colSpan={4} className="px-3 py-5 text-[#666]">No slow-moving items in this reporting range.</td></tr> : inventorySummary.slowMoving.map(({ product, sold }) => <tr key={product.id} className="border-b border-white/20"><td className="px-3 py-3 font-medium text-[#171717]">{product.name}</td><td className="px-3 py-3 text-[#555]">{product.category}</td><td className="px-3 py-3 text-[#555]">{sold}</td><td className="px-3 py-3 text-[#555]">{product.quantity}</td></tr>)}</tbody></table>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
