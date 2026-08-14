'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Calendar as CalendarIcon, CheckCircle2, X, Clock, Menu, ArrowLeft, Wheat, AlertTriangle } from 'lucide-react';
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

// Warm countryside/kitchen imagery — sits beside the hero text, not full-bleed.
const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&q=80&w=1400';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=1200';

// A soft hand-drawn-feeling wave, used between sections instead of hard lines —
// the structural signature that separates this layout from the others.
const WaveDivider = ({ color }: { color: string }) => (
  <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full h-10" aria-hidden="true">
    <path d="M0,30 C150,60 350,0 600,30 C850,60 1050,0 1200,30 L1200,60 L0,60 Z" fill={color} />
  </svg>
);

export default function TrattoriaRusticLayout({ slug, initialRestaurant, initialView, menuOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);
  const [isWaitlistSuccess, setIsWaitlistSuccess] = useState(false);
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

    if (dayStatus?.daySetting?.isFullyBooked) {
      try {
        await axios.post(`${API_URL}/public/restaurant/${slug}/waitlist`, {
          customerName: resForm.customerName,
          customerPhone: resForm.customerPhone,
          partySize: parseInt(resForm.guestCount),
          targetDate: selectedDate,
          notes: `Requested Time: ${selectedTime} - ${resForm.notes}`
        });
        setIsWaitlistSuccess(true);
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to join waitlist');
      }
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
    if (menuOnly) return;
    if (initialView === 'menu') {
      setTimeout(() => scrollToSection('menu'), 500);
    } else if (initialView === 'booking') {
      setTimeout(() => scrollToSection('reservations'), 500);
    }
  }, [initialView, menuOnly]);

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-[#fdf6ec] text-[#3d2b1f] font-medium">Experience not found.</div>;

  const heroImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || { typography: 'SERIF', colorPalette: 'EARTH' };
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

  const getPalette = (preset: string) => {
    switch (preset) {
      case 'CRIMSON': return { accent: '#b3452c', panel: '#f7e9d7' };
      case 'OBSIDIAN': return { accent: '#6b7a4f', panel: '#eef0e2' };
      case 'SAGE': return { accent: '#7c9463', panel: '#eef0e2' };
      case 'EARTH':
      default: return { accent: '#c1652f', panel: '#f7e9d7' };
    }
  };
  const p = getPalette(customization.colorPalette);
  const overrideAccent = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : null;
  const accent = overrideAccent || p.accent;

  const rootStyle = {
    '--bg': '#fdf6ec',
    '--panel': p.panel,
    '--text': '#3d2b1f',
    '--muted': '#8a7360',
    '--accent': accent,
    backgroundColor: '#fdf6ec',
    color: '#3d2b1f',
  } as React.CSSProperties;

  const renderMenuItem = (item: any) => (
    <div className="py-5 border-b-2 border-dotted last:border-0" style={{ borderColor: 'var(--accent)', opacity: 0.9 }}>
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="text-lg font-bold">{item.name}</h4>
        <span className="text-base font-bold whitespace-nowrap" style={{ color: 'var(--accent)' }}>{item.price.toLocaleString('tr-TR')} ₺</span>
      </div>
      {item.description && <p className="text-sm text-[color:var(--muted)] mt-1.5 leading-relaxed">{item.description}</p>}
      {item.ingredients && <p className="text-xs text-[color:var(--muted)]/90 mt-1">{t('public.ingredients')}: {item.ingredients}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {item.calories && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/60">{item.calories} {t('public.calories')}</span>}
        {item.containsAlcohol && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/60">{t('public.containsAlcohol')}</span>}
        {item.containsPork && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/60">{t('public.containsPork')}</span>}
        {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
          <span key={i} className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/60">{tag.trim()}</span>
        ))}
      </div>
      {item.allergens && <p className="mt-2 text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{t('public.allergens')}: {item.allergens}</p>}
    </div>
  );

  return (
    <div className={cn("min-h-screen selection:bg-[color:var(--accent)] selection:text-white", fontClass)} style={rootStyle}>

      {customization.announcementText && (
        <div className="w-full text-center py-2.5 px-4 text-sm font-medium" style={{ background: 'var(--accent)', color: '#fdf6ec' }}>
          {customization.announcementText}
        </div>
      )}

      {menuOnly ? (
        <nav className="w-full flex justify-between items-center px-6 md:px-12 py-5" style={{ background: 'var(--panel)' }}>
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-sm font-bold text-[color:var(--text)] hover:opacity-70 transition-opacity">
            <ArrowLeft className="h-4 w-4" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href={`/r/${slug}?view=booking`} className="rounded-full px-5 py-2 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
              {t('public.bookATable')}
            </Link>
          </div>
        </nav>
      ) : (
        <nav className="w-full flex items-center px-6 md:px-12 py-5 relative" style={{ background: 'var(--panel)' }}>
          <div className="hidden md:flex items-center gap-6 text-sm font-bold">
            <button onClick={() => scrollToSection('about')} className="hover:opacity-70 transition-opacity">{t('public.ourStory')}</button>
            <button onClick={() => scrollToSection('menu')} className="hover:opacity-70 transition-opacity">{t('public.menu')}</button>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl md:text-2xl font-black italic whitespace-nowrap">{restaurant.name}</div>
          <div className="ml-auto flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6 text-sm font-bold">
              <LanguageSwitcher />
              <button onClick={() => scrollToSection('contact')} className="hover:opacity-70 transition-opacity">{t('public.contact')}</button>
              <button onClick={() => scrollToSection('reservations')} className="rounded-full px-5 py-2 text-white transition-transform hover:scale-105" style={{ background: 'var(--accent)' }}>{t('public.reservations')}</button>
            </div>
            <div className="md:hidden flex items-center gap-4">
              <LanguageSwitcher />
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1"><Menu className="w-6 h-6" /></button>
            </div>
          </div>
        </nav>
      )}
      <WaveDivider color="var(--panel)" />

      {!menuOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 md:hidden" style={{ background: 'var(--panel)' }}>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-2xl font-black">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-2xl font-black">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-2xl font-black">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-6 text-2xl font-black" style={{ color: 'var(--accent)' }}>{t('public.reservations')}</button>
          <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-8 right-6 p-2"><X className="w-6 h-6" /></button>
        </div>
      )}

      {!menuOnly && (
        <>
          {/* Hero — two-column welcome, not a full-bleed cinematic banner */}
          <section className="px-6 md:px-12 py-20 md:py-28 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div className="text-center md:text-left order-2 md:order-1">
              <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide mb-6" style={{ color: 'var(--accent)' }}>
                <Wheat className="w-4 h-4" /> Benvenuti
              </span>
              <h1 className="text-5xl md:text-6xl font-black italic leading-[1.05] mb-8">{restaurant.name}</h1>
              <p className="text-[color:var(--muted)] text-lg mb-10 max-w-md mx-auto md:mx-0">Pull up a chair — everything here is made the slow way.</p>
              <button onClick={() => scrollToSection('reservations')} className="rounded-full px-8 py-4 text-sm font-bold uppercase tracking-wide text-white transition-transform hover:scale-105 shadow-lg" style={{ background: 'var(--accent)' }}>
                {t('public.bookATable')}
              </button>
            </div>
            <div className="order-1 md:order-2 aspect-[4/3] w-full overflow-hidden rounded-[2.5rem] shadow-xl rotate-1">
              <img src={heroImage} className="w-full h-full object-cover" alt={restaurant.name} />
            </div>
          </section>

          {customization.showAboutUs && (
            <>
              <WaveDivider color="var(--panel)" />
              <section id="about" className="py-24 px-6 md:px-12" style={{ background: 'var(--panel)' }}>
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
                  <div className="aspect-[4/5] w-full overflow-hidden rounded-[2.5rem] shadow-lg -rotate-1">
                    <img src={ABOUT_IMAGE} alt={`Inside ${restaurant.name}`} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-6 text-center md:text-left">
                    <span className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{t('public.ourStory')}</span>
                    <p className="text-[color:var(--muted)] leading-relaxed text-lg whitespace-pre-wrap">
                      {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
                    </p>
                  </div>
                </div>
              </section>
              <WaveDivider color="var(--bg)" />
            </>
          )}
        </>
      )}

      {/* Menu — a warm chalkboard-style card, not a photo grid */}
      <section id="menu" className={cn("px-6 md:px-12", menuOnly ? "pt-24 pb-28" : "py-24")}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{t('public.menu')}</span>
            <h2 className="text-4xl md:text-5xl font-black italic mt-3">From Our Kitchen</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center text-[color:var(--muted)]">The menu is currently being updated.</p>
          ) : (
            <div className="space-y-14">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id} className="rounded-[2rem] p-8 md:p-10 shadow-sm" style={{ background: 'var(--panel)' }}>
                  <h3 className="text-2xl font-black italic mb-4" style={{ color: 'var(--accent)' }}>{cat.name}</h3>
                  <div>{cat.items?.map((item: any) => <div key={item.id}>{renderMenuItem(item)}</div>)}</div>
                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-8 space-y-8 pt-6 border-t-2 border-dotted" style={{ borderColor: 'var(--accent)' }}>
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="text-lg font-bold italic mb-3">{sub.name}</h4>
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
            <div className="text-center mt-14 text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>

      {menuOnly && (
        <footer className="px-6 py-16 text-center md:px-12" style={{ background: 'var(--panel)' }}>
          <h2 className="mb-6 text-2xl font-black italic">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[color:var(--muted)]">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:opacity-70">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:opacity-70">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Link href={`/r/${slug}?view=booking`} className="inline-block mt-8 rounded-full px-6 py-2.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
            {t('public.bookATable')}
          </Link>
          <p className="mt-10 text-xs text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && (
        <>
          <section id="contact" className="py-24 px-6 md:px-12 text-center max-w-4xl mx-auto">
            <h2 className="text-3xl font-black italic mb-10">{restaurant.name}</h2>
            {hasContactInfo && (
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-[color:var(--muted)]">
                {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:opacity-70">{restaurant.contactPhone}</a>}
                {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:opacity-70">{restaurant.contactEmail}</a>}
              </div>
            )}
            {customization.showLegal && customization.legalText && (
              <div className="mt-20 pt-10 border-t-2 border-dotted text-xs text-[color:var(--muted)] text-left max-w-2xl mx-auto space-y-4" style={{ borderColor: 'var(--accent)' }}>
                <h4 className="text-xs font-bold uppercase tracking-wide mb-2 text-center" style={{ color: 'var(--accent)' }}>Legal Terms</h4>
                <div className="whitespace-pre-wrap">{customization.legalText}</div>
              </div>
            )}
            <p className="mt-10 text-xs text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
          </section>

          <WaveDivider color="var(--panel)" />
          <section id="reservations" className="py-24 px-6 md:px-12" style={{ background: 'var(--panel)' }}>
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-14">
                <span className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{t('public.reservations')}</span>
                <h2 className="text-4xl font-black italic mt-3">Save a Seat</h2>
              </div>

              {isBookingSuccess ? (
                <div className="text-center py-12 animate-in zoom-in rounded-[2rem] shadow-sm p-10" style={{ background: 'var(--bg)' }}>
                  <CheckCircle2 className="w-14 h-14 mx-auto mb-6" style={{ color: 'var(--accent)' }} />
                  <h3 className="text-2xl font-black italic mb-4">{isPossiblyFullyBooked ? 'Request Received' : 'Table Confirmed'}</h3>
                  <p className="text-[color:var(--muted)] text-base">We can&apos;t wait to feed you.</p>
                  {confirmationCode && (
                    <div className="mx-auto mt-8 flex max-w-xs flex-col items-center rounded-2xl border-2 border-dashed px-6 py-4" style={{ borderColor: 'var(--accent)', background: 'var(--panel)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('public.confirmationCodeLabel')}</span>
                      <span className="mt-1 text-2xl font-black tracking-[0.2em]" style={{ color: 'var(--accent)' }}>{confirmationCode}</span>
                      <span className="mt-2 text-[10px] text-[color:var(--muted)]">{t('public.confirmationCodeHint')}</span>
                    </div>
                  )}
                  {isPossiblyFullyBooked && (
                    <div className="mt-8 rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50 p-4 text-sm text-amber-800">
                      Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                    </div>
                  )}
                </div>
              ) : isWaitlistSuccess ? (
                <div className="text-center py-12 animate-in zoom-in rounded-[2rem] shadow-sm p-10" style={{ background: 'var(--bg)' }}>
                  <CheckCircle2 className="w-14 h-14 mx-auto mb-6" style={{ color: 'var(--accent)' }} />
                  <h3 className="text-2xl font-black italic mb-4">Waitlist Joined</h3>
                  <p className="text-[color:var(--muted)] text-base">We will notify you if a table becomes available.</p>
                </div>
              ) : (
                <form onSubmit={handleBooking} className="space-y-10 p-8 md:p-10 rounded-[2rem] shadow-sm" style={{ background: 'var(--bg)' }}>
                  {restaurant.customization?.reservationInfoText && (
                    <div className="text-base text-[color:var(--text)] space-y-2 [&>p]:mb-2 [&>a]:underline" dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                  )}
                  {restaurant.customization?.reservationWarningText && (
                    <div className="p-6 rounded-2xl border-2 border-dashed text-base text-[color:var(--text)] space-y-2 [&>p]:mb-2 [&>a]:underline" style={{ borderColor: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                  )}

                  <div className="space-y-4">
                    <Label className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Date</Label>
                    <div className="rounded-2xl p-4" style={{ background: 'var(--panel)' }}>
                      <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--accent)" accentText="#fdf6ec" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Time</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[...times.lunch, ...times.dinner].map(tm => (
                        <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 rounded-full border-2 text-sm font-bold transition-all", selectedTime === tm ? "text-white" : "hover:opacity-70")}
                          style={selectedTime === tm ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { background: 'var(--panel)', borderColor: 'transparent' }}>
                          {tm}
                        </button>
                      ))}
                    </div>
                  </div>

                  {checkingDay ? (
                    <div className="flex items-center gap-3 rounded-2xl p-6 text-base" style={{ background: 'var(--panel)' }}>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40" style={{ borderTopColor: 'var(--accent)' }} /> Checking availability for <strong>{selectedDateLabel}</strong>...
                    </div>
                  ) : dayStatus?.daySetting?.isFullyBooked ? (
                    <div className="rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50 p-6 text-base text-amber-800 flex items-start gap-4">
                      <Clock className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-lg">Fully Booked (Waitlist Open)</strong>
                        We are fully booked for reservations on this day, but you can join our waitlist.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                    <div className="rounded-2xl border-2 border-dashed border-red-500 bg-red-50 p-6 text-base text-red-800 flex items-start gap-4">
                      <X className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-lg">Reservations Closed</strong>
                        Unfortunately, we&apos;re not accepting reservations for this day.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.autoConfirm ? (
                    <div className="rounded-2xl border-2 border-dashed bg-emerald-50 p-6 text-base text-emerald-800 flex items-start gap-4" style={{ borderColor: 'var(--accent)' }}>
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-lg">Immediate Booking</strong>
                        Your table will be confirmed automatically.
                      </div>
                    </div>
                  ) : dayStatus ? (
                    <div className="rounded-2xl border-2 border-dashed border-sky-500 bg-sky-50 p-6 text-base text-sky-800 flex items-start gap-4">
                      <CalendarIcon className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-lg">Confirmation Queue</strong>
                        This date requires manual staff review. You&apos;ll receive a notification.
                      </div>
                    </div>
                  ) : null}

                  {dayStatus?.daySetting?.isCapacityFull && (
                    <div className="rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="mb-0.5 font-bold">{t('public.capacityFullTitle')}</p>
                        <p>{t('public.capacityFullDesc')}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 text-center">
                    <Label className="block text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Guests</Label>
                    <div className="flex flex-wrap justify-center gap-2">
                      {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                        <button key={n} type="button" onClick={() => setResForm({ ...resForm, guestCount: String(n) })}
                          className={cn("h-12 w-12 rounded-full border-2 text-base font-bold transition-all", resForm.guestCount === String(n) ? "text-white scale-105" : "hover:opacity-70")}
                          style={resForm.guestCount === String(n) ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { background: 'var(--panel)', borderColor: 'transparent' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Name</Label>
                      <Input required value={resForm.customerName} onChange={e => setResForm({ ...resForm, customerName: e.target.value })}
                        className="rounded-2xl h-14 px-5 text-base border-0" style={{ background: 'var(--panel)' }} />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Phone</Label>
                      <Input required value={resForm.customerPhone} onChange={e => setResForm({ ...resForm, customerPhone: e.target.value })}
                        className="rounded-2xl h-14 px-5 text-base border-0" style={{ background: 'var(--panel)' }} />
                    </div>
                  </div>

                  <ConsentFields
                    slug={slug}
                    consentAccepted={resForm.consentAccepted}
                    onConsentAcceptedChange={(v) => setResForm({ ...resForm, consentAccepted: v })}
                    marketingConsent={resForm.marketingConsent}
                    onMarketingConsentChange={(v) => setResForm({ ...resForm, marketingConsent: v })}
                    className="mt-6 space-y-3 text-sm"
                  />

                  <button type="submit" disabled={checkingDay || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                    className="w-full h-16 text-lg font-bold uppercase tracking-wide rounded-full mt-8 disabled:opacity-40 transition-all hover:scale-[1.02] shadow-lg text-white"
                    style={{ background: 'var(--accent)' }}>
                    {dayStatus?.daySetting?.isFullyBooked ? 'Join Waitlist' : 'Reserve Our Table'}
                  </button>
                </form>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
