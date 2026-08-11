'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Calendar as CalendarIcon, ChevronDown, CheckCircle2, X, Clock, Menu, ArrowLeft, Leaf, Sparkles, AlertTriangle, Flame } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getTimeSuggestions } from '@/lib/reservationSuggestions';
import ReservationCalendar from './ReservationCalendar';
import ConsentFields from './ConsentFields';
import { getTodayInTZ, zonedWallTimeToUTC, DEFAULT_TZ } from '@/lib/datetime';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1478144592103-25e218a04891?auto=format&fit=crop&q=80&w=2000';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&q=80&w=1200';
const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1592861956120-e524fc739696?auto=format&fit=crop&q=80&w=800',
];

export default function GardenLayout({ slug, initialRestaurant, initialView, menuOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [scrolled, setScrolled] = useState(false);

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);
  const [isWaitlistSuccess, setIsWaitlistSuccess] = useState(false);
  const [isBookingSuccess, setIsBookingSuccess] = useState(false);
  const [isPossiblyFullyBooked, setIsPossiblyFullyBooked] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const customization = restaurant?.customization || {};

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

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-[#fdfaf3] text-[#3d3524] font-medium">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const getFontClass = (type: string) => {
      switch(type) {
          case 'SANS': return 'font-sans';
          case 'MONO': return 'font-mono tracking-wide';
          case 'SERIF':
          default: return 'font-serif';
      }
  };
  const fontClass = getFontClass(customization.typography);

  const getPalette = (preset: string) => {
      switch(preset) {
          case 'CRIMSON': return { bg: '#fdf6f4', text: '#3d1f1a', accent: '#9a4a3c' };
          case 'PEARL': return { bg: '#f6f8fa', text: '#1f2937', accent: '#5b7fa6' };
          case 'OBSIDIAN': return { bg: '#faf9f6', text: '#2c2c2c', accent: '#6b6459' };
          case 'EARTH':
          default: return { bg: '#fdfaf3', text: '#3d3524', accent: '#6f8a5c' };
      }
  };
  const palette = getPalette(customization.colorPalette);
  const accentColor = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : palette.accent;
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  const renderMenuItem = (item: any) => (
    <div key={item.id} className="flex flex-col overflow-hidden rounded-[1.75rem] border border-black/5 bg-white/70 shadow-sm transition-shadow hover:shadow-md">
      {item.imageUrl && (
        <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--accent)]/10">
          <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold tracking-tight">{item.name}</h3>
          <span className="shrink-0 rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-sm font-semibold text-[var(--accent)]">
            {item.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
          </span>
        </div>
        {item.description && <p className="text-sm leading-relaxed opacity-70">{item.description}</p>}
        {item.ingredients && <p className="text-xs leading-relaxed opacity-50"><span className="font-medium">{t('public.ingredients')}:</span> {item.ingredients}</p>}
        {(item.spiceLevel > 0 || item.calories || item.containsAlcohol || item.containsPork || item.dietaryTags) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.spiceLevel > 0 && <span title={`Spice Level ${item.spiceLevel}`} className="rounded-full bg-red-50 p-1 text-red-600"><Flame className="h-3 w-3" /></span>}
            {item.calories && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">{item.calories} {t('public.calories')}</span>}
            {item.containsAlcohol && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">{t('public.containsAlcohol')}</span>}
            {item.containsPork && <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-medium text-pink-700">{t('public.containsPork')}</span>}
            {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
              <span key={i} title={tag.trim()} className="flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"><Leaf className="h-2.5 w-2.5" /> {tag.trim()}</span>
            ))}
          </div>
        )}
        {item.allergens && (
          <p className="mt-1 flex items-start gap-1 text-[10px] font-medium leading-relaxed text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {t('public.allergens')}: {item.allergens}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn("min-h-screen selection:text-white", fontClass)}
      style={{
        '--accent': accentColor,
        '--accent-hover': accentColor + 'cc',
        backgroundColor: palette.bg,
        color: palette.text,
      } as React.CSSProperties}
    >
      {customization.announcementText && (
        <div className="w-full bg-[var(--accent)] text-white text-xs font-medium text-center py-2 px-4 sticky top-0 z-50 flex items-center justify-center gap-2">
          <Sparkles className="h-3 w-3" /> {customization.announcementText}
        </div>
      )}

      {/* Header */}
      {menuOnly ? (
        <nav className={cn(
          "fixed w-full z-40 flex items-center justify-between px-6 md:px-12 py-4 bg-white/90 backdrop-blur-md border-b border-black/5",
          customization.announcementText ? "top-9" : "top-0"
        )}>
          <Button variant="ghost" nativeButton={false} className="px-0 text-sm font-medium opacity-70 hover:opacity-100 hover:bg-transparent" render={<Link href={`/r/${slug}`} />}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {restaurant.name}
          </Button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button nativeButton={false} className="rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)]" render={<Link href={`/r/${slug}?view=booking`} />}>
              {t('public.bookATable')}
            </Button>
          </div>
        </nav>
      ) : (
      <nav className={cn(
        "fixed w-full z-40 flex items-center justify-between px-6 md:px-12 py-5 transition-all duration-500",
        scrolled ? "bg-white/90 backdrop-blur-md border-b border-black/5 shadow-sm" : "bg-transparent",
        customization.announcementText ? "top-9" : "top-0"
      )}>
        <div className={cn("hidden md:flex items-center gap-8 text-xs font-medium uppercase tracking-[0.15em]", scrolled ? "" : "text-white drop-shadow")}>
          <button onClick={() => scrollToSection('about')} className="opacity-80 hover:opacity-100">{t('public.ourStory')}</button>
          <button onClick={() => scrollToSection('menu')} className="opacity-80 hover:opacity-100">{t('public.menu')}</button>
        </div>

        <div className={cn("text-xl md:text-2xl tracking-tight flex-1 md:flex-none text-center", scrolled ? "" : "text-white drop-shadow")}>
          {restaurant.name}
        </div>

        <div className={cn("hidden md:flex items-center gap-6 text-xs font-medium uppercase tracking-[0.15em]", scrolled ? "" : "text-white drop-shadow")}>
          <LanguageSwitcher />
          <button onClick={() => scrollToSection('contact')} className="opacity-80 hover:opacity-100">{t('public.contact')}</button>
          <button onClick={() => scrollToSection('reservations')} className="rounded-full bg-[var(--accent)] px-5 py-2 text-white hover:bg-[var(--accent-hover)] transition-colors">
            {t('public.reservations')}
          </button>
        </div>

        <div className="md:hidden flex items-center gap-3">
          <LanguageSwitcher />
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={cn(scrolled ? "text-[var(--accent)]" : "text-white")}>
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>
      )}

      {!menuOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-[#fdfaf3]/97 backdrop-blur-md flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 md:hidden">
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-2xl font-serif">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-2xl font-serif">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-2xl font-serif">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-4 rounded-full bg-[var(--accent)] px-8 py-3 text-lg font-serif text-white">{t('public.reservations')}</button>
        </div>
      )}

      {!menuOnly && (
      <>
      {/* Hero */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10 z-10" />
          <img src={bgImage} className="w-full h-full object-cover" alt={restaurant.name} />
        </div>

        <div className="relative z-20 flex flex-col items-center px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="mb-5 flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-white backdrop-blur-md">
            <Leaf className="h-3.5 w-3.5" /> {t('public.aCulinaryJourney')}
          </span>
          <h1 className="mb-6 text-5xl font-serif leading-none tracking-tight text-white md:text-7xl lg:text-8xl">
            {restaurant.name}
          </h1>
          <p className="mb-8 max-w-md text-base font-light text-white/85">
            Seasonal plates, warm hospitality, and a table that always feels like home.
          </p>
          <button onClick={() => scrollToSection('reservations')} className="rounded-full bg-[var(--accent)] px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-white shadow-lg transition-all hover:scale-[1.03] hover:bg-[var(--accent-hover)]">
            {t('public.bookATable')}
          </button>
        </div>

        <button onClick={() => scrollToSection('about')} className="absolute bottom-10 z-20 animate-bounce text-white/80 hover:text-white" aria-label="Scroll down">
          <ChevronDown className="h-6 w-6" />
        </button>
      </section>

      {/* About */}
      <section id="about" className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 py-24 md:grid-cols-2 md:px-12 md:py-32">
        <div>
          <span className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            <Leaf className="h-3.5 w-3.5" /> {t('public.ourStory')}
          </span>
          <h2 className="mb-6 font-serif text-4xl leading-tight md:text-5xl">Rooted in Season, Grown with Care</h2>
          <p className="whitespace-pre-wrap text-base leading-relaxed opacity-70">
            {customization.aboutUsText || `Welcome to ${restaurant.name} — an easy, light-filled room built around seasonal produce and unhurried meals. Pull up a chair, and let us take care of the rest.`}
          </p>
        </div>
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2.5rem] shadow-xl">
          <img src={ABOUT_IMAGE} className="h-full w-full object-cover" alt={`Inside ${restaurant.name}`} />
          <div className="absolute -bottom-6 -left-6 hidden h-28 w-28 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg sm:flex">
            <Leaf className="h-10 w-10" />
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="px-6 py-20 md:px-12" style={{ backgroundColor: accentColor + '0f' }}>
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Gallery</span>
            <h2 className="font-serif text-3xl md:text-5xl">From Our Table</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className={cn("aspect-square w-full overflow-hidden shadow-md", i === 1 ? "rounded-full" : "rounded-[2rem]")}>
                <img src={src} alt="Signature dish" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>
      </>
      )}

      <section id="menu" className={cn("px-6 md:px-12", menuOnly ? "pt-28 pb-24" : "py-20 md:py-28")}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Gastronomy</span>
            <h2 className="font-serif text-4xl md:text-6xl">{t('public.menu')}</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center opacity-60">The seasonal menu is currently being curated.</p>
          ) : (
            <div className="space-y-16">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id}>
                  <div className="mb-6 flex items-center gap-3">
                    <h3 className="font-serif text-2xl">{cat.name}</h3>
                    <div className="h-px flex-1 bg-[var(--accent)]/20" />
                  </div>

                  {cat.items && cat.items.length > 0 && (
                    <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {cat.items.map((item: any) => renderMenuItem(item))}
                    </div>
                  )}

                  {cat.children && cat.children.length > 0 && (
                    <div className="space-y-10">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="mb-4 font-serif text-lg opacity-80">{sub.name}</h4>
                          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {sub.items?.map((item: any) => renderMenuItem(item))}
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
            <div className="mt-14 text-center text-xs font-medium opacity-50">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>

      {menuOnly && (
        <footer className="border-t border-black/5 px-6 py-14 text-center md:px-12">
          <h2 className="mb-4 font-serif text-2xl">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm opacity-70">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[var(--accent)]">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[var(--accent)]">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Button nativeButton={false} className="mt-8 rounded-full bg-[var(--accent)] px-6 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)]" render={<Link href={`/r/${slug}?view=booking`} />}>
            {t('public.bookATable')}
          </Button>
          <p className="mt-8 text-xs opacity-40">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && (
      <>
      {/* Contact / Footer */}
      <section id="contact" className="mx-auto max-w-4xl border-t border-black/5 px-6 py-20 text-center md:px-12">
        <h2 className="mb-10 font-serif text-3xl">{restaurant.name}</h2>
        {hasContactInfo && (
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm opacity-70">
            {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-[var(--accent)]">{restaurant.contactPhone}</a>}
            {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-[var(--accent)]">{restaurant.contactEmail}</a>}
          </div>
        )}
        {customization.showLegal && customization.legalText && (
          <div className="mx-auto mt-20 max-w-2xl border-t border-black/5 pt-10 text-left text-xs leading-relaxed opacity-50">
            <h4 className="mb-2 text-center text-xs font-semibold uppercase tracking-widest opacity-80">Legal Terms</h4>
            <div className="whitespace-pre-wrap">{customization.legalText}</div>
          </div>
        )}
        <p className="mt-14 text-xs opacity-40">© {new Date().getFullYear()} {restaurant.name}</p>
      </section>

      {/* Reservations */}
      <section id="reservations" className="px-6 py-24 md:px-12" style={{ backgroundColor: accentColor + '0f' }}>
        <div className="mx-auto max-w-3xl">
          <div className="mb-14 text-center">
            <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Reservations</span>
            <h2 className="font-serif text-4xl md:text-5xl">{t('public.bookATable')}</h2>
          </div>

          {isBookingSuccess ? (
            <div className="rounded-[2rem] border border-black/5 bg-white p-12 text-center animate-in zoom-in">
              <CheckCircle2 className="mx-auto mb-6 h-16 w-16 text-emerald-500" />
              <h3 className="mb-3 font-serif text-2xl">{isPossiblyFullyBooked ? 'Request Received' : 'Reservation Confirmed'}</h3>
              <p className="text-base opacity-60">We look forward to welcoming you.</p>
              {confirmationCode && (
                <div className="mx-auto mt-8 flex max-w-xs flex-col items-center rounded-2xl border border-black/5 bg-[#fdfaf3] px-6 py-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-50">{t('public.confirmationCodeLabel')}</span>
                  <span className="mt-1 text-2xl font-semibold tracking-[0.2em]" style={{ color: 'var(--accent)' }}>{confirmationCode}</span>
                  <span className="mt-2 text-[10px] opacity-50">{t('public.confirmationCodeHint')}</span>
                </div>
              )}
              {isPossiblyFullyBooked && (
                <div className="mx-auto mt-8 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                  Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                </div>
              )}
            </div>
          ) : isWaitlistSuccess ? (
            <div className="rounded-[2rem] border border-black/5 bg-white p-12 text-center animate-in zoom-in">
              <CheckCircle2 className="mx-auto mb-6 h-16 w-16 text-emerald-500" />
              <h3 className="mb-3 font-serif text-2xl">Waitlist Joined</h3>
              <p className="text-base opacity-60">We will notify you if a table becomes available.</p>
            </div>
          ) : (
            <form onSubmit={handleBooking} className="space-y-8 rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm sm:p-10">
              {restaurant.customization?.reservationInfoText && (
                <div className="text-sm opacity-70 space-y-2 [&>p]:mb-2 [&>a]:text-[var(--accent)] [&>a]:underline"
                     dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
              )}
              {restaurant.customization?.reservationWarningText && (
                <div className="rounded-2xl border-l-2 border-amber-500 bg-amber-50 p-4 text-sm font-medium text-amber-700 space-y-2 [&>p]:mb-2 [&>a]:underline"
                     dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
              )}

              <div className="space-y-5">
                <Label className="text-xs font-semibold uppercase tracking-widest opacity-60">Date</Label>
                <div className="rounded-2xl border border-black/10 bg-[#fdfaf3] p-4">
                  <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--accent)" />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-widest opacity-60">Time</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[...times.lunch, ...times.dinner].map(tm => (
                    <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 rounded-xl border text-sm font-medium transition-all", selectedTime === tm ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-black/10 bg-[#fdfaf3] hover:border-[var(--accent)]/40")}>{tm}</button>
                  ))}
                </div>
              </div>

              {checkingDay ? (
                <div className="flex items-center gap-3 rounded-2xl border-l-2 border-black/10 bg-[#fdfaf3] p-5 text-sm opacity-70">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-[var(--accent)]" /> Checking availability for <strong>{selectedDateLabel}</strong>...
                </div>
              ) : dayStatus?.daySetting?.isFullyBooked ? (
                <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-5 text-sm text-amber-800 flex items-start gap-3">
                  <Clock className="h-5 w-5 shrink-0 text-amber-500" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-amber-600">{selectedDateLabel}</span>
                    <strong className="mb-1 block text-base">Fully Booked (Waitlist Open)</strong>
                    We are fully booked for reservations on this day, but you can join our waitlist.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                <div className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-5 text-sm text-red-800 flex items-start gap-3">
                  <X className="h-5 w-5 shrink-0 text-red-500" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-red-600">{selectedDateLabel}</span>
                    <strong className="mb-1 block text-base">Reservations Closed</strong>
                    Unfortunately, we&apos;re not accepting reservations for this day.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.autoConfirm ? (
                <div className="rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-5 text-sm text-emerald-800 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-emerald-600">{selectedDateLabel}</span>
                    <strong className="mb-1 block text-base">Immediate Booking</strong>
                    Your reservation will be confirmed automatically.
                  </div>
                </div>
              ) : dayStatus ? (
                <div className="rounded-2xl border-l-4 border-blue-500 bg-blue-50 p-5 text-sm text-blue-800 flex items-start gap-3">
                  <CalendarIcon className="h-5 w-5 shrink-0 text-blue-500" />
                  <div>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-blue-600">{selectedDateLabel}</span>
                    <strong className="mb-1 block text-base">Confirmation Queue</strong>
                    This date requires manual staff review. You&apos;ll receive a notification.
                  </div>
                </div>
              ) : null}

              {dayStatus?.daySetting?.isCapacityFull && (
                <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <p className="mb-0.5 font-semibold text-amber-600">{t('public.capacityFullTitle')}</p>
                    <p>{t('public.capacityFullDesc')}</p>
                  </div>
                </div>
              )}

              <div className="space-y-6 border-t border-black/5 pt-8">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest opacity-60">Guests</Label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => setResForm({...resForm, guestCount: String(n)})} className={cn("h-12 w-12 rounded-full border text-base font-semibold transition-all", resForm.guestCount === String(n) ? "border-[var(--accent)] bg-[var(--accent)] text-white scale-105" : "border-black/10 bg-[#fdfaf3] hover:border-[var(--accent)]/40")}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-widest opacity-60">Name</Label>
                    <Input required value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})} className="h-14 rounded-2xl border-black/10 bg-[#fdfaf3] px-5 text-base font-medium focus-visible:ring-4 focus-visible:ring-[var(--accent)]/10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-widest opacity-60">Phone</Label>
                    <Input required type="tel" value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})} className="h-14 rounded-2xl border-black/10 bg-[#fdfaf3] px-5 text-base font-medium focus-visible:ring-4 focus-visible:ring-[var(--accent)]/10" />
                  </div>
                </div>
              </div>

              <ConsentFields
                slug={slug}
                consentAccepted={resForm.consentAccepted}
                onConsentAcceptedChange={(v) => setResForm({ ...resForm, consentAccepted: v })}
                marketingConsent={resForm.marketingConsent}
                onMarketingConsentChange={(v) => setResForm({ ...resForm, marketingConsent: v })}
                className="mt-2 space-y-3 text-sm opacity-80"
              />

              <Button
                type="submit"
                disabled={checkingDay || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                className="h-16 w-full rounded-2xl bg-[var(--accent)] text-base font-semibold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {dayStatus?.daySetting?.isFullyBooked ? 'Join Waitlist' : 'Request Table'}
              </Button>
            </form>
          )}
        </div>
      </section>
      </>
      )}
    </div>
  );
}
