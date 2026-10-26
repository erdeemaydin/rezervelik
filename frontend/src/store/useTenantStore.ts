import { create } from 'zustand';
import { DEFAULT_BUSINESS_TYPE } from '@/lib/terminology';

interface TenantState {
  // The tenant's vertical (RESTAURANT, SALON, SPORTS, COWORKING, CLINIC, WEDDING),
  // set by the SysAdmin. Hydrated from GET /settings in AdminLayout; defaults to
  // RESTAURANT until loaded. Drives per-vertical terminology labels (useTerms).
  businessType: string;
  setBusinessType: (businessType: string) => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  businessType: DEFAULT_BUSINESS_TYPE,
  setBusinessType: (businessType) => set({ businessType: businessType || DEFAULT_BUSINESS_TYPE }),
}));
