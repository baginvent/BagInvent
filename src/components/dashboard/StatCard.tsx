import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  badgeText?: string;
  variant?: "default" | "warning" | "danger" | "success";
  onClick?: () => void;
}

const badgeStyles = {
  default: "bg-[#d7f6e3] text-[#2f7b54]",
  warning: "bg-[#fff2ab] text-[#8a6b08]",
  danger: "bg-[#ffd9d9] text-[#b34d4d]",
  success: "bg-[#d7f6e3] text-[#2f7b54]",
};

const iconStyles = {
  default: "bg-white/70 text-[#717171]",
  warning: "bg-white/70 text-[#8a6b08]",
  danger: "bg-white/70 text-[#b34d4d]",
  success: "bg-white/70 text-[#2f7b54]",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  badgeText,
  variant = "default",
  onClick,
}: StatCardProps) {
  const resolvedBadge =
    badgeText ??
    (trend
      ? `${trend.isPositive ? "+" : "-"}${Math.abs(trend.value)}% from last month`
      : undefined);

  return (
    <div
      className={cn(
        "stat-card space-y-4",
        onClick && "cursor-pointer transition-transform duration-200 hover:-translate-y-0.5",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-[#373737]">{title}</p>
          <p className="text-[2rem] font-medium leading-none text-[#171717]">{value}</p>
        </div>
        {Icon ? (
          <div className={cn("rounded-full p-2", iconStyles[variant])}>
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>

      {resolvedBadge ? (
        <span className={cn("soft-badge", badgeStyles[variant])}>{resolvedBadge}</span>
      ) : null}
    </div>
  );
}
