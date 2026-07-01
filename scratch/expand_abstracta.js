const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function expandAbstractaMenu() {
  console.log('Expanding Abstracta Menu...');
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: 'abstracta' },
    include: { menus: { include: { categories: true } } }
  });

  if (!restaurant || !restaurant.menus.length) {
    console.log('Abstracta or its menu not found.');
    return;
  }

  const menu = restaurant.menus[0];

  // Add more categories and items
  await prisma.menuCategory.create({
    data: {
      menuId: menu.id,
      name: 'Act III: The Illusion',
      order: 2,
      items: {
        create: [
          { name: 'Transparent Ravioli', description: 'Clear pasta, smoked ricotta, basil vapor', price: 750, order: 0 },
          { name: 'Deconstructed Forest', description: 'Mushroom soil, edible moss, pine essence', price: 900, order: 1 },
          { name: 'Ocean in a Drop', description: 'Oyster sphere, seawater foam, plankton dust', price: 650, order: 2 }
        ]
      }
    }
  });

  await prisma.menuCategory.create({
    data: {
      menuId: menu.id,
      name: 'Act IV: The Awakening',
      order: 3,
      items: {
        create: [
          { name: 'Floating Dessert', description: 'Anti-gravity vanilla cloud, spun sugar, helium', price: 500, order: 0 },
          { name: 'Liquid Gold', description: 'Saffron emulsion, 24k gold leaf, honey crystal', price: 1200, order: 1 }
        ]
      }
    }
  });

  console.log('Menu expanded successfully.');
}

expandAbstractaMenu().catch(console.error).finally(() => prisma.$disconnect());
