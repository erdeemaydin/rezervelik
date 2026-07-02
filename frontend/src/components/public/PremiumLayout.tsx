'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Calendar as CalendarIcon, ChevronDown, CheckCircle2, X, Clock, Menu, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getDaySuggestions, getTimeSuggestions } from '@/lib/reservationSuggestions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80&w=2000';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&q=80&w=1200';
const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&q=80&w=800',
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

  const getLocalYYYYMMDD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const [selectedDate, setSelectedDate] = useState(getLocalYYYYMMDD(new Date()));
  const [selectedTime, setSelectedTime] = useState('19:30');
  const dateInputRef = useRef<HTMLInputElement>(null);
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
    const combinedDateTime = new Date(`${selectedDate}T${selectedTime}:00+03:00`);

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

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-medium">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const { week, weekend } = getDaySuggestions();
  const times = getTimeSuggestions();
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || {
      typography: 'SERIF',
      colorPalette: 'OBSIDIAN',
  };

  const getFontClass = (type: string) => {
      switch(type) {
          case 'SANS': return 'font-sans';
          case 'MONO': return 'font-mono tracking-wide';
          case 'SERIF':
          default: return 'font-serif';
      }
  };

  const getPaletteClasses = (palette: string) => {
      switch(palette) {
          case 'EARTH': return 'bg-[#1c1917] text-[#f5f5f4] selection:bg-[#44403c]';
          case 'CRIMSON': return 'bg-[#1a0a0a] text-[#fdf0f0] selection:bg-[#4c1414]';
          case 'PEARL': return 'bg-[#0f172a] text-[#f8fafc] selection:bg-[#334155]';
          case 'OBSIDIAN':
          default: return 'bg-zinc-950 text-zinc-100 selection:bg-zinc-800';
      }
  };

  const getNavClasses = (palette: string) => {
      switch(palette) {
          case 'EARTH': return 'bg-[#1c1917]/90';
          case 'CRIMSON': return 'bg-[#1a0a0a]/90';
          case 'PEARL': return 'bg-[#0f172a]/90';
          case 'OBSIDIAN':
          default: return 'bg-zinc-950/90';
      }
  };

  const getSectionBg = (palette: string) => {
      switch(palette) {
          case 'EARTH': return 'bg-[#292524]/50';
          case 'CRIMSON': return 'bg-[#2a0f0f]/50';
          case 'PEARL': return 'bg-[#1e293b]/50';
          case 'OBSIDIAN':
          default: return 'bg-zinc-900/50';
      }
  };

  const fontClass = getFontClass(customization.typography);
  const paletteClasses = getPaletteClasses(customization.colorPalette);
  const navBg = getNavClasses(customization.colorPalette);
  const sectionBg = getSectionBg(customization.colorPalette);
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  return (
    <div className={cn("min-h-screen selection:bg-white selection:text-zinc-950", paletteClasses, fontClass)}>

      {/* Announcement Banner */}
      {customization.announcementText && (
        <div className="w-full bg-zinc-100 text-zinc-950 text-sm font-medium text-center py-2 px-4 sticky top-0 z-50 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          {customization.announcementText}
        </div>
      )}

      {/* Header */}
      {menuOnly ? (
        <nav className={cn(
          "fixed w-full z-40 flex justify-between items-center px-6 md:px-12 py-5",
          navBg, "backdrop-blur-md border-b border-white/5",
          customization.announcementText ? "top-10" : "top-0"
        )}>
          <Button variant="ghost" nativeButton={false} className="px-0 text-xs font-medium uppercase tracking-[0.2em] opacity-70 hover:opacity-100 hover:bg-transparent" render={<Link href={`/r/${slug}`} />}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {restaurant.name}
          </Button>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button nativeButton={false} className="border border-white/30 bg-transparent px-5 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white hover:bg-white hover:text-zinc-900" render={<Link href={`/r/${slug}?view=booking`} />}>
              {t('public.bookATable')}
            </Button>
          </div>
        </nav>
      ) : (
      <nav className={cn(
        "fixed w-full z-40 flex justify-between items-center px-6 md:px-12 py-6 transition-all duration-500",
        scrolled ? cn(navBg, "backdrop-blur-md border-b border-white/5") : "bg-transparent",
        customization.announcementText ? "top-10" : "top-0"
      )}>
        <div className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.2em] uppercase">
          <button onClick={() => scrollToSection('about')} className="opacity-70 transition-opacity hover:opacity-100">{t('public.ourStory')}</button>
          <button onClick={() => scrollToSection('menu')} className="opacity-70 transition-opacity hover:opacity-100">{t('public.menu')}</button>
        </div>

        <div className={cn("text-xl md:text-2xl tracking-widest text-center flex-1 md:flex-none", customization.typography !== 'MONO' && 'uppercase')}>
          {restaurant.name}
        </div>

        <div className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.2em] uppercase">
          <LanguageSwitcher />
          <button onClick={() => scrollToSection('contact')} className="opacity-70 transition-opacity hover:opacity-100">{t('public.contact')}</button>
          <button onClick={() => scrollToSection('reservations')} className="border border-white/30 px-5 py-2 transition-all hover:bg-white hover:text-zinc-900">
            {t('public.reservations')}
          </button>
        </div>

        <div className="md:hidden flex items-center gap-4">
          <LanguageSwitcher />
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>
      )}

      {/* Mobile Menu Overlay */}
      {!menuOnly && isMobileMenuOpen && (
        <div className={cn("fixed inset-0 z-30 backdrop-blur-xl flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 md:hidden", paletteClasses)}>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-2xl font-serif tracking-widest">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-2xl font-serif tracking-widest">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-2xl font-serif tracking-widest">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-8 text-2xl font-serif tracking-widest text-emerald-400">{t('public.reservations')}</button>
        </div>
      )}

      {!menuOnly && (
      <>
      {/* Hero */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-zinc-950 z-10" />
          <img src={bgImage} className="w-full h-full object-cover" alt="Atmosphere" />
        </div>

        <div className="relative z-20 text-center px-4 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <span className="text-xs tracking-[0.4em] uppercase text-zinc-300 mb-6">{t('public.aCulinaryJourney')}</span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl tracking-tight mb-8">
            {restaurant.name}
          </h1>
          <button onClick={() => scrollToSection('reservations')} className="text-xs font-medium tracking-[0.2em] uppercase border-b border-zinc-100 pb-1 transition-all hover:opacity-70">
            {t('public.bookATable')}
          </button>
        </div>

        <button onClick={() => scrollToSection('about')} className="absolute bottom-12 z-20 animate-bounce opacity-70 hover:opacity-100" aria-label="Scroll down">
          <ChevronDown className="w-6 h-6" />
        </button>
      </section>

      {/* About */}
      {customization.showAboutUs && (
        <section id="about" className="py-32 px-6 md:px-12 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-8 text-center md:text-left">
            <span className="text-xs tracking-[0.3em] uppercase opacity-60">{t('public.ourStory')}</span>
            <h2 className="text-3xl md:text-5xl">Our Story</h2>
            <p className="opacity-60 leading-relaxed font-light text-lg whitespace-pre-wrap">
              {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
            </p>
          </div>
          <div className="flex-1 w-full aspect-[4/5] relative overflow-hidden rounded-sm">
            <img src={ABOUT_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-90 transition-opacity duration-700 hover:opacity-100" alt={`Inside ${restaurant.name}`} />
          </div>
        </section>
      )}

      {/* Gallery */}
      <section className={cn("py-24 px-6 md:px-12", sectionBg)}>
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <span className="mb-3 block text-xs uppercase tracking-[0.3em] opacity-60">Gallery</span>
            <h2 className="text-3xl md:text-5xl">A Few Highlights</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className="aspect-square w-full overflow-hidden rounded-sm">
                <img src={src} alt="Culinary highlight" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>
      </>
      )}

      <section id="menu" className={cn("px-6 md:px-12", menuOnly ? "pt-32 pb-32" : "py-32")}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-24">
            <span className="text-xs tracking-[0.3em] uppercase opacity-60 mb-4 block">Gastronomy</span>
            <h2 className="text-4xl md:text-6xl">The Menu</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center opacity-60">The seasonal menu is currently being curated.</p>
          ) : (
            <div className="space-y-24">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id}>
                  <h3 className="text-xl text-center uppercase tracking-widest mb-12 opacity-80">{cat.name}</h3>
                  <div className="space-y-8">
                    {cat.items?.map((item: any) => (
                      <div key={item.id} className="group relative">
                        <div className="flex items-baseline justify-between gap-4">
                          <h4 className="text-base font-medium tracking-wide uppercase">{item.name}</h4>
                          <div className="flex-1 border-b border-dashed border-white/20 relative top-[-6px]" />
                          <span className="text-base opacity-90">
                            {item.price.toLocaleString('tr-TR')} ₺
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-sm opacity-50 mt-2 font-light max-w-xl">{item.description}</p>
                        )}
                        {item.ingredients && (
                          <p className="text-xs opacity-40 mt-1 font-light max-w-xl"><span className="font-medium">{t('public.ingredients')}:</span> {item.ingredients}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.calories && <span className="text-[10px] uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">{item.calories} {t('public.calories')}</span>}
                          {item.containsAlcohol && <span className="text-[10px] uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">{t('public.containsAlcohol')}</span>}
                          {item.containsPork && <span className="text-[10px] uppercase tracking-wider text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full">{t('public.containsPork')}</span>}
                          {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                              <span key={i} className="text-[10px] uppercase tracking-wider text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">{tag.trim()}</span>
                          ))}
                        </div>
                        {item.allergens && (
                          <p className="mt-2 text-[10px] font-light uppercase tracking-wider text-amber-400/90">{t('public.allergens')}: {item.allergens}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-12 space-y-16">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="text-lg text-center uppercase tracking-wider mb-8 opacity-70 italic">{sub.name}</h4>
                          <div className="space-y-8">
                            {sub.items?.map((item: any) => (
                              <div key={item.id} className="group relative">
                                <div className="flex items-baseline justify-between gap-4">
                                  <h5 className="text-base font-medium tracking-wide uppercase">{item.name}</h5>
                                  <div className="flex-1 border-b border-dashed border-white/20 relative top-[-6px]" />
                                  <span className="text-base opacity-90">
                                    {item.price.toLocaleString('tr-TR')} ₺
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="text-sm opacity-50 mt-2 font-light max-w-xl">{item.description}</p>
                                )}
                                {item.ingredients && (
                                  <p className="text-xs opacity-40 mt-1 font-light max-w-xl"><span className="font-medium">{t('public.ingredients')}:</span> {item.ingredients}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  {item.calories && <span className="text-[10px] uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">{item.calories} {t('public.calories')}</span>}
                                  {item.containsAlcohol && <span className="text-[10px] uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">{t('public.containsAlcohol')}</span>}
                                  {item.containsPork && <span className="text-[10px] uppercase tracking-wider text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full">{t('public.containsPork')}</span>}
                                  {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                                      <span key={i} className="text-[10px] uppercase tracking-wider text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">{tag.trim()}</span>
                                  ))}
                                </div>
                                {item.allergens && (
                                  <p className="mt-2 text-[10px] font-light uppercase tracking-wider text-amber-400/90">{t('public.allergens')}: {item.allergens}</p>
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
            <div className="text-center mt-16 text-xs font-light opacity-50 uppercase tracking-widest">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>

      {menuOnly && (
        <footer className="border-t border-white/10 px-6 py-16 text-center md:px-12">
          <h2 className="mb-6 text-2xl">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-light opacity-60">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:opacity-100">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:opacity-100">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Button nativeButton={false} className="mt-8 border border-white/30 bg-transparent px-6 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white hover:bg-white hover:text-zinc-900" render={<Link href={`/r/${slug}?view=booking`} />}>
            {t('public.bookATable')}
          </Button>
          <p className="mt-10 text-xs opacity-40">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && (
      <>
      {/* Footer / Contact */}
      <section id="contact" className="py-32 px-6 md:px-12 text-center max-w-4xl mx-auto border-t border-white/10">
        <h2 className="text-3xl mb-12">{restaurant.name}</h2>
        {hasContactInfo && (
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm font-light opacity-60">
            {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:opacity-100">{restaurant.contactPhone}</a>}
            {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:opacity-100">{restaurant.contactEmail}</a>}
          </div>
        )}

        {customization.showLegal && customization.legalText && (
          <div className="mt-24 pt-12 border-t border-white/5 text-xs opacity-50 font-light text-left max-w-2xl mx-auto space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2 text-center">Legal Terms</h4>
            <div className="whitespace-pre-wrap">{customization.legalText}</div>
          </div>
        )}
        <p className="mt-12 text-xs opacity-40">© {new Date().getFullYear()} {restaurant.name}</p>
      </section>

      {/* Reservation Section */}
      <section id="reservations" className={cn("py-32 px-6 md:px-12 border-t border-white/10", sectionBg)}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs tracking-[0.3em] uppercase opacity-60 mb-4 block">Reservations</span>
            <h2 className="text-4xl md:text-5xl font-serif">Book a Table</h2>
          </div>

          {isBookingSuccess ? (
            <div className="text-center py-12 animate-in zoom-in bg-black/20 rounded-2xl border border-white/10 p-12">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
              <h3 className="text-2xl font-serif mb-4">{isPossiblyFullyBooked ? 'Request Received' : 'Reservation Confirmed'}</h3>
              <p className="opacity-60 font-light text-base">We look forward to welcoming you.</p>
              {isPossiblyFullyBooked && (
                <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-sm font-light text-amber-200">
                  Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                </div>
              )}
            </div>
          ) : isWaitlistSuccess ? (
            <div className="text-center py-12 animate-in zoom-in bg-black/20 rounded-2xl border border-white/10 p-12">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
              <h3 className="text-2xl font-serif mb-4">Waitlist Joined</h3>
              <p className="opacity-60 font-light text-base">We will notify you if a table becomes available.</p>
            </div>
          ) : (
            <form onSubmit={handleBooking} className="space-y-10 bg-black/20 p-8 md:p-12 rounded-3xl border border-white/10">
              {restaurant.customization?.reservationInfoText && (
                  <div className="text-base font-light opacity-60 space-y-2 [&>p]:mb-2 [&>a]:underline mb-8"
                       dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
              )}
              {restaurant.customization?.reservationWarningText && (
                  <div className="p-6 bg-black/30 rounded-xl border-l-4 border-white/30 text-base font-light space-y-2 [&>p]:mb-2 [&>a]:underline mb-8"
                       dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
              )}

              <div className="space-y-5">
                <Label className="text-sm uppercase tracking-widest opacity-60 font-medium">Date</Label>
                <div className="grid grid-cols-3 gap-3">
                  {week.map(d => (
                    <button key={d.value} type="button" onClick={() => setSelectedDate(d.value)} className={cn("flex h-16 flex-col items-center justify-center rounded-xl border transition-all", selectedDate === d.value ? "border-white bg-white text-zinc-950" : "border-white/10 bg-black/20 hover:border-white/30")}>
                      <span className="text-[9px] font-medium uppercase opacity-70">{d.label}</span>
                      <span className="text-sm font-semibold">{d.full}</span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-medium uppercase tracking-widest opacity-40">Also available</span>
                  <div className="grid grid-cols-4 gap-3">
                    {weekend.map(d => (
                      <button key={d.value} type="button" onClick={() => setSelectedDate(d.value)} className={cn("flex h-16 flex-col items-center justify-center rounded-xl border transition-all", selectedDate === d.value ? "border-white bg-white text-zinc-950" : "border-white/10 bg-black/20 hover:border-white/30")}>
                        <span className="text-[9px] font-medium uppercase opacity-70">{d.label}</span>
                        <span className="text-sm font-semibold">{d.full}</span>
                      </button>
                    ))}
                    <div className="relative">
                      <input type="date" ref={dateInputRef} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="sr-only" />
                      {(() => {
                        const isCustom = !week.find(d => d.value === selectedDate) && !weekend.find(d => d.value === selectedDate);
                        return (
                          <button type="button" onClick={() => dateInputRef.current?.showPicker()} className={cn("flex h-16 w-full flex-col items-center justify-center rounded-xl border transition-all", isCustom ? "border-white bg-white text-zinc-950" : "border-white/10 bg-black/20 hover:border-white/30")}>
                            <CalendarIcon className="mb-1 h-4 w-4" />
                            <span className="text-[9px] font-medium uppercase">{isCustom ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Custom'}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-sm uppercase tracking-widest opacity-60 font-medium">Time</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[...times.lunch, ...times.dinner].map(tm => (
                    <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 rounded-lg border text-sm font-medium transition-all", selectedTime === tm ? "border-white bg-white text-zinc-950" : "border-white/10 bg-black/20 hover:border-white/30")}>{tm}</button>
                  ))}
                </div>
                <Input
                  type="time"
                  required
                  value={selectedTime}
                  onChange={e => setSelectedTime(e.target.value)}
                  className="bg-black/30 border border-white/10 rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-white/30 transition-all"
                />
              </div>

              {checkingDay ? (
                <div className="flex items-center gap-3 rounded-xl border-l-4 border-white/30 bg-black/20 p-6 text-base font-light opacity-70">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Checking availability for <strong className="font-medium">{selectedDateLabel}</strong>...
                </div>
              ) : dayStatus?.daySetting?.isFullyBooked ? (
                <div className="rounded-xl border-l-4 border-amber-500 bg-amber-950/40 p-6 text-base font-light text-amber-100 flex items-start gap-4">
                  <Clock className="w-6 h-6 shrink-0 text-amber-500" />
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-amber-500/80">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-amber-500 text-lg">Fully Booked (Waitlist Open)</strong>
                    We are fully booked for reservations on this day, but you can join our waitlist.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                <div className="rounded-xl border-l-4 border-red-500 bg-red-950/40 p-6 text-base font-light text-red-100 flex items-start gap-4">
                  <X className="w-6 h-6 shrink-0 text-red-500" />
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-red-500/80">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-red-500 text-lg">Reservations Closed</strong>
                    Unfortunately, we&apos;re not accepting reservations for this day.
                  </div>
                </div>
              ) : dayStatus?.daySetting?.autoConfirm ? (
                <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-950/40 p-6 text-base font-light text-emerald-100 flex items-start gap-4">
                  <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-500" />
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-emerald-500/80">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-emerald-500 text-lg">Immediate Booking</strong>
                    Your reservation will be confirmed automatically.
                  </div>
                </div>
              ) : dayStatus ? (
                <div className="rounded-xl border-l-4 border-blue-500 bg-blue-950/40 p-6 text-base font-light text-blue-100 flex items-start gap-4">
                  <CalendarIcon className="w-6 h-6 shrink-0 text-blue-500" />
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-blue-500/80">{selectedDateLabel}</span>
                    <strong className="block mb-2 text-blue-500 text-lg">Confirmation Queue</strong>
                    This date requires manual staff review. You&apos;ll receive a notification.
                  </div>
                </div>
              ) : null}

              <div className="space-y-8 pt-8 border-t border-white/10">
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-widest opacity-60 font-medium">Guests</Label>
                    <Input
                      type="number" min="1" required
                      value={resForm.guestCount} onChange={e => setResForm({...resForm, guestCount: e.target.value})}
                      className="bg-black/30 border border-white/10 rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-white/30 transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-widest opacity-60 font-medium">Name</Label>
                    <Input
                      required
                      value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})}
                      className="bg-black/30 border border-white/10 rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-white/30 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-widest opacity-60 font-medium">Phone</Label>
                    <Input
                      required
                      value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})}
                      className="bg-black/30 border border-white/10 rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-white/30 transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-widest opacity-60 font-medium">Email</Label>
                    <Input
                      type="email"
                      value={resForm.customerEmail} onChange={e => setResForm({...resForm, customerEmail: e.target.value})}
                      className="bg-black/30 border border-white/10 rounded-xl h-14 px-4 text-base focus-visible:ring-2 focus-visible:ring-white/30 transition-all"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={checkingDay || dayStatus?.daySetting?.isReservationEnabled === false}
                className="w-full h-16 bg-white hover:bg-zinc-200 text-zinc-950 text-lg font-medium tracking-[0.1em] uppercase rounded-xl mt-8 disabled:opacity-50 disabled:hover:bg-white transition-all hover:scale-[1.02]"
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
