-- CreateEnum
CREATE TYPE "RouteType" AS ENUM ('ONE_WAY', 'HOURLY');

-- CreateTable
CREATE TABLE "route_tariffs" (
    "id" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "routeType" "RouteType" NOT NULL,
    "routeName" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropoffLocation" TEXT NOT NULL,
    "economySedan" DECIMAL(10,2),
    "businessSedan" DECIMAL(10,2),
    "firstClass" DECIMAL(10,2),
    "businessSuv" DECIMAL(10,2),
    "hiace" DECIMAL(10,2),
    "coaster" DECIMAL(10,2),
    "kingLong" DECIMAL(10,2),
    "isPerKm" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electric_tariffs" (
    "id" TEXT NOT NULL,
    "city" "City" NOT NULL DEFAULT 'RIYADH',
    "routeName" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropoffLocation" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "isPerKm" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electric_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electric_fleet_config" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electric_fleet_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_change_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "vehicleClass" TEXT,
    "oldValue" DECIMAL(10,2),
    "newValue" DECIMAL(10,2),
    "bulkPercent" DECIMAL(5,2),
    "city" "City",
    "routeType" "RouteType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tariff_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "route_tariffs_city_idx" ON "route_tariffs"("city");

-- CreateIndex
CREATE INDEX "route_tariffs_routeType_idx" ON "route_tariffs"("routeType");

-- CreateIndex
CREATE UNIQUE INDEX "route_tariffs_city_routeType_routeName_key" ON "route_tariffs"("city", "routeType", "routeName");

-- CreateIndex
CREATE UNIQUE INDEX "electric_tariffs_city_routeName_key" ON "electric_tariffs"("city", "routeName");

-- CreateIndex
CREATE INDEX "tariff_change_logs_createdAt_idx" ON "tariff_change_logs"("createdAt");
