import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

/**
 * GET /analytics?period=30
 * Returns comprehensive analytics for a restaurant over a given period.
 */
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;

    // Two ways to scope the window:
    //  - explicit custom range via ?from=YYYY-MM-DD&to=YYYY-MM-DD, or
    //  - a rolling ?period=<days> (default 30). Custom range wins when valid.
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;

    let periodStart: Date;
    let rangeEnd: Date;
    let period: number;

    const fromValid = fromStr && !isNaN(new Date(fromStr).getTime());
    const toValid = toStr && !isNaN(new Date(toStr).getTime());

    if (fromValid && toValid) {
      periodStart = new Date(`${fromStr}T00:00:00`);
      rangeEnd = new Date(`${toStr}T23:59:59`);
      if (rangeEnd < periodStart) [periodStart, rangeEnd] = [rangeEnd, periodStart];
      period = Math.max(1, Math.round((rangeEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)));
    } else {
      const periodDays = parseInt(req.query.period as string) || 30;
      const allowedPeriods = [7, 30, 60, 90];
      period = allowedPeriods.includes(periodDays) ? periodDays : 30;
      rangeEnd = new Date();
      periodStart = new Date(rangeEnd.getTime() - period * 24 * 60 * 60 * 1000);
    }

    const now = rangeEnd;
    const prevPeriodStart = new Date(periodStart.getTime() - period * 24 * 60 * 60 * 1000);

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
    const openingHour = settings?.openingHour ?? 10;
    const closingHour = settings?.closingHour ?? 23;

    // ─── 1. Fetch all reservations in current & previous period ───
    const [currentReservations, prevReservations] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          restaurantId,
          startTime: { gte: periodStart, lte: now },
        },
        include: {
          table: { include: { tableType: true } },
          category: true,
        },
      }),
      prisma.reservation.findMany({
        where: {
          restaurantId,
          startTime: { gte: prevPeriodStart, lt: periodStart },
        },
        select: {
          guestCount: true,
          status: true,
        },
      }),
    ]);

    // ─── 2. Summary Stats ───
    const totalReservations = currentReservations.length;

    const confirmedOrCompleted = currentReservations.filter(
      (r) => r.status === 'CONFIRMED' || r.status === 'COMPLETED'
    );
    const totalGuests = confirmedOrCompleted.reduce((sum, r) => sum + r.guestCount, 0);

    const avgPartySize =
      totalReservations > 0
        ? Math.round(
            (currentReservations.reduce((sum, r) => sum + r.guestCount, 0) / totalReservations) * 10
          ) / 10
        : 0;

    const cancelledCount = currentReservations.filter((r) => r.status === 'CANCELLED').length;
    const noShowCount = currentReservations.filter((r) => r.status === 'NO_SHOW').length;

    const cancelRate =
      totalReservations > 0
        ? Math.round((cancelledCount / totalReservations) * 1000) / 10
        : 0;

    const noShowRate =
      totalReservations > 0
        ? Math.round((noShowCount / totalReservations) * 1000) / 10
        : 0;

    const vipCount = currentReservations.filter((r) => r.isVIP).length;

    // ─── 3. Previous Period Comparison ───
    const prevTotalReservations = prevReservations.length;
    const prevConfirmedOrCompleted = prevReservations.filter(
      (r) => r.status === 'CONFIRMED' || r.status === 'COMPLETED'
    );
    const prevTotalGuests = prevConfirmedOrCompleted.reduce((sum, r) => sum + r.guestCount, 0);

    const reservationsChange =
      prevTotalReservations > 0
        ? Math.round(((totalReservations - prevTotalReservations) / prevTotalReservations) * 1000) / 10
        : totalReservations > 0
          ? 100
          : 0;

    const guestsChange =
      prevTotalGuests > 0
        ? Math.round(((totalGuests - prevTotalGuests) / prevTotalGuests) * 1000) / 10
        : totalGuests > 0
          ? 100
          : 0;

    // ─── 4. Daily Trend ───
    const dailyMap = new Map<string, { reservations: number; guests: number }>();

    // Initialize all days in the period
    for (let d = new Date(periodStart); d <= now; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      const dateStr = d.toISOString().split('T')[0];
      dailyMap.set(dateStr, { reservations: 0, guests: 0 });
    }

    currentReservations.forEach((r) => {
      const dateStr = r.startTime.toISOString().split('T')[0];
      const entry = dailyMap.get(dateStr);
      if (entry) {
        entry.reservations += 1;
        entry.guests += r.guestCount;
      }
    });

    const dailyTrend = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      reservations: data.reservations,
      guests: data.guests,
    }));

    // ─── 5. Peak Hours Heatmap ───
    const peakHoursMap = new Map<string, number>();

    currentReservations.forEach((r) => {
      const dayOfWeek = r.startTime.getDay();
      const hour = r.startTime.getHours();
      const key = `${dayOfWeek}-${hour}`;
      peakHoursMap.set(key, (peakHoursMap.get(key) || 0) + 1);
    });

    const peakHours: { dayOfWeek: number; hour: number; count: number }[] = [];
    peakHoursMap.forEach((count, key) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      peakHours.push({ dayOfWeek, hour, count });
    });

    // ─── 6. Status Breakdown ───
    const statusMap = new Map<string, number>();
    currentReservations.forEach((r) => {
      statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1);
    });

    const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // ─── 7. Category Breakdown ───
    const categoryMap = new Map<string, { count: number; color: string | null }>();
    currentReservations.forEach((r) => {
      if (r.category) {
        const existing = categoryMap.get(r.category.name);
        if (existing) {
          existing.count += 1;
        } else {
          categoryMap.set(r.category.name, { count: 1, color: r.category.color });
        }
      }
    });

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      color: data.color,
    }));

    // ─── 8. Zone Utilization ───
    const zoneMap = new Map<string, { reservations: number; totalGuests: number }>();
    currentReservations.forEach((r) => {
      if (r.table?.tableType) {
        const zoneName = r.table.tableType.name;
        const existing = zoneMap.get(zoneName);
        if (existing) {
          existing.reservations += 1;
          existing.totalGuests += r.guestCount;
        } else {
          zoneMap.set(zoneName, { reservations: 1, totalGuests: r.guestCount });
        }
      }
    });

    const zoneUtilization = Array.from(zoneMap.entries()).map(([zone, data]) => ({
      zone,
      reservations: data.reservations,
      avgGuests: Math.round((data.totalGuests / data.reservations) * 10) / 10,
    }));

    // ─── 9. Waitlist Metrics ───
    const waitlistEntries = await prisma.waitlistEntry.findMany({
      where: {
        restaurantId,
        joinedAt: { gte: periodStart, lte: now },
      },
    });

    const totalJoined = waitlistEntries.length;
    const seated = waitlistEntries.filter((w) => w.status === 'SEATED').length;
    const waitlistNoShow = waitlistEntries.filter((w) => w.status === 'NO_SHOW').length;
    const waitlistCanceled = waitlistEntries.filter((w) => w.status === 'CANCELED').length;

    // Average wait time for SEATED entries (in minutes)
    const seatedEntries = waitlistEntries.filter((w) => w.status === 'SEATED' && w.seatedAt);
    const avgWaitMinutes =
      seatedEntries.length > 0
        ? Math.round(
            seatedEntries.reduce((sum, w) => {
              const waitMs = w.seatedAt!.getTime() - w.joinedAt.getTime();
              return sum + waitMs / 60000;
            }, 0) / seatedEntries.length
          )
        : 0;

    const conversionRate =
      totalJoined > 0
        ? Math.round((seated / totalJoined) * 1000) / 10
        : 0;

    // ─── 10. Booking lead time (how far in advance guests book) ───
    // Average hours between when a reservation was created and its start time.
    const leadReservations = currentReservations.filter((r) => r.createdAt);
    const avgLeadHours =
      leadReservations.length > 0
        ? Math.round(
            (leadReservations.reduce((sum, r) => {
              const leadMs = r.startTime.getTime() - r.createdAt.getTime();
              return sum + Math.max(0, leadMs) / 3600000;
            }, 0) / leadReservations.length) * 10
          ) / 10
        : 0;
    const avgLeadDays = Math.round((avgLeadHours / 24) * 10) / 10;

    // ─── 11. New vs returning vs regular customers ───
    // Classify each distinct guest (by phone) who booked in the period by their
    // all-time reservation count at this restaurant:
    //   new = 1 total · returning = 2-4 · regular = 5+.
    const periodPhones = [...new Set(currentReservations.map((r) => r.customerPhone).filter(Boolean))];
    const lifetimeCounts = periodPhones.length
      ? await prisma.reservation.groupBy({
          by: ['customerPhone'],
          where: { restaurantId, customerPhone: { in: periodPhones } },
          _count: { _all: true },
        })
      : [];
    let newCustomers = 0;
    let returningCustomers = 0;
    let regularCustomers = 0;
    for (const row of lifetimeCounts) {
      const total = row._count._all;
      if (total <= 1) newCustomers += 1;
      else if (total <= 4) returningCustomers += 1;
      else regularCustomers += 1;
    }

    return successResponse(res, {
      period,
      range: { from: periodStart.toISOString(), to: now.toISOString() },
      openingHour,
      closingHour,
      summary: {
        totalReservations,
        totalGuests,
        avgPartySize,
        cancelRate,
        noShowRate,
        vipCount,
      },
      comparison: {
        totalReservations: {
          current: totalReservations,
          previous: prevTotalReservations,
          changePercent: reservationsChange,
        },
        totalGuests: {
          current: totalGuests,
          previous: prevTotalGuests,
          changePercent: guestsChange,
        },
      },
      dailyTrend,
      peakHours,
      statusBreakdown,
      categoryBreakdown,
      zoneUtilization,
      waitlistMetrics: {
        totalJoined,
        seated,
        noShow: waitlistNoShow,
        canceled: waitlistCanceled,
        avgWaitMinutes,
        conversionRate,
      },
      leadTime: {
        avgHours: avgLeadHours,
        avgDays: avgLeadDays,
      },
      customerSegments: {
        new: newCustomers,
        returning: returningCustomers,
        regular: regularCustomers,
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

/**
 * GET /today
 * Returns today's real-time reservation stats and upcoming schedule.
 */
export const getTodayStats = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const now = new Date();

    // Optional ?date=YYYY-MM-DD to view another day's stats (#2.1). Defaults to today.
    const dateStr = req.query.date as string | undefined;
    const anchor = dateStr && !isNaN(new Date(dateStr).getTime()) ? new Date(`${dateStr}T00:00:00`) : now;
    const todayStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const isToday = todayStart.getFullYear() === now.getFullYear()
      && todayStart.getMonth() === now.getMonth()
      && todayStart.getDate() === now.getDate();

    // Fetch all of today's reservations in one query
    const todayReservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        startTime: { gte: todayStart, lt: todayEnd },
      },
      include: {
        table: true,
      },
    });

    // ─── 1. Basic counts ───
    const todayReservationsCount = todayReservations.length;

    const confirmedToday = todayReservations.filter((r) => r.status === 'CONFIRMED');
    const todayGuests = confirmedToday.reduce((sum, r) => sum + r.guestCount, 0);

    const pendingCount = todayReservations.filter((r) => r.status === 'PENDING').length;
    const confirmedCount = confirmedToday.length;
    const canceledCount = todayReservations.filter((r) => r.status === 'CANCELLED').length;
    const noShowCount = todayReservations.filter((r) => r.status === 'NO_SHOW').length;

    // ─── 2. Upcoming reservations (next 10). For today, only those still ahead;
    //        for another selected day, the day's whole schedule. ───
    const upcomingThreshold = isToday ? now : todayStart;
    const upcomingReservations = todayReservations
      .filter((r) => r.startTime > upcomingThreshold)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, 10)
      .map((r) => ({
        customerName: r.customerName,
        guestCount: r.guestCount,
        startTime: r.startTime,
        table: r.table ? { identifier: r.table.identifier } : null,
        status: r.status,
        isVIP: r.isVIP,
      }));

    // ─── 3. Today by hour ───
    const todayByHour: { hour: number; count: number }[] = [];
    const hourMap = new Map<number, number>();

    todayReservations.forEach((r) => {
      const hour = r.startTime.getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });

    for (let h = 0; h < 24; h++) {
      todayByHour.push({ hour: h, count: hourMap.get(h) || 0 });
    }

    // ─── 4. Average duration (in minutes) ───
    const reservationsWithDuration = todayReservations.filter((r) => r.endTime);
    const avgDuration =
      reservationsWithDuration.length > 0
        ? Math.round(
            reservationsWithDuration.reduce((sum, r) => {
              const durationMs = r.endTime!.getTime() - r.startTime.getTime();
              return sum + durationMs / 60000;
            }, 0) / reservationsWithDuration.length
          )
        : 0;

    return successResponse(res, {
      date: todayStart.toISOString().split('T')[0],
      isToday,
      todayReservations: todayReservationsCount,
      todayGuests,
      pendingCount,
      confirmedCount,
      canceledCount,
      noShowCount,
      upcomingReservations,
      todayByHour,
      avgDuration,
    });
  } catch (error) {
    console.error('Get today stats error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
