'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight } from 'lucide-react';

// Anti-phishing entry point: instead of trusting a raw SMS link, a guest can come
// to the known site and type the short payment code they were given.
export default function PayCodeEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length >= 4) router.push(`/pay/${encodeURIComponent(c)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
        <div className="flex flex-col items-center text-center gap-2 mb-6">
          <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-black text-slate-800">Ödeme Kodu ile Devam Et</h1>
          <p className="text-sm text-slate-500">Rezervasyon onayınızda size verilen ödeme kodunu girin.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            placeholder="ÖRN. K7P2M9QR"
            autoFocus
            className="w-full h-14 text-center text-2xl font-black tracking-[0.3em] rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 outline-none"
          />
          <button type="submit" disabled={code.trim().length < 4} className="w-full h-12 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-slate-800 transition-colors">
            Ödemeye Git <ArrowRight className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[11px] text-slate-400 text-center mt-5 leading-relaxed">
          Kart bilgileriniz yalnızca güvenli ödeme ekranında (PayTR) alınır.
          Görevliler kart bilginizi telefonda/SMS ile asla istemez.
        </p>
      </div>
    </div>
  );
}
