'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle, ShieldCheck, MessageSquare, UserRound } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import { requestOtp, verifyOtp, orderApiErrorCode, orderApiErrorMessage } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';

type Stage = 'phone' | 'code' | 'name';

const RESEND_COOLDOWN_SECONDS = 60;

export default function PhoneIdentify({
  restaurantId,
  theme,
  onIdentified,
  /** The sheet reuses this component in a narrow panel where the big
   *  illustrated header would crowd the list behind it. */
  compact = false,
}: {
  restaurantId: string;
  theme: OrderTheme;
  onIdentified: (customer: { id: string; name: string; phone: string }) => void;
  compact?: boolean;
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
      setResendIn(RESEND_COOLDOWN_SECONDS);
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

  const headline =
    stage === 'phone'
      ? t('publicOrder.identify.title')
      : stage === 'code'
        ? t('publicOrder.identify.codeTitle')
        : t('publicOrder.identify.nameTitle');
  const subhead =
    stage === 'phone'
      ? t('publicOrder.identify.subtitle')
      : stage === 'code'
        ? `${t('publicOrder.identify.codeSentTo')} ${phone}`
        : t('publicOrder.identify.nameSubtitle');
  const StageIcon = stage === 'phone' ? ShieldCheck : stage === 'code' ? MessageSquare : UserRound;

  return (
    <div className="mx-auto max-w-sm px-1 py-2">
      <div className={compact ? 'text-left' : 'text-center'}>
        {!compact && (
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: theme.primaryTint, color: theme.primary }}
          >
            <StageIcon className="h-7 w-7" />
          </div>
        )}
        <h2 className="text-lg font-black leading-tight" style={{ color: theme.text }}>
          {headline}
        </h2>
        <p className="mt-1 text-sm" style={{ color: theme.muted }}>
          {subhead}
        </p>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {stage === 'phone' && (
        <form onSubmit={handleRequestOtp} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
              {t('publicOrder.identify.phoneLabel')}
            </Label>
            <Input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('publicOrder.identify.phonePlaceholder')}
              className="h-12 text-center text-base font-semibold tracking-wide"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full text-sm font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publicOrder.identify.sendCodeButton')}
          </Button>
          <p className="text-center text-[11px] leading-snug" style={{ color: theme.muted }}>
            {t('publicOrder.identify.whyPhone')}
          </p>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={handleVerify} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
              {t('publicOrder.identify.codeLabel')}
            </Label>
            <Input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('publicOrder.identify.codePlaceholder')}
              className="h-14 text-center text-2xl font-black tracking-[0.4em]"
            />
          </div>
          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-xl p-3 text-xs"
            style={{ backgroundColor: theme.bg, color: theme.text }}
          >
            <Checkbox checked={trustDevice} onCheckedChange={setTrustDevice} className="h-4 w-4" />
            {t('publicOrder.identify.trustDeviceLabel')}
          </label>
          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full text-sm font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
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
              className="font-bold disabled:opacity-40"
              style={{ color: theme.primary }}
            >
              {resendIn > 0 ? `${t('publicOrder.identify.resendPrefix')} ${resendIn}s` : t('publicOrder.identify.resendButton')}
            </button>
          </div>
        </form>
      )}

      {stage === 'name' && (
        <form onSubmit={handleVerify} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
              {t('publicOrder.identify.nameLabel')}
            </Label>
            <Input
              required
              autoFocus
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('publicOrder.identify.namePlaceholder')}
              className="h-12 text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full text-sm font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('publicOrder.identify.verifyButton')}
          </Button>
        </form>
      )}
    </div>
  );
}
