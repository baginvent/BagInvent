 import { LucideIcon } from "lucide-react";
 import { cn } from "@/lib/utils";
 
 interface StatCardProps {
   title: string;
   value: string | number;
   icon: LucideIcon;
   trend?: {
     value: number;
     isPositive: boolean;
   };
   variant?: "default" | "warning" | "danger" | "success";
   onClick?: () => void;
 }
 
 export function StatCard({ title, value, icon: Icon, trend, variant = "default", onClick }: StatCardProps) {
   const iconColors = {
     default: "bg-primary/10 text-primary",
     warning: "bg-warning/10 text-warning",
     danger: "bg-destructive/10 text-destructive",
     success: "bg-success/10 text-success",
   };
 
   return (
    <div 
      className={cn(
        "stat-card animate-fade-in",
        onClick && "cursor-pointer transition-all hover:shadow-lg hover:scale-105"
      )}
      onClick={onClick}
    >
       <div className="flex items-start justify-between">
         <div>
           <p className="text-sm text-muted-foreground font-medium">{title}</p>
           <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
           {trend && (
             <p
               className={cn(
                 "text-xs mt-2 font-medium",
                 trend.isPositive ? "text-success" : "text-destructive"
               )}
             >
               {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}% from last week
             </p>
           )}
         </div>
         <div className={cn("p-3 rounded-lg", iconColors[variant])}>
           <Icon className="w-6 h-6" />
         </div>
       </div>
     </div>
   );
 }