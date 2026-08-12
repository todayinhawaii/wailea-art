import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const form = await prisma.form.findUnique({
    where: { slug: params.slug },
    include: { fields: { orderBy: { order: "asc" } }, owner: true }
  });

  if (!form || !form.isPublished || form.owner.subscriptionStatus !== "active") {
    return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
  }

  const paymentField = form.fields.find((f: { type: string }) => f.type === "payment");
  if (!paymentField) {
    return NextResponse.json({ error: "This form doesn't require payment." }, { status: 400 });
  }

  if (!form.owner.stripeConnectedAccountId || form.owner.stripeConnectedStatus !== "active") {
    return NextResponse.json(
      { error: "This form owner hasn't finished setting up payments yet. Please contact them directly." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { values, signatureDataUrl } = body as { values: Record<string, string>; signatureDataUrl?: string };

  // Validate every required field, same as the normal submit flow
  for (const field of form.fields) {
    if (field.type === "payment") continue;
    if (field.required && field.type !== "signature" && !values?.[field.id]) {
      return NextResponse.json({ error: `"${field.label}" is required.` }, { status: 400 });
    }
    if (field.type === "signature" && field.required && !signatureDataUrl) {
      return NextResponse.json({ error: `"${field.label}" is required.` }, { status: 400 });
    }
  }

  // Work out the amount to actually charge
  let amountCents: number;
  if (paymentField.paymentAmountType === "client") {
    const dollars = Number(values?.[paymentField.id]);
    if (!dollars || dollars < 0.5) {
      return NextResponse.json({ error: "Please enter a valid payment amount (at least $0.50)." }, { status: 400 });
    }
    amountCents = Math.round(dollars * 100);
  } else {
    amountCents = paymentField.paymentFixedAmount ?? 0;
    if (amountCents < 50) {
      return NextResponse.json({ error: "This form's payment amount isn't set up correctly. Please contact the form owner." }, { status: 400 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  // Stash their answers safely — this becomes a real submission only once
  // payment is confirmed
  const pending = await prisma.pendingFormSubmission.create({
    data: {
      formId: form.id,
      data: JSON.stringify({ values: values || {}, signatureDataUrl: signatureDataUrl || null })
    }
  });

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: paymentField.label || "Payment",
                description: paymentField.paymentDescription || form.title
              },
              unit_amount: amountCents
            },
            quantity: 1
          }
        ],
        success_url: `${appUrl}/f/${form.slug}?payment_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/f/${form.slug}?payment_cancelled=1`
      },
      { stripeAccount: form.owner.stripeConnectedAccountId }
    );

    await prisma.pendingFormSubmission.update({
      where: { id: pending.id },
      data: { stripeSessionId: session.id }
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Checkout session creation failed:", err);
    await prisma.pendingFormSubmission.delete({ where: { id: pending.id } }).catch(() => {});
    return NextResponse.json({ error: "Couldn't start payment. Please try again." }, { status: 500 });
  }
}
