import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

const BAR_COLORS = ["#2d63c8", "#356cd4", "#4275db", "#4f7ce0", "#5d85e5"];

const truncateLabel = (value: string) =>
  value.length > 12 ? `${value.slice(0, 12)}...` : value;

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
    <div className="chart-container">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-[#171717]">Top selling Products</h3>
        {usingMockTransactions ? (
          <span className="text-xs text-[#666]">Using seeded data</span>
        ) : null}
      </div>

      <div className="h-[260px] rounded-[4px] bg-[#8f8f8f] px-3 py-2">
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
            Top-selling products will appear here after sale transactions are recorded.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ bottom: 24, left: 0, right: 8, top: 10 }}>
              <CartesianGrid stroke="#bcbcbc" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="name"
                angle={-28}
                dy={18}
                height={52}
                interval={0}
                stroke="#272727"
                tick={{ fill: "#272727", fontSize: 10 }}
                tickFormatter={truncateLabel}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                stroke="#272727"
                tick={{ fill: "#272727", fontSize: 10 }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.18)" }}
                contentStyle={{
                  backgroundColor: "#f7f4ef",
                  border: "1px solid #d8cfc4",
                  borderRadius: "4px",
                  color: "#171717",
                }}
                formatter={(value: number) => [`${value} units`, "Sold"]}
                labelFormatter={(label, payload) => {
                  const revenue = payload?.[0]?.payload?.revenue;
                  return typeof revenue === "number" ? `${label} - ${formatCurrency(revenue)}` : label;
                }}
              />
              <Bar dataKey="sales" radius={[0, 0, 0, 0]}>
                <LabelList dataKey="sales" position="top" fill="#f8f8f8" fontSize={10} />
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
