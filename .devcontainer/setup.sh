#!/bin/bash
set -e

echo "🚀 Initializing Aagam E-Commerce Setup..."

cd /workspaces/AAGAM_E-commerce || cd /workspaces/*

echo "📦 Installing Dependencies..."
npm install --silent

echo "🗄️ Syncing Database Schema..."
cd packages/database

if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aagam_ecom"
fi

echo "DATABASE_URL=$DATABASE_URL" > .env

npx prisma generate
npx prisma db push --accept-data-loss

echo "📊 Importing Data Snapshot..."
if [ -f "data-snapshot.sql" ]; then
    psql "$DATABASE_URL" < data-snapshot.sql
else
    echo "🌱 No snapshot found, running standard seed..."
    node seed.js
fi

cd ../..

echo "🏗️ Building shared packages..."
npx turbo build --filter=@aagam/types --filter=@aagam/utils --filter=@aagam/database

echo "✅ Setup Complete! Run 'npm run dev' to start."