const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcrypt');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample data...');

  try {
    const demoPassword = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || 'Demo@123', 10);
    const adminPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || process.env.SEED_DEMO_PASSWORD || 'Admin@123', 10);
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@aagam.com';

    // Create Admin User
    const admin = await prisma.user.upsert({
      where: { id: 'admin-user-id' },
      update: { email: adminEmail, role: 'ADMIN', name: 'Aagam Admin', password: adminPassword },
      create: {
        id: 'admin-user-id',
        email: adminEmail,
        name: 'Aagam Admin',
        role: 'ADMIN',
        password: adminPassword,
      },
    });
    console.log('✅ Admin user created');

    // Create Store Owner User
    const storeOwner = await prisma.user.upsert({
      where: { id: 'store-owner-id' },
      update: { email: 'store@aagam.com', role: 'STORE_OWNER', name: 'John Store Owner', password: demoPassword },
      create: {
        id: 'store-owner-id',
        email: 'store@aagam.com',
        name: 'John Store Owner',
        phone: '+1234567890',
        role: 'STORE_OWNER',
        password: demoPassword,
      },
    });
    console.log('✅ Store owner created (store@aagam.com)');

    // Create a second Store Owner
    const storeOwner2 = await prisma.user.upsert({
      where: { id: 'store-owner-id-2' },
      update: { email: 'store2@aagam.com', role: 'STORE_OWNER', name: 'Emma Store Owner', password: demoPassword },
      create: {
        id: 'store-owner-id-2',
        email: 'store2@aagam.com',
        name: 'Emma Store Owner',
        phone: '+1234567891',
        role: 'STORE_OWNER',
        password: demoPassword,
      },
    });
    console.log('✅ Second store owner created');

    // Create Customer User
    const customer = await prisma.user.upsert({
      where: { id: 'customer-user-id' },
      update: { email: 'customer@aagam.com', role: 'CUSTOMER', name: 'Alice Customer', password: demoPassword },
      create: {
        id: 'customer-user-id',
        email: 'customer@aagam.com',
        name: 'Alice Customer',
        phone: '+1234567892',
        role: 'CUSTOMER',
        password: demoPassword,
      },
    });
    console.log('✅ Customer created');

    // Create Rider Users
    const rider1 = await prisma.user.upsert({
      where: { id: 'rider-user-id-1' },
      update: { email: 'rider1@aagam.com', role: 'RIDER', name: 'Bob Rider', password: demoPassword },
      create: {
        id: 'rider-user-id-1',
        email: 'rider1@aagam.com',
        name: 'Bob Rider',
        phone: '+1234567893',
        role: 'RIDER',
        password: demoPassword,
      },
    });

    const rider2 = await prisma.user.upsert({
      where: { id: 'rider-user-id-2' },
      update: { email: 'rider2@aagam.com', role: 'RIDER', name: 'Charlie Rider', password: demoPassword },
      create: {
        id: 'rider-user-id-2',
        email: 'rider2@aagam.com',
        name: 'Charlie Rider',
        phone: '+1234567894',
        role: 'RIDER',
        password: demoPassword,
      },
    });
    console.log('✅ Rider users created');

    // Create Rider Profiles
    const riderProfile1 = await prisma.riderProfile.upsert({
      where: { userId: 'rider-user-id-1' },
      update: { status: 'ONLINE', latitude: 40.7128, longitude: -74.006 },
      create: {
        id: 'rider-profile-1',
        userId: 'rider-user-id-1',
        status: 'ONLINE',
        latitude: 40.7128,
        longitude: -74.006,
      },
    });

    const riderProfile2 = await prisma.riderProfile.upsert({
      where: { userId: 'rider-user-id-2' },
      update: { status: 'OFFLINE', latitude: 40.7589, longitude: -73.9851 },
      create: {
        id: 'rider-profile-2',
        userId: 'rider-user-id-2',
        status: 'OFFLINE',
        latitude: 40.7589,
        longitude: -73.9851,
      },
    });
    console.log('✅ Rider profiles created');

    // Create Categories (Grocery-style)
    const categories = await Promise.all([
      prisma.category.upsert({
        where: { name: 'Vegetables' },
        update: {},
        create: { id: 'cat-vegetables', name: 'Vegetables' },
      }),
      prisma.category.upsert({
        where: { name: 'Fruits' },
        update: {},
        create: { id: 'cat-fruits', name: 'Fruits' },
      }),
      prisma.category.upsert({
        where: { name: 'Milk & Dairy' },
        update: {},
        create: { id: 'cat-milk-dairy', name: 'Milk & Dairy' },
      }),
      prisma.category.upsert({
        where: { name: 'Bread & Bakery' },
        update: {},
        create: { id: 'cat-bread-bakery', name: 'Bread & Bakery' },
      }),
      prisma.category.upsert({
        where: { name: 'Eggs' },
        update: {},
        create: { id: 'cat-eggs', name: 'Eggs' },
      }),
      prisma.category.upsert({
        where: { name: 'Beverages' },
        update: {},
        create: { id: 'cat-beverages', name: 'Beverages' },
      }),
      prisma.category.upsert({
        where: { name: 'Snacks' },
        update: {},
        create: { id: 'cat-snacks', name: 'Snacks' },
      }),
      prisma.category.upsert({
        where: { name: 'Staples' },
        update: {},
        create: { id: 'cat-staples', name: 'Staples' },
      }),
      prisma.category.upsert({
        where: { name: 'Household' },
        update: {},
        create: { id: 'cat-household', name: 'Household' },
      }),
    ]);
    console.log('✅ Categories created');

    // Create Stores
    const store1 = await prisma.store.upsert({
      where: { id: 'store-1' },
      update: {},
      create: {
        id: 'store-1',
        name: "Joe's Burger Joint",
        address: '123 Main Street, New York, NY 10001',
        latitude: 40.7128,
        longitude: -74.006,
        ownerId: 'store-owner-id',
      },
    });

    const store2 = await prisma.store.upsert({
      where: { id: 'store-2' },
      update: {},
      create: {
        id: 'store-2',
        name: 'Pizza Palace',
        address: '456 Oak Avenue, New York, NY 10002',
        latitude: 40.7282,
        longitude: -73.7949,
        ownerId: 'store-owner-id-2',
      },
    });
    console.log('✅ Stores created');

    // Create Products (Grocery-style)
    const products = await Promise.all([
      prisma.product.upsert({
        where: { id: 'prod-1' },
        update: {},
        create: {
          id: 'prod-1',
          name: 'Tomatoes (1kg)',
          description: 'Fresh red tomatoes, perfect for cooking',
          price: 45.00,
          categoryId: 'cat-vegetables',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-2' },
        update: {},
        create: {
          id: 'prod-2',
          name: 'Potatoes (1kg)',
          description: 'Fresh potatoes, versatile for any dish',
          price: 35.00,
          categoryId: 'cat-vegetables',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-3' },
        update: {},
        create: {
          id: 'prod-3',
          name: 'Onions (1kg)',
          description: 'Fresh yellow onions',
          price: 30.00,
          categoryId: 'cat-vegetables',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-4' },
        update: {},
        create: {
          id: 'prod-4',
          name: 'Apples (1kg)',
          description: 'Fresh red apples, sweet and crunchy',
          price: 120.00,
          categoryId: 'cat-fruits',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-5' },
        update: {},
        create: {
          id: 'prod-5',
          name: 'Bananas (1 dozen)',
          description: 'Fresh ripe bananas',
          price: 50.00,
          categoryId: 'cat-fruits',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-6' },
        update: {},
        create: {
          id: 'prod-6',
          name: 'Milk (1L)',
          description: 'Fresh toned milk',
          price: 45.00,
          categoryId: 'cat-milk-dairy',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-7' },
        update: {},
        create: {
          id: 'prod-7',
          name: 'Curd (500g)',
          description: 'Fresh curd, creamy and thick',
          price: 35.00,
          categoryId: 'cat-milk-dairy',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-8' },
        update: {},
        create: {
          id: 'prod-8',
          name: 'Bread (400g)',
          description: 'Fresh bread loaf',
          price: 30.00,
          categoryId: 'cat-bread-bakery',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-9' },
        update: {},
        create: {
          id: 'prod-9',
          name: 'Eggs (12 pack)',
          description: 'Farm fresh eggs',
          price: 60.00,
          categoryId: 'cat-eggs',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-10' },
        update: {},
        create: {
          id: 'prod-10',
          name: 'Bottled Water (1L, 6 pack)',
          description: 'Purified drinking water',
          price: 80.00,
          categoryId: 'cat-beverages',
        },
      }),
    ]);
    console.log('✅ Products created');

    const productImages = {
      'prod-1': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1592924357228-91a4daadcfea',
      'prod-2': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1518977676601-b53f82aba655',
      'prod-3': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1508747703725-719777637510',
      'prod-4': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6',
      'prod-5': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e',
      'prod-6': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1563636619-e9143da7973b',
      'prod-7': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1488477181946-6428a0291777',
      'prod-8': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1509440159596-0249088772ff',
      'prod-9': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f',
      'prod-10': 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1548839140-29a749e1cf4d',
    };

    await Promise.all(
      Object.entries(productImages).map(([id, image]) =>
        prisma.product.update({
          where: { id },
          data: { image },
        })
      )
    );
    console.log('✅ Product images updated');

    // Create Inventory for stores
    await Promise.all([
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-1', productId: 'prod-1' } },
        update: { quantity: 50 },
        create: { storeId: 'store-1', productId: 'prod-1', quantity: 50 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-1', productId: 'prod-2' } },
        update: { quantity: 40 },
        create: { storeId: 'store-1', productId: 'prod-2', quantity: 40 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-1', productId: 'prod-3' } },
        update: { quantity: 100 },
        create: { storeId: 'store-1', productId: 'prod-3', quantity: 100 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-1', productId: 'prod-4' } },
        update: { quantity: 80 },
        create: { storeId: 'store-1', productId: 'prod-4', quantity: 80 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-1', productId: 'prod-5' } },
        update: { quantity: 60 },
        create: { storeId: 'store-1', productId: 'prod-5', quantity: 60 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-1', productId: 'prod-6' } },
        update: { quantity: 30 },
        create: { storeId: 'store-1', productId: 'prod-6', quantity: 30 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-2', productId: 'prod-7' } },
        update: { quantity: 20 },
        create: { storeId: 'store-2', productId: 'prod-7', quantity: 20 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-2', productId: 'prod-8' } },
        update: { quantity: 15 },
        create: { storeId: 'store-2', productId: 'prod-8', quantity: 15 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-2', productId: 'prod-9' } },
        update: { quantity: 25 },
        create: { storeId: 'store-2', productId: 'prod-9', quantity: 25 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: 'store-2', productId: 'prod-10' } },
        update: { quantity: 35 },
        create: { storeId: 'store-2', productId: 'prod-10', quantity: 35 },
      }),
    ]);
    console.log('✅ Inventory created');

    // Create sample orders
    const order1 = await prisma.order.upsert({
      where: { id: 'order-1' },
      update: {},
      create: {
        id: 'order-1',
        customerId: 'customer-user-id',
        storeId: 'store-1',
        status: 'DELIVERED',
        totalAmount: 24.95,
        riderId: 'rider-profile-1',
        deliveryLat: 40.7589,
        deliveryLng: -73.9851,
      },
    });

    const order2 = await prisma.order.upsert({
      where: { id: 'order-2' },
      update: {},
      create: {
        id: 'order-2',
        customerId: 'customer-user-id',
        storeId: 'store-2',
        status: 'OUT_FOR_DELIVERY',
        totalAmount: 28.98,
        riderId: 'rider-profile-1',
        deliveryLat: 40.7589,
        deliveryLng: -73.9851,
      },
    });

    const order3 = await prisma.order.upsert({
      where: { id: 'order-3' },
      update: {},
      create: {
        id: 'order-3',
        customerId: 'customer-user-id',
        storeId: 'store-1',
        status: 'CONFIRMED',
        totalAmount: 12.97,
        deliveryLat: 40.7128,
        deliveryLng: -74.006,
      },
    });

    const order4 = await prisma.order.upsert({
      where: { id: 'order-4' },
      update: {},
      create: {
        id: 'order-4',
        customerId: 'customer-user-id',
        storeId: 'store-1',
        status: 'PENDING',
        totalAmount: 19.97,
        deliveryLat: 40.7282,
        deliveryLng: -73.7949,
      },
    });

    const order5 = await prisma.order.upsert({
      where: { id: 'order-5' },
      update: {},
      create: {
        id: 'order-5',
        customerId: 'customer-user-id',
        storeId: 'store-2',
        status: 'PENDING',
        totalAmount: 13.99,
        deliveryLat: 40.7128,
        deliveryLng: -74.006,
      },
    });

    const order6 = await prisma.order.upsert({
      where: { id: 'order-6' },
      update: {},
      create: {
        id: 'order-6',
        customerId: 'customer-user-id',
        storeId: 'store-1',
        status: 'CANCELLED',
        totalAmount: 15.97,
        deliveryLat: 40.7589,
        deliveryLng: -73.9851,
      },
    });
    console.log('✅ Orders created');

    // Create Order Items
    await Promise.all([
      prisma.orderItem.upsert({
        where: { id: 'item-1-1' },
        update: {},
        create: { id: 'item-1-1', orderId: 'order-1', productId: 'prod-1', quantity: 2, price: 8.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-1-2' },
        update: {},
        create: { id: 'item-1-2', orderId: 'order-1', productId: 'prod-3', quantity: 1, price: 3.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-1-3' },
        update: {},
        create: { id: 'item-1-3', orderId: 'order-1', productId: 'prod-4', quantity: 2, price: 1.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-2-1' },
        update: {},
        create: { id: 'item-2-1', orderId: 'order-2', productId: 'prod-7', quantity: 1, price: 14.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-2-2' },
        update: {},
        create: { id: 'item-2-2', orderId: 'order-2', productId: 'prod-8', quantity: 1, price: 13.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-3-1' },
        update: {},
        create: { id: 'item-3-1', orderId: 'order-3', productId: 'prod-2', quantity: 1, price: 7.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-3-2' },
        update: {},
        create: { id: 'item-3-2', orderId: 'order-3', productId: 'prod-4', quantity: 2, price: 1.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-4-1' },
        update: {},
        create: { id: 'item-4-1', orderId: 'order-4', productId: 'prod-6', quantity: 2, price: 4.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-4-2' },
        update: {},
        create: { id: 'item-4-2', orderId: 'order-4', productId: 'prod-5', quantity: 2, price: 2.49 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-5-1' },
        update: {},
        create: { id: 'item-5-1', orderId: 'order-5', productId: 'prod-8', quantity: 1, price: 13.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-6-1' },
        update: {},
        create: { id: 'item-6-1', orderId: 'order-6', productId: 'prod-1', quantity: 1, price: 8.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-6-2' },
        update: {},
        create: { id: 'item-6-2', orderId: 'order-6', productId: 'prod-4', quantity: 3, price: 1.99 },
      }),
    ]);
    console.log('✅ Order items created');

    console.log('--------------------------------------------------');
    console.log('🎉 Database seeded successfully!');
    console.log('--------------------------------------------------');
    console.log('Sample login credentials:');
    console.log(`  Admin: ${adminEmail}`);
    console.log('  Customer: customer@aagam.com');
    console.log('  Rider: rider1@aagam.com');
    console.log('  Store owner: storeowner@aagam.com');
    console.log('  Demo password: use SEED_ADMIN_PASSWORD for admin and SEED_DEMO_PASSWORD for demo accounts');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
