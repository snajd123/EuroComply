-- CreateTable
CREATE TABLE "status_lists" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "encoded_list" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_lists_organization_id_key" ON "status_lists"("organization_id");
