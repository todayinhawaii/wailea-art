"use client";

import { useState } from "react";
import { BuilderField, FIELD_LIBRARY } from "@/lib/fieldTypes";
import { resizeImageFile } from "@/lib/imageResize";
import { ImagePositioner } from "./ImagePositioner";
import { FONT_OPTIONS } from "@/lib/fonts";
import { ColorPickerWithHex } from "@/components/ColorPickerWithHex";

const TEXT_CASE_OPTIONS = [
  { label: "Normal", value: "" },
  { label: "UPPERCASE", value: "uppercase" },
  { label: "lowercase", value: "lowercase" },
  { label: "Capitalize", value: "capitalize" }
];

export function FieldEditor({
  field,
  onChange,
  onImageUploaded
}: {
  field: BuilderField;
  onChange: (patch: Partial<BuilderField>) => void;
  onImageUploaded?: () => void;
}) {
  const meta = FIELD_LIBRARY.find((f) => f.type === field.type);
  const isTextBlock = field.type === "heading" || field.type === "paragraph";
  const isTime = field.type === "time_start" || field.type === "time_end";
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);

  const MAX_IMAGE_MB = 5;

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setUploadError(null);
    setUploading(true);

    try {
      // Shrink oversized photos automatically instead of just rejecting them
      const resized = await resizeImageFile(file, 800, 0.85);

      if (resized.size > MAX_IMAGE_MB * 1024 * 1024) {
        setUploadError(`This image is still too large after shrinking. Please choose a smaller photo (under ${MAX_IMAGE_MB}MB).`);
        return;
      }

      const body = new FormData();
      body.append("file", resized);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/uploads", { method: "POST", body, signal: controller.signal });
      clearTimeout(timeout);

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error("The server sent back something unexpected. Please try again.");
      }

      if (!res.ok) {
        setUploadError(data?.error || "Upload failed. Please try again.");
        return;
      }
      onChange({ imageUrl: data.url, imageZoom: 1, imageOffsetX: 0, imageOffsetY: 0 });
      onImageUploaded?.();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setUploadError("That took too long and timed out. Please check your connection and try again.");
      } else {
        setUploadError(err?.message || "Something went wrong uploading this image. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleBgImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgUploadError(null);
    setBgUploading(true);

    try {
      const resized = await resizeImageFile(file, 1200, 0.85);

      if (resized.size > MAX_IMAGE_MB * 1024 * 1024) {
        setBgUploadError(`This image is still too large after shrinking. Please choose a smaller photo (under ${MAX_IMAGE_MB}MB).`);
        return;
      }

      const body = new FormData();
      body.append("file", resized);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/uploads", { method: "POST", body, signal: controller.signal });
      clearTimeout(timeout);

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error("The server sent back something unexpected. Please try again.");
      }

      if (!res.ok) {
        setBgUploadError(data?.error || "Upload failed. Please try again.");
        return;
      }
      onChange({ bgImageUrl: data.url, bgImageZoom: 1, bgImageOffsetX: 0, bgImageOffsetY: 0, bgImageOpacity: 100 });
      onImageUploaded?.();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setBgUploadError("That took too long and timed out. Please check your connection and try again.");
      } else {
        setBgUploadError(err?.message || "Something went wrong uploading this image. Please try again.");
      }
    } finally {
      setBgUploading(false);
    }
  }

  if (field.type === "payment") {
    const dollars = ((field.paymentFixedAmount ?? 0) / 100).toFixed(2);
    return (
      <div className="rounded-xl2 bg-white border border-ink/10 p-5 sticky top-6 min-w-0 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-4">Payment settings</p>
        <p className="text-xs text-ink/50 mb-4">
          The client pays right on this form — the money goes straight to your own connected
          Stripe account, never through us.
        </p>

        <label className="block text-sm font-medium mb-1">What's this payment for?</label>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Deposit"
          className="w-full rounded-lg border border-ink/15 px-3 py-2 mb-4 focus:border-ocean outline-none"
        />

        <label className="block text-sm font-medium mb-2">Amount</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => onChange({ paymentAmountType: "fixed" })}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              (field.paymentAmountType ?? "fixed") === "fixed"
                ? "border-ocean bg-ocean/10 text-ocean"
                : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            Fixed amount
          </button>
          <button
            type="button"
            onClick={() => onChange({ paymentAmountType: "client" })}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              field.paymentAmountType === "client"
                ? "border-ocean bg-ocean/10 text-ocean"
                : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            Client enters amount
          </button>
        </div>

        {(field.paymentAmountType ?? "fixed") === "fixed" && (
          <div className="mb-4">
            <label className="block text-xs text-ink/50 mb-1">Amount to charge</label>
            <div className="flex items-center gap-2">
              <span className="text-ink/50">$</span>
              <input
                type="number"
                min={0.5}
                step={0.01}
                value={dollars}
                onChange={(e) => onChange({ paymentFixedAmount: Math.round(Number(e.target.value) * 100) })}
                className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none"
              />
            </div>
          </div>
        )}

        <label className="block text-sm font-medium mb-1">Description shown to the client</label>
        <textarea
          value={field.paymentDescription ?? ""}
          onChange={(e) => onChange({ paymentDescription: e.target.value })}
          rows={2}
          placeholder="A 50% deposit secures your booking date."
          className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none resize-none"
        />
      </div>
    );
  }

  if (field.type === "section_collapse") {
    return (
      <div className="rounded-xl2 bg-white border border-ink/10 p-5 sticky top-6 min-w-0 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-4">Collapsible Section settings</p>
        <p className="text-xs text-ink/50 mb-4">
          Everything below this, until the next section or page break, is grouped and can be
          shown or hidden by the person filling out the form.
        </p>
        <label className="block text-sm font-medium mb-1">Section title</label>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Section title"
          className="w-full rounded-lg border border-ink/15 px-3 py-2 mb-4 focus:border-ocean outline-none"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.collapsedByDefault}
            onChange={(e) => onChange({ collapsedByDefault: e.target.checked })}
          />
          Start closed (hidden until someone taps it open)
        </label>
        <p className="text-xs text-coral/80 mt-2">
          Heads up: anything important placed inside a section that starts closed could get
          missed if someone doesn't think to open it.
        </p>
      </div>
    );
  }

  if (field.type === "page_break") {
    return (
      <div className="rounded-xl2 bg-white border border-ink/10 p-5 sticky top-6 min-w-0 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-4">Page Break settings</p>
        <p className="text-xs text-ink/50 mb-4">
          Everything above this splits into its own page; everything below starts a new one.
        </p>
        <label className="block text-sm font-medium mb-1">"Next" button text</label>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Continue to the next step"
          className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none"
        />
      </div>
    );
  }

  if (field.type === "divider") {
    return (
      <div className="rounded-xl2 bg-white border border-ink/10 p-5 sticky top-6 min-w-0 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-4">Divider settings</p>
        <p className="text-xs text-ink/50 mb-4">A simple line to break up a long form — no text needed.</p>

        <label className="block text-sm font-medium mb-1">Line color</label>
        <div className="mb-4">
          <ColorPickerWithHex
            value={field.color ?? "#E5DFC8"}
            onChange={(hex) => onChange({ color: hex })}
          />
        </div>

        <label className="block text-sm font-medium mb-1">
          Thickness — {field.strokeWidth || 1}px
        </label>
        <input
          type="range"
          min={1}
          max={8}
          value={field.strokeWidth || 1}
          onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
          className="w-full mb-4 accent-ocean"
        />

        <label className="block text-sm font-medium mb-1">
          Opacity — {field.opacity ?? 100}%
        </label>
        <input
          type="range"
          min={10}
          max={100}
          value={field.opacity ?? 100}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full accent-ocean"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl2 bg-white border border-ink/10 p-5 sticky top-6 min-w-0 max-h-[calc(100vh-3rem)] overflow-y-auto">
      <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-4">{meta?.label} settings</p>

      <label className="block text-sm font-medium mb-1">{isTextBlock ? "Text" : "Label"}</label>
      <textarea
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
        rows={isTextBlock ? 3 : 1}
        className="w-full max-w-full rounded-lg border border-ink/15 px-3 py-2 mb-4 focus:border-ocean outline-none resize-none"
      />

      {!isTextBlock && field.type !== "signature" && !isTime && (
        <>
          <label className="block text-sm font-medium mb-1">Placeholder (optional)</label>
          <input
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            className="w-full rounded-lg border border-ink/15 px-3 py-2 mb-4 focus:border-ocean outline-none"
          />
        </>
      )}

      {isTime && (
        <p className="text-xs text-ink/40 mb-4">
          People filling this out will see hour, minute, and AM/PM dropdowns — no typing needed.
        </p>
      )}

      {meta?.needsOptions && (
        <>
          <label className="block text-sm font-medium mb-1">Options (one per line)</label>
          <textarea
            value={(field.options ?? []).join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n") })}
            rows={4}
            className="w-full rounded-lg border border-ink/15 px-3 py-2 mb-4 focus:border-ocean outline-none"
            placeholder={"Option A\nOption B\nOption C"}
          />
        </>
      )}

      {/* Photo/logo — handy for a product or package you're selling on the form */}
      <label className="block text-sm font-medium mb-1">Small photo (optional)</label>
      <p className="text-xs text-ink/50 mb-2">
        Shows next to this field as a circle — e.g. a photo of the package you're selling.
        Large photos are automatically shrunk to fit, up to {MAX_IMAGE_MB}MB.
      </p>
      {field.imageUrl ? (
        <div className="mb-4">
          <ImagePositioner
            src={field.imageUrl}
            shape="circle"
            width={120}
            height={120}
            zoom={field.imageZoom ?? 1}
            offsetX={field.imageOffsetX ?? 0}
            offsetY={field.imageOffsetY ?? 0}
            onChange={(patch) => onChange({
              imageOffsetX: patch.offsetX ?? field.imageOffsetX ?? 0,
              imageOffsetY: patch.offsetY ?? field.imageOffsetY ?? 0
            })}
          />
          <label className="block text-xs text-ink/50 mt-2 mb-1">Zoom</label>
          <input
            type="range" min={0.4} max={2.5} step={0.05}
            value={field.imageZoom ?? 1}
            onChange={(e) => onChange({ imageZoom: Number(e.target.value) })}
            className="w-full accent-ocean mb-1"
          />
          <p className="text-xs text-ink/40 mb-2">Drag the photo above to reposition it.</p>
          <button
            type="button"
            onClick={() => { onChange({ imageUrl: null }); onImageUploaded?.(); }}
            className="text-sm font-medium text-coral hover:underline"
          >
            Remove photo
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <div className="w-[70px] h-[70px] rounded-full border-2 border-dashed border-ink/20 flex items-center justify-center text-ink/30 text-xs mb-2">
            empty
          </div>
          <label className="inline-block rounded-lg border border-ink/15 px-3 py-2 text-sm font-medium cursor-pointer hover:border-ocean">
            {uploading ? "Uploading…" : "Upload photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleImagePick} disabled={uploading} />
          </label>
          {uploadError && <p className="text-xs text-coral mt-1">{uploadError}</p>}
        </div>
      )}

      {/* Full-bar background photo — sits behind the whole field, like the banner */}
      <label className="block text-sm font-medium mb-1">Bar background color (optional)</label>
      <p className="text-xs text-ink/50 mb-2">
        Colors the whole field bar, not just the label — pairs nicely with a photo too, since the color shows through if you lower the photo's opacity.
      </p>
      <div className="flex items-center gap-2 mb-2">
        <ColorPickerWithHex
          value={field.bgColor ?? "#0E5E6F"}
          onChange={(hex) => onChange({ bgColor: hex })}
        />
        {field.bgColor && (
          <button
            type="button"
            onClick={() => onChange({ bgColor: null })}
            className="text-xs font-medium text-ink/40 hover:text-coral"
          >
            Remove color
          </button>
        )}
      </div>
      {field.bgColor && (
        <div className="mb-4">
          <label className="block text-xs text-ink/50 mb-1">
            Color opacity — {field.bgColorOpacity ?? 100}% <span className="text-ink/35">(text stays fully readable)</span>
          </label>
          <input
            type="range" min={10} max={100}
            value={field.bgColorOpacity ?? 100}
            onChange={(e) => onChange({ bgColorOpacity: Number(e.target.value) })}
            className="w-full accent-ocean"
          />
        </div>
      )}

      <label className="block text-sm font-medium mb-1">Full bar background photo (optional)</label>
      <p className="text-xs text-ink/50 mb-2">
        A photo across the entire field bar, with adjustable zoom and opacity — separate from the small corner photo above.
      </p>
      {field.bgImageUrl ? (
        <div className="mb-4">
          <ImagePositioner
            src={field.bgImageUrl}
            shape="rect"
            width={260}
            height={90}
            zoom={field.bgImageZoom ?? 1}
            offsetX={field.bgImageOffsetX ?? 0}
            offsetY={field.bgImageOffsetY ?? 0}
            onChange={(patch) => onChange({
              bgImageOffsetX: patch.offsetX ?? field.bgImageOffsetX ?? 0,
              bgImageOffsetY: patch.offsetY ?? field.bgImageOffsetY ?? 0
            })}
            className="rounded-lg"
            style={{ opacity: (field.bgImageOpacity ?? 100) / 100 }}
          />
          <label className="block text-xs text-ink/50 mt-2 mb-1">Zoom</label>
          <input
            type="range" min={0.4} max={2.5} step={0.05}
            value={field.bgImageZoom ?? 1}
            onChange={(e) => onChange({ bgImageZoom: Number(e.target.value) })}
            className="w-full accent-ocean mb-2"
          />
          <label className="block text-xs text-ink/50 mb-1">Opacity — {field.bgImageOpacity ?? 100}%</label>
          <input
            type="range" min={10} max={100}
            value={field.bgImageOpacity ?? 100}
            onChange={(e) => onChange({ bgImageOpacity: Number(e.target.value) })}
            className="w-full accent-ocean mb-2"
          />
          <p className="text-xs text-ink/40 mb-2">Drag the photo above to reposition it.</p>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-ocean hover:underline cursor-pointer">
              Replace
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleBgImagePick} />
            </label>
            <button
              type="button"
              onClick={() => { onChange({ bgImageUrl: null }); onImageUploaded?.(); }}
              className="text-sm font-medium text-coral hover:underline"
            >
              Remove photo
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <label className="flex items-center justify-center rounded-lg border-2 border-dashed border-ink/20 bg-sand/40 cursor-pointer hover:border-ocean text-ink/40 text-sm h-14">
            {bgUploading ? "Uploading…" : "+ Upload a background photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleBgImagePick} disabled={bgUploading} />
          </label>
          {bgUploadError && <p className="text-xs text-coral mt-1">{bgUploadError}</p>}
        </div>
      )}

      {!isTextBlock && (
        <label className="flex items-center gap-2 text-sm font-medium mb-5">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="rounded border-ink/30"
          />
          Required
        </label>
      )}

      {/* Font — full control over the label's size, typeface, and letter case */}
      <div className="border-t border-ink/10 pt-4 mb-4">
        <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-3">Font</p>

        <label className="block text-sm font-medium mb-1">
          Size — {field.fontSize ?? 14}px
        </label>
        <input
          type="range"
          min={10}
          max={36}
          value={field.fontSize ?? 14}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="w-full mb-4 accent-ocean"
        />

        <label className="block text-sm font-medium mb-1">Typeface</label>
        <select
          value={field.fontFamily ?? ""}
          onChange={(e) => onChange({ fontFamily: e.target.value || null })}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 mb-4 focus:border-ocean outline-none bg-white"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>

        <label className="block text-sm font-medium mb-1">Letter case</label>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_CASE_OPTIONS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onChange({ textCase: c.value || null })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                (field.textCase ?? "") === c.value
                  ? "border-ocean bg-ocean/10 text-ocean"
                  : "border-ink/15 text-ink/60 hover:border-ink/30"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium mb-1 mt-4">Label alignment</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" }
          ].map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => onChange({ labelAlign: a.value === "left" ? null : a.value })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                (field.labelAlign ?? "left") === a.value
                  ? "border-ocean bg-ocean/10 text-ocean"
                  : "border-ink/15 text-ink/60 hover:border-ink/30"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pill styling — opacity and outline, so fields can be customized to stand out */}
      <div className="border-t border-ink/10 pt-4">
        <p className="text-xs uppercase tracking-wide text-ink/40 font-semibold mb-3">Pill style</p>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium">Font Color</label>
          <ColorPickerWithHex
            value={field.color ?? "#0E5E6F"}
            onChange={(hex) => onChange({ color: hex })}
            swatchClassName="w-9 h-9"
          />
          {field.color && (
            <button
              type="button"
              onClick={() => onChange({ color: null })}
              className="text-xs font-medium text-ink/40 hover:text-coral"
            >
              Reset
            </button>
          )}
        </div>

        <label className="block text-sm font-medium mb-1">
          Whole field opacity — {field.opacity ?? 100}% <span className="text-ink/40 font-normal">(fades everything, including text)</span>
        </label>
        <input
          type="range"
          min={20}
          max={100}
          value={field.opacity ?? 100}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full mb-4 accent-ocean"
        />

        <label className="block text-sm font-medium mb-1">
          Outline thickness — {field.strokeWidth ?? 0}px
        </label>
        <input
          type="range"
          min={0}
          max={6}
          value={field.strokeWidth ?? 0}
          onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
          className="w-full mb-3 accent-ocean"
        />

        {(field.strokeWidth ?? 0) > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Outline color</label>
            <ColorPickerWithHex
              value={field.strokeColor ?? "#0E5E6F"}
              onChange={(hex) => onChange({ strokeColor: hex })}
              swatchClassName="w-9 h-9"
            />
          </div>
        )}
      </div>
    </div>
  );
}
