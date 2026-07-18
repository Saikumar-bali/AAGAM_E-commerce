#!/usr/bin/env node

const required = [
  'MAILJET_API_KEY',
  'MAILJET_SECRET_KEY',
  'PARTNER_VERIFICATION_FROM_EMAIL',
  'MAILJET_TEST_TO_EMAIL',
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Mailjet integration test not configured: ${missing.join(', ')}`);
  process.exit(2);
}

const mode = (process.env.MAILJET_TEST_MODE || 'sandbox').trim().toLowerCase();
if (!['sandbox', 'live'].includes(mode)) {
  console.error('MAILJET_TEST_MODE must be sandbox or live');
  process.exit(2);
}
if (mode === 'live' && process.env.MAILJET_ALLOW_LIVE_SEND !== 'true') {
  console.error('Live Mailjet sending requires MAILJET_ALLOW_LIVE_SEND=true');
  process.exit(2);
}

function parseSender(raw) {
  const value = raw.trim();
  const bracketed = value.match(/^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  const email = (bracketed?.[2] || value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name =
    process.env.PARTNER_VERIFICATION_FROM_NAME?.trim() ||
    bracketed?.[1]?.replace(/^['"]|['"]$/g, '').trim() ||
    'AAGAM Verification';
  return { email, name };
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main() {
  const sender = parseSender(process.env.PARTNER_VERIFICATION_FROM_EMAIL);
  const recipient = process.env.MAILJET_TEST_TO_EMAIL.trim();
  if (!sender) {
    console.error('PARTNER_VERIFICATION_FROM_EMAIL is invalid');
    process.exit(2);
  }
  if (!validEmail(recipient)) {
    console.error('MAILJET_TEST_TO_EMAIL is invalid');
    process.exit(2);
  }

  const correlationId = `aagam-mailjet-proof-${Date.now()}`;
  const payload = {
    SandboxMode: mode === 'sandbox',
    Messages: [
      {
        From: { Email: sender.email, Name: sender.name },
        To: [{ Email: recipient }],
        Subject:
          mode === 'sandbox'
            ? 'AAGAM Mailjet sandbox verification proof'
            : 'AAGAM Mailjet delivery verification proof',
        TextPart:
          'AAGAM Mailjet integration test. This message contains no account or production OTP data.',
        HTMLPart:
          '<p><strong>AAGAM Mailjet integration test</strong></p><p>This message contains no account or production OTP data.</p>',
        CustomID: correlationId,
      },
    ],
  };

  let response;
  try {
    response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.MAILJET_API_KEY.trim()}:${process.env.MAILJET_SECRET_KEY.trim()}`,
        ).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`Mailjet network failure: ${error?.name || 'Error'}`);
    process.exit(1);
  }

  const body = await response.json().catch(() => ({}));
  const message = Array.isArray(body.Messages) ? body.Messages[0] : undefined;
  const recipientResult = Array.isArray(message?.To) ? message.To[0] : undefined;
  const success = response.ok && String(message?.Status || '').toLowerCase() === 'success';

  const proof = {
    provider: 'MAILJET',
    mode,
    httpStatus: response.status,
    messageStatus: message?.Status || null,
    messageId: recipientResult?.MessageUUID || recipientResult?.MessageID || null,
    correlationId,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(proof, null, 2));

  if (!success) {
    const error = Array.isArray(message?.Errors) ? message.Errors[0] : undefined;
    const safeCode = String(
      error?.ErrorIdentifier ||
        error?.ErrorCode ||
        body.ErrorIdentifier ||
        body.ErrorCode ||
        'MAILJET_REJECTED',
    )
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_')
      .slice(0, 80);
    console.error(`Mailjet rejected the test request: ${safeCode}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Mailjet integration test failed: ${error?.name || 'Error'}`);
  process.exit(1);
});
