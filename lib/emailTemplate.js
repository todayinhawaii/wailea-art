// Wraps a short personal message into the full branded Wailea Art HTML
// email design (logo, 9-piece art grid, CTA button, footer). Used by the
// Outreach tool so every AI-drafted or hand-written email actually sends
// looking like a real designed email, not plain text.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapInWelcomeTemplate(personalMessage) {
  const noteHtml = escapeHtml(personalMessage || '').replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A note from Wailea Art</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td { font-family: Georgia, 'Times New Roman', serif; }
  body { margin:0; padding:0; background-color:#f2ede1; }
  img { border:0; display:block; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .email-wrap { width:100% !important; }
    .art-cell { display:block !important; width:100% !important; padding:0 0 16px 0 !important; }
    .art-img { width:100% !important; height:auto !important; }
    .stack-pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f2ede1;">

<div style="display:none; max-height:0; overflow:hidden; opacity:0;">
  Original Hawaii art, hand-picked for your walls — a note from Wailea Art.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2ede1;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" class="email-wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#fdfaf3; border:1px solid #e2d5ab;">

        <tr>
          <td style="background-color:#6b8570; height:6px; line-height:6px; font-size:1px;">&nbsp;</td>
        </tr>

        <tr>
          <td align="center" style="padding:40px 20px 16px;">
            <a href="https://www.wailea.art/" style="display:inline-block;">
              <img src="https://www.wailea.art/images/wailea-art-logo.png" alt="Wailea Art" width="140" style="width:140px; height:auto; background-color:#fdfaf3;">
            </a>
          </td>
        </tr>

        <tr>
          <td align="center" class="stack-pad" style="padding:0 40px 4px;">
            <h1 style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1.3; color:#2b2520; font-weight:normal;">
              Aloha, and welcome to Wailea&nbsp;Art
            </h1>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 40px 8px;">
            <a href="https://www.wailea.art/" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; letter-spacing:0.05em; color:#6b8570; text-transform:uppercase;">
              www.wailea.art
            </a>
          </td>
        </tr>

        <tr>
          <td align="center" class="stack-pad" style="padding:8px 48px 16px;">
            <p style="margin:0 0 14px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#6b6255;">
              Wailea Art is a family-run art and design studio based in Maui, Hawaii, creating original
              Hawaii-inspired wall art for homes, galleries, boutiques, gift shops, and hospitality spaces.
              Our family's creative background spans bespoke ceramic jewelry design, photography, and
              graphic design — including years as an Art Director leading campaigns for major Hollywood
              studios — and that same eye for composition and color now goes into every piece we create.
            </p>
            <p style="margin:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#6b6255;">
              Every piece is original and museum-quality, and always <strong>open edition</strong> — a
              piece you love today will still be available tomorrow. We offer wholesale pricing for
              galleries, gift shops, boutiques, hotels, and vacation rentals throughout Hawaii, the
              mainland, and internationally. Here's a small taste of the collection below.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 48px 20px;">
            <p style="margin:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:11px; color:#a39c8d;">
              (If the images below don't appear, look for a "Show images" or "Download pictures" option near the top of this email.)
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/wailea-sunset-palms-canvas" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785553860614-419944071.jpg" alt="Wailea Sunset Palms Canvas" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/lahaina-baby-beach-at-dusk" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785553853891-551259132.jpg" alt="Lahaina Baby Beach at Dusk" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-515" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785553832456-725720178.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
              </tr>
              <tr>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-514" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785553830894-138143466.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-593" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785877182434-804940603.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-513" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785553830261-550112881.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
              </tr>
              <tr>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-541" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785553865741-173789158.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-569" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785790905709-578344186.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
                <td class="art-cell" width="33.33%" valign="top" style="padding:0 8px 16px;">
                  <a href="https://www.wailea.art/art/rt-587" style="display:block;">
                    <img class="art-img" src="https://www.wailea.art/uploads/preview-art-1785790915653-607593934.jpg" alt="Original Hawaii art print by Wailea Art" width="168" style="width:100%; height:168px; object-fit:cover; border:1px solid #e2d5ab; background-color:#f2ede1; color:#6b6255; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Personal note (dynamically injected per lead) -->
        <tr>
          <td class="stack-pad" style="padding:20px 48px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2ede1; border-radius:6px;">
              <tr>
                <td style="padding:22px 24px;">
                  <p style="margin:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#2b2520;">
                    ${noteHtml}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:28px 40px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background-color:#6b8570; border-radius:999px;">
                  <a href="https://www.wailea.art/" style="display:inline-block; padding:14px 34px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:14px; letter-spacing:0.04em; color:#ffffff; text-transform:uppercase;">
                    View the Full Collection
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" class="stack-pad" style="padding:28px 40px 40px;">
            <p style="margin:0 0 4px; font-family:Georgia,'Times New Roman',serif; font-size:15px; color:#2b2520;">Mahalo,</p>
            <p style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:15px; color:#447873; font-style:italic;">The Wailea Art Team</p>
          </td>
        </tr>

        <tr>
          <td style="background-color:#2b2520; padding:28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <p style="margin:0 0 10px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; letter-spacing:0.06em; color:#c9c2b3; text-transform:uppercase;">
                    Wailea Art &middot; Wailea, Maui, Hawaii
                  </p>
                  <p style="margin:0 0 10px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; color:#8a8377;">
                    <a href="https://www.wailea.art/" style="color:#c9c2b3;">www.wailea.art</a> &nbsp;&middot;&nbsp;
                    <a href="https://www.wailea.art/contact" style="color:#c9c2b3;">Contact</a> &nbsp;&middot;&nbsp;
                    <a href="https://www.wailea.art/about" style="color:#c9c2b3;">About</a>
                  </p>
                  <p style="margin:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:11px; color:#6b6558;">
                    &copy; 2026 Wailea Art. All rights reserved. All artwork shown is original and copyrighted by Wailea Art.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

module.exports = { wrapInWelcomeTemplate };
