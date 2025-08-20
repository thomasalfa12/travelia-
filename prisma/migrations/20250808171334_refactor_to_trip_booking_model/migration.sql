/*
  Warnings:

  - The values [PENDING] on the enum `TripStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `createdAt` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `destination` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `origin` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Trip` table. All the data in the column will be lost.
  - Added the required column `capacity` to the `Trip` table without a default value. This is not possible if the table is not empty.
  - Added the required column `departureTime` to the `Trip` table without a default value. This is not possible if the table is not empty.
  - Made the column `driverId` on table `Trip` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'WAITING_GROUP', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."TripStatus_new" AS ENUM ('WAITING_FOR_DRIVER', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Trip" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Trip" ALTER COLUMN "status" TYPE "public"."TripStatus_new" USING ("status"::text::"public"."TripStatus_new");
ALTER TYPE "public"."TripStatus" RENAME TO "TripStatus_old";
ALTER TYPE "public"."TripStatus_new" RENAME TO "TripStatus";
DROP TYPE "public"."TripStatus_old";
ALTER TABLE "public"."Trip" ALTER COLUMN "status" SET DEFAULT 'WAITING_FOR_DRIVER';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Trip" DROP CONSTRAINT "Trip_driverId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Trip" DROP CONSTRAINT "Trip_userId_fkey";

-- AlterTable
ALTER TABLE "public"."DriverProfile" ADD COLUMN     "domicile" TEXT;

-- AlterTable
ALTER TABLE "public"."Trip" DROP COLUMN "createdAt",
DROP COLUMN "destination",
DROP COLUMN "origin",
DROP COLUMN "price",
DROP COLUMN "userId",
ADD COLUMN     "capacity" INTEGER NOT NULL,
ADD COLUMN     "departureTime" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'WAITING_FOR_DRIVER',
ALTER COLUMN "driverId" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" SERIAL NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING',
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "passengers" INTEGER NOT NULL DEFAULT 1,
    "price" INTEGER NOT NULL,
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentGatewayId" TEXT,
    "userId" INTEGER NOT NULL,
    "tripId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
