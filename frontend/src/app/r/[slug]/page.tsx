'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Utensils, Calendar as CalendarIcon, Clock, Users, ChevronRight, Star, ArrowLeft, MapPin, Phone, Info, MessageSquare, Sparkles, CheckCircle2, Ticket, XCircle, Flame, Leaf, Hourglass } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

type ViewState = 'welcome' | 'menu' | 'booking' | 'success';

export default function RestaurantPublicPage() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('welcome');
  
  // Day Status Cache
  const [dayStatus, setDayStatus] = useState<any>(null);
  const [checkingDay, setCheckingDay] = useState(false);

  const [resForm, setResForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    guestCount: '2',
    notes: ''
  });

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('19:30');
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRestaurant();
  }, [slug]);

  useEffect(() => {
    if (view === 'booking') checkDayStatus(selectedDate);
  }, [selectedDate, view]);

  const fetchRestaurant = async () => {
    try {
      const res = await axios.get(`${API_URL}/public/restaurant/${slug}`);
      setRestaurant(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedDateTime = new Date(`${selectedDate}T${selectedTime}`);
    
    if (combinedDateTime < new Date()) {
      toast.error('Cannot create reservations for the past');
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
      setView('success');
      setResForm({ customerName: '', customerPhone: '', customerEmail: '', guestCount: '2', notes: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to book');
    }
  };

  const getDaySuggestions = () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Top 3 days
    const week = [];
    for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        week.push({
            label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short' }),
            value: d.toISOString().split('T')[0],
            full: d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        });
    }

    // Weekend days (Fri, Sat, Sun)
    const getWeekendSet = (offsetDays = 0) => {
        const set = [];
        for (let targetDay of [5, 6, 0]) { // Fri, Sat, Sun
            let d = new Date(today);
            let diff = targetDay - d.getDay();
            if (diff < 0) diff += 7; // Target is next week
            d.setDate(d.getDate() + diff + offsetDays);
            set.push({
                label: d.toLocaleDateString([], { weekday: 'short' }),
                value: d.toISOString().split('T')[0],
                full: d.toLocaleDateString([], { month: 'short', day: 'numeric' })
            });
        }
        return set;
    };

    let weekend = getWeekendSet(0);
    const weekValues = week.map(w => w.value);
    const hasOverlap = weekend.some(we => weekValues.includes(we.value));

    // If any of Top 3 overlap with the upcoming weekend, show the weekend AFTER that
    if (hasOverlap) {
        weekend = getWeekendSet(7);
    }

    return { week, weekend };
  };

  const getTimeSuggestions = () => {
      return {
          lunch: ['12:30', '13:30', '14:00'],
          dinner: ['19:00', '20:00', '21:00', '22:00']
      };
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div></div>;
  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Restaurant not found.</div>;


  const getWaitTimeText = () => {
      const s = restaurant?.waitTimeConfig;
      if (!s || !s.isWaitTimeEnabled) return null;
      if (s.isWaitTimeCalculated) {
          const calculated = s.peopleWaiting * s.waitTimePerPerson;
          return calculated > 0 ? `~${calculated} min wait` : 'No wait time';
      } else {
          return s.manualWaitTime ? `~${s.manualWaitTime} min wait` : 'No wait time';
      }
  };

  const { week, weekend } = getDaySuggestions();

  const times = getTimeSuggestions();

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-slate-900 selection:text-white">
      
      {/* Welcome View */}
      {view === 'welcome' && (
        <div className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src={restaurant.logoUrl || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1600"} 
              className="w-full h-full object-cover"
              alt={restaurant.name}
            />
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"></div>
          </div>

          <div className="relative z-10 text-center px-6 max-w-4xl animate-in fade-in zoom-in duration-700">
            
            <div className="flex flex-wrap justify-center gap-2 mb-6">
                <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md px-4 py-1 text-sm tracking-widest uppercase font-black">
                    <Sparkles className="w-3 h-3 mr-2" /> Welcome to Excellence
                </Badge>
                {getWaitTimeText() && (
                    <Badge className="bg-amber-500/80 hover:bg-amber-500 text-white border-0 backdrop-blur-md px-4 py-1 text-sm tracking-widest uppercase font-black">
                        <Hourglass className="w-3 h-3 mr-2" /> Walk-in: {getWaitTimeText()}
                    </Badge>
                )}
            </div>
            <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-8 leading-none">
                {restaurant.name}
            </h1>
            <p className="text-xl md:text-2xl text-white/80 font-medium mb-12 max-w-2xl mx-auto leading-relaxed italic">
                "Where culinary art meets soul-stirring hospitality."
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <Button onClick={() => setView('menu')} size="lg" className="w-full sm:w-64 h-20 text-xl font-black rounded-2xl bg-white text-slate-900 hover:bg-slate-100 transition-all shadow-2xl hover:scale-105">
                <Utensils className="mr-3 h-6 w-6" /> Explore Menu
              </Button>
              <Button onClick={() => setView('booking')} size="lg" className="w-full sm:w-64 h-20 text-xl font-black rounded-2xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-2xl border border-white/20 hover:scale-105">
                <CalendarIcon className="mr-3 h-6 w-6 text-amber-400" /> Book a Table
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Menu View */}
      {view === 'menu' && (
        <div className="animate-in slide-in-from-right duration-500 min-h-screen bg-slate-50 flex flex-col">
          <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200 shrink-0">
            <div className="px-6 h-16 flex items-center justify-between">
                <Button variant="ghost" onClick={() => setView('welcome')} className="font-bold text-slate-600 hover:text-slate-900">
                    <ArrowLeft className="mr-2 h-5 w-5" /> Back
                </Button>
                
                <div className="flex flex-col items-center">
                    <div className="font-black text-xl tracking-tighter">{restaurant.name}</div>
                    {getWaitTimeText() && (
                        <div className="text-[10px] font-black uppercase text-amber-600 tracking-widest flex items-center mt-0.5">
                            <Hourglass className="w-3 h-3 mr-1" /> Walk-in: {getWaitTimeText()}
                        </div>
                    )}
                </div>

                <Button onClick={() => setView('booking')} className="bg-slate-900 text-white font-black rounded-xl px-6 h-10 shadow-xl shadow-slate-900/20">Book Table</Button>
            </div>
            
            {/* Sticky Top Tabs Navigation */}
            {restaurant.menus?.[0]?.categories && (
                <div className="flex overflow-x-auto hide-scrollbar px-4 py-3 gap-2 border-t border-slate-100 bg-white">
                    {restaurant.menus[0].categories.map((cat: any) => (
                        <Button 
                            key={`nav-${cat.id}`} 
                            variant="outline" 
                            className="shrink-0 rounded-full font-bold text-xs uppercase tracking-widest border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition-colors"
                            onClick={() => {
                                const el = document.getElementById(`cat-${cat.id}`);
                                if (el) {
                                    const y = el.getBoundingClientRect().top + window.scrollY - 130; // Offset for sticky header
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

          <main className="flex-1 max-w-4xl mx-auto w-full py-8 px-4 sm:px-6 pb-32">
            {!restaurant.menus?.[0] ? (
                <div className="text-center text-slate-500 font-bold mt-20">Menu is currently being updated.</div>
            ) : (
                <div className="space-y-12 bg-[#f4f6f5] p-6 sm:p-10 rounded-sm">
                    {restaurant.menus[0].categories.map((cat: any) => (
                        <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-32">
                            <div className="mb-6 border-b-2 border-red-800 pb-2 flex items-center justify-between">
                                <h2 className="text-3xl font-black tracking-tighter text-red-800 uppercase">{cat.name}</h2>
                            </div>

                            {/* Handle Items directly under this category */}
                            {cat.items && cat.items.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mb-8">
                                    {cat.items.map((item: any) => (
                                        <div key={item.id} className="flex flex-col">
                                            <div className="flex justify-between items-baseline gap-4">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-black text-sm text-slate-900 uppercase tracking-tight">{item.name}</span>
                                                    <div className="flex items-center gap-1">
                                                        {item.spiceLevel > 0 && (
                                                            <span title={`Spice Level ${item.spiceLevel}`} className="text-red-600"><Flame className="w-3 h-3" /></span>
                                                        )}
                                                        {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                                                            <span key={i} title={tag.trim()} className="text-green-700"><Leaf className="w-3 h-3" /></span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="font-bold text-slate-900 text-sm whitespace-nowrap">
                                                    {item.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                                </div>
                                            </div>
                                            {item.description && <p className="text-slate-600 mt-1 text-[11px] leading-tight font-medium">{item.description}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Handle Sub-categories */}
                            {cat.children && cat.children.length > 0 && (
                                <div className="space-y-10">
                                    {cat.children.map((sub: any) => (
                                        <div key={sub.id}>
                                            <div className="mb-4">
                                                <h3 className="text-xl font-bold text-red-800 tracking-tight">{sub.name}</h3>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                                {sub.items?.map((item: any) => (
                                                    <div key={item.id} className="flex flex-col">
                                                        <div className="flex justify-between items-baseline gap-4">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-black text-sm text-slate-900 uppercase tracking-tight">{item.name}</span>
                                                                <div className="flex items-center gap-1">
                                                                    {item.spiceLevel > 0 && (
                                                                        <span title={`Spice Level ${item.spiceLevel}`} className="text-red-600"><Flame className="w-3 h-3" /></span>
                                                                    )}
                                                                    {item.dietaryTags && item.dietaryTags.split(',').map((tag: string, i: number) => (
                                                                        <span key={i} title={tag.trim()} className="text-green-700"><Leaf className="w-3 h-3" /></span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div className="font-bold text-slate-900 text-sm whitespace-nowrap">
                                                                {item.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                                            </div>
                                                        </div>
                                                        {item.description && <p className="text-slate-600 mt-1 text-[11px] leading-tight font-medium">{item.description}</p>}
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
          </main>
        </div>
      )}

      {/* Booking View */}
      {view === 'booking' && (
        <div className="animate-in slide-in-from-bottom duration-500 min-h-screen bg-slate-50 flex flex-col">
          <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between shrink-0">
            <Button variant="ghost" onClick={() => setView('welcome')} className="font-bold text-slate-600 hover:text-slate-900">
                <ArrowLeft className="mr-2 h-5 w-5" /> Back
            </Button>
            
            <div className="flex flex-col items-center">
                <div className="font-black text-lg tracking-tighter">Secure Your Table</div>
                {getWaitTimeText() && (
                    <div className="text-[10px] font-black uppercase text-amber-600 tracking-widest flex items-center mt-0.5">
                        <Hourglass className="w-3 h-3 mr-1" /> Walk-in: {getWaitTimeText()}
                    </div>
                )}
            </div>

            <div className="w-10"></div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto py-8 px-6 grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Left Side: Info & Context */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                                <Utensils className="h-7 w-7" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tighter">{restaurant.name}</h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Premium Dining</p>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-50">
                            <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                                <MapPin className="h-4 w-4 text-blue-500" /> Istanbul, Turkey
                            </div>
                            <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                                <Phone className="h-4 w-4 text-blue-500" /> {restaurant.contactPhone || "+90 ..."}
                            </div>
                        </div>
                    </div>

                    {/* Operational Status Boxes */}
                    {checkingDay ? (
                        <div className="bg-slate-200 animate-pulse h-24 rounded-[2rem]"></div>
                    ) : dayStatus?.daySetting?.isReservationEnabled === false ? (
                        <div className="bg-red-600 text-white p-6 rounded-[2rem] shadow-xl shadow-red-600/30 flex gap-4 items-start animate-in fade-in duration-300">
                            <XCircle className="h-6 w-6 shrink-0 mt-1" />
                            <div>
                                <p className="font-black tracking-tight text-lg leading-none mb-2">Sold Out / Closed</p>
                                <p className="text-sm font-medium opacity-80">Unfortunately we're closed to the reservations for that day.</p>
                            </div>
                        </div>
                    ) : dayStatus?.daySetting?.autoConfirm === true ? (
                        <div className="bg-emerald-600 text-white p-6 rounded-[2rem] shadow-xl shadow-emerald-600/30 flex gap-4 items-start animate-in fade-in duration-300">
                            <CheckCircle2 className="h-6 w-6 shrink-0 mt-1" />
                            <div>
                                <p className="font-black tracking-tight text-lg leading-none mb-2">Immediate Booking</p>
                                <p className="text-sm font-medium opacity-80">Good news! We have a table for you. Your reservation will be confirmed automatically.</p>
                            </div>
                        </div>
                    ) : (
                         <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl shadow-blue-600/30 flex gap-4 items-start animate-in fade-in duration-300">
                            <Info className="h-6 w-6 shrink-0 mt-1" />
                            <div>
                                <p className="font-black tracking-tight text-lg leading-none mb-2">Confirmation Queue</p>
                                <p className="text-sm font-medium opacity-80">This date requires manual staff review. You'll receive a notification once confirmed.</p>
                            </div>
                         </div>
                    )}
                </div>

                {/* Right Side: Form */}
                <div className="lg:col-span-3">
                    <form onSubmit={handleBooking} className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 space-y-10">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Full Name</Label>
                                <Input required className="h-14 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-slate-900/5 transition-all text-lg font-bold px-6" value={resForm.customerName} onChange={e => setResForm({...resForm, customerName: e.target.value})} placeholder="Ex: John Doe" />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Phone Number</Label>
                                <Input required type="tel" className="h-14 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-slate-900/5 transition-all text-lg font-bold px-6" value={resForm.customerPhone} onChange={e => setResForm({...resForm, customerPhone: e.target.value})} placeholder="+90 ..." />
                            </div>
                        </div>

                        <div className="space-y-3">
                             <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Date Selection</Label>
                             <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-3">
                                        {week.map(d => (
                                            <Button key={d.value} type="button" variant={selectedDate === d.value ? 'default' : 'outline'} className={cn("h-16 flex flex-col items-center justify-center rounded-2xl border-2 transition-all", selectedDate === d.value ? "bg-slate-900 border-slate-900 text-white" : "hover:border-slate-300")} onClick={() => setSelectedDate(d.value)}>
                                                <span className="text-[9px] uppercase font-black opacity-60">{d.label}</span>
                                                <span className="text-sm font-black">{d.full}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className="text-[8px] font-black uppercase px-2 py-0 border-blue-200 text-blue-600 bg-blue-50">Next Week</Badge>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3">
                                        {weekend.map(d => (
                                            <Button key={d.value} type="button" variant={selectedDate === d.value ? 'default' : 'outline'} className={cn("h-16 flex flex-col items-center justify-center rounded-2xl border-2 transition-all", selectedDate === d.value ? "bg-blue-600 border-blue-600 text-white" : "hover:border-blue-200")} onClick={() => setSelectedDate(d.value)}>
                                                <span className="text-[9px] uppercase font-black opacity-60">{d.label}</span>
                                                <span className="text-sm font-black">{d.full}</span>
                                            </Button>
                                        ))}
                                        <div className="relative">
                                            <input type="date" ref={dateInputRef} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="sr-only" />
                                            <Button type="button" variant="outline" className="w-full h-16 rounded-2xl border-2 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors" onClick={() => dateInputRef.current?.showPicker()}>
                                                <CalendarIcon className="h-5 w-5 mb-1 text-slate-400" />
                                                <span className="text-[9px] font-black uppercase text-slate-400">Custom</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                             </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-end border-t border-slate-50 pt-10">
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Preferred Time</Label>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-4 gap-2">
                                        {[...times.lunch, ...times.dinner].map(t => (
                                            <Button key={t} type="button" variant={selectedTime === t ? 'default' : 'ghost'} className={cn("h-10 text-xs font-bold rounded-xl border border-slate-100 shadow-sm", selectedTime === t ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50")} onClick={() => setSelectedTime(t)}>{t}</Button>
                                        ))}
                                    </div>
                                    <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white font-bold" />
                                </div>
                            </div>
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Guest Count</Label>
                                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl">
                                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 bg-white rounded-xl shadow-sm hover:scale-110" onClick={() => setResForm(f => ({...f, guestCount: Math.max(1, parseInt(f.guestCount)-1).toString()}))}>-</Button>
                                    <div className="flex-1 text-center font-black text-2xl">{resForm.guestCount}</div>
                                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 bg-white rounded-xl shadow-sm hover:scale-110" onClick={() => setResForm(f => ({...f, guestCount: (parseInt(f.guestCount)+1).toString()}))}>+</Button>
                                </div>
                            </div>
                        </div>

                        <Button type="submit" disabled={checkingDay || (dayStatus && !dayStatus.daySetting?.isReservationEnabled && dayStatus.daySetting)} className="w-full h-20 rounded-[1.5rem] bg-slate-900 text-white hover:bg-slate-800 text-xl font-black shadow-2xl transition-all hover:scale-[1.02] active:scale-95">
                            {checkingDay ? "Checking Availability..." : 
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
          <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 animate-in fade-in duration-700">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/20">
                  <CheckCircle2 className="h-12 w-12" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter mb-4 text-center">Reservation Request Sent!</h1>
              <div className="text-xl text-slate-500 font-medium text-center max-w-lg mb-12 leading-relaxed">
                  You are going to receive an SMS confirmation soon. We are excited that you chose <span className="font-bold text-slate-900">{restaurant.name}</span>.
                  <p className="mt-4 text-sm font-bold uppercase tracking-widest text-emerald-600">See you soon!</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={() => setView('menu')} variant="outline" className="h-16 px-10 text-lg font-bold rounded-2xl border-2">
                      <Utensils className="mr-2 h-5 w-5" /> Explore Our Menu
                  </Button>
                  <Button onClick={() => setView('welcome')} className="h-16 px-10 text-lg font-bold rounded-2xl bg-slate-900 text-white">
                      Return to Home
                  </Button>
              </div>
          </div>
      )}

    </div>
  );
}
