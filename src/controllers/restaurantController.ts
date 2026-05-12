import { Request, Response } from 'express';
import * as restaurantService from '../services/restaurantService';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getRestaurant = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const restaurant = await restaurantService.getRestaurantById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 'errors.restaurant_not_found', 404);
    }

    return successResponse(res, restaurant);
  } catch (error) {
    console.error('Get restaurant error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Total Reservations (Last 30 days)
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    const totalReservations = await prisma.reservation.count({
      where: { 
        restaurantId,
        startTime: { gte: thirtyDaysAgo }
      }
    });

    // 2. Active Tables (Current occupancy)
    const activeReservations = await prisma.reservation.count({
      where: {
        restaurantId,
        status: 'CONFIRMED',
        startTime: { lte: now },
        endTime: { gte: now }
      }
    });
    
    const totalTables = await prisma.table.count({
      where: { restaurantId }
    });

    // 3. Staff Online (Today's assignments)
    const dateStr = todayStart.toISOString().split('T')[0];
    const staffToday = await prisma.shiftAssignment.findMany({
      where: {
        date: dateStr,
        shift: { restaurantId }
      },
      distinct: ['userId']
    });

    // 4. Weekly Volume Data
    const weeklyReservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        startTime: { gte: weekAgo }
      },
      select: {
        startTime: true,
        guestCount: true
      }
    });

    // Group by day of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const volumeByDay = days.map(day => ({ name: day, total: 0 }));
    
    weeklyReservations.forEach(res => {
      const dayIndex = res.startTime.getDay();
      volumeByDay[dayIndex].total += 1; // Or use guestCount
    });

    // Reorder to start from Mon or based on current week
    // For simplicity, we just return it as is or rotate it
    
    // 5. Zone Popularity
    const zoneStats = await prisma.tableType.findMany({
      where: { restaurantId },
      include: {
        _count: {
          select: {
            tables: {
              where: {
                reservations: {
                  some: {
                    startTime: { gte: thirtyDaysAgo }
                  }
                }
              }
            }
          }
        }
      }
    });

    // More accurate zone popularity: count reservations per table type
    const zonePopularity = await prisma.reservation.groupBy({
      by: ['tableId'],
      where: {
        restaurantId,
        startTime: { gte: thirtyDaysAgo },
        tableId: { not: null }
      },
      _count: {
        id: true
      }
    });

    // Map tableIds to TableTypes
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      include: { tableType: true }
    });

    const popularityByType: Record<string, number> = {};
    zonePopularity.forEach(item => {
      const table = tables.find(t => t.id === item.tableId);
      if (table) {
        const typeName = table.tableType.name;
        popularityByType[typeName] = (popularityByType[typeName] || 0) + item._count.id;
      }
    });

    const finalZoneStats = Object.entries(popularityByType).map(([name, value]) => ({
      name,
      value
    }));

    // 6. Recent Activity
    const recentActivity = await prisma.reservation.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { table: true }
    });

    return successResponse(res, {
      stats: {
        totalReservations,
        activeTables: activeReservations,
        totalTables,
        staffOnline: staffToday.length,
        occupancyRate: totalTables > 0 ? Math.round((activeReservations / totalTables) * 100) : 0
      },
      volumeData: volumeByDay,
      zoneData: finalZoneStats.length > 0 ? finalZoneStats : [
        { name: 'Indoor', value: 0 },
        { name: 'Terrace', value: 0 }
      ],
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        time: a.createdAt,
        user: 'System', // Could be enhanced to track who created it
        action: `New reservation for ${a.customerName} (${a.guestCount} guests)`,
        type: 'system'
      }))
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
