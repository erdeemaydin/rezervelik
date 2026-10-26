-- Enforce "only one active menu per restaurant" at the database level.
-- The application already tries to enforce this (menuController.ts createMenu/updateMenu)
-- via check-then-write inside a transaction, but that's a race under concurrent requests
-- (e.g. a double-click on Save, or two menus activated from two tabs at once).
-- This partial unique index is the authoritative guard; the app-level check just gives a
-- friendlier error before the DB would reject it.

-- Repair any pre-existing violations before adding the constraint: keep the most recently
-- updated active menu per restaurant, deactivate the rest.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "restaurantId" ORDER BY "updatedAt" DESC) AS rn
  FROM "Menu"
  WHERE "isActive" = true
)
UPDATE "Menu"
SET "isActive" = false
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "Menu_restaurantId_active_unique"
  ON "Menu" ("restaurantId")
  WHERE "isActive" = true;
