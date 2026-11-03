-- CreateTable
CREATE TABLE "ShopSender" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
