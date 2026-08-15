const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function draftOutreachEmail({ email, label } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('AI drafting is not connected yet. Add ANTHROPIC_API_KEY in Render.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const recipientLine = label
    ? `The recipient is called/known as: ${label} (email: ${email})`
    : `All that's known about the recipient is their email address: ${email} — no name or business details are available, so keep the greeting general and warm rather than guessing at specifics.`;

  const prompt = `You are writing a short, warm, professional outreach email on behalf of Wailea Art, a small family-run art studio based in Wailea, Maui that creates original Hawaii-inspired art prints (former Hollywood creative directors who now paint the islands). This email introduces Wailea Art to someone who might want to carry the work in their shop, gallery, or hotel, or who might simply enjoy hearing about it — the goal is a warm, genuine introduction, not a hard sales pitch.

${recipientLine}

Write a short email (under 150 words) that:
- Opens with a warm, genuine greeting (use their name if known, otherwise a warm general greeting like "Aloha,")
- Briefly introduces Wailea Art and what makes the work distinctive (original Hawaii art, museum-quality prints, bulk/wholesale pricing available for shops and galleries)
- Ends with a low-pressure, specific call to action (e.g., offering to send a wholesale price sheet, or simply inviting them to take a look at the collection)
- Sounds like a real person wrote it, not a mail-merge template — warm, professional, not salesy or over-the-top

Respond ONLY with valid JSON in this exact format, nothing else, no markdown formatting:
{"subject": "the email subject line", "body": "the full email body, using \\n for line breaks"}`;

  const res = await fetch(ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error?.message || JSON.stringify(body);
    } catch (e) {
      detail = await res.text().catch(() => '');
    }

    if (res.status === 401) {
      const err = new Error('Anthropic rejected the API key. Check ANTHROPIC_API_KEY in Render.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const err = new Error(`AI drafting request failed (${res.status}): ${detail || res.statusText}`);
    err.code = 'REQUEST_FAILED';
    throw err;
  }

  const data = await res.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) {
    throw new Error('AI response did not include any text content.');
  }

  let parsed;
  try {
    const cleaned = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Could not parse the AI-drafted email. Please try generating it again.');
  }

  if (!parsed.subject || !parsed.body) {
    throw new Error('The AI draft was missing a subject or body. Please try generating it again.');
  }

  return { subject: parsed.subject, body: parsed.body };
}

module.exports = { isConfigured, draftOutreachEmail };
