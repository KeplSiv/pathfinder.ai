#!/bin/bash
# Quick start script for Vultr server
# Run this on your Vultr server: bash start_vultr.sh

set -e

echo "=== Starting Vultr Server ==="

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Working directory: $SCRIPT_DIR"

# Activate virtual environment
if [ -d ".venv" ]; then
    echo "Activating virtual environment..."
    source .venv/bin/activate
else
    echo "ERROR: .venv not found. Create it first: python3 -m venv .venv"
    exit 1
fi

# Kill any existing process on port 8000
echo "Checking for existing processes on port 8000..."
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "Killing existing process on port 8000..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Ensure firewall allows port 8000
echo "Checking firewall..."
if command -v ufw > /dev/null 2>&1; then
    if ! ufw status | grep -q "8000/tcp"; then
        echo "Opening port 8000 in firewall..."
        sudo ufw allow 8000/tcp
        sudo ufw reload
    else
        echo "Port 8000 already allowed in firewall"
    fi
else
    echo "ufw not found, skipping firewall check"
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "WARNING: .env file not found. Create it with your API keys."
fi

# Start the server
echo "Starting uvicorn server..."
echo "Server will be accessible at: http://0.0.0.0:8000"
echo "Press Ctrl+C to stop"
echo ""

MPLCONFIGDIR=.mpl YOLO_CONFIG_DIR=.yolo uvicorn main:app --host 0.0.0.0 --port 8000

