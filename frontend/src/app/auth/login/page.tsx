'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, UtensilsCrossed, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Login only requires a non-empty password — the account may predate the current
// password policy (legacy/weak passwords are still valid and must sign in). The
// policy is enforced only when a password is *set* (setup/reset/change).
const formSchema = z.object({
  email: z.string().email('auth.emailInvalid'),
  password: z.string().min(1, 'auth.passwordRequired'),
});

interface OtpChallenge {
  otpToken: string;
  setupRequired: boolean;
  otpauthUrl?: string;
  otpSecret?: string;
}

// HOST staff work the host stand, not the back-office dashboard — land them
// there directly instead of /dashboard (which they don't have view_analytics
// for anyway, so AdminLayout's route guard would just bounce them elsewhere).
// KITCHEN staff go even further outside the dashboard entirely: the order
// station is a separate full-screen route that doesn't use AdminLayout chrome
// at all (unlike /dashboard/host, which stays inside it).
const defaultRouteForRole = (role: string): string => {
  if (role === 'SUPER_ADMIN') return '/system-admin/tenants';
  if (role === 'HOST') return '/dashboard/host';
  if (role === 'KITCHEN') return '/order-station';
  return '/dashboard';
};

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentUser = useAuthStore((state) => state.user);
  const [error, setError] = useState('');
  // Covers the gap between a successful login and the route actually changing:
  // react-hook-form's isSubmitting flips back to false the moment onSubmit
  // returns, but the navigation to /dashboard hasn't painted yet — without this
  // the button would go idle for ~1–2s and the user is left wondering if it
  // worked. A full-screen overlay makes the transition unmistakably "in progress".
  const [redirecting, setRedirecting] = useState(false);

  // Server-side proxy no longer bounces logged-in users off /auth/login (token
  // is in localStorage, not a readable cookie) — do it on the client instead.
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      router.replace(defaultRouteForRole(currentUser.role));
    }
  }, [isAuthenticated, currentUser, router]);

  // Second-factor challenge, present only when the account requires OTP.
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  const finishLogin = (user: any) => {
    setRedirecting(true);
    login(user);
    router.push(defaultRouteForRole(user.role));
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setError('');
      const response = await api.post('/auth/login', values);
      if (response.data.success) {
        const data = response.data.data;
        if (data.otpRequired) {
          setChallenge({
            otpToken: data.otpToken,
            setupRequired: !!data.setupRequired,
            otpauthUrl: data.otpauthUrl,
            otpSecret: data.otpSecret,
          });
          return;
        }
        finishLogin(data.user);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, t('auth.loginError')));
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    try {
      setError('');
      setOtpBusy(true);
      const res = await api.post('/auth/login/otp', { otpToken: challenge.otpToken, code: otpCode });
      finishLogin(res.data.data.user);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t('auth.invalidCode')));
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr] bg-stone-50">
      {/* Post-login transition veil — keeps a clear "signing you in…" state on
          screen until the dashboard route paints, so the wait never looks frozen. */}
      {redirecting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-stone-50/90 backdrop-blur-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-rose-800 text-white shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="text-sm font-bold text-stone-600">{t('auth.signingIn')}</p>
        </div>
      )}
      {/* Brand panel — warm hospitality gradient. Hidden on small screens. */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-amber-700 via-orange-800 to-rose-900 p-12 text-amber-50">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-amber-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-rose-500/20 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50/15 ring-1 ring-amber-50/25 backdrop-blur">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <span className="text-xl font-black tracking-tight">
            Rezerve<span className="text-amber-300">lik</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-black leading-tight tracking-tight">
            {t('auth.signInTitle')}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-amber-100/85">
            {t('auth.brandTagline')}
          </p>
        </div>
        <div className="relative text-xs font-medium text-amber-100/60">
          © {new Date().getFullYear()} Rezervelik
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-sm">
          {/* Compact brand mark for mobile (brand panel is hidden there). */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-rose-800 text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <span className="text-lg font-black tracking-tight text-stone-800">
              Rezerve<span className="text-amber-700">lik</span>
            </span>
          </div>

          {!challenge ? (
            <>
              <div className="mb-6 space-y-1">
                <h2 className="text-2xl font-black tracking-tight text-stone-900">{t('auth.signInTitle')}</h2>
                <p className="text-sm text-stone-500">{t('auth.signInSubtitle')}</p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-stone-700">{t('auth.emailLabel')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            autoFocus
                            placeholder={t('auth.emailPlaceholder')}
                            className="h-11"
                          />
                        </FormControl>
                        {form.formState.errors.email?.message && (
                          <p className="text-sm font-medium text-destructive">
                            {t(form.formState.errors.email.message)}
                          </p>
                        )}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-stone-700">{t('auth.passwordLabel')}</FormLabel>
                        <FormControl>
                          <PasswordInput
                            {...field}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="h-11"
                            showLabel={t('auth.showPassword')}
                            hideLabel={t('auth.hidePassword')}
                          />
                        </FormControl>
                        {form.formState.errors.password?.message && (
                          <p className="text-sm font-medium text-destructive">
                            {t(form.formState.errors.password.message)}
                          </p>
                        )}
                      </FormItem>
                    )}
                  />

                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || redirecting}
                    className="h-11 w-full bg-stone-900 text-sm font-bold tracking-wide hover:bg-stone-800"
                  >
                    {(form.formState.isSubmitting || redirecting) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {form.formState.isSubmitting || redirecting ? t('auth.signingIn') : t('auth.signInButton')}
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-black tracking-tight text-stone-900">{t('auth.twoFactorTitle')}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {challenge.setupRequired ? t('auth.twoFactorSetupDesc') : t('auth.twoFactorDesc')}
                </p>
              </div>

              <form onSubmit={submitOtp} className="space-y-4">
                {challenge.setupRequired && challenge.otpauthUrl && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
                      <QRCodeSVG value={challenge.otpauthUrl} size={160} />
                    </div>
                    {challenge.otpSecret && (
                      <div className="w-full text-center">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                          {t('auth.manualKey')}
                        </Label>
                        <code className="mt-1 block break-all rounded border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs">
                          {challenge.otpSecret}
                        </code>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-stone-700">{t('auth.verificationCode')}</Label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="123456"
                    className="h-12 text-center text-xl font-black tracking-[0.4em]"
                  />
                </div>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={otpBusy || redirecting || otpCode.length !== 6}
                  className="h-11 w-full bg-stone-900 font-bold hover:bg-stone-800"
                >
                  {(otpBusy || redirecting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {otpBusy || redirecting ? t('auth.verifying') : t('auth.verifyAndSignIn')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setChallenge(null);
                    setOtpCode('');
                    setError('');
                  }}
                  className="w-full text-xs text-stone-500"
                >
                  {t('auth.backToSignIn')}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
