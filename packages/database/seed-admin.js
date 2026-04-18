const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Admin User...');
  
  try {
    const admin = await prisma.user.upsert({
      where: { email: 'admin@aagam.com' },
      update: {
        role: 'ADMIN',
        name: 'Aagam Admin'
      },
      create: {
        id: 'admin-manual-id-001', // Note: For Supabase Login, this must eventually match a Supabase Auth ID
        email: 'admin@aagam.com',
        name: 'Aagam Admin',
        role: 'ADMIN',
      },
    });

    console.log('✅ Admin user created/updated in Database:', admin.email);
    console.log('--------------------------------------------------');
    console.log('IMPORTANT: Since this was a direct DB insert, if you');
    console.log('cannot login, please use the Signup page on the web');
    console.log('or mobile app once to create the Supabase Auth entry.');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
