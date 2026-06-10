"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BOOKINGS, DRIVERS, FLEET, type VehicleType } from "@/lib/dummy-data";
import BookingList from "@/components/admin/booking-list";
import PricingStrategyPanel from "@/components/admin/pricing-strategy-panel";
import UserDriverPanel from "@/components/admin/user-driver-panel";
import {
  Car,
  Users,
  Calendar,
  Loader2,
  Wrench,
  Filter,
  DollarSign,
} from "lucide-react";
import DashboardHeader from "@/components/shared/dashboard-header";

const vehicleStatusConfig = {
  available: {
    color: "text-green-400",
    bg: "bg-green-400/10",
    label: "Available",
  },
  "on-trip": { color: "text-blue-400", bg: "bg-blue-400/10", label: "On Trip" },
  maintenance: {
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    label: "Maintenance",
  },
};

const vehicleLabels: Record<VehicleType, string> = {
  "economy-sedan": "Economy Sedan",
  sedan: "Business Sedan",
  suv: "Business SUV",
  "first-class": "First Class",
  sprinter: "Sprinter VIP",
};

type TabType = "bookings" | "drivers" | "fleet" | "pricing";

export default function OperationsDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("bookings");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    // Wait for session check before deciding to redirect. On refresh,
    // isAuthenticated is briefly false while the session loads — without
    // this guard the user gets bounced to home every time they refresh.
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/");
    } else if (user?.role !== "OPERATIONS") {
      router.push(`/dashboard/${user?.role?.toLowerCase()}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== "OPERATIONS") {
    return (
      <div className="min-h-screen bg-luxury-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  // Metrics
  const activeBookings = BOOKINGS.filter(
    (b) => b.status === "confirmed" || b.status === "in-progress",
  ).length;
  const availableDrivers = DRIVERS.filter(
    (d) => d.status === "available",
  ).length;
  const availableVehicles = FLEET.filter(
    (v) => v.status === "available",
  ).length;
  const maintenanceVehicles = FLEET.filter(
    (v) => v.status === "maintenance",
  ).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const filteredDrivers = DRIVERS.filter(
    (d) => statusFilter === "all" || d.status === statusFilter,
  );

  const filteredFleet = FLEET.filter(
    (v) => statusFilter === "all" || v.status === statusFilter,
  );

  return (
    <>
      <DashboardHeader
        title="Operations Dashboard"
        subtitle="Manage bookings, drivers, fleet, and pricing"
      />
      <div className="min-h-screen bg-luxury-dark pt-24 pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm text-gray-400">Active Bookings</span>
              </div>
              <p className="text-2xl font-bold text-white">{activeBookings}</p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-sm text-gray-400">Available Drivers</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {availableDrivers}/{DRIVERS.length}
              </p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                  <Car className="w-5 h-5 text-luxury-gold" />
                </div>
                <span className="text-sm text-gray-400">
                  Available Vehicles
                </span>
              </div>
              <p className="text-2xl font-bold text-white">
                {availableVehicles}/{FLEET.length}
              </p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-orange-400" />
                </div>
                <span className="text-sm text-gray-400">In Maintenance</span>
              </div>
              <p className="text-2xl font-bold text-orange-400">
                {maintenanceVehicles}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            {(["bookings", "drivers", "fleet", "pricing"] as TabType[]).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setStatusFilter("all");
                  }}
                  className={`px-4 py-2 rounded-lg font-medium capitalize whitespace-nowrap transition-colors flex items-center gap-2 ${
                    activeTab === tab
                      ? "bg-luxury-gold text-black"
                      : "bg-neutral-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "pricing" && <DollarSign className="w-4 h-4" />}
                  {tab === "pricing" ? "Pricing Strategy" : tab}
                </button>
              ),
            )}
          </div>

          {/* Pricing Tab - Using new component */}
          {activeTab === "pricing" && <PricingStrategyPanel />}

          {/* Bookings Tab */}
          {activeTab === "bookings" && <BookingList />}

          {/* Drivers Tab */}
          {activeTab === "drivers" && <UserDriverPanel />}

          {/* Fleet Tab */}
          {activeTab === "fleet" && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex items-center gap-4">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
                >
                  <option value="all">All Status</option>
                  <option value="available">Available</option>
                  <option value="on-trip">On Trip</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>

              <div className="divide-y divide-neutral-800">
                {filteredFleet.map((vehicle) => {
                  const status = vehicleStatusConfig[vehicle.status];
                  const assignedDriver = DRIVERS.find(
                    (d) => d.vehicleId === vehicle.id,
                  );
                  return (
                    <div
                      key={vehicle.id}
                      className="p-4 hover:bg-neutral-800/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                            <Car className="w-6 h-6 text-luxury-gold" />
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {vehicle.model}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-gray-400">
                              <span>
                                {vehicleLabels[vehicle.type] || vehicle.type}
                              </span>
                              <span className="text-gray-600">|</span>
                              <span>{vehicle.plateNumber}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {assignedDriver ? (
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                                <span className="text-sm text-gray-400">
                                  {assignedDriver.name[0]}
                                </span>
                              </div>
                              <span className="text-sm text-gray-400">
                                {assignedDriver.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">
                              Unassigned
                            </span>
                          )}
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
