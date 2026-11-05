-- CreateTable
CREATE TABLE "CustomerDataRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "shopifyRequestId" TEXT,
    "found" BOOLEAN NOT NULL,
    "subscribedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CustomerDataRequest_shop_createdAt_idx" ON "CustomerDataRequest"("shop", "createdAt");
