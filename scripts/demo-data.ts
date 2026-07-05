/**
 * Demo data generator — instantly fills a restaurant with realistic reservations
 * for a chosen day or date range, for demos/screenshots/testing.
 *
 * Usage (args after `--`):
 *   npm run demo -- --restaurant <slug|id|name> --date 2026-07-10
 *   npm run demo -- --restaurant gourmet-bistro --from 2026-07-10 --to 2026-07-14
 *   npm run demo -- --restaurant gourmet-bistro --date 2026-07-10 --per-day 25
 *   npm run demo -- --restaurant gourmet-bistro --date 2026-07-10 --start-hour 18 --end-hour 23
 *   npm run demo -- --restaurant gourmet-bistro --date 2026-07-10 --clear   # remove this day's demo rows first
 *   npm run demo -- --restaurant gourmet-bistro --date 2026-07-10 --dry-run # print, don't write
 *   npm run demo -- --restaurant gourmet-bistro --date 2026-07-10 --staff 12   # personnel count (default 8)
 *   npm run demo -- --restaurant gourmet-bistro --date 2026-07-10 --no-staff   # reservations only
 *   npm run demo -- --list                                                  # list restaurants and exit
 *
 * It also creates PERSONNEL: demo staff (MANAGER/HOST/STAFF), shifts, shift
 * assignments across the range, timesheet entries for past days, and availability
 * for future days — so the staff, scheduling, and worked-hours dashboards fill up.
 *
 * Demo rows are safely identifiable: reservations are tagged (internalNote starts
 * with "DEMO ·") and staff use an "@<slug>.demo.invalid" email, so `--clear`/reruns
 * only ever touch generated demo data — never real reservations or real staff.
 * Demo staff log in with password: password123.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_TAG = 'DEMO ·'; // marker in internalNote so demo rows are safe to bulk-remove

// ---------- tiny arg parser ----------
function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true; // flag
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

// ---------- random helpers ----------
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: T[]): T => arr[rand(arr.length)];
const chance = (p: number) => Math.random() < p;
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    if ((r -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

const FIRST_NAMES = ['Ayşe', 'Mehmet', 'Elif', 'Mustafa', 'Zeynep', 'Ahmet', 'Fatma', 'Emre', 'Deniz', 'Can', 'Selin', 'Burak', 'Ece', 'Kerem', 'Merve', 'John', 'Emma', 'Liam', 'Olivia', 'Noah'];
const LAST_NAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Smith', 'Johnson', 'Brown', 'Garcia', 'Miller'];
const NOTE_POOL = ['Pencere kenarı rica', 'Doğum günü kutlaması', 'Yüksek sandalye gerekli', 'Glutensiz menü', 'Sessiz köşe tercih', 'Tekerlekli sandalye erişimi', 'Yıldönümü', ''];

function randomPhone() {
  return `+90 5${rand(4) + 3}${rand(10)} ${100 + rand(900)} ${1000 + rand(9000)}`;
}
function randomName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// ---------- timezone-correct Date builder ----------
// Returns the UTC instant for the given wall-clock time in `timeZone`, so
// reservations land on the intended calendar day regardless of the machine's TZ.
function zonedDate(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcGuess));
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value);
  const asSeen = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
  return new Date(utcGuess - (asSeen - utcGuess));
}

function eachDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// ---------- personnel helpers ----------
// Demo staff are identified by their email domain (<slug>.demo.invalid — .invalid
// is reserved, so it can never collide with a real login), making them reusable
// across runs and safe to identify.
const PERMS: Record<string, string> = {
  MANAGER: 'manage_reservations,manage_tables,manage_menu,manage_staff,manage_settings,manage_calendar,view_analytics,view_payments,view_reviews',
  HOST: 'manage_reservations,manage_tables',
  STAFF: 'manage_reservations',
};
function asciiFold(s: string): string {
  const map: Record<string, string> = { ş: 's', ı: 'i', İ: 'i', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', Ş: 's', Ğ: 'g', Ü: 'u', Ö: 'o', Ç: 'c' };
  return s.replace(/[şıİğüöçŞĞÜÖÇ]/g, (c) => map[c] || c).toLowerCase().replace(/[^a-z0-9]/g, '');
}
const roleForIndex = (i: number) => (i === 0 ? 'MANAGER' : i <= 2 ? 'HOST' : 'STAFF');
const hhmmToMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const minToHHMM = (t: number) => { const h = Math.floor(t / 60) % 24, m = ((t % 60) + 60) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const jitter = (base: number, spread: number) => base + rand(spread * 2 + 1) - spread;

type DemoStaff = { id: string; role: string; firstName: string; lastName: string };

// Reuse existing demo staff for this restaurant; create more to reach `count`.
async function ensureStaff(restaurant: { id: string; slug: string }, count: number, dryRun: boolean) {
  const domain = `${restaurant.slug}.demo.invalid`;
  const existing = await prisma.user.findMany({
    where: { restaurantId: restaurant.id, email: { endsWith: `@${domain}` } },
    select: { id: true, role: true, firstName: true, lastName: true },
  });
  const staff: DemoStaff[] = [...existing];
  const passwordHash = dryRun ? '' : await bcrypt.hash('password123', 10);
  for (let i = existing.length; i < count; i++) {
    const firstName = pick(FIRST_NAMES), lastName = pick(LAST_NAMES), role = roleForIndex(i);
    if (dryRun) { staff.push({ id: `dry-${i}`, role, firstName, lastName }); continue; }
    const u = await prisma.user.create({
      data: {
        restaurantId: restaurant.id,
        email: `${asciiFold(firstName)}.${asciiFold(lastName)}.${i}@${domain}`,
        passwordHash, firstName, lastName, role, permissions: PERMS[role],
        phone: randomPhone().replace(/\s/g, ''),
      },
      select: { id: true, role: true, firstName: true, lastName: true },
    });
    staff.push(u);
  }
  return { staff: staff.slice(0, count), created: Math.max(0, count - existing.length), reused: Math.min(existing.length, count) };
}

// Reuse existing shifts; if the restaurant has none, create Morning + Evening.
async function ensureShifts(restaurant: { id: string }, dryRun: boolean) {
  let shifts = await prisma.shift.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, name: true, startTime: true, endTime: true } });
  if (shifts.length === 0) {
    const defs = [{ name: 'Sabah Vardiyası', startTime: '09:00', endTime: '17:00' }, { name: 'Akşam Vardiyası', startTime: '15:00', endTime: '23:00' }];
    if (dryRun) return defs.map((d, i) => ({ id: `dry-shift-${i}`, ...d }));
    for (const d of defs) {
      const s = await prisma.shift.create({ data: { restaurantId: restaurant.id, ...d } });
      await prisma.shiftDayRequirement.createMany({ data: Array.from({ length: 7 }, (_, dow) => ({ shiftId: s.id, dayOfWeek: dow, requiredStaff: dow === 0 || dow === 6 ? 3 : 2 })) });
    }
    shifts = await prisma.shift.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, name: true, startTime: true, endTime: true } });
  }
  return shifts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('See the header of scripts/demo-data.ts for usage.');
    return;
  }

  // --list: show restaurants (name + slug, never a raw id as the primary handle) and exit.
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true, slug: true } });
  if (args.list || !args.restaurant) {
    console.log('Restaurants:');
    for (const r of restaurants) console.log(`  • ${r.name}  (slug: ${r.slug})`);
    if (!args.restaurant) console.log('\nRe-run with --restaurant <slug> --date <YYYY-MM-DD>');
    return;
  }

  // Resolve the restaurant by slug, name, or id.
  const sel = String(args.restaurant).toLowerCase();
  const restaurant = restaurants.find(
    (r) => r.slug.toLowerCase() === sel || r.name.toLowerCase() === sel || r.id === args.restaurant,
  );
  if (!restaurant) {
    console.error(`✗ No restaurant matches "${args.restaurant}". Run with --list to see options.`);
    process.exit(1);
  }

  // Date range.
  const date = args.date as string | undefined;
  const from = (args.from as string) || date;
  const to = (args.to as string) || date;
  if (!from || !to) {
    console.error('✗ Provide --date YYYY-MM-DD (single day) or --from … --to … (range).');
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('✗ Dates must be YYYY-MM-DD.');
    process.exit(1);
  }
  const days = eachDay(from, to);

  // Settings drive the service window + duration; fall back to sensible defaults.
  const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } });
  const tz = settings?.timezone || 'Europe/Istanbul';
  const openHour = args['start-hour'] !== undefined ? Number(args['start-hour']) : (settings?.openingHour ?? 10);
  const closeHour = args['end-hour'] !== undefined ? Number(args['end-hour']) : (settings?.closingHour ?? 23);
  const duration = settings?.defaultDurationMinutes ?? 90;
  const maxParty = settings?.maxPartySize ?? 8;
  const perDay = args['per-day'] !== undefined ? Number(args['per-day']) : 18;
  const dryRun = !!args['dry-run'];
  const staffCount = args.staff !== undefined ? Number(args.staff) : 8;
  const noStaff = !!args['no-staff'];

  // Tables + categories: create a small demo set if the restaurant has none.
  let tables = await prisma.bookableResource.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, identifier: true, capacity: true } });
  if (tables.length === 0 && !dryRun) {
    const zone = await prisma.zone.create({ data: { restaurantId: restaurant.id, name: 'Salon', description: 'Demo zone' } });
    const specs = [['M1', 2], ['M2', 2], ['M3', 4], ['M4', 4], ['M5', 4], ['M6', 6], ['M7', 6], ['M8', 8]] as const;
    await prisma.bookableResource.createMany({ data: specs.map(([identifier, capacity]) => ({ restaurantId: restaurant.id, tableTypeId: zone.id, identifier, capacity })) });
    tables = await prisma.bookableResource.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, identifier: true, capacity: true } });
    console.log(`  + created ${tables.length} demo tables (restaurant had none)`);
  }

  let categories = await prisma.reservationCategory.findMany({ where: { restaurantId: restaurant.id }, select: { id: true } });
  if (categories.length === 0 && !dryRun) {
    await prisma.reservationCategory.createMany({
      data: [
        { restaurantId: restaurant.id, name: 'Online', color: '#3b82f6' },
        { restaurantId: restaurant.id, name: 'Telefon', color: '#10b981' },
        { restaurantId: restaurant.id, name: 'Walk-In', color: '#f59e0b' },
      ],
    });
    categories = await prisma.reservationCategory.findMany({ where: { restaurantId: restaurant.id }, select: { id: true } });
  }

  // --clear: remove only previously-generated demo rows in this range.
  if (args.clear) {
    const rangeStart = zonedDate(+days[0].slice(0, 4), +days[0].slice(5, 7), +days[0].slice(8, 10), 0, 0, tz);
    const rangeEnd = zonedDate(+days[days.length - 1].slice(0, 4), +days[days.length - 1].slice(5, 7), +days[days.length - 1].slice(8, 10), 23, 59, tz);
    if (!dryRun) {
      const del = await prisma.reservation.deleteMany({
        where: { restaurantId: restaurant.id, startTime: { gte: rangeStart, lte: rangeEnd }, internalNote: { startsWith: DEMO_TAG } },
      });
      console.log(`  − cleared ${del.count} existing demo reservations in range`);
    }
  }

  const now = Date.now();
  const rows: any[] = [];
  const summary: Record<string, number> = {};

  for (const day of days) {
    const [y, mo, d] = day.split('-').map(Number);
    // Track table occupancy to avoid obvious double-bookings.
    const booked: Record<string, [number, number][]> = {};
    const count = Math.max(0, Math.round(perDay * (0.75 + Math.random() * 0.5)));

    for (let i = 0; i < count; i++) {
      const hour = openHour + rand(Math.max(1, closeHour - openHour));
      const minute = pick([0, 15, 30, 45]);
      const start = zonedDate(y, mo, d, hour, minute, tz);
      const end = new Date(start.getTime() + duration * 60000);
      const guestCount = weighted<number>([[2, 5], [3, 3], [4, 4], [5, 2], [6, 2], [1, 1], [Math.min(8, maxParty), 1]].map(([g, w]) => [Math.min(g, maxParty), w]) as [number, number][]);

      // Pick a free table big enough; leave unassigned if none (realistic for PENDING).
      const startMs = start.getTime(), endMs = end.getTime();
      const candidates = tables.filter((t) => t.capacity >= guestCount && !(booked[t.id] || []).some(([s, e]) => startMs < e && endMs > s));
      const table = candidates.length ? pick(candidates) : null;
      if (table) (booked[table.id] ||= []).push([startMs, endMs]);

      // Status depends on when the slot is relative to "now".
      let status: string;
      if (endMs < now) status = weighted([['COMPLETED', 7], ['NO_SHOW', 2], ['CANCELLED', 1]]);
      else if (startMs < now) status = weighted([['SEATED', 6], ['CONFIRMED', 4]]);
      else status = weighted([['CONFIRMED', 7], ['PENDING', 3], ['CANCELLED', 1]]);

      const note = pick(NOTE_POOL);
      rows.push({
        restaurantId: restaurant.id,
        tableId: table?.id ?? null,
        categoryId: categories.length ? pick(categories).id : null,
        customerName: randomName(),
        customerPhone: randomPhone(),
        customerEmail: chance(0.5) ? `guest${rand(9999)}@example.com` : null,
        guestCount,
        startTime: start,
        endTime: end,
        status,
        isVIP: chance(0.1),
        notes: note || null,
        internalNote: `${DEMO_TAG} generated`,
      });
      summary[status] = (summary[status] || 0) + 1;
    }
  }

  // ---------- personnel + scheduling ----------
  let staffInfo = { staff: [] as DemoStaff[], created: 0, reused: 0 };
  let shifts: { id: string; name: string; startTime: string; endTime: string }[] = [];
  const assignments: any[] = [];
  const timeEntries: any[] = [];
  const availability: any[] = [];

  if (!noStaff) {
    staffInfo = await ensureStaff(restaurant, staffCount, dryRun);
    shifts = await ensureShifts(restaurant, dryRun);
    const breakMin = settings?.defaultBreakMinutes ?? 30;

    for (const day of days) {
      const isPast = zonedDate(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), closeHour, 0, tz).getTime() < now;
      const assignedToday = new Set<string>(); // no double-shifts on the same day
      for (const shift of shifts) {
        const need = 2 + rand(2); // 2–3 staff per shift
        const pool = staffInfo.staff.filter((s) => !assignedToday.has(s.id)).sort(() => Math.random() - 0.5).slice(0, need);
        for (const s of pool) {
          assignedToday.add(s.id);
          assignments.push({ shiftId: shift.id, userId: s.id, date: day, isPublished: true });
          if (isPast && chance(0.85)) {
            timeEntries.push({
              restaurantId: restaurant.id, userId: s.id, date: day, shiftId: shift.id,
              checkIn: minToHHMM(jitter(hhmmToMin(shift.startTime), 10)),
              checkOut: minToHHMM(jitter(hhmmToMin(shift.endTime), 15)),
              breakMinutes: breakMin, source: 'MANUAL',
            });
          }
        }
      }
      if (!isPast) {
        for (const shift of shifts) {
          for (const s of staffInfo.staff) {
            const ok = chance(0.85);
            availability.push({ userId: s.id, shiftId: shift.id, date: day, isAvailable: ok, notes: ok ? null : pick(['İzinli', 'Müsait değil', 'Doktor randevusu']) });
          }
        }
      }
    }
  }

  // ---------- write ----------
  if (!dryRun) {
    await prisma.reservation.createMany({ data: rows });
    if (!noStaff) {
      const ids = staffInfo.staff.map((s) => s.id);
      // Scheduling has unique constraints, so replace the demo rows for these staff
      // within the range each run (keeps it idempotent without --clear).
      await prisma.shiftAssignment.deleteMany({ where: { userId: { in: ids }, date: { in: days } } });
      await prisma.timeEntry.deleteMany({ where: { userId: { in: ids }, date: { in: days } } });
      await prisma.employeeAvailability.deleteMany({ where: { userId: { in: ids }, date: { in: days } } });
      if (assignments.length) await prisma.shiftAssignment.createMany({ data: assignments });
      if (timeEntries.length) await prisma.timeEntry.createMany({ data: timeEntries });
      if (availability.length) await prisma.employeeAvailability.createMany({ data: availability });
    }
  }

  // ---------- report ----------
  console.log(`\nRestaurant: ${restaurant.name}`);
  console.log(`Days: ${days[0]}${days.length > 1 ? ` → ${days[days.length - 1]} (${days.length} days)` : ''}`);
  console.log(`Window: ${openHour}:00–${closeHour}:00 ${tz}`);
  console.log(dryRun ? '\n[dry-run] nothing written. Would create:' : '\n✅ Created:');

  console.log(`\nReservations: ${rows.length}`);
  for (const [s, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) console.log(`   ${s.padEnd(10)} ${n}`);

  if (!noStaff) {
    console.log(`\nPersonnel: ${staffInfo.staff.length} staff (${staffInfo.created} new, ${staffInfo.reused} reused) · demo login password: password123`);
    console.log(`   shift assignments ${assignments.length}`);
    console.log(`   time entries      ${timeEntries.length}`);
    console.log(`   availability      ${availability.length}`);
  }

  if (!dryRun) console.log(`\nTip: --clear wipes demo reservations for the range; personnel scheduling is auto-refreshed each run. --no-staff = reservations only.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
