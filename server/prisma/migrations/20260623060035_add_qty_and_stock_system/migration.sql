-- AlterTable
ALTER TABLE "sponsor_benefits" ADD COLUMN     "held_qty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_qty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "used_qty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sponsor_deals" ADD COLUMN     "package_id" TEXT;

-- AlterTable
ALTER TABLE "sponsor_package_benefits" ADD COLUMN     "qty" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "sponsor_deal_benefits" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "benefit_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_deal_benefits_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sponsor_deal_benefits" ADD CONSTRAINT "sponsor_deal_benefits_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "sponsor_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_deal_benefits" ADD CONSTRAINT "sponsor_deal_benefits_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "sponsor_benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
