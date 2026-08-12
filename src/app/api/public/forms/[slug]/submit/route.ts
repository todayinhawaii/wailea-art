import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeSubmission } from "@/lib/finalizeSubmission";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const form = await prisma.form.findUnique({
    where: { slug: params.slug },
    include: { fields: { orderBy: { order: "asc" } }, notifyEmails: true, owner: true }
  });

  if (!form || !form.isPublished || form.owner.subscriptionStatus !== "active") {
    return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
  }

  // Forms with a Payment field must go through the payment/checkout flow —
  // this stops someone from bypassing payment by calling this endpoint directly
  if (form.fields.some((f: { type: string }) => f.type === "payment")) {
    return NextResponse.json({ error: "This form requires payment. Please use the payment flow." }, { status: 400 });
  }

  const body = await req.json();
  const { values, signatureDataUrl } = body as { values: Record<string, string>; signatureDataUrl?: string };

  // Basic required-field validation
  for (const field of form.fields) {
    if (field.required && field.type !== "signature" && !values?.[field.id]) {
      return NextResponse.json({ error: `"${field.label}" is required.` }, { status: 400 });
    }
    if (field.type === "signature" && field.required && !signatureDataUrl) {
      return NextResponse.json({ error: `"${field.label}" is required.` }, { status: 400 });
    }
  }

  const submission = await finalizeSubmission({ form, values, signatureDataUrl });

  return NextResponse.json({ ok: true, id: submission.id });
}
