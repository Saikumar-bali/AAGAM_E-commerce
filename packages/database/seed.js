const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcrypt');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample data...');

  try {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !process.env.ADMIN_PASSWORD && !process.env.SEED_ADMIN_PASSWORD) {
      throw new Error('Production seed requires ADMIN_PASSWORD or SEED_ADMIN_PASSWORD; refusing a repository-known default credential.');
    }

    // Test/development seeds may use explicit role passwords or one shared
    // SEED_DEMO_PASSWORD. Production must always provide the Admin password.
    const localOnlyPassword = process.env.SEED_DEMO_PASSWORD || 'Aagam-Local-Seed-Only-Change-Me!';
    const adminPlainPassword = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || localOnlyPassword;
    const customerPlainPassword = process.env.CUSTOMER_PASSWORD || localOnlyPassword;
    const storePlainPassword = process.env.STORE_PASSWORD || localOnlyPassword;
    const riderPlainPassword = process.env.RIDER_PASSWORD || localOnlyPassword;

    const adminPassword = await bcrypt.hash(adminPlainPassword, 10);
    const customerPassword = await bcrypt.hash(customerPlainPassword, 10);
    const storePassword = await bcrypt.hash(storePlainPassword, 10);
    const riderPassword = await bcrypt.hash(riderPlainPassword, 10);
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@aagam.com';

    // Create Admin User
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: 'ADMIN', name: 'Aagam Admin', password: adminPassword },
      create: {
        id: 'admin-user-id',
        email: adminEmail,
        name: 'Aagam Admin',
        role: 'ADMIN',
        password: adminPassword,
      },
    });
    console.log(`✅ Admin user created (${adminEmail})`);

    // Create Store Owner User
    const storeEmail = process.env.STORE_EMAIL || 'store@aagam.com';
    const storeOwner = await prisma.user.upsert({
      where: { email: storeEmail },
      update: { role: 'STORE_OWNER', name: 'John Store Owner', password: storePassword },
      create: {
        id: 'store-owner-id',
        email: storeEmail,
        name: 'John Store Owner',
        phone: '+1234567890',
        role: 'STORE_OWNER',
        password: storePassword,
      },
    });
    console.log(`✅ Store owner created (${storeEmail})`);

    // Create a second Store Owner
    const storeOwner2 = await prisma.user.upsert({
      where: { email: 'store2@aagam.com' },
      update: { role: 'STORE_OWNER', name: 'Emma Store Owner', password: storePassword },
      create: {
        id: 'store-owner-id-2',
        email: 'store2@aagam.com',
        name: 'Emma Store Owner',
        phone: '+1234567891',
        role: 'STORE_OWNER',
        password: storePassword,
      },
    });
    console.log('✅ Second store owner created');

    // Create Customer User
    const customerEmail = process.env.CUSTOMER_EMAIL || 'customer@aagam.com';
    const customer = await prisma.user.upsert({
      where: { email: customerEmail },
      update: { role: 'CUSTOMER', name: 'Alice Customer', password: customerPassword },
      create: {
        id: 'customer-user-id',
        email: customerEmail,
        name: 'Alice Customer',
        phone: '+1234567892',
        role: 'CUSTOMER',
        password: customerPassword,
      },
    });
    console.log(`✅ Customer created (${customerEmail})`);

    // Create Rider Users
    const riderEmail = process.env.RIDER_EMAIL || 'rider@aagam.com';
    const rider1 = await prisma.user.upsert({
      where: { email: riderEmail },
      update: { role: 'RIDER', name: 'Bob Rider', password: riderPassword },
      create: {
        email: riderEmail,
        name: 'Bob Rider',
        phone: '+1234567893',
        role: 'RIDER',
        password: riderPassword,
      },
    });

    const rider2 = await prisma.user.upsert({
      where: { email: 'rider2@aagam.com' },
      update: { role: 'RIDER', name: 'Charlie Rider', password: riderPassword },
      create: {
        email: 'rider2@aagam.com',
        name: 'Charlie Rider',
        phone: '+1234567894',
        role: 'RIDER',
        password: riderPassword,
      },
    });
    console.log(`✅ Rider users created (${riderEmail})`);

    // Create Rider Profiles
    const riderProfile1 = await prisma.riderProfile.upsert({
      where: { userId: rider1.id },
      update: { status: 'ONLINE', latitude: 40.7128, longitude: -74.006 },
      create: {
        userId: rider1.id,
        status: 'ONLINE',
        latitude: 40.7128,
        longitude: -74.006,
      },
    });

    const riderProfile2 = await prisma.riderProfile.upsert({
      where: { userId: rider2.id },
      update: { status: 'OFFLINE', latitude: 40.7589, longitude: -73.9851 },
      create: {
        userId: rider2.id,
        status: 'OFFLINE',
        latitude: 40.7589,
        longitude: -73.9851,
      },
    });
    console.log('✅ Rider profiles created');

    // Create Categories (Grocery-style)
    const catVegetables = await prisma.category.upsert({
      where: { name: 'Vegetables' },
      update: {},
      create: { name: 'Vegetables' },
    });
    const catFruits = await prisma.category.upsert({
      where: { name: 'Fruits' },
      update: {},
      create: { name: 'Fruits' },
    });
    const catMilkDairy = await prisma.category.upsert({
      where: { name: 'Milk & Dairy' },
      update: {},
      create: { name: 'Milk & Dairy' },
    });
    const catBreadBakery = await prisma.category.upsert({
      where: { name: 'Bread & Bakery' },
      update: {},
      create: { name: 'Bread & Bakery' },
    });
    const catEggs = await prisma.category.upsert({
      where: { name: 'Eggs' },
      update: {},
      create: { name: 'Eggs' },
    });
    const catBeverages = await prisma.category.upsert({
      where: { name: 'Beverages' },
      update: {},
      create: { name: 'Beverages' },
    });
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
        ownerId: storeOwner.id,
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
        ownerId: storeOwner2.id,
      },
    });
    console.log('✅ Stores created');

    // Create Products (Grocery-style)
    const prod1 = await prisma.product.upsert({
      where: { id: 'prod-1' },
      update: {},
      create: {
        id: 'prod-1',
        name: 'Tomatoes (1kg)',
        description: 'Fresh red tomatoes, perfect for cooking',
        price: 45.00,
        categoryId: catVegetables.id,
      },
    });
    const prod2 = await prisma.product.upsert({
      where: { id: 'prod-2' },
      update: {},
      create: {
        id: 'prod-2',
        name: 'Potatoes (1kg)',
        description: 'Fresh potatoes, versatile for any dish',
        price: 35.00,
        categoryId: catVegetables.id,
      },
    });
    const prod3 = await prisma.product.upsert({
      where: { id: 'prod-3' },
      update: {},
      create: {
        id: 'prod-3',
        name: 'Onions (1kg)',
        description: 'Fresh yellow onions',
        price: 30.00,
        categoryId: catVegetables.id,
      },
    });
    const prod4 = await prisma.product.upsert({
      where: { id: 'prod-4' },
      update: {},
      create: {
        id: 'prod-4',
        name: 'Apples (1kg)',
        description: 'Fresh red apples, sweet and crunchy',
        price: 120.00,
        categoryId: catFruits.id,
      },
    });
    const prod5 = await prisma.product.upsert({
      where: { id: 'prod-5' },
      update: {},
      create: {
        id: 'prod-5',
        name: 'Bananas (1 dozen)',
        description: 'Fresh ripe bananas',
        price: 50.00,
        categoryId: catFruits.id,
      },
    });
    const prod6 = await prisma.product.upsert({
      where: { id: 'prod-6' },
      update: {},
      create: {
        id: 'prod-6',
        name: 'Milk (1L)',
        description: 'Fresh toned milk',
        price: 45.00,
        categoryId: catMilkDairy.id,
      },
    });
    const prod7 = await prisma.product.upsert({
      where: { id: 'prod-7' },
      update: {},
      create: {
        id: 'prod-7',
        name: 'Curd (500g)',
        description: 'Fresh curd, creamy and thick',
        price: 35.00,
        categoryId: catMilkDairy.id,
      },
    });
    const prod8 = await prisma.product.upsert({
      where: { id: 'prod-8' },
      update: {},
      create: {
        id: 'prod-8',
        name: 'Bread (400g)',
        description: 'Fresh bread loaf',
        price: 30.00,
        categoryId: catBreadBakery.id,
      },
    });
    const prod9 = await prisma.product.upsert({
      where: { id: 'prod-9' },
      update: {},
      create: {
        id: 'prod-9',
        name: 'Eggs (12 pack)',
        description: 'Farm fresh eggs',
        price: 60.00,
        categoryId: catEggs.id,
      },
    });
    const prod10 = await prisma.product.upsert({
      where: { id: 'prod-10' },
      update: {},
      create: {
        id: 'prod-10',
        name: 'Bottled Water (1L, 6 pack)',
        description: 'Purified drinking water',
        price: 80.00,
        categoryId: catBeverages.id,
      },
    });
    console.log('✅ Products created');

    await Promise.all([
      prisma.product.update({ where: { id: prod1.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1592924357228-91a4daadcfea' } }),
      prisma.product.update({ where: { id: prod2.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1518977676601-b53f82aba655' } }),
      prisma.product.update({ where: { id: prod3.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1508747703725-719777637510' } }),
      prisma.product.update({ where: { id: prod4.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6' } }),
      prisma.product.update({ where: { id: prod5.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e' } }),
      prisma.product.update({ where: { id: prod6.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1563636619-e9143da7973b' } }),
      prisma.product.update({ where: { id: prod7.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1488477181946-6428a0291777' } }),
      prisma.product.update({ where: { id: prod8.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1509440159596-0249088772ff' } }),
      prisma.product.update({ where: { id: prod9.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f' } }),
      prisma.product.update({ where: { id: prod10.id }, data: { image: 'https://res.cloudinary.com/demo/image/fetch/w_900,h_650,c_fill,q_auto,f_auto/https://images.unsplash.com/photo-1548839140-29a749e1cf4d' } }),
    ]);
    console.log('✅ Product images updated');

    // Create Inventory for stores
    await Promise.all([
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store1.id, productId: prod1.id } },
        update: { quantity: 50 },
        create: { storeId: store1.id, productId: prod1.id, quantity: 50 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store1.id, productId: prod2.id } },
        update: { quantity: 40 },
        create: { storeId: store1.id, productId: prod2.id, quantity: 40 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store1.id, productId: prod3.id } },
        update: { quantity: 100 },
        create: { storeId: store1.id, productId: prod3.id, quantity: 100 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store1.id, productId: prod4.id } },
        update: { quantity: 80 },
        create: { storeId: store1.id, productId: prod4.id, quantity: 80 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store1.id, productId: prod5.id } },
        update: { quantity: 60 },
        create: { storeId: store1.id, productId: prod5.id, quantity: 60 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store1.id, productId: prod6.id } },
        update: { quantity: 30 },
        create: { storeId: store1.id, productId: prod6.id, quantity: 30 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store2.id, productId: prod7.id } },
        update: { quantity: 20 },
        create: { storeId: store2.id, productId: prod7.id, quantity: 20 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store2.id, productId: prod8.id } },
        update: { quantity: 15 },
        create: { storeId: store2.id, productId: prod8.id, quantity: 15 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store2.id, productId: prod9.id } },
        update: { quantity: 25 },
        create: { storeId: store2.id, productId: prod9.id, quantity: 25 },
      }),
      prisma.inventory.upsert({
        where: { storeId_productId: { storeId: store2.id, productId: prod10.id } },
        update: { quantity: 35 },
        create: { storeId: store2.id, productId: prod10.id, quantity: 35 },
      }),
    ]);
    console.log('✅ Inventory created');

    // Create sample orders
    const order1 = await prisma.order.upsert({
      where: { id: 'order-1' },
      update: {},
      create: {
        id: 'order-1',
        customerId: customer.id,
        storeId: 'store-1',
        status: 'DELIVERED',
        totalAmount: 24.95,
        riderId: riderProfile1.id,
        deliveryLat: 40.7589,
        deliveryLng: -73.9851,
      },
    });

    const order2 = await prisma.order.upsert({
      where: { id: 'order-2' },
      update: {},
      create: {
        id: 'order-2',
        customerId: customer.id,
        storeId: 'store-2',
        status: 'OUT_FOR_DELIVERY',
        totalAmount: 28.98,
        riderId: riderProfile1.id,
        deliveryLat: 40.7589,
        deliveryLng: -73.9851,
      },
    });

    const order3 = await prisma.order.upsert({
      where: { id: 'order-3' },
      update: {},
      create: {
        id: 'order-3',
        customerId: customer.id,
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
        customerId: customer.id,
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
        customerId: customer.id,
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
        customerId: customer.id,
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
        create: { id: 'item-1-1', orderId: order1.id, productId: prod1.id, quantity: 2, price: 8.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-1-2' },
        update: {},
        create: { id: 'item-1-2', orderId: order1.id, productId: prod3.id, quantity: 1, price: 3.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-1-3' },
        update: {},
        create: { id: 'item-1-3', orderId: order1.id, productId: prod4.id, quantity: 2, price: 1.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-2-1' },
        update: {},
        create: { id: 'item-2-1', orderId: order2.id, productId: prod7.id, quantity: 1, price: 14.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-2-2' },
        update: {},
        create: { id: 'item-2-2', orderId: order2.id, productId: prod8.id, quantity: 1, price: 13.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-3-1' },
        update: {},
        create: { id: 'item-3-1', orderId: order3.id, productId: prod2.id, quantity: 1, price: 7.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-3-2' },
        update: {},
        create: { id: 'item-3-2', orderId: order3.id, productId: prod4.id, quantity: 2, price: 1.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-4-1' },
        update: {},
        create: { id: 'item-4-1', orderId: order4.id, productId: prod6.id, quantity: 2, price: 4.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-4-2' },
        update: {},
        create: { id: 'item-4-2', orderId: order4.id, productId: prod5.id, quantity: 2, price: 2.49 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-5-1' },
        update: {},
        create: { id: 'item-5-1', orderId: order5.id, productId: prod8.id, quantity: 1, price: 13.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-6-1' },
        update: {},
        create: { id: 'item-6-1', orderId: order6.id, productId: prod1.id, quantity: 1, price: 8.99 },
      }),
      prisma.orderItem.upsert({
        where: { id: 'item-6-2' },
        update: {},
        create: { id: 'item-6-2', orderId: order6.id, productId: prod4.id, quantity: 3, price: 1.99 },
      }),
    ]);
    console.log('✅ Order items created');

    console.log('--------------------------------------------------');
    console.log('🎉 Database seeded successfully!');
    console.log('--------------------------------------------------');
    console.log('Seeded accounts:');
    console.log(`  Admin: ${adminEmail}`);
    console.log(`  Customer: ${customerEmail}`);
    console.log(`  Store: ${storeEmail}`);
    console.log(`  Rider: ${riderEmail}`);
    console.log('Passwords are never printed. Supply role-specific password environment variables or SEED_DEMO_PASSWORD.');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
