'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { evaluatePassword } from '@/lib/passwordPolicy';
import { useTranslation } from '@/i18n/provider';
import { BrandLogo } from '@/components/BrandLogo';

export default function SetupAccountPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
  const login = useAuthStore((state) => state.login);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const token = params.token as string;
  const { valid } = evaluatePassword(password);
  const matches = password.length > 0 && password === confirmPassword;
  const canSubmit = valid && matches && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!valid) {
      toast.error(t('auth.passwordPolicyUnmet'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsDontMatch'));
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/setup', { token, password });

      const { user } = response.data.data;
      login(user);

      toast.success(t('auth.setupComplete'));
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, t('auth.setupFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#ecf0f5] p-4">
      <BrandLogo size={40} tile="#1f6fb2" textClassName="text-2xl text-[#1f2d3d]" />
      <Card className="w-full max-w-md gap-0 py-0 rounded-[4px] border border-[#9ca8b7] shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
        <CardHeader className="space-y-1 bg-[#222d32] border-t-[3px] border-t-[#1f6fb2] text-white p-6">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">{t('auth.setupTitle')}</CardTitle>
          <CardDescription className="text-[#b8c7ce] text-center text-xs">
            {t('auth.setupSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-stone-700 uppercase">{t('auth.newPassword')}</Label>
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11"
                placeholder="••••••••"
                showLabel={t('auth.showPassword')}
                hideLabel={t('auth.hidePassword')}
              />
              <PasswordStrength password={password} className="pt-1" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-stone-700 uppercase">{t('auth.confirmPassword')}</Label>
              <PasswordInput
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11"
                placeholder="••••••••"
                showLabel={t('auth.showPassword')}
                hideLabel={t('auth.hidePassword')}
              />
              {confirmPassword.length > 0 && !matches && (
                <p className="text-xs font-medium text-red-600">{t('auth.passwordsDontMatch')}</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-11 bg-stone-900 hover:bg-stone-800 text-sm font-bold uppercase tracking-wide mt-2"
            >
              {loading ? t('auth.settingUp') : t('auth.completeSetup')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
