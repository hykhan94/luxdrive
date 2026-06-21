// ============================================
// !!! DESTINATION PATH: apps/web/components/partner/tariffs-panel.tsx
// ============================================
"use client";

// ============================================
// components/partner/tariffs/tariffs-panel.tsx
// Partner Portal — Tariff Rates (Read-Only)
// ============================================

import { useState, useEffect, useCallback } from "react";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import { Leaf, Zap, Loader2 } from "lucide-react";

// ============== TYPES ==============

interface CityOverview {
  city: string;
  oneWayRoutes: number;
  hourlyRoutes: number;
  electricRoutes: number;
  totalRoutes: number;
  hasElectric: boolean;
}

interface VehicleColumn {
  key: string;
  label: string;
}

interface TariffRoute {
  id: string;
  routeName: string;
  pickupLocation: string;
  dropoffLocation: string;
  isPerKm: boolean;
  prices: Array<{ vehicleClass: string; label: string; price: number | null }>;
  priceMap: Record<string, number | null>;
}

interface ElectricRoute {
  id: string;
  routeName: string;
  pickupLocation: string;
  dropoffLocation: string;
  isPerKm: boolean;
  price: number | null;
}

interface CityTariffData {
  city: string;
  oneWay: {
    label: string;
    count: number;
    vehicleColumns: VehicleColumn[];
    routes: TariffRoute[];
  };
  hourly: {
    label: string;
    count: number;
    vehicleColumns: VehicleColumn[];
    routes: TariffRoute[];
  };
  electric: {
    label: string;
    enabled: boolean;
    count: number;
    routes: ElectricRoute[];
  } | null;
}

// ============== CONSTANTS ==============

const CITY_LABELS: Record<string, { name: string; province: string }> = {
  RIYADH: { name: "Riyadh", province: "Riyadh" },
  JEDDAH: { name: "Jeddah", province: "Makkah" },
  MAKKAH: { name: "Makkah", province: "Makkah" },
  MADINAH: { name: "Madinah", province: "Madinah" },
};

type SubTab = "oneway" | "hourly" | "eco";

// ============== COMPONENT ==============

export default function TariffsPanel() {
  const { showNotification } = useNotification();

  // Overview state (city tab counts)
  const [cities, setCities] = useState<CityOverview[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Active selections
  const [activeCity, setActiveCity] = useState("RIYADH");
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("oneway");

  // City tariff data (cached per city)
  const [cityData, setCityData] = useState<Record<string, CityTariffData>>({});
  const [loadingCity, setLoadingCity] = useState(false);

  // ============== FETCH OVERVIEW (city counts) ==============
  useEffect(() => {
    const fetchOverview = async () => {
      setLoadingOverview(true);
      try {
        const res = await partnerApi.getTariffOverview();
        if (res.data?.cities) {
          setCities(res.data.cities);
        }
      } catch (err: any) {
        showNotification(
          "error",
          err.message || "Failed to load tariff overview",
        );
      } finally {
        setLoadingOverview(false);
      }
    };
    fetchOverview();
  }, [showNotification]);

  // ============== FETCH CITY TARIFFS (cache per city) ==============
  const fetchCityData = useCallback(
    async (city: string) => {
      // Already cached
      if (cityData[city]) return;

      setLoadingCity(true);
      try {
        const res = await partnerApi.getCityTariffs(city);
        if (res.data) {
          setCityData((prev) => ({ ...prev, [city]: res.data }));
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load tariffs");
      } finally {
        setLoadingCity(false);
      }
    },
    [cityData, showNotification],
  );

  // Fetch when city changes
  useEffect(() => {
    fetchCityData(activeCity);
  }, [activeCity, fetchCityData]);

  // Reset sub-tab when city changes (eco only for Riyadh)
  useEffect(() => {
    const cityInfo = cities.find((c) => c.city === activeCity);
    if (activeSubTab === "eco" && !cityInfo?.hasElectric) {
      setActiveSubTab("oneway");
    }
  }, [activeCity, cities, activeSubTab]);

  // Current data
  const currentData = cityData[activeCity];
  const currentCityInfo = cities.find((c) => c.city === activeCity);
  const hasElectric = currentCityInfo?.hasElectric || false;
  const isEcoTab = activeSubTab === "eco";

  // Get the routes and columns for the active sub-tab
  const getActiveRoutes = (): {
    routes: TariffRoute[];
    vehicleColumns: VehicleColumn[];
  } | null => {
    if (!currentData) return null;
    if (activeSubTab === "oneway")
      return {
        routes: currentData.oneWay.routes,
        vehicleColumns: currentData.oneWay.vehicleColumns,
      };
    if (activeSubTab === "hourly")
      return {
        routes: currentData.hourly.routes,
        vehicleColumns: currentData.hourly.vehicleColumns,
      };
    return null;
  };

  const activeRouteData = getActiveRoutes();
  const electricRoutes = currentData?.electric?.routes || [];

  // ============== LOADING ==============
  if (loadingOverview) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  // ============== RENDER ==============
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Tariff Rates</h2>
          {isEcoTab && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
              <Leaf className="w-3.5 h-3.5" /> Zero Emissions
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          All prices in SAR | Inclusive of 15% VAT
        </p>
      </div>

      {/* City Tabs */}
      <div className="flex flex-wrap gap-2">
        {cities.map((c) => {
          const info = CITY_LABELS[c.city];
          return (
            <button
              key={c.city}
              onClick={() => setActiveCity(c.city)}
              className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
                activeCity === c.city
                  ? isEcoTab
                    ? "bg-green-500 text-white"
                    : "bg-luxury-gold text-black"
                  : "bg-neutral-800 text-gray-400 hover:text-white"
              }`}
            >
              <span>{info?.name || c.city}</span>
              <span className="text-xs ml-1 opacity-70">({c.totalRoutes})</span>
            </button>
          );
        })}
      </div>

      {/* Sub-Tabs: One Way | Hourly | Eco Fleet */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSubTab("oneway")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === "oneway"
              ? "bg-neutral-700 text-white"
              : "bg-neutral-800/50 text-gray-400 hover:text-white"
          }`}
        >
          One Way{" "}
          {currentCityInfo && (
            <span className="text-xs opacity-60 ml-1">
              ({currentCityInfo.oneWayRoutes})
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab("hourly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === "hourly"
              ? "bg-neutral-700 text-white"
              : "bg-neutral-800/50 text-gray-400 hover:text-white"
          }`}
        >
          Hourly Rates{" "}
          {currentCityInfo && (
            <span className="text-xs opacity-60 ml-1">
              ({currentCityInfo.hourlyRoutes})
            </span>
          )}
        </button>
        {hasElectric && (
          <button
            onClick={() => setActiveSubTab("eco")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSubTab === "eco"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-neutral-800/50 text-gray-400 hover:text-green-400"
            }`}
          >
            <Leaf className="w-4 h-4" />
            Eco Fleet{" "}
            {currentCityInfo && (
              <span className="text-xs opacity-60 ml-1">
                ({currentCityInfo.electricRoutes})
              </span>
            )}
          </button>
        )}
      </div>

      {/* Eco Fleet Banner */}
      {isEcoTab && (
        <div className="p-4 bg-gradient-to-r from-green-500/10 via-green-500/5 to-transparent border border-green-500/30 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-400">
                Electric Luxury Fleet
              </h3>
              <p className="text-sm text-gray-400">
                Premium comfort with zero carbon footprint. Available in Riyadh
                only.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading City Data */}
      {loadingCity && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
        </div>
      )}

      {/* Standard Tariff Table (One Way / Hourly)
          ──────────────────────────────────────────────────────────
          Column header and first-cell content branch on the active
          sub-tab to match the admin's tariff management panel:
            - "Route" header + "Pickup → Drop-off" for ONE_WAY
            - "Duration Tier" header + tier name (e.g. "6-8 Hours
              (Day Rate)") for HOURLY
          Previously the hourly view rendered as a bare arrow " → "
          because pickup/dropoff are empty strings on hourly tier rows
          by design — the routeName column carries the meaningful
          label there. Partners viewing tariffs now see exactly the
          same row labels the admin used when setting prices, so the
          mental model lines up across both portals. */}
      {!loadingCity && !isEcoTab && activeRouteData && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-800">
                <tr>
                  <th className="text-left text-xs font-medium px-4 py-3 uppercase text-gray-400 sticky left-0 z-10 bg-neutral-800 min-w-[180px]">
                    {activeSubTab === "hourly" ? "Duration Tier" : "Route"}
                  </th>
                  {activeRouteData.vehicleColumns.map((v) => (
                    <th
                      key={v.key}
                      className="text-center text-xs font-medium px-4 py-3 uppercase text-gray-400 whitespace-nowrap"
                    >
                      {v.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {activeRouteData.routes.map((route) => (
                  <tr
                    key={route.id}
                    className="hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 sticky left-0 z-10 bg-neutral-900">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white whitespace-nowrap">
                          {activeSubTab === "hourly"
                            ? route.routeName
                            : `${route.pickupLocation} → ${route.dropoffLocation}`}
                        </span>
                        {route.isPerKm && (
                          <span className="text-xs text-blue-400">
                            (Per KM)
                          </span>
                        )}
                      </div>
                    </td>
                    {activeRouteData.vehicleColumns.map((v) => {
                      const price = route.priceMap[v.key];
                      return (
                        <td key={v.key} className="px-4 py-3 text-center">
                          {price !== null && price !== undefined ? (
                            <span className="text-sm font-medium text-luxury-gold">
                              SAR {price.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-600">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {activeRouteData.routes.length === 0 && (
                  <tr>
                    <td
                      colSpan={activeRouteData.vehicleColumns.length + 1}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      {activeSubTab === "hourly"
                        ? "No hourly rates configured for this city yet"
                        : "No routes available for this category"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Electric Tariff Table */}
      {!loadingCity && isEcoTab && (
        <div className="bg-gradient-to-br from-green-900/20 to-neutral-900 border-2 border-green-500/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-green-900/30">
                <tr>
                  <th className="text-left text-xs font-medium px-4 py-3 uppercase text-green-400 sticky left-0 z-10 bg-green-900/30 min-w-[180px]">
                    Route
                  </th>
                  <th className="text-center text-xs font-medium px-4 py-3 uppercase text-green-400 whitespace-nowrap">
                    Electric Luxury Sedan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-500/20">
                {electricRoutes.map((route) => (
                  <tr
                    key={route.id}
                    className="hover:bg-green-500/10 transition-colors"
                  >
                    <td className="px-4 py-3 sticky left-0 z-10 bg-green-900/10">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white whitespace-nowrap">
                          {route.pickupLocation} → {route.dropoffLocation}
                        </span>
                        {route.isPerKm && (
                          <span className="text-xs text-green-400">
                            (Per KM)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {route.price !== null ? (
                        <span className="text-sm font-medium text-green-400">
                          SAR {route.price.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {electricRoutes.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      No electric routes available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {isEcoTab ? (
        <div className="text-center space-y-1">
          <p className="text-sm text-green-400 flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" />
            100% Electric – Zero Emissions – Premium Comfort
          </p>
          <p className="text-xs text-gray-500">
            Eco Fleet pricing matches First Class rates. Choose green without
            compromising on luxury.
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center">
          All prices in SAR | Inclusive of 15% VAT
        </p>
      )}
    </div>
  );
}
