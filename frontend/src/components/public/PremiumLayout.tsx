'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Calendar as CalendarIcon, ChevronDown, CheckCircle2, X, Clock, Menu, ArrowLeft, Leaf, Sprout } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getTimeSuggestions } from '@/lib/reservationSuggestions';
import ReservationCalendar from './ReservationCalendar';
import { getTodayInTZ, zonedWallTimeToUTC, DEFAULT_TZ } from '@/lib/datetime';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

// Dark, botanical "moss-after-dark" imagery — the night-garden sibling of the
// light Garden layout.
const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&q=80&w=2000';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&q=80&w=1200';
const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=800',
];

export default function PremiumLayout({ slug, initialRestaurant, initialView, menuOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [scrolled, setScrolled] = useState(false);

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);
  const [isWaitlistSuccess, setIsWaitlistSuccess] = useState(false);
  const [isBookingSuccess, setIsBookingSuccess] = useState(false);
  const [isPossiblyFullyBooked, setIsPossiblyFullyBooked] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tz = restaurant?.settings?.timezone || DEFAULT_TZ;

  const [selectedDate, setSelectedDate] = useState(getTodayInTZ(tz));
  const [selectedTime, setSelectedTime] = useState('19:30');
  const [resForm, setResForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    guestCount: '2',
    notes: ''
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

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-[#10130d] text-[#ECEEE2] font-medium">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || { typography: 'SERIF', colorPalette: 'EARTH' };
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  const getFontClass = (type: string) => {
      switch (type) {
          case 'SANS': return 'font-sans';
          case 'MONO': return 'font-mono tracking-wide';
          case 'SERIF':
          default: return 'font-serif';
      }
  };
  const fontClass = getFontClass(customization.typography);

  // Dark, warm, botanical palettes. Default is a mossy near-black with sage accent —
  // the "darker version of moss-and-stone".
  const getPalette = (preset: string) => {
    switch (preset) {
      case 'CRIMSON': return { bg: '#160f0e', panel: '#211514', panelSoft: '#291a18', text: '#f3e7e5', muted: '#cdb6b3', moss: '#e0a494', mossDeep: '#b06a58', line: 'rgba(243,231,229,0.12)' };
      case 'PEARL':   return { bg: '#0d1113', panel: '#141a1d', panelSoft: '#1a2226', text: '#e6edf0', muted: '#b6c2c8', moss: '#93c1b9', mossDeep: '#5c908a', line: 'rgba(230,237,240,0.12)' };
      case 'OBSIDIAN': return { bg: '#0f120f', panel: '#171c16', panelSoft: '#1d241c', text: '#e9ece4', muted: '#bcc4af', moss: '#aecb99', mossDeep: '#7a9a63', line: 'rgba(233,236,228,0.12)' };
      case 'EARTH':
      default:        return { bg: '#10130d', panel: '#191e12', panelSoft: '#1f2617', text: '#eceee2', muted: '#c6ccb5', moss: '#b6ce98', mossDeep: '#86a063', line: 'rgba(236,238,226,0.12)' };
    }
  };
  const p = getPalette(customization.colorPalette);
  const overrideMoss = restaurant.customization?.primaryColor && restaurant.customization.primaryColor !== '#0f172a' ? restaurant.customization.primaryColor : null;
  const moss = overrideMoss || p.moss;

  const rootStyle = {
    '--bg': p.bg,
    '--panel': p.panel,
    '--panel-soft': p.panelSoft,
    '--text': p.text,
    '--muted': p.muted,
    '--moss': moss,
    '--moss-deep': overrideMoss || p.mossDeep,
    '--line': p.line,
    backgroundColor: p.bg,
    color: p.text,
  } as React.CSSProperties;

  // Eyebrow label with a botanical leaf mark.
  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.35em] uppercase text-[color:var(--moss)]">
      <Leaf className="w-3.5 h-3.5" /> {children}
    </span>
  );

  const renderMenuItem = (item: any, small = false) => (
    <div key={item.id} className="group relative">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className={cn("font-medium tracking-wide", small ? "text-[15px]" : "text-lg")}>{item.name}</h4>
        <div className="flex-1 border-b border-dotted border-[color:var(--line)] relative top-[-6px]" />
        <span className="text-base text-[color:var(--moss)]">{item.price.toLocaleString('tr-TR')} ₺</span>
      </div>
      {item.description && <p className="text-sm text-[color:var(--muted)] mt-2 font-light max-w-xl leading-relaxed">{item.description}</p>}
      {item.ingredients && <p className="text-xs text-[color:var(--muted)]/80 mt-1 font-light max-w-xl"><span className="font-medium">{t('public.ingredients')}:</span> {item.ingredients}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {item.calories && <span className="text-[10px] uppercase tracking-wider text-amber-300/90 bg-amber-400/10 px-2 py-0.5 rounded-full">{item.calories} {t('public.calories')}</span>}
        {item.containsAlcohol && <span className="text-[10px] uppercase tracking-wider text-rose-300/90 bg-rose-400/10 px-2 py-0.5 rounded-full">{t('public.containsAlcohol')}</span>}
        {item.containsPork && <span className="text-[10px] uppercase tracking-wider text-pink-300/90 bg-pink-400/10 px-2 py-0.5 rounded-full">{t('public.containsPork')}</span>}
        {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
          <span key={i} className="text-[10px] uppercase tracking-wider text-[color:var(--moss)] bg-[color:var(--moss)]/10 px-2 py-0.5 rounded-full">{tag.trim()}</span>
        ))}
      </div>
      {item.allergens && <p className="mt-2 text-[10px] font-light uppercase tracking-wider text-amber-300/80">{t('public.allergens')}: {item.allergens}</p>}
    </div>
  );

  const navBg = "bg-[var(--bg)]/85 backdrop-blur-md border-b border-[color:var(--line)]";

  return (
    <div className={cn("min-h-screen selection:bg-[color:var(--moss)] selection:text-[var(--bg)]", fontClass)} style={rootStyle}>

      {/* Announcement Banner */}
      {customization.announcementText && (
        <div className="w-full text-center py-2.5 px-4 sticky top-0 z-50 flex items-center justify-center gap-2 text-sm font-medium" style={{ background: 'var(--moss)', color: 'var(--bg)' }}>
          <Sprout className="w-4 h-4" /> {customization.announcementText}
        </div>
      )}

      {/* Header */}
      {menuOnly ? (
        <nav className={cn("fixed w-full z-40 flex justify-between items-center px-6 md:px-12 py-5", navBg, customization.announcementText ? "top-11" : "top-0")}>
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--muted)] hover:text-[var(--text)] transition-colors">
            <ArrowLeft className="h-4 w-4" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href={`/r/${slug}?view=booking`} className="rounded-full border border-[color:var(--moss)] px-5 py-2 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--moss)] hover:bg-[color:var(--moss)] hover:text-[var(--bg)] transition-colors">
              {t('public.bookATable')}
            </Link>
          </div>
        </nav>
      ) : (
      <nav className={cn("fixed w-full z-40 flex items-center px-6 md:px-12 py-6 transition-all duration-500", scrolled ? navBg : "bg-transparent", customization.announcementText ? "top-11" : "top-0")}>
        {/* Left links */}
        <div className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.2em] uppercase">
          <button onClick={() => scrollToSection('about')} className="text-[color:var(--muted)] hover:text-[var(--text)] transition-colors">{t('public.ourStory')}</button>
          <button onClick={() => scrollToSection('menu')} className="text-[color:var(--muted)] hover:text-[var(--text)] transition-colors">{t('public.menu')}</button>
        </div>
        {/* Perfectly-centered restaurant name (aligned with the banner) */}
        <div className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl md:text-2xl tracking-[0.15em] whitespace-nowrap", customization.typography !== 'MONO' && 'uppercase')}>{restaurant.name}</div>
        {/* Right links */}
        <div className="ml-auto flex items-center gap-8 text-xs font-medium tracking-[0.2em] uppercase">
          <div className="hidden md:flex items-center gap-8">
            <LanguageSwitcher />
            <button onClick={() => scrollToSection('contact')} className="text-[color:var(--muted)] hover:text-[var(--text)] transition-colors">{t('public.contact')}</button>
            <button onClick={() => scrollToSection('reservations')} className="rounded-full border border-[color:var(--moss)] px-5 py-2 text-[color:var(--moss)] transition-all hover:bg-[color:var(--moss)] hover:text-[var(--bg)]">{t('public.reservations')}</button>
          </div>
          <div className="md:hidden flex items-center gap-4">
            <LanguageSwitcher />
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">{isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}</button>
          </div>
        </div>
      </nav>
      )}

      {/* Mobile Menu Overlay */}
      {!menuOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 backdrop-blur-xl flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 md:hidden" style={{ background: 'var(--bg)' }}>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-2xl tracking-widest">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-2xl tracking-widest">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-2xl tracking-widest">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-8 text-2xl tracking-widest text-[color:var(--moss)]">{t('public.reservations')}</button>
        </div>
      )}

      {!menuOnly && (
      <>
      {/* Hero */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, ${p.bg}66, ${p.bg}88, ${p.bg})` }} />
          <img src={bgImage} className="w-full h-full object-cover" alt="Atmosphere" />
        </div>
        <div className="relative z-20 text-center px-4 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <span className="mb-6"><Eyebrow>{t('public.aCulinaryJourney')}</Eyebrow></span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl tracking-tight mb-8">{restaurant.name}</h1>
          <button onClick={() => scrollToSection('reservations')} className="rounded-full bg-[color:var(--moss)] text-[var(--bg)] px-8 py-3.5 text-xs font-semibold tracking-[0.2em] uppercase transition-all hover:scale-[1.03] hover:brightness-110">
            {t('public.bookATable')}
          </button>
        </div>
        <button onClick={() => scrollToSection('about')} className="absolute bottom-12 z-20 animate-bounce text-[color:var(--muted)] hover:text-[var(--text)]" aria-label="Scroll down"><ChevronDown className="w-6 h-6" /></button>
      </section>

      {/* About */}
      {customization.showAboutUs && (
        <section id="about" className="py-32 px-6 md:px-12 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-6 text-center md:text-left">
            <Eyebrow>{t('public.ourStory')}</Eyebrow>
            <h2 className="text-3xl md:text-5xl">Our Story</h2>
            <p className="text-[color:var(--muted)] leading-relaxed font-light text-lg whitespace-pre-wrap">
              {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
            </p>
          </div>
          <div className="flex-1 w-full aspect-[4/5] relative overflow-hidden rounded-[2rem] ring-1 ring-[color:var(--line)]">
            <img src={ABOUT_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-90 transition-opacity duration-700 hover:opacity-100" alt={`Inside ${restaurant.name}`} />
          </div>
        </section>
      )}

      {/* Gallery */}
      <section className="py-24 px-6 md:px-12" style={{ background: 'var(--panel)' }}>
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center flex flex-col items-center gap-3">
            <Eyebrow>Gallery</Eyebrow>
            <h2 className="text-3xl md:text-5xl">A Few Highlights</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className="aspect-square w-full overflow-hidden rounded-[1.75rem] ring-1 ring-[color:var(--line)]">
                <img src={src} alt="Culinary highlight" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>
      </>
      )}

      {/* Menu */}
      <section id="menu" className={cn("px-6 md:px-12", menuOnly ? "pt-32 pb-32" : "py-32")}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-24 flex flex-col items-center gap-3">
            <Eyebrow>Gastronomy</Eyebrow>
            <h2 className="text-4xl md:text-6xl">The Menu</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center text-[color:var(--muted)]">The seasonal menu is currently being curated.</p>
          ) : (
            <div className="space-y-20">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id}>
                  <div className="flex items-center justify-center gap-3 mb-12">
                    <span className="h-px w-10 bg-[color:var(--line)]" />
                    <h3 className="text-xl text-center uppercase tracking-[0.25em] text-[color:var(--moss)]">{cat.name}</h3>
                    <span className="h-px w-10 bg-[color:var(--line)]" />
                  </div>
                  <div className="space-y-8 rounded-[2rem] p-8 md:p-10" style={{ background: 'var(--panel)' }}>
                    {cat.items?.map((item: any) => renderMenuItem(item))}
                  </div>

                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-10 space-y-12">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="text-lg text-center uppercase tracking-[0.2em] mb-8 text-[color:var(--muted)] italic">{sub.name}</h4>
                          <div className="space-y-8 rounded-[2rem] p-8 md:p-10" style={{ background: 'var(--panel-soft)' }}>
                            {sub.items?.map((item: any) => renderMenuItem(item, true))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {restaurant.menus?.[0]?.updatedAt && (
            <div className="text-center mt-16 text-xs font-light text-[color:var(--muted)] uppercase tracking-widest">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>

      {menuOnly && (
        <footer className="border-t border-[color:var(--line)] px-6 py-16 text-center md:px-12">
          <h2 className="mb-6 text-2xl">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-light text-[color:var(--muted)]">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[var(--text)]">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[var(--text)]">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Link href={`/r/${slug}?view=booking`} className="inline-block mt-8 rounded-full border border-[color:var(--moss)] px-6 py-2.5 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--moss)] hover:bg-[color:var(--moss)] hover:text-[var(--bg)] transition-colors">
            {t('public.bookATable')}
          </Link>
          <p className="mt-10 text-xs text-[color:var(--muted)]/70">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && (
      <>
      {/* Contact */}
      <section id="contact" className="py-32 px-6 md:px-12 text-center max-w-4xl mx-auto border-t border-[color:var(--line)]">
        <h2 className="text-3xl mb-12">{restaurant.name}</h2>
        {hasContactInfo && (
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm font-light text-[color:var(--muted)]">
            {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[var(--text)]">{restaurant.contactPhone}</a>}
            {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[var(--text)]">{restaurant.contactEmail}</a>}
          </div>
        )}
        {customization.showLegal && customization.legalText && (
          <div className="mt-24 pt-12 border-t border-[color:var(--line)] text-xs text-[color:var(--muted)] font-light text-left max-w-2xl mx-auto space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-center text-[color:var(--moss)]">Legal Terms</h4>
            <div className="whitespace-pre-wrap">{customization.legalText}</div>
          </div>
        )}
        <p className="mt-12 text-xs text-[color:var(--muted)]/70">© {new Date().getFullYear()} {restaurant.name}</p>
      </section>

      {/* Reservations */}
      <section id="reservations" className="py-32 px-6 md:px-12 border-t border-[color:var(--line)]" style={{ background: 'var(--panel)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16 flex flex-col items-center gap-3">
            <Eyebrow>Reservations</Eyebrow>
            <h2 className="text-4xl md:text-5xl">Book a Table</h2>
          </div>

          {isBookingSuccess ? (
            <div className="text-center py-12 animate-in zoom-in rounded-[2rem] border border-[color:var(--line)] p-12" style={{ background: 'var(--panel-soft)' }}>
              <CheckCircle2 className="w-16 h-16 text-[color:var(--moss)] mx-auto mb-6" />
              <h3 className="text-2xl mb-4">{isPossiblyFullyBooked ? 'Request Received' : 'Reservation Confirmed'}</h3>
              <p className="text-[color:var(--muted)] font-light text-base">We look forward to welcoming you.</p>
              {isPossiblyFullyBooked && (
                <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-light text-amber-200">
                  Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                </div>
              )}
            </div>
          ) : isWaitlistSuccess ? (
            <div className="text-center py-12 animate-in zoom-in rounded-[2rem] border border-[color:var(--line)] p-12" style={{ background: 'var(--panel-soft)' }}>
              <CheckCircle2 className="w-16 h-16 text-[color:var(--moss)] mx-auto mb-6" />
              <h3 className="text-2xl mb-4">Waitlist Joined</h3>
              <p className="text-[color:var(--muted)] font-light text-base">We will notify you if a table becomes available.</p>
            </div>
          ) : (
            <form onSubmit={handleBooking} className="space-y-10 p-8 md:p-12 rounded-[2rem] border border-[color:var(--line)]" style={{ background: 'var(--panel-soft)' }}>
              {restaurant.customization?.reservationInfoText && (
                  <div className="text-base font-light text-[var(--text)]/90 space-y-2 [&>p]:mb-2 [&>a]:underline [&>a]:text-[color:var(--moss)]" dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
              )}
              {restaurant.customization?.reservationWarningText && (
                  <div className="p-6 rounded-2xl border-l-4 border-[color:var(--moss)] text-base font-light text-[var(--text)] space-y-2 [&>p]:mb-2 [&>a]:underline [&>a]:text-[color:var(--moss)]" style={{ background: 'var(--panel)' }} dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
              )}

              <div className="space-y-4">
                <Label className="text-sm uppercase tracking-widest text-[color:var(--moss)] font-medium">Date</Label>
                <div className="rounded-2xl border border-[color:var(--line)] p-4 text-[var(--text)]" style={{ background: 'var(--panel)' }}>
                  <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--moss)" accentText="var(--bg)" />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-sm uppercase tracking-widest text-[color:var(--moss)] font-medium">Time</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[...times.lunch, ...times.dinner].map(tm => (
                    <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 rounded-xl border text-sm font-medium transition-all", selectedTime === tm ? "border-[color:var(--moss)] bg-[color:var(--moss)] text-[var(--bg)]" : "border-[color:var(--line)] hover:border-[color:var(--moss)]/50")} style={selectedTime === tm ? undefined : { background: 'var(--panel)' }}>{tm}</button>
                  ))}
                </div>
              </div>

              {checkingDay ? (
                <div className="flex items-center gap-3 rounded-2xl border-l-4 border-[color:var(--moss)] p-6 text-base font-normal text-[var(--text)]/85" style={{ background: 'var(--panel)' }}>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--moss)]/40 border-t-[color:var(--moss)]" /> Checking availability for <strong className="font-medium text-[var(--text)]">{selectedDateLabel}</strong>...
                </div>
              ) : dayStatus?.daySetting?.isFullyBooked ? (
                <div className="rounded-2xl border-l-4 border-amber-400 bg-amber-400/15 p-6 text-base font-normal text-amber-50 flex items-start gap-4">
                  <Clock className="w-6 h-6 shrink-0 text-amber-300" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-amber-300">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-amber-200 text-lg">Fully Booked (Waitlist Open)</strong>
                    We are fully booked for reservations on this day, but you can join our waitlist.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                <div className="rounded-2xl border-l-4 border-red-400 bg-red-400/15 p-6 text-base font-normal text-red-50 flex items-start gap-4">
                  <X className="w-6 h-6 shrink-0 text-red-300" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-red-300">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-red-200 text-lg">Reservations Closed</strong>
                    Unfortunately, we&apos;re not accepting reservations for this day.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.autoConfirm ? (
                <div className="rounded-2xl border-l-4 border-[color:var(--moss)] p-6 text-base font-normal text-[var(--text)] flex items-start gap-4" style={{ background: 'var(--panel)' }}>
                  <CheckCircle2 className="w-6 h-6 shrink-0 text-[color:var(--moss)]" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[color:var(--moss)]">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-[color:var(--moss)] text-lg">Immediate Booking</strong>
                    Your reservation will be confirmed automatically.
                  </div>
                </div>
              ) : dayStatus ? (
                <div className="rounded-2xl border-l-4 border-sky-400 bg-sky-400/15 p-6 text-base font-normal text-sky-50 flex items-start gap-4">
                  <CalendarIcon className="w-6 h-6 shrink-0 text-sky-300" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-sky-300">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-sky-200 text-lg">Confirmation Queue</strong>
                    This date requires manual staff review. You&apos;ll receive a notification.
                  </div>
                </div>
              ) : null}

              <div className="space-y-8 pt-8 border-t border-[color:var(--line)]">
                <div className="space-y-4 text-center">
                  <Label className="block text-sm uppercase tracking-widest text-[color:var(--moss)] font-medium">Guests</Label>
                  <div className="flex flex-wrap justify-center gap-2">
                    {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => setResForm({...resForm, guestCount: String(n)})}
                        className={cn("h-12 w-12 rounded-full border text-base font-semibold transition-all", resForm.guestCount === String(n) ? "border-[color:var(--moss)] bg-[color:var(--moss)] text-[var(--bg)] scale-105" : "border-[color:var(--line)] hover:border-[color:var(--moss)]/50")}
                        style={resForm.guestCount === String(n) ? undefined : { background: 'var(--panel)' }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-widest text-[color:var(--moss)] font-medium">Name</Label>
                    <Input required value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})}
                      className="border border-[color:var(--line)] rounded-xl h-14 px-4 text-base bg-[var(--panel)] focus-visible:ring-2 focus-visible:ring-[color:var(--moss)]/40 transition-all" />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-widest text-[color:var(--moss)] font-medium">Phone</Label>
                    <Input required value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})}
                      className="border border-[color:var(--line)] rounded-xl h-14 px-4 text-base bg-[var(--panel)] focus-visible:ring-2 focus-visible:ring-[color:var(--moss)]/40 transition-all" />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={checkingDay || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                className="w-full h-16 text-lg font-semibold tracking-[0.1em] uppercase rounded-2xl mt-8 disabled:opacity-50 transition-all hover:scale-[1.02] hover:brightness-110"
                style={{ background: 'var(--moss)', color: 'var(--bg)' }}>
                {dayStatus?.daySetting?.isFullyBooked ? 'Join Waitlist' : 'Request Table'}
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
