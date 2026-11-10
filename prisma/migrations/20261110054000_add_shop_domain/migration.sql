-- CreateTable
CREATE TABLE "ShopDomain" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "resendId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "records" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopDomain_name_key" ON "ShopDomain"("name");
