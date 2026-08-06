-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "upgradeAllowedClasses" "VehicleClass"[] DEFAULT ARRAY[]::"VehicleClass"[];
