'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ClassicLayout from '@/components/public/ClassicLayout';
import PremiumLayout from '@/components/public/PremiumLayout';
import OldenLayout from '@/components/public/OldenLayout';
import GardenLayout from '@/components/public/GardenLayout';
import NoirLoungeLayout from '@/components/public/NoirLoungeLayout';
import NordicMinimalLayout from '@/components/public/NordicMinimalLayout';
import TrattoriaRusticLayout from '@/components/public/TrattoriaRusticLayout';
import BoldEditorialLayout from '@/components/public/BoldEditorialLayout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

export default function RestaurantRouterPage() {
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const initialView = searchParams.get('view') || undefined;
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isPreview = searchParams.get('preview') === '1';
  // Holds the most recent customization patch posted by the dashboard's live
  // preview (see frontend/src/app/dashboard/customization/page.tsx) before the
  // initial restaurant fetch resolves, so it isn't dropped by a race between
  // the iframe's onLoad postMessage and this page's own data fetch.
  const previewPatchRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    const fetchRestaurant = async () => {
      try {
        const res = await axios.get(`${API_URL}/public/restaurant/${slug}`);
        let data = res.data.data;
        if (isPreview && previewPatchRef.current) {
          data = { ...data, customization: { ...data.customization, ...previewPatchRef.current } };
        }
        setRestaurant(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRestaurant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Preview-only: the customization dashboard embeds this page in an iframe and
  // posts draft (unsaved) customization changes here so staff can see edits
  // reflected before publishing. Real visitors never set `?preview=1`, so this
  // listener is never attached for them and cannot affect the live page.
  useEffect(() => {
    if (!isPreview) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.source !== 'rezervelik-preview' || !msg.customization) return;
      previewPatchRef.current = msg.customization;
      setRestaurant((prev: any) => prev ? { ...prev, customization: { ...prev.customization, ...msg.customization } } : prev);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isPreview]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;
  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-medium">Experience not found.</div>;

  const layoutStyle = restaurant.customization?.layoutStyle || 'CLASSIC_LIST';

  if (layoutStyle === 'ANIMATED') {
    return <OldenLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  if (layoutStyle === 'EDITORIAL_IMAGE') {
    return <PremiumLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  if (layoutStyle === 'GARDEN_FRESH') {
    return <GardenLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  if (layoutStyle === 'NOIR_LOUNGE') {
    return <NoirLoungeLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  if (layoutStyle === 'NORDIC_MINIMAL') {
    return <NordicMinimalLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  if (layoutStyle === 'TRATTORIA_RUSTIC') {
    return <TrattoriaRusticLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  if (layoutStyle === 'BOLD_EDITORIAL') {
    return <BoldEditorialLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
  }

  return <ClassicLayout slug={slug as string} initialRestaurant={restaurant} initialView={initialView} />;
}
