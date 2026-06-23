-- CreateTable
CREATE TABLE "sponsor_invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "sponsor_name" TEXT NOT NULL,
    "sponsor_email" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "promotor_name" TEXT NOT NULL,
    "promotor_logo" TEXT,
    "bank_name" TEXT NOT NULL,
    "bank_account" TEXT NOT NULL,
    "account_holder" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "grand_total" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Belum Dibayar',
    "bonus_items" JSONB,
    "current_tier" TEXT NOT NULL,
    "next_tier" TEXT,
    "amount_to_upgrade" DECIMAL(15,2),
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promoter_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "logo_url" TEXT,
    "company_name" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "account_holder" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promoter_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_invoices_invoice_number_key" ON "sponsor_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "promoter_settings_user_id_key" ON "promoter_settings"("user_id");

-- AddForeignKey
ALTER TABLE "sponsor_invoices" ADD CONSTRAINT "sponsor_invoices_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "sponsor_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
