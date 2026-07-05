// Per-vertical display terminology.
//
// The code/domain vocabulary is vertical-neutral (a "bookable resource", a "zone",
// a "booking"); this module renders the human label for each concept based on the
// tenant's `businessType` and the active locale. Restaurant is the fallback.
//
// See MULTI_BUSINESS_ROADMAP.md §3 (canonical terminology) and §5 (per-vertical spec).

export type TermConcept =
  | 'resource'
  | 'resourcePlural'
  | 'zone'
  | 'zonePlural'
  | 'booking'
  | 'bookingPlural'
  | 'catalog'
  | 'catalogItem'
  | 'party';

type LocaleTerms = Record<TermConcept, string>;
type BusinessTerms = { tr: LocaleTerms; en: LocaleTerms };

export const DEFAULT_BUSINESS_TYPE = 'RESTAURANT';

export const TERMINOLOGY: Record<string, BusinessTerms> = {
  RESTAURANT: {
    tr: { resource: 'Masa', resourcePlural: 'Masalar', zone: 'Bölüm', zonePlural: 'Bölümler', booking: 'Rezervasyon', bookingPlural: 'Rezervasyonlar', catalog: 'Menü', catalogItem: 'Ürün', party: 'Kişi' },
    en: { resource: 'Table', resourcePlural: 'Tables', zone: 'Section', zonePlural: 'Sections', booking: 'Reservation', bookingPlural: 'Reservations', catalog: 'Menu', catalogItem: 'Dish', party: 'Guests' },
  },
  SALON: {
    tr: { resource: 'Koltuk', resourcePlural: 'Koltuklar', zone: 'İstasyon', zonePlural: 'İstasyonlar', booking: 'Randevu', bookingPlural: 'Randevular', catalog: 'Hizmetler', catalogItem: 'Hizmet', party: 'Müşteri' },
    en: { resource: 'Chair', resourcePlural: 'Chairs', zone: 'Station', zonePlural: 'Stations', booking: 'Appointment', bookingPlural: 'Appointments', catalog: 'Services', catalogItem: 'Service', party: 'Clients' },
  },
  SPORTS: {
    tr: { resource: 'Kort', resourcePlural: 'Kortlar', zone: 'Alan', zonePlural: 'Alanlar', booking: 'Rezervasyon', bookingPlural: 'Rezervasyonlar', catalog: 'Hizmetler', catalogItem: 'Hizmet', party: 'Oyuncu' },
    en: { resource: 'Court', resourcePlural: 'Courts', zone: 'Area', zonePlural: 'Areas', booking: 'Booking', bookingPlural: 'Bookings', catalog: 'Services', catalogItem: 'Service', party: 'Players' },
  },
  COWORKING: {
    tr: { resource: 'Oda', resourcePlural: 'Odalar', zone: 'Kat', zonePlural: 'Katlar', booking: 'Rezervasyon', bookingPlural: 'Rezervasyonlar', catalog: 'Hizmetler', catalogItem: 'Hizmet', party: 'Kişi' },
    en: { resource: 'Room', resourcePlural: 'Rooms', zone: 'Floor', zonePlural: 'Floors', booking: 'Booking', bookingPlural: 'Bookings', catalog: 'Services', catalogItem: 'Service', party: 'People' },
  },
  CLINIC: {
    tr: { resource: 'Oda', resourcePlural: 'Odalar', zone: 'Bölüm', zonePlural: 'Bölümler', booking: 'Randevu', bookingPlural: 'Randevular', catalog: 'Hizmetler', catalogItem: 'Tedavi', party: 'Hasta' },
    en: { resource: 'Room', resourcePlural: 'Rooms', zone: 'Department', zonePlural: 'Departments', booking: 'Appointment', bookingPlural: 'Appointments', catalog: 'Services', catalogItem: 'Treatment', party: 'Patients' },
  },
  WEDDING: {
    tr: { resource: 'Salon', resourcePlural: 'Salonlar', zone: 'Alan', zonePlural: 'Alanlar', booking: 'Organizasyon', bookingPlural: 'Organizasyonlar', catalog: 'Paketler', catalogItem: 'Paket', party: 'Davetli' },
    en: { resource: 'Hall', resourcePlural: 'Halls', zone: 'Area', zonePlural: 'Areas', booking: 'Event', bookingPlural: 'Events', catalog: 'Packages', catalogItem: 'Package', party: 'Guests' },
  },
};

const normalizeLocale = (locale: string): 'tr' | 'en' => (locale === 'en' ? 'en' : 'tr');

/** Resolve a single term for a business type + locale, falling back to RESTAURANT. */
export function resolveTerm(businessType: string, locale: string, concept: TermConcept): string {
  const biz = TERMINOLOGY[businessType] || TERMINOLOGY[DEFAULT_BUSINESS_TYPE];
  return biz[normalizeLocale(locale)][concept];
}
