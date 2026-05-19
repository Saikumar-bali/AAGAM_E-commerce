#!/bin/bash
set -e

echo "🚀 Starting Root-Level Manual Setup..."

# 1. Install System Dependencies
echo "📦 Installing PostgreSQL and Redis..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postgresql redis-server sudo

# 2. Start Services
echo "🔌 Starting Services..."
service postgresql start

echo "📦 Force starting Redis..."
killall redis-server 2>/dev/null || true
rm -f /var/run/redis/redis-server.pid 2>/dev/null || true
mkdir -p /var/log/redis
chown root:root /var/log/redis
chmod 755 /var/log/redis

redis-server --daemonize yes

for i in 1 2 3 4 5; do
    if redis-cli ping | grep -q PONG; then
        echo "✅ Redis is responding"
        break
    fi
    if [ $i -eq 5 ]; then
        echo "❌ Redis failed to start after 5 retries"
        exit 1
    fi
    sleep 1
done

# 3. Configure Postgres
echo "🗄️ Configuring Database..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" || true
sudo -u postgres psql -c "CREATE DATABASE aagam_ecom;" || true

# 4. Bridge Frontend/Backend
cd /workspaces/AAGAM_E-commerce || cd /workspaces/*

echo "🔑 Configuring Environment Variables..."
DB_LINK="postgresql://postgres:postgres@localhost:5432/aagam_ecom"
REDIS_LINK="redis://localhost:6379"
JWT_SEC="9f8c2a6d4b7e1c3f5suresh0c9d1b4a7e3f5c8d2a6b"

# Create root .env
echo "DATABASE_URL=$DB_LINK" > .env
echo "REDIS_URL=$REDIS_LINK" >> .env
echo "JWT_SECRET=$JWT_SEC" >> .env

if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
    echo "🔗 Detected GitHub Codespace environment"
    API_URL="https://${CODESPACE_NAME}-3005.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo "NEXT_PUBLIC_API_URL=${API_URL}" > apps/admin-dashboard/.env.local
    echo "NEXT_PUBLIC_API_URL=${API_URL}" >> .env
fi

# 5. Project Setup
echo "📦 Installing Project Dependencies..."
npm install --silent

echo "🗄️ Syncing Prisma..."
cd packages/database
echo "DATABASE_URL=$DB_LINK" > .env
sudo -u postgres psql -c "CREATE DATABASE aagam_ecom;" 2>/dev/null || true
npx prisma generate
npx prisma db push --accept-data-loss

echo "📊 Importing Data Snapshot..."
if [ -f "data-snapshot.sql" ]; then
    psql "$DB_LINK" < data-snapshot.sql
else
    node seed.js
fi

cd ../..
npx turbo build --filter=@aagam/types --filter=@aagam/utils --filter=@aagam/database

echo "📦 Setting up Worker Service environment..."
mkdir -p apps/worker-service
echo "DATABASE_URL=$DB_LINK" > apps/worker-service/.env
echo "REDIS_URL=$REDIS_LINK" >> apps/worker-service/.env
echo "JWT_SECRET=$JWT_SEC" >> apps/worker-service/.env

npx turbo build --filter=@aagam/worker-service

echo "✅ Setup Complete!"