import prisma from '../config/prisma';

export const getRestaurantById = async (id: string) => {
  return prisma.restaurant.findUnique({
    where: { id },
    include: {
      settings: true,
      tableTypes: true,
    },
  });
};

export const createRestaurant = async (data: any) => {
  return prisma.restaurant.create({
    data: {
      ...data,
      settings: {
        create: {}, // Create default settings
      },
    },
  });
};
