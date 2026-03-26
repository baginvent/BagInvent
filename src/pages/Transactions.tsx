import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { ArrowDownLeft, ArrowUpRight, Download, Loader2, Plus, Calendar } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isAfter, 
  isBefore, 
  isEqual, 
  parseISO,
  format
} from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  addMockTransaction,
  ensureDemoInventoryAndTransactions,
  getMockTransactions,
  getStatusFromQuantity,
  isMissingTransactionsTableError,
} from "@/lib/demoData";
import { formatCurrency } from "@/lib/forecastInsights";
import { cn } from "@/lib/utils";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;
type TransactionType = "incoming" | "sale";
type ExportFormat = "csv" | "pdf";
type DateFilterType = "all" | "week" | "month" | "custom";
type ProductUpdatePlan = {
  id: string;
  nextQuantity: number;
  nextStatus: string;
  previousQuantity: number;
  previousStatus: string;
};
type ProductSelectOption = {
  label: string;
  value: string;
};
type TransactionForm = {
  amount: string;
  category: string;
  date: string;
  expiryDate: string;
  productId: string;
  productName: string;
  quantity: string;
  reference: string;
  type: TransactionType;
};

const toDateInputValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().split("T")[0];

const getToday = () => toDateInputValue(new Date());

const defaultForm: TransactionForm = {
  amount: "",
  category: "",
  date: getToday(),
  expiryDate: "",
  productId: "",
  productName: "",
  quantity: "",
  reference: "",
  type: "incoming" as TransactionType,
};

const getDateRange = (filterType: DateFilterType, customFromDate?: string, customToDate?: string) => {
  const today = new Date();
  
  switch (filterType) {
    case "week": {
      const start = startOfWeek(today);
      const end = endOfWeek(today);
      return { 
        fromDate: toDateInputValue(start), 
        toDate: toDateInputValue(end),
        label: `This Week (${format(start, 'MMM d')} - ${format(end, 'MMM d')})`
      };
    }
    case "month": {
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      return { 
        fromDate: toDateInputValue(start), 
        toDate: toDateInputValue(end),
        label: `This Month (${format(start, 'MMM d, yyyy')})`
      };
    }
    case "custom": {
      return { 
        fromDate: customFromDate || getToday(), 
        toDate: customToDate || getToday(),
        label: `Custom (${customFromDate || getToday()} - ${customToDate || getToday()})`
      };
    }
    default: {
      return { 
        fromDate: "", 
        toDate: "",
        label: "All Dates"
      };
    }
  }
};

const isTransactionInDateRange = (transactionDate: string, fromDate: string, toDate: string) => {
  const txDate = parseISO(transactionDate);
  const startDate = parseISO(fromDate);
  const endDate = parseISO(toDate);
  
  return (isAfter(txDate, startDate) || isEqual(txDate, startDate)) && 
         (isBefore(txDate, endDate) || isEqual(txDate, endDate));
};

const exportOptions: Array<{
  value: ExportFormat;
  label: string;
  description: string;
}> = [
  {
    value: "csv",
    label: "CSV",
    description: "Spreadsheet-ready export for stock analysis and sharing.",
  },
  {
    value: "pdf",
    label: "PDF",
    description: "Printable report for handoff, archiving, or review.",
  },
];

const getExpirySortValue = (product: Product) => {
  if (!product.expiry_date) {
    return Number.POSITIVE_INFINITY;
  }

  const value = new Date(`${product.expiry_date}T00:00:00.000Z`).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
};

const sortProductsForFifo = (left: Product, right: Product) =>
  getExpirySortValue(left) - getExpirySortValue(right) ||
  new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
  left.id.localeCompare(right.id);

const getProductMatchKey = (product: Pick<Product, "category" | "name">) =>
  `${product.name.trim().toLowerCase()}::${product.category.trim().toLowerCase()}`;

const getNearestExpiryBatch = (products: Product[], selectedProduct: Product) =>
  products
    .filter(
      (product) =>
        getProductMatchKey(product) === getProductMatchKey(selectedProduct) && product.quantity > 0,
    )
    .sort(sortProductsForFifo)[0];

const getResolvedProductForTransaction = ({
  productId,
  products,
  type,
}: {
  productId: string;
  products: Product[];
  type: TransactionType;
}) => {
  const selectedProduct = products.find((product) => product.id === productId);

  if (!selectedProduct) {
    return undefined;
  }

  if (type === "incoming") {
    return selectedProduct;
  }

  return getNearestExpiryBatch(products, selectedProduct) ?? selectedProduct;
};

const normalizeProductText = (value: string) => value.trim().toLowerCase();

const getIncomingBatchMatch = ({
  category,
  expiryDate,
  productName,
  products,
}: {
  category: string;
  expiryDate: string;
  productName: string;
  products: Product[];
}) =>
  products
    .filter(
      (product) =>
        normalizeProductText(product.name) === normalizeProductText(productName) &&
        normalizeProductText(product.category) === normalizeProductText(category) &&
        (product.expiry_date ?? "") === expiryDate,
    )
    .sort(sortProductsForFifo)[0];

const buildSaleProductOptions = (products: Product[]): ProductSelectOption[] => {
  const groups = new Map<string, Product[]>();

  products.forEach((product) => {
    const key = getProductMatchKey(product);
    const currentGroup = groups.get(key);

    if (currentGroup) {
      currentGroup.push(product);
      return;
    }

    groups.set(key, [product]);
  });

  return Array.from(groups.values())
    .map((groupProducts) => {
      const representative = [...groupProducts]
        .filter((product) => product.quantity > 0)
        .sort(sortProductsForFifo)[0];

      if (!representative) {
        return null;
      }

      const totalQuantity = groupProducts.reduce((sum, product) => sum + product.quantity, 0);
      const expiryLabel = representative.expiry_date ?? "no expiry";

      return {
        label: `${representative.name} (${totalQuantity} in stock - ${expiryLabel})`,
        value: representative.id,
      };
    })
    .filter((option): option is ProductSelectOption => option !== null)
    .sort((left, right) => left.label.localeCompare(right.label));
};

const buildProductUpdatePlan = ({
  products,
  quantity,
  selectedProduct,
  type,
}: {
  products: Product[];
  quantity: number;
  selectedProduct: Product;
  type: TransactionType;
}): ProductUpdatePlan[] => {
  if (type === "incoming") {
    const nextQuantity = selectedProduct.quantity + quantity;

    return [
      {
        id: selectedProduct.id,
        nextQuantity,
        nextStatus: getStatusFromQuantity(nextQuantity),
        previousQuantity: selectedProduct.quantity,
        previousStatus: selectedProduct.status,
      },
    ];
  }

  const candidateBatches = products
    .filter(
      (product) =>
        getProductMatchKey(product) === getProductMatchKey(selectedProduct) && product.quantity > 0,
    )
    .sort(sortProductsForFifo);

  const totalAvailable = candidateBatches.reduce((sum, product) => sum + product.quantity, 0);

  if (totalAvailable < quantity) {
    throw new Error(
      `Not enough stock for ${selectedProduct.name}. Available across FIFO batches: ${totalAvailable}`,
    );
  }

  let remaining = quantity;
  const updates: ProductUpdatePlan[] = [];

  for (const batch of candidateBatches) {
    if (remaining === 0) {
      break;
    }

    const deductedQuantity = Math.min(batch.quantity, remaining);
    const nextQuantity = batch.quantity - deductedQuantity;

    updates.push({
      id: batch.id,
      nextQuantity,
      nextStatus: getStatusFromQuantity(nextQuantity),
      previousQuantity: batch.quantity,
      previousStatus: batch.status,
    });

    remaining -= deductedQuantity;
  }

  return updates;
};

const applyProductUpdatePlan = async (updates: ProductUpdatePlan[]) => {
  const appliedUpdates: ProductUpdatePlan[] = [];

  try {
    for (const update of updates) {
      const { error } = await supabase
        .from("products")
        .update({
          quantity: update.nextQuantity,
          status: update.nextStatus,
        })
        .eq("id", update.id);

      if (error) {
        throw error;
      }

      appliedUpdates.push(update);
    }
  } catch (error) {
    for (const update of [...appliedUpdates].reverse()) {
      await supabase
        .from("products")
        .update({
          quantity: update.previousQuantity,
          status: update.previousStatus,
        })
        .eq("id", update.id);
    }

    throw error;
  }
};

export default function Transactions() {
  const [form, setForm] = useState(defaultForm);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>("all");
  const [customFromDate, setCustomFromDate] = useState(getToday());
  const [customToDate, setCustomToDate] = useState(getToday());
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
            items: getMockTransactions(user!.id),
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
  const productOptions = useMemo(() => buildSaleProductOptions(products), [products]);
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(products.map((product) => product.category.trim()).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [products],
  );
  const inventoryTotalsByName = useMemo(() => {
    const totals = new Map<string, number>();

    products.forEach((product) => {
      const key = normalizeProductText(product.name);
      totals.set(key, (totals.get(key) ?? 0) + product.quantity);
    });

    return totals;
  }, [products]);

  const filteredTransactions = useMemo(
    () => {
      let filtered = typeFilter === "all"
        ? transactions
        : transactions.filter((transaction) => transaction.type === typeFilter);
      
      // Apply date filter
      if (dateFilterType !== "all") {
        const dateRange = getDateRange(dateFilterType, customFromDate, customToDate);
        if (dateRange.fromDate && dateRange.toDate) {
          filtered = filtered.filter((transaction) =>
            isTransactionInDateRange(transaction.date, dateRange.fromDate, dateRange.toDate)
          );
        }
      }
      
      return filtered;
    },
    [transactions, typeFilter, dateFilterType, customFromDate, customToDate],
  );

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No transactions available to export.");
      return;
    }

    const dateRange = getDateRange(dateFilterType, customFromDate, customToDate);
    const typeLabel = typeFilter === "all" ? "All Types" : typeFilter === "sale" ? "Sales Only" : "Incoming Only";
    
    const rows = [
      ["Bag-Invent Transaction Export"],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Date Range: ${dateRange.label}`],
      [`Type Filter: ${typeLabel}`],
      [],
      ["Date", "Type", "Product", "Quantity", "Amount", "Reference"],
      ...filteredTransactions.map((transaction) => [
        transaction.date,
        transaction.type,
        transaction.product_name,
        String(transaction.quantity),
        transaction.amount.toFixed(2),
        transaction.reference,
      ]),
    ];

    const csvContent = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bag-invent-transactions-${getToday()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No transactions available to export.");
      return;
    }

    const dateRange = getDateRange(dateFilterType, customFromDate, customToDate);
    const typeLabel = typeFilter === "all" ? "All Types" : typeFilter === "sale" ? "Sales Only" : "Incoming Only";
    
    // Calculate summary metrics
    const totalSales = filteredTransactions
      .filter((t) => t.type === "sale")
      .reduce((sum, t) => sum + t.amount, 0);
    
    const incomingStockValue = filteredTransactions
      .filter((t) => t.type === "incoming")
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalTransactions = filteredTransactions.length;

    const document = new jsPDF();
    const pageWidth = document.internal.pageSize.getWidth();
    const pageHeight = document.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - 2 * margin;

    // Title
    document.setFontSize(20);
    document.setFont(undefined, "bold");
    document.text("Transactions Report", margin, 20);

    // Metadata
    document.setFontSize(10);
    document.setFont(undefined, "normal");
    document.text(`Type Filter: ${typeLabel}`, margin, 28);
    document.text(`Date Range: ${dateRange.label}`, margin, 34);
    document.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 40);

    // Summary Cards
    const cardY = 50;
    const cardWidth = (contentWidth - 10) / 3;
    const cardHeight = 24;

    // Helper function to draw a card
    const drawCard = (x: number, label: string, value: string) => {
      document.setDrawColor(200, 200, 200);
      document.rect(x, cardY, cardWidth, cardHeight);
      document.setFontSize(9);
      document.setFont(undefined, "normal");
      document.text(label, x + 4, cardY + 8);
      document.setFontSize(13);
      document.setFont(undefined, "bold");
      document.text(value, x + 4, cardY + 18);
    };

    drawCard(margin, "Total Sales", `P ${totalSales.toFixed(2)}`);
    drawCard(margin + cardWidth + 5, "Incoming Stock Value", `P ${incomingStockValue.toFixed(2)}`);
    drawCard(margin + 2 * (cardWidth + 5), "Total Transactions", `${totalTransactions}`);

    // Table
    const tableY = 80;
    const colWidths = {
      date: 25,
      type: 20,
      product: 70,
      quantity: 22,
      amount: 28,
    };

    // Table header
    document.setFontSize(9);
    document.setFont(undefined, "bold");
    document.setDrawColor(100);
    document.setFillColor(240, 240, 240);
    
    let x = margin;
    document.rect(margin, tableY, contentWidth, 8, "F");
    document.text("Date", x + 2, tableY + 6);
    x += colWidths.date;
    document.text("Type", x + 2, tableY + 6);
    x += colWidths.type;
    document.text("Product", x + 2, tableY + 6);
    x += colWidths.product;
    document.text("Quantity", x + 2, tableY + 6);
    x += colWidths.quantity;
    document.text("Amount", x + 2, tableY + 6);

    // Table data
    document.setFont(undefined, "normal");
    document.setFontSize(8);
    let rowY = tableY + 10;
    const rowHeight = 7;
    const maxRows = Math.floor((pageHeight - rowY - 10) / rowHeight);

    for (let i = 0; i < Math.min(filteredTransactions.length, maxRows); i++) {
      const transaction = filteredTransactions[i];
      x = margin;
      
      document.text(transaction.date, x + 2, rowY);
      x += colWidths.date;
      document.text(transaction.type.toUpperCase(), x + 2, rowY);
      x += colWidths.type;
      const productName = transaction.product_name.length > 25 
        ? transaction.product_name.substring(0, 22) + "..." 
        : transaction.product_name;
      document.text(productName, x + 2, rowY);
      x += colWidths.product;
      document.text(String(transaction.quantity), x + 2, rowY);
      x += colWidths.quantity;
      document.text(`P ${transaction.amount.toFixed(2)}`, x + 2, rowY);

      rowY += rowHeight;

      // Check if we need a new page
      if (rowY > pageHeight - 10 && i < filteredTransactions.length - 1) {
        document.addPage();
        rowY = 20;
        
        // Repeat header on new page
        document.setFont(undefined, "bold");
        document.setFillColor(240, 240, 240);
        document.rect(margin, rowY, contentWidth, 8, "F");
        x = margin;
        document.text("Date", x + 2, rowY + 6);
        x += colWidths.date;
        document.text("Type", x + 2, rowY + 6);
        x += colWidths.type;
        document.text("Product", x + 2, rowY + 6);
        x += colWidths.product;
        document.text("Quantity", x + 2, rowY + 6);
        x += colWidths.quantity;
        document.text("Amount", x + 2, rowY + 6);
        
        rowY += 10;
        document.setFont(undefined, "normal");
      }
    }

    // Footer note
    if (filteredTransactions.length > maxRows) {
      document.setFontSize(8);
      document.setFont(undefined, "italic");
      document.text(
        `Showing ${Math.min(filteredTransactions.length, maxRows)} of ${filteredTransactions.length} transactions`,
        margin,
        pageHeight - 5
      );
    }

    document.save(`bag-invent-transactions-${getToday()}.pdf`);
  };

  const handleExport = () => {
    if (exportFormat === "csv") {
      exportToCSV();
      return;
    }

    exportToPDF();
  };

  const addTransactionMutation = useMutation({
    mutationFn: async (payload: TransactionForm) => {
      const quantity = Number.parseInt(payload.quantity, 10);
      const amount = Number.parseFloat(payload.amount);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Quantity must be greater than 0");
      }

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Amount must be 0 or higher");
      }

      if (payload.type === "incoming") {
        const productName = payload.productName.trim();
        const category = payload.category.trim();
        const expiryDate = payload.expiryDate;

        if (!productName) {
          throw new Error("Product name is required");
        }

        if (!category) {
          throw new Error("Category is required");
        }

        const reference =
          payload.reference.trim() ||
          `INCOMING-${payload.date.replaceAll("-", "")}-${productName.slice(0, 3).toUpperCase()}`;
        const matchingBatch = getIncomingBatchMatch({
          category,
          expiryDate,
          productName,
          products,
        });

        const buildTransactionInput = (product: Product) => ({
          amount,
          date: payload.date,
          productId: product.id,
          productName,
          quantity,
          reference,
          type: payload.type,
          userId: user!.id,
        });

        if (matchingBatch) {
          const productUpdates = buildProductUpdatePlan({
            products,
            quantity,
            selectedProduct: matchingBatch,
            type: payload.type,
          });

          if (usingMockTransactions) {
            await applyProductUpdatePlan(productUpdates);
            addMockTransaction(buildTransactionInput(matchingBatch));
            return;
          }
          const { data: createdTransaction, error: insertError } = await supabase
            .from("transactions")
            .insert({
              amount,
              date: payload.date,
              product_id: matchingBatch.id,
              product_name: productName,
              quantity,
              reference,
              type: payload.type,
              user_id: user!.id,
            })
            .select("id")
            .single();

          if (insertError) {
            if (isMissingTransactionsTableError(insertError)) {
              await applyProductUpdatePlan(productUpdates);
              addMockTransaction(buildTransactionInput(matchingBatch));
              return;
            }

            throw insertError;
          }

          try {
            await applyProductUpdatePlan(productUpdates);
          } catch (updateProductError) {
            await supabase.from("transactions").delete().eq("id", createdTransaction.id);
            throw updateProductError;
          }

          return;
        }

        const { data: createdProduct, error: createProductError } = await supabase
          .from("products")
          .insert({
            category,
            expiry_date: expiryDate || null,
            name: productName,
            quantity,
            status: getStatusFromQuantity(quantity),
            user_id: user!.id,
          })
          .select("*")
          .single();

        if (createProductError) {
          throw createProductError;
        }

        if (usingMockTransactions) {
          addMockTransaction(buildTransactionInput(createdProduct));
          return;
        }

        const { error: insertTransactionError } = await supabase.from("transactions").insert({
          amount,
          date: payload.date,
          product_id: createdProduct.id,
          product_name: productName,
          quantity,
          reference,
          type: payload.type,
          user_id: user!.id,
        });

        if (insertTransactionError) {
          if (isMissingTransactionsTableError(insertTransactionError)) {
            addMockTransaction(buildTransactionInput(createdProduct));
            return;
          }

          await supabase.from("products").delete().eq("id", createdProduct.id);
          throw insertTransactionError;
        }

        return;
      }

      if (!payload.productId) {
        throw new Error("Please select a product to sell.");
      }

      const selectedProduct = getResolvedProductForTransaction({
        productId: payload.productId,
        products,
        type: payload.type,
      });

      if (!selectedProduct) {
        throw new Error("Selected product could not be found.");
      }

      const reference =
        payload.reference.trim() ||
        `SALE-${payload.date.replaceAll("-", "")}-${selectedProduct.name.slice(0, 3).toUpperCase()}`;
      const productUpdates = buildProductUpdatePlan({
        products,
        quantity,
        selectedProduct,
        type: payload.type,
      });
      const transactionInput = {
        amount,
        date: payload.date,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity,
        reference,
        type: payload.type,
        userId: user!.id,
      };

      if (usingMockTransactions) {
        await applyProductUpdatePlan(productUpdates);
        addMockTransaction(transactionInput);
        return;
      }

      const { data: createdTransaction, error: insertError } = await supabase
        .from("transactions")
        .insert({
          amount,
          date: payload.date,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          quantity,
          reference,
          type: payload.type,
          user_id: user!.id,
        })
        .select("id")
        .single();

      if (insertError) {
        if (isMissingTransactionsTableError(insertError)) {
          await applyProductUpdatePlan(productUpdates);
          addMockTransaction(transactionInput);
          return;
        }

        throw insertError;
      }

      try {
        await applyProductUpdatePlan(productUpdates);
      } catch (updateProductError) {
        await supabase.from("transactions").delete().eq("id", createdTransaction.id);
        throw updateProductError;
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to record transaction.");
    },
    onSuccess: () => {
      toast.success(form.type === "incoming" ? "Product added to inventory." : "Sale recorded.");
      setForm(defaultForm);
      setTypeFilter("all");
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
    },
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await addTransactionMutation.mutateAsync(form);
  };

  const hasLoadError = Boolean(productsError || transactionsError);
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;
  const latestTransaction = transactions[0];
  const panelClassName =
    "rounded-[4px] bg-[#fbfaf7] p-6 text-[#171717] shadow-[0_12px_32px_rgba(34,28,24,0.08)] ring-1 ring-[#ddd6cb]";
  const fieldClassName =
    "h-11 rounded-[4px] border-0 bg-[#d8d8d8] text-[#171717] placeholder:text-[#787878] focus-visible:ring-1 focus-visible:ring-[#cf5a5a]";
  const pageTitle = form.type === "incoming" ? "Add Product" : "Record Sale";
  const pageDescription = "";

  return (
    <DashboardLayout pageLabel="Transactions">
      <div className="space-y-8">
        {hasLoadError ? (
          <div className="workspace-card-soft text-sm text-[#b34d4d]">
            Transactions data could not be loaded. Apply the latest Supabase migration, then
            refresh the app.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.08fr)_330px]">
          <section className={panelClassName}>
            <div className="flex flex-col gap-5 border-b border-[#ddd6cb] pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[#8a7c74]">
                  Transactions Workspace
                </p>
                <h1 className="text-[2rem] font-medium leading-none text-[#171717]">
                  {pageTitle}
                </h1>
                <p className="max-w-[40rem] text-sm text-[#5f5a56]">{pageDescription}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-[4px] bg-[#ece7e1] p-1">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...defaultForm,
                      amount: form.amount,
                      type: "incoming",
                    })
                  }
                  className={
                    form.type === "incoming"
                      ? "rounded-[4px] bg-[#cf5a5a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
                      : "rounded-[4px] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#171717]"
                  }
                >
                  Incoming
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...defaultForm,
                      amount: form.amount,
                      type: "sale",
                    })
                  }
                  className={
                    form.type === "sale"
                      ? "rounded-[4px] bg-[#cf5a5a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
                      : "rounded-[4px] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#171717]"
                  }
                >
                  Sale
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
              {form.type === "sale" ? (
                <>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="product" className="text-sm font-medium text-[#171717]">
                      Product
                    </Label>
                    <Select
                      value={form.productId}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          productId:
                            getResolvedProductForTransaction({
                              productId: value,
                              products,
                              type: "sale",
                            })?.id ?? value,
                        })
                      }
                    >
                      <SelectTrigger className={fieldClassName}>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent className="border-[#d9d2c9] bg-[#f7f4ef] text-[#171717]">
                        {productOptions.map((productOption) => (
                          <SelectItem key={productOption.value} value={productOption.value}>
                            {productOption.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {productOptions.length === 0 ? (
                      <p className="text-sm text-[#666]">
                        Record an incoming transaction first to create stock for sale.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount" className="text-sm font-medium text-[#171717]">
                      Price (PHP)
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      placeholder="0.00"
                      className={fieldClassName}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity" className="text-sm font-medium text-[#171717]">
                      Quantity Sold
                    </Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                      className={fieldClassName}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-medium text-[#171717]">
                      Transaction Date
                    </Label>
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm({ ...form, date: event.target.value })}
                      className={cn(
                        fieldClassName,
                        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
                      )}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="saleReference" className="text-sm font-medium text-[#171717]">
                      Reference
                    </Label>
                    <Input
                      id="saleReference"
                      value={form.reference}
                      onChange={(event) => setForm({ ...form, reference: event.target.value })}
                      className={fieldClassName}
                      placeholder="Optional"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reference" className="text-sm font-medium text-[#171717]">
                      Product ID
                    </Label>
                    <Input
                      id="reference"
                      value={form.reference}
                      onChange={(event) => setForm({ ...form, reference: event.target.value })}
                      placeholder="Product code"
                      className={fieldClassName}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="productName" className="text-sm font-medium text-[#171717]">
                      Product Name
                    </Label>
                    <Input
                      id="productName"
                      value={form.productName}
                      onChange={(event) => setForm({ ...form, productName: event.target.value })}
                      className={fieldClassName}
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="category" className="text-sm font-medium text-[#171717]">
                      Category
                    </Label>
                    <Input
                      id="category"
                      value={form.category}
                      onChange={(event) => setForm({ ...form, category: event.target.value })}
                      className={fieldClassName}
                      placeholder="Category"
                      required
                    />
                    {categoryOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {categoryOptions.slice(0, 6).map((categoryOption) => (
                          <button
                            key={categoryOption}
                            type="button"
                            onClick={() => setForm({ ...form, category: categoryOption })}
                            className={
                              normalizeProductText(form.category) ===
                              normalizeProductText(categoryOption)
                                ? "rounded-full bg-[#cf5a5a] px-3 py-1 text-xs font-medium text-white"
                                : "rounded-full bg-[#efebe6] px-3 py-1 text-xs font-medium text-[#171717]"
                            }
                          >
                            {categoryOption}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount" className="text-sm font-medium text-[#171717]">
                      Price (PHP)
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      placeholder="0.00"
                      className={fieldClassName}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity" className="text-sm font-medium text-[#171717]">
                      Stock
                    </Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                      className={fieldClassName}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-medium text-[#171717]">
                      Date Received
                    </Label>
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm({ ...form, date: event.target.value })}
                      className={cn(
                        fieldClassName,
                        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
                      )}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expiryDate" className="text-sm font-medium text-[#171717]">
                      Expiry Date
                    </Label>
                    <Input
                      id="expiryDate"
                      type="date"
                      value={form.expiryDate}
                      onChange={(event) => setForm({ ...form, expiryDate: event.target.value })}
                      className={cn(
                        fieldClassName,
                        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
                      )}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end md:col-span-2">
                <Button
                  type="submit"
                  className="h-10 rounded-[4px] bg-[#d8d8d8] px-8 text-[#171717] hover:bg-[#cccccc]"
                  disabled={addTransactionMutation.isPending || hasLoadError}
                >
                  {addTransactionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Confirming
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Confirm
                    </>
                  )}
                </Button>
              </div>
            </form>
          </section>

          <div className="space-y-6">
            <section className={panelClassName}>
              <h2 className="text-[1.65rem] font-medium leading-none text-[#171717]">
                Filter Results
              </h2>
              <p className="mt-2 text-sm text-[#5f5a56]">
                Filter transactions by date range to customize your export.
              </p>

              <div className="mt-5 space-y-4">
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-[#171717]">Date Filter</Label>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {(["all", "week", "month", "custom"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDateFilterType(option)}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-[4px] border px-3 py-2.5 text-sm font-medium transition-colors",
                          dateFilterType === option
                            ? "border-[#cf5a5a] bg-[#f6dede] text-[#171717]"
                            : "border-[#dfd8cf] bg-[#efebe6] text-[#171717] hover:bg-[#e7e1d8]",
                        )}
                      >
                        <Calendar className="h-4 w-4" />
                        <span>{option === "all" ? "All" : option === "week" ? "Week" : option === "month" ? "Month" : "Custom"}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {dateFilterType === "custom" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="fromDate" className="text-sm font-medium text-[#171717]">
                        From Date
                      </Label>
                      <Input
                        id="fromDate"
                        type="date"
                        value={customFromDate}
                        onChange={(event) => setCustomFromDate(event.target.value)}
                        className={cn(
                          fieldClassName,
                          "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="toDate" className="text-sm font-medium text-[#171717]">
                        To Date
                      </Label>
                      <Input
                        id="toDate"
                        type="date"
                        value={customToDate}
                        onChange={(event) => setCustomToDate(event.target.value)}
                        className={cn(
                          fieldClassName,
                          "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
                        )}
                      />
                    </div>
                  </div>
                )}

                {dateFilterType !== "all" && (
                  <div className="rounded-[4px] bg-[#e7e1d8] p-3 text-sm text-[#171717]">
                    <p className="font-medium">
                      {getDateRange(dateFilterType, customFromDate, customToDate).label}
                    </p>
                    <p className="mt-1 text-xs text-[#5f5a56]">
                      {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""} found in this range
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-[1.65rem] font-medium leading-none text-[#171717]">
                Export Data
              </h2>
              <p className="mt-2 text-sm text-[#5f5a56]">
                Choose a format, then export the currently filtered transaction log.
              </p>

              <div className="mt-5 space-y-3">
                {exportOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExportFormat(option.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[4px] border px-3 py-3 text-left transition-colors",
                      exportFormat === option.value
                        ? "border-[#cf5a5a] bg-[#f6dede]"
                        : "border-[#dfd8cf] bg-[#efebe6] hover:bg-[#e7e1d8]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 h-3 w-3 rounded-full border",
                        exportFormat === option.value
                          ? "border-[#cf5a5a] bg-[#cf5a5a]"
                          : "border-[#9f948c] bg-transparent",
                      )}
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-semibold uppercase tracking-[0.16em] text-[#171717]">
                        {option.label}
                      </span>
                      <span className="block text-xs leading-relaxed text-[#5f5a56]">
                        {option.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <Button
                onClick={handleExport}
                disabled={filteredTransactions.length === 0}
                className="mt-5 h-11 w-full rounded-[4px] bg-[#d8d8d8] text-[#171717] hover:bg-[#cccccc]"
              >
                <Download className="mr-2 h-4 w-4" />
                {exportFormat === "csv" ? "Export CSV" : "Export PDF"}
              </Button>
            </section>

            <section className={panelClassName}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.65rem] font-medium leading-none text-[#171717]">
                    Scanned IoT
                  </h2>
                  <p className="mt-2 text-sm text-[#5f5a56]">
                    Live handoff area for device captures before they are confirmed into inventory.
                  </p>
                </div>
                <span className="rounded-full bg-[#d7f6e3] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2f7b54]">
                  Connected
                </span>
              </div>

              <div className="mt-5 min-h-[184px] rounded-[4px] bg-[#d8d8d8] p-4">
                <div className="grid gap-4 text-sm text-[#171717]">
                  <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-3">
                    <span className="text-[#5f5a56]">Latest activity</span>
                    <span className="text-right font-medium">
                      {latestTransaction ? latestTransaction.product_name : "Awaiting device scan"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-3">
                    <span className="text-[#5f5a56]">Last captured</span>
                    <span className="text-right font-medium">
                      {latestTransaction
                        ? new Date(latestTransaction.created_at).toLocaleString()
                        : "No scan detected yet"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#5f5a56]">Tracked batches</span>
                    <span className="text-right font-medium">{products.length} batches ready</span>
                  </div>
                </div>
              </div>

              <Button
                className="mt-4 h-11 w-full rounded-[4px] bg-[#d8d8d8] text-[#171717] hover:bg-[#cccccc]"
                type="button"
                onClick={() => setForm(defaultForm)}
              >
                Import Products
              </Button>
            </section>
          </div>
        </div>

        <section className={panelClassName}>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-[1.8rem] font-medium text-[#171717]">Inventory Logs</h2>
              <p className="mt-2 text-sm text-[#5f5a56]">
                Review the latest incoming and outgoing activity against current stock totals.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {["all", "sale", "incoming"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTypeFilter(option)}
                  className={
                    typeFilter === option
                      ? "rounded-full bg-[#cf5a5a] px-4 py-1.5 text-xs font-medium text-white"
                      : "rounded-full bg-[#efebe6] px-4 py-1.5 text-xs font-medium text-[#171717]"
                  }
                >
                  {option === "all" ? "All" : option === "sale" ? "Sales" : "Incoming"}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[#ddd6cb] hover:bg-transparent">
                    <TableHead className="pl-0 text-[#5f5a56]">Products</TableHead>
                    <TableHead className="text-[#5f5a56]">Quantity Added</TableHead>
                    <TableHead className="text-[#5f5a56]">Total Stock</TableHead>
                    <TableHead className="pr-0 text-[#5f5a56]">Time Scanned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow className="border-white/0">
                      <TableCell colSpan={4} className="px-0 py-12 text-center text-[#686868]">
                        No transactions found yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((transaction) => {
                      const totalStock =
                        inventoryTotalsByName.get(normalizeProductText(transaction.product_name)) ??
                        0;

                      return (
                        <TableRow
                          key={transaction.id}
                          className="border-b border-[#ece6dd] hover:bg-[#f5f1eb]"
                        >
                          <TableCell className="pl-0 text-[#171717]">
                            <div className="space-y-1">
                              <p className="font-medium">{transaction.product_name}</p>
                              <p className="text-xs uppercase tracking-[0.12em] text-[#6c6661]">
                                ID: {transaction.reference}
                              </p>
                              <p className="text-xs text-[#857f7a]">{transaction.date}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-[#171717]">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 font-medium">
                                {transaction.type === "sale" ? (
                                  <ArrowUpRight className="h-4 w-4 text-[#cf5a5a]" />
                                ) : (
                                  <ArrowDownLeft className="h-4 w-4 text-[#2d63c8]" />
                                )}
                                <span>
                                  {transaction.type === "sale" ? "-" : "+"}
                                  {transaction.quantity}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                  transaction.type === "sale"
                                    ? "bg-[#ffe1e1] text-[#b34d4d]"
                                    : "bg-[#d7f6e3] text-[#2f7b54]",
                                )}
                              >
                                {transaction.type === "sale" ? "Sale" : "Incoming"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[#171717]">
                            <div className="space-y-1">
                              <p className="font-medium">{totalStock} units</p>
                              <p className="text-xs text-[#6c6661]">
                                {formatCurrency(transaction.amount)} recorded value
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="pr-0 text-sm text-[#171717]">
                            {new Date(transaction.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
