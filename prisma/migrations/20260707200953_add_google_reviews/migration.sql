-- Google Business Profile link + resolved Place ID for surfacing real Google
-- reviews on the dashboard Reviews page.
ALTER TABLE "RestaurantSettings" ADD COLUMN "googleMapsUrl" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN "googlePlaceId" TEXT;
