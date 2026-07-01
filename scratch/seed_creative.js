const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding world-class inspired restaurants...');
  
  const restaurants = [
    {
      name: 'Sunset Grill & Bar',
      slug: 'sunset-grill-and-bar',
      email: 'info@sunsetgrillbar.com',
      logoUrl: 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&q=80&w=2000',
      customization: {
        layoutStyle: 'EDITORIAL_IMAGE',
        typography: 'SERIF',
        colorPalette: 'OBSIDIAN',
        primaryColor: '#0f172a',
      },
      categories: [
        { name: 'Starters', items: [{ name: 'Beef Carpaccio', description: 'Truffle oil, parmesan, arugula', price: 450 }] },
        { name: 'Main Course', items: [{ name: 'Grilled Sea Bass', description: 'Lemon butter sauce, asparagus', price: 950 }] }
      ]
    },
    {
      name: 'Moss & Stone',
      slug: 'moss-and-stone',
      email: 'reservations@mossandstone.com',
      logoUrl: 'https://images.unsplash.com/photo-1478144592103-25e218a04891?auto=format&fit=crop&q=80&w=2000',
      customization: {
        layoutStyle: 'EDITORIAL_IMAGE',
        typography: 'SANS',
        colorPalette: 'EARTH',
        primaryColor: '#292524',
      },
      categories: [
        { name: 'Foraged', items: [{ name: 'Lichen & Pine', description: 'Crispy reindeer moss, pine needle emulsion, wild berries', price: 850 }] },
        { name: 'Land', items: [{ name: 'Smoked Venison', description: 'Fermented garlic, blackened leeks, juniper juice', price: 1200 }] }
      ]
    },
    {
      name: 'Abstracta',
      slug: 'abstracta',
      email: 'booking@abstracta.com',
      logoUrl: 'https://images.unsplash.com/photo-1516685018646-54919852fdc3?auto=format&fit=crop&q=80&w=2000',
      customization: {
        layoutStyle: 'ANIMATED',
        typography: 'MONO',
        colorPalette: 'PEARL',
        primaryColor: '#ffffff',
      },
      categories: [
        { name: 'Act I', items: [{ name: 'Edible Helium', description: 'Green apple balloon, spun sugar string', price: 600 }] },
        { name: 'Act II', items: [{ name: 'Black Truffle Explosion', description: 'Liquid truffle ravioli, parmesan foam', price: 900 }] }
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

    await prisma.restaurant.create({
      data: {
        name: r.name,
        slug: r.slug,
        contactEmail: r.email,
        logoUrl: r.logoUrl,
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
            name: 'Tasting Menu',
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
