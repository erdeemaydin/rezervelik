import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Lock } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

interface PasswordConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  isDangerous?: boolean;
}

export function PasswordConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Confirm Password',
  description = 'Please enter your password to confirm this action.',
  actionLabel = 'Confirm Action',
  isDangerous = true
}: PasswordConfirmDialogProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error('Password is required');
      return;
    }

    try {
      setLoading(true);
      await api.post('/auth/verify-password', { password });
      // If success, proceed
      setPassword('');
      onOpenChange(false);
      onConfirm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) setPassword('');
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              {isDangerous ? <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400" /> : <Lock className="w-5 h-5 text-blue-500" />}
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="password">Administrator Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !password}
              className={isDangerous ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
            >
              {loading ? 'Verifying...' : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
