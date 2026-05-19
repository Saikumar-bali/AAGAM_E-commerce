#!/bin/bash
set -e

echo "🚀 Starting Nuclear-Stable Manual Setup..."

# 1. Install System Dependencies
echo "📦 Installing PostgreSQL and Redis via apt..."
sudo apt-get update
sudo apt-get install -y postgresql redis-server

# 2. Start Services (using service command for Debian)
echo "🔌 Starting Services..."
sudo service postgresql start
sudo service redis-server start

# 3. Configure Postgres for the app
echo "🗄️ Configuring Database..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE aagam_ecom;" || true

# 4. Trigger the original setup logic
echo "🏗️ Running Project Setup..."
bash .devcontainer/post-create.sh

echo "✅ Nuclear Setup Complete!"