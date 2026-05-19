#!/bin/bash
set -e

echo "🚀 Starting Codespace Setup..."

# Ensure we are in the root
cd /workspaces/aagam_ecommerse || cd /workspaces/*

# 1. Install dependencies
echo "📦 Installing Dependencies..."
npm install --silent

# 2. Setup Database Schema
echo "🗄️ Setting up Database..."
cd packages/database
npx prisma generate
npx prisma db push --accept-data-loss

# 3. Handle Data Import
if [ -f "data-snapshot.sql" ]; then
    echo "📊 Importing Data Snapshot..."
    # Codespace postgres uses 'postgres' user by default
    psql "postgresql://postgres:postgres@localhost:5432/postgres" < data-snapshot.sql
else
    echo "🌱 No data snapshot found, running standard seed..."
    node seed.js
fi

cd ../..

# 4. Generate build for shared packages (required for Turborepo)
echo "🏗️ Building shared packages..."
npx turbo build --filter=@aagam/types --filter=@aagam/utils --filter=@aagam/database

echo "✅ Setup Complete!"
echo "--------------------------------------------------"
echo "👉 Run 'npm run dev' to start Admin & API"
echo "--------------------------------------------------"
