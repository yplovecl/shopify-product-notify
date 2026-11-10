-- CreateTable
CREATE TABLE `ShopDomain` (
    `shop` VARCHAR(191) NOT NULL,
    `resendId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(253) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `region` VARCHAR(32) NOT NULL,
    `records` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShopDomain_name_key`(`name`),
    PRIMARY KEY (`shop`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
