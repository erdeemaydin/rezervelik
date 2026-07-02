'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import axios from 'axios';
import ClassicLayout from '@/components/public/ClassicLayout';
import PremiumLayout from '@/components/public/PremiumLayout';
import OldenLayout from '@/components/public/OldenLayout';
import GardenLayout from '@/components/public/GardenLayout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

export default function RestaurantMenuPage() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchRestaurant();
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;
  if (!restaurant) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-medium">Experience not found.</div>;

  const layoutStyle = restaurant.customization?.layoutStyle || 'CLASSIC_LIST';

  if (layoutStyle === 'ANIMATED') {
    return <OldenLayout slug={slug as string} initialRestaurant={restaurant} menuOnly />;
  }

  if (layoutStyle === 'EDITORIAL_IMAGE') {
    return <PremiumLayout slug={slug as string} initialRestaurant={restaurant} menuOnly />;
  }

  if (layoutStyle === 'GARDEN_FRESH') {
    return <GardenLayout slug={slug as string} initialRestaurant={restaurant} menuOnly />;
  }

  return <ClassicLayout slug={slug as string} initialRestaurant={restaurant} menuOnly />;
}
