#!/bin/bash

# Navigate to application directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  Starting Machinecraft Jacquard Production Server        "
echo "=========================================================="


# Check if PostgreSQL service is active
if ! systemctl is-active --quiet postgresql; then
    echo "[!] PostgreSQL service is not active. Attempting to start..."
    sudo systemctl start postgresql
fi

# Ensure Python Virtual Environment exists
if [ ! -d "venv" ]; then
    echo "[!] Virtual environment not found. Creating venv..."
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt
fi

echo ""
echo "🚀 Server is starting on host 0.0.0.0:8000..."
echo ""
echo "📌 Network Access URLs:"
echo "   - Admin Dashboard:  http://192.168.1.100:8000/"
echo "   - Worker PWA App:   http://192.168.1.100:8000/operator"
echo "   - Local Fallback:   http://localhost:8000/"
echo "   - Swagger API Docs: http://192.168.1.100:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server."
echo "----------------------------------------------------------"

# Launch Uvicorn server bound to 0.0.0.0:8000
exec ./venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
