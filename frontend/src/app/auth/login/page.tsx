'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface OtpChallenge {
  otpToken: string;
  setupRequired: boolean;
  otpauthUrl?: string;
  otpSecret?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState('');

  // Second-factor challenge, present only when the account requires OTP.
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.role === 'SUPER_ADMIN') {
        window.location.href = '/system-admin/tenants';
      } else {
        window.location.href = '/dashboard';
      }
    }
  }, [isAuthenticated, user]);

  const finishLogin = (token: string, user: any) => {
    login(token, user);
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
        finishLogin(data.token, data.user);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred during login');
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    try {
      setError('');
      setOtpBusy(true);
      const res = await api.post('/auth/login/otp', { otpToken: challenge.otpToken, code: otpCode });
      finishLogin(res.data.data.token, res.data.data.user);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid or expired code');
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        {!challenge ? (
          <>
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
              <CardDescription>Enter your email and password to access your dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="admin@restaurant.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
                  <Button type="submit" className="w-full">Sign In</Button>
                </form>
              </Form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">Two-Factor Verification</CardTitle>
              <CardDescription>
                {challenge.setupRequired
                  ? 'Your administrator requires 2FA. Scan the QR code with an authenticator app, then enter the 6-digit code.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitOtp} className="space-y-4">
                {challenge.setupRequired && challenge.otpauthUrl && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <QRCodeSVG value={challenge.otpauthUrl} size={160} />
                    </div>
                    {challenge.otpSecret && (
                      <div className="w-full text-center">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Manual key</Label>
                        <code className="block text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-1 break-all">{challenge.otpSecret}</code>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase">Verification Code</Label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoFocus
                    placeholder="123456"
                    className="h-12 text-xl font-black tracking-[0.4em] text-center"
                  />
                </div>
                {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
                <Button type="submit" disabled={otpBusy || otpCode.length !== 6} className="w-full">
                  {otpBusy ? 'Verifying…' : 'Verify & Sign In'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setChallenge(null); setOtpCode(''); setError(''); }} className="w-full text-xs text-slate-500">
                  Back to sign in
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
