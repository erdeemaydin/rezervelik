import { PaymentProvider } from './types';
import { PayTRProvider } from './PayTRProvider';
import { MockProvider } from './MockProvider';

export * from './types';
export { PayTRProvider } from './PayTRProvider';
export { MockProvider } from './MockProvider';

let cached: PaymentProvider | null = null;

// Single place that decides which gateway is live. Change PAYMENT_PROVIDER (or add
// a new adapter here) to swap providers — nothing else in the app changes.
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const which = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();
  switch (which) {
    case 'paytr':
      cached = new PayTRProvider();
      break;
    case 'mock':
    default:
      cached = new MockProvider();
      break;
  }
  return cached;
}

export const isMockProvider = () => (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase() !== 'paytr';
