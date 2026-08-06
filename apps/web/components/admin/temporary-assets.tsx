"use client";

// --------------------------------------------------------------
// Admin review of vendor-submitted temporary assets. Vendors add a
// temporary vehicle/driver for an eleventh-hour job; it lands here as
// PENDING_APPROVAL and can't be assigned until an admin approves it.
// Approve activates it; reject sends it back with a reason.
// --------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Check,
  X,
  Car,
  User,
  Building2,
  Phone,
  ShieldCheck,
  RotateCw,
} from "lucide-react";
import { adminApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";

interface TempVehicle {
  id: string;
  vendor: { id: string; companyName: string };
  model: string;
  vehicleClass: string;
  status: string;
  singleUse: boolean;
  completedBookingCount: number;
  frontPhotoUrl: string;
  backPhotoUrl: string;
  createdAt: string;
}
interface TempDriver {
  id: string;
  vendor: { id: string; companyName: string };
  name: string;
  mobile: string;
  status: string;
  singleUse: boolean;
  photoVerified: boolean;
  completedBookingCount: number;
  photoUrl: string;
  createdAt: string;
}

const STATUS_TABS = [
  { key: "PENDING_APPROVAL", label: "Pending" },
  { key: "ACTIVE", label: "Active" },
  { key: "REJECTED", label: "Rejected" },
];

const humanize = (s: string) => s.replace(/_/g, " ").toLowerCase();

function RejectDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 shadow-xl">
        <div className="px-5 py-4 border-b border-neutral-800 text-white font-semibold text-sm">
          Reject this asset
        </div>
        <div className="px-5 py-4">
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (shared with the vendor)"
            className="w-full px-3 py-2 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm focus:outline-none focus:border-luxury-gold/60"
          />
        </div>
        <div className="px-5 py-4 border-t border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({
  status,
  busy,
  onApprove,
  onReject,
}: {
  status: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (status !== "PENDING_APPROVAL") return null;
  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={onApprove}
        disabled={busy}
        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-black bg-luxury-gold hover:bg-luxury-gold/90 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
        Approve
      </button>
      <button
        onClick={onReject}
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 border border-neutral-700 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
      >
        <X className="w-4 h-4" />
        Reject
      </button>
    </div>
  );
}

export default function AdminTemporaryAssets() {
  const { showNotification } = useNotification();
  const [status, setStatus] = useState("PENDING_APPROVAL");
  const [vehicles, setVehicles] = useState<TempVehicle[]>([]);
  const [drivers, setDrivers] = useState<TempDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{
    kind: "vehicle" | "driver";
    id: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await adminApi.listTemporaryAssets({ status });
      setVehicles(res?.data?.vehicles ?? []);
      setDrivers(res?.data?.drivers ?? []);
    } catch (err: any) {
      showNotification(
        "error",
        err?.message || "Couldn't load temporary assets.",
      );
    } finally {
      setLoading(false);
    }
  }, [status, showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (kind: "vehicle" | "driver", id: string) => {
    setBusyId(id);
    try {
      if (kind === "vehicle") await adminApi.approveTemporaryVehicle(id);
      else await adminApi.approveTemporaryDriver(id);
      showNotification("success", `Temporary ${kind} approved.`);
      load();
    } catch (err: any) {
      showNotification(
        "error",
        err?.message || `Couldn't approve the ${kind}.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (reason: string) => {
    if (!rejecting) return;
    const { kind, id } = rejecting;
    setBusyId(id);
    try {
      if (kind === "vehicle")
        await adminApi.rejectTemporaryVehicle(id, { reason });
      else await adminApi.rejectTemporaryDriver(id, { reason });
      showNotification("success", `Temporary ${kind} rejected.`);
      setRejecting(null);
      load();
    } catch (err: any) {
      showNotification("error", err?.message || `Couldn't reject the ${kind}.`);
    } finally {
      setBusyId(null);
    }
  };

  const total = vehicles.length + drivers.length;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Temporary Assets</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Review vendor-submitted temporary vehicles and drivers. Approved
          assets become available for last-minute assignment.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              status === t.key
                ? "border-luxury-gold/60 bg-luxury-gold/15 text-luxury-gold"
                : "border-neutral-800 text-gray-400 hover:text-white hover:border-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 border border-neutral-800 hover:text-white"
        >
          <RotateCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : total === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">
          No {status === "PENDING_APPROVAL" ? "pending" : humanize(status)}{" "}
          temporary assets.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Vehicles */}
          {vehicles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                <Car className="w-4 h-4" /> Vehicles ({vehicles.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vehicles.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-0.5 bg-neutral-800">
                      {[v.frontPhotoUrl, v.backPhotoUrl].map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          alt={i === 0 ? "Front" : "Back"}
                          className="w-full aspect-video object-cover"
                        />
                      ))}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-white">
                          {v.model}
                        </h4>
                        {v.singleUse && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-gray-400">
                            Single-use
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-luxury-gold/80 capitalize mt-0.5">
                        {humanize(v.vehicleClass)}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        {v.vendor.companyName}
                      </p>
                      <ActionButtons
                        status={v.status}
                        busy={busyId === v.id}
                        onApprove={() => approve("vehicle", v.id)}
                        onReject={() =>
                          setRejecting({ kind: "vehicle", id: v.id })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drivers */}
          {drivers.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-luxury-gold flex items-center gap-2 mb-3">
                <User className="w-4 h-4" /> Drivers ({drivers.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {drivers.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={d.photoUrl}
                        alt={d.name}
                        className="w-16 h-16 rounded-lg object-cover bg-neutral-800 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {d.name}
                        </h4>
                        <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          {d.mobile}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {d.vendor.companyName}
                          </span>
                        </p>
                        {d.photoVerified && (
                          <span className="inline-flex items-center gap-1 mt-2 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                            <ShieldCheck className="w-3 h-3" /> Photo verified
                          </span>
                        )}
                      </div>
                    </div>
                    <ActionButtons
                      status={d.status}
                      busy={busyId === d.id}
                      onApprove={() => approve("driver", d.id)}
                      onReject={() =>
                        setRejecting({ kind: "driver", id: d.id })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {rejecting && (
        <RejectDialog onClose={() => setRejecting(null)} onConfirm={reject} />
      )}
    </div>
  );
}
