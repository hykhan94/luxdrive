// ============================================
// apps/web/components/admin/cities-panel.tsx
//
// Cities administration — replaces the retired Tariff Management
// panel. Admin lists the cities LuxDrive operates in, toggles ELECTRIC
// and ULTRA_LUXURY availability per city, and enables / disables /
// deletes rows. Partner Book Ride form reads only ACTIVE cities and
// filters its vehicle-class picker against these flags.
//
// UI pattern: matches the admin booking-list design language —
// right-side slide-in drawers for both Add City and Delete
// confirmation (not centered modals), with a black/60 backdrop.
// ============================================

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Plus,
  Loader2,
  Zap,
  Crown,
  Power,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { adminApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";

interface City {
  id: string;
  code: string;
  name: string;
  region: string | null;
  sortOrder: number;
  isActive: boolean;
  electricEnabled: boolean;
  ultraLuxuryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CitiesPanel() {
  const notify = useNotification();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<City | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listCities();
      setCities(res.data);
    } catch (err: any) {
      notify.showNotification("error", err?.message || "Failed to load cities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle a single flag on a city. Optimistic — flips locally first,
  // rolls back if the server rejects. Keeps the UI feeling responsive
  // even on slow connections.
  async function toggle(
    city: City,
    field: "electricEnabled" | "ultraLuxuryEnabled" | "isActive",
  ) {
    const nextValue = !city[field];
    setSaving(`${city.id}:${field}`);
    setCities((prev) =>
      prev.map((c) => (c.id === city.id ? { ...c, [field]: nextValue } : c)),
    );
    try {
      await adminApi.toggleCityFlag(city.id, { field, value: nextValue });
      // Success toast — worded per-field so admin sees exactly what
      // changed. "Riyadh set to Inactive" reads better than a generic
      // "Saved" when they're rapidly toggling multiple cities in a row.
      notify.showNotification(
        "success",
        buildToggleMessage(city.name, field, nextValue),
      );
    } catch (err: any) {
      setCities((prev) =>
        prev.map((c) => (c.id === city.id ? { ...c, [field]: !nextValue } : c)),
      );
      notify.showNotification("error", err?.message || "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  // Field-to-label mapping used by the toggle success toast.
  function buildToggleMessage(
    cityName: string,
    field: "electricEnabled" | "ultraLuxuryEnabled" | "isActive",
    value: boolean,
  ): string {
    if (field === "isActive") {
      return `${cityName} set to ${value ? "Active" : "Inactive"}`;
    }
    const label = field === "electricEnabled" ? "Electric" : "Ultra Luxury";
    return `${label} ${value ? "enabled" : "disabled"} for ${cityName}`;
  }

  // Reorder — swap adjacent sortOrder values with the neighbour on the
  // requested side, then persist both. Simple, no drag library needed.
  async function move(city: City, direction: "up" | "down") {
    const sorted = [...cities].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((c) => c.id === city.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];

    setSaving(`${city.id}:sortOrder`);
    try {
      await Promise.all([
        adminApi.updateCity(city.id, { sortOrder: other.sortOrder }),
        adminApi.updateCity(other.id, { sortOrder: city.sortOrder }),
      ]);
      await load();
    } catch (err: any) {
      notify.showNotification("error", err?.message || "Failed to reorder");
    } finally {
      setSaving(null);
    }
  }

  async function confirmDelete(
    force: boolean,
  ): Promise<{ ok: boolean; needsForce?: boolean }> {
    if (!deleteTarget) return { ok: false };
    setSaving(`${deleteTarget.id}:delete`);
    try {
      await adminApi.deleteCity(deleteTarget.id, { force });
      setDeleteTarget(null);
      await load();
      notify.showNotification("success", "City deleted");
      return { ok: true };
    } catch (err: any) {
      const msg = String(err?.message || "");
      // Server returns "N booking(s) still reference this city…" when
      // it refuses to delete without force. In that case surface the
      // force-delete step in the drawer instead of a red error toast.
      if (!force && /still reference/i.test(msg)) {
        return { ok: false, needsForce: true };
      }
      notify.showNotification("error", msg || "Failed to delete");
      return { ok: false };
    } finally {
      setSaving(null);
    }
  }

  const sorted = useMemo(
    () => [...cities].sort((a, b) => a.sortOrder - b.sortOrder),
    [cities],
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-luxury-gold" />
            <h1 className="text-xl font-semibold text-white">Cities</h1>
          </div>
          <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
            Manage the cities LuxDrive operates in. Toggle Electric and Ultra
            Luxury availability per city — partners will only see vehicle
            classes that are enabled here.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg text-sm font-medium hover:bg-luxury-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add City
        </button>
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-16 text-center">
            <MapPin className="w-10 h-10 mx-auto mb-3 text-neutral-700" />
            <p className="font-medium text-white">No cities configured yet</p>
            <p className="text-sm text-neutral-400 mt-1">
              Click <span className="font-semibold text-white">Add City</span>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-800/50 border-b border-neutral-800">
                <tr className="text-left text-xs font-medium text-neutral-400 uppercase tracking-wide">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3 text-center">Active</th>
                  <th className="px-4 py-3 text-center">Electric</th>
                  <th className="px-4 py-3 text-center">Ultra Luxury</th>
                  <th className="px-4 py-3 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((city, idx) => (
                  <tr
                    key={city.id}
                    className="border-b border-neutral-800 last:border-b-0 hover:bg-neutral-800/30 transition-colors"
                  >
                    {/* Order + up/down */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          disabled={idx === 0 || saving !== null}
                          onClick={() => move(city, "up")}
                          className="text-neutral-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs text-neutral-500 font-medium">
                          {idx + 1}
                        </span>
                        <button
                          disabled={
                            idx === sorted.length - 1 || saving !== null
                          }
                          onClick={() => move(city, "down")}
                          className="text-neutral-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    {/* Name + code */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{city.name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 font-mono">
                        {city.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {city.region || (
                        <span className="text-neutral-600 italic">—</span>
                      )}
                    </td>
                    {/* Toggles */}
                    <ToggleCell
                      value={city.isActive}
                      onToggle={() => toggle(city, "isActive")}
                      saving={saving === `${city.id}:isActive`}
                      icon={<Power className="w-3.5 h-3.5" />}
                    />
                    <ToggleCell
                      value={city.electricEnabled}
                      onToggle={() => toggle(city, "electricEnabled")}
                      saving={saving === `${city.id}:electricEnabled`}
                      icon={<Zap className="w-3.5 h-3.5" />}
                    />
                    <ToggleCell
                      value={city.ultraLuxuryEnabled}
                      onToggle={() => toggle(city, "ultraLuxuryEnabled")}
                      saving={saving === `${city.id}:ultraLuxuryEnabled`}
                      icon={<Crown className="w-3.5 h-3.5" />}
                    />
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteTarget(city)}
                        disabled={saving !== null}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/30 rounded-md transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <Power className="w-3 h-3" /> Active — visible to partners
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> Electric — Tesla &amp; other EV classes
          available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Crown className="w-3 h-3" /> Ultra Luxury — Rolls, Bentley, Maybach
          tier available
        </span>
      </div>

      {/* ============== ADD CITY DRAWER ============== */}
      {showAdd && (
        <AddCityDrawer
          onClose={() => setShowAdd(false)}
          onCreated={async () => {
            setShowAdd(false);
            await load();
            notify.showNotification("success", "City added");
          }}
        />
      )}

      {/* ============== DELETE CONFIRMATION DRAWER ============== */}
      {deleteTarget && (
        <DeleteConfirmDrawer
          city={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          onMarkInactive={async () => {
            // Safer alternative surfaced in the delete drawer — hides
            // the city from partners while keeping historic booking
            // context intact.
            if (!deleteTarget.isActive) {
              // Already inactive; just close.
              setDeleteTarget(null);
              return;
            }
            await toggle(deleteTarget, "isActive");
            setDeleteTarget(null);
          }}
          isDeleting={saving === `${deleteTarget.id}:delete`}
        />
      )}
    </div>
  );
}

// ============== Sub-components ==============

function ToggleCell({
  value,
  onToggle,
  saving,
  icon,
}: {
  value: boolean;
  onToggle: () => void;
  saving: boolean;
  icon: React.ReactNode;
}) {
  return (
    <td className="px-4 py-3 text-center">
      <button
        onClick={onToggle}
        disabled={saving}
        className={`relative inline-flex items-center gap-1.5 h-7 min-w-[3.75rem] px-2 rounded-full text-xs font-medium transition-all ${
          value
            ? "bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/40"
            : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700"
        } ${saving ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>
            {icon}
            <span>{value ? "On" : "Off"}</span>
          </>
        )}
      </button>
    </td>
  );
}

// ============================================
// Add City drawer — slides in from the right, matches the booking
// detail drawer pattern exactly. Backdrop is clickable to dismiss.
// ============================================
function AddCityDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const notify = useNotification();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [electricEnabled, setElectricEnabled] = useState(false);
  const [ultraLuxuryEnabled, setUltraLuxuryEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.createCity({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        region: region.trim() || undefined,
        electricEnabled,
        ultraLuxuryEnabled,
      });
      onCreated();
    } catch (err: any) {
      notify.showNotification("error", err?.message || "Failed to create city");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      {/* Right-side drawer */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-neutral-900 border-l border-neutral-800 z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Add City</h2>
              <p className="text-xs text-neutral-500 mt-1">
                Configure a new operating city for LuxDrive
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* City code */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                City code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) =>
                  // Uppercase + strip anything not [A-Z0-9_] as the user
                  // types so what they see matches what will be stored.
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                  )
                }
                placeholder="e.g. DAMMAM"
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg font-mono text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-luxury-gold"
                maxLength={32}
                required
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                Stable identifier. Once created, cannot be edited (existing
                bookings reference it).
              </p>
            </div>

            {/* Display name */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Display name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dammam"
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-luxury-gold"
                required
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Region{" "}
                <span className="text-neutral-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. Eastern Province"
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-luxury-gold"
              />
            </div>

            {/* Section divider — matches booking-detail visual rhythm */}
            <div className="pt-3 border-t border-neutral-800">
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
                Vehicle availability
              </h3>
              <div className="space-y-2">
                <FlagToggle
                  label="Electric vehicles"
                  hint="Tesla and other EV classes"
                  icon={<Zap className="w-4 h-4" />}
                  value={electricEnabled}
                  onChange={setElectricEnabled}
                />
                <FlagToggle
                  label="Ultra Luxury vehicles"
                  hint="Rolls, Bentley, Maybach tier"
                  icon={<Crown className="w-4 h-4" />}
                  value={ultraLuxuryEnabled}
                  onChange={setUltraLuxuryEnabled}
                />
              </div>
            </div>

            {/* Sticky action bar — mirrors booking-detail actions row */}
            <div className="pt-4 border-t border-neutral-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !code.trim() || !name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black hover:bg-luxury-gold/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Add city
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function FlagToggle({
  label,
  hint,
  icon,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
        value
          ? "border-luxury-gold/50 bg-luxury-gold/10"
          : "border-neutral-700 bg-neutral-800 hover:bg-neutral-700"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={value ? "text-luxury-gold" : "text-neutral-400"}>
          {icon}
        </span>
        <span className="text-left">
          <span className="block text-sm text-white font-medium">{label}</span>
          <span className="block text-xs text-neutral-500">{hint}</span>
        </span>
      </span>
      <span
        className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
          value ? "bg-luxury-gold" : "bg-neutral-600"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
            value ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

// ============================================
// Delete confirmation drawer — same slide-in-from-right pattern.
// Two-step for the with-bookings case: first click asks the server,
// which refuses; drawer flips to force-delete wording; second click
// issues the force=1 request.
// ============================================
function DeleteConfirmDrawer({
  city,
  onCancel,
  onConfirm,
  onMarkInactive,
  isDeleting,
}: {
  city: City;
  onCancel: () => void;
  onConfirm: (force: boolean) => Promise<{ ok: boolean; needsForce?: boolean }>;
  onMarkInactive: () => Promise<void>;
  isDeleting: boolean;
}) {
  const [showForce, setShowForce] = useState(false);
  const [markingInactive, setMarkingInactive] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onCancel} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-neutral-900 border-l border-neutral-800 z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Delete city</h2>
              <p className="text-xs text-neutral-500 mt-1 font-mono">
                {city.code}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Warning banner — echoes the booking-detail attention banner
              styling so the visual weight of "destructive action" is
              immediately obvious. */}
          <div
            className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
              showForce
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-red-500/10 border-red-500/30"
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                showForce ? "text-amber-400" : "text-red-400"
              }`}
            />
            <div className="flex-1 text-sm">
              <p
                className={`font-medium ${
                  showForce ? "text-amber-400" : "text-red-400"
                }`}
              >
                {showForce
                  ? "This city has bookings referencing it"
                  : `Delete ${city.name}?`}
              </p>
              <p className="text-neutral-300 mt-1.5">
                {showForce
                  ? "You can still remove it — historic bookings retain the code by value for records. The city just won't appear in the partner picker or admin surface any more."
                  : "This removes the city from the partner Book Ride picker and the admin cities list. This cannot be undone."}
              </p>
            </div>
          </div>

          {/* Safer-alternative callout. Only surfaced when the city is
              still active — if admin has already flipped it Inactive
              and now wants to delete, no need to suggest they toggle
              what they already toggled. */}
          {city.isActive && (
            <div className="mb-6 p-4 rounded-lg border border-luxury-gold/30 bg-luxury-gold/5">
              <div className="flex items-start gap-3">
                <Power className="w-5 h-5 text-luxury-gold flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    Prefer to mark it inactive?
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Hides the city from partners without touching booking
                    history — recommended for cities you no longer operate in.
                    You can reactivate it later.
                  </p>
                  <button
                    type="button"
                    disabled={markingInactive || isDeleting}
                    onClick={async () => {
                      setMarkingInactive(true);
                      try {
                        await onMarkInactive();
                      } finally {
                        setMarkingInactive(false);
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/40 rounded-md hover:bg-luxury-gold/25 transition-colors disabled:opacity-50"
                  >
                    {markingInactive ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Power className="w-3.5 h-3.5" />
                    )}
                    Mark inactive instead
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* City summary — for context before deleting */}
          <div className="p-4 bg-neutral-800/40 border border-neutral-800 rounded-lg mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Name</span>
              <span className="text-white font-medium">{city.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Code</span>
              <span className="text-white font-mono">{city.code}</span>
            </div>
            {city.region && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Region</span>
                <span className="text-white">{city.region}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Status</span>
              <span
                className={`font-medium ${
                  city.isActive ? "text-luxury-gold" : "text-neutral-400"
                }`}
              >
                {city.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          {/* Action bar */}
          <div className="pt-4 border-t border-neutral-800 flex justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const result = await onConfirm(showForce);
                if (!result.ok && result.needsForce) {
                  setShowForce(true);
                }
              }}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {showForce ? "Force delete" : "Delete city"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
