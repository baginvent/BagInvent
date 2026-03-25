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
  addMockTransaction,
  ensureDemoInventoryAndTransactions,
  getStatusFromQuantity,
  getMockTransactions,
  isMissingTransactionsTableError,
} from "@/lib/demoData";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;
type TransactionType = "incoming" | "sale";
type DatePreset = "all" | "custom" | "last7" | "thisMonth" | "today";
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
  type: "sale" as TransactionType,
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);

const formatPdfCurrencyValue = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);

const drawPesoSymbol = (document: jsPDF, x: number, y: number) => {
  const symbolWidth = document.getTextWidth("P");
  const fontHeight = document.getFontSize() * 0.352778;
  const lineY = y - fontHeight * 0.52;

  document.text("P", x, y);
  document.setLineWidth(0.3);
  document.line(x + 0.4, lineY, x + symbolWidth - 0.2, lineY);

  return symbolWidth;
};

const drawPdfCurrencyValue = ({
  align = "left",
  document,
  value,
  x,
  y,
}: {
  align?: "left" | "right";
  document: jsPDF;
  value: number;
  x: number;
  y: number;
}) => {
  const amountText = formatPdfCurrencyValue(value);
  const symbolWidth = document.getTextWidth("P");
  const gap = 1;

  if (align === "right") {
    const totalWidth = symbolWidth + gap + document.getTextWidth(amountText);
    const startX = x - totalWidth;

    drawPesoSymbol(document, startX, y);
    document.text(amountText, startX + symbolWidth + gap, y);
    return;
  }

  drawPesoSymbol(document, x, y);
  document.text(amountText, x + symbolWidth + gap, y);
};

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

const formatProductBatchLabel = (product: Product) => {
  const expiryLabel = product.expiry_date ? `exp ${product.expiry_date}` : "no expiry";
  return `${product.name} (${product.quantity} in stock • ${expiryLabel})`;
};

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
        label: `${representative.name} (${totalQuantity} in stock • ${expiryLabel})`,
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
        getProductMatchKey(product) === getProductMatchKey(selectedProduct) &&
        product.quantity > 0,
    )
    .sort(sortProductsForFifo);

  const totalAvailable = candidateBatches.reduce(
    (sum, product) => sum + product.quantity,
    0,
  );

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateRange, setDateRange] = useState({ endDate: "", startDate: "" });
  const [form, setForm] = useState(defaultForm);
  const [isSeeding, setIsSeeding] = useState(false);
  const [customIncomingCategories, setCustomIncomingCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");

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

  const categoryOptions = useMemo(() => {
    const options = new Map<string, string>();

    const registerCategory = (value: string) => {
      const trimmedValue = value.trim();

      if (!trimmedValue) {
        return;
      }

      const normalizedValue = normalizeProductText(trimmedValue);

      if (!options.has(normalizedValue)) {
        options.set(normalizedValue, trimmedValue);
      }
    };

    products.forEach((product) => registerCategory(product.category));
    customIncomingCategories.forEach(registerCategory);

    return Array.from(options.values()).sort((left, right) => left.localeCompare(right));
  }, [customIncomingCategories, products]);

  useEffect(() => {
    if (form.type !== "sale" || !form.productId) {
      return;
    }

    const resolvedProduct = getResolvedProductForTransaction({
      productId: form.productId,
      products,
      type: form.type,
    });

    if (!resolvedProduct || resolvedProduct.id === form.productId) {
      return;
    }

    setForm((currentForm) =>
      currentForm.productId === form.productId
        ? { ...currentForm, productId: resolvedProduct.id }
        : currentForm,
    );
  }, [form.productId, form.type, products]);

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
    setNewCategory("");
  };

  const addIncomingCategory = () => {
    const trimmedCategory = newCategory.trim();

    if (!trimmedCategory) {
      return;
    }

    const existingCategory = categoryOptions.find(
      (categoryOption) =>
        normalizeProductText(categoryOption) === normalizeProductText(trimmedCategory),
    );

    if (!existingCategory) {
      setCustomIncomingCategories((currentCategories) => [
        ...currentCategories,
        trimmedCategory,
      ]);
    }

    setForm((currentForm) => ({
      ...currentForm,
      category: existingCategory ?? trimmedCategory,
    }));
    setNewCategory("");
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
          const transactionInput = buildTransactionInput(matchingBatch);

          if (usingMockTransactions) {
            await applyProductUpdatePlan(productUpdates);
            addMockTransaction(transactionInput);
            return { source: "mock" as const };
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
              addMockTransaction(transactionInput);
              return { source: "mock" as const };
            }

            throw insertError;
          }

          try {
            await applyProductUpdatePlan(productUpdates);
          } catch (updateProductError) {
            await supabase.from("transactions").delete().eq("id", createdTransaction.id);
            throw updateProductError;
          }

          return { source: "db" as const };
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

        const transactionInput = buildTransactionInput(createdProduct);

        if (usingMockTransactions) {
          addMockTransaction(transactionInput);
          return { source: "mock" as const };
        }

        const { error: insertError } = await supabase.from("transactions").insert({
          amount,
          date: payload.date,
          product_id: createdProduct.id,
          product_name: productName,
          quantity,
          reference,
          type: payload.type,
          user_id: user!.id,
        });

        if (insertError) {
          if (isMissingTransactionsTableError(insertError)) {
            addMockTransaction(transactionInput);
            return { source: "mock" as const };
          }

          await supabase.from("products").delete().eq("id", createdProduct.id);
          throw insertError;
        }

        return { source: "db" as const };
      }

      const product = getResolvedProductForTransaction({
        productId: payload.productId,
        products,
        type: payload.type,
      });

      if (!product) {
        throw new Error("Select a product from inventory");
      }

      const reference =
        payload.reference.trim() ||
        `${payload.type.toUpperCase()}-${payload.date.replaceAll("-", "")}-${product.name
          .slice(0, 3)
          .toUpperCase()}`;
      const productUpdates = buildProductUpdatePlan({
        products,
        quantity,
        selectedProduct: product,
        type: payload.type,
      });
      const transactionInput = {
        amount,
        date: payload.date,
        productId: product.id,
        productName: product.name,
        quantity,
        reference,
        type: payload.type,
        userId: user!.id,
      };

      if (usingMockTransactions) {
        await applyProductUpdatePlan(productUpdates);
        addMockTransaction(transactionInput);
        return { source: "mock" as const };
      }

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
        if (isMissingTransactionsTableError(insertError)) {
          await applyProductUpdatePlan(productUpdates);
          addMockTransaction(transactionInput);
          return { source: "mock" as const };
        }

        throw insertError;
      }

      try {
        await applyProductUpdatePlan(productUpdates);
      } catch (updateProductError) {
        await supabase.from("transactions").delete().eq("id", createdTransaction.id);
        throw updateProductError;
      }

      return { source: "db" as const };
    },
    onSuccess: ({ source }) => {
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
      toast.success(
        source === "mock"
          ? "Transaction saved to mock history and inventory updated"
          : "Transaction added and inventory updated",
      );
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

  const getTypeFilterLabel = () => {
    if (typeFilter === "sale") {
      return "Sales";
    }

    if (typeFilter === "incoming") {
      return "Incoming";
    }

    return "All Types";
  };

  const getDateRangeLabel = () => {
    if (!effectiveDateRange.startDate && !effectiveDateRange.endDate) {
      return "All Dates";
    }

    if (effectiveDateRange.startDate && effectiveDateRange.endDate) {
      return effectiveDateRange.startDate === effectiveDateRange.endDate
        ? effectiveDateRange.startDate
        : `${effectiveDateRange.startDate} to ${effectiveDateRange.endDate}`;
    }

    return `${effectiveDateRange.startDate || "Start"} to ${effectiveDateRange.endDate || "End"}`;
  };

  const getPdfFileName = () => {
    const typeLabel = typeFilter === "all" ? "all-types" : typeFilter;
    const dateLabel =
      !effectiveDateRange.startDate && !effectiveDateRange.endDate
        ? "all-dates"
        : `${effectiveDateRange.startDate || "start"}_to_${effectiveDateRange.endDate || "end"}`;

    return `transactions_${typeLabel}_${dateLabel}.pdf`;
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
    const document = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
    const pageWidth = document.internal.pageSize.getWidth();
    const pageHeight = document.internal.pageSize.getHeight();
    const marginX = 14;
    const bottomMargin = 16;
    const rowLineHeight = 5;
    const columnWidths = {
      amount: 32,
      date: 28,
      product: 78,
      quantity: 18,
      type: 26,
    };
    const tableWidth =
      columnWidths.date +
      columnWidths.type +
      columnWidths.product +
      columnWidths.quantity +
      columnWidths.amount;
    const tableStartX = marginX;
    const tableBottomY = pageHeight - bottomMargin;

    const drawTableHeader = (y: number) => {
      document.setFillColor(241, 245, 249);
      document.rect(tableStartX, y, tableWidth, 8, "F");
      document.setDrawColor(203, 213, 225);
      document.rect(tableStartX, y, tableWidth, 8);
      document.setFont("helvetica", "bold");
      document.setFontSize(10);

      let currentX = tableStartX;
      document.text("Date", currentX + 2, y + 5.5);
      currentX += columnWidths.date;
      document.text("Type", currentX + 2, y + 5.5);
      currentX += columnWidths.type;
      document.text("Product", currentX + 2, y + 5.5);
      currentX += columnWidths.product;
      document.text("Quantity", currentX + columnWidths.quantity - 2, y + 5.5, {
        align: "right",
      });
      currentX += columnWidths.quantity;
      document.text("Amount", currentX + columnWidths.amount - 2, y + 5.5, {
        align: "right",
      });

      return y + 11;
    };

    const ensureSpace = (y: number, height: number) => {
      if (y + height <= tableBottomY) {
        return y;
      }

      document.addPage();
      return drawTableHeader(20);
    };

    document.setFont("helvetica", "bold");
    document.setFontSize(18);
    document.text("Transactions Report", marginX, 18);

    document.setFont("helvetica", "normal");
    document.setFontSize(10);
    document.setTextColor(90, 98, 108);
    document.text(`Type Filter: ${getTypeFilterLabel()}`, marginX, 26);
    document.text(`Date Range: ${getDateRangeLabel()}`, marginX, 31);
    document.text(`Generated: ${getToday()}`, marginX, 36);

    const summaryBoxWidth = (pageWidth - marginX * 2 - 8) / 3;
    const summaryY = 44;
    const summaryItems = [
      { isCurrency: true, label: "Total Sales", value: salesTotal },
      { isCurrency: true, label: "Incoming Stock Value", value: incomingTotal },
      { isCurrency: false, label: "Total Transactions", value: filteredTransactions.length },
    ];

    summaryItems.forEach((item, index) => {
      const x = marginX + index * (summaryBoxWidth + 4);
      document.setDrawColor(203, 213, 225);
      document.roundedRect(x, summaryY, summaryBoxWidth, 18, 2, 2);
      document.setFont("helvetica", "bold");
      document.setFontSize(9);
      document.setTextColor(71, 85, 105);
      document.text(item.label, x + 3, summaryY + 6);
      document.setFontSize(12);
      document.setTextColor(15, 23, 42);
      if (item.isCurrency) {
        drawPdfCurrencyValue({
          document,
          value: item.value,
          x: x + 3,
          y: summaryY + 13,
        });
      } else {
        document.text(String(item.value), x + 3, summaryY + 13);
      }
    });

    let y = drawTableHeader(69);

    filteredTransactions.forEach((transaction) => {
      const productLines = document.splitTextToSize(
        transaction.product_name,
        columnWidths.product - 4,
      ) as string[];
      const rowHeight = Math.max(8, productLines.length * rowLineHeight + 3);
      y = ensureSpace(y, rowHeight);

      document.setDrawColor(226, 232, 240);
      document.line(tableStartX, y - 3, tableStartX + tableWidth, y - 3);
      document.setFont("helvetica", "normal");
      document.setFontSize(9.5);
      document.setTextColor(15, 23, 42);

      let currentX = tableStartX;
      document.text(transaction.date, currentX + 2, y + 1);
      currentX += columnWidths.date;
      document.text(transaction.type === "sale" ? "Sale" : "Incoming", currentX + 2, y + 1);
      currentX += columnWidths.type;
      document.text(productLines, currentX + 2, y + 1);
      currentX += columnWidths.product;
      document.text(String(transaction.quantity), currentX + columnWidths.quantity - 2, y + 1, {
        align: "right",
      });
      currentX += columnWidths.quantity;
      drawPdfCurrencyValue({
        align: "right",
        document,
        value: transaction.amount,
        x: currentX + columnWidths.amount - 2,
        y: y + 1,
      });

      y += rowHeight;
    });

    document.setDrawColor(203, 213, 225);
    document.line(tableStartX, y - 3, tableStartX + tableWidth, y - 3);
    document.save(getPdfFileName());
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
                  disabled={hasLoadError}
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
                        setForm({
                          ...form,
                          category: value === "incoming" ? form.category : "",
                          expiryDate: value === "incoming" ? form.expiryDate : "",
                          productId: "",
                          productName: value === "incoming" ? form.productName : "",
                          type: value,
                        })
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
                  {form.type === "sale" ? (
                    <div className="space-y-2">
                      <Label htmlFor="product">Product</Label>
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
                        <SelectTrigger className="bg-background border-border">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {productOptions.map((productOption) => (
                            <SelectItem key={productOption.value} value={productOption.value}>
                              {productOption.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {productOptions.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Record an incoming transaction first to create stock for sale.
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="productName">Product Name</Label>
                        <Input
                          id="productName"
                          value={form.productName}
                          onChange={(event) =>
                            setForm({ ...form, productName: event.target.value })
                          }
                          placeholder="Product name"
                          className="bg-background border-border"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select
                          value={form.category}
                          onValueChange={(value) => setForm({ ...form, category: value })}
                        >
                          <SelectTrigger id="category" className="bg-background border-border">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            {categoryOptions.map((categoryOption) => (
                              <SelectItem key={categoryOption} value={categoryOption}>
                                {categoryOption}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {categoryOptions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              Available categories
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {categoryOptions.map((categoryOption) => {
                                const isSelected =
                                  normalizeProductText(form.category) ===
                                  normalizeProductText(categoryOption);

                                return (
                                  <Button
                                    key={categoryOption}
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    onClick={() =>
                                      setForm({ ...form, category: categoryOption })
                                    }
                                  >
                                    {categoryOption}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {categoryOptions.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No categories available yet. Add one below.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newCategory">Add Category</Label>
                        <div className="flex gap-2">
                          <Input
                            id="newCategory"
                            value={newCategory}
                            onChange={(event) => setNewCategory(event.target.value)}
                            placeholder="Enter category name"
                            className="bg-background border-border"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addIncomingCategory();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            onClick={addIncomingCategory}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
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
                  {form.type === "incoming" && (
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input
                        id="expiryDate"
                        type="date"
                        value={form.expiryDate}
                        onChange={(event) =>
                          setForm({ ...form, expiryDate: event.target.value })
                        }
                        className="bg-background border-border text-white [&::-webkit-calendar-picker-indicator]:invert"
                      />
                    </div>
                  )}
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
