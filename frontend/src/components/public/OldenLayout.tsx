'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Calendar as CalendarIcon, Clock, CheckCircle2, X, Menu, ChevronDown, ArrowLeft, AlertTriangle } from 'lucide-react';
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

const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=2000';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&q=80&w=1200';
const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1543007631-283050bb3e8c?auto=format&fit=crop&q=80&w=800',
];

export default function OldenLayout({ slug, initialRestaurant, initialView, menuOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [scrolled, setScrolled] = useState(false);

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);

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
    if (menuOnly) return;
    if (initialView === 'menu') {
      setTimeout(() => scrollToSection('menu'), 500);
    } else if (initialView === 'booking') {
      setTimeout(() => scrollToSection('reservations'), 500);
    }
  }, [initialView, menuOnly]);

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-white text-black font-serif">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const getFontClass = (type: string) => {
      switch(type) {
          case 'MONO': return 'font-mono tracking-wide';
          case 'SANS': return 'font-sans';
          case 'SERIF':
          default: return 'font-outfit';
      }
  };
  const fontClass = getFontClass(customization.typography);

  const getPalette = (preset: string) => {
      switch(preset) {
          case 'EARTH': return { bg: '#fdfbf7', text: '#292524', accent: '#5c4033' };
          case 'CRIMSON': return { bg: '#fffbfb', text: '#450a0a', accent: '#7f1d1d' };
          case 'PEARL': return { bg: '#f8fafc', text: '#0f172a', accent: '#1e3a8a' };
          case 'OBSIDIAN':
          default: return { bg: '#fcfcfc', text: '#2c2c2c', accent: '#8b0000' };
      }
  };
  const palette = getPalette(customization.colorPalette);
  const accentColor = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : palette.accent;
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

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
      {/* Announcement Banner */}
      {customization.announcementText && (
        <div className="w-full bg-[var(--accent)] text-white text-sm font-medium text-center py-2 px-4 sticky top-0 z-50 flex items-center justify-center gap-2">
          {customization.announcementText}
        </div>
      )}

      {/* Header */}
      {menuOnly ? (
        <header className={cn(
          "fixed w-full z-40 bg-white/95 backdrop-blur-md shadow-sm py-3",
          customization.announcementText ? "top-10" : "top-0"
        )}>
          <div className="container mx-auto flex items-center justify-between px-6 lg:px-12">
            <Button variant="ghost" nativeButton={false} className="px-0 text-sm font-semibold uppercase tracking-wider text-[#555] hover:bg-transparent hover:text-[var(--accent)]" render={<Link href={`/r/${slug}`} />}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {restaurant.name}
            </Button>
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Button nativeButton={false} className="rounded-sm bg-[var(--accent)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)]" render={<Link href={`/r/${slug}?view=booking`} />}>
                {t('public.bookATable')}
              </Button>
            </div>
          </div>
        </header>
      ) : (
      <header className={cn(
        "fixed w-full z-40 transition-all duration-500",
        scrolled ? "bg-white/95 backdrop-blur-md shadow-sm py-3" : "bg-transparent py-6",
        customization.announcementText ? "top-10" : "top-0"
      )}>
        <div className="container mx-auto px-6 lg:px-12 flex justify-between items-center">
          <div className={cn("text-2xl lg:text-3xl font-serif tracking-widest uppercase transition-colors", scrolled ? "text-[#2c2c2c]" : "text-white")}>
            {restaurant.name}
          </div>
          <nav className="hidden lg:flex items-center gap-10">
            <ul className={cn("flex space-x-10 text-sm font-semibold tracking-wider uppercase transition-colors", scrolled ? "text-[#555]" : "text-white/90")}>
              <li><button onClick={() => scrollToSection('about')} className="hover:text-[var(--accent)] transition-colors">{t('public.ourStory')}</button></li>
              <li><button onClick={() => scrollToSection('menu')} className="hover:text-[var(--accent)] transition-colors">{t('public.menu')}</button></li>
              <li><button onClick={() => scrollToSection('reservations')} className="hover:text-[var(--accent)] transition-colors">{t('public.reservations')}</button></li>
            </ul>
            <LanguageSwitcher />
          </nav>

          <div className="lg:hidden flex items-center gap-4">
            <LanguageSwitcher />
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={cn("p-2 transition-colors", scrolled ? "text-[#2c2c2c]" : "text-white")}>
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>
      )}

      {/* Mobile Menu Overlay */}
      {!menuOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-[#fcfcfc]/95 backdrop-blur-md flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 lg:hidden">
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-3xl font-serif tracking-widest text-[#2c2c2c]">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-3xl font-serif tracking-widest text-[#2c2c2c]">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-8 text-3xl font-serif tracking-widest text-[var(--accent)]">{t('public.reservations')}</button>
        </div>
      )}

      {!menuOnly && (
      <>
      {/* Hero Section */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10 z-10" />
          <img src={bgImage} className="w-full h-full object-cover" alt={restaurant.name} />
        </div>

        <div className="relative z-20 flex flex-col items-center px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="mb-4 text-xs font-sans font-bold uppercase tracking-[0.3em] text-white/70">{t('public.aCulinaryJourney')}</span>
          <h1 className="mb-8 text-5xl font-serif leading-none tracking-tight text-white md:text-7xl lg:text-8xl">
            {restaurant.name}
          </h1>
          <button onClick={() => scrollToSection('reservations')} className="rounded-sm border border-white/40 px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-white hover:text-[#1a1a1a]">
            {t('public.bookATable')}
          </button>
        </div>

        <button onClick={() => scrollToSection('about')} className="absolute bottom-10 z-20 animate-bounce text-white/70 hover:text-white" aria-label="Scroll down">
          <ChevronDown className="h-6 w-6" />
        </button>
      </section>

      {/* Our Story */}
      <section id="about" className="py-24 lg:py-32 px-6 lg:px-12 container mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h3 className="mb-4 text-xl font-sans font-bold uppercase tracking-widest text-[var(--accent)]">{t('public.ourStory')}</h3>
            <h2 className="mb-8 font-serif text-5xl leading-none text-[#1a1a1a] lg:text-6xl">The Experience</h2>
            <p className="mb-10 whitespace-pre-wrap text-lg leading-relaxed text-[#555]">
              {customization.aboutUsText || `Welcome to ${restaurant.name} — a space built for long conversations, warm hospitality, and food worth remembering. Make a reservation and come find your table.`}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {GALLERY_IMAGES.map((src, i) => (
                <div key={i} className="aspect-square w-full overflow-hidden rounded-sm shadow-sm">
                  <img src={src} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" alt="Restaurant detail" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
          <div className="aspect-[4/5] w-full overflow-hidden rounded-sm shadow-lg">
            <img src={ABOUT_IMAGE} className="h-full w-full object-cover" alt={`Inside ${restaurant.name}`} />
          </div>
        </div>
      </section>
      </>
      )}

      {/* Menu Section */}
      <section id="menu" className={cn("px-6 lg:px-12 container mx-auto bg-[#f4f4f4]/60", menuOnly ? "pt-28 pb-24" : "py-24 lg:py-32")}>
         <div className="text-center mb-20">
            <h3 className="mb-4 text-xl font-sans font-bold uppercase tracking-widest text-[var(--accent)]">Our Flavors</h3>
            <h2 className="font-serif text-5xl leading-none text-[#1a1a1a] lg:text-7xl">{t('public.menu')}</h2>
         </div>

         {!restaurant.menus?.[0] ? (
            <p className="text-center font-serif text-xl text-[#555]">The menu is currently being updated.</p>
         ) : (
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-24 gap-y-16 md:grid-cols-2">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id} className="mb-8">
                  <h3 className="mb-8 border-b border-[#e0e0e0] pb-4 font-serif text-3xl uppercase tracking-wide text-[#1a1a1a]">{cat.name}</h3>
                  <div className="space-y-8">
                    {cat.items?.map((item: any) => (
                      <div key={item.id} className="group">
                        <div className="mb-2 flex items-baseline justify-between">
                          <h4 className="text-lg font-bold font-sans uppercase tracking-wide text-[#2c2c2c]">{item.name}</h4>
                          <span className="font-serif text-xl text-[var(--accent)]">
                            {item.price.toLocaleString('tr-TR')} ₺
                          </span>
                        </div>
                        {item.description && (
                          <p className="font-serif italic text-[#666]">{item.description}</p>
                        )}
                        {item.ingredients && (
                          <p className="mt-1 font-serif text-sm italic text-[#888]"><span className="font-semibold not-italic">{t('public.ingredients')}:</span> {item.ingredients}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {item.calories && <span className="rounded-sm border border-[#a855f7]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#a855f7]">{item.calories} {t('public.calories')}</span>}
                          {item.containsAlcohol && <span className="rounded-sm border border-[#e11d48]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#e11d48]">{t('public.containsAlcohol')}</span>}
                          {item.containsPork && <span className="rounded-sm border border-[#db2777]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#db2777]">{t('public.containsPork')}</span>}
                          {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                              <span key={i} className="rounded-sm border border-[#16a34a]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#16a34a]">{tag.trim()}</span>
                          ))}
                        </div>
                        {item.allergens && (
                          <p className="mt-1 font-serif text-xs italic text-[#a16207]">{t('public.allergens')}: {item.allergens}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-12 space-y-16">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="mb-6 border-b border-[#e0e0e0] pb-2 font-serif text-2xl uppercase tracking-wide text-[#1a1a1a] opacity-80">{sub.name}</h4>
                          <div className="space-y-8">
                            {sub.items?.map((item: any) => (
                              <div key={item.id} className="group">
                                <div className="mb-2 flex items-baseline justify-between">
                                  <h5 className="text-base font-bold font-sans uppercase tracking-wide text-[#2c2c2c]">{item.name}</h5>
                                  <span className="font-serif text-lg text-[var(--accent)]">
                                    {item.price.toLocaleString('tr-TR')} ₺
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="font-serif text-sm italic text-[#666]">{item.description}</p>
                                )}
                                {item.ingredients && (
                                  <p className="mt-1 font-serif text-xs italic text-[#888]"><span className="font-semibold not-italic">{t('public.ingredients')}:</span> {item.ingredients}</p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {item.calories && <span className="rounded-sm border border-[#a855f7]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#a855f7]">{item.calories} {t('public.calories')}</span>}
                                  {item.containsAlcohol && <span className="rounded-sm border border-[#e11d48]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#e11d48]">{t('public.containsAlcohol')}</span>}
                                  {item.containsPork && <span className="rounded-sm border border-[#db2777]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#db2777]">{t('public.containsPork')}</span>}
                                  {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                                      <span key={i} className="rounded-sm border border-[#16a34a]/30 px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest text-[#16a34a]">{tag.trim()}</span>
                                  ))}
                                </div>
                                {item.allergens && (
                                  <p className="mt-1 font-serif text-xs italic text-[#a16207]">{t('public.allergens')}: {item.allergens}</p>
                                )}
                              </div>
                            ))}
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
             <div className="mt-12 text-center font-serif text-sm italic text-[#888]">
                 Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
             </div>
         )}

         <div className="mt-20 text-center">
            {menuOnly ? (
              <Button nativeButton={false} className="rounded-sm bg-[var(--accent)] px-12 py-6 text-lg font-bold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)]" render={<Link href={`/r/${slug}?view=booking`} />}>
                  {t('public.bookATable')}
              </Button>
            ) : (
              <Button onClick={() => scrollToSection('reservations')} className="rounded-sm bg-[var(--accent)] px-12 py-6 text-lg font-bold uppercase tracking-widest text-white hover:bg-[var(--accent-hover)]">
                  {t('public.bookATable')}
              </Button>
            )}
         </div>
      </section>

      {menuOnly && (
        <footer className="bg-[#1a1a1a] py-16 text-center text-[#f4f4f4]">
          <div className="container mx-auto px-6">
            <h2 className="mb-6 font-serif text-2xl">{restaurant.name}</h2>
            {hasContactInfo && (
              <div className="flex flex-col items-center justify-center gap-4 font-sans text-sm uppercase tracking-widest opacity-80 md:flex-row md:gap-8">
                {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:text-white">{restaurant.contactPhone}</a>}
                {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-white">{restaurant.contactEmail}</a>}
              </div>
            )}
            <div className="mt-10 border-t border-white/10 pt-6 text-xs opacity-50">
              © {new Date().getFullYear()} {restaurant.name}
            </div>
          </div>
        </footer>
      )}

      {!menuOnly && (
      <>
      {/* Footer */}
      <footer className="bg-[#1a1a1a] py-24 text-center text-[#f4f4f4]">
         <div className="container mx-auto px-6">
            <h2 className="mb-12 font-serif text-4xl">{restaurant.name}</h2>
            {hasContactInfo && (
              <div className="flex flex-col items-center justify-center gap-6 font-sans text-sm uppercase tracking-widest opacity-80 md:flex-row md:gap-12">
                  {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="transition-colors hover:text-white">{restaurant.contactPhone}</a>}
                  {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="transition-colors hover:text-white">{restaurant.contactEmail}</a>}
              </div>
            )}
            <div className="mt-16 border-t border-white/10 pt-8 text-xs opacity-50">
                © {new Date().getFullYear()} {restaurant.name}
            </div>
         </div>
      </footer>

      {/* Reservation Section */}
      <section id="reservations" className="py-32 px-6 lg:px-12 bg-[#f4f4f4] border-t border-[#e0e0e0]">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-16">
            <h3 className="mb-4 text-xl font-sans font-bold uppercase tracking-widest text-[var(--accent)]">{t('public.bookATable')}</h3>
            <h2 className="font-serif text-4xl text-[#1a1a1a] md:text-5xl">{t('public.reservations')}</h2>
          </div>

          {isBookingSuccess ? (
            <div className="text-center py-16 animate-in zoom-in bg-white shadow-xl rounded-2xl border border-[#e0e0e0]">
              <CheckCircle2 className="w-20 h-20 text-[#4caf50] mx-auto mb-6" />
              <h3 className="text-3xl font-serif mb-4 text-[#1a1a1a]">{isPossiblyFullyBooked ? 'Request Received' : 'Reservation Confirmed'}</h3>
              <p className="text-[#555] font-sans text-lg">We look forward to welcoming you.</p>
              {confirmationCode && (
                <div className="mx-auto mt-8 flex max-w-xs flex-col items-center rounded-xl border border-[#e0e0e0] bg-[#f9f9f9] px-6 py-4">
                  <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-[#888]">{t('public.confirmationCodeLabel')}</span>
                  <span className="mt-1 text-2xl font-serif tracking-[0.2em] text-[var(--accent)]">{confirmationCode}</span>
                  <span className="mt-2 text-[10px] font-sans text-[#888]">{t('public.confirmationCodeHint')}</span>
                </div>
              )}
              {isPossiblyFullyBooked && (
                <div className="mx-auto mt-8 max-w-md rounded-xl border-l-4 border-[#ff9800] bg-[#fff3e0] p-4 text-left text-sm font-sans text-[#8a5a00]">
                  Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleBooking} className="space-y-10 bg-white p-10 md:p-14 shadow-2xl rounded-3xl border border-[#e0e0e0]">
              {restaurant.customization?.reservationInfoText && (
                  <div className="p-6 bg-[#fcfcfc] border border-[#e0e0e0] rounded-xl text-base text-[#555] font-sans space-y-2 [&>p]:mb-2 [&>a]:text-[var(--accent)] [&>a]:underline mb-8"
                       dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
              )}
              {restaurant.customization?.reservationWarningText && (
                  <div className="p-6 bg-[#fff0f0] border-l-4 border-[var(--accent)] rounded-r-xl text-base text-[var(--accent)] font-sans font-medium space-y-2 [&>p]:mb-2 [&>a]:underline mb-8"
                       dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
              )}

              <div className="space-y-5">
                <Label className="text-sm uppercase font-bold tracking-widest text-[#555]">Date</Label>
                <div className="rounded-xl border-2 border-[#e0e0e0] bg-[#f9f9f9] p-4">
                  <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--accent)" />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-sm uppercase font-bold tracking-widest text-[#555]">Time</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[...times.lunch, ...times.dinner].map(tm => (
                    <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 rounded-lg border-2 text-sm font-bold transition-all", selectedTime === tm ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[#e0e0e0] bg-[#f9f9f9] hover:border-[var(--accent)]/40")}>{tm}</button>
                  ))}
                </div>
              </div>

              {checkingDay ? (
                <div className="flex items-center gap-3 rounded-r-xl border-l-4 border-[#888] bg-[#f4f4f4] p-6 font-serif text-base text-[#555]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#bbb] border-t-[#555]" /> Checking availability for <strong>{selectedDateLabel}</strong>...
                </div>
              ) : dayStatus?.daySetting?.isFullyBooked ? (
                <div className="rounded-r-xl border-l-4 border-[#ff9800] bg-[#fff3e0] p-6 text-base font-sans flex items-start gap-4">
                  <Clock className="w-6 h-6 shrink-0 text-[#ff9800]" />
                  <div>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[#ff9800]">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-[#e65100] text-lg">Fully Booked</strong>
                    We are fully booked for reservations on this day. Please choose another date, or call us directly.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                <div className="rounded-r-xl border-l-4 border-[#f44336] bg-[#ffebee] p-6 text-base font-sans flex items-start gap-4">
                  <X className="w-6 h-6 shrink-0 text-[#f44336]" />
                  <div>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[#f44336]">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-[#b71c1c] text-lg">Reservations Closed</strong>
                    Unfortunately, we&apos;re not accepting reservations for this day.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.autoConfirm ? (
                <div className="rounded-r-xl border-l-4 border-[#4caf50] bg-[#e8f5e9] p-6 text-base font-sans flex items-start gap-4">
                  <CheckCircle2 className="w-6 h-6 shrink-0 text-[#4caf50]" />
                  <div>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[#4caf50]">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-[#1b5e20] text-lg">Immediate Booking</strong>
                    Your reservation will be confirmed automatically.
                  </div>
                </div>
              ) : dayStatus ? (
                <div className="rounded-r-xl border-l-4 border-[#2196f3] bg-[#e3f2fd] p-6 text-base font-sans flex items-start gap-4">
                  <CalendarIcon className="w-6 h-6 shrink-0 text-[#2196f3]" />
                  <div>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[#2196f3]">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-[#0d47a1] text-lg">Confirmation Queue</strong>
                    This date requires manual staff review. You&apos;ll receive a notification.
                  </div>
                </div>
              ) : null}

              {dayStatus?.daySetting?.isCapacityFull && (
                <div className="rounded-r-xl border-l-4 border-[#ff9800] bg-[#fff3e0] p-4 text-sm font-sans flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#ff9800]" />
                  <div>
                    <p className="mb-0.5 font-bold text-[#e65100]">{t('public.capacityFullTitle')}</p>
                    <p>{t('public.capacityFullDesc')}</p>
                  </div>
                </div>
              )}

              <div className="space-y-8 pt-8 border-t border-[#e0e0e0]">
                <div className="space-y-3">
                  <Label className="text-sm uppercase font-bold tracking-widest text-[#555]">Guest Count</Label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => setResForm({...resForm, guestCount: String(n)})} className={cn("h-12 w-12 rounded-full border-2 text-base font-bold transition-all", resForm.guestCount === String(n) ? "border-[var(--accent)] bg-[var(--accent)] text-white scale-105" : "border-[#e0e0e0] bg-[#f9f9f9] hover:border-[var(--accent)]/40")}>{n}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div className="space-y-3">
                    <Label className="text-sm uppercase font-bold tracking-widest text-[#555]">Full Name</Label>
                    <Input
                      required
                      value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})}
                      className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm uppercase font-bold tracking-widest text-[#555]">Phone Number</Label>
                    <Input
                      required
                      type="tel"
                      value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})}
                      className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-all"
                    />
                  </div>
                </div>
              </div>

              <ConsentFields
                slug={slug}
                consentAccepted={resForm.consentAccepted}
                onConsentAcceptedChange={(v) => setResForm({ ...resForm, consentAccepted: v })}
                marketingConsent={resForm.marketingConsent}
                onMarketingConsentChange={(v) => setResForm({ ...resForm, marketingConsent: v })}
                className="mt-6 space-y-3 text-sm text-[#555]"
              />

              <Button
                type="submit"
                disabled={checkingDay || dayStatus?.daySetting?.isFullyBooked || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                className="w-full h-16 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold tracking-widest uppercase rounded-xl mt-8 disabled:opacity-50 text-lg transition-all hover:scale-[1.02]"
              >
                {dayStatus?.daySetting?.isFullyBooked ? 'Fully Booked' : 'Request Table'}
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
