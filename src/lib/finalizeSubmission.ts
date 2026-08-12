import { prisma } from "@/lib/prisma";
import { sendSubmissionEmail, sendClientCopyEmail } from "@/lib/email";
import { generateSubmissionPdf, PdfBlock } from "@/lib/pdf";
import { generateBrandHeaderImage } from "@/lib/emailHeaderImage";

export async function finalizeSubmission(opts: {
  form: any; // a Form fetched with { fields, notifyEmails, owner } included
  values: Record<string, string>;
  signatureDataUrl?: string;
}) {
  const { form, values, signatureDataUrl } = opts;

  const submission = await prisma.submission.create({
    data: {
      formId: form.id,
      data: JSON.stringify(values || {}),
      signatureUrl: signatureDataUrl || null
    }
  });

  // Build the full record in the same order the form was laid out — this is what
  // makes the emailed/PDF copy a real, complete document instead of just a list
  // of answers: any contract text (headings/paragraphs) the signer agreed to is
  // included right alongside what they typed.
  const blocks: PdfBlock[] = form.fields
    .filter((f: { type: string }) => f.type !== "page_break" && f.type !== "divider")
    .map((f: { id: string; type: string; label: string; paymentAmountType?: string | null; paymentFixedAmount?: number | null }) => {
      if (f.type === "heading" || f.type === "paragraph") {
        return { kind: f.type, text: f.label } as PdfBlock;
      }
      if (f.type === "section_collapse") {
        return { kind: "heading", text: f.label } as PdfBlock;
      }
      if (f.type === "payment") {
        const amount = f.paymentAmountType === "fixed"
          ? `$${((f.paymentFixedAmount ?? 0) / 100).toFixed(2)} (paid)`
          : `$${Number(values?.[f.id] ?? 0).toFixed(2)} (paid)`;
        return { kind: "answer", label: f.label, value: amount } as PdfBlock;
      }
      return { kind: "answer", label: f.label, value: values?.[f.id] ?? "" } as PdfBlock;
    });

  const submittedAt = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  function toAbsolute(url: string | null) {
    if (!url) return url;
    return url.startsWith("http") ? url : `${appUrl}${url}`;
  }

  // Build the exact same banner+logo composite the owner set up in the builder —
  // this is what makes the email and PDF actually look like the real form,
  // instead of a generic notification.
  let headerImageBuffer: Buffer | null = null;
  try {
    headerImageBuffer = await generateBrandHeaderImage({
      bannerUrl: toAbsolute(form.bannerUrl),
      bannerZoom: form.bannerZoom,
      bannerOffsetX: form.bannerOffsetX,
      bannerOffsetY: form.bannerOffsetY,
      bannerHeight: form.bannerHeight,
      logoUrl: toAbsolute(form.logoUrl),
      logoZoom: form.logoZoom,
      logoOffsetX: form.logoOffsetX,
      logoOffsetY: form.logoOffsetY,
      logoSize: form.logoSize
    });
  } catch (err) {
    console.error("Header image generation failed:", err);
  }

  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = await generateSubmissionPdf({
      formTitle: form.title,
      submittedAt,
      blocks,
      signatureDataUrl,
      headerImageBuffer
    });
  } catch (err) {
    console.error("PDF generation failed:", err);
  }

  // Recipients: the account owner's login email + every additional email added on the form
  const recipients = Array.from(
    new Set([form.owner.email, ...form.notifyEmails.map((n: { email: string }) => n.email)])
  );

  try {
    await sendSubmissionEmail({
      to: recipients,
      formTitle: form.title,
      submittedAt,
      blocks,
      signatureDataUrl,
      pdfBuffer,
      headerImageBuffer
    });
  } catch (err) {
    // Don't fail the submission just because email delivery had an issue —
    // the response is already saved and visible in the dashboard.
    console.error("Email send failed:", err);
  }

  // If the form has an email field and the person filled it in, send them
  // a matching courtesy copy of what they just signed — same content, same
  // PDF, same header image — so both sides walk away with an identical record.
  const emailField = form.fields.find((f: { type: string }) => f.type === "email");
  const clientEmail = emailField ? values?.[emailField.id] : undefined;
  if (clientEmail && clientEmail.includes("@")) {
    try {
      await sendClientCopyEmail({
        to: clientEmail,
        formTitle: form.title,
        submittedAt,
        blocks,
        signatureDataUrl,
        pdfBuffer,
        headerImageBuffer
      });
    } catch (err) {
      console.error("Client copy email failed:", err);
    }
  }

  return submission;
}
