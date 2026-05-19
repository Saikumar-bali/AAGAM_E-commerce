#!/bin/bash
set -e

echo "Starting setup..."

sudo apt-get update
sudo apt-get install -y postgresql redis-server

sudo service postgresql start
sudo service redis-server start

sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" || true
sudo -u postgres psql -c "CREATE DATABASE aagam_ecom;" || true

echo "Running npm install..."
npm install

echo "Running prisma generate..."
npx prisma generate

echo "Setup complete!"