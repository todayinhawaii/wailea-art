const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function isConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

// Checks the inbox for any messages FROM the given list of contact email
// addresses. Only looking at addresses we've actually emailed keeps this
// naturally scoped to real outreach replies, rather than pulling in every
// order notification, receipt, or unrelated message sitting in the inbox.
async function checkForReplies(contactEmails) {
  if (!isConfigured()) {
    const err = new Error('Email reading is not connected yet. Add SMTP_USER and SMTP_PASSWORD in Render (same login used for sending).');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  if (!contactEmails || contactEmails.length === 0) return [];

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.IMAP_PORT, 10) || 993,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    logger: false
  });

  const found = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      for (const email of contactEmails) {
        for await (const msg of client.fetch({ from: email }, { envelope: true, source: true, uid: true })) {
          try {
            const parsed = await simpleParser(msg.source);
            found.push({
              messageId: parsed.messageId || `uid-${msg.uid}-${email}`,
              fromEmail: email,
              subject: parsed.subject || '(no subject)',
              body: (parsed.text || '').trim() || '(no readable text content in this message)',
              receivedAt: parsed.date ? parsed.date.toISOString() : null
            });
          } catch (parseErr) {
            console.error('Failed to parse a message from', email, parseErr.message);
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch (e) { /* already closed */ }
    console.error('IMAP check error:', err.message);
    const wrapped = new Error('Could not connect to check for replies: ' + err.message);
    wrapped.code = 'IMAP_ERROR';
    throw wrapped;
  }

  return found;
}

module.exports = { isConfigured, checkForReplies };
