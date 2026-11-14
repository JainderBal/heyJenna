-- Room kind (bedroom, kitchen, closet…) and whether it gets furniture.
ALTER TABLE "rooms" ADD COLUMN "kind" TEXT;
ALTER TABLE "rooms" ADD COLUMN "furnish" BOOLEAN NOT NULL DEFAULT true;
