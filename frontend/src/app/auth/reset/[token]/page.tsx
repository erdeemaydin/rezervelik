'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import api from '@/lib/api';
import { ShieldCheck, Loader2, XCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/auth/reset-password/${token}`);
        if (!active) return;
        setEmail(res.data?.data?.email || '');
        setStatus('valid');
      } catch {
        if (active) setStatus('invalid');
      }
    })();
    return () => { active = false; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    try {
      setLoading(true);
      await api.post('/auth/reset-password', { token, password });
      toast.success('Password updated. Please sign in with your new password.');
      router.push('/auth/login');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to reset password. The link may be expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="space-y-1 bg-slate-900 text-white rounded-t-lg p-6">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">Reset Your Password</CardTitle>
          <CardDescription className="text-slate-300 text-center text-xs">
            Choose a new, secure password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {status === 'checking' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">Verifying link…</span>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <XCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-bold text-slate-700">This reset link is invalid or has expired.</p>
              <p className="text-xs text-slate-400">Ask a system administrator to generate a new one.</p>
              <Button variant="outline" onClick={() => router.push('/auth/login')} className="mt-2 h-10 text-xs font-bold uppercase">
                Back to Sign In
              </Button>
            </div>
          )}

          {status === 'valid' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {email && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 text-emerald-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs font-bold">{email}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 uppercase">New Password</Label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 uppercase">Confirm Password</Label>
                <Input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-11" placeholder="••••••••" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-sm font-bold uppercase tracking-wide mt-4">
                {loading ? 'Updating…' : 'Update Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
