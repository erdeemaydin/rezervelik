import { useTranslation } from '@/i18n/provider';
import { useTenantStore } from '@/store/useTenantStore';
import { resolveTerm, type TermConcept } from '@/lib/terminology';

// Per-vertical terminology hook. Returns `term(concept)` bound to the current
// tenant's businessType (from useTenantStore) and the active locale, so dashboard
// UI can say "Court"/"Hall"/"Chair" instead of a hardcoded "Table". Falls back to
// RESTAURANT wording when the vertical or concept is unknown.
//
//   const { term } = useTerms();
//   <h1>{term('bookingPlural')}</h1>   // "Reservations" | "Randevular" | "Events" ...
export function useTerms() {
  const { locale } = useTranslation();
  const businessType = useTenantStore((s) => s.businessType);
  const term = (concept: TermConcept) => resolveTerm(businessType, locale, concept);
  return { term, businessType };
}
