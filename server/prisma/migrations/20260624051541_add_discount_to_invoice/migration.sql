-- AlterTable
ALTER TABLE "sponsor_invoices" ADD COLUMN     "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoice_source" TEXT NOT NULL DEFAULT 'alacarte',
ADD COLUMN     "items_subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0;
