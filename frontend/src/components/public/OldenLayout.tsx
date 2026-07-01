'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from "@/i18n/provider";
import { Utensils, Calendar as CalendarIcon, Clock, CheckCircle2, X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

export default function OldenLayout({ slug, initialRestaurant }: { slug: string, initialRestaurant: any }) {
  const { t } = useTranslation();
  const [restaurant, setRestaurant] = useState<any>(initialRestaurant);
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

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-white text-black font-serif">Experience not found.</div>;

  const bgImage = restaurant.logoUrl || "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=2000";

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-[#2c2c2c] font-sans selection:bg-[#8b0000] selection:text-white">
      {/* Header */}
      <header className={cn(
        "fixed top-0 w-full z-50 transition-all duration-500",
        scrolled ? "bg-white shadow-sm py-3" : "bg-transparent py-6"
      )}>
        <div className="container mx-auto px-6 lg:px-12 flex justify-between items-center">
          <div className={cn("text-2xl lg:text-3xl font-serif tracking-widest uppercase transition-colors", scrolled ? "text-[#2c2c2c]" : "text-white")}>
            {restaurant.name}
          </div>
          <nav className="hidden lg:block">
            <ul className={cn("flex space-x-12 text-sm font-semibold tracking-wider uppercase transition-colors", scrolled ? "text-[#555]" : "text-white/90")}>
              <li><button onClick={() => scrollToSection('about')} className="hover:text-[#8b0000] transition-colors">Hakkımızda</button></li>
              <li><button onClick={() => scrollToSection('menu')} className="hover:text-[#8b0000] transition-colors">Menü</button></li>
              <li><button onClick={() => setIsBookingOpen(true)} className="hover:text-[#8b0000] transition-colors">Rezervasyon</button></li>
            </ul>
          </nav>
          <div className="lg:hidden">
            <button className={cn("font-bold uppercase tracking-widest", scrolled ? "text-black" : "text-white")} onClick={() => setIsBookingOpen(true)}>Book</button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-screen w-full flex items-center justify-center">
        <div className="absolute inset-0 z-0">
           {/* Gradient overlay similar to Olden 1772 */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#561214AD] via-transparent to-transparent opacity-80 z-10" />
          <img src={bgImage} className="w-full h-full object-cover" alt="Restaurant Interior" />
        </div>
      </section>

      {/* About / Secret Room equivalent */}
      <section id="about" className="py-24 lg:py-32 px-6 lg:px-12 container mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h3 className="text-xl text-[#8b0000] font-sans font-bold tracking-widest uppercase mb-4">A New World of Old Stories</h3>
            <h2 className="text-5xl lg:text-7xl font-serif text-[#1a1a1a] leading-none mb-8">The Experience</h2>
            <p className="text-lg text-[#555] leading-relaxed mb-8">
              Welcome to our special space full of mysteries and culinary innovation. This is where {restaurant.name} opens its doors for immense friendships, celebrations, special agreements, and invitations. To build new long tables in an old story, you just need to make a reservation.
            </p>
            <div className="grid grid-cols-2 gap-4">
               <img src="https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=600" className="w-full h-48 object-cover rounded-sm shadow-sm" alt="Detail 1" />
               <img src="https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&q=80&w=600" className="w-full h-48 object-cover rounded-sm shadow-sm" alt="Detail 2" />
            </div>
          </div>
          <div>
             <img src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&q=80&w=1000" className="w-full h-[800px] object-cover rounded-sm shadow-lg" alt="Main Experience" />
          </div>
        </div>
      </section>

      {/* Magic Room equivalent */}
      <section className="py-24 lg:py-32 px-6 lg:px-12 bg-[#f4f4f4]">
        <div className="container mx-auto">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center flex-col-reverse lg:flex-row-reverse">
              <div>
                <h3 className="text-xl text-[#8b0000] font-sans font-bold tracking-widest uppercase mb-4">For Your Special Moments</h3>
                <h2 className="text-5xl lg:text-7xl font-serif text-[#1a1a1a] leading-none mb-8">Magic Room</h2>
                <p className="text-lg text-[#555] leading-relaxed mb-8">
                  There is always magic in the new world of an old story. We proudly present the "Magic Room" to our enthusiasts. Luck is not far away; it's right in the beautiful conversation set in this room.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=400" className="w-full h-32 object-cover rounded-sm" alt="Magic 1" />
                  <img src="https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80&w=400" className="w-full h-32 object-cover rounded-sm" alt="Magic 2" />
                  <img src="https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=400" className="w-full h-32 object-cover rounded-sm" alt="Magic 3" />
                </div>
              </div>
              <div>
                 <img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1000" className="w-full h-[600px] object-cover rounded-sm shadow-lg" alt="Magic Room Main" />
              </div>
           </div>
        </div>
      </section>

      {/* Menu Section */}
      <section id="menu" className="py-32 px-6 lg:px-12 container mx-auto">
         <div className="text-center mb-24">
            <h3 className="text-xl text-[#8b0000] font-sans font-bold tracking-widest uppercase mb-4">Our Flavors</h3>
            <h2 className="text-5xl lg:text-7xl font-serif text-[#1a1a1a] leading-none">Menü</h2>
         </div>

         {!restaurant.menus?.[0] ? (
            <p className="text-center text-[#555] font-serif text-xl">The menu is currently being updated.</p>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-24 gap-y-16 max-w-6xl mx-auto">
              {restaurant.menus[0].categories.map((cat: any) => (
                <div key={cat.id} className="mb-8">
                  <h3 className="text-3xl font-serif text-[#1a1a1a] mb-8 pb-4 border-b border-[#e0e0e0] uppercase tracking-wide">{cat.name}</h3>
                  <div className="space-y-8">
                    {cat.items.map((item: any) => (
                      <div key={item.id} className="group">
                        <div className="flex justify-between items-baseline mb-2">
                          <h4 className="text-lg font-bold font-sans tracking-wide text-[#2c2c2c] uppercase">{item.name}</h4>
                          <span className="text-xl font-serif text-[#8b0000]">
                            {item.price.toLocaleString('tr-TR')} ₺
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-[#666] font-serif italic">{item.description}</p>
                        )}
                        {item.ingredients && (
                          <p className="text-[#888] font-serif italic text-sm mt-1"><span className="font-semibold not-italic">{t('public.ingredients')}:</span> {item.ingredients}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.calories && <span className="text-[10px] font-serif uppercase tracking-widest text-[#a855f7] border border-[#a855f7]/30 px-2 py-0.5 rounded-sm">{item.calories} {t('public.calories')}</span>}
                          {item.containsAlcohol && <span className="text-[10px] font-serif uppercase tracking-widest text-[#e11d48] border border-[#e11d48]/30 px-2 py-0.5 rounded-sm">{t('public.containsAlcohol')}</span>}
                          {item.containsPork && <span className="text-[10px] font-serif uppercase tracking-widest text-[#db2777] border border-[#db2777]/30 px-2 py-0.5 rounded-sm">{t('public.containsPork')}</span>}
                          {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                              <span key={i} className="text-[10px] font-serif uppercase tracking-widest text-[#16a34a] border border-[#16a34a]/30 px-2 py-0.5 rounded-sm">{tag.trim()}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
         )}
         
         <div className="text-center mt-20">
            <Button onClick={() => setIsBookingOpen(true)} className="bg-[#8b0000] hover:bg-[#6b0000] text-white px-12 py-6 text-lg font-bold tracking-widest uppercase rounded-sm">
                Rezervasyon Yap
            </Button>
         </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1a1a1a] text-[#f4f4f4] py-24 text-center">
         <div className="container mx-auto px-6">
            <h2 className="text-4xl font-serif mb-12">{restaurant.name}</h2>
            <div className="flex flex-col md:flex-row justify-center items-center gap-12 font-sans text-sm tracking-widest uppercase opacity-80">
                <a href={`tel:${restaurant.contactPhone}`} className="hover:text-white transition-colors">T: {restaurant.contactPhone || "+90 850 000 00 00"}</a>
                <a href={`mailto:${restaurant.contactEmail}`} className="hover:text-white transition-colors">E: {restaurant.contactEmail}</a>
                <p>Istanbul, Turkey</p>
            </div>
            <div className="mt-16 pt-8 border-t border-white/10 opacity-50 text-xs">
                © 2026 {restaurant.name}. Tüm hakları saklıdır.
            </div>
         </div>
      </footer>

      {/* Reservation Dialog */}
      <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
        <DialogContent className="sm:max-w-[550px] bg-white border border-[#e0e0e0] text-[#2c2c2c] p-0 overflow-hidden rounded-sm shadow-2xl">
          <div className="p-8 md:p-12">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-serif text-[#1a1a1a]">Rezervasyon</h2>
              <button onClick={() => setIsBookingOpen(false)} className="text-[#888] hover:text-[#1a1a1a]"><X className="w-6 h-6" /></button>
            </div>

            {isBookingSuccess ? (
              <div className="text-center py-16 animate-in zoom-in">
                <CheckCircle2 className="w-20 h-20 text-[#8b0000] mx-auto mb-6" />
                <h3 className="text-2xl font-serif mb-2 text-[#1a1a1a]">Rezervasyon Onaylandı</h3>
                <p className="text-[#666] font-sans">Sizi ağırlamaktan mutluluk duyacağız.</p>
              </div>
            ) : isWaitlistSuccess ? (
              <div className="text-center py-16 animate-in zoom-in">
                <CheckCircle2 className="w-20 h-20 text-[#8b0000] mx-auto mb-6" />
                <h3 className="text-2xl font-serif mb-2 text-[#1a1a1a]">Bekleme Listesine Alındınız</h3>
                <p className="text-[#666] font-sans">Masa uygun olduğunda size haber vereceğiz.</p>
              </div>
            ) : (
              <form onSubmit={handleBooking} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold tracking-widest text-[#555]">Tarih</Label>
                    <Input 
                      type="date" 
                      required 
                      value={selectedDate} 
                      onChange={e => setSelectedDate(e.target.value)}
                      className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-sm h-12 focus-visible:ring-1 focus-visible:ring-[#8b0000]" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold tracking-widest text-[#555]">Saat</Label>
                    <Input 
                      type="time" 
                      required 
                      value={selectedTime} 
                      onChange={e => setSelectedTime(e.target.value)}
                      className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-sm h-12 focus-visible:ring-1 focus-visible:ring-[#8b0000]" 
                    />
                  </div>
                </div>

                <div className="space-y-6 pt-6 border-t border-[#e0e0e0]">
                  {restaurant.customization?.reservationInfoText && (
                      <div className="p-4 bg-[#f4f4f4] text-sm text-[#555] font-sans rounded-sm space-y-2 [&>p]:mb-2 [&>a]:text-[#8b0000] [&>a]:underline" 
                           dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationInfoText }} />
                  )}
                  {restaurant.customization?.reservationWarningText && (
                      <div className="p-4 bg-[#fff0f0] border-l-2 border-[#8b0000] text-sm text-[#8b0000] font-sans font-medium rounded-r-sm space-y-2 [&>p]:mb-2 [&>a]:underline" 
                           dangerouslySetInnerHTML={{ __html: restaurant.customization.reservationWarningText }} />
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold tracking-widest text-[#555]">Kişi Sayısı</Label>
                      <Input 
                        type="number" min="1" required 
                        value={resForm.guestCount} onChange={e => setResForm({...resForm, guestCount: e.target.value})}
                        className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-sm h-12 focus-visible:ring-1 focus-visible:ring-[#8b0000]" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold tracking-widest text-[#555]">Ad Soyad</Label>
                      <Input 
                        required 
                        value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})}
                        className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-sm h-12 focus-visible:ring-1 focus-visible:ring-[#8b0000]" 
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold tracking-widest text-[#555]">Telefon</Label>
                      <Input 
                        required 
                        type="tel"
                        value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})}
                        className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-sm h-12 focus-visible:ring-1 focus-visible:ring-[#8b0000]" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold tracking-widest text-[#555]">E-posta</Label>
                      <Input 
                        type="email" 
                        value={resForm.customerEmail} onChange={e => setResForm({...resForm, customerEmail: e.target.value})}
                        className="bg-[#f9f9f9] border-[#e0e0e0] text-[#2c2c2c] rounded-sm h-12 focus-visible:ring-1 focus-visible:ring-[#8b0000]" 
                      />
                    </div>
                  </div>
                </div>

                {checkingDay ? (
                  <div className="p-4 bg-[#f4f4f4] border-l-2 border-[#888] animate-pulse text-sm font-serif text-[#555]">
                    Müsaitlik kontrol ediliyor...
                  </div>
                ) : dayStatus?.daySetting?.isFullyBooked ? (
                  <div className="p-4 bg-[#fff3e0] border-l-2 border-[#ff9800] text-sm font-sans flex items-start gap-3">
                    <Clock className="w-5 h-5 shrink-0 text-[#ff9800]" />
                    <div>
                      <strong className="block mb-1 text-[#e65100]">Tamamen Dolu (Bekleme Listesi Açık)</strong>
                      Bu tarih için rezervasyonlarımız dolmuştur ancak bekleme listesine katılabilirsiniz.
                    </div>
                  </div>
                ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                  <div className="p-4 bg-[#ffebee] border-l-2 border-[#f44336] text-sm font-sans flex items-start gap-3">
                    <X className="w-5 h-5 shrink-0 text-[#f44336]" />
                    <div>
                      <strong className="block mb-1 text-[#b71c1c]">Rezervasyonlar Kapalı</strong>
                      Maalesef bu tarih için rezervasyon kabul edemiyoruz.
                    </div>
                  </div>
                ) : dayStatus?.daySetting?.autoConfirm ? (
                  <div className="p-4 bg-[#e8f5e9] border-l-2 border-[#4caf50] text-sm font-sans flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-[#4caf50]" />
                    <div>
                      <strong className="block mb-1 text-[#1b5e20]">Anında Rezervasyon</strong>
                      Rezervasyonunuz otomatik olarak onaylanacaktır.
                    </div>
                  </div>
                ) : dayStatus ? (
                  <div className="p-4 bg-[#e3f2fd] border-l-2 border-[#2196f3] text-sm font-sans flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 shrink-0 text-[#2196f3]" />
                    <div>
                      <strong className="block mb-1 text-[#0d47a1]">Onay Sırası</strong>
                      Bu tarih için ekibimiz manuel onay vermektedir. Size dönüş yapacağız.
                    </div>
                  </div>
                ) : null}

                <Button 
                  type="submit" 
                  disabled={checkingDay || dayStatus?.daySetting?.isReservationEnabled === false} 
                  className="w-full h-14 bg-[#8b0000] hover:bg-[#6b0000] text-white font-bold tracking-widest uppercase rounded-sm mt-8 disabled:opacity-50"
                >
                  {dayStatus?.daySetting?.isFullyBooked ? 'Bekleme Listesine Katıl' : 'Rezervasyon Talebi Gönder'}
                </Button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
