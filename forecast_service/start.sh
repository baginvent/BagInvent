#!/bin/bash
# Forecast Service Startup Script for macOS/Linux

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== BagInvent Ensemble Forecast Service ===${NC}"

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 not found. Please install Python 3.8 or later.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Python 3 found: $(python3 --version)${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${BLUE}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Install/upgrade dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Check installation
echo -e "${BLUE}Verifying dependencies...${NC}"
python3 -c "
import flask
import numpy
import pandas
import statsmodels
print('${GREEN}✓ All dependencies installed${NC}')
" || {
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
}

# Start the service
echo -e "${GREEN}Starting Forecast Service...${NC}"
echo -e "${BLUE}Service URL: http://127.0.0.1:5000${NC}"
echo -e "${BLUE}Health check: http://127.0.0.1:5000/health${NC}"
echo -e "${BLUE}Docs: README.md${NC}"
echo ""

python3 app.py
