'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, ShieldCheck, ShieldAlert, Loader2, Lock, User as UserIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { evaluatePassword } from '@/lib/passwordPolicy';
import { getApiErrorMessage } from '@/lib/apiError';

interface MeProfile {
  id: string; email: string; firstName: string; lastName: string; role: string;
  otpRequired: boolean; otpEnrolled: boolean;
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const [me, setMe] = useState<MeProfile | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // 2FA enrollment state
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  const fetchMe = async () => {
    try {
      const res = await api.get('/auth/me');
      setMe(res.data.data);
    } catch {
      toast.error(t('profile.loadFailed'));
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const pwValid = evaluatePassword(newPassword).valid;
  const pwMatches = newPassword.length > 0 && newPassword === confirmPassword;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwValid) { toast.error(t('auth.passwordPolicyUnmet')); return; }
    if (newPassword !== confirmPassword) { toast.error(t('profile.passwordsMismatch')); return; }
    try {
      setSavingPw(true);
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success(t('profile.passwordChanged'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, t('profile.passwordChangeFailed')));
    } finally { setSavingPw(false); }
  };

  const startSetup = async () => {
    try {
      setOtpBusy(true);
      const res = await api.post('/auth/2fa/setup');
      setSetupUri(res.data.data.otpauthUrl);
      setSetupSecret(res.data.data.otpSecret);
    } catch {
      toast.error(t('profile.twoFactorSetupFailed'));
    } finally { setOtpBusy(false); }
  };

  const confirmSetup = async () => {
    try {
      setOtpBusy(true);
      await api.post('/auth/2fa/confirm', { code: otpCode });
      toast.success(t('profile.twoFactorEnabled'));
      setSetupUri(null); setSetupSecret(null); setOtpCode('');
      fetchMe();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile.twoFactorCodeInvalid'));
    } finally { setOtpBusy(false); }
  };

  return (
    <>
      <div className="flex flex-col gap-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('profile.title')}</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">{t('profile.subtitle')}</p>
        </div>

        {/* Identity */}
        <Card className="rounded-xl border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-600"><UserIcon className="w-6 h-6" /></div>
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight">{me ? `${me.firstName} ${me.lastName}` : '—'}</CardTitle>
              <CardDescription className="text-sm">{me?.email}</CardDescription>
            </div>
            {me && <Badge className="ml-auto bg-blue-50 text-blue-700 border-blue-200 uppercase text-[10px] font-black">{me.role}</Badge>}
          </CardHeader>
        </Card>

        {/* Change password */}
        <Card className="rounded-xl border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-lg text-amber-600"><Lock className="w-6 h-6" /></div>
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight">{t('profile.changePassword')}</CardTitle>
              <CardDescription className="text-sm">{t('profile.changePasswordDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div className="grid gap-2">
                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t('profile.currentPassword')}</Label>
                <PasswordInput required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className="h-11" placeholder="••••••••" showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t('profile.newPassword')}</Label>
                <PasswordInput required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className="h-11" placeholder="••••••••" showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
                <PasswordStrength password={newPassword} className="pt-1" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t('profile.confirmNewPassword')}</Label>
                <PasswordInput required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="h-11" placeholder="••••••••" showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
                {confirmPassword.length > 0 && !pwMatches && (
                  <p className="text-xs font-medium text-red-600">{t('profile.passwordsMismatch')}</p>
                )}
              </div>
              <Button type="submit" disabled={savingPw || !pwValid || !pwMatches} className="h-11 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase px-8 rounded-md">
                {savingPw ? t('profile.saving') : t('profile.updatePassword')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Two-factor */}
        <Card className="rounded-xl border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-lg text-emerald-600"><ShieldCheck className="w-6 h-6" /></div>
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight">{t('profile.twoFactor')}</CardTitle>
              <CardDescription className="text-sm">{t('profile.twoFactorDesc')}</CardDescription>
            </div>
            {me && (
              <Badge className={`ml-auto uppercase text-[10px] font-black ${me.otpEnrolled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : me.otpRequired ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {me.otpEnrolled ? t('profile.twoFactorActive') : me.otpRequired ? t('profile.twoFactorPending') : t('profile.twoFactorOff')}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-6">
            {!me ? (
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold"><Loader2 className="w-4 h-4 animate-spin" /> {t('profile.loading')}</div>
            ) : me.otpEnrolled ? (
              <div className="flex items-center gap-3 text-emerald-700">
                <ShieldCheck className="w-5 h-5" />
                <p className="text-sm font-bold">{t('profile.twoFactorActiveDesc')}</p>
              </div>
            ) : !me.otpRequired ? (
              <div className="flex items-center gap-3 text-slate-500">
                <ShieldAlert className="w-5 h-5 text-slate-400" />
                <p className="text-sm font-medium">{t('profile.twoFactorAdminControlled')}</p>
              </div>
            ) : setupUri ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 font-medium">{t('profile.twoFactorScan')}</p>
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                    <QRCodeSVG value={setupUri} size={160} />
                  </div>
                  <div className="space-y-3 flex-1">
                    <div className="grid gap-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('profile.twoFactorManualKey')}</Label>
                      <code className="text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 break-all">{setupSecret}</code>
                    </div>
                    <div className="grid gap-1.5 max-w-[220px]">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('profile.twoFactorEnterCode')}</Label>
                      <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="123456" className="h-11 text-lg font-black tracking-[0.3em] text-center" />
                    </div>
                    <Button onClick={confirmSetup} disabled={otpBusy || otpCode.length !== 6} className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase px-6 rounded-md">
                      {otpBusy ? t('profile.verifying') : t('profile.twoFactorVerifyEnable')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <ShieldAlert className="w-5 h-5" />
                  <p className="text-sm font-bold">{t('profile.twoFactorRequiredNotice')}</p>
                </div>
                <Button onClick={startSetup} disabled={otpBusy} className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase px-8 rounded-md">
                  <KeyRound className="w-4 h-4 mr-2" /> {otpBusy ? t('profile.saving') : t('profile.twoFactorSetUp')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
