// ============================================
// apps/server/src/utils/helpers/pricing.helpers.ts
// ============================================

export interface PriceCalculation {
  base: number;
  margin: number;
  peak: number;
  vat: number;
  total: number;
  breakdown: {
    basePrice: number;
    marginPercent: number;
    marginAmount: number;
    peakMultiplier: number;
    peakAmount: number;
    vatPercent: number;
    vatAmount: number;
  };
}

export function calculatePrice(
  basePrice: number,
  marginPercent: number,
  peakMultiplier: number,
  vatPercent: number,
): PriceCalculation {
  // Step 1: Add margin to base
  const marginAmount = basePrice * (marginPercent / 100);
  const priceWithMargin = basePrice + marginAmount;

  // Step 2: Apply peak multiplier
  const peakAmount =
    peakMultiplier > 1 ? priceWithMargin * (peakMultiplier - 1) : 0;
  const priceWithPeak = priceWithMargin + peakAmount;

  // Step 3: Calculate VAT
  const vatAmount = priceWithPeak * (vatPercent / 100);
  const total = priceWithPeak + vatAmount;

  return {
    base: basePrice,
    margin: marginAmount,
    peak: peakAmount,
    vat: vatAmount,
    total: Math.round(total * 100) / 100,
    breakdown: {
      basePrice,
      marginPercent,
      marginAmount: Math.round(marginAmount * 100) / 100,
      peakMultiplier,
      peakAmount: Math.round(peakAmount * 100) / 100,
      vatPercent,
      vatAmount: Math.round(vatAmount * 100) / 100,
    },
  };
}

export function getDistanceTier(distanceKm: number): {
  tier: number;
  tierName: string;
  isPerKm: boolean;
} {
  if (distanceKm <= 25) {
    return { tier: 1, tierName: "1-25 km", isPerKm: false };
  } else if (distanceKm <= 50) {
    return { tier: 2, tierName: "26-50 km", isPerKm: false };
  } else if (distanceKm <= 200) {
    return { tier: 3, tierName: "51-200 km", isPerKm: true };
  } else {
    return { tier: 4, tierName: "200+ km", isPerKm: true };
  }
}

export function calculateDistancePrice(
  distanceKm: number,
  tier1Base: number,
  tier2Base: number,
  tier3PerKm: number,
  tier4PerKm: number,
): { price: number; tierUsed: string } {
  const tierInfo = getDistanceTier(distanceKm);

  let price: number;
  switch (tierInfo.tier) {
    case 1:
      price = tier1Base;
      break;
    case 2:
      price = tier2Base;
      break;
    case 3:
      // Base of tier 2 + per km for remaining distance
      price = tier2Base + (distanceKm - 50) * tier3PerKm;
      break;
    case 4:
      // Base of tier 2 + tier 3 portion + tier 4 portion
      price = tier2Base + 150 * tier3PerKm + (distanceKm - 200) * tier4PerKm;
      break;
    default:
      price = tier1Base;
  }

  return {
    price: Math.round(price * 100) / 100,
    tierUsed: tierInfo.tierName,
  };
}

export function formatVehicleClassDisplay(vehicleClass: string): {
  name: string;
  description: string;
} {
  const displayMap: Record<string, { name: string; description: string }> = {
    ECONOMY_SEDAN: {
      name: "Economy Sedan",
      description: "Ford Taurus / Lexus or Similar",
    },
    BUSINESS_SEDAN: {
      name: "Business Sedan",
      description: "Mercedes E-Class / BMW 5 series or Similar",
    },
    BUSINESS_SUV: {
      name: "Business SUV",
      description: "GMC Yukon / Chevrolet Tahoe or Similar",
    },
    FIRST_CLASS: {
      name: "First Class",
      description: "BMW 7 series / Mercedes Benz S Class or Similar",
    },
    ELECTRIC: { name: "Electric", description: "Lucid Air or Similar" },
    HIACE: { name: "Hiace", description: "Toyota Hiace" },
    COASTER: { name: "Coaster", description: "Toyota Coaster" },
    KING_LONG: { name: "King Long", description: "King Long Bus" },
  };

  return displayMap[vehicleClass] || { name: vehicleClass, description: "" };
}

export const DEFAULT_PRICING = {
  distancePricing: [
    {
      vehicleClass: "ECONOMY_SEDAN",
      tier1Base: 80,
      tier2Base: 100,
      tier3PerKm: 2,
      tier4PerKm: 1.5,
    },
    {
      vehicleClass: "BUSINESS_SEDAN",
      tier1Base: 120,
      tier2Base: 150,
      tier3PerKm: 3,
      tier4PerKm: 2.5,
    },
    {
      vehicleClass: "BUSINESS_SUV",
      tier1Base: 160,
      tier2Base: 200,
      tier3PerKm: 4,
      tier4PerKm: 3.5,
    },
    {
      vehicleClass: "FIRST_CLASS",
      tier1Base: 250,
      tier2Base: 300,
      tier3PerKm: 5.5,
      tier4PerKm: 5,
    },
    {
      vehicleClass: "ELECTRIC",
      tier1Base: 140,
      tier2Base: 180,
      tier3PerKm: 3.5,
      tier4PerKm: 3,
    },
  ],
  peakPricing: {
    isEnabled: false,
    multiplier: 1.0,
  },
  additionalServices: [
    {
      serviceType: "CHILD_SEAT",
      serviceName: "Child Seat",
      price: 50,
      unit: null,
    },
    {
      serviceType: "EXTRA_STOP",
      serviceName: "Extra Stop",
      price: 30,
      unit: null,
    },
    {
      serviceType: "WAIT_TIME",
      serviceName: "Wait Time",
      price: 25,
      unit: "per_15_min",
    },
    {
      serviceType: "MEET_GREET",
      serviceName: "Meet & Greet",
      price: 75,
      unit: null,
    },
  ],
  margin: {
    marginPercent: 20,
    vatPercent: 15,
  },
};
