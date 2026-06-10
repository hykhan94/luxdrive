"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LogOut, User, Shield, Briefcase, Settings } from "lucide-react";

const roleConfig = {
  SALES: {
    label: "Sales Team",
    icon: Briefcase,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  OPERATIONS: {
    label: "Operations Team",
    icon: Settings,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  ADMIN: {
    label: "Super Admin",
    icon: Shield,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  CUSTOMER: {
    label: "Customer",
    icon: User,
    color: "text-luxury-gold",
    bg: "bg-luxury-gold/10",
    border: "border-luxury-gold/30",
  },
  // Vendor / Partner / Finance aren't currently expected to use this
  // shared header (they have their own portal-specific headers), but
  // include defaults so an unexpected role doesn't crash the page.
  VENDOR: {
    label: "Vendor",
    icon: Briefcase,
    color: "text-luxury-gold",
    bg: "bg-luxury-gold/10",
    border: "border-luxury-gold/30",
  },
  PARTNER: {
    label: "Partner",
    icon: Briefcase,
    color: "text-luxury-gold",
    bg: "bg-luxury-gold/10",
    border: "border-luxury-gold/30",
  },
  FINANCE: {
    label: "Finance",
    icon: Briefcase,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
} as const;

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
}

export default function DashboardHeader({
  title,
  subtitle,
}: DashboardHeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (!user) return null;

  // UserRole values are uppercase ('SALES' / 'OPERATIONS' etc.) so
  // index roleConfig with the value as-is. Falls back to CUSTOMER's
  // styling if an unrecognized role slips through (shouldn't happen
  // given the union above, but guards against a runtime crash if the
  // backend ever introduces a new role before the frontend catches up).
  const config = roleConfig[user.role] ?? roleConfig.CUSTOMER;
  const RoleIcon = config.icon;

  // user.name is `string | null` on the User type — fall back to the
  // email (always present) then to a generic label so the render below
  // can use displayName without null guards at each site.
  const displayName = user.name ?? user.email ?? "Account";
  const displayInitial = displayName.charAt(0).toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-luxury-dark/95 backdrop-blur-md border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-serif font-bold">
                <span className="text-white">Lux</span>
                <span className="text-luxury-gold">Drive</span>
              </span>
            </a>
            <div className="hidden md:block">
              <h1 className="text-white font-medium">{title}</h1>
              <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* Role Badge */}
            <div
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.bg} ${config.border} border`}
            >
              <RoleIcon className={`w-4 h-4 ${config.color}`} />
              <span className={`text-sm font-medium ${config.color}`}>
                {config.label}
              </span>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm text-white font-medium">{displayName}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-luxury-gold/20 flex items-center justify-center">
                <span className="text-luxury-gold font-medium">
                  {displayInitial}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                Logout
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
