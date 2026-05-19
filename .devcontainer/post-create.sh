#!/bin/bash
set -e

echo "Running npm install..."
npm install

echo "Running prisma generate..."
npx prisma generate

echo "Setup complete!"