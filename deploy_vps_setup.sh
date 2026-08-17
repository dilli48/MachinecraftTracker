#!/bin/bash
# VPS Initial Setup Script for MachinecraftTracker on Ubuntu/Debian OVH VPS

set -e

echo "=== 1. Updating System Packages ==="
sudo apt-get update && sudo apt-get upgrade -y

echo "=== 2. Installing Required Tools (Docker, Git, Curl, UFW) ==="
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# Install Docker Compose Plugin if needed
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo apt-get install -y docker-compose-plugin
fi

echo "=== 3. Configuring Firewall (UFW) ==="
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8080/tcp  # Machinecraft App Direct Port
echo "y" | sudo ufw enable

echo "=== 4. Starting Containers ==="
if [ -f "docker-compose.yml" ]; then
    docker compose up -d --build
    echo "=== Container Status ==="
    docker compose ps
else
    echo "Warning: docker-compose.yml not found in current directory."
fi

echo "========================================================"
echo " Setup complete! App running on http://$(hostname -I | awk '{print $1}'):8080"
echo " Note: If docker permission error occurs, log out and back in."
echo "========================================================"
