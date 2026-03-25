import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type ProductSeed = Omit<TablesInsert<"products">, "status" | "user_id">;
type Transaction = Tables<"transactions">;
type TransactionSeed = {
  amount: number;
  date: string;
  product_name: string;
  quantity: number;
  reference: string;
  type: "incoming" | "sale";
};
type MockTransactionInput = {
  amount: number;
  date: string;
  productId: string | null;
  productName: string;
  quantity: number;
  reference: string;
  type: Transaction["type"];
  userId: string;
};

const MOCK_TRANSACTIONS_STORAGE_PREFIX = "baginvent:mock-transactions:";

export const demoProducts: ProductSeed[] = [
  {
    category: "Dry Goods",
    expiry_date: "2026-10-15",
    name: "Jasmine Rice 5kg",
    quantity: 48,
  },
  {
    category: "Canned Goods",
    expiry_date: "2027-12-01",
    name: "Canned Sardines",
    quantity: 26,
  },
  {
    category: "Dairy",
    expiry_date: "2026-03-28",
    name: "Whole Milk 1L",
    quantity: 9,
  },
  {
    category: "Bakery",
    expiry_date: "2026-03-23",
    name: "White Bread Loaf",
    quantity: 6,
  },
  {
    category: "Meat",
    expiry_date: "2026-07-12",
    name: "Frozen Chicken Breast",
    quantity: 14,
  },
  {
    category: "Beverages",
    expiry_date: null,
    name: "Bottled Water 500ml",
    quantity: 60,
  },
  {
    category: "Snacks",
    expiry_date: "2026-09-05",
    name: "Sea Salt Crackers",
    quantity: 22,
  },
];

export const demoTransactions: TransactionSeed[] = [
  {
    amount: 4200,
    date: "2026-03-14",
    product_name: "Jasmine Rice 5kg",
    quantity: 20,
    reference: "PO-2026-0314-001",
    type: "incoming",
  },
  {
    amount: 540,
    date: "2026-03-15",
    product_name: "Whole Milk 1L",
    quantity: 6,
    reference: "SALE-2026-0315-014",
    type: "sale",
  },
  {
    amount: 1120,
    date: "2026-03-16",
    product_name: "Frozen Chicken Breast",
    quantity: 8,
    reference: "SALE-2026-0316-021",
    type: "sale",
  },
  {
    amount: 890,
    date: "2026-03-17",
    product_name: "Sea Salt Crackers",
    quantity: 10,
    reference: "SALE-2026-0317-007",
    type: "sale",
  },
  {
    amount: 2400,
    date: "2026-03-18",
    product_name: "Canned Sardines",
    quantity: 24,
    reference: "PO-2026-0318-003",
    type: "incoming",
  },
  {
    amount: 360,
    date: "2026-03-19",
    product_name: "White Bread Loaf",
    quantity: 6,
    reference: "SALE-2026-0319-018",
    type: "sale",
  },
  {
    amount: 300,
    date: "2026-03-19",
    product_name: "Bottled Water 500ml",
    quantity: 15,
    reference: "SALE-2026-0319-024",
    type: "sale",
  },
  {
    amount: 980,
    date: "2026-03-20",
    product_name: "Jasmine Rice 5kg",
    quantity: 4,
    reference: "SALE-2026-0320-011",
    type: "sale",
  },
];

export const getStatusFromQuantity = (quantity: number) => {
  if (quantity === 0) {
    return "out";
  }

  if (quantity <= 10) {
    return "low";
  }

  return "normal";
};

const mapProductsByName = (products: Pick<Tables<"products">, "id" | "name">[]) =>
  new Map(products.map((product) => [product.name, product.id]));

const sortTransactionsNewestFirst = (left: Transaction, right: Transaction) =>
  right.date.localeCompare(left.date) || right.created_at.localeCompare(left.created_at);

const getMockTransactionsStorageKey = (userId: string) =>
  `${MOCK_TRANSACTIONS_STORAGE_PREFIX}${userId}`;

const readStoredMockTransactions = (userId: string): Transaction[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(getMockTransactionsStorageKey(userId));

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? (parsedValue as Transaction[]) : [];
  } catch {
    return [];
  }
};

const writeStoredMockTransactions = (userId: string, transactions: Transaction[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getMockTransactionsStorageKey(userId),
    JSON.stringify(transactions.sort(sortTransactionsNewestFirst)),
  );
};

const buildSeedTransaction = (transaction: TransactionSeed, index: number, userId: string): Transaction => {
  const createdAt = `${transaction.date}T${String(10 + (index % 6)).padStart(2, "0")}:00:00.000Z`;

  return {
    amount: transaction.amount,
    created_at: createdAt,
    date: transaction.date,
    id: `mock-transaction-${index + 1}`,
    product_id: null,
    product_name: transaction.product_name,
    quantity: transaction.quantity,
    reference: transaction.reference,
    type: transaction.type,
    updated_at: createdAt,
    user_id: userId,
  };
};

const buildMockTimestamp = (date: string) => {
  const timeFragment = new Date().toISOString().split("T")[1] ?? "00:00:00.000Z";
  return `${date}T${timeFragment}`;
};

const generateMockTransactionId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `mock-user-transaction-${crypto.randomUUID()}`
    : `mock-user-transaction-${Date.now()}`;

export const getMockTransactions = (userId: string): Transaction[] =>
  [...demoTransactions.map((transaction, index) => buildSeedTransaction(transaction, index, userId)), ...readStoredMockTransactions(userId)].sort(
    sortTransactionsNewestFirst,
  );

export const addMockTransaction = ({
  amount,
  date,
  productId,
  productName,
  quantity,
  reference,
  type,
  userId,
}: MockTransactionInput): Transaction => {
  const timestamp = buildMockTimestamp(date);
  const nextTransaction: Transaction = {
    amount,
    created_at: timestamp,
    date,
    id: generateMockTransactionId(),
    product_id: productId,
    product_name: productName,
    quantity,
    reference,
    type,
    updated_at: timestamp,
    user_id: userId,
  };

  writeStoredMockTransactions(userId, [...readStoredMockTransactions(userId), nextTransaction]);

  return nextTransaction;
};

export const isMissingTransactionsTableError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42P01" ||
    maybeError.message?.toLowerCase().includes("transactions") === true
  );
};

export async function ensureDemoProducts(userId: string) {
  const { data: existingProducts, error } = await supabase
    .from("products")
    .select("id, name")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  if (existingProducts.length > 0) {
    return { productIdsByName: mapProductsByName(existingProducts), seeded: false };
  }

  const { data: insertedProducts, error: insertError } = await supabase
    .from("products")
    .insert(
      demoProducts.map((product) => ({
        ...product,
        status: getStatusFromQuantity(product.quantity),
        user_id: userId,
      })),
    )
    .select("id, name");

  if (insertError) {
    throw insertError;
  }

  return { productIdsByName: mapProductsByName(insertedProducts), seeded: true };
}

export async function ensureDemoTransactions(userId: string) {
  const { productIdsByName } = await ensureDemoProducts(userId);
  const { data: existingTransactions, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    if (isMissingTransactionsTableError(error)) {
      return { seededProducts: false, seededTransactions: false };
    }

    throw error;
  }

  if (existingTransactions.length > 0) {
    return { seededProducts: false, seededTransactions: false };
  }

  const { error: insertError } = await supabase.from("transactions").insert(
    demoTransactions.map((transaction) => ({
      ...transaction,
      product_id: productIdsByName.get(transaction.product_name) ?? null,
      user_id: userId,
    })),
  );

  if (insertError) {
    if (isMissingTransactionsTableError(insertError)) {
      return { seededProducts: false, seededTransactions: false };
    }

    throw insertError;
  }

  return { seededProducts: false, seededTransactions: true };
}

export async function ensureDemoInventoryAndTransactions(userId: string) {
  const productResult = await ensureDemoProducts(userId);
  const { data: existingTransactions, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    if (isMissingTransactionsTableError(error)) {
      return {
        seededProducts: productResult.seeded,
        seededTransactions: false,
      };
    }

    throw error;
  }

  if (existingTransactions.length > 0) {
    return {
      seededProducts: productResult.seeded,
      seededTransactions: false,
    };
  }

  const { error: insertError } = await supabase.from("transactions").insert(
    demoTransactions.map((transaction) => ({
      ...transaction,
      product_id: productResult.productIdsByName.get(transaction.product_name) ?? null,
      user_id: userId,
    })),
  );

  if (insertError) {
    if (isMissingTransactionsTableError(insertError)) {
      return {
        seededProducts: productResult.seeded,
        seededTransactions: false,
      };
    }

    throw insertError;
  }

  return {
    seededProducts: productResult.seeded,
    seededTransactions: true,
  };
}
