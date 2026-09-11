'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import { requestOtp, verifyOtp, orderApiErrorCode, orderApiErrorMessage } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';

type Stage = 'phone' | 'code' | 'name';

export default function PhoneIdentify({
  restaurantId,
  theme,
  onIdentified,
}: {
  restaurantId: string;
  theme: OrderTheme;
  onIdentified: (customer: { id: string; name: string; phone: string }) => void;
}) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const handleRequestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!phone.trim() || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      await requestOtp(restaurantId, phone.trim());
      setStage('code');
      setResendIn(60);
    } catch (err) {
      setError(orderApiErrorMessage(err, t('publicOrder.identify.requestFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim() || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const payload: { phone: string; code: string; trustDevice: boolean; name?: string } = {
        phone: phone.trim(),
        code: code.trim(),
        trustDevice,
      };
      if (stage === 'name' && name.trim()) payload.name = name.trim();
      const result = await verifyOtp(restaurantId, payload);
      onIdentified(result.customer);
    } catch (err) {
      if (orderApiErrorCode(err) === 'errors.order_name_required') {
        setStage('name');
      } else {
        setError(orderApiErrorMessage(err, t('publicOrder.identify.verifyFailed')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const changePhone = () => {
    setStage('phone');
    setCode('');
    setName('');
    setError(null);
    setResendIn(0);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold" style={{ color: theme.muted }}>{t('publicOrder.identify.title')}</h2>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {stage === 'phone' && (
        <form onSubmit={handleRequestOtp} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.identify.phoneLabel')}</Label>
            <Input
              required
              type="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('publicOrder.identify.phonePlaceholder')}
              className="h-11 text-base"
            />
          </div>
          <Button type="submit" disabled={submitting} className="h-11 w-full text-sm font-bold text-white" style={{ backgroundColor: theme.primary }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publicOrder.identify.sendCodeButton')}
          </Button>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={handleVerify} className="space-y-3">
          <p className="text-xs" style={{ color: theme.muted }}>{t('publicOrder.identify.codeSentTo')} {phone}</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.identify.codeLabel')}</Label>
            <Input
              required
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('publicOrder.identify.codePlaceholder')}
              className="h-11 text-center text-lg tracking-[0.4em]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: theme.muted }}>
            <Checkbox checked={trustDevice} onCheckedChange={setTrustDevice} className="h-4 w-4" />
            {t('publicOrder.identify.trustDeviceLabel')}
          </label>
          <Button type="submit" disabled={submitting} className="h-11 w-full text-sm font-bold text-white" style={{ backgroundColor: theme.primary }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publicOrder.identify.verifyButton')}
          </Button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={changePhone} className="underline" style={{ color: theme.muted }}>
              {t('publicOrder.identify.changePhoneButton')}
            </button>
            <button
              type="button"
              disabled={resendIn > 0 || submitting}
              onClick={() => handleRequestOtp()}
              className="font-semibold disabled:opacity-40"
              style={{ color: theme.primary }}
            >
              {resendIn > 0 ? `${t('publicOrder.identify.resendPrefix')} ${resendIn}s` : t('publicOrder.identify.resendButton')}
            </button>
          </div>
        </form>
      )}

      {stage === 'name' && (
        <form onSubmit={handleVerify} className="space-y-3">
          <p className="text-xs" style={{ color: theme.muted }}>{t('publicOrder.identify.nameSubtitle')}</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.identify.nameLabel')}</Label>
            <Input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('publicOrder.identify.namePlaceholder')}
              className="h-11 text-base"
            />
          </div>
          <Button type="submit" disabled={submitting} className="h-11 w-full text-sm font-bold text-white" style={{ backgroundColor: theme.primary }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publicOrder.identify.verifyButton')}
          </Button>
        </form>
      )}
    </div>
  );
}
