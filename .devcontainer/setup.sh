#!/bin/bash
set -e

echo "🚀 Initializing Aagam E-Commerce Setup..."

# Navigate to project root if not already there
cd /workspaces/AAGAM_E-commerce || cd /workspaces/*

# 1. Dependencies
echo "📦 Installing Dependencies..."
npm install --silent

# 2. Database Sync
echo "🗄️ Syncing Database Schema..."
cd packages/database
npx prisma generate
npx prisma db push --accept-data-loss

# 3. Data Import
if [ -f "data-snapshot.sql" ]; then
    echo "📊 Importing Data Snapshot..."
    psql "postgresql://postgres:postgres@localhost:5432/postgres" < data-snapshot.sql
else
    echo "🌱 No snapshot found, running standard seed..."
    node seed.js
fi

cd ../..

echo "🏗️ Building shared packages..."
npx turbo build --filter=@aagam/types --filter=@aagam/utils --filter=@aagam/database

echo "✅ Setup Complete! Run 'npm run dev' to start."