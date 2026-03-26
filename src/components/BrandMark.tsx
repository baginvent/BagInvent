import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  tone?: "dark" | "light";
}

export function BrandMark({ className, tone = "dark" }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden",
        tone === "light" && "rounded-2xl bg-[#f6f3ee] p-2 shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      <img
        alt="Bag-Invent logo"
        className="h-full w-full object-contain"
        src="/bag-invent-logo.png"
      />
    </div>
  );
}

interface BrandLogoProps {
  className?: string;
  tone?: "dark" | "light";
}

export function BrandLogo({ className, tone = "dark" }: BrandLogoProps) {
  const primaryText = tone === "dark" ? "text-[#c94f4f]" : "text-[#df8a8a]";
  const secondaryText = tone === "dark" ? "text-[#1c1c1c]" : "text-[#f0ebe3]";

  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      <BrandMark className="h-[78px] w-[78px] sm:h-[88px] sm:w-[88px]" tone={tone} />
      <div className="space-y-1 text-left">
        <div
          className={cn(
            "text-lg font-semibold uppercase tracking-[0.34em] sm:text-[1.55rem]",
            primaryText,
          )}
        >
          BAG-INVENT
        </div>
        <div className={cn("text-xs uppercase tracking-[0.42em] sm:text-sm", primaryText)}>
          AI-POWERED
        </div>
        <div className={cn("text-sm font-semibold sm:text-[0.95rem]", secondaryText)}>
          Inventory Management
        </div>
      </div>
    </div>
  );
}
