-- CreateTable
CREATE TABLE "sponsor_benefits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_package_benefits" (
    "package_id" TEXT NOT NULL,
    "benefit_id" TEXT NOT NULL,

    CONSTRAINT "sponsor_package_benefits_pkey" PRIMARY KEY ("package_id","benefit_id")
);

-- CreateTable
CREATE TABLE "sponsor_thresholds" (
    "id" TEXT NOT NULL,
    "tier_name" TEXT NOT NULL,
    "min_price" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_thresholds_tier_name_key" ON "sponsor_thresholds"("tier_name");

-- AddForeignKey
ALTER TABLE "sponsor_package_benefits" ADD CONSTRAINT "sponsor_package_benefits_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "sponsor_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_package_benefits" ADD CONSTRAINT "sponsor_package_benefits_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "sponsor_benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
