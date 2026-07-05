// Business verticals and their default feature profiles.
//
// A tenant's `businessType` (set by the SysAdmin) drives which of the existing
// RestaurantSettings feature flags default on when the vertical is chosen. These
// are DEFAULTS only — the SysAdmin can still override any individual flag; explicit
// flags in an update request win over the profile (see systemController).
//
// See MULTI_BUSINESS_ROADMAP.md §5 for the full per-vertical spec.

export const BUSINESS_TYPES = [
  'RESTAURANT',
  'SALON',
  'SPORTS',
  'COWORKING',
  'CLINIC',
  'WEDDING',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const DEFAULT_BUSINESS_TYPE: BusinessType = 'RESTAURANT';

export const isBusinessType = (value: unknown): value is BusinessType =>
  typeof value === 'string' && (BUSINESS_TYPES as readonly string[]).includes(value);

// The subset of RestaurantSettings boolean feature flags a profile can preset.
export interface FeatureProfile {
  isVipEnabled: boolean;
  isInternalNotesEnabled: boolean;
  isCategoriesEnabled: boolean;
  hasWaitTimeFeature: boolean;
  hasShiftFeature: boolean;
  hasMenuFeature: boolean;
  hasPaymentFeature: boolean;
  // Wedding/organization capabilities (default off; only the WEDDING profile enables).
  hasEventPipeline: boolean;
  hasInstallmentPlans: boolean;
  hasGuestList: boolean;
}

export const FEATURE_FLAG_KEYS: (keyof FeatureProfile)[] = [
  'isVipEnabled',
  'isInternalNotesEnabled',
  'isCategoriesEnabled',
  'hasWaitTimeFeature',
  'hasShiftFeature',
  'hasMenuFeature',
  'hasPaymentFeature',
  'hasEventPipeline',
  'hasInstallmentPlans',
  'hasGuestList',
];

// Non-wedding verticals share the same three wedding flags = off.
const NO_WEDDING = {
  hasEventPipeline: false,
  hasInstallmentPlans: false,
  hasGuestList: false,
} as const;

export const FEATURE_PROFILES: Record<BusinessType, FeatureProfile> = {
  RESTAURANT: {
    isVipEnabled: true,
    isInternalNotesEnabled: true,
    isCategoriesEnabled: true,
    hasWaitTimeFeature: true,
    hasShiftFeature: true,
    hasMenuFeature: true,
    hasPaymentFeature: true,
    ...NO_WEDDING,
  },
  SALON: {
    isVipEnabled: false,
    isInternalNotesEnabled: true,
    isCategoriesEnabled: true,
    hasWaitTimeFeature: true, // walk-ins
    hasShiftFeature: true,
    hasMenuFeature: true, // services
    hasPaymentFeature: true,
    ...NO_WEDDING,
  },
  SPORTS: {
    isVipEnabled: false,
    isInternalNotesEnabled: true,
    isCategoriesEnabled: true,
    hasWaitTimeFeature: false,
    hasShiftFeature: true,
    hasMenuFeature: false,
    hasPaymentFeature: true, // deposits
    ...NO_WEDDING,
  },
  COWORKING: {
    isVipEnabled: false,
    isInternalNotesEnabled: true,
    isCategoriesEnabled: false,
    hasWaitTimeFeature: false,
    hasShiftFeature: false,
    hasMenuFeature: false,
    hasPaymentFeature: true,
    ...NO_WEDDING,
  },
  CLINIC: {
    isVipEnabled: false,
    isInternalNotesEnabled: true,
    isCategoriesEnabled: true,
    hasWaitTimeFeature: false,
    hasShiftFeature: true,
    hasMenuFeature: true, // services / treatments
    hasPaymentFeature: false,
    ...NO_WEDDING,
  },
  WEDDING: {
    isVipEnabled: true, // VIP clients
    isInternalNotesEnabled: true,
    isCategoriesEnabled: false,
    hasWaitTimeFeature: false,
    hasShiftFeature: true,
    hasMenuFeature: true, // packages
    hasPaymentFeature: true, // deposits + installments
    hasEventPipeline: true,
    hasInstallmentPlans: true,
    hasGuestList: true,
  },
};

export const getFeatureProfile = (businessType: string): FeatureProfile =>
  FEATURE_PROFILES[isBusinessType(businessType) ? businessType : DEFAULT_BUSINESS_TYPE];
