-- AlterEnum
ALTER TYPE "public"."TripStatus" ADD VALUE 'ONGOING_PICKUP';

-- AlterTable
ALTER TABLE "public"."Trip" ADD COLUMN     "destination" TEXT,
ADD COLUMN     "seatsTaken" INTEGER NOT NULL DEFAULT 0;
