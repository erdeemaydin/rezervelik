'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from "@/i18n/provider";
import { Utensils, Calendar as CalendarIcon, ChevronDown, CheckCircle2, X, Clock } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/provider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

export default function PremiumLayout({ slug, initialRestaurant }: { slug: string, initialRestaurant: any }) {
  const { t } = useTranslation();
  const [restaurant, setRestaurant] = useState<any>(initialRestaurant);
  const [loading, setLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Booking State
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);
  const [isWaitlistSuccess, setIsWaitlistSuccess] = useState(false);
  const [isBookingSuccess, setIsBookingSuccess] = useState(false);

  const getLocalYYYYMMDD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const [selectedDate, setSelectedDate] = useState(getLocalYYYYMMDD(new Date()));
  const [selectedTime, setSelectedTime] = useState('19:30');
  const [resForm, setResForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    guestCount: '2',
    notes: ''
  });

  useEffect(() => {
    setRestaurant(initialRestaurant);
  }, [initialRestaurant]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [slug]);

  useEffect(() => {
    if (isBookingOpen) checkDayStatus(selectedDate);
  }, [selectedDate, isBookingOpen]);

  const fetchRestaurant = async () => {
    try {
      const res = await axios.get(`${API_URL}/public/restaurant/${slug}`);
      setRestaurant(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

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
      await axios.post(`${API_URL}/reservations`, 
        { 
          ...resForm, 
          guestCount: parseInt(resForm.guestCount),
          startTime: combinedDateTime.toISOString()
        },
        { headers: { 'X-Restaurant-ID': restaurant.id } }
      );
      setIsBookingSuccess(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to book');
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;
  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-medium">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80&w=2000";

  const customization = restaurant?.customization || {
      layoutStyle: 'EDITORIAL_IMAGE',
      typography: 'SERIF',
      colorPalette: 'OBSIDIAN',
  };

  const getFontClass = (type: string) => {
      switch(type) {
          case 'SANS': return 'font-sans';
          case 'MONO': return 'font-mono uppercase tracking-widest';
          case 'SERIF':
          default: return 'font-serif';
      }
  };

  const getPaletteClasses = (palette: string) => {
      switch(palette) {
          case 'EARTH': return 'bg-[#1c1917] text-[#f5f5f4] selection:bg-[#44403c]'; // Warm dark
          case 'PEARL': return 'bg-[#0f172a] text-[#f8fafc] selection:bg-[#334155]'; // Cool dark
          case 'OBSIDIAN':
          default: return 'bg-zinc-950 text-zinc-100 selection:bg-zinc-800'; // Default dark
      }
  };

  const getNavClasses = (palette: string) => {
      switch(palette) {
          case 'EARTH': return 'bg-[#1c1917]/90';
          case 'PEARL': return 'bg-[#0f172a]/90';
          case 'OBSIDIAN':
          default: return 'bg-zinc-950/90';
      }
  };

  const getSectionBg = (palette: string) => {
      switch(palette) {
          case 'EARTH': return 'bg-[#292524]/50';
          case 'PEARL': return 'bg-[#1e293b]/50';
          case 'OBSIDIAN':
          default: return 'bg-zinc-900/50';
      }
  };

  const fontClass = getFontClass(customization.typography);
  const paletteClasses = getPaletteClasses(customization.colorPalette);
  const navBg = getNavClasses(customization.colorPalette);
  const sectionBg = getSectionBg(customization.colorPalette);
  const isAnimated = customization.layoutStyle === 'ANIMATED';

  return (
    <div className={cn("min-h-screen selection:text-white", paletteClasses, fontClass)}>
      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 w-full z-50 transition-all duration-700 px-6 md:px-12 py-6 flex items-center justify-between",
        scrolled ? cn(navBg, "backdrop-blur-md py-4 shadow-lg") : "bg-transparent"
      )}>
        <div className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.2em] uppercase">
          <button onClick={() => scrollToSection('about')} className="hover:text-zinc-400 transition-colors">{t('public.ourStory')}</button>
          <button onClick={() => scrollToSection('menu')} className="hover:text-zinc-400 transition-colors">{t('public.menu')}</button>
        </div>
        
        <div className={cn("text-xl md:text-2xl tracking-widest text-center flex-1 md:flex-none", customization.typography !== 'MONO' && 'uppercase')}>
          {restaurant.name}
        </div>

        <div className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.2em] uppercase">
          <LanguageSwitcher />
          <button onClick={() => scrollToSection('contact')} className="hover:text-zinc-400 transition-colors">{t('public.contact')}</button>
          <button onClick={() => setIsBookingOpen(true)} className="border border-zinc-100 px-5 py-2 hover:bg-zinc-100 hover:text-zinc-900 transition-all">
            {t('public.reservations')}
          </button>
        </div>
      </nav>

      {/* Announcement Banner */}
      {customization.announcementText && (
        <div className="fixed top-20 w-full z-40 flex justify-center px-4 animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs md:text-sm px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-medium tracking-wide">{customization.announcementText}</span>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-zinc-950 z-10" />
          <img src={bgImage} className="w-full h-full object-cover scale-105 animate-in zoom-in duration-[20s]" alt="Atmosphere" />
        </div>
        
        <div className="relative z-20 text-center px-4 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          <span className="text-xs tracking-[0.4em] uppercase text-zinc-300 mb-6">{t('public.aCulinaryJourney')}</span>
          <h1 className={cn("text-5xl md:text-7xl lg:text-9xl tracking-tight mb-8", isAnimated && "animate-pulse")}>
            {restaurant.name}
          </h1>
          <button onClick={() => setIsBookingOpen(true)} className="text-xs font-medium tracking-[0.2em] uppercase border-b border-zinc-100 pb-1 hover:text-zinc-400 hover:border-zinc-400 transition-all">
            {t('public.bookATable')}
          </button>
        </div>

        <button onClick={() => scrollToSection('about')} className="absolute bottom-12 z-20 animate-bounce">
          <ChevronDown className="w-6 h-6 text-zinc-400" />
        </button>
      </section>

      {/* About */}
      {customization.showAboutUs && (
        <section id="about" className="py-32 px-6 md:px-12 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-8 text-center md:text-left">
            <h2 className="text-3xl md:text-5xl">Our Story</h2>
            <p className="text-zinc-400 leading-relaxed font-light text-lg whitespace-pre-wrap">
              {customization.aboutUsText || 'Welcome to our restaurant. We are passionate about delivering exceptional culinary experiences.'}
            </p>
          </div>
          <div className="flex-1 w-full aspect-[4/5] bg-zinc-900 relative overflow-hidden">
            <img src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=80&w=800" className="absolute inset-0 w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity duration-700" alt="Chef plating" />
          </div>
        </section>
      )}

      <section id="menu" className={cn("py-32 px-6 md:px-12", sectionBg)}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-24">
            <span className="text-xs tracking-[0.3em] uppercase text-zinc-500 mb-4 block">Gastronomy</span>
            <h2 className="text-4xl md:text-6xl">The Menu</h2>
          </div>

          {!restaurant.menus?.[0] ? (
            <p className="text-center text-zinc-500">The seasonal menu is currently being curated.</p>
          ) : (
            <div className="space-y-24">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id}>
                  <h3 className="text-xl text-center uppercase tracking-widest mb-12 opacity-80">{cat.name}</h3>
                  <div className="space-y-8">
                    {cat.items.map((item: any) => (
                      <div key={item.id} className="group relative">
                        <div className="flex items-baseline justify-between gap-4">
                          <h4 className="text-base font-medium tracking-wide uppercase text-zinc-100">{item.name}</h4>
                          <div className="flex-1 border-b border-dashed border-zinc-700 relative top-[-6px]" />
                          <span className="text-base opacity-90">
                            {item.price.toLocaleString('tr-TR')} ₺
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-sm text-zinc-500 mt-2 font-light max-w-xl">{item.description}</p>
                        )}
                        {item.ingredients && (
                          <p className="text-xs text-zinc-400 mt-1 font-light max-w-xl"><span className="font-medium">{t('public.ingredients')}:</span> {item.ingredients}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.calories && <span className="text-[10px] uppercase tracking-wider text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">{item.calories} {t('public.calories')}</span>}
                          {item.containsAlcohol && <span className="text-[10px] uppercase tracking-wider text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">{t('public.containsAlcohol')}</span>}
                          {item.containsPork && <span className="text-[10px] uppercase tracking-wider text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded-full">{t('public.containsPork')}</span>}
                          {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                              <span key={i} className="text-[10px] uppercase tracking-wider text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">{tag.trim()}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer / Contact */}
      <section id="contact" className="py-32 px-6 md:px-12 text-center max-w-4xl mx-auto border-t border-white/10">
        <h2 className="text-3xl mb-12">{restaurant.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-sm font-light text-zinc-400">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-100 mb-4">Location</h4>
            <p>123 Culinary Avenue<br />Gourmet District<br />Istanbul, Turkey</p>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-100 mb-4">Contact</h4>
            <p>{restaurant.contactEmail}<br />+90 555 000 0000</p>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-100 mb-4">Hours</h4>
            <p>Tue - Sun: 18:00 - 23:30<br />Monday: Closed</p>
          </div>
        </div>
        
        {customization.showLegal && customization.legalText && (
          <div className="mt-24 pt-12 border-t border-white/5 text-xs text-zinc-500 font-light text-left max-w-2xl mx-auto space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2 text-center">Legal Terms</h4>
            <div className="whitespace-pre-wrap">{customization.legalText}</div>
          </div>
        )}
      </section>

      {/* Reservation Dialog */}
      <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
        <DialogContent className="sm:max-w-[500px] bg-zinc-950 border border-zinc-800 text-zinc-100 p-0 overflow-hidden rounded-none">
          <div className="p-8 md:p-12">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-serif">Reservations</h2>
              <button onClick={() => setIsBookingOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {isBookingSuccess ? (
              <div className="text-center py-12 animate-in zoom-in">
                <CheckCircle2 className="w-16 h-16 text-zinc-100 mx-auto mb-6" />
                <h3 className="text-xl font-serif mb-2">Reservation Confirmed</h3>
                <p className="text-zinc-400 font-light text-sm">We look forward to welcoming you.</p>
              </div>
            ) : isWaitlistSuccess ? (
              <div className="text-center py-12 animate-in zoom-in">
                <CheckCircle2 className="w-16 h-16 text-zinc-100 mx-auto mb-6" />
                <h3 className="text-xl font-serif mb-2">Waitlist Joined</h3>
                <p className="text-zinc-400 font-light text-sm">We will notify you if a table becomes available.</p>
              </div>
            ) : (
              <form onSubmit={handleBooking} className="space-y-8">
                {restaurant.customization?.reservationInfoText && (
                    <div className="text-sm font-light text-zinc-400 space-y-2 [&>p]:mb-2 [&>a]:text-zinc-200 [&>a]:underline" 
                         dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                )}
                {restaurant.customization?.reservationWarningText && (
                    <div className="p-4 bg-zinc-900 border-l-2 border-zinc-500 text-sm font-light text-zinc-200 space-y-2 [&>p]:mb-2 [&>a]:underline" 
                         dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                )}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-500">Date</Label>
                    <Input 
                      type="date" 
                      required 
                      value={selectedDate} 
                      onChange={e => setSelectedDate(e.target.value)}
                      className="bg-zinc-900 border-none text-white rounded-none h-12 focus-visible:ring-1 focus-visible:ring-zinc-700" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-500">Time</Label>
                    <Input 
                      type="time" 
                      required 
                      value={selectedTime} 
                      onChange={e => setSelectedTime(e.target.value)}
                      className="bg-zinc-900 border-none text-white rounded-none h-12 focus-visible:ring-1 focus-visible:ring-zinc-700" 
                    />
                  </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-zinc-900">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-500">Guests</Label>
                      <Input 
                        type="number" min="1" required 
                        value={resForm.guestCount} onChange={e => setResForm({...resForm, guestCount: e.target.value})}
                        className="bg-zinc-900 border-none text-white rounded-none h-12 focus-visible:ring-1 focus-visible:ring-zinc-700" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-500">Name</Label>
                      <Input 
                        required 
                        value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})}
                        className="bg-zinc-900 border-none text-white rounded-none h-12 focus-visible:ring-1 focus-visible:ring-zinc-700" 
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-500">Phone</Label>
                      <Input 
                        required 
                        value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})}
                        className="bg-zinc-900 border-none text-white rounded-none h-12 focus-visible:ring-1 focus-visible:ring-zinc-700" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-zinc-500">Email</Label>
                      <Input 
                        type="email" 
                        value={resForm.customerEmail} onChange={e => setResForm({...resForm, customerEmail: e.target.value})}
                        className="bg-zinc-900 border-none text-white rounded-none h-12 focus-visible:ring-1 focus-visible:ring-zinc-700" 
                      />
                    </div>
                  </div>
                </div>

                {checkingDay ? (
                  <div className="p-4 bg-zinc-900 border-l-2 border-zinc-500 animate-pulse text-sm font-light text-zinc-300">
                    Checking availability...
                  </div>
                ) : dayStatus?.daySetting?.isFullyBooked ? (
                  <div className="p-4 bg-amber-950/40 border-l-2 border-amber-500 text-sm font-light text-amber-100 flex items-start gap-3">
                    <Clock className="w-5 h-5 shrink-0 text-amber-500" />
                    <div>
                      <strong className="block mb-1 text-amber-500">Fully Booked (Waitlist Open)</strong>
                      We are fully booked for reservations on this day, but you can join our waitlist.
                    </div>
                  </div>
                ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                  <div className="p-4 bg-red-950/40 border-l-2 border-red-500 text-sm font-light text-red-100 flex items-start gap-3">
                    <X className="w-5 h-5 shrink-0 text-red-500" />
                    <div>
                      <strong className="block mb-1 text-red-500">Reservations Closed</strong>
                      Unfortunately, we're not accepting reservations for this day.
                    </div>
                  </div>
                ) : dayStatus?.daySetting?.autoConfirm ? (
                  <div className="p-4 bg-emerald-950/40 border-l-2 border-emerald-500 text-sm font-light text-emerald-100 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
                    <div>
                      <strong className="block mb-1 text-emerald-500">Immediate Booking</strong>
                      Your reservation will be confirmed automatically.
                    </div>
                  </div>
                ) : dayStatus ? (
                  <div className="p-4 bg-blue-950/40 border-l-2 border-blue-500 text-sm font-light text-blue-100 flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 shrink-0 text-blue-500" />
                    <div>
                      <strong className="block mb-1 text-blue-500">Confirmation Queue</strong>
                      This date requires manual staff review. You'll receive a notification.
                    </div>
                  </div>
                ) : null}

                <Button 
                  type="submit" 
                  disabled={checkingDay || dayStatus?.daySetting?.isReservationEnabled === false} 
                  className="w-full h-14 bg-white hover:bg-zinc-200 text-zinc-950 font-medium tracking-[0.1em] uppercase rounded-none mt-8 disabled:opacity-50 disabled:hover:bg-white"
                >
                  {dayStatus?.daySetting?.isFullyBooked ? 'Join Waitlist' : 'Request Table'}
                </Button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
