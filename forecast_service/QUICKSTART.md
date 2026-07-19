# Quick Start Guide - Ensemble Forecast Service

Get the advanced forecasting system up and running in 5 minutes.

## Prerequisites

- Python 3.8 or later
- Node.js 18+ (for the frontend - you already have this)
- ~100MB disk space for dependencies

## Step 1: Set Up the Python Service

### On Windows

```bash
cd forecast_service
start.bat
```

The script will:
- ✓ Create a Python virtual environment
- ✓ Install dependencies
- ✓ Start the service on http://localhost:5000

### On macOS/Linux

```bash
cd forecast_service
chmod +x start.sh
./start.sh
```

### Manual Setup (If Scripts Don't Work)

```bash
cd forecast_service

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start service
python app.py
```

## Step 2: Configure Frontend

Add this to your `.env` file in the root directory:

```env
VITE_FORECAST_API_URL=http://localhost:5000
```

Or if you're running on a different machine:

```env
VITE_FORECAST_API_URL=http://192.168.1.100:5000
```

## Step 3: Verify It Works

### Check Service Health

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status": "ok", "service": "ensemble-forecast"}
```

### Test a Forecast

```bash
curl -X POST http://localhost:5000/api/forecast/ensemble \
  -H "Content-Type: application/json" \
  -d '{
    "daily_demand": [5, 8, 12, 10, 15, 18, 14, 11, 16, 13, 17, 19, 12, 14],
    "current_inventory": 100,
    "product_name": "Test Product",
    "trend_pct": 5.5,
    "periods": 7
  }'
```

## Step 4: Use in Your App

The forecast service is now integrated! It will automatically:

1. **Detect** when products need forecasting
2. **Call** the ensemble API with historical data
3. **Display** improved predictions in the Forecast page
4. **Fall back** to simple forecasting if the service is unavailable

No code changes needed - it works automatically!

## Common Tasks

### Stop the Service

- **Windows**: Close the command prompt window or press Ctrl+C
- **macOS/Linux**: Press Ctrl+C in the terminal

### Restart the Service

Just run `start.bat` or `./start.sh` again.

### Change the Port

If port 5000 is already in use:

1. Edit `forecast_service/app.py`
2. Change the last line: `app.run(debug=True, host="127.0.0.1", port=5001)`
3. Update `.env`: `VITE_FORECAST_API_URL=http://localhost:5001`

### View Logs

The service prints logs to the console. Look for:

- `INFO: * Running on http://127.0.0.1:5000` - Service started
- `Ensemble forecast failed, using fallback` - Service is available but forecast failed

### Run with Multiple Workers (Production)

```bash
pip install gunicorn
gunicorn -w 4 -b 127.0.0.1:5000 app:app
```

## What's Happening Under the Hood

When you view the Forecast page:

1. **Frontend** calculates historical daily sales for each product
2. **Frontend** sends data to the Python service
3. **Python service** runs ARIMA model and simple forecast
4. **Python service** combines results intelligently
5. **Results** are displayed with confidence scores
6. **Confidence intervals** show the forecast range

All of this happens automatically in the background!

## Troubleshooting

### "Connection Refused" Error

Service isn't running. Start it with `start.bat` or `./start.sh`

### "Port 5000 Already in Use"

```bash
# Windows - Find and kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID [PID] /F

# macOS/Linux
lsof -i :5000
kill -9 [PID]
```

### "Module Not Found" Error

Dependencies didn't install. Try:

```bash
cd forecast_service
pip install --force-reinstall -r requirements.txt
python app.py
```

### Service Crashes on Startup

Check Python version:
```bash
python --version
```

Must be 3.8 or later. If not, install from python.org

### Forecasts Still Not Working

Check if frontend can reach backend:

```bash
# From your browser, visit:
http://localhost:5000/health

# Or from terminal:
curl http://localhost:5000/health
```

If this fails, the service isn't running or isn't on the right port.

## Next Steps

✓ **Congratulations!** Your ensemble forecast system is running.

Now:

1. Go to the **Forecast page** in BagInvent
2. Add some **sales transactions** to build history
3. See the **improved predictions** with confidence scores
4. Check the **reasoning** for each forecast

## Advanced Usage

See [README.md](./README.md) for:
- API documentation
- Batch processing
- Configuration options
- Monitoring & logging
- Performance tuning

## Support

If something goes wrong:

1. Check the service console for error messages
2. Review the `README.md` troubleshooting section
3. Verify your Python version is 3.8+
4. Ensure port 5000 is available
5. Check that `.env` has the correct API URL

---

**Happy Forecasting!** 📊
