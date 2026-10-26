'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import OrderOnlineFab from '@/components/public/OrderOnlineFab';
import { Calendar as CalendarIcon, CheckCircle2, X, Clock, Menu, ArrowLeft, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getTimeSuggestions } from '@/lib/reservationSuggestions';
import ReservationCalendar from './ReservationCalendar';
import ConsentFields from './ConsentFields';
import { getTodayInTZ, zonedWallTimeToUTC, DEFAULT_TZ } from '@/lib/datetime';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

// A single restrained interior photo, used sparingly (About section only) —
// deliberately no full-bleed hero image, which is what sets this layout apart
// structurally from every other one in the library.
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=1200';

export default function NordicMinimalLayout({ slug, initialRestaurant, initialView, menuOnly = false, bookingOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean, bookingOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);

  const [isBookingSuccess, setIsBookingSuccess] = useState(false);
  const [isPossiblyFullyBooked, setIsPossiblyFullyBooked] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

  const tz = restaurant?.settings?.timezone || DEFAULT_TZ;

  const [selectedDate, setSelectedDate] = useState(getTodayInTZ(tz));
  const [selectedTime, setSelectedTime] = useState('19:30');
  const [resForm, setResForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    guestCount: '2',
    notes: '',
    // KVKK consent (PRODUCTION_ROADMAP.md §7.3): required booking consent +
    // separate optional marketing opt-in. Both ride along in the `...resForm`
    // spread already sent to POST /reservations.
    consentAccepted: false,
    marketingConsent: false
  });

  const checkDayStatus = async (date: string) => {
    try {
      setCheckingDay(true);
      const res = await axios.get(`${API_URL}/public/day-status`, { params: { slug, date } });
      setDayStatus(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingDay(false);
    }
  };

  useEffect(() => {
    checkDayStatus(selectedDate);
  }, [selectedDate]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedDateTime = zonedWallTimeToUTC(selectedDate, selectedTime, tz);

    if (combinedDateTime < new Date()) {
      toast.error('Cannot create reservations for the past');
      return;
    }

    if (!resForm.consentAccepted) {
      toast.error(t('public.consent.required'));
      return;
    }

    // A fully booked day has no capacity left — future demand belongs to the
    // reservation flow (retry another date) rather than a waitlist join; the
    // walk-in waitlist is for real-time, same-day guests only.
    if (dayStatus?.daySetting?.isFullyBooked) {
      toast.error('This day is fully booked. Please choose another date.');
      return;
    }

    if (dayStatus && !dayStatus.daySetting?.isReservationEnabled && dayStatus.daySetting) {
      toast.error('Reservations are closed for this day.');
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/reservations`,
        {
          ...resForm,
          guestCount: parseInt(resForm.guestCount),
          startTime: combinedDateTime.toISOString()
        },
        { headers: { 'X-Restaurant-ID': restaurant.id } }
      );
      const bookingData = res.data?.data;
      if (bookingData?.payment?.token) {
        toast.success(t('public.redirectingToPayment'));
        setTimeout(() => { window.location.href = `/pay/${bookingData.payment.token}`; }, 1400);
        return;
      }
      setIsPossiblyFullyBooked(!!res.data?.data?.possiblyFullyBooked);
      setConfirmationCode(res.data?.data?.confirmationCode || null);
      setIsBookingSuccess(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to book');
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // menuOnly/bookingOnly pages render only their one relevant section, so
    // there's nothing to scroll to — they already start on it.
    if (menuOnly || bookingOnly) return;
    if (initialView === 'menu') {
      setTimeout(() => scrollToSection('menu'), 500);
    } else if (initialView === 'booking') {
      setTimeout(() => scrollToSection('reservations'), 500);
    }
  }, [initialView, menuOnly, bookingOnly]);

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] text-[#1c1c1a] font-medium">Experience not found.</div>;

  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || { typography: 'SERIF', colorPalette: 'OBSIDIAN' };
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  const getFontClass = (type: string) => {
    switch (type) {
      case 'SANS': return 'font-sans';
      case 'MONO': return 'font-mono';
      case 'SERIF':
      default: return 'font-serif';
    }
  };
  const fontClass = getFontClass(customization.typography);

  // Muted neutral bases; the accent is always used sparingly (thin lines,
  // one small dot) rather than as a dominant color block.
  const getPalette = (preset: string) => {
    switch (preset) {
      case 'CRIMSON': return { accent: '#a8574a' };
      case 'EARTH': return { accent: '#8a7355' };
      case 'SAGE': return { accent: '#7c9473' };
      case 'OBSIDIAN':
      default: return { accent: '#6b7a6a' };
    }
  };
  const p = getPalette(customization.colorPalette);
  const overrideAccent = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : null;
  const accent = overrideAccent || p.accent;

  const rootStyle = {
    '--bg': '#faf9f7',
    '--text': '#1c1c1a',
    '--muted': '#77756e',
    '--line': '#e4e2dc',
    '--accent': accent,
    backgroundColor: '#faf9f7',
    color: '#1c1c1a',
  } as React.CSSProperties;

  const renderMenuItem = (item: any) => (
    <div className="py-6 border-b border-[color:var(--line)] last:border-0">
      <div className="flex items-baseline justify-between gap-6">
        <h4 className="text-lg font-normal tracking-tight">{item.name}</h4>
        <span className="text-sm text-[color:var(--muted)] whitespace-nowrap">{item.price.toLocaleString('tr-TR')} ₺</span>
      </div>
      {item.description && <p className="text-sm text-[color:var(--muted)] mt-2 leading-relaxed font-light max-w-xl">{item.description}</p>}
      {item.ingredients && <p className="text-xs text-[color:var(--muted)]/80 mt-1 font-light max-w-xl">{t('public.ingredients')}: {item.ingredients}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-[color:var(--muted)]">
        {item.calories && <span>{item.calories} {t('public.calories')}</span>}
        {item.containsAlcohol && <span>· {t('public.containsAlcohol')}</span>}
        {item.containsPork && <span>· {t('public.containsPork')}</span>}
        {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
          <span key={i}>· {tag.trim()}</span>
        ))}
      </div>
      {item.allergens && <p className="mt-2 text-[10px] font-light text-[color:var(--muted)]">{t('public.allergens')}: {item.allergens}</p>}
    </div>
  );

  return (
    <div className={cn("min-h-screen selection:bg-[color:var(--accent)] selection:text-white", fontClass)} style={rootStyle}>

      {customization.announcementText && (
        <div className="w-full text-center py-3 px-4 text-xs tracking-[0.2em] border-b border-[color:var(--line)]" style={{ color: 'var(--accent)' }}>
          {customization.announcementText}
        </div>
      )}

      {/* Header — thin hairline, no blur/background change on scroll (deliberately static, unlike every other layout) */}
      {menuOnly ? (
        <nav className="w-full flex justify-between items-center px-6 md:px-16 py-8 border-b border-[color:var(--line)]">
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-xs tracking-[0.2em] text-[color:var(--muted)] hover:text-[color:var(--text)] transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-6">
            <LanguageSwitcher />
            <Link href={`/r/${slug}?view=booking`} className="text-xs tracking-[0.2em] border-b border-[color:var(--accent)] pb-0.5" style={{ color: 'var(--accent)' }}>
              {t('public.bookATable')}
            </Link>
          </div>
        </nav>
      ) : bookingOnly ? (
        <nav className="w-full flex justify-between items-center px-6 md:px-16 py-8 border-b border-[color:var(--line)]">
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-xs tracking-[0.2em] text-[color:var(--muted)] hover:text-[color:var(--text)] transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-6">
            <LanguageSwitcher />
            <Link href={`/r/${slug}/menu`} className="text-xs tracking-[0.2em] border-b border-[color:var(--accent)] pb-0.5" style={{ color: 'var(--accent)' }}>
              {t('public.menu')}
            </Link>
          </div>
        </nav>
      ) : (
        <nav className="w-full flex items-center px-6 md:px-16 py-8 border-b border-[color:var(--line)] relative">
          <div className="hidden md:flex items-center gap-10 text-[11px] tracking-[0.25em] text-[color:var(--muted)]">
            <button onClick={() => scrollToSection('about')} className="hover:text-[color:var(--text)] transition-colors">{t('public.ourStory')}</button>
            <button onClick={() => scrollToSection('menu')} className="hover:text-[color:var(--text)] transition-colors">{t('public.menu')}</button>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base tracking-[0.3em] whitespace-nowrap">{restaurant.name}</div>
          <div className="ml-auto flex items-center gap-8">
            <div className="hidden md:flex items-center gap-8 text-[11px] tracking-[0.25em] text-[color:var(--muted)]">
              <LanguageSwitcher />
              <button onClick={() => scrollToSection('contact')} className="hover:text-[color:var(--text)] transition-colors">{t('public.contact')}</button>
              <button onClick={() => scrollToSection('reservations')} className="border-b pb-0.5" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{t('public.reservations')}</button>
            </div>
            <div className="md:hidden flex items-center gap-4">
              <LanguageSwitcher />
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1"><Menu className="w-5 h-5" /></button>
            </div>
          </div>
        </nav>
      )}

      {!menuOnly && !bookingOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-[var(--bg)] flex flex-col items-center justify-center space-y-10 animate-in fade-in duration-300 md:hidden">
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-xl">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-xl">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-xl">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-6 text-xl" style={{ color: 'var(--accent)' }}>{t('public.reservations')}</button>
          <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-8 right-6 p-2"><X className="w-6 h-6" /></button>
        </div>
      )}

      {!menuOnly && !bookingOnly && (
        <>
          {/* Hero — no photo at all, just enormous whitespace + a thin rule. The defining structural difference in the library. */}
          <section className="min-h-[85vh] w-full flex flex-col items-center justify-center px-6 text-center">
            <span className="text-[11px] tracking-[0.4em] text-[color:var(--muted)] mb-10">Est. {restaurant.createdAt ? new Date(restaurant.createdAt).getFullYear() : ''}</span>
            <h1 className="text-5xl md:text-8xl font-light tracking-tight leading-[1.05] mb-10">{restaurant.name}</h1>
            <span className="h-px w-16" style={{ background: 'var(--accent)' }} />
            <button onClick={() => scrollToSection('reservations')} className="mt-14 text-xs tracking-[0.3em] border-b pb-1 hover:opacity-70 transition-opacity" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
              {t('public.bookATable')}
            </button>
          </section>

          {customization.showAboutUs && (
            <section id="about" className="py-32 px-6 md:px-16 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
              <div className="aspect-[4/5] w-full overflow-hidden">
                <img src={ABOUT_IMAGE} alt={`Inside ${restaurant.name}`} className="h-full w-full object-cover grayscale-[15%]" />
              </div>
              <div className="space-y-8">
                <span className="text-[11px] tracking-[0.35em] text-[color:var(--muted)]">{t('public.ourStory')}</span>
                <p className="text-[color:var(--muted)] leading-loose font-light text-lg whitespace-pre-wrap">
                  {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {/* Menu — a plain hairline-divided list, no cards, no boxes. Hidden on a booking-only standalone page, mirroring how menuOnly hides Reservations */}
      {!bookingOnly && (
      <section id="menu" className={cn("px-6 md:px-16", menuOnly ? "pt-24 pb-32" : "py-32")}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-[11px] tracking-[0.35em] text-[color:var(--muted)]">{t('public.menu')}</span>
            <h2 className="text-4xl md:text-5xl font-light tracking-tight mt-4">Our Table</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center text-[color:var(--muted)] font-light">The menu is currently being updated.</p>
          ) : (
            <div className="space-y-16">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id}>
                  <h3 className="text-xs tracking-[0.3em] mb-2 pb-4 border-b" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{cat.name}</h3>
                  <div>{cat.items?.map((item: any) => <div key={item.id}>{renderMenuItem(item)}</div>)}</div>
                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-8 space-y-10">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="text-[11px] tracking-[0.25em] mb-2 text-[color:var(--muted)]">{sub.name}</h4>
                          <div>{sub.items?.map((item: any) => <div key={item.id}>{renderMenuItem(item)}</div>)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {restaurant.menus?.[0]?.updatedAt && (
            <div className="text-center mt-16 text-[11px] font-light text-[color:var(--muted)]">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>
      )}

      {menuOnly && (
        <footer className="border-t border-[color:var(--line)] px-6 py-20 text-center md:px-16">
          <h2 className="mb-6 text-2xl font-light tracking-tight">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-sm font-light text-[color:var(--muted)]">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[color:var(--text)]">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[color:var(--text)]">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Link href={`/r/${slug}?view=booking`} className="inline-block mt-10 text-xs tracking-[0.3em] border-b pb-1" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {t('public.bookATable')}
          </Link>
          <p className="mt-12 text-[11px] text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && !bookingOnly && (
        <>
          <section id="contact" className="py-32 px-6 md:px-16 text-center max-w-3xl mx-auto border-t border-[color:var(--line)]">
            <h2 className="text-2xl font-light tracking-tight mb-12">{restaurant.name}</h2>
            {hasContactInfo && (
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-light text-[color:var(--muted)]">
                {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[color:var(--text)]">{restaurant.contactPhone}</a>}
                {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[color:var(--text)]">{restaurant.contactEmail}</a>}
              </div>
            )}
            {customization.showLegal && customization.legalText && (
              <div className="mt-24 pt-12 border-t border-[color:var(--line)] text-xs text-[color:var(--muted)] font-light text-left max-w-2xl mx-auto space-y-4">
                <h4 className="text-[11px] tracking-[0.3em] mb-2 text-center" style={{ color: 'var(--accent)' }}>Legal Terms</h4>
                <div className="whitespace-pre-wrap">{customization.legalText}</div>
              </div>
            )}
            <p className="mt-12 text-[11px] text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
          </section>
        </>
      )}

      {/* Reservations — shown in full mode and on the bookingOnly standalone page */}
      {!menuOnly && (
        <>
          <section id="reservations" className="py-32 px-6 md:px-16 border-t border-[color:var(--line)]">
            <div className="max-w-xl mx-auto">
              <div className="text-center mb-16">
                <span className="text-[11px] tracking-[0.35em] text-[color:var(--muted)]">{t('public.reservations')}</span>
                <h2 className="text-3xl md:text-4xl font-light tracking-tight mt-4">Reserve a Table</h2>
              </div>

              {isBookingSuccess ? (
                <div className="text-center py-14 animate-in fade-in border-t border-b" style={{ borderColor: 'var(--line)' }}>
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-6" style={{ color: 'var(--accent)' }} />
                  <h3 className="text-xl font-light mb-4">{isPossiblyFullyBooked ? 'Request Received' : 'Reservation Confirmed'}</h3>
                  <p className="text-[color:var(--muted)] font-light text-sm">We look forward to welcoming you.</p>
                  {confirmationCode && (
                    <div className="mx-auto mt-8 flex max-w-[220px] flex-col items-center border py-4" style={{ borderColor: 'var(--line)' }}>
                      <span className="text-[10px] tracking-[0.3em] text-[color:var(--muted)]">{t('public.confirmationCodeLabel')}</span>
                      <span className="mt-1 text-2xl font-normal tracking-[0.3em]" style={{ color: 'var(--accent)' }}>{confirmationCode}</span>
                      <span className="mt-2 px-4 text-center text-[10px] font-light text-[color:var(--muted)]">{t('public.confirmationCodeHint')}</span>
                    </div>
                  )}
                  {isPossiblyFullyBooked && (
                    <div className="mt-8 border-l-2 border-amber-500 bg-amber-50 p-4 text-sm font-light text-amber-800 text-left">
                      Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleBooking} className="space-y-12">
                  {restaurant.customization?.reservationInfoText && (
                    <div className="text-sm font-light text-[color:var(--text)] space-y-2 [&>p]:mb-2 [&>a]:underline" style={{ color: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                  )}
                  {restaurant.customization?.reservationWarningText && (
                    <div className="p-6 border-l-2 text-sm font-light space-y-2 [&>p]:mb-2 [&>a]:underline" style={{ borderColor: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                  )}

                  <div className="space-y-4">
                    <Label className="text-[11px] tracking-[0.3em] text-[color:var(--muted)]">Date</Label>
                    <div className="border p-4" style={{ borderColor: 'var(--line)' }}>
                      <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--accent)" accentText="#ffffff" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-[11px] tracking-[0.3em] text-[color:var(--muted)]">Time</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[...times.lunch, ...times.dinner].map(tm => (
                        <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 border text-sm font-light transition-all", selectedTime === tm ? "text-white" : "hover:border-[color:var(--accent)]")}
                          style={selectedTime === tm ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--line)' }}>
                          {tm}
                        </button>
                      ))}
                    </div>
                  </div>

                  {checkingDay ? (
                    <div className="flex items-center gap-3 border-l-2 p-6 text-sm font-light" style={{ borderColor: 'var(--accent)' }}>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--line)]" style={{ borderTopColor: 'var(--accent)' }} /> Checking availability for <strong className="font-normal">{selectedDateLabel}</strong>...
                    </div>
                  ) : dayStatus?.daySetting?.isFullyBooked ? (
                    <div className="border-l-2 border-amber-500 bg-amber-50 p-6 text-sm font-light text-amber-800 flex items-start gap-4">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-[11px]">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-normal text-base">Fully Booked</strong>
                        We are fully booked for reservations on this day. Please choose another date, or call us directly.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                    <div className="border-l-2 border-red-500 bg-red-50 p-6 text-sm font-light text-red-800 flex items-start gap-4">
                      <X className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-[11px]">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-normal text-base">Reservations Closed</strong>
                        Unfortunately, we&apos;re not accepting reservations for this day.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.autoConfirm ? (
                    <div className="border-l-2 bg-emerald-50 p-6 text-sm font-light text-emerald-800 flex items-start gap-4" style={{ borderColor: 'var(--accent)' }}>
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-[11px]">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-normal text-base">Immediate Booking</strong>
                        Your reservation will be confirmed automatically.
                      </div>
                    </div>
                  ) : dayStatus ? (
                    <div className="border-l-2 border-sky-500 bg-sky-50 p-6 text-sm font-light text-sky-800 flex items-start gap-4">
                      <CalendarIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-[11px]">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-normal text-base">Confirmation Queue</strong>
                        This date requires manual staff review. You&apos;ll receive a notification.
                      </div>
                    </div>
                  ) : null}

                  {dayStatus?.daySetting?.isCapacityFull && (
                    <div className="border-l-2 border-amber-500 bg-amber-50 p-4 text-sm font-light text-amber-800 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="mb-0.5 font-normal">{t('public.capacityFullTitle')}</p>
                        <p>{t('public.capacityFullDesc')}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 text-center">
                    <Label className="block text-[11px] tracking-[0.3em] text-[color:var(--muted)]">Guests</Label>
                    <div className="flex flex-wrap justify-center gap-2">
                      {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                        <button key={n} type="button" onClick={() => setResForm({ ...resForm, guestCount: String(n) })}
                          className={cn("h-11 w-11 border text-sm font-light transition-all", resForm.guestCount === String(n) ? "text-white" : "hover:border-[color:var(--accent)]")}
                          style={resForm.guestCount === String(n) ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--line)' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label className="text-[11px] tracking-[0.3em] text-[color:var(--muted)]">Name</Label>
                      <Input required value={resForm.customerName} onChange={e => setResForm({ ...resForm, customerName: e.target.value })}
                        className="border-0 border-b rounded-none h-12 px-0 text-base focus-visible:ring-0" style={{ borderColor: 'var(--line)' }} />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-[11px] tracking-[0.3em] text-[color:var(--muted)]">Phone</Label>
                      <Input required value={resForm.customerPhone} onChange={e => setResForm({ ...resForm, customerPhone: e.target.value })}
                        className="border-0 border-b rounded-none h-12 px-0 text-base focus-visible:ring-0" style={{ borderColor: 'var(--line)' }} />
                    </div>
                  </div>

                  <ConsentFields
                    slug={slug}
                    consentAccepted={resForm.consentAccepted}
                    onConsentAcceptedChange={(v) => setResForm({ ...resForm, consentAccepted: v })}
                    marketingConsent={resForm.marketingConsent}
                    onMarketingConsentChange={(v) => setResForm({ ...resForm, marketingConsent: v })}
                    className="mt-6 space-y-3 text-xs text-[color:var(--muted)]"
                  />

                  <button type="submit" disabled={checkingDay || dayStatus?.daySetting?.isFullyBooked || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                    className="w-full h-14 text-sm font-normal tracking-[0.25em] mt-8 disabled:opacity-40 transition-all hover:opacity-85"
                    style={{ background: 'var(--accent)', color: '#ffffff' }}>
                    {dayStatus?.daySetting?.isFullyBooked ? 'Fully Booked' : 'Reserve'}
                  </button>
                </form>
              )}
            </div>
          </section>

          {bookingOnly && (
            <footer className="border-t border-[color:var(--line)] px-6 py-20 text-center md:px-16">
              <h2 className="mb-6 text-2xl font-light tracking-tight">{restaurant.name}</h2>
              {hasContactInfo && (
                <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-sm font-light text-[color:var(--muted)]">
                  {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[color:var(--text)]">{restaurant.contactPhone}</a>}
                  {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[color:var(--text)]">{restaurant.contactEmail}</a>}
                </div>
              )}
              <Link href={`/r/${slug}/menu`} className="inline-block mt-10 text-xs tracking-[0.3em] border-b pb-1" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                {t('public.menu')}
              </Link>
              <p className="mt-12 text-[11px] text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
            </footer>
          )}
        </>
      )}
      <OrderOnlineFab slug={slug} restaurant={restaurant} />
    </div>
  );
}
