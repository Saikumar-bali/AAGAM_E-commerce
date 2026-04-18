import { prisma } from '@aagam/database';

async function main() {
  console.log('🚀 Worker Service started...');
  
  // Placeholder for background tasks (e.g., Dispatching riders)
  setInterval(() => {
    console.log('Checking for new orders to dispatch...');
  }, 10000);
}

main().catch(err => {
  console.error('Worker failed:', err);
});
