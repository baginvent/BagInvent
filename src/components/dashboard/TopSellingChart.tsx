import { useEffect, useMemo, useState } from "react";
import {
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
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/contexts/AuthContext";
import { isMissingTransactionsTableError } from "@/lib/demoData";
import { buildMockTransactions, formatCurrency } from "@/lib/forecastInsights";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type Transaction = Tables<"transactions">;
type DateFilterType = "all" | "week" | "month" | "custom";

type TopSellingDatum = {
  name: string;
  revenue: number;
  sales: number;
};

const EMPTY_TRANSACTIONS: Transaction[] = [];
const BAR_COLORS = ["#fbbf24", "#fb7185", "#a78bfa", "#38bdf8", "#34d399"];
const DATE_FILTER_OPTIONS: Array<{ label: string; value: DateFilterType }> = [
  { label: "All", value: "all" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Custom Date Range", value: "custom" },
];

const wrapLabel = (value: string, maxCharactersPerLine = 14) => {
  const words = value.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxCharactersPerLine || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

type ProductAxisTickProps = {
  payload?: {
    value: string;
  };
  x?: number;
  y?: number;
};

const ProductAxisTick = ({ payload, x = 0, y = 0 }: ProductAxisTickProps) => {
  if (!payload?.value) {
    return null;
  }

  const lines = wrapLabel(payload.value);

  return (
    <g transform={`translate(${x},${y})`}>
      <text fill="#e0e7ff" fontSize={10} textAnchor="middle">
        {lines.map((line, index) => (
          <tspan key={`${payload.value}-${index}`} x={0} dy={index === 0 ? 16 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

const toDateInputValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().split("T")[0];

const getToday = () => toDateInputValue(new Date());

const formatDateLabel = (value: string) => format(parseISO(value), "MMM d, yyyy");

const getTransactionDateBounds = (transactions: Transaction[]) => {
  if (transactions.length === 0) {
    const today = getToday();
    return { earliestDate: today, latestDate: today };
  }

  const sortedDates = [...transactions.map((transaction) => transaction.date)].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    earliestDate: sortedDates[0],
    latestDate: sortedDates[sortedDates.length - 1],
  };
};

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
        label: `This week: ${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`,
      };
    }
    case "month": {
      const fromDate = toDateInputValue(startOfMonth(today));
      const toDate = toDateInputValue(endOfMonth(today));

      return {
        fromDate,
        toDate,
        label: `This month: ${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`,
      };
    }
    case "custom": {
      const { fromDate, toDate } = getCustomDateRange(customFromDate, customToDate);

      return {
        fromDate,
        toDate,
        label: `Custom range: ${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`,
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

const isTransactionInDateRange = (transactionDate: string, fromDate: string, toDate: string) => {
  const parsedTransactionDate = parseISO(transactionDate);
  const parsedFromDate = parseISO(fromDate);
  const parsedToDate = parseISO(toDate);

  return (
    (isAfter(parsedTransactionDate, parsedFromDate) || isEqual(parsedTransactionDate, parsedFromDate)) &&
    (isBefore(parsedTransactionDate, parsedToDate) || isEqual(parsedTransactionDate, parsedToDate))
  );
};

const buildTopSellingData = (transactions: Transaction[]): TopSellingDatum[] => {
  const totals = new Map<string, { revenue: number; sales: number }>();

  transactions
    .filter((transaction) => transaction.type === "sale")
    .forEach((transaction) => {
      const currentValue = totals.get(transaction.product_name) ?? { revenue: 0, sales: 0 };

      totals.set(transaction.product_name, {
        revenue: currentValue.revenue + transaction.amount,
        sales: currentValue.sales + transaction.quantity,
      });
    });

  return [...totals.entries()]
    .map(([name, totalsByProduct]) => ({
      name,
      revenue: totalsByProduct.revenue,
      sales: totalsByProduct.sales,
    }))
    .sort(
      (left, right) =>
        right.sales - left.sales ||
        right.revenue - left.revenue ||
        left.name.localeCompare(right.name),
    )
    .slice(0, 5);
};

export function TopSellingChart() {
  const { user } = useAuthContext();
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>("all");
  const [customFromDate, setCustomFromDate] = useState(getToday);
  const [customToDate, setCustomToDate] = useState(getToday);
  const [hasInitializedCustomRange, setHasInitializedCustomRange] = useState(false);

  const {
    data: transactionResult,
    error,
    isLoading,
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
  const activeDateRange =
    dateFilterType === "all" ? null : getDateRange(dateFilterType, customFromDate, customToDate);
  const filteredTransactions = useMemo(() => {
    if (!activeDateRange) {
      return transactions;
    }

    return transactions.filter((transaction) =>
      isTransactionInDateRange(transaction.date, activeDateRange.fromDate, activeDateRange.toDate),
    );
  }, [activeDateRange, transactions]);
  const chartData = useMemo(() => buildTopSellingData(filteredTransactions), [filteredTransactions]);

  useEffect(() => {
    if (dateFilterType !== "custom" || hasInitializedCustomRange || transactions.length === 0) {
      return;
    }

    const { earliestDate, latestDate } = getTransactionDateBounds(transactions);
    setCustomFromDate(earliestDate);
    setCustomToDate(latestDate);
    setHasInitializedCustomRange(true);
  }, [dateFilterType, hasInitializedCustomRange, transactions]);

  const handleDateFilterChange = (nextFilter: DateFilterType) => {
    if (nextFilter === "custom" && !hasInitializedCustomRange && transactions.length > 0) {
      const { earliestDate, latestDate } = getTransactionDateBounds(transactions);
      setCustomFromDate(earliestDate);
      setCustomToDate(latestDate);
      setHasInitializedCustomRange(true);
    }

    setDateFilterType(nextFilter);
  };

  const handleCustomFromDateChange = (value: string) => {
    setCustomFromDate(value);
    setHasInitializedCustomRange(true);

    if (value && customToDate && value.localeCompare(customToDate) > 0) {
      setCustomToDate(value);
    }
  };

  const handleCustomToDateChange = (value: string) => {
    setCustomToDate(value);
    setHasInitializedCustomRange(true);

    if (value && customFromDate && value.localeCompare(customFromDate) < 0) {
      setCustomFromDate(value);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/70 to-violet-50 p-5 shadow-sm">
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-sm shadow-rose-200">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Top selling products</h3>
              <p className="mt-0.5 text-xs text-slate-500">Your best performers by units sold</p>
            {activeDateRange ? (
              <p className="mt-1 text-xs font-medium text-indigo-600">{activeDateRange.label}</p>
            ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {DATE_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleDateFilterChange(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-semibold transition-all",
                  dateFilterType === option.value
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "border-indigo-100 bg-white/80 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {dateFilterType === "custom" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:ml-auto xl:max-w-[360px]">
            <Input
              aria-label="Custom range start date"
              type="date"
              value={customFromDate}
              onChange={(event) => handleCustomFromDateChange(event.target.value)}
              className="h-9 rounded-lg border-indigo-100 bg-white/80 text-xs text-slate-700 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
            />
            <Input
              aria-label="Custom range end date"
              type="date"
              value={customToDate}
              onChange={(event) => handleCustomToDateChange(event.target.value)}
              className="h-9 rounded-lg border-indigo-100 bg-white/80 text-xs text-slate-700 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
            />
          </div>
        ) : null}
      </div>

      <div className="relative h-[260px] overflow-hidden rounded-xl bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 px-3 py-2 shadow-inner">
        <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-fuchsia-300/25 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-cyan-300/20 blur-2xl" />
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white">
            Top-selling data could not be loaded from your transactions.
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white">
            {activeDateRange
              ? "No top-selling products were recorded for the selected date range."
              : "Top-selling products will appear here after sale transactions are recorded."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ bottom: 24, left: 0, right: 8, top: 10 }}>
              <CartesianGrid stroke="rgba(224,231,255,0.22)" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="name"
                height={72}
                interval={0}
                stroke="rgba(224,231,255,0.55)"
                tick={<ProductAxisTick />}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                stroke="rgba(224,231,255,0.55)"
                tick={{ fill: "#e0e7ff", fontSize: 10 }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.12)" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #c7d2fe",
                  borderRadius: "10px",
                  color: "#312e81",
                  boxShadow: "0 10px 25px rgba(49, 46, 129, 0.2)",
                }}
                formatter={(value: number) => [`${value} units`, "Sold"]}
                labelFormatter={(label, payload) => {
                  const revenue = payload?.[0]?.payload?.revenue;
                  return typeof revenue === "number" ? `${label} - ${formatCurrency(revenue)}` : label;
                }}
              />
              <Bar dataKey="sales" radius={[8, 8, 2, 2]} maxBarSize={46}>
                <LabelList dataKey="sales" position="top" fill="#ffffff" fontSize={11} fontWeight={700} />
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={BAR_COLORS[index] ?? BAR_COLORS[BAR_COLORS.length - 1]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
