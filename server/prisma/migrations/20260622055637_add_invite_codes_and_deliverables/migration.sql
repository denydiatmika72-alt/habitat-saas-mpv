-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "event_id" TEXT,
    "created_by" TEXT NOT NULL,
    "used_by" TEXT,
    "used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_deliverables" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Planning',
    "proof_image_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- AddForeignKey
ALTER TABLE "sponsor_deliverables" ADD CONSTRAINT "sponsor_deliverables_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "sponsor_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
