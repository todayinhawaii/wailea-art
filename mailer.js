const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false, // STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

// Sends a notification to the shop owner whenever someone submits the
// contact form. Fails silently (just logs) so a broken email setup never
// blocks the actual form submission — the message is always saved to the
// database first, regardless of whether this succeeds.
async function sendContactNotification({ name, email, message }) {
  if (!transporter) {
    console.log('Email not configured (SMTP_USER/SMTP_PASSWORD missing) — skipping notification email.');
    return;
  }

  const toAddress = process.env.CONTACT_EMAIL || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: `"Wailea Art website" <${process.env.SMTP_USER}>`,
      to: toAddress,
      replyTo: email,
      subject: `New message from ${name} — Wailea Art contact form`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p style="color:#888; font-size: 0.85em;">Reply directly to this email to respond to ${name}.</p>
      `
    });
    console.log(`Contact notification email sent successfully to ${toAddress}.`);
  } catch (err) {
    console.error('Failed to send contact notification email:', err.message);
  }
}

module.exports = { sendContactNotification };
