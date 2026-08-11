'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Calendar as CalendarIcon, CheckCircle2, X, Clock, Menu, ArrowLeft, AlertTriangle } from 'lucide-react';
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

const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1400';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&q=80&w=1200';

// Deterministic tile-size pattern for the bento menu grid — every 5th item is
// "large" so the grid always reads as asymmetric, never a uniform list.
const tileSpan = (i: number) => (i % 5 === 0 ? 'md:col-span-2 md:row-span-2' : '');

export default function BoldEditorialLayout({ slug, initialRestaurant, initialView, menuOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean }) {
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
    notes: ''
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

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-white text-black font-black uppercase">Experience not found.</div>;

  const heroImage = restaurant.logoUrl || HERO_IMAGE_FALLBACK;
  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || { typography: 'SANS', colorPalette: 'OBSIDIAN' };
  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  const getFontClass = (type: string) => {
    switch (type) {
      case 'SERIF': return 'font-serif';
      case 'MONO': return 'font-mono';
      case 'SANS':
      default: return 'font-sans';
    }
  };
  const fontClass = getFontClass(customization.typography);

  // Stark black/white base; the palette selector only picks which single loud
  // accent gets used for emphasis marks and the CTA.
  const getPalette = (preset: string) => {
    switch (preset) {
      case 'CRIMSON': return { accent: '#ff2d2d' };
      case 'EARTH': return { accent: '#ffb703' };
      case 'OBSIDIAN':
      default: return { accent: '#eaff00' };
    }
  };
  const p = getPalette(customization.colorPalette);
  const overrideAccent = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : null;
  const accent = overrideAccent || p.accent;

  const rootStyle = {
    '--bg': '#ffffff',
    '--text': '#0a0a0a',
    '--muted': '#6b6b6b',
    '--line': '#0a0a0a',
    '--accent': accent,
    backgroundColor: '#ffffff',
    color: '#0a0a0a',
  } as React.CSSProperties;

  const renderMenuItem = (item: any, large = false) => (
    <div className={cn("h-full flex flex-col", large ? "justify-between" : "")}>
      <div className="flex items-start justify-between gap-4">
        <h4 className={cn("font-black uppercase tracking-tight leading-none", large ? "text-3xl md:text-4xl" : "text-lg")}>{item.name}</h4>
        <span className={cn("font-black whitespace-nowrap", large ? "text-2xl" : "text-sm")} style={{ color: 'var(--accent)', WebkitTextStroke: '1px black' }}>
          {item.price.toLocaleString('tr-TR')}₺
        </span>
      </div>
      {item.description && <p className={cn("mt-3 font-light leading-relaxed text-[color:var(--muted)]", large ? "text-base max-w-md" : "text-xs")}>{item.description}</p>}
      {large && item.ingredients && <p className="text-xs text-[color:var(--muted)] mt-2">{t('public.ingredients')}: {item.ingredients}</p>}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {item.containsAlcohol && <span className="text-[9px] font-bold uppercase tracking-wide bg-black text-white px-1.5 py-0.5">{t('public.containsAlcohol')}</span>}
        {item.containsPork && <span className="text-[9px] font-bold uppercase tracking-wide bg-black text-white px-1.5 py-0.5">{t('public.containsPork')}</span>}
        {item.dietaryTags && item.dietaryTags.split(',').slice(0, large ? 5 : 2).map((tag: string, i: number) => (
          <span key={i} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5" style={{ background: 'var(--accent)' }}>{tag.trim()}</span>
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-screen selection:bg-[color:var(--accent)] selection:text-black", fontClass)} style={rootStyle}>

      {customization.announcementText && (
        <div className="w-full text-center py-2.5 px-4 text-xs font-black uppercase tracking-widest" style={{ background: 'var(--text)', color: 'var(--bg)' }}>
          {customization.announcementText}
        </div>
      )}

      {menuOnly ? (
        <nav className="w-full flex justify-between items-center px-6 md:px-12 py-6 border-b-4" style={{ borderColor: 'var(--line)' }}>
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-tight hover:opacity-60 transition-opacity">
            <ArrowLeft className="h-4 w-4" /> {restaurant.name}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href={`/r/${slug}?view=booking`} className="px-5 py-2 text-xs font-black uppercase tracking-widest" style={{ background: 'var(--accent)', color: '#000' }}>
              {t('public.bookATable')}
            </Link>
          </div>
        </nav>
      ) : (
        <nav className="w-full flex items-center px-6 md:px-12 py-6 border-b-4 relative" style={{ borderColor: 'var(--line)' }}>
          <div className="hidden md:flex items-center gap-8 text-xs font-black uppercase tracking-widest">
            <button onClick={() => scrollToSection('about')} className="hover:opacity-60 transition-opacity">{t('public.ourStory')}</button>
            <button onClick={() => scrollToSection('menu')} className="hover:opacity-60 transition-opacity">{t('public.menu')}</button>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-black uppercase tracking-tighter whitespace-nowrap">{restaurant.name}</div>
          <div className="ml-auto flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6 text-xs font-black uppercase tracking-widest">
              <LanguageSwitcher />
              <button onClick={() => scrollToSection('contact')} className="hover:opacity-60 transition-opacity">{t('public.contact')}</button>
              <button onClick={() => scrollToSection('reservations')} className="px-5 py-2 transition-transform hover:scale-105" style={{ background: 'var(--accent)', color: '#000' }}>{t('public.reservations')}</button>
            </div>
            <div className="md:hidden flex items-center gap-4">
              <LanguageSwitcher />
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1"><Menu className="w-6 h-6" /></button>
            </div>
          </div>
        </nav>
      )}

      {!menuOnly && isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-white flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 md:hidden">
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('about'); }} className="text-3xl font-black uppercase">{t('public.ourStory')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('menu'); }} className="text-3xl font-black uppercase">{t('public.menu')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('contact'); }} className="text-3xl font-black uppercase">{t('public.contact')}</button>
          <button onClick={() => { setIsMobileMenuOpen(false); scrollToSection('reservations'); }} className="mt-6 text-3xl font-black uppercase px-4" style={{ background: 'var(--accent)' }}>{t('public.reservations')}</button>
          <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-8 right-6 p-2"><X className="w-6 h-6" /></button>
        </div>
      )}

      {!menuOnly && (
        <>
          {/* Hero — asymmetric magazine cover: giant type dominates, photo is a small tucked-in tile, not full-bleed */}
          <section className="grid grid-cols-1 md:grid-cols-5 min-h-[90vh]">
            <div className="md:col-span-3 flex flex-col justify-center px-6 md:px-16 py-20 border-b-4 md:border-b-0 md:border-r-4" style={{ borderColor: 'var(--line)' }}>
              <span className="text-xs font-black uppercase tracking-[0.3em] mb-6" style={{ color: 'var(--muted)' }}>The Table Issue</span>
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-black uppercase leading-[0.85] tracking-tighter">
                {restaurant.name}
              </h1>
              <button onClick={() => scrollToSection('reservations')} className="mt-12 self-start px-9 py-4 text-sm font-black uppercase tracking-widest transition-transform hover:scale-105" style={{ background: 'var(--accent)', color: '#000' }}>
                {t('public.bookATable')} →
              </button>
            </div>
            <div className="md:col-span-2 relative min-h-[40vh] md:min-h-0">
              <img src={heroImage} className="absolute inset-0 w-full h-full object-cover grayscale contrast-125" alt={restaurant.name} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, var(--accent) 0%, transparent 40%)', mixBlendMode: 'multiply', opacity: 0.5 }} />
            </div>
          </section>

          {customization.showAboutUs && (
            <section id="about" className="grid grid-cols-1 md:grid-cols-5 border-t-4" style={{ borderColor: 'var(--line)' }}>
              <div className="md:col-span-2 relative min-h-[40vh] md:min-h-0 order-2 md:order-1 md:border-r-4" style={{ borderColor: 'var(--line)' }}>
                <img src={ABOUT_IMAGE} alt={`Inside ${restaurant.name}`} className="absolute inset-0 w-full h-full object-cover grayscale contrast-125" />
              </div>
              <div className="md:col-span-3 flex flex-col justify-center px-6 md:px-16 py-20 order-1 md:order-2">
                <span className="text-xs font-black uppercase tracking-[0.3em] mb-6" style={{ color: 'var(--muted)' }}>{t('public.ourStory')}</span>
                <p className="text-2xl md:text-4xl font-light leading-tight tracking-tight whitespace-pre-wrap">
                  {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {/* Menu — asymmetric bento grid, the layout's structural signature */}
      <section id="menu" className={cn("px-6 md:px-12 border-t-4", menuOnly ? "pt-16 pb-28" : "py-28")} style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-16 flex items-end justify-between flex-wrap gap-4">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter">Menu</h2>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Issue №{new Date().getFullYear()}</span>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-[color:var(--muted)] font-light">The menu is currently being updated.</p>
          ) : (
            <div className="space-y-16">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id}>
                  <h3 className="text-xl font-black uppercase tracking-widest mb-6 pb-3 border-b-4" style={{ borderColor: 'var(--line)' }}>{cat.name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-[minmax(120px,auto)] gap-4">
                    {cat.items?.map((item: any, i: number) => (
                      <div key={item.id} className={cn("p-6 border-2 border-black", tileSpan(i), i % 5 === 0 ? "bg-black text-white" : "")}
                        style={i % 5 === 0 ? { borderColor: 'var(--accent)' } : {}}>
                        {renderMenuItem(item, i % 5 === 0)}
                      </div>
                    ))}
                  </div>
                  {cat.children && cat.children.length > 0 && (
                    <div className="mt-8 space-y-8">
                      {cat.children.map((sub: any) => (
                        <div key={sub.id}>
                          <h4 className="text-sm font-black uppercase tracking-widest mb-4" style={{ color: 'var(--muted)' }}>{sub.name}</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {sub.items?.map((item: any) => (
                              <div key={item.id} className="p-6 border-2 border-black">{renderMenuItem(item)}</div>
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
            <div className="mt-16 text-xs font-bold text-[color:var(--muted)] uppercase tracking-widest">
              Son Fiyat Güncelleme Tarihi: {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      </section>

      {menuOnly && (
        <footer className="border-t-4 px-6 py-16 text-center md:px-12" style={{ borderColor: 'var(--line)' }}>
          <h2 className="mb-6 text-3xl font-black uppercase tracking-tighter">{restaurant.name}</h2>
          {hasContactInfo && (
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-light text-[color:var(--muted)]">
              {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:opacity-60">{restaurant.contactPhone}</a>}
              {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:opacity-60">{restaurant.contactEmail}</a>}
            </div>
          )}
          <Link href={`/r/${slug}?view=booking`} className="inline-block mt-8 px-6 py-2.5 text-xs font-black uppercase tracking-widest" style={{ background: 'var(--accent)', color: '#000' }}>
            {t('public.bookATable')}
          </Link>
          <p className="mt-10 text-xs text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
        </footer>
      )}

      {!menuOnly && (
        <>
          <section id="contact" className="py-28 px-6 md:px-12 text-center max-w-4xl mx-auto border-t-4" style={{ borderColor: 'var(--line)' }}>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-12">{restaurant.name}</h2>
            {hasContactInfo && (
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-light text-[color:var(--muted)]">
                {restaurant.contactPhone && <a href={`tel:${restaurant.contactPhone}`} className="hover:opacity-60">{restaurant.contactPhone}</a>}
                {restaurant.contactEmail && <a href={`mailto:${restaurant.contactEmail}`} className="hover:opacity-60">{restaurant.contactEmail}</a>}
              </div>
            )}
            {customization.showLegal && customization.legalText && (
              <div className="mt-20 pt-10 border-t-4 text-xs text-[color:var(--muted)] font-light text-left max-w-2xl mx-auto space-y-4" style={{ borderColor: 'var(--line)' }}>
                <h4 className="text-xs font-black uppercase tracking-widest mb-2 text-center">Legal Terms</h4>
                <div className="whitespace-pre-wrap">{customization.legalText}</div>
              </div>
            )}
            <p className="mt-12 text-xs text-[color:var(--muted)]">© {new Date().getFullYear()} {restaurant.name}</p>
          </section>

          <section id="reservations" className="py-28 px-6 md:px-12 border-t-4" style={{ borderColor: 'var(--line)', background: 'var(--text)', color: 'var(--bg)' }}>
            <div className="max-w-2xl mx-auto">
              <div className="mb-16">
                <h2 className="text-5xl md:text-6xl font-black uppercase tracking-tighter">Book It</h2>
              </div>

              {isBookingSuccess ? (
                <div className="py-14 animate-in zoom-in border-2 p-10" style={{ borderColor: 'var(--accent)' }}>
                  <CheckCircle2 className="w-14 h-14 mb-6" style={{ color: 'var(--accent)' }} />
                  <h3 className="text-3xl font-black uppercase mb-4">{isPossiblyFullyBooked ? 'Request Received' : 'Table Locked In'}</h3>
                  <p className="font-light text-base opacity-80">See you soon.</p>
                  {confirmationCode && (
                    <div className="mt-8 flex max-w-xs flex-col items-start border-2 px-6 py-4" style={{ borderColor: 'var(--accent)' }}>
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">{t('public.confirmationCodeLabel')}</span>
                      <span className="mt-1 text-3xl font-black tracking-[0.15em]" style={{ color: 'var(--accent)' }}>{confirmationCode}</span>
                      <span className="mt-2 text-[10px] font-light opacity-60">{t('public.confirmationCodeHint')}</span>
                    </div>
                  )}
                  {isPossiblyFullyBooked && (
                    <div className="mt-8 border-2 border-amber-400 p-4 text-sm font-light text-amber-300">
                      Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                    </div>
                  )}
                </div>
              ) : isWaitlistSuccess ? (
                <div className="py-14 animate-in zoom-in border-2 p-10" style={{ borderColor: 'var(--accent)' }}>
                  <CheckCircle2 className="w-14 h-14 mb-6" style={{ color: 'var(--accent)' }} />
                  <h3 className="text-3xl font-black uppercase mb-4">Waitlist Joined</h3>
                  <p className="font-light text-base opacity-80">We will notify you if a table becomes available.</p>
                </div>
              ) : (
                <form onSubmit={handleBooking} className="space-y-10 p-8 md:p-10 border-2" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                  {restaurant.customization?.reservationInfoText && (
                    <div className="text-base font-light opacity-90 space-y-2 [&>p]:mb-2 [&>a]:underline" dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                  )}
                  {restaurant.customization?.reservationWarningText && (
                    <div className="p-6 border-l-4 text-base font-light space-y-2 [&>p]:mb-2 [&>a]:underline" style={{ borderColor: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                  )}

                  <div className="space-y-4">
                    <Label className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Date</Label>
                    <div className="border-2 p-4" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                      <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--accent)" accentText="#000000" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Time</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[...times.lunch, ...times.dinner].map(tm => (
                        <button key={tm} type="button" onClick={() => setSelectedTime(tm)} className={cn("h-11 border-2 text-sm font-bold transition-all", selectedTime === tm ? "text-black" : "hover:opacity-70")}
                          style={selectedTime === tm ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'rgba(255,255,255,0.15)' }}>
                          {tm}
                        </button>
                      ))}
                    </div>
                  </div>

                  {checkingDay ? (
                    <div className="flex items-center gap-3 border-l-4 p-6 text-base font-light" style={{ borderColor: 'var(--accent)' }}>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20" style={{ borderTopColor: 'var(--accent)' }} /> Checking availability for <strong>{selectedDateLabel}</strong>...
                    </div>
                  ) : dayStatus?.daySetting?.isFullyBooked ? (
                    <div className="border-l-4 border-amber-400 bg-amber-400/10 p-6 text-base font-light text-amber-200 flex items-start gap-4">
                      <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-300" />
                      <div>
                        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-amber-300">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-black uppercase text-lg text-amber-200">Fully Booked (Waitlist Open)</strong>
                        We are fully booked for reservations on this day, but you can join our waitlist.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                    <div className="border-l-4 border-red-400 bg-red-400/10 p-6 text-base font-light text-red-200 flex items-start gap-4">
                      <X className="w-5 h-5 shrink-0 mt-0.5 text-red-300" />
                      <div>
                        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-red-300">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-black uppercase text-lg text-red-200">Reservations Closed</strong>
                        Unfortunately, we&apos;re not accepting reservations for this day.
                      </div>
                    </div>
                  ) : dayStatus?.daySetting?.autoConfirm ? (
                    <div className="border-l-4 p-6 text-base font-light flex items-start gap-4" style={{ borderColor: 'var(--accent)', background: 'rgba(234,255,0,0.08)' }}>
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                      <div>
                        <span className="mb-1 block text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>{selectedDateLabel}</span>
                        <strong className="block mb-2 font-black uppercase text-lg" style={{ color: 'var(--accent)' }}>Immediate Booking</strong>
                        Your table will be confirmed automatically.
                      </div>
                    </div>
                  ) : dayStatus ? (
                    <div className="border-l-4 border-sky-400 bg-sky-400/10 p-6 text-base font-light text-sky-200 flex items-start gap-4">
                      <CalendarIcon className="w-5 h-5 shrink-0 mt-0.5 text-sky-300" />
                      <div>
                        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-sky-300">{selectedDateLabel}</span>
                        <strong className="block mb-2 font-black uppercase text-lg text-sky-200">Confirmation Queue</strong>
                        This date requires manual staff review. You&apos;ll receive a notification.
                      </div>
                    </div>
                  ) : null}

                  {dayStatus?.daySetting?.isCapacityFull && (
                    <div className="border-l-4 border-amber-400 bg-amber-400/10 p-4 text-sm font-light text-amber-200 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                      <div>
                        <p className="mb-0.5 font-black uppercase text-amber-200">{t('public.capacityFullTitle')}</p>
                        <p>{t('public.capacityFullDesc')}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 text-center">
                    <Label className="block text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Guests</Label>
                    <div className="flex flex-wrap justify-center gap-2">
                      {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                        <button key={n} type="button" onClick={() => setResForm({ ...resForm, guestCount: String(n) })}
                          className={cn("h-11 w-11 border-2 text-base font-bold transition-all", resForm.guestCount === String(n) ? "text-black scale-105" : "hover:opacity-70")}
                          style={resForm.guestCount === String(n) ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'rgba(255,255,255,0.15)' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Name</Label>
                      <Input required value={resForm.customerName} onChange={e => setResForm({ ...resForm, customerName: e.target.value })}
                        className="border-2 rounded-none h-14 px-4 text-base bg-transparent text-white" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Phone</Label>
                      <Input required value={resForm.customerPhone} onChange={e => setResForm({ ...resForm, customerPhone: e.target.value })}
                        className="border-2 rounded-none h-14 px-4 text-base bg-transparent text-white" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
                    </div>
                  </div>

                  <button type="submit" disabled={checkingDay || (dayStatus?.daySetting?.isReservationEnabled === false && !dayStatus?.daySetting?.isFullyBooked)}
                    className="w-full h-16 text-lg font-black uppercase tracking-widest mt-8 disabled:opacity-40 transition-all hover:scale-[1.01] text-black"
                    style={{ background: 'var(--accent)' }}>
                    {dayStatus?.daySetting?.isFullyBooked ? 'Join Waitlist' : 'Reserve Now →'}
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
