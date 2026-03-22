 import { Brain, Sparkles } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Link } from "react-router-dom";
 
 export function AIForecastCard() {
   return (
     <div className="chart-container animate-fade-in relative overflow-hidden">
       <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
       <div className="relative">
         <div className="flex items-center gap-3 mb-4">
           <div className="p-2 bg-primary/10 rounded-lg">
             <Brain className="w-6 h-6 text-primary" />
           </div>
           <h3 className="text-lg font-semibold text-foreground">AI Demand Forecast</h3>
         </div>
         
         <p className="text-muted-foreground text-sm mb-6">
           Leverage AI-powered predictions to optimize your inventory levels and reduce waste. 
           Get insights on demand patterns, restock recommendations, and expiry alerts.
         </p>
         
         <div className="flex flex-wrap gap-3 mb-6">
           <div className="insight-card flex items-center gap-2">
             <Sparkles className="w-4 h-4 text-primary" />
             <span className="text-sm text-foreground">30-Day Predictions</span>
           </div>
           <div className="insight-card flex items-center gap-2">
             <Sparkles className="w-4 h-4 text-success" />
             <span className="text-sm text-foreground">Reorder Suggestions</span>
           </div>
           <div className="insight-card flex items-center gap-2">
             <Sparkles className="w-4 h-4 text-warning" />
             <span className="text-sm text-foreground">Expiry Alerts</span>
           </div>
         </div>
         
         <Link to="/forecast">
           <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
             <Brain className="w-4 h-4 mr-2" />
             Generate Forecast
           </Button>
         </Link>
       </div>
     </div>
   );
 }