import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAuthContext } from "@/contexts/AuthContext";
import { isMissingTransactionsTableError } from "@/lib/demoData";
import { buildMockTransactions, formatCurrency } from "@/lib/forecastInsights";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Transaction = Tables<"transactions">;

type TopSellingDatum = {
  name: string;
  revenue: number;
  sales: number;
};

const BAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-5))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
];

const truncateLabel = (value: string) =>
  value.length > 16 ? `${value.slice(0, 16)}...` : value;

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

  const transactions = transactionResult?.items ?? [];
  const usingMockTransactions = transactionResult?.source === "mock";
  const chartData = useMemo(() => buildTopSellingData(transactions), [transactions]);

  return (
    <div className="chart-container animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-foreground">Top Selling Products</h3>
        {usingMockTransactions && (
          <span className="text-xs text-muted-foreground">Using mock transactions</span>
        )}
      </div>

      <div className="h-[300px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-center">
            <p className="text-sm text-foreground">
              Top-selling data could not be loaded from your transactions.
            </p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-border bg-secondary/20 px-4 text-center">
            <p className="text-sm text-muted-foreground">
              Top-selling products will appear here after sale transactions are recorded.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 28, right: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                horizontal={true}
                vertical={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                width={120}
                tickLine={false}
                tickFormatter={truncateLabel}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                itemStyle={{ color: "#fff" }}
                labelStyle={{ color: "#fff" }}
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                formatter={(value: number) => [`${value} units`, "Sold"]}
                labelFormatter={(label, payload) => {
                  const revenue = payload?.[0]?.payload?.revenue;

                  if (typeof revenue !== "number") {
                    return label;
                  }

                  return `${label} • ${formatCurrency(revenue)}`;
                }}
              />
              <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
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

      {!isLoading && !error && chartData.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Ranked by total units sold from recorded sale transactions.
        </p>
      )}
    </div>
  );
}
