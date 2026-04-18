const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample data...');

  try {
    // Create Admin User
    const admin = await prisma.user.upsert({
      where: { email: 'admin@aagam.com' },
      update: { role: 'ADMIN', name: 'Aagam Admin' },
      create: {
        id: 'admin-user-id',
        email: 'admin@aagam.com',
        name: 'Aagam Admin',
        role: 'ADMIN',
      },
    });
    console.log('✅ Admin user created');

    // Create Store Owner User
    const storeOwner = await prisma.user.upsert({
      where: { email: 'store owner@aagam.com' },
      update: { role: 'STORE_OWNER', name: 'John Store Owner' },
      create: {
        id: 'store-owner-id',
        email: 'store owner@aagam.com',
        name: 'John Store Owner',
        phone: '+1234567890',
        role: 'STORE_OWNER',
      },
    });
    console.log('✅ Store owner created');

    // Create a second Store Owner
    const storeOwner2 = await prisma.user.upsert({
      where: { email: 'store2@aagam.com' },
      update: { role: 'STORE_OWNER', name: 'Emma Store Owner' },
      create: {
        id: 'store-owner-id-2',
        email: 'store2@aagam.com',
        name: 'Emma Store Owner',
        phone: '+1234567891',
        role: 'STORE_OWNER',
      },
    });
    console.log('✅ Second store owner created');

    // Create Customer User
    const customer = await prisma.user.upsert({
      where: { email: 'customer@aagam.com' },
      update: { role: 'CUSTOMER', name: 'Alice Customer' },
      create: {
        id: 'customer-user-id',
        email: 'customer@aagam.com',
        name: 'Alice Customer',
        phone: '+1234567892',
        role: 'CUSTOMER',
      },
    });
    console.log('✅ Customer created');

    // Create Rider Users
    const rider1 = await prisma.user.upsert({
      where: { email: 'rider1@aagam.com' },
      update: { role: 'RIDER', name: 'Bob Rider' },
      create: {
        id: 'rider-user-id-1',
        email: 'rider1@aagam.com',
        name: 'Bob Rider',
        phone: '+1234567893',
        role: 'RIDER',
      },
    });

    const rider2 = await prisma.user.upsert({
      where: { email: 'rider2@aagam.com' },
      update: { role: 'RIDER', name: 'Charlie Rider' },
      create: {
        id: 'rider-user-id-2',
        email: 'rider2@aagam.com',
        name: 'Charlie Rider',
        phone: '+1234567894',
        role: 'RIDER',
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

    // Create Categories
    const categories = await Promise.all([
      prisma.category.upsert({
        where: { name: 'Fast Food' },
        update: {},
        create: { id: 'cat-fast-food', name: 'Fast Food' },
      }),
      prisma.category.upsert({
        where: { name: 'Beverages' },
        update: {},
        create: { id: 'cat-beverages', name: 'Beverages' },
      }),
      prisma.category.upsert({
        where: { name: 'Desserts' },
        update: {},
        create: { id: 'cat-desserts', name: 'Desserts' },
      }),
      prisma.category.upsert({
        where: { name: 'Pizza' },
        update: {},
        create: { id: 'cat-pizza', name: 'Pizza' },
      }),
      prisma.category.upsert({
        where: { name: 'Healthy' },
        update: {},
        create: { id: 'cat-healthy', name: 'Healthy' },
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

    // Create Products
    const products = await Promise.all([
      prisma.product.upsert({
        where: { id: 'prod-1' },
        update: {},
        create: {
          id: 'prod-1',
          name: 'Classic Cheeseburger',
          description: 'Juicy beef patty with melted cheddar, lettuce, tomato, and special sauce',
          price: 8.99,
          categoryId: 'cat-fast-food',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-2' },
        update: {},
        create: {
          id: 'prod-2',
          name: 'Crispy Chicken Sandwich',
          description: 'Crispy fried chicken breast with pickles and mayo',
          price: 7.99,
          categoryId: 'cat-fast-food',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-3' },
        update: {},
        create: {
          id: 'prod-3',
          name: 'French Fries (Large)',
          description: 'Golden crispy fries seasoned to perfection',
          price: 3.99,
          categoryId: 'cat-fast-food',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-4' },
        update: {},
        create: {
          id: 'prod-4',
          name: 'Cola Classic',
          description: 'Refreshing cola beverage',
          price: 1.99,
          categoryId: 'cat-beverages',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-5' },
        update: {},
        create: {
          id: 'prod-5',
          name: 'Lemonade',
          description: 'Fresh squeezed lemonade',
          price: 2.49,
          categoryId: 'cat-beverages',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-6' },
        update: {},
        create: {
          id: 'prod-6',
          name: 'Chocolate Shake',
          description: 'Rich and creamy chocolate milkshake',
          price: 4.99,
          categoryId: 'cat-desserts',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-7' },
        update: {},
        create: {
          id: 'prod-7',
          name: 'Pepperoni Pizza (Large)',
          description: 'Classic pepperoni pizza with extra mozzarella',
          price: 14.99,
          categoryId: 'cat-pizza',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-8' },
        update: {},
        create: {
          id: 'prod-8',
          name: 'Veggie Pizza (Large)',
          description: 'Loaded with fresh vegetables',
          price: 13.99,
          categoryId: 'cat-pizza',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-9' },
        update: {},
        create: {
          id: 'prod-9',
          name: 'Garden Salad',
          description: 'Fresh mixed greens with house dressing',
          price: 6.99,
          categoryId: 'cat-healthy',
        },
      }),
      prisma.product.upsert({
        where: { id: 'prod-10' },
        update: {},
        create: {
          id: 'prod-10',
          name: 'Grilled Chicken Bowl',
          description: 'Grilled chicken over rice with vegetables',
          price: 9.99,
          categoryId: 'cat-healthy',
        },
      }),
    ]);
    console.log('✅ Products created');

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
    console.log('  Admin: admin@aagam.com');
    console.log('  Customer: customer@aagam.com');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();