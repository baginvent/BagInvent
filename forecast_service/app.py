"""
Flask API server for ensemble forecasting service.
Provides REST endpoints for ARIMA and ensemble forecasts.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from arima_forecaster import create_ensemble_forecast, fit_arima_model
import logging
from typing import Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Health check
@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "ensemble-forecast"}), 200


@app.route("/api/forecast/ensemble", methods=["POST"])
def ensemble_forecast():
    """
    Create ensemble forecast combining ARIMA and simple methods.
    
    Request body:
    {
        "daily_demand": [5, 8, 12, ...],
        "current_inventory": 100,
        "periods": 7,
        "trend_pct": 5.5,
        "product_name": "Product A"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required = ["daily_demand", "current_inventory"]
        if not all(field in data for field in required):
            return jsonify({"error": "Missing required fields"}), 400
        
        # Extract and validate parameters
        daily_demand = data.get("daily_demand", [])
        if not isinstance(daily_demand, list) or len(daily_demand) < 2:
            return jsonify({"error": "daily_demand must be a list with at least 2 values"}), 400
        
        current_inventory = data.get("current_inventory", 0)
        periods = data.get("periods", 7)
        trend_pct = data.get("trend_pct", 0)
        product_name = data.get("product_name", "Product")
        
        # Validate numeric fields
        if not isinstance(current_inventory, (int, float)):
            return jsonify({"error": "current_inventory must be numeric"}), 400
        
        if not isinstance(periods, int) or periods < 1 or periods > 90:
            return jsonify({"error": "periods must be integer between 1 and 90"}), 400
        
        # Create forecast
        result = create_ensemble_forecast(
            daily_demand=[float(d) for d in daily_demand],
            current_inventory=int(current_inventory),
            periods=periods,
            trend_pct=float(trend_pct),
            product_name=str(product_name),
        )
        
        return jsonify(result), 200
    
    except Exception as e:
        logger.error(f"Error in ensemble_forecast: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/forecast/arima", methods=["POST"])
def arima_forecast():
    """
    Get ARIMA forecast only (without ensemble).
    
    Request body:
    {
        "daily_demand": [5, 8, 12, ...],
        "periods": 7
    }
    """
    try:
        data = request.get_json()
        
        daily_demand = data.get("daily_demand", [])
        if not isinstance(daily_demand, list) or len(daily_demand) < 2:
            return jsonify({"error": "daily_demand must be a list with at least 2 values"}), 400
        
        periods = data.get("periods", 7)
        if not isinstance(periods, int) or periods < 1 or periods > 90:
            return jsonify({"error": "periods must be integer between 1 and 90"}), 400
        
        result = fit_arima_model(
            daily_demand=[float(d) for d in daily_demand],
            periods=periods,
        )
        
        if result is None:
            return jsonify({"error": "Could not fit ARIMA model"}), 400
        
        return jsonify(result), 200
    
    except Exception as e:
        logger.error(f"Error in arima_forecast: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/forecast/batch", methods=["POST"])
def batch_forecast():
    """
    Get ensemble forecasts for multiple products.
    
    Request body:
    {
        "forecasts": [
            {
                "daily_demand": [...],
                "current_inventory": 100,
                "product_name": "Product A",
                "trend_pct": 5.5
            },
            ...
        ],
        "periods": 7
    }
    """
    try:
        data = request.get_json()
        forecasts = data.get("forecasts", [])
        periods = data.get("periods", 7)
        
        if not isinstance(forecasts, list):
            return jsonify({"error": "forecasts must be a list"}), 400
        
        results = []
        for forecast_data in forecasts:
            try:
                daily_demand = forecast_data.get("daily_demand", [])
                current_inventory = forecast_data.get("current_inventory", 0)
                trend_pct = forecast_data.get("trend_pct", 0)
                product_name = forecast_data.get("product_name", "Product")
                
                result = create_ensemble_forecast(
                    daily_demand=[float(d) for d in daily_demand],
                    current_inventory=int(current_inventory),
                    periods=periods,
                    trend_pct=float(trend_pct),
                    product_name=str(product_name),
                )
                
                results.append({
                    "product_name": product_name,
                    "forecast": result,
                    "error": None,
                })
            except Exception as e:
                results.append({
                    "product_name": forecast_data.get("product_name", "Unknown"),
                    "forecast": None,
                    "error": str(e),
                })
        
        return jsonify({"results": results}), 200
    
    except Exception as e:
        logger.error(f"Error in batch_forecast: {e}")
        return jsonify({"error": str(e)}), 500


@app.errorhandler(404)
def not_found(error: Any):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def internal_error(error: Any):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    # Development server
    app.run(debug=True, host="127.0.0.1", port=5000)
