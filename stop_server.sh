#!/bin/bash

echo "=========================================================="
echo "  Stopping Machinecraft Jacquard Production Server        "
echo "=========================================================="


PID=$(pgrep -f "uvicorn main:app")

if [ -z "$PID" ]; then
    echo "ℹ️  No running Machinecraft server process found on port 8000."
else
    echo "🛑 Stopping server process (PID: $PID)..."
    kill -15 $PID 2>/dev/null || kill -9 $PID 2>/dev/null
    sleep 1
    echo "✅ Server successfully stopped."
fi

echo "=========================================================="
