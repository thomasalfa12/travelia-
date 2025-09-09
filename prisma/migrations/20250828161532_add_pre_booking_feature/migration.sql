-- AlterEnum
ALTER TYPE "public"."BookingStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "scheduledDepartureTime" TIMESTAMP(3);
