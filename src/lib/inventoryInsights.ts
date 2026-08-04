export type InventoryThresholds = {
  critical: number;
  expiryDays: number;
  low: number;
};

export type StockLevel = "out" | "critical" | "low" | "normal";

export const DEFAULT_INVENTORY_THRESHOLDS: InventoryThresholds = {
  critical: 3,
  expiryDays: 30,
  low: 10,
};

const storageKey = (userId?: string) => `baginvent:inventory-thresholds:${userId ?? "guest"}`;

export const getInventoryThresholds = (userId?: string): InventoryThresholds => {
  if (typeof window === "undefined") return DEFAULT_INVENTORY_THRESHOLDS;

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "{}");
    const critical = Math.max(1, Math.floor(Number(stored.critical) || DEFAULT_INVENTORY_THRESHOLDS.critical));
    const low = Math.max(critical + 1, Math.floor(Number(stored.low) || DEFAULT_INVENTORY_THRESHOLDS.low));
    const expiryDays = Math.max(1, Math.floor(Number(stored.expiryDays) || DEFAULT_INVENTORY_THRESHOLDS.expiryDays));
    return { critical, low, expiryDays };
  } catch {
    return DEFAULT_INVENTORY_THRESHOLDS;
  }
};

export const saveInventoryThresholds = (userId: string | undefined, thresholds: InventoryThresholds) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(thresholds));
  window.dispatchEvent(new Event("baginvent:inventory-thresholds"));
};

export const getStockLevel = (quantity: number, thresholds: InventoryThresholds): StockLevel => {
  if (quantity <= 0) return "out";
  if (quantity <= thresholds.critical) return "critical";
  if (quantity <= thresholds.low) return "low";
  return "normal";
};

export const getDaysUntilExpiry = (expiryDate: string | null) => {
  if (!expiryDate) return Number.POSITIVE_INFINITY;
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
};
