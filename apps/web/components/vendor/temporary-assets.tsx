"use client";

// ============================================
// !!! DESTINATION PATH: apps/web/components/vendor/temporary-assets.tsx
// ============================================
// Vendor Portal — register and manage temporary (ad-hoc) vehicles and
// drivers used to cover eleventh-hour jobs or a changed class the vendor
// can't meet from its approved fleet. Each asset needs admin approval
// before it can be assigned; it archives after the booking it served
// completes, and can be reactivated for another single job.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Car,
  User,
  RotateCw,
  X,
  Upload,
  Check,
} from "lucide-react";
import { vendorApi, uploadApi } from "@/lib/api";
import ImageCropper from "@/components/ui/image-cropper";
import { useNotification } from "@/lib/notification-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { PhoneInput, validatePhone } from "@/components/ui/form-fields";

const VEHICLE_CLASSES: Array<{ code: string; label: string; tagline: string }> =
  [
    {
      code: "ECONOMY_SEDAN",
      label: "Economy Sedan",
      tagline: "Ford Taurus or similar — 3 pax",
    },
    {
      code: "BUSINESS_SEDAN",
      label: "Business Sedan",
      tagline: "Mercedes E-Class, BMW 5-Series or similar — 3 pax",
    },
    {
      code: "BUSINESS_SUV",
      label: "Business SUV",
      tagline: "GMC Yukon, Chevrolet Tahoe or similar — 7 pax",
    },
    {
      code: "FIRST_CLASS",
      label: "First Class",
      tagline: "Mercedes S-Class, BMW 7-Series or similar — 3 pax",
    },
    {
      code: "ELECTRIC",
      label: "Electric",
      tagline: "Lucid Air or similar — 3 pax",
    },
    {
      code: "ULTRA_LUXURY",
      label: "Ultra Luxury",
      tagline: "Rolls, Bentley, Maybach — 2 pax",
    },
    { code: "HIACE", label: "Hiace", tagline: "10-seat van" },
    { code: "COASTER", label: "Coaster", tagline: "23-seat coach" },
    { code: "KING_LONG", label: "King Long", tagline: "49-seat coach" },
  ];

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-luxury-gold/60";
const labelCls = "block text-xs font-medium text-gray-400 mb-1";
const goldBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-luxury-gold hover:bg-luxury-gold/90 text-black rounded-lg font-medium text-sm transition-colors disabled:opacity-50";
const selectTriggerCls =
  "w-full h-11 px-3 rounded-lg bg-neutral-800/60 border-neutral-700 text-white text-sm hover:bg-neutral-800 focus:border-luxury-gold/70 focus:ring-2 focus:ring-luxury-gold/20 data-[state=open]:border-luxury-gold/70";
const selectContentCls =
  "z-[80] max-h-72 bg-neutral-900 border-neutral-700 text-white shadow-2xl";
const selectItemCls =
  "rounded-md py-2 pr-8 text-white focus:bg-neutral-800 focus:text-white data-[state=checked]:text-luxury-gold";

// Per-photo upload state — mirrors fleet/vehicle management: live preview,
// staged progress (30 → 60 → 100), and the persisted filePath once done.
interface PhotoUpload {
  file: File | null;
  preview: string | null;
  progress: number;
  uploaded: boolean;
  filePath: string | null;
}
const emptyPhoto: PhotoUpload = {
  file: null,
  preview: null,
  progress: 0,
  uploaded: false,
  filePath: null,
};

// Upload a picked file to GCS via a signed URL immediately on selection,
// driving the progress bar through the stages. Resets on failure.
async function runPhotoUpload(
  file: File,
  set: (u: PhotoUpload | ((p: PhotoUpload) => PhotoUpload)) => void,
  onError: (msg: string) => void,
) {
  const preview = URL.createObjectURL(file);
  set({ file, preview, progress: 30, uploaded: false, filePath: null });
  try {
    const signed: any = await uploadApi.getSignedUploadUrl({
      fileName: file.name,
      fileType: file.type,
      section: "vendors",
      folder: "temporary",
      entityId: "temporary",
    });
    set((p) => ({ ...p, progress: 60 }));
    const put = await fetch(signed.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) throw new Error("Photo upload failed. Please try again.");
    set((p) => ({
      ...p,
      progress: 100,
      uploaded: true,
      filePath: signed.data.filePath,
    }));
  } catch (err: any) {
    onError(err?.message || "Photo upload failed. Please try again.");
    set({ ...emptyPhoto });
  }
}

const STATUS_STYLES: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  ARCHIVED: "bg-neutral-700/40 text-gray-400 border-neutral-600",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/30",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting approval",
  ACTIVE: "Active",
  ARCHIVED: "Used",
  REJECTED: "Rejected",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border ${
        STATUS_STYLES[status] ?? STATUS_STYLES.ARCHIVED
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PhotoField({
  label,
  value,
  onChange,
  onError,
  aspect,
}: {
  label: string;
  value: PhotoUpload;
  onChange: (u: PhotoUpload | ((p: PhotoUpload) => PhotoUpload)) => void;
  onError: (msg: string) => void;
  aspect?: number;
}) {
  // Every picked image goes through the editor first — the vendor must
  // review/crop it before it uploads. Matches the drivers/fleet flow.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("photo.jpg");

  const openEditor = (f: File) => {
    if (!f.type.startsWith("image/")) {
      onError("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingName(f.name || "photo.jpg");
      setCropSrc(reader.result as string);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      {value.preview ? (
        <div
          className={`relative bg-neutral-800 rounded-lg overflow-hidden ${
            aspect === 1 ? "aspect-square" : "aspect-video"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.preview}
            alt={label}
            className="w-full h-full object-cover"
          />
          {value.progress < 100 && (
            <>
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-xs text-white/90">
                  Uploading… {value.progress}%
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-700">
                <div
                  className="h-full bg-luxury-gold transition-all"
                  style={{ width: `${value.progress}%` }}
                />
              </div>
            </>
          )}
          {value.uploaded && (
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
              <Check className="w-3 h-3" /> Uploaded
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange({ ...emptyPhoto })}
            className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-full hover:bg-red-400"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center bg-neutral-800 border-2 border-dashed border-neutral-600 rounded-lg text-gray-400 hover:border-luxury-gold/50 hover:text-luxury-gold cursor-pointer transition-colors ${
            aspect === 1 ? "aspect-square" : "aspect-video"
          }`}
        >
          <Upload className="w-6 h-6 mb-1" />
          <span className="text-xs">Upload</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openEditor(f);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {cropSrc && (
        <ImageCropper
          imageSrc={cropSrc}
          title={`Edit ${label}`}
          aspect={aspect}
          shape={aspect === 1 ? "round" : "rect"}
          onCancel={() => setCropSrc(null)}
          onCropComplete={(blob) => {
            const f = new File([blob], pendingName, { type: "image/jpeg" });
            setCropSrc(null);
            runPhotoUpload(f, onChange, onError);
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------
// Add temp vehicle
// --------------------------------------------------------------
function AddVehicleModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { showNotification } = useNotification();
  const [vehicleClass, setVehicleClass] = useState("BUSINESS_SEDAN");
  const [catalogMakes, setCatalogMakes] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [frontUp, setFrontUp] = useState<PhotoUpload>({ ...emptyPhoto });
  const [backUp, setBackUp] = useState<PhotoUpload>({ ...emptyPhoto });
  const [singleUse, setSingleUse] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the makes/models for the chosen class from vehicle-catalog.json,
  // then reset the make/model cascade. Mirrors the fleet add-vehicle flow:
  // vehicle type -> make -> model, with an "Other / Not listed" escape to
  // free-text entry.
  useEffect(() => {
    let alive = true;
    setCatalogLoading(true);
    setMake("");
    setModel("");
    setManualEntry(false);
    vendorApi
      .getVehicleCatalog({ category: vehicleClass })
      .then((res: any) => {
        if (!alive) return;
        setCatalogMakes(res?.data?.makes ?? res?.data ?? []);
      })
      .catch(() => alive && setCatalogMakes([]))
      .finally(() => alive && setCatalogLoading(false));
    return () => {
      alive = false;
    };
  }, [vehicleClass]);

  const selectedClass = VEHICLE_CLASSES.find((v) => v.code === vehicleClass);
  const catalogModelsForMake: any[] =
    catalogMakes.find((m) => m.make === make)?.models ?? [];

  const onMakeSelect = (v: string) => {
    if (v === "__OTHER__") {
      setManualEntry(true);
      setMake("");
      setModel("");
    } else {
      setManualEntry(false);
      setMake(v);
      setModel("");
    }
  };
  const onModelSelect = (v: string) => {
    if (v === "__OTHER__") {
      setManualEntry(true);
      setModel("");
    } else {
      setModel(v);
    }
  };

  const submit = async () => {
    const finalModel = [make.trim(), model.trim()].filter(Boolean).join(" ");
    if (!make.trim() || !model.trim())
      return showNotification("error", "Select or enter a make and model.");
    if (
      !frontUp.uploaded ||
      !backUp.uploaded ||
      !frontUp.filePath ||
      !backUp.filePath
    )
      return showNotification(
        "error",
        "Add both photos and wait for them to finish uploading.",
      );
    setSaving(true);
    try {
      await vendorApi.createTemporaryVehicle({
        model: finalModel,
        vehicleClass,
        frontPhotoUrl: frontUp.filePath,
        backPhotoUrl: backUp.filePath,
        singleUse,
        manualEntry,
      });
      showNotification("success", "Temporary vehicle submitted for approval.");
      onDone();
      onClose();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't submit the vehicle.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add temporary vehicle" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Vehicle class</label>
          <Select value={vehicleClass} onValueChange={setVehicleClass}>
            <SelectTrigger className={selectTriggerCls}>
              <span className="truncate text-white">
                {selectedClass?.label ?? "Select a class…"}
              </span>
            </SelectTrigger>
            <SelectContent className={selectContentCls}>
              {VEHICLE_CLASSES.map((v) => (
                <SelectItem
                  key={v.code}
                  value={v.code}
                  className={selectItemCls}
                >
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="font-medium leading-tight">{v.label}</span>
                    <span className="text-[11px] leading-tight text-neutral-400">
                      {v.tagline}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {catalogLoading ? (
          <div className="flex items-center gap-2 text-xs text-luxury-gold">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading makes &amp;
            models…
          </div>
        ) : manualEntry ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Make</label>
                <input
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="e.g. Genesis"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. G90"
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualEntry(false);
                setMake("");
                setModel("");
              }}
              className="text-xs text-luxury-gold hover:underline"
            >
              ← Back to catalog
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Make</label>
              <Select value={make || undefined} onValueChange={onMakeSelect}>
                <SelectTrigger className={selectTriggerCls}>
                  <span
                    className={
                      make ? "truncate text-white" : "text-neutral-500"
                    }
                  >
                    {make || "Select make…"}
                  </span>
                </SelectTrigger>
                <SelectContent className={selectContentCls}>
                  {catalogMakes.map((m: any) => (
                    <SelectItem
                      key={m.make}
                      value={m.make}
                      className={selectItemCls}
                    >
                      {m.make}
                    </SelectItem>
                  ))}
                  <SelectItem value="__OTHER__" className={selectItemCls}>
                    Other / Not listed
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <Select
                value={model || undefined}
                onValueChange={onModelSelect}
                disabled={!make}
              >
                <SelectTrigger
                  className={`${selectTriggerCls} disabled:opacity-50`}
                >
                  <span
                    className={
                      model ? "truncate text-white" : "text-neutral-500"
                    }
                  >
                    {model || (make ? "Select model…" : "Select make first")}
                  </span>
                </SelectTrigger>
                <SelectContent className={selectContentCls}>
                  {catalogModelsForMake.map((m: any) => (
                    <SelectItem
                      key={m.model}
                      value={m.model}
                      className={selectItemCls}
                    >
                      {m.model}
                    </SelectItem>
                  ))}
                  <SelectItem value="__OTHER__" className={selectItemCls}>
                    Other / Not listed
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <PhotoField
            label="Front photo"
            value={frontUp}
            onChange={setFrontUp}
            onError={(m) => showNotification("error", m)}
          />
          <PhotoField
            label="Back photo"
            value={backUp}
            onChange={setBackUp}
            onError={(m) => showNotification("error", m)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={singleUse}
            onChange={(e) => setSingleUse(e.target.checked)}
            className="accent-luxury-gold"
          />
          Single use (archives after one job)
        </label>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={submit} disabled={saving} className={goldBtn}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit for approval
        </button>
      </div>
    </ModalShell>
  );
}

// --------------------------------------------------------------
// Add temp driver
// --------------------------------------------------------------
function AddDriverModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { showNotification } = useNotification();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [photoUp, setPhotoUp] = useState<PhotoUpload>({ ...emptyPhoto });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim())
      return showNotification("error", "Add the driver's name.");
    if (!validatePhone(mobile))
      return showNotification("error", "Enter a valid mobile number.");
    if (!photoUp.uploaded || !photoUp.filePath)
      return showNotification("error", "Add the driver's photo.");
    setSaving(true);
    try {
      await vendorApi.createTemporaryDriver({
        name: name.trim(),
        mobile: mobile.trim(),
        photoUrl: photoUp.filePath,
      });
      showNotification("success", "Temporary driver submitted for approval.");
      onDone();
      onClose();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't submit the driver.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add temporary driver" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Mobile</label>
          <PhoneInput
            value={mobile}
            onChange={setMobile}
            label=""
            defaultCountry="SA"
            error={mobile.length > 0 && !validatePhone(mobile)}
          />
        </div>
        <PhotoField
          label="Driver photo"
          value={photoUp}
          onChange={(u) => setPhotoUp(u)}
          onError={(m) => showNotification("error", m)}
          aspect={1}
        />
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={submit} disabled={saving} className={goldBtn}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit for approval
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------
// Main panel
// --------------------------------------------------------------
export default function VendorTemporaryAssets() {
  const { showNotification } = useNotification();
  const [sub, setSub] = useState<"vehicles" | "drivers">("vehicles");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addVehicle, setAddVehicle] = useState(false);
  const [addDriver, setAddDriver] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, d]: any = await Promise.all([
        vendorApi.listTemporaryVehicles(),
        vendorApi.listTemporaryDrivers(),
      ]);
      setVehicles(v?.data ?? []);
      setDrivers(d?.data ?? []);
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't load assets.");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const reactivate = async (type: "vehicle" | "driver", id: string) => {
    setBusyId(id);
    try {
      await vendorApi.reactivateTemporaryAsset({ type, id });
      showNotification("success", "Asset reactivated.");
      load();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't reactivate.");
    } finally {
      setBusyId(null);
    }
  };

  const rows = sub === "vehicles" ? vehicles : drivers;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 border-b border-neutral-800">
          {(["vehicles", "drivers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSub(t)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                sub === t
                  ? "border-luxury-gold text-luxury-gold"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {t === "vehicles" ? (
                <Car className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
              {t === "vehicles" ? "Vehicles" : "Drivers"}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            sub === "vehicles" ? setAddVehicle(true) : setAddDriver(true)
          }
          className={goldBtn}
        >
          <Plus className="w-4 h-4" />
          Add temporary {sub === "vehicles" ? "vehicle" : "driver"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">
          No temporary {sub} yet. Add one to cover an eleventh-hour job.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
            >
              {sub === "vehicles" ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.frontPhotoUrl}
                    alt={r.model}
                    className="aspect-video w-full object-cover rounded-lg border border-neutral-800 mb-3"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white font-medium truncate">
                      {r.model}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {r.vehicleClass}
                    {r.completedBookingCount > 0 &&
                      ` · used ${r.completedBookingCount}×`}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.photoUrl}
                    alt={r.name}
                    className="w-16 h-16 rounded-full object-cover border border-neutral-800 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white font-medium truncate">
                        {r.name}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {r.mobile}
                      {r.completedBookingCount > 0 &&
                        ` · used ${r.completedBookingCount}×`}
                    </p>
                  </div>
                </div>
              )}
              {r.status === "REJECTED" && r.rejectionReason && (
                <p className="text-xs text-red-300 mt-2">{r.rejectionReason}</p>
              )}
              {r.status === "ARCHIVED" && (
                <button
                  onClick={() =>
                    reactivate(sub === "vehicles" ? "vehicle" : "driver", r.id)
                  }
                  disabled={busyId === r.id}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-luxury-gold hover:text-luxury-gold/80"
                >
                  {busyId === r.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                  Reactivate
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {addVehicle && (
        <AddVehicleModal onClose={() => setAddVehicle(false)} onDone={load} />
      )}
      {addDriver && (
        <AddDriverModal onClose={() => setAddDriver(false)} onDone={load} />
      )}
    </div>
  );
}
