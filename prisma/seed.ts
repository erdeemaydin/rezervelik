import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create a Restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'gourmet-bistro' },
    update: {},
    create: {
      name: 'The Gourmet Bistro',
      slug: 'gourmet-bistro',
      contactEmail: 'hello@gourmetbistro.com',
      contactPhone: '+90 555 123 4567',
      subscriptionPlan: 'PRO',
      settings: {
        create: {
          isReservationEnabled: true,
          logic: 'DYNAMIC_DURATION',
          defaultDurationMinutes: 90,
          currency: 'TRY',
          isVipEnabled: true,
          hasWaitTimeFeature: true,
          hasShiftFeature: true,
          hasMenuFeature: true,
        },
      },
      waitTimeConfig: {
        create: {
          isWaitlistOpen: true,
          isWaitTimeEnabled: true,
          manualWaitTimeLower: 15,
          manualWaitTimeUpper: 30,
        },
      },
    },
  });

  // 2. Create Users
  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@gourmetbistro.com' },
    update: {},
    create: {
      email: 'admin@gourmetbistro.com',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash,
      role: 'ADMIN',
      restaurantId: restaurant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'staff@gourmetbistro.com' },
    update: {},
    create: {
      email: 'staff@gourmetbistro.com',
      firstName: 'Staff',
      lastName: 'Member',
      passwordHash,
      role: 'STAFF',
      restaurantId: restaurant.id,
    },
  });

  // 3. Table Types (Zones)
  const indoor = await prisma.zone.create({
    data: {
      name: 'Indoor',
      description: 'Main dining hall',
      restaurantId: restaurant.id,
    },
  });

  const terrace = await prisma.zone.create({
    data: {
      name: 'Terrace',
      description: 'Outdoor seating with a view',
      restaurantId: restaurant.id,
    },
  });

  // 4. Tables
  const tableData = [
    { identifier: 'T1', capacity: 2, tableTypeId: indoor.id },
    { identifier: 'T2', capacity: 4, tableTypeId: indoor.id },
    { identifier: 'T3', capacity: 4, tableTypeId: indoor.id },
    { identifier: 'T4', capacity: 6, tableTypeId: indoor.id },
    { identifier: 'V1', capacity: 4, tableTypeId: terrace.id },
    { identifier: 'V2', capacity: 2, tableTypeId: terrace.id },
  ];

  for (const t of tableData) {
    await prisma.bookableResource.create({
      data: {
        ...t,
        restaurantId: restaurant.id,
      },
    });
  }

  // 5. Menu
  const menu = await prisma.menu.create({
    data: {
      name: 'Summer Menu',
      restaurantId: restaurant.id,
      categories: {
        create: [
          {
            name: 'Starters',
            items: {
              create: [
                { name: 'Bruschetta', price: 85, description: 'Toasted bread with tomatoes', dietaryTags: 'Vegan' },
                { name: 'Calamari', price: 140, description: 'Fried squid rings with tartar sauce' },
              ],
            },
          },
          {
            name: 'Main Courses',
            items: {
              create: [
                { name: 'Grilled Salmon', price: 320, description: 'Served with asparagus' },
                { name: 'Beef Tenderloin', price: 450, description: 'With red wine reduction' },
              ],
            },
          },
        ],
      },
    },
  });

  // 6. Reservation Category
  const onlineCategory = await prisma.reservationCategory.create({
    data: {
      name: 'Online',
      color: '#3b82f6',
      restaurantId: restaurant.id,
    },
  });

  // 7. A Mock Reservation
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0);

  const endTime = new Date(tomorrow);
  endTime.setHours(20, 30, 0, 0);

  await prisma.reservation.create({
    data: {
      customerName: 'John Doe',
      customerPhone: '+90 500 000 0000',
      guestCount: 2,
      startTime: tomorrow,
      endTime: endTime,
      status: 'CONFIRMED',
      restaurantId: restaurant.id,
      categoryId: onlineCategory.id,
    },
  });

  console.log('✅ Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
