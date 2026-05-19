#!/bin/bash
set -e

echo "🚀 Starting Codespace Setup..."

cd /workspaces/AAGAM_E-commerce

echo "📦 Installing Dependencies..."
npm install --silent

echo "🗄️ Setting up Database..."
cd packages/database
npx prisma generate
npx prisma db push --accept-data-loss

if [ -f "data-snapshot.sql" ]; then
    echo "📊 Importing Data Snapshot..."
    psql "postgresql://postgres:postgres@localhost:5432/postgres" < data-snapshot.sql
else
    echo "🌱 No data snapshot found, running standard seed..."
    node seed.js
fi

cd ../..

echo "🏗️ Building shared packages..."
npx turbo build --filter=@aagam/types --filter=@aagam/utils --filter=@aagam/database

echo "✅ Setup Complete!"
echo "--------------------------------------------------"
echo "👉 Run 'npm run dev' to start Admin & API"
echo "--------------------------------------------------"