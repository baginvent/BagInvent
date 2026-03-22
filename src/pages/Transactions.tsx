import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { Download, ArrowUpRight, ArrowDownLeft, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  demoTransactions,
  ensureDemoInventoryAndTransactions,
  getStatusFromQuantity,
  isMissingTransactionsTableError,
} from "@/lib/demoData";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;
type TransactionType = "incoming" | "sale";
type DatePreset = "all" | "custom" | "last7" | "thisMonth" | "today";

const toDateInputValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().split("T")[0];

const getToday = () => toDateInputValue(new Date());

const buildMockTransactions = (userId: string): Transaction[] =>
  demoTransactions.map((transaction, index) => ({
    amount: transaction.amount,
    created_at: `${transaction.date}T00:00:00.000Z`,
    date: transaction.date,
    id: `mock-transaction-${index + 1}`,
    product_id: null,
    product_name: transaction.product_name,
    quantity: transaction.quantity,
    reference: transaction.reference,
    type: transaction.type,
    updated_at: `${transaction.date}T00:00:00.000Z`,
    user_id: userId,
  }));

const defaultForm = {
  amount: "",
  date: getToday(),
  productId: "",
  quantity: "",
  reference: "",
  type: "sale" as TransactionType,
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);

export default function Transactions() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateRange, setDateRange] = useState({ endDate: "", startDate: "" });
  const [form, setForm] = useState(defaultForm);
  const [isSeeding, setIsSeeding] = useState(false);

  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    const seedDemoData = async () => {
      setIsSeeding(true);

      try {
        const result = await ensureDemoInventoryAndTransactions(user.id);

        if (!active) {
          return;
        }

        if (result.seededProducts || result.seededTransactions) {
          toast.success("Mock inventory and transactions added.");
          queryClient.invalidateQueries({ queryKey: ["products", user.id] });
          queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
        }
      } catch (error) {
        if (!active) {
          return;
        }

        toast.error(error instanceof Error ? error.message : "Failed to load transactions");
      } finally {
        if (active) {
          setIsSeeding(false);
        }
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

      if (error) {
        throw error;
      }

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
          return {
            items: buildMockTransactions(user!.id),
            source: "mock" as const,
          };
        }

        throw error;
      }

      return {
        items: data,
        source: "db" as const,
      };
    },
  });

  const transactions = transactionResult?.items ?? [];
  const usingMockTransactions = transactionResult?.source === "mock";

  const productOptions = useMemo(
    () =>
      [...products].sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  const effectiveDateRange = useMemo(() => {
    if (datePreset === "all") {
      return { endDate: "", startDate: "" };
    }

    if (datePreset === "custom") {
      return dateRange;
    }

    const today = new Date();

    if (datePreset === "today") {
      const value = toDateInputValue(today);
      return { endDate: value, startDate: value };
    }

    if (datePreset === "last7") {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);

      return {
        endDate: toDateInputValue(today),
        startDate: toDateInputValue(startDate),
      };
    }

    const monthStartDate = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
      endDate: toDateInputValue(today),
      startDate: toDateInputValue(monthStartDate),
    };
  }, [datePreset, dateRange]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        if (typeFilter !== "all" && transaction.type !== typeFilter) {
          return false;
        }

        if (effectiveDateRange.startDate) {
          const transactionDate = new Date(transaction.date);
          const startDate = new Date(effectiveDateRange.startDate);

          if (transactionDate < startDate) {
            return false;
          }
        }

        if (effectiveDateRange.endDate) {
          const transactionDate = new Date(transaction.date);
          const endDate = new Date(effectiveDateRange.endDate);

          if (transactionDate > endDate) {
            return false;
          }
        }

        return true;
      }),
    [effectiveDateRange.endDate, effectiveDateRange.startDate, transactions, typeFilter],
  );

  const salesTotal = useMemo(
    () =>
      filteredTransactions
        .filter((transaction) => transaction.type === "sale")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [filteredTransactions],
  );

  const incomingTotal = useMemo(
    () =>
      filteredTransactions
        .filter((transaction) => transaction.type === "incoming")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [filteredTransactions],
  );

  const resetForm = () => {
    setDialogOpen(false);
    setForm(defaultForm);
  };

  const addTransactionMutation = useMutation({
    mutationFn: async (payload: typeof defaultForm) => {
      const product = products.find((item) => item.id === payload.productId);

      if (!product) {
        throw new Error("Select a product from inventory");
      }

      const quantity = Number.parseInt(payload.quantity, 10);
      const amount = Number.parseFloat(payload.amount);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Quantity must be greater than 0");
      }

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Amount must be 0 or higher");
      }

      const nextQuantity =
        payload.type === "sale" ? product.quantity - quantity : product.quantity + quantity;

      if (nextQuantity < 0) {
        throw new Error(`Not enough stock for ${product.name}`);
      }

      const reference =
        payload.reference.trim() ||
        `${payload.type.toUpperCase()}-${payload.date.replaceAll("-", "")}-${product.name
          .slice(0, 3)
          .toUpperCase()}`;

      const { data: createdTransaction, error: insertError } = await supabase
        .from("transactions")
        .insert({
          amount,
          date: payload.date,
          product_id: product.id,
          product_name: product.name,
          quantity,
          reference,
          type: payload.type,
          user_id: user!.id,
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      const { error: updateProductError } = await supabase
        .from("products")
        .update({
          quantity: nextQuantity,
          status: getStatusFromQuantity(nextQuantity),
        })
        .eq("id", product.id);

      if (updateProductError) {
        await supabase.from("transactions").delete().eq("id", createdTransaction.id);
        throw updateProductError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
      toast.success("Transaction added and inventory updated");
      resetForm();
    },
    onError: (error: unknown) => {
      if (isMissingTransactionsTableError(error)) {
        toast.error("Transactions table is not ready yet");
        return;
      }

      toast.error(error instanceof Error ? error.message : "Failed to add transaction");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    addTransactionMutation.mutate(form);
  };

  const exportToCSV = () => {
    const headers = ["Date", "Type", "Product", "Quantity", "Amount", "Reference"];
    const csvContent = [
      headers.join(","),
      ...filteredTransactions.map((transaction) =>
        [
          transaction.date,
          transaction.type,
          `"${transaction.product_name}"`,
          transaction.quantity,
          transaction.amount,
          `"${transaction.reference.replace(/\n/g, " ")}"`,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `transactions_${getToday()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    const document = new jsPDF();
    document.setFontSize(16);
    document.text("Transactions Report", 14, 20);

    const rows = filteredTransactions.map((transaction) => [
      transaction.date,
      transaction.type,
      transaction.product_name,
      String(transaction.quantity),
      formatCurrency(transaction.amount),
      transaction.reference,
    ]);

    document.setFontSize(10);
    let y = 32;

    rows.forEach((row) => {
      document.text(row.join(" | "), 14, y);
      y += 8;

      if (y > 270) {
        document.addPage();
        y = 20;
      }
    });

    document.save(
      `transactions_${effectiveDateRange.startDate || "all"}_to_${effectiveDateRange.endDate || "all"}.pdf`,
    );
  };

  const hasLoadError = Boolean(productsError || transactionsError);
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
            <p className="text-muted-foreground mt-1">Track sales and inventory movements</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                if (!open) {
                  resetForm();
                  return;
                }

                setDialogOpen(true);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={hasLoadError || productOptions.length === 0 || usingMockTransactions}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Transaction
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Add Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm({ ...form, date: event.target.value })}
                      className="bg-background border-border text-white [&::-webkit-calendar-picker-indicator]:invert"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={form.type}
                      onValueChange={(value: TransactionType) =>
                        setForm({ ...form, type: value })
                      }
                    >
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="incoming">Incoming</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product">Product</Label>
                    <Select
                      value={form.productId}
                      onValueChange={(value) => setForm({ ...form, productId: value })}
                    >
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select inventory product" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {productOptions.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({product.quantity} in stock)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                      placeholder="0"
                      className="bg-background border-border"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (PHP)</Label>
                    <Input
                      id="amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      placeholder="0.00"
                      className="bg-background border-border"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reference">Reference</Label>
                    <Input
                      id="reference"
                      value={form.reference}
                      onChange={(event) => setForm({ ...form, reference: event.target.value })}
                      placeholder="Optional reference"
                      className="bg-background border-border"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={addTransactionMutation.isPending}
                  >
                    {addTransactionMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Add Transaction
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
              onClick={exportToCSV}
              disabled={filteredTransactions.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
              onClick={exportToPDF}
              disabled={filteredTransactions.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-end">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-48 bg-card border-border">
              <SelectValue placeholder="Transaction Type" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="incoming">Incoming</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col">
              <Label htmlFor="datePreset">Date Range</Label>
              <Select value={datePreset} onValueChange={(value: DatePreset) => setDatePreset(value)}>
                <SelectTrigger id="datePreset" className="w-full md:w-48 bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Transactions</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {datePreset === "custom" && (
              <>
                <div className="flex flex-col">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={dateRange.startDate}
                    onChange={(event) =>
                      setDateRange({ ...dateRange, startDate: event.target.value })
                    }
                    className="bg-background border-border text-white [&::-webkit-calendar-picker-indicator]:invert"
                  />
                </div>
                <div className="flex flex-col">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={dateRange.endDate}
                    onChange={(event) =>
                      setDateRange({ ...dateRange, endDate: event.target.value })
                    }
                    className="bg-background border-border text-white [&::-webkit-calendar-picker-indicator]:invert"
                  />
                </div>
              </>
            )}
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted h-10"
              onClick={() => {
                setDatePreset("all");
                setDateRange({ endDate: "", startDate: "" });
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        {hasLoadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">
            Transactions data could not be loaded. Apply the latest Supabase migration, then
            refresh the app.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Total Sales</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(salesTotal)}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Incoming Stock Value</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(incomingTotal)}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Total Transactions</p>
            <p className="text-2xl font-bold text-foreground">{filteredTransactions.length}</p>
          </div>
        </div>

        <div className="chart-container overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Product</TableHead>
                  <TableHead className="text-muted-foreground">Quantity</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No transactions found yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id} className="border-border hover:bg-muted/30">
                      <TableCell className="text-muted-foreground">{transaction.date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {transaction.type === "sale" ? (
                            <ArrowUpRight className="w-4 h-4 text-success" />
                          ) : (
                            <ArrowDownLeft className="w-4 h-4 text-chart-2" />
                          )}
                          <span className="capitalize text-foreground">{transaction.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {transaction.product_name}
                      </TableCell>
                      <TableCell className="text-foreground">{transaction.quantity}</TableCell>
                      <TableCell className="text-foreground">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {transaction.reference}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
