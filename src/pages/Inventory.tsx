import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Edit2, Trash2, Filter, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ensureDemoInventoryAndTransactions, getStatusFromQuantity } from "@/lib/demoData";

type Product = Tables<"products">;

const defaultForm = {
  category: "Uncategorized",
  expiry_date: "",
  name: "",
  quantity: 0,
};

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [isSeeding, setIsSeeding] = useState(false);

  const { user } = useAuthContext();
  const queryClient = useQueryClient();

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
    const options = new Set<string>(["Uncategorized"]);

    products.forEach((product) => {
      if (product.category.trim()) {
        options.add(product.category);
      }
    });

    customCategories.forEach((customCategory) => {
      if (customCategory.trim()) {
        options.add(customCategory);
      }
    });

    return ["All", ...Array.from(options).sort((left, right) => left.localeCompare(right))];
  }, [customCategories, products]);

  const formCategoryOptions = useMemo(
    () => categoryOptions.filter((option) => option !== "All"),
    [categoryOptions],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "All" || product.category === category;
        return matchesSearch && matchesCategory;
      }),
    [category, products, search],
  );

  const addMutation = useMutation({
    mutationFn: async (product: typeof defaultForm) => {
      const { error } = await supabase.from("products").insert({
        category: product.category,
        expiry_date: product.expiry_date || null,
        name: product.name.trim(),
        quantity: product.quantity,
        status: getStatusFromQuantity(product.quantity),
        user_id: user!.id,
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      toast.success("Product added successfully");
      resetForm();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to add product");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (product: typeof defaultForm & { id: string }) => {
      const { error } = await supabase
        .from("products")
        .update({
          category: product.category,
          expiry_date: product.expiry_date || null,
          name: product.name.trim(),
          quantity: product.quantity,
          status: getStatusFromQuantity(product.quantity),
        })
        .eq("id", product.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      toast.success("Product updated");
      resetForm();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to update product");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", user?.id] });
      toast.success("Product deleted");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete product");
    },
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingProduct(null);
    setDialogOpen(false);
    setNewCategory("");
  };

  const addCategory = () => {
    const trimmedCategory = newCategory.trim();

    if (!trimmedCategory) {
      return;
    }

    if (!formCategoryOptions.includes(trimmedCategory)) {
      setCustomCategories((currentCategories) => [...currentCategories, trimmedCategory]);
    }

    setForm((currentForm) => ({ ...currentForm, category: trimmedCategory }));
    setNewCategory("");
  };

  const removeCategory = (categoryToRemove: string) => {
    setCustomCategories((currentCategories) =>
      currentCategories.filter((currentCategory) => currentCategory !== categoryToRemove),
    );

    if (category === categoryToRemove) {
      setCategory("All");
    }

    if (form.category === categoryToRemove) {
      setForm((currentForm) => ({ ...currentForm, category: "Uncategorized" }));
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, ...form });
      return;
    }

    addMutation.mutate(form);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      category: product.category,
      expiry_date: product.expiry_date || "",
      name: product.name,
      quantity: product.quantity,
    });
    setDialogOpen(true);
  };

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
            <p className="text-muted-foreground mt-1">Manage your product stock</p>
          </div>
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
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {editingProduct ? "Edit Product" : "Add Product"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Product name"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(value) => setForm({ ...form, category: value })}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {formCategoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                          addCategory();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={addCategory}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Custom Categories</Label>
                  {customCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No custom categories added yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {customCategories.map((customCategory) => (
                        <div
                          key={customCategory}
                          className="flex items-center gap-1 rounded-md bg-muted px-3 py-1"
                        >
                          <span className="text-sm text-foreground">{customCategory}</span>
                          <button
                            type="button"
                            onClick={() => removeCategory(customCategory)}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            aria-label={`Remove ${customCategory}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={0}
                    value={form.quantity}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        quantity: Number.parseInt(event.target.value, 10) || 0,
                      })
                    }
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry Date</Label>
                  <Input
                    id="expiry"
                    type="date"
                    value={form.expiry_date}
                    onChange={(event) => setForm({ ...form, expiry_date: event.target.value })}
                    className="bg-background border-border text-white [&::-webkit-calendar-picker-indicator]:invert"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={addMutation.isPending || updateMutation.isPending}
                >
                  {(addMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingProduct ? "Update Product" : "Add Product"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full md:w-48 bg-card border-border">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
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
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No products found. Add your first product!
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id} className="border-border hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">{product.category}</TableCell>
                      <TableCell className="text-foreground">{product.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.expiry_date || "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEdit(product)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteMutation.mutate(product.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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
