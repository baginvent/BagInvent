"""
ARIMA-based forecasting service for inventory management.
Provides ARIMA predictions and ensemble methods for demand forecasting.
"""

from typing import TypedDict, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller
import warnings

warnings.filterwarnings('ignore')


@dataclass
class ForecastPoint:
    """Single forecast data point"""
    day: str
    predicted: float
    lower_bound: float
    upper_bound: float
    confidence: float


class ArimaForecast(TypedDict):
    """ARIMA forecast result"""
    forecast: list[float]
    lower_bounds: list[float]
    upper_bounds: list[float]
    confidence: str
    model_params: dict
    data_points_used: int


class EnsembleForecast(TypedDict):
    """Ensemble forecast combining ARIMA and simple methods"""
    arima_forecast: float
    simple_forecast: float
    ensemble_forecast: float
    confidence_score: float
    forecast_points: list[ForecastPoint]
    reasoning: str


def check_stationarity(series: list[float]) -> bool:
    """Check if time series is stationary using ADF test"""
    if len(series) < 3:
        return False
    
    try:
        result = adfuller(series, autolag='AIC')
        return result[1] < 0.05  # p-value < 0.05 means stationary
    except:
        return False


def find_best_arima_params(series: list[float], max_p: int = 5, max_d: int = 2, max_q: int = 5) -> tuple[int, int, int]:
    """
    Find optimal (p,d,q) parameters for ARIMA using auto-selection.
    Uses a simplified approach suitable for inventory data.
    """
    if len(series) < 10:
        return (1, 1, 1)  # Default for small series
    
    best_aic = np.inf
    best_params = (1, 1, 1)
    
    # Simplified grid search - skip some combinations for speed
    for p in range(0, min(max_p, 3)):
        for d in range(0, min(max_d, 2)):
            for q in range(0, min(max_q, 3)):
                try:
                    model = ARIMA(series, order=(p, d, q))
                    fitted = model.fit()
                    
                    if fitted.aic < best_aic:
                        best_aic = fitted.aic
                        best_params = (p, d, q)
                except:
                    continue
    
    return best_params


def fit_arima_model(daily_demand: list[float], periods: int = 7) -> Optional[ArimaForecast]:
    """
    Fit ARIMA model to historical daily demand data.
    
    Args:
        daily_demand: Historical daily demand values
        periods: Number of days to forecast
    
    Returns:
        ARIMA forecast with confidence intervals
    """
    if len(daily_demand) < 4:
        return None
    
    try:
        # Remove zeros from the start for better stationarity
        series = [d for d in daily_demand if d > 0 or len([x for x in daily_demand if x > 0]) > 0]
        if len(series) < 4:
            series = daily_demand
        
        # Find best parameters
        p, d, q = find_best_arima_params(series)
        
        # Fit model
        model = ARIMA(series, order=(p, d, q))
        fitted_model = model.fit()
        
        # Generate forecast with confidence intervals
        forecast_result = fitted_model.get_forecast(steps=periods)
        forecast_values = forecast_result.predicted_mean.values
        conf_int = forecast_result.conf_int(alpha=0.05)
        
        # Ensure non-negative forecasts
        forecast_values = np.maximum(forecast_values, 0)
        lower_bounds = np.maximum(conf_int.iloc[:, 0].values, 0)
        upper_bounds = np.maximum(conf_int.iloc[:, 1].values, 0)
        
        # Calculate confidence based on data points
        data_points = len(series)
        if data_points >= 21:
            confidence = "high"
        elif data_points >= 10:
            confidence = "medium"
        else:
            confidence = "low"
        
        return {
            "confidence": confidence,
            "data_points_used": data_points,
            "forecast": forecast_values.tolist(),
            "lower_bounds": lower_bounds.tolist(),
            "model_params": {"p": p, "d": d, "q": q},
            "upper_bounds": upper_bounds.tolist(),
        }
    except Exception as e:
        print(f"ARIMA fitting error: {e}")
        return None


def calculate_simple_forecast(daily_demand: list[float], periods: int = 7, trend_pct: float = 0) -> list[float]:
    """
    Calculate simple forecast using weighted moving average with trend.
    This mirrors the existing TypeScript implementation.
    
    Args:
        daily_demand: Historical daily demand
        periods: Number of days to forecast
        trend_pct: Trend percentage to apply
    
    Returns:
        List of forecasted values for specified periods
    """
    if not daily_demand:
        return [0] * periods
    
    # Calculate weighted average (recent weighted more heavily)
    recent_window = min(7, len(daily_demand))
    recent_avg = np.mean(daily_demand[-recent_window:])
    historical_avg = np.mean(daily_demand)
    
    # Blend recent and historical
    base_forecast = recent_avg * 0.65 + historical_avg * 0.35
    
    # Apply trend factor
    trend_factor = 1 + (trend_pct / 100) * 0.35
    trend_factor = np.clip(trend_factor, 0.75, 1.35)
    
    # Generate forecast
    return [max(0, base_forecast * trend_factor) for _ in range(periods)]


def create_ensemble_forecast(
    daily_demand: list[float],
    current_inventory: int,
    periods: int = 7,
    trend_pct: float = 0,
    product_name: str = "Product",
) -> EnsembleForecast:
    """
    Create ensemble forecast combining ARIMA and simple methods.
    
    Args:
        daily_demand: Historical daily demand values
        current_inventory: Current stock level
        periods: Number of days to forecast
        trend_pct: Trend percentage from historical analysis
        product_name: Product name for reasoning
    
    Returns:
        Ensemble forecast with both methods and combined result
    """
    # Get ARIMA forecast
    arima_result = fit_arima_model(daily_demand, periods)
    
    # Get simple forecast
    simple_forecast_values = calculate_simple_forecast(daily_demand, periods, trend_pct)
    
    # Calculate totals
    if arima_result:
        arima_total = sum(arima_result["forecast"])
        arima_confidence = arima_result["confidence"]
    else:
        arima_total = sum(simple_forecast_values)
        arima_confidence = "low"
    
    simple_total = sum(simple_forecast_values)
    
    # Ensemble: weight methods based on confidence
    confidence_multiplier = {"high": 0.7, "medium": 0.5, "low": 0.3}[arima_confidence]
    ensemble_total = (arima_total * confidence_multiplier) + (simple_total * (1 - confidence_multiplier))
    
    # Create detailed forecast points
    forecast_points: list[ForecastPoint] = []
    forecast_date = datetime.now()
    
    if arima_result and len(arima_result["forecast"]) == periods:
        for i in range(periods):
            forecast_date += timedelta(days=1)
            arima_val = arima_result["forecast"][i]
            simple_val = simple_forecast_values[i]
            ensemble_val = (arima_val * confidence_multiplier) + (simple_val * (1 - confidence_multiplier))
            
            forecast_points.append(ForecastPoint(
                day=forecast_date.strftime("%Y-%m-%d"),
                predicted=round(ensemble_val, 2),
                lower_bound=round(arima_result["lower_bounds"][i], 2),
                upper_bound=round(arima_result["upper_bounds"][i], 2),
                confidence=arima_confidence,
            ))
    else:
        # Fallback to simple forecast only
        for i in range(periods):
            forecast_date += timedelta(days=1)
            forecast_points.append(ForecastPoint(
                day=forecast_date.strftime("%Y-%m-%d"),
                predicted=round(simple_forecast_values[i], 2),
                lower_bound=round(simple_forecast_values[i] * 0.7, 2),
                upper_bound=round(simple_forecast_values[i] * 1.3, 2),
                confidence="low",
            ))
    
    # Calculate ensemble confidence score
    daily_avg = ensemble_total / periods if periods > 0 else 0
    coverage_days = current_inventory / daily_avg if daily_avg > 0 else float('inf')
    
    confidence_score = min(1.0, (len(daily_demand) / 21.0)) * 0.7 + \
                      (1.0 if 7 <= coverage_days <= 60 else 0.5) * 0.3
    
    # Generate reasoning
    reasoning_parts = []
    if len(daily_demand) >= 21:
        reasoning_parts.append("ARIMA model has high confidence with 3+ weeks of data.")
    elif len(daily_demand) >= 10:
        reasoning_parts.append("ARIMA model has medium confidence with 2 weeks of data.")
    else:
        reasoning_parts.append("Limited historical data; using simple moving average.")
    
    if trend_pct > 5:
        reasoning_parts.append(f"Upward trend detected ({trend_pct:.1f}%); forecast emphasizes recent demand.")
    elif trend_pct < -5:
        reasoning_parts.append(f"Downward trend detected ({trend_pct:.1f}%); forecast adjusted downward.")
    
    if coverage_days < 7:
        reasoning_parts.append("Current stock provides less than 1 week of coverage.")
    elif coverage_days > 60:
        reasoning_parts.append("Excessive inventory; consider reducing stock.")
    
    return {
        "arima_forecast": round(arima_total, 2),
        "ensemble_forecast": round(ensemble_total, 2),
        "simple_forecast": round(simple_total, 2),
        "confidence_score": round(confidence_score, 3),
        "forecast_points": [point.__dict__ for point in forecast_points],
        "reasoning": " ".join(reasoning_parts),
    }


if __name__ == "__main__":
    # Example usage
    demo_demand = [5, 8, 12, 10, 15, 18, 14, 11, 16, 13, 17, 19, 12, 14, 16, 18, 15, 13, 17, 19, 14, 16, 18, 20, 15]
    
    result = create_ensemble_forecast(
        daily_demand=demo_demand,
        current_inventory=100,
        periods=7,
        trend_pct=5.5,
        product_name="Test Product",
    )
    
    print("Ensemble Forecast Result:")
    print(f"ARIMA Forecast (7 days): {result['arima_forecast']} units")
    print(f"Simple Forecast (7 days): {result['simple_forecast']} units")
    print(f"Ensemble Forecast (7 days): {result['ensemble_forecast']} units")
    print(f"Confidence Score: {result['confidence_score']}")
    print(f"\nReasoning: {result['reasoning']}")
    print(f"\nDetailed Forecast:")
    for point in result['forecast_points']:
        print(f"  {point['day']}: {point['predicted']} units (CI: {point['lower_bound']}-{point['upper_bound']})")
