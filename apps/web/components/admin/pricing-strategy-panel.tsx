"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Car,
  DollarSign,
  Percent,
  Zap,
  Settings,
  Save,
  Baby,
  MapPin,
  Clock,
  Loader2,
  Shield,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

const ADMIN_BASE = "/api/v1/admin/pricing";

const vehicleTypes = [
  {
    id: "ECONOMY_SEDAN",
    name: "Economy Sedan",
    model: "Ford Taurus / Lexus or Similar",
  },
  {
    id: "BUSINESS_SEDAN",
    name: "Business Sedan",
    model: "Mercedes E-Class / BMW 5 series or Similar",
  },
  {
    id: "BUSINESS_SUV",
    name: "Business SUV",
    model: "GMC Yukon / Chevrolet Tahoe or Similar",
  },
  {
    id: "FIRST_CLASS",
    name: "First Class",
    model: "BMW 7 series / Mercedes Benz S Class or Similar",
  },
  { id: "ELECTRIC", name: "Electric", model: "Lucid Air or Similar" },
];

// Shape of one vehicle's tier prices. Kept as a type to share between
// state initialization and the save payload — single source of truth
// for "what fields must exist for this vehicle class".
type TierPrices = {
  tier1Base: number;
  tier2Base: number;
  tier3PerKm: number;
  tier4PerKm: number;
};

const EMPTY_TIERS: TierPrices = {
  tier1Base: 0,
  tier2Base: 0,
  tier3PerKm: 0,
  tier4PerKm: 0,
};

interface DistancePricing {
  vehicleClass: string;
  tier1Base: number;
  tier2Base: number;
  tier3PerKm: number;
  tier4PerKm: number;
}

interface ServicePricing {
  serviceType: string;
  serviceName: string;
  price: number;
  unit: string | null;
}

interface PricingStrategyPanelProps {
  isAdmin?: boolean;
}

export default function PricingStrategyPanel({
  isAdmin = false,
}: PricingStrategyPanelProps) {
  const { showNotification } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [distancePricing, setDistancePricing] = useState<
    Record<string, TierPrices>
  >({});
  const [services, setServices] = useState<Record<string, number>>({
    CHILD_SEAT: 0,
    EXTRA_STOP: 0,
    WAIT_TIME: 0,
    MEET_GREET: 0,
  });
  const [vatRate, setVatRate] = useState(15);
  const [profitMargin, setProfitMargin] = useState(20);
  const [peakEnabled, setPeakEnabled] = useState(false);
  const [peakMultiplier, setPeakMultiplier] = useState(1.5);
  const [hasChanges, setHasChanges] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      action: string;
      entity: string;
      entityId: string;
      changes: any;
      performedBy: { id: string | null; name: string; role: string | null };
      createdAt: string;
    }>
  >([]);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  // Fetch audit logs from dedicated pricing audit endpoint
  const fetchAuditLogs = useCallback(async (page = 1) => {
    setIsAuditLoading(true);
    try {
      const res = await api.get(`${ADMIN_BASE}/audit-logs`, {
        page,
        limit: 10,
      });
      if (res.success && res.data) {
        setAuditLogs(res.data.logs || []);
        setAuditPagination(
          res.data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
          },
        );
      }
    } catch {
      // Silently fail — audit log is supplementary
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  // Refetch audit logs every time the section is opened
  useEffect(() => {
    if (showAuditLog) fetchAuditLogs(1);
  }, [showAuditLog, fetchAuditLogs]);

  const fetchPricing = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get(ADMIN_BASE);
      if (res.success && res.data) {
        const data = res.data;

        // Seed state with all 5 vehicle classes at zero so the user
        // can type into ANY tier field without the others becoming
        // undefined. Without this seed, an empty DB returns no
        // pricing rows, state stays {}, and the first onChange
        // creates an object missing the other 3 tier fields — which
        // then breaks the save payload (Prisma rejects undefined on
        // required Decimal columns). Overlay backend rows on top.
        const dp: Record<string, TierPrices> = {};
        vehicleTypes.forEach((v) => {
          dp[v.id] = { ...EMPTY_TIERS };
        });

        if (data.distancePricing && Array.isArray(data.distancePricing)) {
          data.distancePricing.forEach((d: DistancePricing) => {
            dp[d.vehicleClass] = {
              tier1Base: Number(d.tier1Base) || 0,
              tier2Base: Number(d.tier2Base) || 0,
              tier3PerKm: Number(d.tier3PerKm) || 0,
              tier4PerKm: Number(d.tier4PerKm) || 0,
            };
          });
        }
        setDistancePricing(dp);

        if (data.peakPricing) {
          setPeakEnabled(data.peakPricing.isEnabled ?? false);
          setPeakMultiplier(Number(data.peakPricing.multiplier) || 1.5);
        }
        if (data.additionalServices && Array.isArray(data.additionalServices)) {
          const svc: Record<string, number> = {};
          data.additionalServices.forEach((s: ServicePricing) => {
            svc[s.serviceType] = Number(s.price);
          });
          setServices((prev) => ({ ...prev, ...svc }));
        }
        if (data.margin) {
          setProfitMargin(Number(data.margin.marginPercent) || 20);
          setVatRate(Number(data.margin.vatPercent) || 15);
        }
        setHasChanges(false);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load pricing");
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  const markChanged = () => setHasChanges(true);

  // Defensive update: if prev[vehicleId] is somehow undefined (e.g.
  // a vehicle class added later, or a stale state race), start from
  // EMPTY_TIERS rather than spreading `undefined` which would leave
  // sibling fields missing.
  const updateDistance = (
    vehicleId: string,
    field: keyof TierPrices,
    value: number,
  ) => {
    setDistancePricing((prev) => {
      const existing = prev[vehicleId] || { ...EMPTY_TIERS };
      return {
        ...prev,
        [vehicleId]: { ...existing, [field]: value },
      };
    });
    markChanged();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Build the payload by mapping over vehicleTypes (the canonical
      // list of vehicle classes) rather than Object.entries on state.
      // Each row is coerced through Number() so empty strings, undefined,
      // and NaN all become 0 — the backend's upsert.create branch
      // requires all 4 fields, so we guarantee that here.
      const payload = {
        distancePricing: vehicleTypes.map((v) => {
          const existing = distancePricing[v.id] || EMPTY_TIERS;
          return {
            vehicleClass: v.id,
            tier1Base: Number(existing.tier1Base) || 0,
            tier2Base: Number(existing.tier2Base) || 0,
            tier3PerKm: Number(existing.tier3PerKm) || 0,
            tier4PerKm: Number(existing.tier4PerKm) || 0,
          };
        }),
        peakPricing: {
          isEnabled: peakEnabled,
          multiplier: peakMultiplier,
        },
        additionalServices: Object.entries(services).map(
          ([serviceType, price]) => ({
            serviceType,
            serviceName: serviceType
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            price: Number(price) || 0,
            unit: serviceType === "WAIT_TIME" ? "per_15_min" : null,
          }),
        ),
        margin: {
          marginPercent: Number(profitMargin) || 0,
          vatPercent: Number(vatRate) || 0,
        },
      };
      await api.post(`${ADMIN_BASE}/save`, payload);
      showNotification("success", "Pricing configuration saved successfully");
      setHasChanges(false);
      // Always refresh audit logs after save
      fetchAuditLogs(1);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save pricing");
    } finally {
      setIsSaving(false);
    }
  };

  const calculatePreview = (vehicleId: string) => {
    const dp = distancePricing[vehicleId];
    if (!dp) return { base: 0, margin: 0, peak: 0, vat: 0, total: 0 };
    const base = dp.tier2Base;
    const marginAmt = base * (profitMargin / 100);
    const peakAmt = peakEnabled ? (base + marginAmt) * (peakMultiplier - 1) : 0;
    const subtotal = base + marginAmt + peakAmt;
    const vatAmt = subtotal * (vatRate / 100);
    return {
      base,
      margin: marginAmt,
      peak: peakAmt,
      vat: vatAmt,
      total: subtotal + vatAmt,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Pricing Strategy Configuration
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Set vehicle rates, distance tiers, peak pricing, and margins
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-yellow-400 px-2 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/30">
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? "Saving..." : "Save Pricing"}
          </button>
        </div>
      </div>

      {/* Base Pricing — Desktop Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
          <Car className="w-5 h-5 text-luxury-gold" />
          <h3 className="font-semibold text-white">
            Base Pricing by Vehicle & Distance
          </h3>
        </div>

        {/* Desktop table — hidden on small screens */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-800/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">
                  Vehicle Type
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">
                  1-25 km (Base)
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">
                  26-50 km (Base)
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">
                  51-200 km (Per KM)
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-400">
                  200+ km (Per KM)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {vehicleTypes.map((vehicle) => {
                const dp = distancePricing[vehicle.id] || EMPTY_TIERS;
                return (
                  <tr
                    key={vehicle.id}
                    className="hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <p className="text-white font-medium">{vehicle.name}</p>
                      <p className="text-xs text-gray-500">{vehicle.model}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex items-center">
                        <span className="text-gray-500 text-sm mr-1">SAR</span>
                        <input
                          type="number"
                          value={dp.tier1Base}
                          onChange={(e) =>
                            updateDistance(
                              vehicle.id,
                              "tier1Base",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-center text-sm focus:outline-none focus:border-luxury-gold"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex items-center">
                        <span className="text-gray-500 text-sm mr-1">SAR</span>
                        <input
                          type="number"
                          value={dp.tier2Base}
                          onChange={(e) =>
                            updateDistance(
                              vehicle.id,
                              "tier2Base",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-center text-sm focus:outline-none focus:border-luxury-gold"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex items-center">
                        <span className="text-gray-500 text-sm mr-1">SAR</span>
                        <input
                          type="number"
                          step="0.5"
                          value={dp.tier3PerKm}
                          onChange={(e) =>
                            updateDistance(
                              vehicle.id,
                              "tier3PerKm",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-center text-sm focus:outline-none focus:border-luxury-gold"
                        />
                        <span className="text-gray-500 text-sm ml-1">/km</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex items-center">
                        <span className="text-gray-500 text-sm mr-1">SAR</span>
                        <input
                          type="number"
                          step="0.5"
                          value={dp.tier4PerKm}
                          onChange={(e) =>
                            updateDistance(
                              vehicle.id,
                              "tier4PerKm",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-center text-sm focus:outline-none focus:border-luxury-gold"
                        />
                        <span className="text-gray-500 text-sm ml-1">/km</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards — shown on small screens */}
        <div className="md:hidden divide-y divide-neutral-800">
          {vehicleTypes.map((vehicle) => {
            const dp = distancePricing[vehicle.id] || EMPTY_TIERS;
            return (
              <div key={vehicle.id} className="p-4 space-y-3">
                <div>
                  <p className="text-white font-medium">{vehicle.name}</p>
                  <p className="text-xs text-gray-500">{vehicle.model}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">
                      1-25 km (Base)
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-500 text-xs mr-1">SAR</span>
                      <input
                        type="number"
                        value={dp.tier1Base}
                        onChange={(e) =>
                          updateDistance(
                            vehicle.id,
                            "tier1Base",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-luxury-gold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">
                      26-50 km (Base)
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-500 text-xs mr-1">SAR</span>
                      <input
                        type="number"
                        value={dp.tier2Base}
                        onChange={(e) =>
                          updateDistance(
                            vehicle.id,
                            "tier2Base",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-luxury-gold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">
                      51-200 km (/km)
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-500 text-xs mr-1">SAR</span>
                      <input
                        type="number"
                        step="0.5"
                        value={dp.tier3PerKm}
                        onChange={(e) =>
                          updateDistance(
                            vehicle.id,
                            "tier3PerKm",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-luxury-gold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">
                      200+ km (/km)
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-500 text-xs mr-1">SAR</span>
                      <input
                        type="number"
                        step="0.5"
                        value={dp.tier4PerKm}
                        onChange={(e) =>
                          updateDistance(
                            vehicle.id,
                            "tier4PerKm",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-luxury-gold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Peak Pricing */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${peakEnabled ? "bg-orange-500/20" : "bg-neutral-800"}`}
            >
              <Zap
                className={`w-5 h-5 ${peakEnabled ? "text-orange-400" : "text-gray-500"}`}
              />
            </div>
            <div>
              <h3 className="font-semibold text-white">Peak Pricing</h3>
              <p className="text-sm text-gray-400 hidden sm:block">
                Apply multiplier for next 24 hours bookings
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={peakEnabled}
              onChange={(e) => {
                setPeakEnabled(e.target.checked);
                markChanged();
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-luxury-gold"></div>
          </label>
        </div>

        {peakEnabled && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Peak Multiplier</label>
                <span className="text-lg font-bold text-orange-400">
                  {peakMultiplier.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={peakMultiplier}
                onChange={(e) => {
                  setPeakMultiplier(parseFloat(e.target.value));
                  markChanged();
                }}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-luxury-gold"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1.0x</span>
                <span>2.0x</span>
                <span>3.0x</span>
              </div>
            </div>
            <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-sm text-orange-300 mb-2">
                <strong>Preview:</strong> Peak pricing effect on base rates
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {vehicleTypes.map((vehicle) => {
                  const base = distancePricing[vehicle.id]?.tier2Base || 0;
                  const peak = (base * peakMultiplier).toFixed(0);
                  return (
                    <div key={vehicle.id} className="text-center">
                      <p className="text-xs text-gray-400">{vehicle.name}</p>
                      <p className="text-sm">
                        <span className="text-gray-500 line-through">
                          SAR {base}
                        </span>
                        <span className="text-orange-400 ml-1">SAR {peak}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profit Margin & VAT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Percent className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Profit Margin</h3>
              <p className="text-sm text-gray-400">Added to base price</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              value={profitMargin}
              onChange={(e) => {
                setProfitMargin(parseInt(e.target.value) || 0);
                markChanged();
              }}
              className="w-24 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-xl font-bold text-center focus:outline-none focus:border-luxury-gold"
            />
            <span className="text-2xl text-gray-400">%</span>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">VAT Rate</h3>
              <p className="text-sm text-gray-400">Applied to final price</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="50"
              value={vatRate}
              onChange={(e) => {
                setVatRate(parseInt(e.target.value) || 0);
                markChanged();
              }}
              className="w-24 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-xl font-bold text-center focus:outline-none focus:border-luxury-gold"
            />
            <span className="text-2xl text-gray-400">%</span>
          </div>
        </div>
      </div>

      {/* Services Pricing */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-5 h-5 text-luxury-gold" />
          <h3 className="font-semibold text-white">
            Additional Services Pricing
          </h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3 sm:p-4 bg-neutral-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Baby className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Child Seat</span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-500 mr-1 text-sm">SAR</span>
              <input
                type="number"
                value={services.CHILD_SEAT}
                onChange={(e) => {
                  setServices((prev) => ({
                    ...prev,
                    CHILD_SEAT: parseInt(e.target.value) || 0,
                  }));
                  markChanged();
                }}
                className="w-full px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-center focus:outline-none focus:border-luxury-gold"
              />
            </div>
          </div>
          <div className="p-3 sm:p-4 bg-neutral-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Extra Stop</span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-500 mr-1 text-sm">SAR</span>
              <input
                type="number"
                value={services.EXTRA_STOP}
                onChange={(e) => {
                  setServices((prev) => ({
                    ...prev,
                    EXTRA_STOP: parseInt(e.target.value) || 0,
                  }));
                  markChanged();
                }}
                className="w-full px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-center focus:outline-none focus:border-luxury-gold"
              />
            </div>
          </div>
          <div className="p-3 sm:p-4 bg-neutral-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Wait Time</span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-500 mr-1 text-sm">SAR</span>
              <input
                type="number"
                value={services.WAIT_TIME}
                onChange={(e) => {
                  setServices((prev) => ({
                    ...prev,
                    WAIT_TIME: parseInt(e.target.value) || 0,
                  }));
                  markChanged();
                }}
                className="w-full px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-center focus:outline-none focus:border-luxury-gold"
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-1">per 15 min</p>
          </div>
          <div className="p-3 sm:p-4 bg-neutral-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-gray-400">Meet & Greet</span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-500 mr-1 text-sm">SAR</span>
              <input
                type="number"
                value={services.MEET_GREET}
                onChange={(e) => {
                  setServices((prev) => ({
                    ...prev,
                    MEET_GREET: parseInt(e.target.value) || 0,
                  }));
                  markChanged();
                }}
                className="w-full px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-center focus:outline-none focus:border-luxury-gold"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Price Breakdown Preview */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6">
        <h3 className="font-semibold text-white mb-4">
          Price Calculation Preview{" "}
          <span className="text-gray-500 text-sm font-normal">
            (40km trip, 26-50km tier)
          </span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {vehicleTypes.map((vehicle) => {
            const preview = calculatePreview(vehicle.id);
            return (
              <div
                key={vehicle.id}
                className="p-3 sm:p-4 bg-neutral-800 rounded-lg"
              >
                <p className="text-sm text-luxury-gold font-medium mb-3">
                  {vehicle.name}
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Base</span>
                    <span>SAR {preview.base}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Margin</span>
                    <span>SAR {preview.margin.toFixed(0)}</span>
                  </div>
                  {peakEnabled && (
                    <div className="flex justify-between text-orange-400">
                      <span>Peak</span>
                      <span>+SAR {preview.peak.toFixed(0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-400">
                    <span>VAT</span>
                    <span>SAR {preview.vat.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold pt-2 border-t border-neutral-700">
                    <span>Total</span>
                    <span className="text-luxury-gold">
                      SAR {preview.total.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAuditLog(!showAuditLog)}
          className="w-full p-4 flex items-center justify-between hover:bg-neutral-800/50"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-white">
              Pricing Change Log
            </h3>
          </div>
          <ChevronRight
            className={`w-5 h-5 text-gray-400 transition-transform ${showAuditLog ? "rotate-90" : ""}`}
          />
        </button>
        {showAuditLog && (
          <div className="border-t border-neutral-800">
            {isAuditLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No pricing changes recorded yet
              </div>
            ) : (
              <>
                <div className="divide-y divide-neutral-800">
                  {auditLogs.map((log) => {
                    const actionDisplay = log.action
                      .replace(/_/g, " ")
                      .toLowerCase()
                      .replace(/\b\w/g, (c) => c.toUpperCase());

                    return (
                      <div
                        key={log.id}
                        className="px-4 py-3 flex items-start gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                          <Shield className="w-4 h-4 text-luxury-gold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">
                            <span className="text-luxury-gold font-medium">
                              {log.performedBy?.name || "System"}
                            </span>{" "}
                            <span className="text-gray-400">
                              {actionDisplay}
                            </span>
                            {log.changes?.vehicleClass && (
                              <span className="text-white font-medium">
                                {" "}
                                — {log.changes.vehicleClass.replace(/_/g, " ")}
                              </span>
                            )}
                            {log.changes?.newValues?.marginPercent !==
                              undefined && (
                              <span className="text-white font-medium">
                                {" "}
                                — Margin: {log.changes.newValues.marginPercent}
                                %, VAT: {log.changes.newValues.vatPercent}%
                              </span>
                            )}
                            {log.changes?.newValues?.isEnabled !==
                              undefined && (
                              <span className="text-white font-medium">
                                {" "}
                                — Peak{" "}
                                {log.changes.newValues.isEnabled
                                  ? "Enabled"
                                  : "Disabled"}
                                {log.changes.newValues.multiplier
                                  ? ` at ${log.changes.newValues.multiplier}x`
                                  : ""}
                              </span>
                            )}
                            {log.changes?.serviceType && (
                              <span className="text-white font-medium">
                                {" "}
                                —{" "}
                                {log.changes.serviceName ||
                                  log.changes.serviceType}
                                : SAR {log.changes.previousPrice ?? "—"} → SAR{" "}
                                {log.changes.newPrice}
                              </span>
                            )}
                            {log.changes?.previousValues &&
                              log.changes?.newValues &&
                              log.changes.vehicleClass && (
                                <span className="text-gray-500 text-xs ml-2">
                                  (Tier1:{" "}
                                  {log.changes.previousValues.tier1Base ?? "—"}→
                                  {log.changes.newValues.tier1Base}, Tier2:{" "}
                                  {log.changes.previousValues.tier2Base ?? "—"}→
                                  {log.changes.newValues.tier2Base})
                                </span>
                              )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(log.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {auditPagination.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Page {auditPagination.page} of{" "}
                      {auditPagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchAuditLogs(auditPagination.page - 1)}
                        disabled={auditPagination.page === 1}
                        className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => fetchAuditLogs(auditPagination.page + 1)}
                        disabled={
                          auditPagination.page >= auditPagination.totalPages
                        }
                        className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-sm text-red-300">
            <strong>Admin Access:</strong> Changes made here will override
            operations team settings. Pricing changes apply to all new bookings.
          </p>
        </div>
      )}
    </div>
  );
}
