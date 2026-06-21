-- AlterTable: Add qty and hargaSatuan columns to budget_items
ALTER TABLE "budget_items" ADD COLUMN "qty" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "budget_items" ADD COLUMN "hargaSatuan" DECIMAL(15,2) NOT NULL DEFAULT 0;
