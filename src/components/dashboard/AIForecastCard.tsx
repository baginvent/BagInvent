import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function AIForecastCard() {
  return (
    <div className="chart-container flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-medium text-[#171717]">AI Demand Forecast</h3>
        <div className="mt-10 space-y-2 text-center">
          <p className="text-[15px] text-[#232323]">Generate the Forecast</p>
          <p className="text-sm text-[#cf5a5a]">Predict the demand for the next 30 days</p>
        </div>
      </div>

      <div className="mt-10 flex justify-center">
        <Link to="/forecast">
          <Button className="h-9 rounded-[4px] bg-[#6b95df] px-8 text-xs font-medium text-white hover:bg-[#5f88d1]">
            <Brain className="mr-2 h-4 w-4" />
            Generate
          </Button>
        </Link>
      </div>
    </div>
  );
}
