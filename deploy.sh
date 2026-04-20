#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting Professional Deployment..."

# 1. Update Code
echo "📥 Pulling latest code from Git..."
git pull origin main

# 2. Install Dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Build Monorepo (Turbo will skip what hasn't changed)
echo "🏗️ Building all apps and packages..."
npx turbo build

# 4. Database Migrations
echo "🗄️ Running database migrations..."
npx prisma migrate deploy --schema=./packages/database/prisma/schema.prisma

# 5. Restart Services
echo "🔄 Restarting applications with PM2..."
pm2 restart ecosystem.config.js --env production

# 6. Maintenance
echo "🧹 Cleaning up old build artifacts..."
pm2 save
npx turbo prune

echo "✅ Deployment Successful! Your apps are live."
