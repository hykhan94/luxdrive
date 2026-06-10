"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BOOKINGS } from "@/lib/dummy-data";
import MembershipRewards from "@/components/customer/membership-rewards";
import {
  Calendar,
  Clock,
  MapPin,
  Car,
  Plus,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Home,
  LogOut,
} from "lucide-react";

const statusConfig = {
  pending: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    label: "Pending",
  },
  confirmed: {
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-400/10",
    label: "Confirmed",
  },
  "in-progress": {
    icon: Loader2,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-gray-400",
    bg: "bg-gray-400/10",
    label: "Completed",
  },
  cancelled: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    label: "Cancelled",
  },
};

const vehicleLabels: Record<string, string> = {
  "economy-sedan": "Economy Sedan",
  sedan: "Business Sedan",
  suv: "Business SUV",
  "first-class": "First Class",
};

export default function CustomerDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  useEffect(() => {
    // Wait for session check before deciding to redirect. On refresh,
    // isAuthenticated is briefly false while the session loads — without
    // this guard the user gets bounced to home every time they refresh.
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/");
    } else if (user?.role !== "CUSTOMER") {
      // UserRole values are uppercase ('CUSTOMER', 'VENDOR', etc.)
      // but the portal route segments are lowercase
      // ('/dashboard/customer'). Lowercase the role before building
      // the URL.
      router.push(`/dashboard/${user?.role?.toLowerCase()}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== "CUSTOMER") {
    return (
      <div className="min-h-screen bg-luxury-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  // user.name is `string | null` on the User type — fall back to email,
  // then to a generic label, so the header rendering below can use
  // `displayName` without null guards at every site.
  const displayName = user.name ?? user.email ?? "Guest";
  const displayInitial = displayName.charAt(0).toUpperCase();
  const displayFirstName = displayName.split(" ")[0];

  // Filter bookings for demo - in real app would filter by user ID
  const upcomingBookings = BOOKINGS.filter(
    (b) => b.status === "confirmed" || b.status === "in-progress",
  );
  const pastBookings = BOOKINGS.filter(
    (b) => b.status === "completed" || b.status === "cancelled",
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-luxury-dark">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-luxury-dark/95 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="h-16 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-luxury-gold to-luxury-gold/60 rounded-lg flex items-center justify-center shadow-lg shadow-luxury-gold/20">
                <span className="text-luxury-dark font-serif font-bold text-base">
                  L
                </span>
              </div>
              <span className="hidden sm:block font-serif font-bold text-lg">
                <span className="text-white">Lux</span>
                <span className="text-luxury-gold">Drive</span>
              </span>
            </Link>

            {/* Right Side */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-luxury-gold transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>

              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-neutral-700">
                <div className="text-right">
                  <p className="text-sm font-medium text-white">
                    {displayName}
                  </p>
                  <p className="text-xs text-luxury-gold capitalize">
                    {user.role}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-full bg-luxury-gold/20 border border-luxury-gold/50 flex items-center justify-center">
                  <span className="text-luxury-gold font-medium text-sm">
                    {displayInitial}
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-24 lg:pb-8 max-w-6xl mx-auto px-4 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-serif text-white mb-2">
            Welcome back,{" "}
            <span className="text-luxury-gold">{displayFirstName}</span>
          </h1>
          <p className="text-gray-400">Manage your bookings and trips</p>
        </div>

        {/* Membership & Rewards Section */}
        <MembershipRewards />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Link
            href="/#hero"
            className="flex flex-col items-center justify-center p-6 bg-luxury-gold/10 border border-luxury-gold/30 rounded-xl hover:bg-luxury-gold/20 transition-colors group"
          >
            <Plus className="w-8 h-8 text-luxury-gold mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-white font-medium">New Booking</span>
          </Link>
          <div className="flex flex-col items-center justify-center p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <span className="text-3xl font-bold text-white mb-1">
              {upcomingBookings.length}
            </span>
            <span className="text-xs text-gray-400">Upcoming</span>
          </div>
          <div className="flex flex-col items-center justify-center p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <span className="text-3xl font-bold text-white mb-1">
              {pastBookings.filter((b) => b.status === "completed").length}
            </span>
            <span className="text-xs text-gray-400">Completed</span>
          </div>
          <div className="flex flex-col items-center justify-center p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
            <span className="text-3xl font-bold text-luxury-gold mb-1">
              SAR 4,500
            </span>
            <span className="text-xs text-gray-400">Total Spent</span>
          </div>
        </div>

        {/* Upcoming Bookings */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Upcoming Trips</h2>
            <span className="text-sm text-gray-400">
              {upcomingBookings.length} trips
            </span>
          </div>

          {upcomingBookings.length === 0 ? (
            <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-xl text-center">
              <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-4">No upcoming trips</p>
              <Link
                href="/#hero"
                className="inline-flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Book a Ride
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingBookings.map((booking) => {
                const status = statusConfig[booking.status];
                const StatusIcon = status.icon;
                return (
                  <div
                    key={booking.id}
                    className="p-4 md:p-6 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Trip Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
                          >
                            <StatusIcon
                              className={`w-3 h-3 inline mr-1 ${booking.status === "in-progress" ? "animate-spin" : ""}`}
                            />
                            {status.label}
                          </span>
                          <span className="text-sm text-gray-500">
                            {booking.id}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="text-white text-sm">
                              {booking.pickup}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <span className="text-white text-sm">
                              {booking.dropoff}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Date & Vehicle */}
                      <div className="flex md:flex-col items-center md:items-end gap-4 md:gap-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Calendar className="w-4 h-4" />
                          {formatDate(booking.date)}
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                          <Clock className="w-4 h-4" />
                          {booking.time}
                        </div>
                        <div className="flex items-center gap-2 text-luxury-gold">
                          <Car className="w-4 h-4" />
                          {vehicleLabels[booking.vehicle]}
                        </div>
                      </div>

                      {/* Right: Price & Action */}
                      <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                        <span className="text-xl font-bold text-white">
                          SAR {booking.price}
                        </span>
                        <button className="flex items-center gap-1 text-luxury-gold text-sm hover:underline">
                          Details <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Driver Info */}
                    {booking.driverName && (
                      <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-luxury-gold/20 flex items-center justify-center">
                          <span className="text-luxury-gold font-medium">
                            {booking.driverName[0]}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-white">
                            Driver: {booking.driverName}
                          </p>
                          <p className="text-xs text-gray-500">
                            Driver details sent 30 min before pickup
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Past Bookings */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Past Trips</h2>
            <span className="text-sm text-gray-400">
              {pastBookings.length} trips
            </span>
          </div>

          <div className="space-y-3">
            {pastBookings.map((booking) => {
              const status = statusConfig[booking.status];
              return (
                <div
                  key={booking.id}
                  className="p-4 bg-neutral-900/50 border border-neutral-800/50 rounded-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.color}`}
                      >
                        {status.label}
                      </span>
                      <div>
                        <p className="text-sm text-white">
                          {booking.pickup} → {booking.dropoff}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(booking.date)} •{" "}
                          {vehicleLabels[booking.vehicle]}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-400">
                      SAR {booking.price}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
