# Ensemble Forecasting Service

An advanced demand forecasting system that combines ARIMA statistical models with simple moving average methods to provide accurate inventory predictions for BagInvent.

## Overview

The ensemble forecasting service enhances inventory management by providing:

- **ARIMA Time-Series Forecasting**: Advanced statistical modeling that captures trends and seasonality
- **Simple Moving Average**: Fast, lightweight baseline forecasting method
- **Ensemble Blending**: Intelligent combination of both methods for robust predictions
- **Confidence Intervals**: Upper/lower bounds for risk assessment
- **Batch Processing**: Forecast multiple products simultaneously

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                            │
│               (Forecast.tsx, AIForecastCard.tsx)                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP REST API
                 │
┌────────────────▼────────────────────────────────────────────────┐
│            Flask API Server (app.py)                            │
│  ✓ /api/forecast/ensemble  - Single product forecast           │
│  ✓ /api/forecast/arima     - ARIMA only forecast              │
│  ✓ /api/forecast/batch     - Multiple products               │
│  ✓ /health                 - Service status check             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Python Libraries
                 │
┌────────────────▼────────────────────────────────────────────────┐
│            ARIMA Forecasting Engine (arima_forecaster.py)       │
│  ✓ Stationarity Testing    - ADF test                          │
│  ✓ Parameter Optimization  - Auto-select (p,d,q)              │
│  ✓ Model Fitting           - ARIMA/SARIMA models              │
│  ✓ Ensemble Blending       - Weight methods by confidence      │
│  ✓ Confidence Intervals    - 95% CI bounds                    │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Install Python Dependencies

```bash
cd forecast_service
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 2. Verify Installation

```bash
# Test imports
python -c "import statsmodels; import numpy; import flask; print('All dependencies installed!')"
```

## Running the Service

### Development

```bash
cd forecast_service
python app.py
# Server starts at http://127.0.0.1:5000
```

### Production

```bash
# Using Gunicorn (recommended)
pip install gunicorn
gunicorn -w 4 -b 127.0.0.1:5000 app:app

# Using waitress
pip install waitress
waitress-serve --port=5000 app:app
```

### Docker (Optional)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY forecast_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY forecast_service/ .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

## API Reference

### Ensemble Forecast

Combines ARIMA and simple methods for the best prediction.

**Endpoint**: `POST /api/forecast/ensemble`

**Request**:
```json
{
  "daily_demand": [5, 8, 12, 10, 15, 18, 14, 11, 16, 13, 17, 19, 12, 14],
  "current_inventory": 100,
  "product_name": "Backpack A",
  "trend_pct": 5.5,
  "periods": 7
}
```

**Response**:
```json
{
  "arima_forecast": 98.5,
  "simple_forecast": 105.2,
  "ensemble_forecast": 101.3,
  "confidence_score": 0.724,
  "forecast_points": [
    {
      "day": "2026-07-20",
      "predicted": 14.5,
      "lower_bound": 11.2,
      "upper_bound": 18.3,
      "confidence": "high"
    }
  ],
  "reasoning": "ARIMA model has high confidence with 3+ weeks of data. Upward trend detected (5.5%); forecast emphasizes recent demand. Current stock provides less than 1 week of coverage."
}
```

### ARIMA Only

Get ARIMA forecast without ensemble blending.

**Endpoint**: `POST /api/forecast/arima`

**Request**:
```json
{
  "daily_demand": [5, 8, 12, 10, 15, 18, 14, 11, 16, 13, 17, 19, 12, 14],
  "periods": 7
}
```

**Response**:
```json
{
  "forecast": [14.5, 15.2, 14.8, 15.5, 16.1, 15.9, 14.7],
  "lower_bounds": [11.2, 12.1, 11.5, 12.3, 13.1, 12.8, 11.5],
  "upper_bounds": [18.3, 19.1, 18.5, 19.3, 20.1, 19.8, 18.5],
  "confidence": "high",
  "model_params": {"p": 2, "d": 1, "q": 1},
  "data_points_used": 14
}
```

### Batch Forecast

Get ensemble forecasts for multiple products.

**Endpoint**: `POST /api/forecast/batch`

**Request**:
```json
{
  "forecasts": [
    {
      "product_name": "Backpack A",
      "daily_demand": [5, 8, 12, ...],
      "current_inventory": 100,
      "trend_pct": 5.5
    },
    {
      "product_name": "Backpack B",
      "daily_demand": [10, 12, 15, ...],
      "current_inventory": 50,
      "trend_pct": -2.1
    }
  ],
  "periods": 7
}
```

**Response**:
```json
{
  "results": [
    {
      "product_name": "Backpack A",
      "forecast": { ... },
      "error": null
    },
    {
      "product_name": "Backpack B",
      "forecast": { ... },
      "error": null
    }
  ]
}
```

### Health Check

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok",
  "service": "ensemble-forecast"
}
```

## TypeScript Integration

### Using the Ensemble Forecast

```typescript
import { callEnsembleForecast } from "@/lib/ensembleForecast";

// Get forecast
const forecast = await callEnsembleForecast(
  dailyDemand=[5, 8, 12, 10, 15, 18, 14, 11, 16, 13, 17, 19, 12, 14],
  currentInventory=100,
  productName="Backpack A",
  trendPct=5.5,
  periods=7
);

console.log(`Forecast for next 7 days: ${forecast.ensemble_forecast} units`);
console.log(`Confidence: ${forecast.confidence_score}`);
console.log(`Reasoning: ${forecast.reasoning}`);
```

### Calculating Daily Demand

```typescript
import { calculateDailyDemand } from "@/lib/ensembleForecast";

const dailyDemand = calculateDailyDemand(
  transactions=[
    { date: "2026-07-01", quantity: 5, type: "sale" },
    { date: "2026-07-02", quantity: 8, type: "sale" },
    // ...
  ],
  days=28
);
```

### Batch Processing

```typescript
import { callBatchForecast } from "@/lib/ensembleForecast";

const results = await callBatchForecast(
  forecastRequests=[
    {
      product_name: "Backpack A",
      daily_demand: [5, 8, 12, ...],
      current_inventory: 100,
      trend_pct: 5.5
    },
    // ... more products
  ],
  periods=7
);
```

### With Fallback

```typescript
import { callEnsembleForecastWithFallback } from "@/lib/ensembleForecast";

// Safely calls API with automatic fallback to simple forecast
const forecast = await callEnsembleForecastWithFallback(
  dailyDemand,
  currentInventory,
  productName,
  trendPct,
  periods,
  () => calculateSimpleForecast(dailyDemand) // Fallback function
);
```

## Configuration

### Environment Variables

In your frontend (`.env`):

```env
# Forecast service URL
VITE_FORECAST_API_URL=http://localhost:5000

# Or for production
VITE_FORECAST_API_URL=https://forecast-api.yourdomain.com
```

### Service Configuration

In `src/lib/ensembleForecast.ts`:

```typescript
export const FORECAST_SERVICE_CONFIG = {
  BASE_URL: process.env.VITE_FORECAST_API_URL || "http://localhost:5000",
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 2,
};
```

## How It Works

### ARIMA Model Selection

The service automatically selects optimal ARIMA parameters (p, d, q):

- **p** (AR): AutoRegressive order (how past values influence the forecast)
- **d** (I): Integration order (differencing for stationarity)
- **q** (MA): Moving Average order (how past errors influence the forecast)

```python
# Example: ARIMA(2,1,1) means:
# - 2 past values influence the forecast
# - First-order differencing for trend removal
# - 1 past error term in the model
```

### Ensemble Weighting

The ensemble combines both methods with intelligent weighting:

```
confidence = "high" (≥21 days data)  → 70% ARIMA + 30% Simple
confidence = "medium" (≥10 days)     → 50% ARIMA + 50% Simple
confidence = "low" (< 10 days)       → 30% ARIMA + 70% Simple

ensemble_forecast = (ARIMA × weight) + (Simple × (1 - weight))
```

### Confidence Score Calculation

```
Score = (Data Points / 21 days) × 0.7 + Coverage Adequacy × 0.3
```

- Higher with more historical data
- Adjusted based on inventory coverage (ideal: 7-60 days)

## Performance Considerations

### Data Requirements

| Forecast Quality | Min Data Points | Recommended |
|------------------|-----------------|------------|
| Low              | 4-9 days        | 10+ days   |
| Medium           | 10-20 days      | 21+ days   |
| High             | 21+ days        | 60+ days   |

### Response Times

- **Single forecast**: 200-500ms
- **Batch (10 products)**: 1-2s
- **Health check**: <100ms

### Resource Usage

- **Memory**: ~50MB base + 1-2MB per concurrent request
- **CPU**: Minimal (< 20% during forecast)
- **Storage**: None (stateless service)

## Troubleshooting

### Service Won't Start

```bash
# Check Python version (3.8+)
python --version

# Verify dependencies
pip list | grep -E "flask|statsmodels|numpy"

# Check port availability
netstat -an | grep 5000
```

### API Timeouts

```bash
# Increase timeout in ensembleForecast.ts
FORECAST_SERVICE_CONFIG.TIMEOUT = 60000; // 60 seconds

# Or scale the service
gunicorn -w 8 -b 127.0.0.1:5000 app:app  # More workers
```

### Poor Forecast Quality

1. **Check data quality**: Remove outliers
2. **Ensure consistent data**: No large gaps in transaction history
3. **Monitor confidence score**: Low score = less reliable
4. **Use batch processing**: For better optimization

### Connection Refused

```bash
# Frontend can't reach backend
# Check if service is running:
curl http://localhost:5000/health

# If running, check network/firewall
# For production, use correct URL in VITE_FORECAST_API_URL
```

## Monitoring & Logging

### Enable Debug Logging

```python
# In app.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Metrics to Monitor

```typescript
// Track in frontend
const metrics = {
  requestTime: Date.now() - startTime,
  dataPoints: dailyDemand.length,
  confidence: forecast.confidence_score,
  isEnsemble: true,
};
```

## Future Enhancements

- [ ] Prophet forecasting integration
- [ ] XGBoost gradient boosting models
- [ ] External features (holidays, promotions, weather)
- [ ] Real-time streaming forecasts
- [ ] Model retraining on schedule
- [ ] Advanced anomaly detection
- [ ] Multi-step ahead forecasting (30-90 days)

## Dependencies

- **Flask 3.0+**: Web framework
- **NumPy 1.24+**: Numerical computing
- **Pandas 2.0+**: Data manipulation
- **Statsmodels 0.14+**: Time-series analysis
- **SciPy 1.11+**: Scientific computing

## License

Same as BagInvent project

## Support

For issues or feature requests related to forecasting:
1. Check this documentation
2. Review logs in Flask console
3. Test API endpoints with `curl` or Postman
4. Check data quality in Supabase

---

**Last Updated**: 2026-07-19  
**Version**: 1.0.0
