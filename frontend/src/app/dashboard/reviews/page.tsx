'use client';

import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Star, Reply, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useTranslation } from "@/i18n/provider";

export default function ReviewsPage() {
  const { t } = useTranslation();
  const [reviews] = useState([
    { id: 1, customer: 'John Doe', rating: 5, date: '2 days ago', text: 'Absolutely amazing experience. The table was ready right on time and the food was spectacular.', source: 'Google', replied: true },
    { id: 2, customer: 'Alice Smith', rating: 4, date: '4 days ago', text: 'Great atmosphere, but we had to wait 10 minutes past our reservation time.', source: 'TripAdvisor', replied: false },
    { id: 3, customer: 'Robert Johnson', rating: 5, date: '1 week ago', text: 'Perfect for our anniversary dinner. Thank you for the complimentary dessert!', source: 'Direct', replied: true },
    { id: 4, customer: 'Emily Brown', rating: 2, date: '2 weeks ago', text: 'Very noisy and the service was quite slow today.', source: 'Google', replied: false },
  ]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} className={`w-3.5 h-3.5 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
    ));
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t("reviews.title")}</h1>
            <p className="text-xs text-slate-500 font-medium">{t("reviews.subtitle")}</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold shadow-sm">{t("reviews.enableAutoReply")}</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-100 shadow-sm bg-slate-900 text-white md:col-span-1">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("reviews.averageRating")}</CardDescription>
              <CardTitle className="text-4xl font-black mt-2">4.6</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center gap-1 mt-1 mb-3">
                {renderStars(5)}
              </div>
              <p className="text-xs text-slate-400 font-medium">{t("reviews.basedOn")}</p>
            </CardContent>
          </Card>

          <div className="md:col-span-3 space-y-4">
            {reviews.map(review => (
              <Card key={review.id} className="border-slate-100 shadow-sm overflow-hidden">
                <CardHeader className="p-4 bg-slate-50/50 border-b border-slate-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-800">{review.customer}</h3>
                        <Badge variant="outline" className="text-[9px] font-black uppercase text-slate-500 bg-white">
                          {review.source}
                        </Badge>
                        {review.replied && (
                          <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 text-[9px] font-black uppercase border-emerald-200 gap-1 px-1.5 shadow-none">
                            <CheckCircle2 className="w-3 h-3" /> {t("reviews.replied")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        {renderStars(review.rating)}
                        <span className="text-[10px] font-bold text-slate-400 ml-2">{review.date}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm text-slate-700 leading-relaxed">"{review.text}"</p>
                  
                  {!review.replied && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Reply className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Textarea 
                            placeholder={t("reviews.writeResponse")} 
                            className="min-h-[80px] text-xs resize-none border-slate-200 focus-visible:ring-blue-500"
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-xs font-bold text-slate-500">{t("reviews.aiDraft")}</Button>
                            <Button size="sm" className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700">{t("reviews.postReply")}</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
