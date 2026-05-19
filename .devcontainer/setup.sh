#!/bin/bash
set -e

echo "Running setup..."

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start services (if needed)
# sudo service postgresql start
# sudo service redis-server start

echo "Setup complete!"