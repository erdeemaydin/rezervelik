'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Utensils, Calendar as CalendarIcon, Clock, ChevronRight, ChevronDown, ArrowLeft, MapPin, Phone, Info, Sparkles, CheckCircle2, XCircle, Flame, Leaf, Hourglass, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getTimeSuggestions } from '@/lib/reservationSuggestions';
import ReservationCalendar from './ReservationCalendar';
import { getTodayInTZ, zonedWallTimeToUTC, DEFAULT_TZ } from '@/lib/datetime';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

const HERO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1600';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&q=80&w=1200';
const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?auto=format&fit=crop&q=80&w=800',
];

type ViewState = 'welcome' | 'menu' | 'booking' | 'success';

export default function ClassicLayout({ slug, initialRestaurant, initialView = 'welcome', menuOnly = false }: { slug: string, initialRestaurant: any, initialView?: string, menuOnly?: boolean }) {
  const { t } = useTranslation();
  const restaurant = initialRestaurant;
  const [view, setView] = useState<ViewState>(menuOnly ? 'menu' : (initialView as ViewState));

  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);
  const [isWaitlistSuccess, setIsWaitlistSuccess] = useState(false);
  const [isPossiblyFullyBooked, setIsPossiblyFullyBooked] = useState(false);

  const [resForm, setResForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    guestCount: '2',
    notes: ''
  });

  const tz = restaurant?.settings?.timezone || DEFAULT_TZ;

  const [selectedDate, setSelectedDate] = useState(getTodayInTZ(tz));
  const [selectedTime, setSelectedTime] = useState('19:30');

  const checkDayStatus = async (date: string) => {
      try {
          setCheckingDay(true);
          const res = await axios.get(`${API_URL}/public/day-status`, {
              params: { slug, date }
          });
          setDayStatus(res.data.data);
      } catch (err) {
          console.error(err);
      } finally {
          setCheckingDay(false);
      }
  };

  useEffect(() => {
    if (view === 'booking') checkDayStatus(selectedDate);
  }, [selectedDate, view]);

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
          notes: `Requested Time: ${selectedTime}`
        });
        setIsWaitlistSuccess(true);
        setView('success');
        setResForm({ customerName: '', customerPhone: '', customerEmail: '', guestCount: '2', notes: '' });
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
      setView('success');
      setResForm({ customerName: '', customerPhone: '', customerEmail: '', guestCount: '2', notes: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to book');
    }
  };

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-500 font-medium">Restaurant not found.</div>;

  const getWaitTimeText = () => {
      const s = restaurant?.waitTimeConfig;
      if (!s || !s.isWaitTimeEnabled) return null;
      if (s.isWaitTimeCalculated) {
          const lower = s.peopleWaiting * s.waitTimePerPersonLower;
          const upper = s.peopleWaiting * s.waitTimePerPersonUpper;
          if (lower === 0 && upper === 0) return 'No wait time';
          if (lower === upper) return `~${lower} min wait`;
          return `~${lower}-${upper} min wait`;
      } else {
          if (!s.manualWaitTimeLower && !s.manualWaitTimeUpper) return 'No wait time';
          if (s.manualWaitTimeLower && !s.manualWaitTimeUpper) return `~${s.manualWaitTimeLower} min wait`;
          if (!s.manualWaitTimeLower && s.manualWaitTimeUpper) return `~${s.manualWaitTimeUpper} min wait`;
          if (s.manualWaitTimeLower === s.manualWaitTimeUpper) return `~${s.manualWaitTimeLower} min wait`;
          return `~${s.manualWaitTimeLower}-${s.manualWaitTimeUpper} min wait`;
      }
  };

  const times = getTimeSuggestions();
  const maxPartySize = restaurant?.settings?.maxPartySize || 8;
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const customization = restaurant?.customization || {
      typography: 'SANS',
      colorPalette: 'OBSIDIAN',
      primaryColor: '#0f172a',
      announcementText: null,
      showAboutUs: false,
      showLegal: false,
  };

  const getFontClass = (type: string) => {
      switch(type) {
          case 'SERIF': return 'font-serif tracking-tight';
          case 'MONO': return 'font-mono tracking-tight';
          case 'SANS':
          default: return 'font-sans';
      }
  };
  const fontClass = getFontClass(customization.typography);

  const getPalette = (preset: string) => {
      switch(preset) {
          case 'EARTH': return { bg: '#fdfbf7', text: '#292524', primary: '#5c4033', accent: '#d6d3d1' };
          case 'CRIMSON': return { bg: '#fffbfb', text: '#450a0a', primary: '#7f1d1d', accent: '#fecaca' };
          case 'OBSIDIAN':
          default: return { bg: '#ffffff', text: '#0f172a', primary: '#0f172a', accent: '#e2e8f0' };
      }
  };
  const palette = getPalette(customization.colorPalette);

  const primaryColor = customization.primaryColor && customization.primaryColor !== '#0f172a' ? customization.primaryColor : palette.primary;

  const hasContactInfo = Boolean(restaurant.contactPhone || restaurant.contactEmail);

  const renderMenuItem = (item: any) => (
    <div key={item.id} className="group flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white transition-all hover:shadow-lg hover:shadow-black/5">
      {item.imageUrl && (
        <div className="aspect-[4/3] w-full overflow-hidden bg-neutral-100">
          <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold tracking-tight text-neutral-900">{item.name}</h3>
          <span className="shrink-0 text-sm font-semibold text-[var(--primary)]">
            {item.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
          </span>
        </div>
        {item.description && <p className="text-sm leading-relaxed text-neutral-500">{item.description}</p>}
        {item.ingredients && <p className="text-xs leading-relaxed text-neutral-400"><span className="font-medium text-neutral-500">{t('public.ingredients')}:</span> {item.ingredients}</p>}
        {(item.spiceLevel > 0 || item.calories || item.containsAlcohol || item.containsPork || item.dietaryTags) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.spiceLevel > 0 && <span title={`Spice Level ${item.spiceLevel}`} className="rounded-full bg-red-50 p-1 text-red-600"><Flame className="h-3 w-3" /></span>}
            {item.calories && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">{item.calories} {t('public.calories')}</span>}
            {item.containsAlcohol && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">{t('public.containsAlcohol')}</span>}
            {item.containsPork && <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-medium text-pink-700">{t('public.containsPork')}</span>}
            {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
              <span key={i} title={tag.trim()} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"><Leaf className="h-2.5 w-2.5" /> {tag.trim()}</span>
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
        className={cn("min-h-screen selection:bg-[var(--primary)] selection:text-white transition-colors duration-500", fontClass)}
        style={{
            '--primary': primaryColor,
            '--primary-hover': primaryColor + 'e6',
            backgroundColor: palette.bg,
            color: palette.text
        } as React.CSSProperties}
    >
      {customization.announcementText && (
          <div className="w-full bg-[var(--primary)] text-white text-xs font-medium text-center py-2 px-4 sticky top-0 z-50">
              {customization.announcementText}
          </div>
      )}

      {/* Welcome View */}
      {view === 'welcome' && (
        <div className="animate-in fade-in duration-500">
          <section className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0">
              <img
                src={restaurant.logoUrl || HERO_IMAGE_FALLBACK}
                className="w-full h-full object-cover"
                alt={restaurant.name}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10"></div>
            </div>

            <div className="relative z-10 flex flex-col items-center px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                <Badge className="bg-white/15 text-white border-0 backdrop-blur-md px-3 py-1 text-[11px] font-medium tracking-wide">
                  <Sparkles className="mr-1.5 h-3 w-3" /> {restaurant.name}
                </Badge>
                {getWaitTimeText() && (
                  <Badge className="bg-amber-500/90 text-white border-0 backdrop-blur-md px-3 py-1 text-[11px] font-medium tracking-wide">
                    <Hourglass className="mr-1.5 h-3 w-3" /> {getWaitTimeText()}
                  </Badge>
                )}
              </div>
              <h1 className="text-5xl md:text-7xl font-semibold text-white tracking-tight mb-6 leading-[1.05]">
                {restaurant.name}
              </h1>
              <p className="max-w-xl text-lg text-white/70 font-light mb-10">
                A refined table, a thoughtful menu, and a warm welcome.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => setView('menu')} size="lg" className="h-14 w-full rounded-full bg-white text-neutral-900 px-8 text-base font-medium hover:bg-neutral-100 sm:w-auto">
                  <Utensils className="mr-2 h-4 w-4" /> {t('public.menu')}
                </Button>
                <Button onClick={() => setView('booking')} size="lg" className="h-14 w-full rounded-full bg-[var(--primary)] px-8 text-base font-medium text-white hover:bg-[var(--primary-hover)] sm:w-auto">
                  <CalendarIcon className="mr-2 h-4 w-4" /> {t('public.bookATable')}
                </Button>
              </div>
            </div>

            <button
              onClick={() => document.getElementById('cl-below-fold')?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-8 z-10 text-white/70 hover:text-white transition-colors animate-bounce"
              aria-label="Scroll down"
            >
              <ChevronDown className="h-6 w-6" />
            </button>
          </section>

          <div id="cl-below-fold">
            {customization.showAboutUs && (
              <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-24 md:grid-cols-2 md:px-12">
                <div className="order-2 md:order-1">
                  <span className="mb-3 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">{t('public.ourStory')}</span>
                  <h2 className="mb-6 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">About {restaurant.name}</h2>
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-500">
                    {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
                  </p>
                </div>
                <div className="order-1 aspect-[4/3] w-full overflow-hidden rounded-3xl bg-neutral-100 md:order-2">
                  <img src={ABOUT_IMAGE} alt={`Inside ${restaurant.name}`} className="h-full w-full object-cover" />
                </div>
              </section>
            )}

            <section className="mx-auto max-w-6xl px-6 py-16 md:px-12">
              <div className="mb-10 flex items-end justify-between">
                <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Signature Dishes</h2>
                <button onClick={() => setView('menu')} className="hidden items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline sm:flex">
                  {t('public.menu')} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {GALLERY_IMAGES.map((src, i) => (
                  <div key={i} className="aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
                    <img src={src} alt="Signature dish" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                  </div>
                ))}
              </div>
            </section>

            <footer className="border-t border-black/5 px-6 py-16 md:px-12">
              <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center">
                <h3 className="text-xl font-semibold tracking-tight text-neutral-900">{restaurant.name}</h3>
                {hasContactInfo && (
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-500">
                    {restaurant.contactPhone && (
                      <a href={`tel:${restaurant.contactPhone}`} className="flex items-center gap-2 hover:text-neutral-900">
                        <Phone className="h-3.5 w-3.5" /> {restaurant.contactPhone}
                      </a>
                    )}
                    {restaurant.contactEmail && (
                      <a href={`mailto:${restaurant.contactEmail}`} className="flex items-center gap-2 hover:text-neutral-900">
                        <MapPin className="h-3.5 w-3.5" /> {restaurant.contactEmail}
                      </a>
                    )}
                  </div>
                )}
                {customization.showLegal && customization.legalText && (
                  <div className="mt-6 max-w-2xl whitespace-pre-wrap border-t border-black/5 pt-6 text-xs leading-relaxed text-neutral-400">
                    {customization.legalText}
                  </div>
                )}
                <p className="text-xs text-neutral-400">© {new Date().getFullYear()} {restaurant.name}</p>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Menu View */}
      {view === 'menu' && (
        <div className="animate-in fade-in duration-300 min-h-screen flex flex-col" style={{ backgroundColor: palette.bg }}>
          <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-black/5 shrink-0">
            <div className="px-4 h-16 flex items-center justify-between sm:px-6">
                {menuOnly ? (
                    <Button
                        variant="ghost"
                        nativeButton={false}
                        className="font-medium text-neutral-500 hover:text-neutral-900"
                        render={<Link href={`/r/${slug}`} />}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" /> {restaurant.name}
                    </Button>
                ) : (
                    <Button variant="ghost" onClick={() => setView('welcome')} className="font-medium text-neutral-500 hover:text-neutral-900">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                )}

                <div className="flex flex-col items-center">
                    <div className="text-lg font-semibold tracking-tight text-neutral-900">{restaurant.name}</div>
                    {getWaitTimeText() && (
                        <div className="flex items-center mt-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                            <Hourglass className="w-3 h-3 mr-1" /> {getWaitTimeText()}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                  <LanguageSwitcher />
                  <Button onClick={() => setView('booking')} className="rounded-full bg-[var(--primary)] px-5 text-white hover:bg-[var(--primary-hover)]">{t('public.bookATable')}</Button>
                </div>
            </div>

            {restaurant.menus?.[0]?.categories && (
                <div className="flex overflow-x-auto hide-scrollbar gap-2 border-t border-black/5 px-4 py-3 sm:px-6">
                    {restaurant.menus[0].categories.map((cat: any) => (
                        <Button
                            key={`nav-${cat.id}`}
                            variant="outline"
                            className="shrink-0 rounded-full border-black/10 text-xs font-medium text-neutral-600 hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)]"
                            onClick={() => {
                                const el = document.getElementById(`cat-${cat.id}`);
                                if (el) {
                                    const y = el.getBoundingClientRect().top + window.scrollY - 130;
                                    window.scrollTo({ top: y, behavior: 'smooth' });
                                }
                            }}
                        >
                            {cat.name}
                        </Button>
                    ))}
                </div>
            )}
          </header>

          <main className="flex-1 max-w-5xl mx-auto w-full py-10 px-4 sm:px-6 pb-24">
            {!restaurant.menus?.[0] ? (
                <div className="text-center text-neutral-400 font-medium mt-20">Menu is currently being updated.</div>
            ) : (
                <div className="space-y-16">
                    {restaurant.menus[0].categories.map((cat: any) => (
                        <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-32">
                            <div className="mb-6 flex items-center justify-between border-b border-black/5 pb-3">
                                <h2 className="text-xl font-semibold tracking-tight" style={{ color: primaryColor }}>{cat.name}</h2>
                            </div>

                            {cat.items && cat.items.length > 0 && (
                                <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                    {cat.items.map((item: any) => renderMenuItem(item))}
                                </div>
                            )}

                            {cat.children && cat.children.length > 0 && (
                                <div className="space-y-10">
                                    {cat.children.map((sub: any) => (
                                        <div key={sub.id}>
                                            <h3 className="mb-4 text-base font-semibold tracking-tight text-neutral-700">{sub.name}</h3>
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
                <div className="text-center mt-12 pb-4 text-xs font-medium text-neutral-400">
                    <span className="font-semibold">Son Fiyat Güncelleme Tarihi:</span> {new Date(restaurant.menus[0].updatedAt).toLocaleDateString('tr-TR')}
                </div>
            )}
          </main>
        </div>
      )}

      {/* Booking View */}
      {view === 'booking' && (
        <div className="animate-in fade-in duration-300 min-h-screen flex flex-col" style={{ backgroundColor: palette.bg }}>
          <header className="bg-white/85 backdrop-blur-xl border-b border-black/5 px-4 h-16 flex items-center justify-between shrink-0 sm:px-6">
            <Button variant="ghost" onClick={() => setView(menuOnly ? 'menu' : 'welcome')} className="font-medium text-neutral-500 hover:text-neutral-900">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <div className="flex flex-col items-center">
                <div className="text-base font-semibold tracking-tight text-neutral-900">Secure Your Table</div>
                {getWaitTimeText() && (
                    <div className="flex items-center mt-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                        <Hourglass className="w-3 h-3 mr-1" /> {getWaitTimeText()}
                    </div>
                )}
            </div>

            <LanguageSwitcher />
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="rounded-3xl border border-black/5 bg-white p-8 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                                <Utensils className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold tracking-tight text-neutral-900">{restaurant.name}</h2>
                                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Reservation</p>
                            </div>
                        </div>

                        {hasContactInfo && (
                          <div className="space-y-3 border-t border-black/5 pt-4">
                              {restaurant.contactPhone && (
                                <div className="flex items-center gap-3 text-sm font-medium text-neutral-600">
                                    <Phone className="h-4 w-4 text-neutral-400" /> {restaurant.contactPhone}
                                </div>
                              )}
                              {restaurant.contactEmail && (
                                <div className="flex items-center gap-3 text-sm font-medium text-neutral-600">
                                    <MapPin className="h-4 w-4 text-neutral-400" /> {restaurant.contactEmail}
                                </div>
                              )}
                          </div>
                        )}
                    </div>

                    {checkingDay ? (
                        <div className="h-24 animate-pulse rounded-3xl bg-neutral-100"></div>
                    ) : dayStatus?.daySetting?.isFullyBooked === true ? (
                        <div className="flex items-start gap-4 rounded-3xl bg-amber-500 p-6 text-white animate-in fade-in duration-300">
                            <Clock className="h-5 w-5 shrink-0 mt-1" />
                            <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">{selectedDateLabel}</p>
                                <p className="mb-1.5 font-semibold leading-none">Fully Booked (Waitlist Open)</p>
                                <p className="text-sm font-medium opacity-90">We are fully booked for reservations on this day, but you can join our online waitlist to be notified if a table opens up.</p>
                            </div>
                        </div>
                    ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                        <div className="flex items-start gap-4 rounded-3xl bg-red-500 p-6 text-white animate-in fade-in duration-300">
                            <XCircle className="h-5 w-5 shrink-0 mt-1" />
                            <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">{selectedDateLabel}</p>
                                <p className="mb-1.5 font-semibold leading-none">Sold Out / Closed</p>
                                <p className="text-sm font-medium opacity-90">Unfortunately we&apos;re closed to the reservations for that day.</p>
                            </div>
                        </div>
                    ) : dayStatus?.daySetting?.autoConfirm === true ? (
                        <div className="flex items-start gap-4 rounded-3xl bg-emerald-500 p-6 text-white animate-in fade-in duration-300">
                            <CheckCircle2 className="h-5 w-5 shrink-0 mt-1" />
                            <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">{selectedDateLabel}</p>
                                <p className="mb-1.5 font-semibold leading-none">Immediate Booking</p>
                                <p className="text-sm font-medium opacity-90">Good news! We have a table for you. Your reservation will be confirmed automatically.</p>
                            </div>
                        </div>
                    ) : (
                         <div className="flex items-start gap-4 rounded-3xl bg-blue-500 p-6 text-white animate-in fade-in duration-300">
                            <Info className="h-5 w-5 shrink-0 mt-1" />
                            <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">{selectedDateLabel}</p>
                                <p className="mb-1.5 font-semibold leading-none">Confirmation Queue</p>
                                <p className="text-sm font-medium opacity-90">This date requires manual staff review. You&apos;ll receive a notification once confirmed.</p>
                            </div>
                         </div>
                    )}
                </div>

                <div className="lg:col-span-3">
                    <form onSubmit={handleBooking} className="space-y-8 rounded-3xl border border-black/5 bg-white p-6 sm:p-10">
                        {restaurant.customization?.reservationInfoText && (
                            <div className="text-sm text-neutral-500 space-y-2 [&>p]:mb-2 [&>a]:text-[var(--primary)] [&>a]:underline"
                                 dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                        )}
                        {restaurant.customization?.reservationWarningText && (
                            <div className="rounded-2xl border-l-2 border-amber-500 bg-amber-50 p-4 text-sm font-medium text-amber-700 space-y-2 [&>p]:mb-2 [&>a]:underline"
                                 dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                        )}
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Full Name</Label>
                                <Input required className="h-14 rounded-2xl border-black/10 bg-neutral-50 px-5 text-base font-medium focus:bg-white focus:ring-4 focus:ring-black/5" value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})} placeholder="Ex: John Doe" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Phone Number</Label>
                                <Input required type="tel" className="h-14 rounded-2xl border-black/10 bg-neutral-50 px-5 text-base font-medium focus:bg-white focus:ring-4 focus:ring-black/5" value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})} placeholder="+90 ..." />
                            </div>
                        </div>

                        <div className="space-y-4">
                             <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Date Selection</Label>
                             <div className="rounded-2xl border border-black/10 bg-white p-4">
                                <ReservationCalendar value={selectedDate} onChange={setSelectedDate} tz={tz} accent="var(--primary)" />
                             </div>
                        </div>

                        <div className="space-y-8 border-t border-black/5 pt-8">
                            <div className="space-y-4">
                                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Preferred Time</Label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[...times.lunch, ...times.dinner].map(t => (
                                        <Button key={t} type="button" variant={selectedTime === t ? 'default' : 'outline'} className={cn("h-11 rounded-xl text-sm font-medium border-black/10", selectedTime === t ? "bg-[var(--primary)] border-[var(--primary)] text-white" : "bg-white hover:bg-neutral-50")} onClick={() => setSelectedTime(t)}>{t}</Button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Guest Count</Label>
                                <div className="flex flex-wrap gap-2">
                                    {Array.from({ length: maxPartySize }, (_, i) => i + 1).map(n => (
                                        <button key={n} type="button" onClick={() => setResForm(f => ({...f, guestCount: String(n)}))} className={cn("h-12 w-12 rounded-full border text-base font-semibold transition-all", resForm.guestCount === String(n) ? "bg-[var(--primary)] border-[var(--primary)] text-white scale-105" : "border-black/10 bg-white hover:bg-neutral-50")}>{n}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <Button type="submit" disabled={checkingDay || (dayStatus && !dayStatus.daySetting?.isReservationEnabled && dayStatus.daySetting && !dayStatus.daySetting?.isFullyBooked)} className="h-16 w-full rounded-2xl bg-[var(--primary)] text-base font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50">
                            {checkingDay ? "Checking Availability..." :
                             (dayStatus && dayStatus.daySetting?.isFullyBooked) ? "Join Waitlist for this Day" :
                             (dayStatus && !dayStatus.daySetting?.isReservationEnabled && dayStatus.daySetting) ? "Sold Out" : "Send Booking Request"}
                        </Button>
                    </form>
                </div>
            </div>
          </main>
        </div>
      )}

      {/* Success View */}
      {view === 'success' && (
          <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 animate-in fade-in duration-700">
              <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" />
              </div>
              <h1 className="mb-4 text-center text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
                  {isWaitlistSuccess ? "Added to Waitlist!" : "Reservation Request Sent!"}
              </h1>
              <div className="mb-12 max-w-lg text-center text-lg font-light leading-relaxed text-neutral-500">
                  {isWaitlistSuccess ? (
                      <>
                          You&apos;ve successfully joined the waitlist for <span className="font-medium text-neutral-900">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>. You will receive an SMS if a table becomes available.
                      </>
                  ) : (
                      <>
                          You are going to receive an SMS confirmation soon. We are excited that you chose <span className="font-medium text-neutral-900">{restaurant.name}</span>.
                      </>
                  )}
                  <p className="mt-4 text-sm font-medium uppercase tracking-wide text-emerald-600">See you soon!</p>
              </div>
              {!isWaitlistSuccess && isPossiblyFullyBooked && (
                  <div className="mb-8 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
                      Heads up — we may be fully booked around this time, so your table hasn&apos;t been assigned yet. Our team will confirm by phone shortly.
                  </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={() => { setView('menu'); setIsWaitlistSuccess(false); }} variant="outline" className="h-14 rounded-full border-black/10 px-8 text-base font-medium">
                      <Utensils className="mr-2 h-4 w-4" /> Explore Our Menu
                  </Button>
                  {menuOnly ? (
                      <Button nativeButton={false} className="h-14 rounded-full bg-[var(--primary)] px-8 text-base font-medium text-white hover:bg-[var(--primary-hover)]" render={<Link href={`/r/${slug}`} />}>
                          Return to Home
                      </Button>
                  ) : (
                      <Button onClick={() => { setView('welcome'); setIsWaitlistSuccess(false); }} className="h-14 rounded-full bg-[var(--primary)] px-8 text-base font-medium text-white hover:bg-[var(--primary-hover)]">
                          Return to Home
                      </Button>
                  )}
              </div>
          </div>
      )}

    </div>
  );
}
