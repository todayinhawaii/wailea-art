import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { finalizeSubmission } from "@/lib/finalizeSubmission";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = await req.json();
  const sessionId = body?.sessionId as string;
  if (!sessionId) return NextResponse.json({ error: "Missing session." }, { status: 400 });

  const pending = await prisma.pendingFormSubmission.findUnique({ where: { stripeSessionId: sessionId } });
  if (!pending) {
    return NextResponse.json({ error: "This payment link has expired or was already completed." }, { status: 404 });
  }

  const form = await prisma.form.findUnique({
    where: { id: pending.formId },
    include: { fields: { orderBy: { order: "asc" } }, notifyEmails: true, owner: true }
  });
  if (!form || form.slug !== params.slug) {
    return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
  }

  if (!form.owner.stripeConnectedAccountId) {
    return NextResponse.json({ error: "Payment setup is incomplete for this form." }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      {},
      { stripeAccount: form.owner.stripeConnectedAccountId }
    );

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment wasn't completed. Please try again." }, { status: 400 });
    }
  } catch (err) {
    console.error("Verifying Stripe Checkout session failed:", err);
    return NextResponse.json({ error: "Couldn't verify your payment. Please contact the form owner." }, { status: 500 });
  }

  const { values, signatureDataUrl } = JSON.parse(pending.data) as {
    values: Record<string, string>;
    signatureDataUrl?: string;
  };

  const submission = await finalizeSubmission({ form, values, signatureDataUrl });

  // The pending record has served its purpose — remove it either way now
  await prisma.pendingFormSubmission.delete({ where: { id: pending.id } }).catch(() => {});

  return NextResponse.json({ ok: true, id: submission.id });
}
