-- CreateTable
CREATE TABLE `CustomerDataRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `shopifyRequestId` VARCHAR(64) NULL,
    `found` BOOLEAN NOT NULL,
    `subscribedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerDataRequest_shop_createdAt_idx`(`shop`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
