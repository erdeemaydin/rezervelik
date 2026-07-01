const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding themed restaurants...');
  
  const restaurants = [
    {
      name: 'The Rustic Oven',
      slug: 'rustic-oven',
      email: 'hello@rusticoven.com',
      customization: {
        layoutStyle: 'CLASSIC_LIST',
        typography: 'SERIF',
        colorPalette: 'EARTH',
        primaryColor: '#5c4033',
        announcementText: 'Farm to table since 1995.',
      },
      categories: [
        { name: 'Starters', items: [{ name: 'Bruschetta', description: 'Fresh tomatoes, basil, garlic', price: 120 }, { name: 'Garlic Bread', price: 80 }] },
        { name: 'Mains', items: [{ name: 'Wood-fired Pizza', description: 'Margherita with fresh buffalo mozzarella', price: 250 }] }
      ]
    },
    {
      name: 'Neon Bites',
      slug: 'neon-bites',
      email: 'hi@neonbites.com',
      customization: {
        layoutStyle: 'EDITORIAL_IMAGE',
        typography: 'SANS',
        colorPalette: 'OBSIDIAN',
        primaryColor: '#e11d48',
        announcementText: 'Late night modern Asian fusion.',
      },
      categories: [
        { name: 'Bites', items: [{ name: 'Spicy Edamame', description: 'Tossed in chili oil', price: 90, imageUrl: 'https://images.unsplash.com/photo-1627993078491-1772648fbcf9?auto=format&fit=crop&q=80&w=400' }] },
        { name: 'Bowls', items: [{ name: 'Cyber Ramen', description: 'Tonkotsu broth, chashu, black garlic', price: 320, imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&q=80&w=400' }] }
      ]
    },
    {
      name: 'Cosmic Diner',
      slug: 'cosmic-diner',
      email: 'booking@cosmicdiner.com',
      customization: {
        layoutStyle: 'ANIMATED',
        typography: 'MONO',
        colorPalette: 'PEARL',
        primaryColor: '#3b82f6',
        announcementText: 'An out-of-this-world dining experience.',
      },
      categories: [
        { name: 'Nebula Drinks', items: [{ name: 'Galaxy Lemonade', description: 'Color changing butterfly pea flower', price: 150 }] },
        { name: 'Meteor Meals', items: [{ name: 'Asteroid Burger', description: 'Double smash patty with space sauce', price: 280 }] }
      ]
    }
  ];

  for (const r of restaurants) {
    const existing = await prisma.restaurant.findUnique({ where: { slug: r.slug } });
    if (existing) {
      console.log(`Skipping ${r.name}, already exists.`);
      continue;
    }

    const hashedPassword = await bcrypt.hash('password123', 10);

    const restaurant = await prisma.restaurant.create({
      data: {
        name: r.name,
        slug: r.slug,
        contactEmail: r.email,
        settings: { create: { isReservationEnabled: true } },
        customization: {
          create: r.customization
        },
        users: {
          create: {
            email: r.email,
            passwordHash: hashedPassword,
            firstName: 'Admin',
            lastName: r.name,
            role: 'ADMIN'
          }
        },
        menus: {
          create: {
            name: 'Main Menu',
            isActive: true,
            categories: {
              create: r.categories.map((cat, i) => ({
                name: cat.name,
                order: i,
                items: {
                  create: cat.items.map((item, j) => ({
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    imageUrl: item.imageUrl,
                    order: j
                  }))
                }
              }))
            }
          }
        }
      }
    });

    console.log(`Created ${r.name} at /r/${r.slug}`);
  }

  console.log('Seeding complete.');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
