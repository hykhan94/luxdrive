-- CreateTable
CREATE TABLE "loyalty_config" (
    "id" TEXT NOT NULL,
    "pointsPerSar" INTEGER NOT NULL DEFAULT 1,
    "isPointsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "birthdayDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "isBirthdayDiscountEnabled" BOOLEAN NOT NULL DEFAULT true,
    "silverThreshold" INTEGER NOT NULL DEFAULT 500,
    "goldThreshold" INTEGER NOT NULL DEFAULT 2000,
    "platinumThreshold" INTEGER NOT NULL DEFAULT 5000,
    "freeRideEconomy" INTEGER NOT NULL DEFAULT 1000,
    "freeRideBusiness" INTEGER NOT NULL DEFAULT 2000,
    "freeRideFirstClass" INTEGER NOT NULL DEFAULT 3500,
    "freeRideBusinessSuv" INTEGER NOT NULL DEFAULT 3000,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "loyalty_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "bookingConfirmationTemplate" TEXT NOT NULL DEFAULT 'Dear {{customerName}}, your booking {{bookingRef}} has been confirmed.

Trip Details:
Date: {{tripDate}}
Time: {{tripTime}}
Pickup: {{pickupAddress}}
Dropoff: {{dropoffAddress}}
Vehicle: {{vehicleClass}}

Driver: {{driverName}}
Contact: {{driverPhone}}

Thank you for choosing LuxDrive!',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);
