/**
 * Public showcase tenant — builds (or rebuilds) "Harbour & Vine", a fictional
 * London restaurant with English mock data, for the live demo linked from the
 * README. Safe to run against production:
 *
 *   - it only ever touches the restaurant with the fixed DEMO_RESTAURANT_ID
 *     (src/config/demo.ts) and refuses to run if that slug belongs to anyone else;
 *   - every rebuild wipes that one tenant and recreates it, so a nightly cron
 *     undoes whatever demo visitors changed;
 *   - all phone numbers are in Ofcom's ranges reserved for drama/fiction
 *     (07700 900xxx, 020 7946 0xxx) and all emails are @example.com (RFC 2606),
 *     so no message can ever reach a real person;
 *   - account-critical writes (password, 2FA, staff, settings, branding, uploads,
 *     refunds) are blocked for demo sessions by src/middlewares/demoGuard.ts.
 *
 * The data is generated from a fixed random seed, relative to today: ~90 days of
 * reservation history, three weeks of upcoming bookings, a live waitlist, staff
 * rota + timesheets, floor plan, menus, deposits and special days.
 *
 * Usage:
 *   npm run demo:tenant              # wipe + rebuild the demo tenant
 *   npm run demo:tenant -- --wipe    # only remove it
 *
 * Logins (password for all: see DEMO_PASSWORD):
 *   admin@demo.example.com · manager@demo.example.com · host@demo.example.com
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_RESTAURANT_ID, DEMO_RESTAURANT_SLUG } from '../src/config/demo';

const prisma = new PrismaClient();
const RID = DEMO_RESTAURANT_ID;
const TZ = 'Europe/London';
const DAYS_BACK = 90;
const DAYS_AHEAD = 21;
const ROTA_DAYS_BACK = 28;
const ROTA_DAYS_AHEAD = 14;

// ---------- deterministic randomness ----------
let seed = 20261103;
function random() {
  // mulberry32
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (n: number) => Math.floor(random() * n);
const pick = <T>(arr: readonly T[]): T => arr[rand(arr.length)];
const chance = (p: number) => random() < p;
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = random() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}

// ---------- time helpers (wall-clock time in TZ -> UTC instant) ----------
function zonedDate(y: number, mo: number, d: number, h: number, mi: number): Date {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcGuess));
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value);
  const asSeen = Date.UTC(m.year, m.month - 1, m.day, m.hour % 24, m.minute, m.second);
  return new Date(utcGuess - (asSeen - utcGuess));
}
function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
function addDays(iso: string, n: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sun
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// ---------- fictional people ----------
const FIRST = ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Noah', 'Mia', 'Jack', 'Ivy', 'Leo', 'Freya', 'Arthur', 'Grace', 'Oscar', 'Lily', 'Charlie', 'Ella', 'Theo', 'Sophia', 'Henry', 'Poppy', 'Alfie', 'Evie', 'Thomas', 'Florence', 'Samuel', 'Alice', 'Daniel', 'Chloe', 'Lucas', 'Emily', 'Ethan', 'Hannah', 'Max', 'Ruby', 'Adam', 'Zara', 'Ryan', 'Nina', 'Omar', 'Priya', 'Mateo', 'Yuki', 'Ines', 'Kofi', 'Elena', 'Ravi'];
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Johnson', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris', 'Clarke', 'Patel', 'Khan', 'Lewis', 'Jackson', 'Turner', 'Hill', 'Moore', 'Cooper', 'Ward', 'Morris', 'King', 'Baker', 'Shaw', 'Fernandes', 'Novak', 'Rossi', 'Okafor'];
const GUEST_NOTES = ['Window table if possible', 'Celebrating a birthday 🎂', 'High chair needed', 'Gluten-free please', 'Quiet corner preferred', 'Wheelchair access', 'Anniversary dinner', 'Running 10 min late, please hold', 'Nut allergy', 'Vegan guest in party', 'Bringing a small dog (terrace)', 'Business dinner'];
const INTERNAL_NOTES = ['Regular — likes table T4', 'Shellfish allergy, flag to kitchen', 'Complimentary dessert (complaint last visit)', 'Pre-ordered the tasting menu', 'Wine club member', 'Prefers sparkling water on arrival'];

type Customer = { name: string; phone: string; email: string | null; vip: boolean; flaky: boolean; weight: number };
function buildCustomers(): Customer[] {
  const used = new Set<string>();
  const out: Customer[] = [];
  for (let i = 0; i < 260; i++) {
    let name = '';
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (used.has(name));
    used.add(name);
    const [f, l] = name.toLowerCase().split(' ');
    out.push({
      name,
      phone: `+44 7700 900${String(i).padStart(3, '0')}`,
      email: chance(0.7) ? `${f}.${l}@example.com` : null,
      vip: i < 14,
      flaky: i >= 250, // a few guests with a no-show habit, so the no-show history badge has something to show
      weight: i < 40 ? 8 : 1, // regulars come back often
    });
  }
  return out;
}

// ---------- wipe ----------
async function wipe() {
  const existing = await prisma.restaurant.findUnique({ where: { slug: DEMO_RESTAURANT_SLUG }, select: { id: true } });
  if (existing && existing.id !== RID) {
    throw new Error(`Slug "${DEMO_RESTAURANT_SLUG}" belongs to a non-demo restaurant (${existing.id}). Refusing to touch it.`);
  }
  const clash = await prisma.user.findMany({
    where: { email: { in: Object.values(DEMO_ACCOUNTS) }, NOT: { restaurantId: RID } },
    select: { email: true },
  });
  if (clash.length) throw new Error(`Demo login(s) already used outside the demo tenant: ${clash.map((c) => c.email).join(', ')}`);

  const where = { restaurantId: RID };
  await prisma.$transaction([
    prisma.payment.deleteMany({ where }),
    prisma.reservation.deleteMany({ where }),
    prisma.waitlistEntry.deleteMany({ where }),
    prisma.timeEntry.deleteMany({ where }),
    prisma.floorElement.deleteMany({ where }),
    prisma.bookableResource.deleteMany({ where }),
    prisma.zone.deleteMany({ where }),
    prisma.menu.deleteMany({ where }),
    prisma.user.deleteMany({ where }),
    prisma.restaurant.deleteMany({ where: { id: RID } }),
  ]);
}

// ---------- build ----------
async function build() {
  const today = todayInTz();
  const now = Date.now();
  const customers = buildCustomers();
  const pickCustomer = () => weighted(customers.map((c) => [c, c.weight] as [Customer, number]));

  // Restaurant, settings, branding
  await prisma.restaurant.create({
    data: {
      id: RID,
      slug: DEMO_RESTAURANT_SLUG,
      name: 'Harbour & Vine',
      contactEmail: 'hello@demo.example.com',
      contactPhone: '+44 20 7946 0123',
      subscriptionPlan: 'PREMIUM',
      addressText: '12 Quayside Walk, London (fictional demo venue)',
      latitude: 51.5055,
      longitude: -0.0754,
      sysAdminNotes: 'Public showcase tenant. Rebuilt nightly by scripts/demo-tenant.ts — do not store real data here.',
      settings: {
        create: {
          logic: 'DYNAMIC_DURATION',
          defaultDurationMinutes: 105,
          defaultBreakMinutes: 30,
          currency: 'GBP',
          maxPartySize: 10,
          openingHour: 12,
          closingHour: 23,
          timezone: TZ,
          defaultLanguage: 'en',
          allowOverbooking: true,
          overbookingMaxExtraCovers: 6,
          overbookingMaxExtraReservations: 2,
          schedulingSystem: 'WEEKLY',
          staffScheduleView: 'FULL_ROSTER',
          showAuditLogToTenant: true,
          operatingHours: 'Mon–Thu 12:00–22:30 · Fri–Sat 12:00–23:30 · Sun 12:00–21:00',
        },
      },
      customization: {
        create: {
          layoutStyle: 'CLASSIC_LIST',
          typography: 'SERIF',
          colorPalette: 'EARTH',
          primaryColor: '#1f3a5f',
          announcementText: 'New autumn menu is here — wild mushroom risotto & Cornish hake are back.',
          showAboutUs: true,
          aboutUsText: 'Harbour & Vine is a neighbourhood brasserie on the river: seasonal British produce, a short natural-wine list and a terrace that stays open until the first frost. This is a fictional venue used to demonstrate Rezervelik.',
          showLegal: true,
          legalText: 'Demo venue. All names, numbers and bookings on this page are fictional mock data and are reset every night.',
          reservationInfoText: 'Tables are held for 15 minutes. For parties larger than 10, please call us.',
          reservationWarningText: 'Terrace tables are weather dependent and may be moved inside.',
          privacyNoticeText: 'This is a demo. Any details you enter are stored only until the nightly reset and are never used to contact you.',
          socialLinks: JSON.stringify({ instagram: 'https://example.com/harbourandvine' }),
        },
      },
      waitTimeConfig: {
        create: { isWaitlistOpen: true, isWaitTimeEnabled: true, manualWaitTimeLower: 15, manualWaitTimeUpper: 25 },
      },
      categories: {
        create: [
          { name: 'Online', color: '#2563eb' },
          { name: 'Phone', color: '#10b981' },
          { name: 'Walk-in', color: '#f59e0b' },
          { name: 'Concierge', color: '#8b5cf6' },
        ],
      },
    },
  });
  const categories = await prisma.reservationCategory.findMany({ where: { restaurantId: RID } });
  const cat = (n: string) => categories.find((c) => c.name === n)!.id;

  // Zones, tables, floor plan (logical canvas 1400 × 800, see dashboard/tables)
  const zoneDefs = [
    { key: 'main', name: 'Main Dining', description: 'Ground-floor dining room' },
    { key: 'terrace', name: 'Riverside Terrace', description: 'Heated outdoor seating' },
    { key: 'bar', name: 'Bar', description: 'Counter and high tables' },
    { key: 'private', name: 'Private Room', description: 'Bookable for groups' },
  ];
  const zones: Record<string, string> = {};
  for (const z of zoneDefs) {
    zones[z.key] = (await prisma.zone.create({ data: { restaurantId: RID, name: z.name, description: z.description } })).id;
  }
  type T = [string, number, string, number, number, string];
  const tableSpecs: T[] = [
    ['T1', 2, 'main', 80, 90, 'rectangle'], ['T2', 2, 'main', 200, 90, 'rectangle'], ['T3', 4, 'main', 320, 90, 'rectangle'],
    ['T4', 4, 'main', 460, 90, 'rectangle'], ['T5', 4, 'main', 80, 250, 'rectangle'], ['T6', 4, 'main', 220, 250, 'rectangle'],
    ['T7', 6, 'main', 360, 250, 'rectangle'], ['T8', 6, 'main', 80, 420, 'rectangle'], ['T9', 2, 'main', 260, 420, 'circle'],
    ['T10', 2, 'main', 380, 420, 'circle'], ['T11', 8, 'main', 500, 400, 'rectangle'],
    ['P1', 2, 'terrace', 820, 90, 'circle'], ['P2', 2, 'terrace', 940, 90, 'circle'], ['P3', 4, 'terrace', 1060, 90, 'circle'],
    ['P4', 4, 'terrace', 1180, 90, 'circle'], ['P5', 4, 'terrace', 880, 230, 'circle'], ['P6', 6, 'terrace', 1040, 230, 'rectangle'],
    ['B1', 2, 'bar', 820, 500, 'circle'], ['B2', 2, 'bar', 920, 500, 'circle'], ['B3', 2, 'bar', 1020, 500, 'circle'], ['B4', 3, 'bar', 1120, 500, 'circle'],
    ['PR1', 10, 'private', 860, 650, 'rectangle'],
  ];
  await prisma.bookableResource.createMany({
    data: tableSpecs.map(([identifier, capacity, z, x, y, shape]) => ({
      restaurantId: RID, tableTypeId: zones[z], identifier, capacity, positionX: x, positionY: y, shape,
      width: shape === 'circle' ? 70 : capacity >= 8 ? 160 : capacity >= 6 ? 120 : 80,
      height: shape === 'circle' ? 70 : 70,
    })),
  });
  await prisma.floorElement.createMany({
    data: [
      { restaurantId: RID, tableTypeId: zones.main, type: 'box', label: 'Kitchen pass', positionX: 60, positionY: 600, width: 300, height: 120, color: '#e2e8f0' },
      { restaurantId: RID, tableTypeId: zones.main, type: 'text', label: 'Entrance', positionX: 520, positionY: 640, width: 140, height: 40 },
      { restaurantId: RID, tableTypeId: zones.bar, type: 'box', label: 'Bar counter', positionX: 800, positionY: 410, width: 420, height: 60, color: '#fde68a' },
      { restaurantId: RID, tableTypeId: zones.terrace, type: 'divider', label: 'River railing', positionX: 790, positionY: 50, width: 540, height: 8 },
      { restaurantId: RID, tableTypeId: zones.main, type: 'wall', positionX: 740, positionY: 40, width: 10, height: 720 },
    ],
  });
  const tables = await prisma.bookableResource.findMany({ where: { restaurantId: RID }, select: { id: true, identifier: true, capacity: true, tableTypeId: true } });

  // Menus
  const allergenFree = { dietaryTags: null as string | null, allergens: null as string | null };
  const menu = [
    { name: 'Starters', items: [
      { name: 'Roasted Tomato Soup', description: 'Basil oil, sourdough croutons', price: 7.5, dietaryTags: 'Vegan', calories: 240 },
      { name: 'Burrata', description: 'Heritage tomatoes, aged balsamic, basil', price: 11, dietaryTags: 'Vegetarian,Gluten-Free', allergens: 'Dairy', isHighlight: true, calories: 410 },
      { name: 'Salt & Pepper Squid', description: 'Lemon aioli, chilli', price: 9.5, allergens: 'Molluscs,Eggs,Gluten', spiceLevel: 1, calories: 380 },
      { name: 'Chicken Liver Pâté', description: 'Red onion chutney, toasted brioche', price: 8.5, allergens: 'Gluten,Dairy,Eggs', calories: 450 },
      { name: 'Crispy Cauliflower Bites', description: 'Buffalo glaze, vegan ranch', price: 7, dietaryTags: 'Vegan', spiceLevel: 2, calories: 320 },
    ] },
    { name: 'Mains', items: [
      { name: 'Cornish Hake', description: 'Crushed new potatoes, samphire, brown shrimp butter', price: 24, allergens: 'Fish,Crustaceans,Dairy', isHighlight: true, calories: 640 },
      { name: 'Wild Mushroom Risotto', description: 'Parmesan, truffle oil, crispy sage', price: 18.5, dietaryTags: 'Vegetarian,Gluten-Free', allergens: 'Dairy', calories: 720 },
      { name: 'Beer-Battered Fish & Chips', description: 'Mushy peas, tartare sauce, triple-cooked chips', price: 19, allergens: 'Fish,Gluten,Eggs', calories: 980 },
      { name: 'Slow-Braised Lamb Shoulder', description: 'Rosemary jus, celeriac purée, greens', price: 26, allergens: 'Celery,Dairy', calories: 860 },
      { name: 'Harbour Burger', description: 'Aged beef, smoked cheddar, pickles, brioche bun, fries', price: 17.5, allergens: 'Gluten,Dairy,Mustard,Sesame', calories: 1100 },
      { name: 'Roasted Squash & Lentil Pie', description: 'Mash, kale, onion gravy', price: 16, dietaryTags: 'Vegan', calories: 690 },
    ] },
    { name: 'From the Grill', items: [
      { name: '28-Day Ribeye (300g)', description: 'Peppercorn sauce, watercress, chips', price: 34, allergens: 'Dairy', isHighlight: true, calories: 1150 },
      { name: 'Half Free-Range Chicken', description: 'Piri-piri or lemon & thyme', price: 21, dietaryTags: 'Gluten-Free', spiceLevel: 2, calories: 780 },
      { name: 'Grilled Halloumi Skewers', description: 'Flatbread, harissa yoghurt', price: 15.5, dietaryTags: 'Vegetarian', allergens: 'Dairy,Gluten', spiceLevel: 1, calories: 620 },
    ] },
    { name: 'Sides', items: [
      { name: 'Triple-Cooked Chips', price: 4.5, dietaryTags: 'Vegan,Gluten-Free', calories: 420 },
      { name: 'Tenderstem Broccoli', description: 'Chilli, garlic, almonds', price: 5, dietaryTags: 'Vegan', allergens: 'Nuts', calories: 160 },
      { name: 'House Salad', price: 4.5, dietaryTags: 'Vegan,Gluten-Free', calories: 120 },
    ] },
    { name: 'Desserts', items: [
      { name: 'Sticky Toffee Pudding', description: 'Butterscotch sauce, clotted cream', price: 8, allergens: 'Gluten,Dairy,Eggs', isHighlight: true, calories: 690 },
      { name: 'Dark Chocolate Tart', description: 'Sea salt, crème fraîche', price: 8.5, allergens: 'Gluten,Dairy,Eggs', calories: 560 },
      { name: 'Seasonal Sorbet', description: 'Three scoops', price: 6, dietaryTags: 'Vegan,Gluten-Free', calories: 210 },
    ] },
    { name: 'Drinks', items: [
      { name: 'House Lemonade', price: 4, dietaryTags: 'Vegan,Gluten-Free', calories: 140 },
      { name: 'Flat White', price: 3.5, allergens: 'Dairy', calories: 110 },
      { name: 'Pint of Pale Ale', price: 6.5, allergens: 'Gluten', containsAlcohol: true, calories: 210 },
      { name: 'Glass of Picpoul de Pinet', price: 9, containsAlcohol: true, calories: 125 },
      { name: 'Espresso Martini', price: 11, containsAlcohol: true, isHighlight: true, calories: 230 },
    ] },
  ];
  await prisma.menu.create({
    data: {
      restaurantId: RID, name: 'All-Day Menu', isActive: true,
      footnotes: 'Please tell your server about any allergies. A discretionary 12.5% service charge is added to your bill.',
      categories: { create: menu.map((c, ci) => ({ name: c.name, order: ci, items: { create: c.items.map((it, ii) => ({ ...allergenFree, ...it, order: ii })) } })) },
    },
  });
  await prisma.menu.create({
    data: {
      restaurantId: RID, name: 'Festive Set Menu (December)', isActive: false,
      categories: { create: [{ name: 'Three Courses — £45', order: 0, items: { create: [
        { name: 'Celeriac & Apple Soup', price: 0, dietaryTags: 'Vegan', order: 0 },
        { name: 'Roast Turkey Crown, all the trimmings', price: 0, allergens: 'Gluten,Celery', order: 1 },
        { name: 'Christmas Pudding, brandy custard', price: 0, allergens: 'Gluten,Dairy,Eggs,Nuts', order: 2 },
      ] } }] },
    },
  });

  // Staff — three published logins plus a team for the rota
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const PERMS: Record<string, string> = {
    MANAGER: 'manage_reservations,manage_tables,manage_menu,manage_staff,manage_settings,manage_calendar,view_analytics,view_payments,view_reviews',
    HOST: 'manage_reservations,manage_tables',
    STAFF: 'manage_reservations',
  };
  const team: { email: string; firstName: string; lastName: string; role: string }[] = [
    { email: DEMO_ACCOUNTS.admin, firstName: 'Olivia', lastName: 'Bennett', role: 'ADMIN' },
    { email: DEMO_ACCOUNTS.manager, firstName: 'James', lastName: 'Carter', role: 'MANAGER' },
    { email: DEMO_ACCOUNTS.host, firstName: 'Amelia', lastName: 'Hughes', role: 'HOST' },
    ...([['Marcus', 'Reid', 'HOST'], ['Chloe', 'Patel', 'STAFF'], ['Daniel', 'Okafor', 'STAFF'], ['Sofia', 'Rossi', 'STAFF'], ['Liam', 'Walsh', 'STAFF'],
      ['Hannah', 'Brooks', 'STAFF'], ['Tom', 'Fletcher', 'STAFF'], ['Priya', 'Shah', 'STAFF'], ['Ben', 'Morgan', 'STAFF']] as const)
      .map(([f, l, role]) => ({ email: `${f}.${l}@staff.demo.example.com`.toLowerCase(), firstName: f, lastName: l, role })),
  ];
  for (const [i, u] of team.entries()) {
    await prisma.user.create({
      data: {
        restaurantId: RID, ...u, passwordHash, permissions: PERMS[u.role] ?? null,
        phone: `+447700900${String(900 + i).padStart(3, '0')}`,
      },
    });
  }
  const staff = await prisma.user.findMany({ where: { restaurantId: RID, role: { not: 'ADMIN' } }, select: { id: true } });

  // Shifts: lunch ends when dinner starts, and dinner→next lunch leaves 12h, so the
  // generated rota never trips the DOUBLE_SHIFT / 11h CONSECUTIVE_REST warnings.
  const shiftDefs = [
    { name: 'Lunch Shift', startTime: '11:00', endTime: '17:00', weekday: 3, weekend: 4 },
    { name: 'Dinner Shift', startTime: '17:00', endTime: '23:00', weekday: 4, weekend: 5 },
  ];
  const shifts: { id: string; startTime: string; endTime: string; weekday: number; weekend: number }[] = [];
  for (const s of shiftDefs) {
    const created = await prisma.shift.create({
      data: {
        restaurantId: RID, name: s.name, startTime: s.startTime, endTime: s.endTime,
        dayRequirements: { create: Array.from({ length: 7 }, (_, dow) => ({ dayOfWeek: dow, requiredStaff: dow === 0 || dow === 5 || dow === 6 ? s.weekend : s.weekday })) },
      },
    });
    shifts.push({ ...s, id: created.id });
  }
  const assignments: any[] = [], timeEntries: any[] = [], availability: any[] = [];
  for (let off = -ROTA_DAYS_BACK; off <= ROTA_DAYS_AHEAD; off++) {
    const day = addDays(today, off);
    const dow = weekday(day);
    const weekend = dow === 0 || dow === 5 || dow === 6;
    const pool = [...staff].sort(() => random() - 0.5);
    let cursor = 0;
    for (const s of shifts) {
      const need = weekend ? s.weekend : s.weekday;
      for (const u of pool.slice(cursor, cursor + need)) {
        assignments.push({ shiftId: s.id, userId: u.id, date: day, isPublished: off <= 7 });
        if (off < 0 && chance(0.95)) {
          timeEntries.push({
            restaurantId: RID, userId: u.id, date: day, shiftId: s.id,
            checkIn: hhmm(toMin(s.startTime) - 10 + rand(20)), checkOut: hhmm(toMin(s.endTime) - 5 + rand(35)),
            breakMinutes: 30, source: chance(0.6) ? 'AUTO' : 'MANUAL',
          });
        }
      }
      cursor += need;
    }
    if (off > 0) {
      for (const s of shifts) for (const u of staff) {
        const ok = chance(0.88);
        availability.push({ userId: u.id, shiftId: s.id, date: day, isAvailable: ok, notes: ok ? null : pick(['Holiday', 'University exam', 'Doctor appointment', 'Childcare']) });
      }
    }
  }
  await prisma.shiftAssignment.createMany({ data: assignments });
  await prisma.timeEntry.createMany({ data: timeEntries });
  await prisma.employeeAvailability.createMany({ data: availability });

  // Special days
  const nextDow = (target: number, from: number) => { let o = from; while (weekday(addDays(today, o)) !== target) o++; return addDays(today, o); };
  const tastingNight = nextDow(4, 3); // a Thursday 3+ days out
  const privateHire = nextDow(6, 10); // a Saturday 10+ days out
  await prisma.daySetting.createMany({
    data: [
      { restaurantId: RID, date: tastingNight, eventTitle: 'Natural Wine Pairing Dinner', autoConfirm: true, maxCapacityOverride: 60 },
      { restaurantId: RID, date: privateHire, eventTitle: 'Private Hire — Fully Booked', isFullyBooked: true },
      { restaurantId: RID, date: addDays(today, -14), eventTitle: 'Jazz on the Terrace' },
    ],
  });

  // Reservations
  const perDay = [26, 14, 16, 20, 24, 36, 40]; // Sun..Sat covers the realistic weekly rhythm
  const reservations: any[] = [];
  const payments: any[] = [];
  // Same 6-digit format as real bookings (utils/reservationConflict), unique per tenant.
  const usedCodes = new Set<string>();
  const confirmationCode = () => {
    let c: string;
    do { c = String(100000 + rand(900000)); } while (usedCodes.has(c));
    usedCodes.add(c);
    return c;
  };
  const duration = 105 * 60000;
  for (let off = -DAYS_BACK; off <= DAYS_AHEAD; off++) {
    const day = addDays(today, off);
    if (day === privateHire) continue; // whole venue booked out for the private event
    const [y, mo, d] = ymd(day);
    const dow = weekday(day);
    const busyness = day === tastingNight ? 1.3 : off > 7 ? 0.55 + (DAYS_AHEAD - off) * 0.02 : 1; // far-future days fill up less
    const count = Math.round(perDay[dow] * busyness * (0.85 + random() * 0.3));
    const booked: Record<string, [number, number][]> = {};

    for (let i = 0; i < count; i++) {
      const lunch = chance(dow === 0 ? 0.5 : 0.3);
      const startMin = lunch ? 12 * 60 + rand(11) * 15 : 18 * 60 + rand(15) * 15; // 12:00–14:30 or 18:00–21:30
      const start = zonedDate(y, mo, d, Math.floor(startMin / 60), startMin % 60);
      const startMs = start.getTime(), endMs = startMs + duration;
      const party = weighted<number>([[2, 9], [3, 3], [4, 6], [5, 2], [6, 2], [8, 1], [10, 0.4], [1, 0.6]]);

      const walkIn = chance(0.12);
      const channel = walkIn ? 'Walk-in' : weighted([['Online', 6], ['Phone', 3], ['Concierge', 0.6]] as [string, number][]);
      const guest = pickCustomer();

      // Smallest free table that fits (private room only for big parties).
      const fits = tables
        .filter((t) => t.capacity >= party && (t.identifier !== 'PR1' || party >= 7))
        .filter((t) => !(booked[t.id] || []).some(([s, e]) => startMs < e && endMs > s))
        .sort((a, b) => a.capacity - b.capacity);
      const table = fits[0] ?? null;
      if (!table && off < 0) continue; // the past only keeps bookings that were actually seated somewhere
      if (table) (booked[table.id] ||= []).push([startMs, endMs]);

      let status: string;
      if (endMs < now) status = guest.flaky && chance(0.6) ? 'NO_SHOW' : weighted([['COMPLETED', 86], ['NO_SHOW', 4], ['CANCELLED', 10]]);
      else if (startMs < now) status = 'SEATED';
      else status = off <= 1 ? weighted([['CONFIRMED', 88], ['PENDING', 8], ['CANCELLED', 4]]) : weighted([['CONFIRMED', 70], ['PENDING', 24], ['CANCELLED', 6]]);
      if (!table && status !== 'CANCELLED') status = 'PENDING';

      const leadDays = walkIn ? 0 : weighted([[0, 2], [1, 3], [3, 3], [7, 2], [14, 1], [28, 0.5]]);
      const createdAt = new Date(Math.min(now, startMs - leadDays * 86400000 - rand(10) * 3600000));
      const id = crypto.randomUUID();
      reservations.push({
        id, restaurantId: RID, tableId: status === 'CANCELLED' && chance(0.5) ? null : table?.id ?? null,
        categoryId: cat(channel),
        customerName: guest.name, customerPhone: guest.phone, customerEmail: walkIn ? null : guest.email,
        guestCount: party, startTime: start, endTime: new Date(endMs), status,
        isVIP: guest.vip,
        notes: !walkIn && chance(0.28) ? pick(GUEST_NOTES) : null,
        internalNote: chance(guest.vip ? 0.5 : 0.06) ? pick(INTERNAL_NOTES) : null,
        confirmationCode: confirmationCode(),
        consentAccepted: !walkIn, marketingConsent: !walkIn && chance(0.35), consentTimestamp: walkIn ? null : createdAt,
        createdAt, isPaid: false,
      });

      // £15/head deposits on larger parties, taken through the (mock) payment provider.
      if (party >= 6 && !walkIn && chance(0.7)) {
        const refunded = status === 'CANCELLED';
        const paid = status !== 'PENDING' || chance(0.5);
        const r = reservations[reservations.length - 1];
        r.isPaid = paid && !refunded;
        payments.push({
          restaurantId: RID, reservationId: id, provider: 'MOCK',
          merchantOid: `DEMO${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
          amount: party * 1500, currency: 'GBP',
          status: refunded ? 'REFUNDED' : paid ? 'PAID' : 'PENDING',
          linkTokenHash: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),
          code: crypto.randomBytes(4).toString('hex').toUpperCase(),
          expiresAt: new Date(startMs - 3600000),
          paidAt: paid ? new Date(createdAt.getTime() + 20 * 60000) : null,
          refundedAt: refunded ? new Date(Math.min(now, startMs - 86400000)) : null,
          refundReason: refunded ? 'Cancelled more than 24h in advance' : null,
          createdAt,
        });
      }
    }
  }
  // createMany in chunks keeps each statement comfortably small.
  for (let i = 0; i < reservations.length; i += 500) await prisma.reservation.createMany({ data: reservations.slice(i, i + 500) });
  await prisma.payment.createMany({ data: payments });

  // Live walk-in queue for today + a date waitlist for the fully-booked Saturday.
  const waitlist: any[] = [];
  const queue: [string, number][] = [['SEATED', 95], ['SEATED', 70], ['NOTIFIED', 25], ['WAITING', 18], ['WAITING', 11], ['WAITING', 4]];
  for (const [status, minsAgo] of queue) {
    const g = pickCustomer();
    const joinedAt = new Date(now - minsAgo * 60000);
    waitlist.push({
      restaurantId: RID, customerName: g.name, customerPhone: g.phone, partySize: pick([2, 2, 3, 4, 4, 5]),
      quotedWaitTime: 15 + rand(4) * 5, status, joinedAt,
      notifiedAt: status !== 'WAITING' ? new Date(joinedAt.getTime() + 15 * 60000) : null,
      seatedAt: status === 'SEATED' ? new Date(joinedAt.getTime() + 22 * 60000) : null,
    });
  }
  for (let i = 0; i < 5; i++) {
    const g = pickCustomer();
    waitlist.push({
      restaurantId: RID, customerName: g.name, customerPhone: g.phone, partySize: pick([2, 4, 4, 6]),
      status: 'WAITING', targetDate: privateHire, notes: i === 0 ? 'Any time after 19:00 is fine' : null,
      joinedAt: new Date(now - (i + 1) * 7 * 3600000),
    });
  }
  await prisma.waitlistEntry.createMany({ data: waitlist });

  const byStatus: Record<string, number> = {};
  for (const r of reservations) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log(`✅ Harbour & Vine rebuilt (${today}, ${TZ})`);
  console.log(`   reservations ${reservations.length}  ${JSON.stringify(byStatus)}`);
  console.log(`   payments ${payments.length} · waitlist ${waitlist.length} · staff ${team.length} · rota ${assignments.length} · timesheets ${timeEntries.length}`);
  console.log(`   public page /r/${DEMO_RESTAURANT_SLUG} · logins ${Object.values(DEMO_ACCOUNTS).join(', ')} / ${DEMO_PASSWORD}`);
}

async function main() {
  await wipe();
  if (process.argv.includes('--wipe')) {
    console.log('🧹 Demo tenant removed.');
    return;
  }
  await build();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
