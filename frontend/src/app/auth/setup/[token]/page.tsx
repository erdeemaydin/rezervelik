'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useTranslation } from '@/i18n/provider';

export default function SetupAccountPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
  const login = useAuthStore((state) => state.login);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const token = params.token as string;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsDontMatch'));
      return;
    }

    if (password.length < 8) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/setup', {
        token,
        password
      });

      const { user, token: authToken } = response.data.data;
      
      // Store the auth token and user info
      login(authToken, user);
      
      toast.success(t('auth.setupComplete'));
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="space-y-1 bg-slate-900 text-white rounded-t-lg p-6">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">{t('auth.setupTitle')}</CardTitle>
          <CardDescription className="text-slate-300 text-center text-xs">
            {t('auth.setupSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 uppercase">{t('auth.newPassword')}</Label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 uppercase">{t('auth.confirmPassword')}</Label>
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11"
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-sm font-bold uppercase tracking-wide mt-4"
            >
              {loading ? t('auth.settingUp') : t('auth.completeSetup')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
