'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

// DEV ONLY. Stands in for the PayTR hosted iframe when PAYMENT_PROVIDER=mock, so
// the whole flow is testable locally. It just calls the mock-complete endpoint,
// which produces a correctly-signed callback server-side.
function MockCheckout() {
  const params = useSearchParams();
  const oid = params.get('oid') || '';
  const amount = params.get('amount') || '0';
  const [done, setDone] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);

  const complete = async (outcome: 'success' | 'failed') => {
    setBusy(true);
    try {
      await axios.post(`${API_URL}/public/payment/mock/complete`, { oid, outcome });
      setDone(outcome);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 420, margin: '0 auto' }}>
      <div style={{ border: '2px dashed #cbd5e1', borderRadius: 12, padding: 20, background: '#f8fafc' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#64748b', textTransform: 'uppercase' }}>
          MOCK GATEWAY (dev)
        </div>
        <p style={{ color: '#475569', fontSize: 14, margin: '8px 0 16px' }}>
          Tutar: <b>{(parseInt(amount) / 100).toFixed(2)} TL</b><br />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>oid: {oid}</span>
        </p>
        {done ? (
          <p style={{ fontWeight: 700, color: done === 'success' ? '#059669' : '#dc2626' }}>
            {done === 'success' ? '✓ Ödeme başarılı (mock)' : '✗ Ödeme başarısız (mock)'}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => complete('success')} disabled={busy} style={{ flex: 1, height: 44, borderRadius: 8, border: 0, background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Simüle: Başarılı
            </button>
            <button onClick={() => complete('failed')} disabled={busy} style={{ flex: 1, height: 44, borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>
              Simüle: Başarısız
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return <Suspense><MockCheckout /></Suspense>;
}
