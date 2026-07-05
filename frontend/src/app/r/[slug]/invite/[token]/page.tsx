'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { Heart, MapPin, CalendarDays, Clock, Check, X, HelpCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

// e-davetiye (invitation microsite, Phase 5). Public, token-keyed page where a
// guest views the event details and self-serves their RSVP into the guest list.
// Reuses the public /r/[slug] URL space and the tenant's brand colour.

interface Invitation {
  eventType: string;
  clientName: string;
  eventDate: string;
  slot: string | null;
  venueName: string | null;
  venueAddress: string | null;
  invitationMessage: string | null;
  restaurant: { name: string; slug: string };
  customization?: { primaryColor?: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  WEDDING: 'Düğün · Wedding',
  ENGAGEMENT: 'Nişan · Engagement',
  HENNA: 'Kına · Henna',
  CORPORATE: 'Organizasyon · Event',
};

const RSVP_CHOICES: { value: string; tr: string; en: string; icon: any }[] = [
  { value: 'YES', tr: 'Katılıyorum', en: 'Attending', icon: Check },
  { value: 'MAYBE', tr: 'Belki', en: 'Maybe', icon: HelpCircle },
  { value: 'NO', tr: 'Katılamıyorum', en: 'Not attending', icon: X },
];

export default function InvitationPage() {
  const { token } = useParams();
  const [inv, setInv] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: '', partySize: '1', rsvp: 'YES', dietary: '', note: '' });

  useEffect(() => {
    axios.get(`${API_URL}/public/invitation/${token}`)
      .then(res => setInv(res.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  const accent = inv?.customization?.primaryColor || '#9a6a4f';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/public/invitation/${token}/rsvp`, {
        ...form, partySize: parseInt(form.partySize) || 1,
      });
      setDone(true);
    } catch { setError(true); }
    finally { setSubmitting(false); }
  };

  const prettyDate = (d: string) => {
    try { return new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }); }
    catch { return d; }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#faf6f1]"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  }
  if (error && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf6f1] p-6 text-center">
        <div>
          <X className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 font-serif text-lg">Davetiye bulunamadı · Invitation not found</p>
        </div>
      </div>
    );
  }
  if (!inv) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#faf6f1] via-[#f6efe7] to-[#efe4d8] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-[2rem] shadow-2xl shadow-stone-300/40 overflow-hidden border border-white">
        {/* Hero */}
        <div className="px-8 pt-12 pb-8 text-center" style={{ borderTop: `6px solid ${accent}` }}>
          <div className="flex items-center justify-center mb-5">
            <span className="h-px w-10 bg-stone-300" />
            <Heart className="w-5 h-5 mx-3" style={{ color: accent }} fill={accent} />
            <span className="h-px w-10 bg-stone-300" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-stone-400">{TYPE_LABEL[inv.eventType] || inv.eventType}</p>
          <h1 className="mt-3 text-4xl font-serif font-medium text-stone-800 leading-tight">{inv.clientName}</h1>
          {inv.invitationMessage && (
            <p className="mt-4 text-sm text-stone-500 italic font-serif leading-relaxed">{inv.invitationMessage}</p>
          )}
        </div>

        {/* Details */}
        <div className="px-8 space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 text-stone-600">
            <CalendarDays className="w-4 h-4" style={{ color: accent }} />
            <span className="text-sm font-medium">{prettyDate(inv.eventDate)}</span>
          </div>
          {inv.slot && (
            <div className="flex items-center justify-center gap-2 text-stone-500">
              <Clock className="w-4 h-4" style={{ color: accent }} />
              <span className="text-sm">{inv.slot}</span>
            </div>
          )}
          {inv.venueName && (
            <div className="flex items-center justify-center gap-2 text-stone-600">
              <MapPin className="w-4 h-4" style={{ color: accent }} />
              <span className="text-sm font-medium">{inv.venueName}</span>
            </div>
          )}
          {inv.venueAddress && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(inv.venueAddress)}`} target="_blank" rel="noreferrer"
              className="block text-xs text-stone-400 underline decoration-stone-300 hover:text-stone-600">
              {inv.venueAddress}
            </a>
          )}
        </div>

        <div className="mx-8 my-7 flex items-center">
          <span className="h-px flex-1 bg-stone-200" />
          <span className="px-3 text-[10px] uppercase tracking-[0.25em] text-stone-400">RSVP</span>
          <span className="h-px flex-1 bg-stone-200" />
        </div>

        {/* RSVP form / thank-you */}
        <div className="px-8 pb-10">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: `${accent}22` }}>
                <Check className="w-7 h-7" style={{ color: accent }} />
              </div>
              <p className="font-serif text-xl text-stone-700">Teşekkürler!</p>
              <p className="text-sm text-stone-400 mt-1">Yanıtınız alındı · Your response was recorded.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                placeholder="Adınız · Your name"
                className="w-full h-11 px-4 rounded-full border border-stone-200 bg-white/70 text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: accent }} />

              <div className="grid grid-cols-3 gap-2">
                {RSVP_CHOICES.map(c => {
                  const active = form.rsvp === c.value;
                  return (
                    <button type="button" key={c.value} onClick={() => setForm({ ...form, rsvp: c.value })}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-[11px] font-semibold transition-all"
                      style={active
                        ? { backgroundColor: accent, borderColor: accent, color: 'white' }
                        : { backgroundColor: 'white', borderColor: '#e7e0d7', color: '#78716c' }}>
                      <c.icon className="w-4 h-4" />
                      <span>{c.tr}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-stone-400 shrink-0">Kişi sayısı · Party</label>
                <input type="number" min="1" value={form.partySize} onChange={e => setForm({ ...form, partySize: e.target.value })}
                  className="w-20 h-10 px-3 rounded-full border border-stone-200 bg-white/70 text-sm text-center text-stone-700 focus:outline-none" />
              </div>

              <input value={form.dietary} onChange={e => setForm({ ...form, dietary: e.target.value })}
                placeholder="Diyet notu · Dietary (optional)"
                className="w-full h-11 px-4 rounded-full border border-stone-200 bg-white/70 text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none" />

              <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2}
                placeholder="Mesajınız · Message (optional)"
                className="w-full px-4 py-3 rounded-2xl border border-stone-200 bg-white/70 text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none resize-none" />

              <button type="submit" disabled={submitting}
                className="w-full h-12 rounded-full text-white text-sm font-semibold tracking-wide flex items-center justify-center gap-2 disabled:opacity-60 transition-transform active:scale-[0.98]"
                style={{ backgroundColor: accent }}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" fill="white" />}
                Yanıtla · Send RSVP
              </button>
            </form>
          )}
        </div>

        <div className="px-8 pb-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-300">{inv.restaurant.name}</p>
        </div>
      </div>
    </div>
  );
}
