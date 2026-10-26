'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Password field with a show/hide toggle. Forwards all the usual input props
// (value, onChange, autoComplete, placeholder…) and adds the eye button so we
// don't repeat this on every auth screen. `autoComplete` should be
// "current-password" on login and "new-password" on setup/reset/change.
type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  showLabel?: string;
  hideLabel?: string;
};

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showLabel = 'Show password', hideLabel = 'Hide password', ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          // Never let a password field auto-capitalize/correct/spellcheck.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
