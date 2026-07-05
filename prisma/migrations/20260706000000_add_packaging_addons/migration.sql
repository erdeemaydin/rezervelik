-- Commercial add-on packages (SysAdmin-controlled). See docs/packaging/.
--   * Hosted Frontend  -> we serve the tenant's booking site on their own domain
--   * Reservation Widget -> embeddable JS/iframe + native SDKs for the tenant's own site
-- Additive columns on Restaurant; all default to the "not purchased" state.

ALTER TABLE "Restaurant" ADD COLUMN "hasHostedFrontend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Restaurant" ADD COLUMN "hasReservationWidget" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "publicApiKey" TEXT;

CREATE UNIQUE INDEX "Restaurant_customDomain_key" ON "Restaurant"("customDomain");
CREATE UNIQUE INDEX "Restaurant_publicApiKey_key" ON "Restaurant"("publicApiKey");
