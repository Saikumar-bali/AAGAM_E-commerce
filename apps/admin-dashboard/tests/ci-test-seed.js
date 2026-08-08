/**
 * CI Playwright Test User Seed Script
 *
 * This script ensures all test users required by CI Playwright tests exist.
 * Passwords are intentionally not embedded here; authentication fixtures receive
 * their test-only credentials through CI/local environment variables.
 *
 * Run with:
 *   NODE_ENV=test PLAYWRIGHT_QA_SEED=true node apps/admin-dashboard/tests/ci-test-seed.js
 */

const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from root directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function seedTestUsers() {
  const users = [
    {
      email: 'admin@aagam.com',
      role: 'ADMIN',
      name: 'Admin User',
    },
    {
      email: 'customer@aagam.com',
      role: 'CUSTOMER',
      name: 'Test Customer',
    },
    {
      email: 'store@aagam.com',
      role: 'STORE_OWNER',
      name: 'Store Owner',
    },
    {
      email: 'rider@aagam.com',
      role: 'RIDER',
      name: 'Test Rider',
    },
    {
      email: 'store-owner-qa@aagam.com',
      role: 'STORE_OWNER',
      name: 'QA Store Owner',
    },
    {
      email: 'qa-rider-pick-customer@aagam.com',
      role: 'CUSTOMER',
      name: 'QA Rider Pick Customer',
    },
    {
      email: 'qa-rider-pick-store@aagam.com',
      role: 'STORE_OWNER',
      name: 'QA Rider Pick Store Owner',
    },
  ];

  console.log('[ci-test-seed] Creating test users...');

  for (const user of users) {
    try {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          role: user.role,
          name: user.name,
        },
        create: {
          email: user.email,
          role: user.role,
          name: user.name,
        },
      });
      console.log(`  ✓ ${user.email} (${user.role})`);
    } catch (error) {
      console.error(`  ✗ Failed to create ${user.email}:`, error.message);
      throw error;
    }
  }

  console.log('[ci-test-seed] All test users created successfully');
}

async function main() {
  // Safety checks (same as qa-seed.js)
  const qaSeedFlag = process.env.PLAYWRIGHT_QA_SEED;
  const nodeEnv = process.env.NODE_ENV;
  const dbUrl = process.env.DATABASE_URL || '';

  if (qaSeedFlag !== 'true') {
    throw new Error(
      'CI test seed safety check FAILED: PLAYWRIGHT_QA_SEED is not set to "true".'
    );
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'CI test seed safety check FAILED: NODE_ENV is "production". CI seed is test-only.'
    );
  }

  const forbiddenHosts = ['railway', 'supabase', 'neon', 'render'];
  const lowerUrl = dbUrl.toLowerCase();
  const matched = forbiddenHosts.find((host) => lowerUrl.includes(host));
  if (matched) {
    throw new Error(
      `CI test seed safety check FAILED: DATABASE_URL appears to target a production/cloud DB (matched "${matched}").`
    );
  }

  console.log('[ci-test-seed] Safety check passed: test database confirmed');

  await seedTestUsers();
  console.log('[ci-test-seed] Complete');
}

main()
  .catch((error) => {
    console.error('[ci-test-seed] Error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
