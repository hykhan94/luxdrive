-- CreateTable
CREATE TABLE "distance_pricing" (
    "id" TEXT NOT NULL,
    "vehicleClass" "VehicleClass" NOT NULL,
    "tier1Base" DECIMAL(10,2) NOT NULL,
    "tier2Base" DECIMAL(10,2) NOT NULL,
    "tier3PerKm" DECIMAL(10,2) NOT NULL,
    "tier4PerKm" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distance_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peak_pricing_config" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "multiplier" DECIMAL(3,2) NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "peak_pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_service_pricing" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_service_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_config" (
    "id" TEXT NOT NULL,
    "marginPercent" DECIMAL(5,2) NOT NULL,
    "vatPercent" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_pricing" (
    "id" TEXT NOT NULL,
    "configType" TEXT NOT NULL,
    "configData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "default_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "distance_pricing_vehicleClass_key" ON "distance_pricing"("vehicleClass");

-- CreateIndex
CREATE UNIQUE INDEX "additional_service_pricing_serviceType_key" ON "additional_service_pricing"("serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "default_pricing_configType_key" ON "default_pricing"("configType");
