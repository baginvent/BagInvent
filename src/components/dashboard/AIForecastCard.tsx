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
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";
import {
  calculateSalesTrends,
  generateForecastData,
  mapTransactionsToForecastData,
} from "@/lib/forecastInsights";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;

type AIForecastCardProps = {
  products: Product[];
  transactions: Transaction[];
};

export function AIForecastCard({ products, transactions }: AIForecastCardProps) {
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = useMemo(() => {
    const nextCategories = new Set<string>(["All"]);

    products.forEach((product) => {
      if (product.category.trim()) {
        nextCategories.add(product.category);
      }
    });

    return Array.from(nextCategories);
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
  const scopedTransactions = useMemo(
    () =>
      selectedCategory === "All"
        ? mappedTransactions
        : mappedTransactions.filter((transaction) => transaction.category === selectedCategory),
    [mappedTransactions, selectedCategory],
  );
  const salesTrends = useMemo(() => calculateSalesTrends(scopedTransactions), [scopedTransactions]);
  const forecastData = useMemo(
    () => generateForecastData(scopedTransactions, salesTrends.growth),
    [scopedTransactions, salesTrends.growth],
  );
  const hasForecastData = forecastData.some(
    (point) => point.predicted > 0 || point.historical > 0,
  );

  return (
    <div className="chart-container flex flex-col">
      <div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-lg font-medium text-[#171717]">30-Day Demand Forecast</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={
                  selectedCategory === category
                    ? "rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-white"
                    : "rounded-full bg-[#efebe6] px-4 py-1.5 text-xs font-medium text-[#171717]"
                }
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {hasForecastData ? (
          <div className="mt-5 rounded-[4px] bg-[#efebe6] p-4">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData}>
                  <CartesianGrid stroke="#d8cfc4" strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#3a3a3a"
                    fontSize={10}
                    interval={2}
                    minTickGap={8}
                    tickLine={false}
                  />
                  <YAxis stroke="#3a3a3a" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#f7f4ef",
                      border: "1px solid #d8cfc4",
                      borderRadius: "4px",
                      color: "#171717",
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "11px",
                      paddingTop: "12px",
                    }}
                  />
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
        ) : (
          <div className="mt-10 space-y-2 text-center">
            <p className="text-[15px] text-[#232323]">30-day forecast will appear here</p>
            <p className="text-sm text-primary">
              Add more sales history to unlock the full demand graph.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Link to="/forecast">
          <Button className="h-9 rounded-[4px] bg-[#6b95df] px-8 text-xs font-medium text-white hover:bg-[#5f88d1]">
            <Brain className="mr-2 h-4 w-4" />
            View Forecast
          </Button>
        </Link>
      </div>
    </div>
  );
}
