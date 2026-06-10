"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Plus,
  X,
  Save,
  History,
  Percent,
  Edit2,
  Leaf,
  Zap,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

const ADMIN_BASE = "/api/v1/admin/tariffs";

const CITIES = [
  { id: "RIYADH", name: "Riyadh", province: "Central Province" },
  { id: "JEDDAH", name: "Jeddah", province: "Western Province" },
  { id: "MAKKAH", name: "Makkah", province: "Western Province" },
  { id: "MADINAH", name: "Madinah", province: "Western Province" },
];

interface VehicleClassInfo {
  key: string;
  name: string;
  dbField: string;
}

interface RouteData {
  id: string;
  routeName: string;
  pickupLocation: string;
  dropoffLocation: string;
  isPerKm: boolean;
  isTBD: boolean;
  prices: Record<string, number | null>;
}

interface EcoRoute {
  id: string;
  routeName: string;
  pickupLocation: string;
  dropoffLocation: string;
  price: number | null;
  isPerKm: boolean;
  isTBD: boolean;
}

interface ChangeLogEntry {
  id: string;
  user: string;
  action: string;
  routeName: string;
  vehicleClass: string | null;
  oldValue: number | null;
  newValue: number | null;
  bulkPercent: number | null;
  city: string | null;
  routeType: string | null;
  createdAt: string;
}

export default function TariffManagementPanel() {
  const { showNotification } = useNotification();

  // State
  const [activeCity, setActiveCity] = useState("RIYADH");
  const [activeTab, setActiveTab] = useState<"oneway" | "hourly" | "eco">(
    "oneway",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [vehicleClasses, setVehicleClasses] = useState<VehicleClassInfo[]>([]);
  const [onewayRoutes, setOnewayRoutes] = useState<RouteData[]>([]);
  const [hourlyRoutes, setHourlyRoutes] = useState<RouteData[]>([]);
  const [ecoRoutes, setEcoRoutes] = useState<EcoRoute[]>([]);
  const [ecoFleetEnabled, setEcoFleetEnabled] = useState(true);
  const [showEcoFleet, setShowEcoFleet] = useState(false);

  // Editing state
  const [editingCell, setEditingCell] = useState<{
    routeId: string;
    vehicleClass: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingEcoCell, setEditingEcoCell] = useState<string | null>(null);
  const [editEcoValue, setEditEcoValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkUpdatePercent, setBulkUpdatePercent] = useState("");
  const [showAddRouteModal, setShowAddRouteModal] = useState(false);
  const [newRoute, setNewRoute] = useState({
    pickup: "",
    dropoff: "",
    isPerKm: false,
  });
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Change history state
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Fetch change history with pagination
  const fetchChangeHistory = useCallback(async (page = 1) => {
    setIsHistoryLoading(true);
    try {
      const res = await api.get(`${ADMIN_BASE}/history`, { page, limit: 10 });
      if (res.success && res.data) {
        setChangeLogs(res.data.logs || []);
        setHistoryPagination(
          res.data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
          },
        );
      }
    } catch {
      // Silently fail
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  // Fetch city tariffs
  const fetchCityTariffs = useCallback(
    async (city: string) => {
      setIsLoading(true);
      try {
        const res = await api.get(`${ADMIN_BASE}/${city}`);
        if (res.success && res.data) {
          const data = res.data;
          setVehicleClasses(data.vehicleClasses || []);
          setOnewayRoutes(data.oneWayRoutes || []);
          setHourlyRoutes(data.hourlyRates || []);
          setShowEcoFleet(data.showEcoFleet || false);
          setEcoFleetEnabled(data.ecoFleetEnabled ?? true);
          if (data.ecoFleet) setEcoRoutes(data.ecoFleet);
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load tariffs");
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  useEffect(() => {
    fetchCityTariffs(activeCity);
    fetchChangeHistory(1);
  }, [activeCity, fetchCityTariffs, fetchChangeHistory]);

  // Reset tab if switching from city with eco to one without
  useEffect(() => {
    if (activeTab === "eco" && !showEcoFleet) setActiveTab("oneway");
  }, [showEcoFleet, activeTab]);

  // Get routes for current tab
  const currentRoutes =
    activeTab === "oneway"
      ? onewayRoutes
      : activeTab === "hourly"
        ? hourlyRoutes
        : [];

  // Get vehicle columns — for eco tab only show electric
  const displayVehicleClasses = activeTab === "eco" ? [] : vehicleClasses;

  // ============== ACTIONS ==============

  const handleSavePrice = async (routeId: string, vehicleClass: string) => {
    const newPrice = parseFloat(editValue);
    if (isNaN(newPrice) || newPrice < 0) {
      showNotification("error", "Invalid price value");
      return;
    }
    setIsSaving(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/routes/${routeId}/price`, {
        vehicleClass,
        price: newPrice,
      });
      if (res.success) {
        showNotification("success", res.message || "Price updated");
        setEditingCell(null);
        setEditValue("");
        fetchCityTariffs(activeCity);
        fetchChangeHistory(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update price");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEcoPrice = async (routeId: string) => {
    const newPrice = parseFloat(editEcoValue);
    if (isNaN(newPrice) || newPrice < 0) {
      showNotification("error", "Invalid price value");
      return;
    }
    setIsSaving(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/eco-fleet/${routeId}/price`, {
        price: newPrice,
      });
      if (res.success) {
        showNotification("success", res.message || "Eco price updated");
        setEditingEcoCell(null);
        setEditEcoValue("");
        fetchCityTariffs(activeCity);
        fetchChangeHistory(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update eco price");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkUpdate = async () => {
    const percent = parseFloat(bulkUpdatePercent);
    if (isNaN(percent)) {
      showNotification("error", "Invalid percentage");
      return;
    }
    setIsSaving(true);
    try {
      const res = await api.post(`${ADMIN_BASE}/bulk-update`, {
        city: activeCity,
        routeType:
          activeTab === "eco"
            ? undefined
            : activeTab === "oneway"
              ? "ONE_WAY"
              : "HOURLY",
        percentChange: percent,
      });
      if (res.success) {
        showNotification("success", res.message || "Bulk update applied");
        setShowBulkUpdateModal(false);
        setBulkUpdatePercent("");
        fetchCityTariffs(activeCity);
        fetchChangeHistory(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to apply bulk update");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRoute = async () => {
    if (!newRoute.pickup || !newRoute.dropoff) return;
    setIsSaving(true);
    try {
      const res = await api.post(`${ADMIN_BASE}/routes`, {
        city: activeCity,
        routeType: activeTab === "hourly" ? "HOURLY" : "ONE_WAY",
        pickupLocation: newRoute.pickup,
        dropoffLocation: newRoute.dropoff,
        isPerKm: newRoute.isPerKm,
      });
      if (res.success) {
        showNotification("success", res.message || "Route added");
        setShowAddRouteModal(false);
        setNewRoute({ pickup: "", dropoff: "", isPerKm: false });
        fetchCityTariffs(activeCity);
        fetchChangeHistory(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to add route");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    setIsDeleting(true);
    try {
      const res = await api.delete(`${ADMIN_BASE}/routes/${routeId}`);
      if (res.success) {
        showNotification("success", "Route deleted");
        setDeleteTarget(null);
        fetchCityTariffs(activeCity);
        fetchChangeHistory(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to delete route");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleEcoFleet = async () => {
    try {
      const res = await api.patch(`${ADMIN_BASE}/eco-fleet/toggle`, {
        isEnabled: !ecoFleetEnabled,
      });
      if (res.success) {
        setEcoFleetEnabled(!ecoFleetEnabled);
        showNotification(
          "success",
          res.message ||
            `Eco Fleet ${!ecoFleetEnabled ? "enabled" : "disabled"}`,
        );
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to toggle eco fleet");
    }
  };

  // ============== RENDER ==============

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  const isEcoTab = activeTab === "eco";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Tariff Management
          </h2>
          <p className="text-sm text-gray-500">
            Edit pricing for all routes and vehicle classes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBulkUpdateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors border border-blue-500/30"
          >
            <Percent className="w-4 h-4" />
            <span className="hidden sm:inline">Bulk Update</span>
          </button>
          <button
            onClick={() => setShowAddRouteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Route</span>
          </button>
        </div>
      </div>

      {/* City Tabs */}
      <div className="flex flex-wrap gap-2">
        {CITIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCity(c.id)}
            className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
              activeCity === c.id
                ? isEcoTab
                  ? "bg-green-500 text-white"
                  : "bg-luxury-gold text-black"
                : "bg-neutral-800 text-gray-400 hover:text-white"
            }`}
          >
            <span>{c.name}</span>
            <span className="text-xs ml-1 opacity-70">({c.province})</span>
          </button>
        ))}
      </div>

      {/* Sub-Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("oneway")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "oneway"
              ? "bg-neutral-700 text-white"
              : "bg-neutral-800/50 text-gray-400 hover:text-white"
          }`}
        >
          One Way Routes ({onewayRoutes.length})
        </button>
        <button
          onClick={() => setActiveTab("hourly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "hourly"
              ? "bg-neutral-700 text-white"
              : "bg-neutral-800/50 text-gray-400 hover:text-white"
          }`}
        >
          Hourly Rates ({hourlyRoutes.length})
        </button>
        {showEcoFleet && (
          <button
            onClick={() => setActiveTab("eco")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "eco"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-neutral-800/50 text-gray-400 hover:text-green-400"
            }`}
          >
            <Leaf className="w-4 h-4" />
            Eco Fleet ({ecoRoutes.length})
          </button>
        )}
      </div>

      {/* Eco Fleet Toggle */}
      {isEcoTab && (
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500/10 to-transparent border border-green-500/30 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">
                Eco Fleet Availability
              </h3>
              <p className="text-xs text-gray-500">
                Toggle electric vehicle availability for partners
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleEcoFleet}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              ecoFleetEnabled
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-neutral-800 text-gray-400 border border-neutral-700"
            }`}
          >
            {ecoFleetEnabled ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
            {ecoFleetEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
      )}

      {/* Tariff Table */}
      {!isEcoTab ? (
        <div
          className={`rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800`}
        >
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-800">
                <tr>
                  <th className="text-left text-xs font-medium px-4 py-3 uppercase text-gray-400 sticky left-0 z-10 bg-neutral-800">
                    Route
                  </th>
                  {displayVehicleClasses.map((v) => (
                    <th
                      key={v.key}
                      className="text-center text-xs font-medium px-4 py-3 uppercase whitespace-nowrap text-gray-400"
                    >
                      {v.name}
                    </th>
                  ))}
                  <th className="text-center text-xs font-medium px-4 py-3 uppercase text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {currentRoutes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={displayVehicleClasses.length + 2}
                      className="text-center py-12 text-gray-500"
                    >
                      No routes found for this city
                    </td>
                  </tr>
                ) : (
                  currentRoutes.map((route) => (
                    <tr key={route.id} className="hover:bg-neutral-800/50">
                      <td className="px-4 py-3 sticky left-0 z-10 bg-neutral-900">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white whitespace-nowrap">
                            {route.pickupLocation} → {route.dropoffLocation}
                          </span>
                          {route.isTBD && (
                            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
                              TBD
                            </span>
                          )}
                          {route.isPerKm && (
                            <span className="text-xs text-blue-400">
                              (Per KM)
                            </span>
                          )}
                        </div>
                      </td>
                      {displayVehicleClasses.map((v) => {
                        const price = route.prices[v.key];
                        const isEditing =
                          editingCell?.routeId === route.id &&
                          editingCell?.vehicleClass === v.key;
                        return (
                          <td key={v.key} className="px-4 py-3 text-center">
                            {isEditing ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-20 px-2 py-1 bg-neutral-700 border border-luxury-gold rounded text-white text-sm text-center"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleSavePrice(route.id, v.key);
                                    if (e.key === "Escape") {
                                      setEditingCell(null);
                                      setEditValue("");
                                    }
                                  }}
                                />
                                <button
                                  onClick={() =>
                                    handleSavePrice(route.id, v.key)
                                  }
                                  disabled={isSaving}
                                  className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingCell(null);
                                    setEditValue("");
                                  }}
                                  className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingCell({
                                    routeId: route.id,
                                    vehicleClass: v.key,
                                  });
                                  setEditValue(price?.toString() || "0");
                                }}
                                className={`text-sm font-medium px-2 py-1 rounded transition-colors ${
                                  price === null
                                    ? "text-yellow-400 hover:bg-yellow-500/10"
                                    : "text-luxury-gold hover:bg-luxury-gold/10"
                                }`}
                              >
                                {price === null
                                  ? "Set Price"
                                  : `SAR ${Number(price).toLocaleString()}`}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            setDeleteTarget({
                              id: route.id,
                              name: route.routeName,
                            })
                          }
                          className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Remove Route"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-neutral-800">
            {currentRoutes.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No routes found
              </div>
            ) : (
              currentRoutes.map((route) => (
                <div key={route.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">
                        {route.pickupLocation} → {route.dropoffLocation}
                      </span>
                      {route.isTBD && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">
                          TBD
                        </span>
                      )}
                      {route.isPerKm && (
                        <span className="text-[10px] text-blue-400">/km</span>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setDeleteTarget({ id: route.id, name: route.routeName })
                      }
                      className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {displayVehicleClasses.map((v) => {
                      const price = route.prices[v.key];
                      const isEditing =
                        editingCell?.routeId === route.id &&
                        editingCell?.vehicleClass === v.key;
                      return (
                        <div key={v.key}>
                          <label className="text-[10px] text-gray-500 uppercase block mb-1">
                            {v.name}
                          </label>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full px-2 py-1 bg-neutral-700 border border-luxury-gold rounded text-white text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleSavePrice(route.id, v.key);
                                  if (e.key === "Escape") {
                                    setEditingCell(null);
                                    setEditValue("");
                                  }
                                }}
                              />
                              <button
                                onClick={() => handleSavePrice(route.id, v.key)}
                                className="p-1 text-green-400"
                              >
                                <Save className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingCell({
                                  routeId: route.id,
                                  vehicleClass: v.key,
                                });
                                setEditValue(price?.toString() || "0");
                              }}
                              className={`text-sm font-medium ${price === null ? "text-yellow-400" : "text-luxury-gold"}`}
                            >
                              {price === null
                                ? "TBD"
                                : `SAR ${Number(price).toLocaleString()}`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Eco Fleet Table */
        <div className="rounded-xl overflow-hidden bg-gradient-to-br from-green-900/20 to-neutral-900 border-2 border-green-500/30">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-green-900/30">
                <tr>
                  <th className="text-left text-xs font-medium px-4 py-3 uppercase text-green-400">
                    Route
                  </th>
                  <th className="text-center text-xs font-medium px-4 py-3 uppercase text-green-400">
                    Electric Luxury Sedan
                  </th>
                  <th className="text-center text-xs font-medium px-4 py-3 uppercase text-green-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-500/20">
                {ecoRoutes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-12 text-gray-500">
                      No eco fleet routes
                    </td>
                  </tr>
                ) : (
                  ecoRoutes.map((route) => (
                    <tr key={route.id} className="hover:bg-green-500/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">
                            {route.pickupLocation} → {route.dropoffLocation}
                          </span>
                          {route.isTBD && (
                            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
                              TBD
                            </span>
                          )}
                          {route.isPerKm && (
                            <span className="text-xs text-blue-400">
                              (Per KM)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingEcoCell === route.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              value={editEcoValue}
                              onChange={(e) => setEditEcoValue(e.target.value)}
                              className="w-20 px-2 py-1 bg-neutral-700 border border-green-400 rounded text-white text-sm text-center"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleSaveEcoPrice(route.id);
                                if (e.key === "Escape") {
                                  setEditingEcoCell(null);
                                  setEditEcoValue("");
                                }
                              }}
                            />
                            <button
                              onClick={() => handleSaveEcoPrice(route.id)}
                              disabled={isSaving}
                              className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingEcoCell(null);
                                setEditEcoValue("");
                              }}
                              className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingEcoCell(route.id);
                              setEditEcoValue(route.price?.toString() || "0");
                            }}
                            className={`text-sm font-medium px-2 py-1 rounded transition-colors ${
                              route.price === null
                                ? "text-yellow-400 hover:bg-yellow-500/10"
                                : "text-green-400 hover:bg-green-500/10"
                            }`}
                          >
                            {route.price === null
                              ? "Set Price"
                              : `SAR ${Number(route.price).toLocaleString()}`}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            setDeleteTarget({
                              id: route.id,
                              name: route.routeName,
                            })
                          }
                          className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Eco Cards */}
          <div className="md:hidden divide-y divide-green-500/20">
            {ecoRoutes.map((route) => (
              <div key={route.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white font-medium">
                    {route.pickupLocation} → {route.dropoffLocation}
                  </span>
                  {route.isTBD && (
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 rounded px-1.5 py-0.5">
                      TBD
                    </span>
                  )}
                </div>
                {editingEcoCell === route.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editEcoValue}
                      onChange={(e) => setEditEcoValue(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-neutral-700 border border-green-400 rounded text-white text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEcoPrice(route.id);
                      }}
                    />
                    <button
                      onClick={() => handleSaveEcoPrice(route.id)}
                      className="p-1.5 text-green-400"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingEcoCell(null);
                        setEditEcoValue("");
                      }}
                      className="p-1.5 text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingEcoCell(route.id);
                      setEditEcoValue(route.price?.toString() || "0");
                    }}
                    className={`text-sm font-medium ${route.price === null ? "text-yellow-400" : "text-green-400"}`}
                  >
                    {route.price === null
                      ? "Set Price"
                      : `SAR ${Number(route.price).toLocaleString()}`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Click any price to edit. All prices in SAR | Inclusive of 15% VAT
      </p>

      {/* Change History */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-neutral-800 flex items-center gap-3">
          <History className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">
            Tariff Change History
          </h3>
        </div>
        {isHistoryLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
          </div>
        ) : changeLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No changes recorded yet
          </div>
        ) : (
          <>
            <div className="divide-y divide-neutral-800">
              {changeLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 text-sm gap-2 hover:bg-neutral-800/30"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <Edit2 className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-400">
                      [{log.user}]
                      {log.action === "bulk_update" ? (
                        <>
                          {" "}
                          bulk updated{" "}
                          <span className="text-white">{log.routeName}</span>
                          {log.city && (
                            <>
                              {" "}
                              in{" "}
                              <span className="text-luxury-gold">
                                {log.city}
                              </span>
                            </>
                          )}
                          {log.routeType && (
                            <>
                              {" "}
                              (
                              <span className="text-gray-300">
                                {log.routeType === "ONE_WAY"
                                  ? "One Way"
                                  : "Hourly"}
                              </span>
                              )
                            </>
                          )}
                          {log.bulkPercent !== null &&
                            log.bulkPercent !== undefined && (
                              <>
                                {" "}
                                by{" "}
                                <span className="text-luxury-gold">
                                  {parseFloat(String(log.bulkPercent)) > 0
                                    ? "+"
                                    : ""}
                                  {parseFloat(String(log.bulkPercent))}%
                                </span>
                              </>
                            )}
                        </>
                      ) : log.action === "created" ? (
                        <>
                          {" "}
                          added{" "}
                          <span className="text-white">{log.routeName}</span>
                          {log.city && (
                            <>
                              {" "}
                              in{" "}
                              <span className="text-luxury-gold">
                                {log.city}
                              </span>
                            </>
                          )}
                        </>
                      ) : log.action === "deleted" ? (
                        <>
                          {" "}
                          removed{" "}
                          <span className="text-white">{log.routeName}</span>
                          {log.city && (
                            <>
                              {" "}
                              from{" "}
                              <span className="text-luxury-gold">
                                {log.city}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {" "}
                          updated{" "}
                          <span className="text-white">{log.routeName}</span>
                          {log.vehicleClass && <> ({log.vehicleClass})</>}:
                          <span className="text-red-400 ml-1">
                            SAR {log.oldValue ?? "—"}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-500 inline mx-1" />
                          <span className="text-green-400">
                            SAR {log.newValue}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {new Date(log.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
            {historyPagination.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Page {historyPagination.page} of{" "}
                  {historyPagination.totalPages} ({historyPagination.total}{" "}
                  total)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      fetchChangeHistory(historyPagination.page - 1)
                    }
                    disabled={historyPagination.page === 1}
                    className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      fetchChangeHistory(historyPagination.page + 1)
                    }
                    disabled={
                      historyPagination.page >= historyPagination.totalPages
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

      {/* ============== MODALS ============== */}

      {/* Bulk Update Modal */}
      {showBulkUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBulkUpdateModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">
                Bulk Price Update
              </h3>
              <button
                onClick={() => setShowBulkUpdateModal(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-400">
                Apply a percentage increase or decrease to all{" "}
                <span className="text-white">
                  {activeTab === "eco"
                    ? "Eco Fleet"
                    : activeTab === "hourly"
                      ? "Hourly"
                      : "One Way"}
                </span>{" "}
                prices in{" "}
                <span className="text-luxury-gold">
                  {CITIES.find((c) => c.id === activeCity)?.name}
                </span>
                .
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Percentage Change
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bulkUpdatePercent}
                    onChange={(e) => setBulkUpdatePercent(e.target.value)}
                    placeholder="e.g. 5 or -10"
                    className="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold"
                  />
                  <span className="text-white">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Use positive for increase, negative for decrease
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowBulkUpdateModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                disabled={!bulkUpdatePercent || isSaving}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Route Modal */}
      {showAddRouteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddRouteModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">
                Add New Route
              </h3>
              <button
                onClick={() => setShowAddRouteModal(false)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Pickup Location
                </label>
                <input
                  type="text"
                  value={newRoute.pickup}
                  onChange={(e) =>
                    setNewRoute((prev) => ({ ...prev, pickup: e.target.value }))
                  }
                  placeholder="e.g. Riyadh City"
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Drop-off Location
                </label>
                <input
                  type="text"
                  value={newRoute.dropoff}
                  onChange={(e) =>
                    setNewRoute((prev) => ({
                      ...prev,
                      dropoff: e.target.value,
                    }))
                  }
                  placeholder="e.g. New Destination"
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold"
                />
              </div>
              <div className="flex items-center gap-3 p-3 bg-neutral-800 rounded-lg">
                <input
                  type="checkbox"
                  id="isPerKm"
                  checked={newRoute.isPerKm}
                  onChange={(e) =>
                    setNewRoute((prev) => ({
                      ...prev,
                      isPerKm: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-neutral-600 text-luxury-gold focus:ring-luxury-gold bg-neutral-700"
                />
                <label htmlFor="isPerKm" className="text-sm text-gray-300">
                  This is a per-kilometer route
                </label>
              </div>
              <p className="text-xs text-gray-500">
                New route will be added to{" "}
                {CITIES.find((c) => c.id === activeCity)?.name} as{" "}
                {activeTab === "hourly" ? "Hourly" : "One Way"}. You can set
                prices after adding.
              </p>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowAddRouteModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoute}
                disabled={!newRoute.pickup || !newRoute.dropoff || isSaving}
                className="px-4 py-2 bg-luxury-gold hover:bg-luxury-gold/90 disabled:opacity-50 text-black rounded-lg transition-colors flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Delete Route
              </h3>
              <p className="text-sm text-gray-400 mb-1">
                Are you sure you want to delete
              </p>
              <p className="text-white font-medium mb-4">
                "{deleteTarget.name}"?
              </p>
              <p className="text-xs text-gray-500">
                This will remove the route and all its pricing. This action
                cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRoute(deleteTarget.id)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                Delete Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
