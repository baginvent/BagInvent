import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { toast } from "sonner";
import {
  ensureDemoInventoryAndTransactions,
  getStatusFromQuantity,
  isMissingTransactionsTableError,
} from "@/lib/demoData";
import { buildMockTransactions, formatCurrency } from "@/lib/forecastInsights";

type Product = Tables<"products">;
type Transaction = Tables<"transactions">;
type InventoryStatusFilter = "all" | "critical" | "in-stock" | "low-stock";
type ProductQuantityUpdatePlan = {
  id: string;
  nextQuantity: number;
  nextStatus: string;
  previousQuantity: number;
  previousStatus: string;
};
type ProductGroup = {
  batchCount: number;
  category: string;
  earliestExpiry: string | null;
  key: string;
  name: string;
  products: Product[];
  totalQuantity: number;
};

const EMPTY_TRANSACTIONS: Transaction[] = [];
const PRODUCT_SWATCHES = [
  "#2d63c8",
  "#d05454",
  "#46a36b",
  "#8b66cf",
  "#d28c2c",
  "#3b8787",
];
const STATUS_FILTER_OPTIONS: Array<{ label: string; value: InventoryStatusFilter }> = [
  { label: "All Status", value: "all" },
  { label: "In Stock", value: "in-stock" },
  { label: "Low Stock", value: "low-stock" },
  { label: "Critical Stock", value: "critical" },
];

const getProductGroupKey = (product: Pick<Product, "category" | "name">) =>
  `${product.name.trim().toLowerCase()}::${product.category.trim().toLowerCase()}`;

const getProductExpirySortValue = (product: Product) => {
  if (!product.expiry_date) {
    return Number.POSITIVE_INFINITY;
  }

  const value = new Date(`${product.expiry_date}T00:00:00.000Z`).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
};

const sortProductsByBatch = (left: Product, right: Product) =>
  getProductExpirySortValue(left) - getProductExpirySortValue(right) ||
  new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
  left.id.localeCompare(right.id);

const getTodayDateKey = () =>
  new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

const isExpiredProduct = (product: Product, todayDateKey: string) =>
  Boolean(product.expiry_date && product.expiry_date < todayDateKey);

const getDaysUntil = (expiryDate: string | null) => {
  if (!expiryDate) {
    return Number.POSITIVE_INFINITY;
  }

  const expiry = new Date(`${expiryDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
};

const isExpiringSoon = (expiryDate: string | null) => {
  const daysUntilExpiry = getDaysUntil(expiryDate);
  return Number.isFinite(daysUntilExpiry) && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
};

const getProductColor = (name: string) =>
  PRODUCT_SWATCHES[
    [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
      PRODUCT_SWATCHES.length
  ];

const buildUnitPriceByName = (transactions: Transaction[]) => {
  const sortedTransactions = [...transactions].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.created_at.localeCompare(left.created_at),
  );

  const values = new Map<string, number>();

  sortedTransactions.forEach((transaction) => {
    if (values.has(transaction.product_name) || transaction.quantity <= 0) {
      return;
    }

    values.set(transaction.product_name, transaction.amount / transaction.quantity);
  });

  return values;
};

const buildGroupQuantityUpdatePlan = (
  group: ProductGroup,
  nextTotalQuantity: number,
): ProductQuantityUpdatePlan[] => {
  const targetQuantity = Math.max(0, Math.floor(nextTotalQuantity));

  if (targetQuantity === group.totalQuantity) {
    return [];
  }

  const sortedProducts = [...group.products].sort(sortProductsByBatch);

  if (targetQuantity > group.totalQuantity) {
    const targetBatch = sortedProducts[sortedProducts.length - 1];

    if (!targetBatch) {
      return [];
    }

    const nextQuantityForBatch = targetBatch.quantity + (targetQuantity - group.totalQuantity);

    return [
      {
        id: targetBatch.id,
        nextQuantity: nextQuantityForBatch,
        nextStatus: getStatusFromQuantity(nextQuantityForBatch),
        previousQuantity: targetBatch.quantity,
        previousStatus: targetBatch.status,
      },
    ];
  }

  let remainingQuantityToDeduct = group.totalQuantity - targetQuantity;
  const updates: ProductQuantityUpdatePlan[] = [];

  for (const product of sortedProducts) {
    if (remainingQuantityToDeduct === 0) {
      break;
    }

    const deductedQuantity = Math.min(product.quantity, remainingQuantityToDeduct);
    const nextQuantityForBatch = product.quantity - deductedQuantity;

    updates.push({
      id: product.id,
      nextQuantity: nextQuantityForBatch,
      nextStatus: getStatusFromQuantity(nextQuantityForBatch),
      previousQuantity: product.quantity,
      previousStatus: product.status,
    });

    remainingQuantityToDeduct -= deductedQuantity;
  }

  return updates;
};

export default function Inventory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("all");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [isSeeding, setIsSeeding] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [productPendingDelete, setProductPendingDelete] = useState<Product | null>(null);
  const [productGroupPendingDelete, setProductGroupPendingDelete] = useState<ProductGroup | null>(null);

  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const todayDateKey = getTodayDateKey();

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    const seedProducts = async () => {
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

        toast.error(error instanceof Error ? error.message : "Failed to load inventory");
      } finally {
        if (active) {
          setIsSeeding(false);
        }
      }
    };

    seedProducts();

    return () => {
      active = false;
    };
  }, [queryClient, user]);

  const { data: products = [], isLoading: isProductsLoading } = useQuery<Product[]>({
    queryKey: ["products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data;
    },
  });

  const { data: transactionResult, isLoading: isTransactionsLoading } = useQuery<{
    items: Transaction[];
    source: "db" | "mock";
  }>({
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

  const categoryOptions = useMemo(() => {
    const options = new Set<string>();

    products.forEach((product) => {
      if (product.category.trim()) {
        options.add(product.category);
      }
    });

    return ["All", ...Array.from(options).sort((left, right) => left.localeCompare(right))];
  }, [products]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "All" || product.category === category;
        return matchesSearch && matchesCategory;
      }),
    [category, products, search],
  );

  const expiredProducts = useMemo(
    () =>
      filteredProducts
        .filter((product) => isExpiredProduct(product, todayDateKey))
        .sort(sortProductsByBatch),
    [filteredProducts, todayDateKey],
  );

  const activeProducts = useMemo(
    () => filteredProducts.filter((product) => !isExpiredProduct(product, todayDateKey)),
    [filteredProducts, todayDateKey],
  );

  const groupedProducts = useMemo<ProductGroup[]>(() => {
    const groups = new Map<string, ProductGroup>();

    activeProducts.forEach((product) => {
      const key = getProductGroupKey(product);
      const existingGroup = groups.get(key);

      if (existingGroup) {
        existingGroup.products.push(product);
        existingGroup.totalQuantity += product.quantity;
        existingGroup.batchCount += 1;
        return;
      }

      groups.set(key, {
        batchCount: 1,
        category: product.category,
        earliestExpiry: product.expiry_date,
        key,
        name: product.name,
        products: [product],
        totalQuantity: product.quantity,
      });
    });

    return Array.from(groups.values())
      .map((group) => {
        const sortedProducts = [...group.products].sort(sortProductsByBatch);

        return {
          ...group,
          earliestExpiry:
            sortedProducts.find((product) => product.expiry_date)?.expiry_date ?? null,
          products: sortedProducts,
          totalQuantity: sortedProducts.reduce((sum, product) => sum + product.quantity, 0),
        };
      })
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.category.localeCompare(right.category),
      );
  }, [activeProducts]);

  useEffect(() => {
    setQuantityDrafts(
      Object.fromEntries(
        groupedProducts.map((group) => [group.key, String(group.totalQuantity)]),
      ),
    );
  }, [groupedProducts]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((currentGroups) =>
      currentGroups.includes(groupKey)
        ? currentGroups.filter((currentKey) => currentKey !== groupKey)
        : [...currentGroups, groupKey],
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "low":
        return <span className="status-warning">Low Stock</span>;
      case "out":
        return <span className="status-low">Critical Stock</span>;
      default:
        return <span className="status-normal">In Stock</span>;
    }
  };

  const getGroupStatus = (group: ProductGroup) => {
    if (group.products.some((product) => product.status === "warning")) {
      return "warning";
    }

    return getStatusFromQuantity(group.totalQuantity);
  };

  const groupedProductsByStatus = useMemo(
    () =>
      groupedProducts.filter((group) => {
        if (statusFilter === "all") {
          return true;
        }

        const groupStatus = getGroupStatus(group);

        switch (statusFilter) {
          case "in-stock":
            return groupStatus === "normal";
          case "low-stock":
            return groupStatus === "low";
          case "critical":
            return groupStatus === "out";
          default:
            return true;
        }
      }),
    [groupedProducts, statusFilter],
  );

  useEffect(() => {
    const visibleGroupKeys = new Set(groupedProductsByStatus.map((group) => group.key));

    setExpandedGroups((currentGroups) =>
      currentGroups.filter((groupKey) => visibleGroupKeys.has(groupKey)),
    );
  }, [groupedProductsByStatus]);

  const getDraftQuantityValue = (group: ProductGroup) =>
    quantityDrafts[group.key] ?? String(group.totalQuantity);

  const getNormalizedDraftQuantity = (group: ProductGroup) => {
    const draftValue = getDraftQuantityValue(group);

    if (!draftValue.trim()) {
      return group.totalQuantity;
    }

    const parsedValue = Number.parseInt(draftValue, 10);
    return Number.isNaN(parsedValue) ? group.totalQuantity : Math.max(0, parsedValue);
  };

  const isGroupQuantityDirty = (group: ProductGroup) =>
    getNormalizedDraftQuantity(group) !== group.totalQuantity;

  const handleQuantityDraftChange = (groupKey: string, value: string) => {
    const normalizedValue = value.replace(/[^\d]/g, "");

    setQuantityDrafts((currentDrafts) => ({
      ...currentDrafts,
      [groupKey]: normalizedValue,
    }));
  };

  const handleQuantityDraftBlur = (group: ProductGroup) => {
    setQuantityDrafts((currentDrafts) => ({
      ...currentDrafts,
      [group.key]: String(getNormalizedDraftQuantity(group)),
    }));
  };

  const handleAdjustGroupQuantity = (group: ProductGroup, delta: number) => {
    const nextQuantity = Math.max(0, getNormalizedDraftQuantity(group) + delta);

    setQuantityDrafts((currentDrafts) => ({
      ...currentDrafts,
      [group.key]: String(nextQuantity),
    }));
  };

  const saveGroupQuantityMutation = useMutation({
    mutationFn: async ({ group, nextQuantity }: { group: ProductGroup; nextQuantity: number }) => {
      if (!user) {
        throw new Error("You must be signed in to update inventory.");
      }

      const updates = buildGroupQuantityUpdatePlan(group, nextQuantity);
      const appliedUpdates: ProductQuantityUpdatePlan[] = [];

      try {
        for (const update of updates) {
          const { error } = await supabase
            .from("products")
            .update({
              quantity: update.nextQuantity,
              status: update.nextStatus,
            })
            .eq("id", update.id)
            .eq("user_id", user.id);

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
            .eq("id", update.id)
            .eq("user_id", user.id);
        }

        throw error;
      }

      return {
        groupKey: group.key,
        nextQuantity,
        productName: group.name,
      };
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update inventory quantity.");
    },
    onSuccess: async ({ groupKey, nextQuantity, productName }) => {
      setQuantityDrafts((currentDrafts) => ({
        ...currentDrafts,
        [groupKey]: String(nextQuantity),
      }));

      toast.success(`Saved quantity changes for ${productName}.`);
      await queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      await queryClient.refetchQueries({ queryKey: ["products", user?.id] });
    },
  });

  const handleSaveGroupQuantity = (group: ProductGroup) => {
    const nextQuantity = getNormalizedDraftQuantity(group);

    if (nextQuantity === group.totalQuantity) {
      return;
    }

    saveGroupQuantityMutation.mutate({
      group,
      nextQuantity,
    });
  };

  const deleteExpiredProductMutation = useMutation({
    mutationFn: async (product: Product) => {
      if (!user) {
        throw new Error("You must be signed in to delete inventory.");
      }

      const { error: detachTransactionsError } = await supabase
        .from("transactions")
        .update({ product_id: null })
        .eq("product_id", product.id)
        .eq("user_id", user.id);

      if (detachTransactionsError && !isMissingTransactionsTableError(detachTransactionsError)) {
        throw detachTransactionsError;
      }

      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id)
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      return product;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete expired product.");
    },
    onSuccess: (deletedProduct) => {
      setProductPendingDelete(null);
      toast.success(`Deleted expired batch for ${deletedProduct.name}.`);
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
    },
  });

  const deleteProductGroupMutation = useMutation({
    mutationFn: async (group: ProductGroup) => {
      if (!user) {
        throw new Error("You must be signed in to delete inventory.");
      }

      // Detach transactions from all products in the group
      const { error: detachTransactionsError } = await supabase
        .from("transactions")
        .update({ product_id: null })
        .in(
          "product_id",
          group.products.map((p) => p.id),
        )
        .eq("user_id", user.id);

      if (detachTransactionsError && !isMissingTransactionsTableError(detachTransactionsError)) {
        throw detachTransactionsError;
      }

      // Delete all products in the group
      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .in(
          "id",
          group.products.map((p) => p.id),
        )
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      return group;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete product batch.");
    },
    onSuccess: (deletedGroup) => {
      setProductGroupPendingDelete(null);
      const message = `Deleted all ${deletedGroup.batchCount} batch(es) of ${deletedGroup.name}. Linked transactions were kept.`;
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
    },
  });

  const unitPriceByName = useMemo(() => buildUnitPriceByName(transactions), [transactions]);
  const totalUnits = useMemo(
    () => groupedProducts.reduce((sum, group) => sum + group.totalQuantity, 0),
    [groupedProducts],
  );
  const lowStockGroups = useMemo(
    () => groupedProducts.filter((group) => getGroupStatus(group) === "low").length,
    [groupedProducts],
  );
  const expiringSoonCount = useMemo(
    () =>
      groupedProducts.filter((group) => {
        const daysUntilExpiry = getDaysUntil(group.earliestExpiry);
        return Number.isFinite(daysUntilExpiry) && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
      }).length,
    [groupedProducts],
  );
  const inventoryValue = useMemo(
    () =>
      groupedProducts.reduce(
        (sum, group) => sum + group.totalQuantity * (unitPriceByName.get(group.name) ?? 0),
        0,
      ),
    [groupedProducts, unitPriceByName],
  );
  const expiredUnits = useMemo(
    () => expiredProducts.reduce((total, product) => total + product.quantity, 0),
    [expiredProducts],
  );
  const isLoading = isProductsLoading || isTransactionsLoading || isSeeding;

  const getActiveInventoryEmptyState = () => {
    if (products.length === 0) {
      return "Products will appear here after you record an incoming transaction.";
    }

    if (filteredProducts.length === 0) {
      return "No inventory matches the current search or category filter.";
    }

    if (statusFilter !== "all" && groupedProducts.length > 0 && groupedProductsByStatus.length === 0) {
      return "No active inventory matches the selected status filter.";
    }

    return "No active inventory matches the current filters. Expired batches are listed below.";
  };

  return (
    <DashboardLayout pageLabel="Inventory">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-[2rem] font-medium text-[#171717]">Inventory Management</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="workspace-action" onClick={() => navigate("/transactions")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </button>
            <button className="workspace-action" onClick={() => navigate("/transactions")}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total products" value={totalUnits.toLocaleString()} badgeText="12% From last month" />
          <StatCard
            title="Low Stock Items"
            value={lowStockGroups}
            badgeText="Attention!"
            variant="warning"
          />
          <StatCard
            title="Expiring Soon"
            value={expiringSoonCount}
            badgeText="Alert!"
            variant="danger"
          />
          <StatCard
            title="Inventory Value"
            value={formatCurrency(inventoryValue)}
            badgeText="Estimated value"
            variant="success"
          />
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e6e6e]" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 rounded-[4px] border-0 bg-[#efebe6] pl-10 text-[#171717] focus-visible:ring-1 focus-visible:ring-[#cf5a5a] focus-visible:ring-offset-0"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 w-full rounded-[4px] border-0 bg-[#efebe6] text-[#171717] lg:w-[220px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="border-[#d9d2c9] bg-[#f7f4ef] text-[#171717]">
              {categoryOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="workspace-table">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/40 hover:bg-transparent">
                  <TableHead className="text-[#4c4c4c]">Product</TableHead>
                  <TableHead className="text-[#4c4c4c]">Category</TableHead>
                  <TableHead className="text-[#4c4c4c]">Stock</TableHead>
                  <TableHead className="text-[#4c4c4c]">Price</TableHead>
                  <TableHead className="text-[#4c4c4c]">Expiry</TableHead>
                  <TableHead className="text-[#4c4c4c]">
                    <Select
                      value={statusFilter}
                      onValueChange={(value) => setStatusFilter(value as InventoryStatusFilter)}
                    >
                      <SelectTrigger
                        aria-label="Filter inventory by status"
                        className="h-8 w-[150px] rounded-[4px] border border-white/30 bg-transparent px-3 text-xs font-medium text-[#4c4c4c] shadow-none hover:bg-white/10 focus:ring-1 focus:ring-[#cf5a5a] focus:ring-offset-0"
                      >
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent className="border-[#d9d2c9] bg-[#f7f4ef] text-[#171717]">
                        {STATUS_FILTER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead className="text-right text-[#4c4c4c]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedProductsByStatus.length === 0 ? (
                  <TableRow className="border-white/0">
                    <TableCell colSpan={7} className="py-12 text-center text-[#686868]">
                      {getActiveInventoryEmptyState()}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedProductsByStatus.map((group) => {
                    const isExpanded = expandedGroups.includes(group.key);
                    const hasMultipleBatches = group.batchCount > 1;
                    const draftQuantity = getDraftQuantityValue(group);
                    const isSavingGroup =
                      saveGroupQuantityMutation.isPending &&
                      saveGroupQuantityMutation.variables?.group.key === group.key;
                    const hasUnsavedQuantityChange = isGroupQuantityDirty(group);

                    return (
                      <Fragment key={group.key}>
                        <TableRow className="border-b border-white/25 hover:bg-white/15">
                          <TableCell className="font-medium text-[#171717]">
                            {hasMultipleBatches ? (
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.key)}
                                aria-expanded={isExpanded}
                                className="-m-2 flex w-full items-center gap-3 rounded-[4px] p-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#cf5a5a]"
                              >
                                <div
                                  className="product-thumb text-white"
                                  style={{ backgroundColor: getProductColor(group.name) }}
                                >
                                  {group.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-[#666]" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-[#666]" />
                                    )}
                                    <span>{group.name}</span>
                                  </div>
                                  <p className="text-xs text-[#666]">
                                    {group.batchCount} stock batches
                                  </p>
                                </div>
                              </button>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div
                                  className="product-thumb text-white"
                                  style={{ backgroundColor: getProductColor(group.name) }}
                                >
                                  {group.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <span>{group.name}</span>
                                  <p className="text-xs text-[#666]">Single batch</p>
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-[#444]">{group.category}</TableCell>
                          <TableCell className="text-[#171717]">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAdjustGroupQuantity(group, -1)}
                                disabled={saveGroupQuantityMutation.isPending}
                                className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-white/30 bg-white/10 text-sm font-medium text-[#171717] transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Decrease ${group.name} quantity`}
                              >
                                -
                              </button>
                              <Input
                                inputMode="numeric"
                                aria-label={`${group.name} quantity`}
                                value={draftQuantity}
                                onChange={(event) =>
                                  handleQuantityDraftChange(group.key, event.target.value)
                                }
                                onBlur={() => handleQuantityDraftBlur(group)}
                                disabled={saveGroupQuantityMutation.isPending}
                                className="h-8 w-20 rounded-[4px] border-white/30 bg-white/10 px-2 text-center text-sm text-[#171717] focus-visible:ring-1 focus-visible:ring-[#cf5a5a] focus-visible:ring-offset-0"
                              />
                              <button
                                type="button"
                                onClick={() => handleAdjustGroupQuantity(group, 1)}
                                disabled={saveGroupQuantityMutation.isPending}
                                className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-white/30 bg-white/10 text-sm font-medium text-[#171717] transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Increase ${group.name} quantity`}
                              >
                                +
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-[#171717]">
                            {formatCurrency(unitPriceByName.get(group.name) ?? 0)}
                          </TableCell>
                          <TableCell className="text-[#444]">{group.earliestExpiry ?? "-"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              {getStatusBadge(getGroupStatus(group))}
                              {isExpiringSoon(group.earliestExpiry) ? (
                                <span className="status-warning">Expiring Soon</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleSaveGroupQuantity(group)}
                                disabled={!hasUnsavedQuantityChange || saveGroupQuantityMutation.isPending}
                                className="h-8 rounded-[4px] bg-[#6b95df] px-3 text-xs font-medium text-white hover:bg-[#5f88d1]"
                              >
                                {isSavingGroup ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving
                                  </>
                                ) : (
                                  "Save Changes"
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setProductGroupPendingDelete(group)}
                                disabled={deleteProductGroupMutation.isPending}
                                className="h-8 text-[#b34d4d] hover:bg-white/50 hover:text-[#b34d4d]"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {hasMultipleBatches && isExpanded ? (
                          <TableRow className="border-b border-white/25 bg-white/20 hover:bg-white/20">
                            <TableCell colSpan={7} className="px-4 py-4">
                              <div className="grid gap-3 md:grid-cols-3">
                                {group.products.map((product, index) => (
                                  <div key={product.id} className="rounded-[4px] bg-[#efebe6] p-3">
                                    <p className="text-sm font-medium text-[#171717]">
                                      Batch {index + 1}
                                    </p>
                                    <p className="mt-1 text-xs text-[#666]">
                                      Expiry: {product.expiry_date ?? "-"}
                                    </p>
                                    <p className="text-xs text-[#666]">Stock: {product.quantity}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      {getStatusBadge(product.status)}
                                      {isExpiringSoon(product.expiry_date) ? (
                                        <span className="status-warning">Expiring Soon</span>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="workspace-panel">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#cf5a5a]" />
                <h2 className="text-xl font-medium text-[#171717]">Expired Products</h2>
              </div>
              <p className="mt-1 text-sm text-[#666]">
                Remove expired batches from inventory while keeping transaction history.
              </p>
            </div>
            <div className="rounded-[4px] bg-[#efebe6] px-4 py-3 text-sm text-[#171717]">
              <p className="font-medium">{expiredProducts.length} expired batches</p>
              <p className="text-[#666]">{expiredUnits} units marked expired</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/40 hover:bg-transparent">
                  <TableHead className="text-[#4c4c4c]">Product</TableHead>
                  <TableHead className="text-[#4c4c4c]">Category</TableHead>
                  <TableHead className="text-[#4c4c4c]">Quantity</TableHead>
                  <TableHead className="text-[#4c4c4c]">Expired On</TableHead>
                  <TableHead className="text-[#4c4c4c]">Status</TableHead>
                  <TableHead className="text-right text-[#4c4c4c]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiredProducts.length === 0 ? (
                  <TableRow className="border-white/0">
                    <TableCell colSpan={6} className="py-10 text-center text-[#686868]">
                      No expired products match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  expiredProducts.map((product) => (
                    <TableRow key={product.id} className="border-b border-white/25 hover:bg-white/15">
                      <TableCell className="font-medium text-[#171717]">{product.name}</TableCell>
                      <TableCell className="text-[#444]">{product.category}</TableCell>
                      <TableCell className="text-[#171717]">{product.quantity}</TableCell>
                      <TableCell className="text-[#444]">{product.expiry_date}</TableCell>
                      <TableCell>
                        <span className="status-low">Expired</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setProductPendingDelete(product)}
                          disabled={deleteExpiredProductMutation.isPending}
                          className="h-8 text-[#b34d4d] hover:bg-white/50 hover:text-[#b34d4d]"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(productPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteExpiredProductMutation.isPending) {
            setProductPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent className="border-[#d9d2c9] bg-[#f7f4ef] text-[#171717]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expired product?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#666]">
              {productPendingDelete
                ? `This will permanently remove the expired ${productPendingDelete.name} batch from inventory. Linked transactions will be kept, but detached from this product record.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteExpiredProductMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#cf5a5a] text-white hover:bg-[#c55252]"
              disabled={!productPendingDelete || deleteExpiredProductMutation.isPending}
              onClick={(event) => {
                event.preventDefault();

                if (!productPendingDelete) {
                  return;
                }

                deleteExpiredProductMutation.mutate(productPendingDelete);
              }}
            >
              {deleteExpiredProductMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete batch"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Product Group Confirmation Dialog */}
      <AlertDialog open={Boolean(productGroupPendingDelete)}>
        <AlertDialogContent className="text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Product Batch?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/90">
              {productGroupPendingDelete
                ? `This will permanently remove all ${productGroupPendingDelete.batchCount} batch(es) of ${productGroupPendingDelete.name} from inventory. Linked transactions will be kept, but detached from this product record.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteProductGroupMutation.isPending}
              onClick={() => setProductGroupPendingDelete(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#cf5a5a] text-white hover:bg-[#c55252]"
              disabled={!productGroupPendingDelete || deleteProductGroupMutation.isPending}
              onClick={(event) => {
                event.preventDefault();

                if (!productGroupPendingDelete) {
                  return;
                }

                deleteProductGroupMutation.mutate(productGroupPendingDelete);
              }}
            >
              {deleteProductGroupMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete batch"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
