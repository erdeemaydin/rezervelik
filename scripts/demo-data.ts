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
 *   npm run demo -- --list                                                  # list restaurants and exit
 *
 * Every reservation it creates is tagged (internalNote starts with "DEMO ·"),
 * so `--clear` only ever removes generated demo rows — never real ones.
 */
import { PrismaClient } from '@prisma/client';

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

  // Tables + categories: create a small demo set if the restaurant has none.
  let tables = await prisma.table.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, identifier: true, capacity: true } });
  if (tables.length === 0 && !dryRun) {
    const zone = await prisma.tableType.create({ data: { restaurantId: restaurant.id, name: 'Salon', description: 'Demo zone' } });
    const specs = [['M1', 2], ['M2', 2], ['M3', 4], ['M4', 4], ['M5', 4], ['M6', 6], ['M7', 6], ['M8', 8]] as const;
    await prisma.table.createMany({ data: specs.map(([identifier, capacity]) => ({ restaurantId: restaurant.id, tableTypeId: zone.id, identifier, capacity })) });
    tables = await prisma.table.findMany({ where: { restaurantId: restaurant.id }, select: { id: true, identifier: true, capacity: true } });
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

  console.log(`\nRestaurant: ${restaurant.name}`);
  console.log(`Days: ${days[0]}${days.length > 1 ? ` → ${days[days.length - 1]} (${days.length} days)` : ''}`);
  console.log(`Window: ${openHour}:00–${closeHour}:00 ${tz} · ~${perDay}/day · ${rows.length} reservations`);

  if (dryRun) {
    console.log('\n[dry-run] nothing written. Status breakdown that WOULD be created:');
  } else {
    await prisma.reservation.createMany({ data: rows });
    console.log('\n✅ Created. Status breakdown:');
  }
  for (const [s, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${s.padEnd(10)} ${n}`);
  }
  if (!dryRun) console.log(`\nTip: re-run with --clear to wipe just these demo rows for the same date range.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
