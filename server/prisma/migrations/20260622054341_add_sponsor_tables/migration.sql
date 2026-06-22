-- CreateTable
CREATE TABLE "sponsor_deals" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "sponsor_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "code_used" TEXT NOT NULL,
    "total_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Negosiasi',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_packages" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_accounts" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "sponsor_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_accounts_deal_id_key" ON "client_accounts"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_accounts_username_key" ON "client_accounts"("username");

-- AddForeignKey
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "sponsor_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
