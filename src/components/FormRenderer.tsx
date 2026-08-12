"use client";

import SignaturePad from "@/components/SignaturePad";
import { TimePicker } from "@/components/TimePicker";
import { PositionedImage } from "@/components/PositionedImage";
import { hexToRgba } from "@/lib/color";

export type RenderField = {
  id: string;
  type: string;
  label: string;
  placeholder?: string | null;
  required: boolean;
  options?: string | null;
  imageUrl?: string | null;
  imageZoom?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  opacity?: number;
  strokeWidth?: number;
  strokeColor?: string | null;
  color?: string | null;
  fontSize?: number | null;
  fontFamily?: string | null;
  textCase?: string | null;
  labelAlign?: string | null;
  collapsedByDefault?: boolean;
  paymentAmountType?: string | null;
  paymentFixedAmount?: number | null;
  paymentDescription?: string | null;
  bgColor?: string | null;
  bgColorOpacity?: number;
  bgImageUrl?: string | null;
  bgImageZoom?: number;
  bgImageOffsetX?: number;
  bgImageOffsetY?: number;
  bgImageOpacity?: number;
};

// A full-width photo behind the whole field bar — separate from the small
// corner thumbnail — with the same drag/zoom/opacity treatment as the banner
function FieldBgLayer({ field }: { field: RenderField }) {
  if (!field.bgImageUrl) return null;
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: "inherit", opacity: (field.bgImageOpacity ?? 100) / 100 }}>
      <PositionedImage
        src={field.bgImageUrl}
        shape="rect"
        zoom={field.bgImageZoom}
        offsetX={field.bgImageOffsetX}
        offsetY={field.bgImageOffsetY}
        style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
      />
    </div>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  onSignatureChange
}: {
  field: RenderField;
  value: string;
  onChange: (v: string) => void;
  onSignatureChange: (v: string | null) => void;
}) {
  const options: string[] = field.options ? JSON.parse(field.options) : [];

  const strokeWidth = field.strokeWidth ?? 0;
  const hasBar = !!field.bgImageUrl || !!field.bgColor;
  const wrapperStyle: React.CSSProperties = {
    opacity: (field.opacity ?? 100) / 100,
    outline: strokeWidth > 0 ? `${strokeWidth}px solid ${field.strokeColor ?? "#0E5E6F"}` : undefined,
    outlineOffset: strokeWidth > 0 ? "4px" : undefined,
    borderRadius: strokeWidth > 0 || hasBar ? "0.75rem" : undefined,
    position: "relative",
    padding: hasBar ? "16px" : undefined,
    backgroundColor: field.bgColor ? hexToRgba(field.bgColor, field.bgColorOpacity ?? 100) : undefined
  };

  const label = (
    <label
      className="flex items-center gap-3 mb-1 min-w-0"
      style={{
        justifyContent: field.labelAlign === "center" ? "center" : field.labelAlign === "right" ? "flex-end" : "flex-start"
      }}
    >
      {field.imageUrl && (
        <PositionedImage
          src={field.imageUrl}
          shape="rect"
          zoom={field.imageZoom}
          offsetX={field.imageOffsetX}
          offsetY={field.imageOffsetY}
          className="rounded-lg border border-ink/10 shrink-0"
          style={{ width: "50px", height: "50px" }}
        />
      )}
      <span
        className="break-words min-w-0 text-sm font-medium"
        style={{
          color: field.color || undefined,
          fontSize: field.fontSize ? `${field.fontSize}px` : undefined,
          fontFamily: field.fontFamily || undefined,
          textTransform: (field.textCase as any) || undefined
        }}
      >
        {field.label} {field.required && <span className="text-coral">*</span>}
      </span>
    </label>
  );
  const inputAccentStyle: React.CSSProperties = field.color ? { borderColor: `${field.color}55` } : {};

  let content: React.ReactNode;

  if (field.type === "divider") {
    content = (
      <hr
        style={{
          border: "none",
          borderTop: `${Math.max(1, field.strokeWidth || 1)}px solid ${field.color || "#E5DFC8"}`,
          margin: "8px 0"
        }}
      />
    );
  } else if (field.type === "page_break") {
    content = (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-plumeria/50" />
        <span className="text-xs font-semibold text-ink/40 uppercase tracking-wide whitespace-nowrap">
          ⏭ New page starts here
        </span>
        <div className="flex-1 h-px bg-plumeria/50" />
      </div>
    );
  } else if (field.type === "section_collapse") {
    content = (
      <div className="flex items-center justify-between gap-3 py-2 px-1 border-b-2 border-plumeria/40">
        <h3 className="font-display text-lg font-medium text-ink break-words min-w-0">{field.label}</h3>
        <span className="text-xs text-ink/40 font-semibold uppercase tracking-wide whitespace-nowrap">
          ▾ Collapsible section
        </span>
      </div>
    );
  } else if (field.type === "payment") {
    const isFixed = (field.paymentAmountType ?? "fixed") === "fixed";
    const fixedDollars = ((field.paymentFixedAmount ?? 0) / 100).toFixed(2);
    content = (
      <div className="rounded-xl2 border-2 border-coral/30 bg-coral/5 p-4">
        <p className="flex items-center gap-2 font-display text-lg font-medium mb-1">
          💳 {field.label} {field.required && <span className="text-coral">*</span>}
        </p>
        {field.paymentDescription && (
          <p className="text-sm text-ink/60 mb-3">{field.paymentDescription}</p>
        )}
        {isFixed ? (
          <p className="text-2xl font-display font-medium text-ocean mb-2">${fixedDollars}</p>
        ) : (
          <div className="mb-2">
            <label className="block text-xs text-ink/50 mb-1">Amount to pay</label>
            <div className="flex items-center gap-2 max-w-[180px]">
              <span className="text-ink/50">$</span>
              <input
                type="number"
                min={0.5}
                step={0.01}
                required={field.required}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none"
              />
            </div>
          </div>
        )}
        <p className="text-xs text-ink/40">You'll securely enter your card details on the next step.</p>
      </div>
    );
  } else if (field.type === "heading") {
    content = (
      <div className="flex items-center gap-3 pt-2 min-w-0">
        {field.imageUrl && (
          <PositionedImage
            src={field.imageUrl}
            shape="rect"
            zoom={field.imageZoom}
            offsetX={field.imageOffsetX}
            offsetY={field.imageOffsetY}
            className="rounded-lg border border-ink/10 shrink-0"
            style={{ width: "60px", height: "60px" }}
          />
        )}
        <h2 className="font-display text-xl font-medium break-words min-w-0">{field.label}</h2>
      </div>
    );
  } else if (field.type === "paragraph") {
    content = (
      <div className="flex items-start gap-3 min-w-0">
        {field.imageUrl && (
          <PositionedImage
            src={field.imageUrl}
            shape="rect"
            zoom={field.imageZoom}
            offsetX={field.imageOffsetX}
            offsetY={field.imageOffsetY}
            className="rounded-lg border border-ink/10 shrink-0"
            style={{ width: "60px", height: "60px" }}
          />
        )}
        <p className="text-ink/70 break-words whitespace-pre-wrap min-w-0 max-w-full">{field.label}</p>
      </div>
    );
  } else if (field.type === "signature") {
    content = (
      <>
        {label}
        <SignaturePad onChange={onSignatureChange} />
      </>
    );
  } else if (field.type === "time_start" || field.type === "time_end") {
    content = (
      <>
        {label}
        <TimePicker value={value} onChange={onChange} required={field.required} />
      </>
    );
  } else if (field.type === "textarea" || field.type === "address") {
    content = (
      <>
        {label}
        <textarea
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          rows={field.type === "address" ? 3 : 4}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none"
          style={inputAccentStyle}
        />
      </>
    );
  } else if (field.type === "dropdown") {
    content = (
      <>
        {label}
        <select
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none bg-white"
          style={inputAccentStyle}
        >
          <option value="" disabled>Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </>
    );
  } else if (field.type === "radio") {
    content = (
      <>
        {label}
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.id}
                required={field.required}
                checked={value === opt}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </>
    );
  } else if (field.type === "checkbox") {
    const selected = value ? value.split("||") : [];
    content = (
      <>
        {label}
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt);
                  onChange(next.join("||"));
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      </>
    );
  } else {
    const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
    content = (
      <>
        {label}
        <input
          type={inputType}
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-ocean outline-none"
          style={inputAccentStyle}
        />
      </>
    );
  }

  return (
    <div style={wrapperStyle}>
      <FieldBgLayer field={field} />
      <div className="relative z-10">{content}</div>
    </div>
  );
}
