-- Each room has its own furniture budget (CAD), set before the room is built. Null = not set yet.
ALTER TABLE "rooms" ADD COLUMN "budget_cad" DOUBLE PRECISION;

-- Every room kind is furnished now (bedrooms, bathrooms, closets, halls, balconies…): rooms a floor-plan read kept
-- on the plan only get their own page.
UPDATE "rooms" SET "furnish" = true WHERE "furnish" = false;
