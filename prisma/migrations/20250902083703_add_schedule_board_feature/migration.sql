-- CreateEnum
CREATE TYPE "public"."ScheduleStatus" AS ENUM ('AVAILABLE', 'CLAIMED', 'EXPIRED');

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "scheduleId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Schedule" (
    "id" SERIAL NOT NULL,
    "status" "public"."ScheduleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "departureTime" TIMESTAMP(3) NOT NULL,
    "originArea" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "totalPassengers" INTEGER NOT NULL,
    "tripId" INTEGER,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_tripId_key" ON "public"."Schedule"("tripId");

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Schedule" ADD CONSTRAINT "Schedule_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
