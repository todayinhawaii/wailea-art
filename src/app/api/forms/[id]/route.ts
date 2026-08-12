import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function assertOwner(formId: string, userId: string) {
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.ownerId !== userId) return null;
  return form;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await prisma.form.findUnique({
    where: { id: params.id },
    include: {
      fields: { orderBy: { order: "asc" } },
      notifyEmails: true,
      owner: { select: { email: true } }
    }
  });
  if (!form || form.ownerId !== (session.user as any).id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(form);
}

// Full save: title, description, theme, published state, fields (replaced), notify emails (replaced)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const owned = await assertOwner(params.id, (session.user as any).id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, description, theme, bgColorStart, bgColorEnd, bgOpacity, bgPadding, logoUrl, logoSize, logoZoom, logoOffsetX, logoOffsetY, logoOpacity, logoPosition, logoVisible, bannerUrl, bannerHeight, bannerZoom, bannerOffsetX, bannerOffsetY, bannerOpacity, submitButtonImageUrl, submitButtonPillId, submitButtonText, submitButtonTextColor, submitButtonBold, submitButtonScale, submitButtonBgColor, submitButtonFontFamily, submitButtonFontSize, submitButtonPhotoUrl, submitButtonPhotoZoom, submitButtonPhotoOffsetX, submitButtonPhotoOffsetY, submitButtonPhotoOpacity, isPublished, fields, notifyEmails } = body;

  // Never let someone publish (or keep published) a form without an active
  // membership — this is the other half of what stops a canceled account
  // from re-publishing to keep a free ride going.
  let effectiveIsPublished = isPublished;
  if (isPublished) {
    const owner = await prisma.user.findUnique({
      where: { id: (session.user as any).id },
      select: { subscriptionStatus: true, stripeConnectedStatus: true }
    });
    if (owner?.subscriptionStatus !== "active") {
      return NextResponse.json(
        { error: "Please activate your membership before publishing a form." },
        { status: 402 }
      );
    }
    const hasPaymentField = (fields || []).some((f: any) => f.type === "payment");
    if (hasPaymentField && owner?.stripeConnectedStatus !== "active") {
      return NextResponse.json(
        { error: "This form has a Payment field — please finish connecting Stripe in Payments before publishing it." },
        { status: 402 }
      );
    }
  }

  // The builder page saves title/fields but not notifyEmails, and the settings
  // page saves notifyEmails but not fields — only touch what was actually sent,
  // so one page's save never wipes out data owned by the other.
  const operations: any[] = [
    prisma.form.update({
      where: { id: params.id },
      data: {
        title, description, theme, bgColorStart, bgColorEnd, bgOpacity, bgPadding,
        logoUrl, logoSize, logoZoom, logoOffsetX, logoOffsetY, logoOpacity, logoPosition, logoVisible,
        bannerUrl, bannerHeight, bannerZoom, bannerOffsetX, bannerOffsetY, bannerOpacity,
        submitButtonImageUrl, submitButtonPillId, submitButtonText, submitButtonTextColor, submitButtonBold, submitButtonScale,
        submitButtonBgColor, submitButtonFontFamily, submitButtonFontSize, submitButtonPhotoUrl, submitButtonPhotoZoom, submitButtonPhotoOffsetX, submitButtonPhotoOffsetY, submitButtonPhotoOpacity,
        isPublished: effectiveIsPublished
      }
    })
  ];

  if (fields !== undefined) {
    operations.push(
      prisma.formField.deleteMany({ where: { formId: params.id } }),
      prisma.formField.createMany({
        data: (fields || []).map((f: any, i: number) => ({
          formId: params.id,
          type: f.type,
          label: f.label,
          placeholder: f.placeholder || null,
          required: !!f.required,
          options: f.options ? JSON.stringify(f.options) : null,
          imageUrl: f.imageUrl || null,
          imageZoom: f.imageZoom ?? 1,
          imageOffsetX: f.imageOffsetX ?? 0,
          imageOffsetY: f.imageOffsetY ?? 0,
          opacity: f.opacity ?? 100,
          strokeWidth: f.strokeWidth ?? 0,
          strokeColor: f.strokeColor || null,
          color: f.color || null,
          fontSize: f.fontSize ?? null,
          fontFamily: f.fontFamily || null,
          textCase: f.textCase || null,
          labelAlign: f.labelAlign || null,
          collapsedByDefault: !!f.collapsedByDefault,
          paymentAmountType: f.paymentAmountType || null,
          paymentFixedAmount: f.paymentFixedAmount ?? null,
          paymentDescription: f.paymentDescription || null,
          bgColor: f.bgColor || null,
          bgColorOpacity: f.bgColorOpacity ?? 100,
          bgImageUrl: f.bgImageUrl || null,
          bgImageZoom: f.bgImageZoom ?? 1,
          bgImageOffsetX: f.bgImageOffsetX ?? 0,
          bgImageOffsetY: f.bgImageOffsetY ?? 0,
          bgImageOpacity: f.bgImageOpacity ?? 100,
          order: i
        }))
      })
    );
  }

  if (notifyEmails !== undefined) {
    operations.push(
      prisma.notifyEmail.deleteMany({ where: { formId: params.id } }),
      prisma.notifyEmail.createMany({
        data: (notifyEmails || []).map((email: string) => ({ formId: params.id, email }))
      })
    );
  }

  await prisma.$transaction(operations);

  const updated = await prisma.form.findUnique({
    where: { id: params.id },
    include: { fields: { orderBy: { order: "asc" } }, notifyEmails: true }
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const owned = await assertOwner(params.id, (session.user as any).id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.form.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
