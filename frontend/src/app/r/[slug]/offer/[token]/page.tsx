'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, Clock, Users, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function WaitlistOfferPage() {
  const { slug, token } = useParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<any>(null);
  const [status, setStatus] = useState<'pending' | 'accepted' | 'declined'>('pending');

  useEffect(() => {
    const fetchOffer = async () => {
      try {
        const res = await api.get(`/public/offer/${token}`);
        setOffer(res.data.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Offer not found or expired.');
      } finally {
        setLoading(false);
      }
    };
    fetchOffer();
  }, [token]);

  const handleAction = async (action: 'accept' | 'decline') => {
    try {
      setLoading(true);
      await api.post(`/public/offer/${token}/${action}`);
      setStatus(action === 'accept' ? 'accepted' : 'declined');
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to ${action} offer.`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-900">Offer Invalid</h1>
          <p className="text-zinc-500">{error}</p>
          <Button onClick={() => router.push(`/r/${slug}`)} className="mt-4 w-full" variant="outline">
            Return to Restaurant
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
          <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-serif font-medium text-zinc-900">Reservation Confirmed</h1>
          <p className="text-zinc-500 font-light">Your table has been successfully booked from the waitlist! We look forward to seeing you.</p>
          <Button onClick={() => router.push(`/r/${slug}`)} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-12">
            Back to Restaurant
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
          <XCircle className="w-20 h-20 text-zinc-300 mx-auto" />
          <h1 className="text-2xl font-serif font-medium text-zinc-900">Offer Declined</h1>
          <p className="text-zinc-500 font-light">You have declined this reservation offer. We hope to see you another time.</p>
          <Button onClick={() => router.push(`/r/${slug}`)} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-12">
            Back to Restaurant
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans">
      <div className="bg-white rounded-[2rem] shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-zinc-900 p-8 text-center text-white space-y-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">Reservation Offer</h2>
          <h1 className="text-2xl font-serif font-medium">{offer.restaurant.name}</h1>
        </div>
        
        <div className="p-8 space-y-8">
          <p className="text-zinc-600 text-center text-sm leading-relaxed">
            Great news, <strong>{offer.customerName}</strong>! A table has opened up for you from the waitlist. Please review the details below and accept to confirm your reservation.
          </p>

          <div className="bg-zinc-50 rounded-2xl p-6 space-y-4 border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Date</div>
                <div className="font-medium text-zinc-800">{offer.targetDate}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Time</div>
                <div className="font-medium text-zinc-800">{offer.offeredTime || "Dinner Service"}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Party Size</div>
                <div className="font-medium text-zinc-800">{offer.partySize} Guests</div>
              </div>
            </div>
          </div>

          <div className="text-center text-xs text-red-500 font-medium">
            This offer expires at {new Date(offer.offerExpiresAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button onClick={() => handleAction('decline')} variant="outline" className="h-12 rounded-xl text-zinc-600 border-zinc-200 hover:bg-zinc-50">
              Decline
            </Button>
            <Button onClick={() => handleAction('accept')} className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20">
              Accept Offer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
