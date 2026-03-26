import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandMark";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: ReactNode;
  eyebrow: string;
  formWidthClassName?: string;
}

export function AuthShell({ children, eyebrow, formWidthClassName }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#262120]">
      <div className="h-11 px-6 pt-4 text-sm font-medium text-white/40">{eyebrow}</div>
      <div className="flex min-h-[calc(100vh-44px)] items-center justify-center bg-[#f6f3ee] px-4 py-10 sm:px-6 sm:py-12">
        <div className={cn("w-full max-w-[440px]", formWidthClassName)}>
          <BrandLogo className="mb-8" />
          {children}
        </div>
      </div>
    </div>
  );
}
