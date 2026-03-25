import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ensureDemoInventoryAndTransactions,
  getStatusFromQuantity,
  isMissingTransactionsTableError,
} from "@/lib/demoData";

type Product = Tables<"products">;
type ProductGroup = {
  batchCount: number;
  category: string;
  earliestExpiry: string | null;
  key: string;
  name: string;
  products: Product[];
  totalQuantity: number;
};

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

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [isSeeding, setIsSeeding] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [productPendingDelete, setProductPendingDelete] = useState<Product | null>(null);

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
          toast.success("Mock inventory and transactions added.");
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

  const { data: products = [], isLoading } = useQuery<Product[]>({
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
          earliestExpiry: sortedProducts.find((product) => product.expiry_date)?.expiry_date ?? null,
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
    const visibleGroupKeys = new Set(groupedProducts.map((group) => group.key));

    setExpandedGroups((currentGroups) =>
      currentGroups.filter((groupKey) => visibleGroupKeys.has(groupKey)),
    );
  }, [groupedProducts]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "low":
        return <span className="status-warning">Low Stock</span>;
      case "out":
        return <span className="status-low">Out of Stock</span>;
      case "warning":
        return <span className="status-warning">Expiring Soon</span>;
      default:
        return <span className="status-normal">Normal</span>;
    }
  };

  const getGroupStatus = (group: ProductGroup) => {
    if (group.products.some((product) => product.status === "warning")) {
      return "warning";
    }

    return getStatusFromQuantity(group.totalQuantity);
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((currentGroups) =>
      currentGroups.includes(groupKey)
        ? currentGroups.filter((currentKey) => currentKey !== groupKey)
        : [...currentGroups, groupKey],
    );
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

  const expiredUnits = useMemo(
    () => expiredProducts.reduce((total, product) => total + product.quantity, 0),
    [expiredProducts],
  );

  const getActiveInventoryEmptyState = () => {
    if (products.length === 0) {
      return "Products will appear here after you record an incoming transaction.";
    }

    if (filteredProducts.length === 0) {
      return "No inventory matches the current search or category filter.";
    }

    return "No active inventory matches the current filters. Expired batches are listed below.";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
          <p className="mt-1 text-muted-foreground">
            Inventory is driven by incoming and sale transactions.
          </p>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="border-border bg-card pl-10"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full border-border bg-card md:w-48">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card">
              {categoryOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="chart-container overflow-hidden">
          {isLoading || isSeeding ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Product Name</TableHead>
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Quantity</TableHead>
                  <TableHead className="text-muted-foreground">Expiry Date</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {getActiveInventoryEmptyState()}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedProducts.map((group) => {
                    const isExpanded = expandedGroups.includes(group.key);
                    const hasMultipleBatches = group.batchCount > 1;
                    const singleProduct = group.products[0];

                    return (
                      <Fragment key={group.key}>
                        <TableRow className="border-border hover:bg-muted/30">
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-start gap-2">
                              {hasMultipleBatches ? (
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(group.key)}
                                  className="mt-0.5 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                                  aria-expanded={isExpanded}
                                  aria-label={`${isExpanded ? "Hide" : "Show"} batches for ${group.name}`}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              ) : (
                                <span className="mt-0.5 h-4 w-4" />
                              )}
                              <div>
                                <p className="font-medium text-foreground">{group.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {hasMultipleBatches ? `${group.batchCount} stock batches` : "Single batch"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{group.category}</TableCell>
                          <TableCell className="text-foreground">{group.totalQuantity}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {hasMultipleBatches ? (
                              <div className="space-y-1">
                                <p>{group.earliestExpiry || "-"}</p>
                                <p className="text-xs text-muted-foreground">Earliest expiry</p>
                              </div>
                            ) : (
                              singleProduct.expiry_date || "-"
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(getGroupStatus(group))}</TableCell>
                        </TableRow>
                        {hasMultipleBatches && isExpanded && (
                          <TableRow className="border-border bg-muted/10 hover:bg-muted/10">
                            <TableCell colSpan={5} className="px-4 py-4">
                              <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                                <div className="mb-3 grid grid-cols-1 gap-2 text-xs uppercase tracking-wide text-muted-foreground md:grid-cols-[1.8fr_1fr_1fr]">
                                  <span>Batch</span>
                                  <span>Expiry Date</span>
                                  <span>Stock</span>
                                </div>
                                <div className="space-y-3">
                                  {group.products.map((product, index) => (
                                    <div
                                      key={product.id}
                                      className="grid grid-cols-1 gap-3 rounded-md border border-border/60 bg-card/70 p-3 md:grid-cols-[1.8fr_1fr_1fr] md:items-center"
                                    >
                                      <div>
                                        <p className="text-sm font-medium text-foreground">
                                          Batch {index + 1}
                                        </p>
                                        <div className="mt-1">{getStatusBadge(product.status)}</div>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {product.expiry_date || "-"}
                                      </p>
                                      <p className="text-sm text-foreground">{product.quantity}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="chart-container overflow-hidden border-destructive/20">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="text-xl font-semibold text-foreground">Expired Products</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Remove expired batches from inventory while keeping transaction history.
              </p>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{expiredProducts.length} expired batches</p>
              <p className="text-muted-foreground">{expiredUnits} units marked expired</p>
            </div>
          </div>

          {isLoading || isSeeding ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Product Name</TableHead>
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Quantity</TableHead>
                  <TableHead className="text-muted-foreground">Expired On</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No expired products match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  expiredProducts.map((product) => (
                    <TableRow key={product.id} className="border-border hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">{product.category}</TableCell>
                      <TableCell className="text-foreground">{product.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">{product.expiry_date}</TableCell>
                      <TableCell>
                        <span className="status-low">Expired</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setProductPendingDelete(product)}
                          disabled={deleteExpiredProductMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expired product?</AlertDialogTitle>
            <AlertDialogDescription>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
    </DashboardLayout>
  );
}
