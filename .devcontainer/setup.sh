#!/bin/bash
set -e

echo "🚀 Starting High-Stability Manual Setup..."

# 1. Install System Dependencies
echo "📦 Installing PostgreSQL and Redis..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y postgresql redis-server

# 2. Start Services
echo "🔌 Starting Services..."
sudo service postgresql start
sudo service redis-server start

# 3. Configure Postgres
echo "🗄️ Configuring Database..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE aagam_ecom;" || true

# 4. Bridge Frontend/Backend
cd /workspaces/AAGAM_E-commerce || cd /workspaces/*
if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
    echo "🔗 Detected GitHub Codespace environment"
    API_URL="https://${CODESPACE_NAME}-3005.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo "NEXT_PUBLIC_API_URL=${API_URL}" > apps/admin-dashboard/.env.local
fi

# 5. Project Setup
echo "📦 Installing Project Dependencies..."
npm install --silent

echo "🗄️ Syncing Prisma..."
cd packages/database
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aagam_ecom"
echo "DATABASE_URL=$DATABASE_URL" > .env

npx prisma generate
npx prisma db push --accept-data-loss

echo "📊 Importing Data Snapshot..."
if [ -f "data-snapshot.sql" ]; then
    psql "$DATABASE_URL" < data-snapshot.sql
else
    node seed.js
fi

cd ../..
npx turbo build --filter=@aagam/types --filter=@aagam/utils --filter=@aagam/database

echo "✅ Setup Complete!"