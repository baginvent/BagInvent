import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { TopSellingChart } from "@/components/dashboard/TopSellingChart";
import { AIForecastCard } from "@/components/dashboard/AIForecastCard";
import { Package, AlertTriangle, Clock, DollarSign } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back! Here's your inventory overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Products"
            value="0"
            icon={Package}
            onClick={() => navigate("/inventory")}
          />
          <StatCard
            title="Low Stock"
            value="0"
            icon={AlertTriangle}
            variant="warning"
            onClick={() => navigate("/inventory")}
          />
          <StatCard
            title="Expiring Soon"
            value="0"
            icon={Clock}
            variant="danger"
            onClick={() => navigate("/inventory")}
          />
          <StatCard
            title="Today's Sales"
            value="₱0"
            icon={DollarSign}
            variant="success"
            onClick={() => navigate("/transactions")}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopSellingChart />
          <AIForecastCard />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
