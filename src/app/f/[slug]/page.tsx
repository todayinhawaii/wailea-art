"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FieldInput, RenderField } from "@/components/FormRenderer";
import { PositionedImage } from "@/components/PositionedImage";
import { hexToRgba } from "@/lib/color";
import { SubmitButtonRenderer } from "@/components/SubmitButtonRenderer";

const BANNER_HEIGHTS: Record<string, number> = { small: 100, medium: 160, large: 220 };
const LOGO_SIZES: Record<string, number> = { small: 64, medium: 96, large: 128 };

type PublicForm = {
  title: string;
  description?: string | null;
  bgColorStart?: string | null;
  bgColorEnd?: string | null;
  bgOpacity?: number;
  bgPadding?: number;
  logoUrl?: string | null;
  logoSize?: string | null;
  logoZoom?: number;
  logoOffsetX?: number;
  logoOffsetY?: number;
  logoOpacity?: number;
  logoPosition?: string | null;
  logoVisible?: boolean;
  bannerUrl?: string | null;
  bannerHeight?: string | null;
  bannerZoom?: number;
  bannerOffsetX?: number;
  bannerOffsetY?: number;
  bannerOpacity?: number;
  submitButtonImageUrl?: string | null;
  submitButtonPillId?: string | null;
  submitButtonText?: string | null;
  submitButtonTextColor?: string | null;
  submitButtonBold?: boolean;
  submitButtonScale?: number;
  submitButtonBgColor?: string | null;
  submitButtonFontFamily?: string | null;
  submitButtonFontSize?: number | null;
  submitButtonPhotoUrl?: string | null;
  submitButtonPhotoZoom?: number;
  submitButtonPhotoOffsetX?: number;
  submitButtonPhotoOffsetY?: number;
  submitButtonPhotoOpacity?: number;
  fields: RenderField[];
};

export default function PublicFormPage({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={null}>
      <PublicFormPageInner params={params} />
    </Suspense>
  );
}

function PublicFormPageInner({ params }: { params: { slug: string } }) {
  const [form, setForm] = useState<PublicForm | "not-found" | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const searchParams = useSearchParams();
  const [completingPayment, setCompletingPayment] = useState(false);
  const [paymentCancelled, setPaymentCancelled] = useState(false);

  useEffect(() => {
    try {
      setIsEmbedded(window.self !== window.top);
    } catch {
      setIsEmbedded(true); // cross-origin access blocked means we're definitely framed
    }
  }, []);

  // Tell the parent page how tall we are, so its embed script can resize the
  // <iframe> to fit — no more blank space or scrollbars when embedded.
  useEffect(() => {
    function postHeight() {
      window.parent.postMessage({ source: "hula-forms", height: document.documentElement.scrollHeight }, "*");
    }
    postHeight();
    const observer = new ResizeObserver(postHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [form, done]);

  useEffect(() => {
    fetch(`/api/public/forms/${params.slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setForm)
      .catch(() => setForm("not-found"));
  }, [params.slug]);

  // If we've just been redirected back from Stripe after a successful
  // payment, complete the real submission now
  useEffect(() => {
    const sessionId = searchParams.get("payment_session_id");
    if (searchParams.get("payment_cancelled")) {
      setPaymentCancelled(true);
      return;
    }
    if (!sessionId) return;

    setCompletingPayment(true);
    fetch(`/api/public/forms/${params.slug}/complete-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setDone(true);
        } else {
          setError(data.error || "We couldn't confirm your payment. Please contact the form owner.");
        }
      })
      .catch(() => setError("We couldn't confirm your payment. Please contact the form owner."))
      .finally(() => setCompletingPayment(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  // Let the page background go fully transparent so a host site shows through
  // when this form is embedded in an <iframe> and opacity is turned down.
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  if (form === null) return null;
  if (form === "not-found") {
    return (
      <main className={`${isEmbedded ? "" : "min-h-screen"} bg-sand flex items-center justify-center text-center px-6`}>
        <p className="text-ink/60 font-body">This form isn&apos;t available.</p>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || form === "not-found") return;
    // Safety net: if this fires from something like pressing Enter in a
    // single-field page, treat it as "Next" rather than a real submission
    if (currentPage < pages.length - 1) {
      handleNext();
      return;
    }
    setError(null);
    setSubmitting(true);

    const hasPayment = form.fields.some((f) => f.type === "payment");
    const endpoint = hasPayment
      ? `/api/public/forms/${params.slug}/create-checkout`
      : `/api/public/forms/${params.slug}/submit`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, signatureDataUrl: signature })
    });
    const data = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      setError(data.error || "Something went wrong. Please try again.");
      return;
    }

    if (hasPayment && data.url) {
      // Full navigation to Stripe's own secure checkout page — not a
      // client-side route, since it's leaving the site entirely
      window.location.href = data.url;
      return;
    }

    setSubmitting(false);
    setDone(true);
  }

  const bgStyle = {
    ...(form.bgColorStart && form.bgColorEnd
      ? { background: `linear-gradient(135deg, ${hexToRgba(form.bgColorStart, form.bgOpacity ?? 100)}, ${hexToRgba(form.bgColorEnd, form.bgOpacity ?? 100)})` }
      : {}),
    padding: `${form.bgPadding ?? 24}px`
  };

  if (completingPayment) {
    return (
      <main className={`${isEmbedded ? "" : "min-h-screen"} bg-sand flex items-center justify-center text-center px-6 font-body`}>
        <div>
          <p className="text-4xl mb-3">⏳</p>
          <p className="text-ink/60">Confirming your payment…</p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className={`${isEmbedded ? "" : "min-h-screen"} bg-sand flex items-center justify-center text-center px-6 py-10 font-body`} style={bgStyle}>
        <div className="max-w-sm">
          <img
            src="/mahalo-confirmation.png"
            alt="Mahalo, sweetheart! We received your response."
            className="w-full h-auto mb-2"
          />
          <p className="font-display text-xl text-ocean italic mb-2">
            You Just Made Our Day 🤙🏽
          </p>
          <p className="text-ink/70 mb-1">
            Check your inbox — a signed copy (PDF included) is already on its way to you.
          </p>
          <p className="text-ink/50 text-sm">
            Now go enjoy some real sunshine. We&apos;ll handle the paperwork. 🌴
          </p>
        </div>
      </main>
    );
  }

  const hasBanner = !!form.bannerUrl;
  const hasLogo = !!form.logoUrl && form.logoVisible !== false;
  const bannerPx = BANNER_HEIGHTS[form.bannerHeight ?? "medium"];
  const logoPx = LOGO_SIZES[form.logoSize ?? "medium"];

  // Split the fields into pages wherever a Page Break sits — the page break's
  // own label becomes that page's "Next" button text
  const pages: RenderField[][] = [[]];
  const nextButtonLabels: string[] = [];
  for (const field of form.fields) {
    if (field.type === "page_break") {
      nextButtonLabels.push(field.label || "Continue to the next step");
      pages.push([]);
    } else {
      pages[pages.length - 1].push(field);
    }
  }
  const totalPages = pages.length;
  const isLastPage = currentPage === totalPages - 1;
  const currentFields = pages[currentPage] ?? [];

  // Group the current page's fields under any Collapsible Section headers —
  // fields before the first header (if any) form an ungrouped leading group
  type SectionGroup = { header: RenderField | null; fields: RenderField[] };
  const groups: SectionGroup[] = [{ header: null, fields: [] }];
  const fieldToSectionId: Record<string, string> = {};
  for (const field of currentFields) {
    if (field.type === "section_collapse") {
      groups.push({ header: field, fields: [] });
    } else {
      const activeGroup = groups[groups.length - 1];
      activeGroup.fields.push(field);
      if (activeGroup.header) fieldToSectionId[field.id] = activeGroup.header.id;
    }
  }

  function isSectionCollapsed(headerId: string, defaultCollapsed: boolean): boolean {
    return headerId in collapsedSections ? collapsedSections[headerId] : defaultCollapsed;
  }

  function toggleSection(headerId: string, currentlyCollapsed: boolean) {
    setCollapsedSections((prev) => ({ ...prev, [headerId]: !currentlyCollapsed }));
  }

  function validateCurrentPage(): string | null {
    for (const field of currentFields) {
      if (!field.required) continue;
      const missing =
        field.type === "signature"
          ? !signature
          : field.type !== "heading" && field.type !== "paragraph" && field.type !== "divider" &&
            (!values[field.id] || (typeof values[field.id] === "string" && values[field.id].trim() === ""));
      if (missing) {
        // If this field lives inside a collapsed section, open it so the
        // person can actually see and fix what's being asked of them
        const sectionId = fieldToSectionId[field.id];
        if (sectionId) setCollapsedSections((prev) => ({ ...prev, [sectionId]: false }));
        return `"${field.label}" is required.`;
      }
    }
    return null;
  }

  function handleNext() {
    const err = validateCurrentPage();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setError(null);
    setCurrentPage((p) => Math.max(0, p - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className={`${isEmbedded ? "" : "min-h-screen"} bg-sand font-body text-ink`} style={bgStyle}>
      <div className={isEmbedded ? "w-full max-w-none" : "max-w-xl mx-auto"}>
        {/* YouTube-style banner with an overlapping round logo — the outer wrapper is NOT
            clipped, so the logo can hang over the banner's edge without being cut off */}
        {(hasBanner || hasLogo) && (
          <div className="relative" style={{ marginBottom: hasBanner ? (hasLogo ? logoPx / 2 + 16 : 24) : 16 }}>
            {hasBanner ? (
              <PositionedImage
                src={form.bannerUrl!}
                shape="rect"
                zoom={form.bannerZoom}
                offsetX={form.bannerOffsetX}
                offsetY={form.bannerOffsetY}
                className="rounded-xl2"
                style={{ height: bannerPx, width: "100%", opacity: (form.bannerOpacity ?? 100) / 100 }}
              />
            ) : (
              <div className="flex justify-center">
                <div className="rounded-full border-4 border-white shadow-md bg-white overflow-hidden" style={{ width: logoPx, height: logoPx, opacity: (form.logoOpacity ?? 100) / 100 }}>
                  <PositionedImage
                    src={form.logoUrl!}
                    shape="circle"
                    zoom={form.logoZoom}
                    offsetX={form.logoOffsetX}
                    offsetY={form.logoOffsetY}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            )}
            {hasBanner && hasLogo && (
              <div
                className="absolute z-10"
                style={{
                  bottom: -(logoPx / 2),
                  width: logoPx,
                  height: logoPx,
                  opacity: (form.logoOpacity ?? 100) / 100,
                  ...(form.logoPosition === "center"
                    ? { left: "50%", transform: "translateX(-50%)" }
                    : form.logoPosition === "right"
                    ? { right: 24 }
                    : { left: 24 })
                }}
              >
                <div className="w-full h-full rounded-full border-4 border-white shadow-md bg-white overflow-hidden">
                  <PositionedImage
                    src={form.logoUrl!}
                    shape="circle"
                    zoom={form.logoZoom}
                    offsetX={form.logoOffsetX}
                    offsetY={form.logoOffsetY}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {paymentCancelled && (
          <div className="bg-plumeria/15 border border-plumeria/30 rounded-xl2 px-4 py-3 mb-4 text-sm text-ink/70">
            No worries — your payment was cancelled and nothing was charged. Feel free to try again whenever you're ready.
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl2 shadow-sm border border-ink/5 p-8">
          <h1 className="font-display text-2xl sm:text-3xl font-medium mb-1">{form.title}</h1>
          {form.description && <p className="text-ink/60 mb-6">{form.description}</p>}

          {totalPages > 1 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-1.5">
                Step {currentPage + 1} of {totalPages}
              </p>
              <div className="w-full h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-coral transition-all duration-300"
                  style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-5 mt-6">
            {groups.map((group, i) =>
              group.header ? (
                <div key={group.header.id} className="border border-ink/10 rounded-xl2 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection(group.header!.id, isSectionCollapsed(group.header!.id, !!group.header!.collapsedByDefault))}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-sand/60 hover:bg-sand transition-colors text-left"
                  >
                    <span className="font-display text-lg font-medium">{group.header.label}</span>
                    <span
                      className={`text-ink/40 transition-transform ${
                        isSectionCollapsed(group.header.id, !!group.header.collapsedByDefault) ? "" : "rotate-180"
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                  {!isSectionCollapsed(group.header.id, !!group.header.collapsedByDefault) && (
                    <div className="p-4 space-y-5">
                      {group.fields.map((field) => (
                        <FieldInput
                          key={field.id}
                          field={field}
                          value={values[field.id] ?? ""}
                          onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
                          onSignatureChange={setSignature}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={`ungrouped-${i}`} className="space-y-5">
                  {group.fields.map((field) => (
                    <FieldInput
                      key={field.id}
                      field={field}
                      value={values[field.id] ?? ""}
                      onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
                      onSignatureChange={setSignature}
                    />
                  ))}
                </div>
              )
            )}
          </div>

          {error && <p className="text-sm text-coral font-medium mt-5">{error}</p>}

          <div className="mt-8 flex items-center gap-3">
            {currentPage > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full border-2 border-ink/15 hover:border-ink/30 transition-colors text-ink/70 px-6 py-3 font-semibold whitespace-nowrap"
              >
                ← Back
              </button>
            )}
            <div className="flex-1">
              {isLastPage ? (
                <SubmitButtonRenderer
                  submitButtonImageUrl={form.submitButtonImageUrl}
                  submitButtonPillId={form.submitButtonPillId}
                  submitButtonText={form.submitButtonText}
                  submitButtonTextColor={form.submitButtonTextColor}
                  submitButtonBold={form.submitButtonBold}
                  submitButtonScale={form.submitButtonScale}
                  submitButtonBgColor={form.submitButtonBgColor}
                  submitButtonFontFamily={form.submitButtonFontFamily}
                  submitButtonFontSize={form.submitButtonFontSize}
                  submitButtonPhotoUrl={form.submitButtonPhotoUrl}
                  submitButtonPhotoZoom={form.submitButtonPhotoZoom}
                  submitButtonPhotoOffsetX={form.submitButtonPhotoOffsetX}
                  submitButtonPhotoOffsetY={form.submitButtonPhotoOffsetY}
                  submitButtonPhotoOpacity={form.submitButtonPhotoOpacity}
                  submitting={submitting}
                />
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full rounded-full bg-coral hover:bg-coral-light transition-colors text-white px-8 py-3 font-semibold"
                >
                  {nextButtonLabels[currentPage] || "Continue to the next step"}
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-ink/30 mt-4">Powered by Hula Forms</p>
        </form>
      </div>
    </main>
  );
}
