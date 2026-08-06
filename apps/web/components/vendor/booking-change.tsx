"use client";

// ============================================
// !!! DESTINATION PATH: apps/web/components/vendor/booking-change.tsx
// ============================================
// Vendor-side controls for a confirmed booking that has changed or needs
// re-assigning:
//   - Change consent: when a partner/admin edited the confirmed trip, the
//     vendor sees the before/after and accepts or rejects (with reason).
//   - Reassign: swap driver/vehicle — either from the approved fleet or an
//     approved temporary asset (mix allowed).
//   - Cancel: release the booking back to admin.
// Rendered inside the vendor booking detail panel.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ArrowRight,
  Check,
  X,
  RefreshCw,
  Ban,
  AlertCircle,
} from "lucide-react";
import { vendorApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LockedChangeButton } from "@/components/shared/locked-change-button";

interface FieldDiff {
  field: string;
  label: string;
  from: any;
  to: any;
}
interface PendingModification {
  changedFields: FieldDiff[];
  reason: string | null;
  actor: string;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm focus:outline-none focus:border-luxury-gold/60";
// Match the Temporary Assets dropdowns: themed, dark, portaled Radix Select.
const selectTriggerCls =
  "w-full h-11 px-3 rounded-lg bg-neutral-800/60 border-neutral-700 text-white text-sm hover:bg-neutral-800 focus:border-luxury-gold/70 focus:ring-2 focus:ring-luxury-gold/20 data-[state=open]:border-luxury-gold/70";
const selectContentCls =
  "z-[90] max-h-72 bg-neutral-900 border-neutral-700 text-white shadow-2xl";
const selectItemCls =
  "rounded-md py-2 pr-8 text-white focus:bg-neutral-800 focus:text-white data-[state=checked]:text-luxury-gold";
const selectGroupLabelCls = "px-2 pt-2 pb-1 text-[11px] text-gray-500";
const goldBtn =
  "inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-luxury-gold hover:bg-luxury-gold/90 text-black rounded-lg font-medium text-sm transition-colors disabled:opacity-50";

function fmt(v: any): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))
    return new Date(v).toLocaleDateString();
  return String(v);
}

// --------------------------------------------------------------
// Preset reasons for declining a partner's change to a booking the
// vendor already holds. The vendor taps one (or "Other…" to type a
// note); it's sent verbatim as the rejection reason. Keeps rejections
// fast for the vendor and consistent for admin triage.
// Reject reasons are contextual to what actually changed. Vehicle-class
// and city changes never reach this flow — they auto-release the booking
// off the vendor — so those reasons are deliberately absent. Each changed
// field maps to the reason that fits it; "No driver available" is always
// offered, and the dialog appends "Other…" for anything else.
const REJECT_REASON_BY_FIELD: Record<string, string> = {
  tripDate: "New date/time doesn't work",
  tripTime: "New date/time doesn't work",
  hours: "New duration doesn't work",
  hourlyDuration: "New duration doesn't work",
  pickupAddress: "New pickup point doesn't work",
  dropoffAddress: "New drop-off doesn't work",
  route: "New route doesn't work",
  passengers: "Can't fit the new passenger count",
  luggage: "Can't fit the new luggage",
  childSeat: "Can't provide the child seat",
  totalPrice: "Price no longer works",
  flightNumber: "New flight details don't work",
  terminalNo: "New terminal doesn't work",
  terminalLocation: "New terminal doesn't work",
};

function rejectReasonsFor(changedFields: FieldDiff[]): string[] {
  const set = new Set<string>();
  for (const f of changedFields) {
    const r = REJECT_REASON_BY_FIELD[f.field];
    if (r) set.add(r);
  }
  // Always offer the catch-all — a driver may simply not be free.
  set.add("No driver available for the change");
  return [...set];
}

// --------------------------------------------------------------
function ReasonDialog({
  title,
  confirmLabel,
  danger,
  presets,
  note,
  onClose,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  presets?: string[];
  note?: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  // No presets → plain free-text. With presets → chips, and "Other…"
  // reveals the note field. Either way we submit a single reason string
  // (the backend stores it verbatim and shares it with admin).
  const usingOther = !presets || selected === "__other__";
  const reason = usingOther ? custom.trim() : (selected ?? "");
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md bg-neutral-900 border-t border-neutral-800 sm:border rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200">
        {/* Drag handle — reads as a bottom sheet on phones, a card on
            desktop. Slides up from the bottom rather than popping in the
            middle of the screen. */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-neutral-700" />
        </div>
        <div className="px-5 pt-3 sm:pt-4 pb-3">
          <h3 className="text-white font-semibold">{title}</h3>
          {presets && (
            <p className="text-xs text-gray-500 mt-0.5">
              Pick the reason that fits — it&apos;s shared with admin.
            </p>
          )}
          {note && (
            <p className="text-xs text-amber-300/90 mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{note}</span>
            </p>
          )}
        </div>
        <div className="px-5 pb-3 space-y-2 max-h-[50vh] overflow-y-auto">
          {presets &&
            [...presets, "__other__"].map((p) => {
              const isOther = p === "__other__";
              const active = selected === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-sm transition ${
                    active
                      ? "border-luxury-gold/70 bg-luxury-gold/10 text-luxury-gold"
                      : "border-neutral-800 text-gray-300 hover:border-neutral-700"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      active ? "border-luxury-gold" : "border-neutral-600"
                    }`}
                  >
                    {active && (
                      <span className="w-2 h-2 rounded-full bg-luxury-gold" />
                    )}
                  </span>
                  {isOther ? "Other…" : p}
                </button>
              );
            })}
          {usingOther && (
            <textarea
              autoFocus
              rows={3}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={
                presets
                  ? "Add a note (shared with admin)"
                  : "Reason (shared with admin)"
              }
              className={inputCls}
            />
          )}
        </div>
        <div className="px-5 py-4 border-t border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            disabled={busy || !reason}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason);
              } finally {
                setBusy(false);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-luxury-gold hover:bg-luxury-gold/90 !text-black"
            }`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------
function ReassignDrawer({
  bookingId,
  currentDriverId,
  currentVehicleId,
  onClose,
  onDone,
}: {
  bookingId: string;
  currentDriverId?: string | null;
  currentVehicleId?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fleetDrivers, setFleetDrivers] = useState<any[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<any[]>([]);
  const [tempDrivers, setTempDrivers] = useState<any[]>([]);
  const [tempVehicles, setTempVehicles] = useState<any[]>([]);
  // Selection encoded as "fleet:<id>" or "temp:<id>".
  const [driverSel, setDriverSel] = useState("");
  const [vehicleSel, setVehicleSel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opts, tv, td]: any = await Promise.all([
        vendorApi.getAssignmentOptions(bookingId),
        vendorApi.listTemporaryVehicles({ status: "ACTIVE" }),
        vendorApi.listTemporaryDrivers({ status: "ACTIVE" }),
      ]);
      // Exclude the currently-assigned driver/vehicle — reassigning to
      // the same one is a no-op. Matching by id covers fleet and temp.
      setFleetDrivers(
        (opts?.data?.drivers ?? []).filter(
          (d: any) => d.id !== currentDriverId,
        ),
      );
      setFleetVehicles(
        (opts?.data?.vehicles ?? []).filter(
          (v: any) => v.id !== currentVehicleId,
        ),
      );
      setTempVehicles(
        (tv?.data ?? []).filter((v: any) => v.id !== currentVehicleId),
      );
      setTempDrivers(
        (td?.data ?? []).filter((d: any) => d.id !== currentDriverId),
      );
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't load options.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, currentDriverId, currentVehicleId, showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!driverSel && !vehicleSel)
      return showNotification(
        "error",
        "Pick a new driver or vehicle to change.",
      );
    const payload: {
      driverId?: string;
      temporaryDriverId?: string;
      vehicleId?: string;
      temporaryVehicleId?: string;
    } = {};
    if (driverSel) {
      const [dKind, dId] = driverSel.split(":");
      if (dKind === "fleet") payload.driverId = dId;
      else payload.temporaryDriverId = dId;
    }
    if (vehicleSel) {
      const [vKind, vId] = vehicleSel.split(":");
      if (vKind === "fleet") payload.vehicleId = vId;
      else payload.temporaryVehicleId = vId;
    }
    setSaving(true);
    try {
      await vendorApi.reassignBooking(bookingId, payload);
      showNotification("success", "Booking reassigned.");
      onDone();
      onClose();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't reassign.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-sm bg-neutral-900 border-l border-neutral-800 h-full overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h3 className="text-white font-semibold text-sm">
            Reassign driver &amp; vehicle
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Driver
              </label>
              <Select value={driverSel} onValueChange={setDriverSel}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue placeholder="Select a driver…" />
                </SelectTrigger>
                <SelectContent className={selectContentCls}>
                  {fleetDrivers.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={selectGroupLabelCls}>
                        Fleet
                      </SelectLabel>
                      {fleetDrivers.map((d) => (
                        <SelectItem
                          key={d.id}
                          value={`fleet:${d.id}`}
                          className={selectItemCls}
                        >
                          {d.name ?? `${d.firstName} ${d.lastName}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {tempDrivers.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={selectGroupLabelCls}>
                        Temporary
                      </SelectLabel>
                      {tempDrivers.map((d) => (
                        <SelectItem
                          key={d.id}
                          value={`temp:${d.id}`}
                          className={selectItemCls}
                        >
                          {d.name} (temporary)
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Vehicle
              </label>
              <Select value={vehicleSel} onValueChange={setVehicleSel}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue placeholder="Select a vehicle…" />
                </SelectTrigger>
                <SelectContent className={selectContentCls}>
                  {fleetVehicles.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={selectGroupLabelCls}>
                        Fleet
                      </SelectLabel>
                      {fleetVehicles.map((v) => (
                        <SelectItem
                          key={v.id}
                          value={`fleet:${v.id}`}
                          className={selectItemCls}
                        >
                          {v.make ? `${v.make} ${v.model}` : v.model}
                          {v.plateNumber ? ` · ${v.plateNumber}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {tempVehicles.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={selectGroupLabelCls}>
                        Temporary
                      </SelectLabel>
                      {tempVehicles.map((v) => (
                        <SelectItem
                          key={v.id}
                          value={`temp:${v.id}`}
                          className={selectItemCls}
                        >
                          {v.model} (temporary)
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500 mt-1">
                No matching vehicle? Add a temporary one from the Temporary
                Assets tab and reassign once it&apos;s approved.
              </p>
            </div>

            <div className="pt-2">
              <p className="text-[11px] text-gray-500 mb-2">
                Change the driver, the vehicle, or both — leave a field
                unselected to keep the current one.
              </p>
              <button
                onClick={submit}
                disabled={saving}
                className={`${goldBtn} w-full py-2`}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Reassign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------
export default function VendorBookingChange({
  booking,
  onDone,
}: {
  booking: {
    id: string;
    bookingRef: string;
    status: string;
    pendingModification?: PendingModification | null;
    assignedDriver?: { id: string } | null;
    assignedVehicle?: { id: string } | null;
    changeLocked?: boolean;
    changeCutoffHours?: number | null;
  };
  onDone: () => void;
}) {
  const { showNotification } = useNotification();
  const [reassign, setReassign] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [accepting, setAccepting] = useState(false);
  // After a reject we don't yank the booking away — we show a short
  // "handed back" confirmation so the vendor understands where it went.
  const [declined, setDeclined] = useState(false);

  const pending = booking.pendingModification;
  const isConfirmed = booking.status === "CONFIRMED";

  if (!pending && !isConfirmed) return null;

  const accept = async () => {
    setAccepting(true);
    try {
      await vendorApi.acceptBookingModification(booking.id);
      showNotification("success", "Change accepted.");
      onDone();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't accept.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="mx-5 my-4 space-y-3">
      {declined && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-5 text-center">
          <div className="w-11 h-11 mx-auto rounded-full bg-neutral-700/60 flex items-center justify-center mb-3">
            <Ban className="w-5 h-5 text-gray-300" />
          </div>
          <h4 className="text-white font-semibold text-sm">Change declined</h4>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
            This booking has been handed back to LuxDrive to arrange.
            There&apos;s nothing more for you to do — it&apos;ll drop off your
            bookings when you close this.
          </p>
          <button onClick={onDone} className={`${goldBtn} mt-4 mx-auto px-6`}>
            Done
          </button>
        </div>
      )}
      {!declined && pending && (
        <div className="rounded-xl border border-luxury-gold/40 bg-luxury-gold/5 p-4">
          <div className="text-sm font-semibold text-luxury-gold mb-2">
            Trip changed — your review is needed
          </div>
          <div className="space-y-1.5 mb-3">
            {pending.changedFields.map((c) => (
              <div key={c.field} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-28 flex-shrink-0">
                  {c.label}
                </span>
                <span className="text-gray-500 line-through">
                  {fmt(c.from)}
                </span>
                <ArrowRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
                <span className="text-white">{fmt(c.to)}</span>
              </div>
            ))}
          </div>
          {pending.reason && (
            <p className="text-xs text-gray-400 mb-3">
              Reason: {pending.reason}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={accept} disabled={accepting} className={goldBtn}>
              {accepting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Accept change
            </button>
            <button
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-300 hover:bg-red-500/10"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <LockedChangeButton
              locked={!!booking.changeLocked}
              cutoffHours={booking.changeCutoffHours}
              onClick={() => setReassign(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-neutral-700 text-gray-200 hover:bg-neutral-800"
            >
              <RefreshCw className="w-4 h-4" />
              Change driver / vehicle
            </LockedChangeButton>
            <button
              onClick={() => setCancelling(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Ban className="w-4 h-4" />
              Cancel booking
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Emergency? Swap in a different driver or vehicle — including an
            approved temporary one — without losing the booking.{" "}
            <a
              href="/dashboard/vendor?tab=temp-assets"
              className="text-luxury-gold hover:underline whitespace-nowrap"
            >
              Add a temporary vehicle / driver →
            </a>
          </p>
        </div>
      )}

      {reassign && (
        <ReassignDrawer
          bookingId={booking.id}
          currentDriverId={booking.assignedDriver?.id ?? null}
          currentVehicleId={booking.assignedVehicle?.id ?? null}
          onClose={() => setReassign(false)}
          onDone={onDone}
        />
      )}
      {rejecting && (
        <ReasonDialog
          title="Reject this change"
          confirmLabel="Reject change"
          danger
          note="Rejecting hands this booking back to LuxDrive to reassign — it will leave your bookings."
          presets={rejectReasonsFor(pending?.changedFields ?? [])}
          onClose={() => setRejecting(false)}
          onConfirm={async (reason) => {
            try {
              await vendorApi.rejectBookingModification(booking.id, { reason });
              setRejecting(false);
              // Keep the booking on screen with a clear confirmation
              // rather than making it disappear instantly.
              setDeclined(true);
            } catch (err: any) {
              showNotification("error", err?.message || "Couldn't reject.");
            }
          }}
        />
      )}
      {cancelling && (
        <ReasonDialog
          title="Cancel this booking"
          confirmLabel="Cancel booking"
          danger
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            try {
              await vendorApi.cancelBooking(booking.id, { reason });
              showNotification("success", "Booking released back to admin.");
              setCancelling(false);
              onDone();
            } catch (err: any) {
              showNotification("error", err?.message || "Couldn't cancel.");
            }
          }}
        />
      )}
    </div>
  );
}
