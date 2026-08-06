"use client";

// ============================================
// !!! DESTINATION PATH: apps/web/components/admin/booking-ops-panel.tsx
// ============================================
// Admin surface for the booking-change feature:
//   - Deletion requests: approve (soft delete) or decline partner requests
//   - Temporary assets: review photos, approve/reject vendor ad-hoc vehicles/drivers
//   - Lead-time rules: the min-hours cutoffs for partner/vendor change & cancel
// One panel, three sub-tabs — keeps the admin nav uncluttered.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Trash2,
  Car,
  User,
  Check,
  X,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { adminApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";

type SubTab = "deletions" | "temp" | "rules";

const SUBTABS: Array<{ id: SubTab; label: string; icon: any }> = [
  { id: "deletions", label: "Deletion requests", icon: Trash2 },
  { id: "temp", label: "Temporary assets", icon: Car },
  { id: "rules", label: "Lead-time rules", icon: Clock },
];

const cardCls = "rounded-xl border border-neutral-800 bg-neutral-900 p-4";
const primaryBtn =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600/90 hover:bg-red-500 text-white transition-colors disabled:opacity-50";

// --------------------------------------------------------------
// Reject reason dialog (shared)
// --------------------------------------------------------------
function RejectDialog({
  title,
  onClose,
  onConfirm,
}: {
  title: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 shadow-xl">
        <div className="px-5 py-4 border-b border-neutral-800 text-white font-semibold text-sm">
          {title}
        </div>
        <div className="px-5 py-4">
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (shared with the requester)"
            className="w-full px-3 py-2 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-luxury-gold/60"
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
            className={dangerBtn}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------
// Deletion requests
// --------------------------------------------------------------
function DeletionRequests() {
  const { showNotification } = useNotification();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await adminApi.listDeletionRequests({
        status: "PENDING",
      });
      setRows(res?.data ?? []);
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't load requests.");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.approveDeletion(id);
      showNotification("success", "Booking deleted.");
      load();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't approve.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Spinner />;
  if (rows.length === 0) return <Empty label="No pending deletion requests." />;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className={cardCls}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">
                  {r.booking?.bookingRef ?? "—"}
                </span>
                <span className="text-xs text-gray-500">
                  {r.partner?.companyName ?? "—"}
                </span>
              </div>
              <p className="text-sm text-gray-300 mt-1">{r.reason}</p>
              {r.booking && (
                <p className="text-xs text-gray-500 mt-1">
                  {r.booking.pickupAddress} → {r.booking.dropoffAddress}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                disabled={busyId === r.id}
                onClick={() => approve(r.id)}
                className={primaryBtn}
              >
                {busyId === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Approve
              </button>
              <button
                disabled={busyId === r.id}
                onClick={() => setRejecting(r.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
                Decline
              </button>
            </div>
          </div>
        </div>
      ))}
      {rejecting && (
        <RejectDialog
          title="Decline deletion request"
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            try {
              await adminApi.rejectDeletion(rejecting, { adminNote: reason });
              showNotification("success", "Request declined.");
              setRejecting(null);
              load();
            } catch (err: any) {
              showNotification("error", err?.message || "Couldn't decline.");
            }
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------
// Temporary assets
// --------------------------------------------------------------
function TemporaryAssets() {
  const { showNotification } = useNotification();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{
    id: string;
    kind: "vehicle" | "driver";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await adminApi.listTemporaryAssets({
        status: "PENDING_APPROVAL",
      });
      setVehicles(res?.data?.vehicles ?? []);
      setDrivers(res?.data?.drivers ?? []);
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't load assets.");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string, kind: "vehicle" | "driver") => {
    setBusyId(id);
    try {
      if (kind === "vehicle") await adminApi.approveTemporaryVehicle(id);
      else await adminApi.approveTemporaryDriver(id);
      showNotification("success", `Temporary ${kind} approved.`);
      load();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't approve.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Spinner />;
  if (vehicles.length === 0 && drivers.length === 0)
    return <Empty label="No temporary assets awaiting approval." />;

  return (
    <div className="space-y-6">
      {vehicles.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
            Vehicles
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((v) => (
              <div key={v.id} className={cardCls}>
                <div className="flex items-center gap-2 mb-2">
                  <Car className="w-4 h-4 text-luxury-gold" />
                  <span className="text-white font-medium">{v.model}</span>
                  <span className="text-xs text-gray-500">
                    {v.vehicleClass}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {v.vendor?.companyName}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Photo src={v.frontPhotoUrl} label="Front" />
                  <Photo src={v.backPhotoUrl} label="Back" />
                </div>
                <ApproveReject
                  busy={busyId === v.id}
                  onApprove={() => approve(v.id, "vehicle")}
                  onReject={() => setRejecting({ id: v.id, kind: "vehicle" })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {drivers.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
            Drivers
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {drivers.map((d) => (
              <div key={d.id} className={cardCls}>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-luxury-gold" />
                  <span className="text-white font-medium">{d.name}</span>
                  {d.photoVerified && (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {d.mobile} · {d.vendor?.companyName}
                </p>
                <div className="mb-3 w-32">
                  <Photo src={d.photoUrl} label="Driver" />
                </div>
                <ApproveReject
                  busy={busyId === d.id}
                  onApprove={() => approve(d.id, "driver")}
                  onReject={() => setRejecting({ id: d.id, kind: "driver" })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {rejecting && (
        <RejectDialog
          title={`Reject temporary ${rejecting.kind}`}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            try {
              if (rejecting.kind === "vehicle")
                await adminApi.rejectTemporaryVehicle(rejecting.id, { reason });
              else
                await adminApi.rejectTemporaryDriver(rejecting.id, { reason });
              showNotification(
                "success",
                `Temporary ${rejecting.kind} rejected.`,
              );
              setRejecting(null);
              load();
            } catch (err: any) {
              showNotification("error", err?.message || "Couldn't reject.");
            }
          }}
        />
      )}
    </div>
  );
}

function ApproveReject({
  busy,
  onApprove,
  onReject,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button disabled={busy} onClick={onApprove} className={primaryBtn}>
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
        Approve
      </button>
      <button
        disabled={busy}
        onClick={onReject}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-neutral-800"
      >
        <X className="w-4 h-4" />
        Reject
      </button>
    </div>
  );
}

function Photo({ src, label }: { src: string | null; label: string }) {
  if (!src)
    return (
      <div className="aspect-video rounded-lg bg-neutral-800 flex items-center justify-center text-xs text-gray-600">
        No {label.toLowerCase()} photo
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      className="aspect-video w-full object-cover rounded-lg border border-neutral-800"
    />
  );
}

// --------------------------------------------------------------
// Lead-time rules
// --------------------------------------------------------------
const RULE_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  {
    key: "partnerChangeCutoffHours",
    label: "Partner — change",
    hint: "How many hours before the trip a partner can still modify it.",
  },
  {
    key: "partnerCancelCutoffHours",
    label: "Partner — cancel",
    hint: "How many hours before the trip a partner can still cancel it.",
  },
  {
    key: "vendorCancelCutoffHours",
    label: "Vendor — cancel",
    hint: "How many hours before the trip a vendor can still cancel it.",
  },
  {
    key: "vendorChangeCutoffHours",
    label: "Vendor — change",
    hint: "Reserved. No vendor-initiated detail change is gated by this yet.",
  },
];

function LeadTimeRules() {
  const { showNotification } = useNotification();
  const [form, setForm] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi
      .getBookingPolicy()
      .then((res: any) => setForm(res?.data ?? {}))
      .catch((err: any) =>
        showNotification("error", err?.message || "Couldn't load rules."),
      );
  }, [showNotification]);

  if (!form) return <Spinner />;

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      RULE_FIELDS.forEach((f) => (body[f.key] = Number(form[f.key]) || 0));
      const res: any = await adminApi.updateBookingPolicy(body);
      setForm(res?.data ?? form);
      showNotification("success", "Lead-time rules updated.");
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${cardCls} max-w-lg`}>
      <p className="text-sm text-gray-400 mb-4">
        Minimum lead time, in hours before the trip, after which the action is
        locked.
      </p>
      <div className="space-y-4">
        {RULE_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-white">{f.label}</div>
              <div className="text-xs text-gray-500">{f.hint}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="number"
                min={0}
                max={720}
                value={form[f.key] ?? 0}
                onChange={(e) =>
                  setForm({ ...form, [f.key]: Number(e.target.value) })
                }
                className="w-20 px-3 py-2 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm text-right focus:outline-none focus:border-luxury-gold/60"
              />
              <span className="text-xs text-gray-500 w-8">hrs</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-luxury-gold hover:bg-luxury-gold/90 text-black rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save rules
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------
// Shared bits + shell
// --------------------------------------------------------------
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-500">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="py-16 text-center text-sm text-gray-500">{label}</div>;
}

export default function BookingOpsPanel() {
  const [tab, setTab] = useState<SubTab>("deletions");
  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-neutral-800">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-luxury-gold text-luxury-gold"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "deletions" && <DeletionRequests />}
      {tab === "temp" && <TemporaryAssets />}
      {tab === "rules" && <LeadTimeRules />}
    </div>
  );
}
