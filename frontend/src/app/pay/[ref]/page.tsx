'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { ShieldCheck, Lock, Loader2, CheckCircle2, XCircle, Clock, CreditCard } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

interface Session {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  amount: number; // minor units
  currency: string;
  iframeUrl: string | null;
  provider: string;
  restaurant: { name: string; slug: string; logoUrl: string | null; primaryColor: string | null } | null;
  reservation: { customerName: string; guestCount: number; startTime: string } | null;
}

const money = (minor: number, currency: string) => {
  const v = (minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = currency === 'TL' || currency === 'TRY' ? '₺' : currency + ' ';
  return `${symbol}${v}`;
};

export default function PaymentPage() {
  const params = useParams();
  const ref = params.ref as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/public/payment/session/${encodeURIComponent(ref)}`);
      setSession(res.data.data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [ref]);

  useEffect(() => { load(); }, [load]);

  // While awaiting payment, poll for the server-confirmed result (the gateway
  // callback is the source of truth, not the iframe redirect).
  useEffect(() => {
    if (session?.status === 'PENDING') {
      pollRef.current = setInterval(load, 4000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [session?.status, load]);

  const primary = session?.restaurant?.primaryColor || '#0f172a';

  if (loading) {
    return <Centered><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></Centered>;
  }
  if (notFound || !session) {
    return <Centered><div className="text-center"><XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" /><p className="font-bold text-slate-700">Ödeme bulunamadı</p><p className="text-sm text-slate-400 mt-1">Bu ödeme bağlantısı geçersiz.</p></div></Centered>;
  }

  const res = session.reservation;
  const dt = res ? new Date(res.startTime) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-start sm:items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        {/* Branded header */}
        <div className="rounded-t-2xl p-6 text-white text-center" style={{ background: primary }}>
          {session.restaurant?.logoUrl
            ? <img src={session.restaurant.logoUrl} alt="" className="h-10 mx-auto mb-2 object-contain" />
            : <div className="text-xl font-black tracking-tight">{session.restaurant?.name}</div>}
          <p className="text-[11px] uppercase tracking-[0.2em] opacity-80 mt-1">Rezervasyon Kaporası</p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-lg border border-slate-100 border-t-0 overflow-hidden">
          {/* Reservation summary */}
          {res && dt && (
            <div className="p-5 border-b border-slate-100 grid grid-cols-2 gap-3 text-sm">
              <Info label="Misafir" value={res.customerName} />
              <Info label="Kişi" value={`${res.guestCount}`} />
              <Info label="Tarih" value={dt.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long' })} />
              <Info label="Saat" value={dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })} />
            </div>
          )}
          <div className="p-5 flex items-center justify-between border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ödenecek Kapora</span>
            <span className="text-2xl font-black" style={{ color: primary }}>{money(session.amount, session.currency)}</span>
          </div>

          {/* Status-specific body */}
          {session.status === 'PAID' ? (
            <StatusBlock icon={<CheckCircle2 className="w-14 h-14 text-emerald-500" />} title="Ödeme Alındı" desc="Rezervasyonunuz onaylandı. Teşekkür ederiz!" tone="emerald" />
          ) : session.status === 'EXPIRED' ? (
            <StatusBlock icon={<Clock className="w-14 h-14 text-amber-500" />} title="Bağlantı Süresi Doldu" desc="Bu ödeme bağlantısının süresi doldu. Lütfen restoran ile iletişime geçin." tone="amber" />
          ) : session.status === 'FAILED' ? (
            <StatusBlock icon={<XCircle className="w-14 h-14 text-red-500" />} title="Ödeme Başarısız" desc="Ödeme tamamlanamadı. Kartınızı kontrol edip tekrar deneyebilirsiniz." tone="red" />
          ) : (
            <div>
              {/* Trust bar */}
              <div className="flex items-center justify-center gap-4 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-emerald-600" /> SSL</span>
                <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> 3D Secure</span>
                <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-emerald-600" /> PayTR</span>
              </div>
              {/* Hosted secure iframe — card data is entered on the gateway, never here */}
              {session.iframeUrl ? (
                <iframe src={session.iframeUrl} title="Güvenli Ödeme" className="w-full" style={{ minHeight: 460, border: 0 }} />
              ) : (
                <Centered><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></Centered>
              )}
              <p className="px-5 py-3 text-[11px] leading-relaxed text-slate-400 text-center border-t border-slate-100">
                Kart bilgileriniz doğrudan PayTR’ın güvenli ekranına girilir; bu bilgiler restorana veya bize iletilmez.
                <br />Görevliler kart bilginizi telefonda/SMS ile <b>asla</b> istemez.
              </p>
            </div>
          )}
        </div>
        <p className="text-center text-[10px] text-slate-300 mt-4 uppercase tracking-widest">Güvenli ödeme · {session.restaurant?.name}</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

function StatusBlock({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string; tone: string }) {
  return (
    <div className="p-10 flex flex-col items-center text-center gap-2">
      {icon}
      <h2 className="text-lg font-black text-slate-800 mt-2">{title}</h2>
      <p className="text-sm text-slate-500 max-w-xs">{desc}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">{children}</div>;
}
