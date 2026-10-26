'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import OrderOnlineFab from '@/components/public/OrderOnlineFab';
import { Calendar as CalendarIcon, ChevronDown, CheckCircle2, X, Clock, Menu, ArrowLeft, Flame, Sparkles, AlertTriangle } from 'lucide-react';
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

// Late-night, low-light atmosphere — moody bar/lounge photography.
const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&q=80&w=2000';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&q=80&w=1200';

export default function NoirLoungeLayout({ slug, initialRestaurant, initialView, menuOnly = false, bookingOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean, bookingOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [scrolled, setScrolled] = useState(false);

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);

  const [isBookingSuccess, setIsBookingSuccess] = useState(false);
  const [isPossiblyFullyBooked, setIsPossiblyFullyBooked] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tz = restaurant?.settings?.timezone || DEFAULT_TZ;

  const [selectedDate, setSelectedDate] = useState(getTodayInTZ(tz));
  const [selectedTime, setSelectedTime] = useState('21:00');
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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-black text-white font-medium">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || { typography: 'SANS', colorPalette: 'OBSIDIAN' };
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  const getFontClass = (type: string) => {
    switch (type) {
      case 'SERIF': return 'font-serif';
      case 'MONO': return 'font-mono tracking-tight';
      case 'SANS':
      default: return 'font-sans';
    }
  };
  const fontClass = getFontClass(customization.typography);

  // Near-black base, one electric neon accent — the palette selector only
  // changes which neon color, never the darkness of the room.
  const getPalette = (preset: string) => {
    switch (preset) {
      case 'CRIMSON': return { neon: '#ff3b5c', neonDeep: '#c41e3a' };
      case 'EARTH': return { neon: '#ffb020', neonDeep: '#d4941a' };
      case 'SAGE': return { neon: '#7cfc8a', neonDeep: '#3fb85c' };
      case 'OBSIDIAN':
      default: return { neon: '#ff2e88', neonDeep: '#c81f68' };
    }
  };
  const p = getPalette(customization.colorPalette);
  const overrideNeon = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : null;
  const neon = overrideNeon || p.neon;

  const rootStyle = {
    '--bg': '#08080b',
    '--panel': '#111116',
    '--panel-soft': '#17171e',
    '--text': '#f5f5f7',
    '--muted': '#9a97a6',
    '--neon': neon,
    '--neon-deep': overrideNeon || p.neonDeep,
    '--line': 'rgba(245,245,247,0.08)',
    backgroundColor: '#08080b',
    color: '#f5f5f7',
  } as React.CSSProperties;

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.4em] text-[color:var(--neon)]">
      <Sparkles className="w-3.5 h-3.5" /> {children}
    </span>
  );

  const renderMenuItem = (item: any) => (
    <div key={item.id} className="group">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="font-bold text-[15px]">{item.name}</h4>
        <span className="text-base font-bold text-[color:var(--neon)] whitespace-nowrap">{item.price.toLocaleString('tr-TR')} ₺</span>
      </div>
      {item.description && <p className="text-sm text-[color:var(--muted)] mt-2 font-light leading-relaxed">{item.description}</p>}
      {item.ingredients && <p className="text-xs text-[color:var(--muted)]/80 mt-1 font-light"><span className="font-medium">{t('public.ingredients')}:</span> {item.ingredients}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {item.spiceLevel > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-orange-300 bg-orange-500/10 px-2 py-0.5 rounded-full"><Flame className="w-2.5 h-2.5" /> {item.spiceLevel}</span>}
        {item.calories && <span className="text-[10px] text-[color:var(--muted)] bg-white/5 px-2 py-0.5 rounded-full">{item.calories} {t('public.calories')}</span>}
        {item.containsAlcohol && <span className="text-[10px] text-[color:var(--neon)] bg-[color:var(--neon)]/10 px-2 py-0.5 rounded-full">{t('public.containsAlcohol')}</span>}
        {item.containsPork && <span className="text-[10px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full">{t('public.containsPork')}</span>}
        {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
          <span key={i} className="text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full">{tag.trim()}</span>
        ))}
      </div>
      {item.allergens && <p className="mt-2 text-[10px] font-light text-amber-300/80">{t('public.allergens')}: {item.allergens}</p>}
    </div>
  );

  const navBg = "bg-black/80 backdrop-blur-xl border-b border-[color:var(--line)]";

  return (
    <div className={cn("min-h-screen selection:bg-[color:var(--neon)] selection:text-black", fontClass)} style={rootStyle}>

      {customization.announcementText && (
        <div className="w-full text-center py-2.5 px-4 sticky top-0 z-50 text-xs font-bold tracking-[0.2em]" style={{ background: 'var(--neon)', color: '#08080b' }}>
          {customization.announcementText}
        </div>
      )}

      {/* Header — always solid, glowing bottom edge, unlike layouts that fade in on scroll */}
      {menuOnly ? (
        <nav className={cn("fixed w-full z-40 flex justify-between items-center px-6 md:px-12 py-5", navBg, customization.announcementText ? "top-9" : "top-0")}
          style={{ boxShadow: '0 1px 0 0 var(--neon)' }}>
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.25em] text-[color:var(--muted)] hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href={`/r/${slug}?view=booking`} className="rounded-full px-5 py-2 text-xs font-bold tracking-[0.25em] transition-all hover:brightness-110" style={{ background: 'var(--neon)', color: '#08080b' }}>
              {t('public.bookATable')}
            </Link>
          </div>
        </nav>
      ) : bookingOnly ? (
        <nav className={cn("fixed w-full z-40 flex justify-between items-center px-6 md:px-12 py-5", navBg, customization.announcementText ? "top-9" : "top-0")}
          style={{ boxShadow: '0 1px 0 0 var(--neon)' }}>
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.25em] text-[color:var(--muted)] hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href={`/r/${slug}/menu`} className="rounded-full px-5 py-2 text-xs font-bold tracking-[0.25em] transition-all hover:brightness-110" style={{ background: 'var(--neon)', color: '#08080b' }}>
              {t('public.menu')}
            </Link>
          </div>
        </nav>
      ) : (
        <nav className={cn("fixed w-full z-40 flex items-center px-6 md:px-12 py-5 transition-all duration-300", navBg, customization.announcementText ? "top-9" : "top-0")}
          style={{ boxShadow: scrolled ? '0 1px 0 0 var(--neon)' : 'none' }}>
          <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-[0.25em]">
            <button onClick={() => scrollToSection('vibe')} className="text-[color:var(--muted)] hover:text-white transition-colors">The Vibe</button>
            <button onClick={() => scrollToSection('menu')} className="text-[color:var(--muted)] hover:text-white transition-colors">{t('public.menu')}</button>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl md:text-2xl font-semibold tracking-[0.15em] whitespace-nowrap">{restaurant.name}</div>
          <div className="ml-auto flex items-center gap-8 text-xs font-bold tracking-[0.25em]">
            <div className="hidden md:flex items-center gap-8">
              <LanguageSwitcher />
              <button onClick={() => scrollToSection('contact')} className="text-[color:var(--muted)] hover:text-white transition-colors">{t('public.contact')}</button>
              <button onClick={() => scrollToSection('reservations')} className="rounded-full px-5 py-2 transition-all hover:brightness-110" style={{ background: 'var(--neon)', color: '#08080b' }}>{t('public.reservations')}</button>
            </div>
            <div className="md:hidden flex items-center gap-4">
              <LanguageSwitcher />
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">{isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}</button>
            </div>
          </div>
        </nav>
      )}

      {!menuOnly && !bookingOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-black flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 md:hidden">
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('vibe'); }} className="text-2xl font-semibold">The Vibe</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-2xl font-semibold">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-2xl font-semibold">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-8 text-2xl font-semibold text-[color:var(--neon)]">{t('public.reservations')}</button>
        </div>
      )}

      {!menuOnly && !bookingOnly && (
        <>
          {/* Hero — heavy vignette + glowing title, no scroll-fade nav like the editorial layout */}
          <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0">
              <div className="absolute inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, rgba(8,8,11,0.35) 0%, rgba(8,8,11,0.92) 75%, #08080b 100%)' }} />
              <img src={bgImage} className="w-full h-full object-cover grayscale-[30%]" alt="Atmosphere" />
            </div>
            <div className="relative z-20 text-center px-4 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
              <span className="mb-6"><Eyebrow>Open Late</Eyebrow></span>
              <h1 className="text-6xl md:text-8xl font-semibold tracking-tight mb-8" style={{ textShadow: '0 0 40px var(--neon), 0 0 80px var(--neon)' }}>
                {restaurant.name}
              </h1>
              <button onClick={() => scrollToSection('reservations')} className="rounded-full px-9 py-4 text-xs font-semibold tracking-[0.25em] transition-all hover:scale-105" style={{ background: 'var(--neon)', color: '#08080b', boxShadow: '0 0 30px var(--neon)' }}>
                {t('public.bookATable')}
              </button>
            </div>
            <button onClick={() => scrollToSection('vibe')} className="absolute bottom-12 z-20 animate-bounce text-[color:var(--muted)] hover:text-white" aria-label="Scroll down"><ChevronDown className="w-6 h-6" /></button>
          </section>

          {/* The Vibe — a mood statement instead of a stock-photo gallery grid */}
          <section id="vibe" className="py-32 px-6 md:px-12 max-w-5xl mx-auto text-center">
            <Eyebrow>The Vibe</Eyebrow>
            <blockquote className="mt-8 text-3xl md:text-5xl font-light leading-tight italic text-[color:var(--text)]">
              &ldquo;Low light. Loud flavor. No rush.&rdquo;
            </blockquote>
            {customization.showAboutUs && (
              <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-12 items-center text-left">
                <p className="text-[color:var(--muted)] leading-relaxed font-light text-lg whitespace-pre-wrap">
                  {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
                </p>
                <div className="aspect-[4/5] relative overflow-hidden rounded-2xl ring-1 ring-[color:var(--line)]">
                  <img src={ABOUT_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-90" alt={`Inside ${restaurant.name}`} />
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Menu — two-column masonry of glass cards, not a single stacked list. Hidden on a booking-only standalone page, mirroring how menuOnly hides Reservations */}
      {!bookingOnly && (
      <section id="menu" className={cn("px-6 md:px-12", menuOnly ? "pt-32 pb-32" : "py-32")} style={{ background: 'var(--panel)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20 flex flex-col items-center gap-3">
            <Eyebrow>On the Menu</Eyebrow>
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight">Tonight&apos;s List</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center text-[color:var(--muted)]">The menu is currently being curated.</p>
          ) : (
            <div className="columns-1 md:columns-2 gap-6 space-y-6">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id} className="break-inside-avoid rounded-2xl p-6 md:p-8 backdrop-blur-xl border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--line)' }}>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="h-px flex-1 bg-[color:var(--line)]" />
                    <h3 className="text-sm tracking-[0.3em] text-[color:var(--neon)] font-bold whitespace-nowrap">{cat.name}</h3>
                    <span className="h-px flex-1 bg-[color:var(--line)]" />
                  </div>
                  <div className="space-y-6">
                    {cat.items?.map((item: any) => renderMenuItem(item))}
                  </div>
                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-8 space-y-6 pt-6 border-t border-[color:var(--line)]">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="text-xs tracking-[0.25em] mb-4 text-[color:var(--muted)]">{sub.name}</h4>
                          <div className="space-y-6">{sub.items?.map((item: any) => renderMenuItem(item))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {restaurant.menus?.[0]?.updatedAt && (
            <div className="text-center mt-16 text-xs font-light text-[color:var(--muted)]">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>
      )}

      {menuOnly && (
        <footer className="border-t border-[color:var(--line)] px-6 py-16 text-center md:px-12">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-light text-[color:var(--muted)]">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-white">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-white">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Link href={`/r/${slug}?view=booking`} className="inline-block mt-8 rounded-full px-6 py-2.5 text-xs font-semibold tracking-[0.25em] transition-all hover:brightness-110" style={{ background: 'var(--neon)', color: '#08080b' }}>
            {t('public.bookATable')}
          </Link>
          <p className="mt-10 text-xs text-[color:var(--muted)]/70">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && !bookingOnly && (
        <>
          <section id="contact" className="py-32 px-6 md:px-12 text-center max-w-4xl mx-auto border-t border-[color:var(--line)]">
            <h2 className="text-3xl font-semibold tracking-tight mb-12">{restaurant.name}</h2>
            {hasContactInfo && (
              <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm font-light text-[color:var(--muted)]">
                {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-white">{restaurant.contactPhone}</a>}
                {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-white">{restaurant.contactEmail}</a>}
              </div>
            )}
            {customization.showLegal && customization.legalText && (
              <div className="mt-24 pt-12 border-t border-[color:var(--line)] text-xs text-[color:var(--muted)] font-light text-left max-w-2xl mx-auto space-y-4">
                <h4 className="text-xs font-bold mb-2 text-center text-[color:var(--neon)]">Legal Terms</h4>
                <div className="whitespace-pre-wrap">{customization.legalText}</div>
              </div>
            )}
            <p className="mt-12 text-xs text-[color:var(--muted)]/70">© {new Date().getFullYear()} {restaurant.name}</p>
          </section>
        </>
      )}

      {/* Reservations — shown in full mode and on the bookingOnly standalone page */}
      {!menuOnly && (
        <>
          <section id="reservations" className="py-32 px-6 md:px-12 border-t border-[color:var(--line)]">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-16 flex flex-col items-center gap-3">
                <Eyebrow>Reservations</Eyebrow>
                <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">Reserve a Table</h2>
              </div>

              {isBookingSuccess ? (
                <div className="text-center py-12 animate-in zoom-in rounded-2xl border p-12" style={{ background: 'var(--panel-soft)', borderColor: 'var(--line)' }}>
                  <CheckCircle2 className="w-16 h-16 text-[color:var(--neon)] mx-auto mb-6" />
                  <h3 className="text-2xl font-semibold mb-4">{isPossiblyFullyBooked ? 'Request Received' : 'Table Confirmed'}</h3>
                  <p className="text-[color:var(--muted)] font-light text-base">We&apos;ll see you tonight.</p>
                  {confirmationCode && (
                    <div className="mx-auto mt-8 flex max-w-xs flex-col items-center rounded-2xl border px-6 py-4" style={{ borderColor: 'var(--neon)' }}>
                      <span className="text-[10px] font-bold tracking-[0.25em] text-[color:var(--muted)]">{t('public.confirmationCodeLabel')}</span>
                      <span className="mt-1 text-3xl font-black tracking-[0.2em]" style={{ color: 'var(--neon)', textShadow: '0 0 20px var(--neon)' }}>{confirmationCode}</span>
                      <span className="mt-2 text-[10px] font-light text-[color:var(--muted)]">{t('public.confirmationCodeHint')}</span>
                    </div>
                  )}
                  {isPossiblyFullyBooked && (
                    <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-light text-amber-200">
                      Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleBooking} className="space-y-10 p-8 md:p-12 rounded-2xl border" style={{ background: 'var(--panel-soft)', borderColor: 'var(--line)' }}>
                  {restaurant.customization?.reservationInfoText && (
                    <div className="text-base font-light text-[var(--text)]/90 space-y-2 [&>p]:mb-2 [&>a]:underline [&>a]:text-[color:var(--neon)]" dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                  )}
                  {restaurant.customization?.reservationWarningText && (
                    <div className="p-6 rounded-xl border-l-4 text-base font-light text-[var(--text)] space-y-2 [&>p]:mb-2 [&>a]:underline [&>a]:text-[color:var(--neon)]" style={{ background: 'var(--panel)', borderColor: 'var(--neon)' }} dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                  )}

                  <div className="space-y-4">
                    <Label className="text-sm text-[color:var(--neon)] font-bold">Date</Label>
                    <div className="rounded-xl border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
                      <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--neon)" accentText="#08080b" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-sm text-[color:var(--neon)] font-bold">Time</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[...times.lunch, ...times.dinner].map(tm => (
                        <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 rounded-xl border text-sm font-bold transition-all", selectedTime === tm ? "text-black" : "hover:brightness-110")}
                          style={selectedTime === tm ? { background: 'var(--neon)', borderColor: 'var(--neon)', boxShadow: '0 0 16px var(--neon)' } : { background: 'var(--panel)', borderColor: 'var(--line)' }}>
                          {tm}
                        </button>
                      ))}
                    </div>
                  </div>

                  {checkingDay ? (
                    <div className="flex items-center gap-3 rounded-xl border-l-4 p-6 text-base font-normal" style={{ background: 'var(--panel)', borderColor: 'var(--neon)' }}>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[color:var(--neon)]" /> Checking availability for <strong>{selectedDateLabel}</strong>...
                    </div>
                  ) : dayStatus?.daySetting?.isFullyBooked ? (
                    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-400/10 p-6 text-base font-normal text-amber-100 flex items-start gap-4">
                      <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-300" />
                      <div>
                        <span className="mb-1 block text-xs font-bold text-amber-300">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-amber-200 text-lg">Fully Booked</strong>
                        We are fully booked for reservations on this day. Please choose another date, or call us directly.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                    <div className="rounded-xl border-l-4 border-red-400 bg-red-400/10 p-6 text-base font-normal text-red-100 flex items-start gap-4">
                      <X className="w-5 h-5 shrink-0 mt-0.5 text-red-300" />
                      <div>
                        <span className="mb-1 block text-xs font-bold text-red-300">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-red-200 text-lg">Reservations Closed</strong>
                        Unfortunately, we&apos;re not accepting reservations for this day.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.autoConfirm ? (
                    <div className="rounded-xl border-l-4 p-6 text-base font-normal flex items-start gap-4" style={{ background: 'var(--panel)', borderColor: 'var(--neon)' }}>
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[color:var(--neon)]" />
                      <div>
                        <span className="mb-1 block text-xs font-bold text-[color:var(--neon)]">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-[color:var(--neon)] text-lg">Immediate Booking</strong>
                        Your table will be confirmed automatically.
                      </div>
                    </div>
                  ) : dayStatus ? (
                    <div className="rounded-xl border-l-4 border-sky-400 bg-sky-400/10 p-6 text-base font-normal text-sky-100 flex items-start gap-4">
                      <CalendarIcon className="w-5 h-5 shrink-0 mt-0.5 text-sky-300" />
                      <div>
                        <span className="mb-1 block text-xs font-bold text-sky-300">{selectedDateLabel}</span>
                        <strong className="block mb-2 text-sky-200 text-lg">Confirmation Queue</strong>
                        This date requires manual staff review. You&apos;ll receive a notification.
                      </div>
                    </div>
                  ) : null}

                  {dayStatus?.daySetting?.isCapacityFull && (
                    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-400/10 p-4 text-sm font-normal text-amber-100 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                      <div>
                        <p className="mb-0.5 font-bold text-amber-200">{t('public.capacityFullTitle')}</p>
                        <p>{t('public.capacityFullDesc')}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 text-center">
                    <Label className="block text-sm text-[color:var(--neon)] font-bold">Guests</Label>
                    <div className="flex flex-wrap justify-center gap-2">
                      {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                        <button key={n} type="button" onClick={() => setResForm({ ...resForm, guestCount: String(n) })}
                          className={cn("h-12 w-12 rounded-full border text-base font-bold transition-all", resForm.guestCount === String(n) ? "text-black scale-105" : "hover:brightness-110")}
                          style={resForm.guestCount === String(n) ? { background: 'var(--neon)', borderColor: 'var(--neon)' } : { background: 'var(--panel)', borderColor: 'var(--line)' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label className="text-sm text-[color:var(--neon)] font-bold">Name</Label>
                      <Input required value={resForm.customerName} onChange={e => setResForm({ ...resForm, customerName: e.target.value })}
                        className="border rounded-xl h-14 px-4 text-base focus-visible:ring-2 transition-all" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }} />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm text-[color:var(--neon)] font-bold">Phone</Label>
                      <Input required value={resForm.customerPhone} onChange={e => setResForm({ ...resForm, customerPhone: e.target.value })}
                        className="border rounded-xl h-14 px-4 text-base focus-visible:ring-2 transition-all" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }} />
                    </div>
                  </div>

                  <ConsentFields
                    slug={slug}
                    consentAccepted={resForm.consentAccepted}
                    onConsentAcceptedChange={(v) => setResForm({ ...resForm, consentAccepted: v })}
                    marketingConsent={resForm.marketingConsent}
                    onMarketingConsentChange={(v) => setResForm({ ...resForm, marketingConsent: v })}
                    className="mt-6 space-y-3 text-sm text-[color:var(--text)]/80"
                  />

                  <button type="submit" disabled={checkingDay || dayStatus?.daySetting?.isFullyBooked || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                    className="w-full h-16 text-lg font-semibold tracking-[0.1em] rounded-2xl mt-8 disabled:opacity-50 transition-all hover:scale-[1.01] hover:brightness-110"
                    style={{ background: 'var(--neon)', color: '#08080b', boxShadow: '0 0 30px var(--neon)' }}>
                    {dayStatus?.daySetting?.isFullyBooked ? 'Fully Booked' : 'Reserve Table'}
                  </button>
                </form>
              )}
            </div>
          </section>

          {bookingOnly && (
            <footer className="border-t border-[color:var(--line)] px-6 py-16 text-center md:px-12">
              <h2 className="mb-6 text-2xl font-semibold tracking-tight">{restaurant.name}</h2>
              {hasContactInfo && (
                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-light text-[color:var(--muted)]">
                  {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-white">{restaurant.contactPhone}</a>}
                  {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-white">{restaurant.contactEmail}</a>}
                </div>
              )}
              <Link href={`/r/${slug}/menu`} className="inline-block mt-8 rounded-full px-6 py-2.5 text-xs font-semibold tracking-[0.25em] transition-all hover:brightness-110" style={{ background: 'var(--neon)', color: '#08080b' }}>
                {t('public.menu')}
              </Link>
              <p className="mt-10 text-xs text-[color:var(--muted)]/70">© {new Date().getFullYear()} {restaurant.name}</p>
            </footer>
          )}
        </>
      )}
      <OrderOnlineFab slug={slug} restaurant={restaurant} />
    </div>
  );
}
