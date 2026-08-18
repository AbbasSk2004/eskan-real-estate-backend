const { BrevoClient } = require('@getbrevo/brevo');

// Sanitize the key: strip surrounding quotes and whitespace so a value
// copy-pasted from the Brevo dashboard (e.g. "xkeysib-...") is used as-is.
const BREVO_API_KEY = String(process.env.BREVO_API_KEY || '')
  .trim()
  .replace(/^["']|["']$/g, '');
const FROM_ADDRESS = process.env.EMAIL_FROM || 'Eskan Real Estate <abbasskaiki7@proton.me>';

// Free-provider sender domains cannot be authenticated in Brevo and are
// blocked or spam-filtered downstream — the API call succeeds (a messageId is
// returned) but the email never reaches the recipient's inbox.
const FREE_SENDER_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'outlook.com', 'hotmail.com', 'live.com', 'aol.com', 'proton.me', 'protonmail.com', 'qq.com', '163.com', '126.com', 'aliyun.com', 'sina.com'];

const warnIfUnverifiedSender = () => {
  const match = /<([^>]+)>$|^([^<]+)$/.exec(FROM_ADDRESS.trim());
  const senderEmail = (match?.[1] || match?.[2] || '').trim().toLowerCase();
  const domain = senderEmail.split('@')[1];
  if (domain && FREE_SENDER_DOMAINS.includes(domain)) {
    console.warn(
      `[Email] EMAIL_FROM uses "${domain}" — a free provider that Brevo cannot authenticate as a sender. ` +
      'Brevo will accept sends (messageId returned) but recipients will spam-filter or reject them. ' +
      'Fix: authenticate a real domain in the Brevo dashboard (Senders & IPs > Domain authentication) ' +
      'and set EMAIL_FROM to an address on it. For local development set EMAIL_DEV_MODE=true and use the ' +
      'echoed OTP from the API response/server log instead.'
    );
  }
};

if (!BREVO_API_KEY) {
  throw new Error('BREVO_API_KEY must be set in environment variables');
}

// The @getbrevo/brevo SDK authenticates v3 requests via the `api-key` header
// (see HeaderAuthProvider in the SDK); configuring the client with apiKey is
// sufficient — no manual header is required.
const client = new BrevoClient({ apiKey: BREVO_API_KEY });

warnIfUnverifiedSender();

const parseSender = (fromAddress) => {
  const match = /^(.*)<(.+)>$/.exec(fromAddress);
  if (!match) {
    return {
      name: 'Eskan Real Estate',
      email: fromAddress.trim()
    };
  }

  return {
    name: match[1].trim().replace(/^"|"$/g, ''),
    email: match[2].trim()
  };
};

// The SDK surfaces provider errors with status/body fields (e.g. 401 with
// body.message "API Key is not enabled"); handle all plausible shapes.
const extractError = (err) => {
  const status = err?.status ?? err?.response?.status ?? err?.statusCode ?? null;
  const message = String(
    err?.body?.message ||
    err?.response?.body?.message ||
    err?.message ||
    'Failed to send email'
  );
  return { status, message };
};

const isBrevoKeyDisabledError = ({ status, message }) =>
  status === 401 && !/unrecognised IP|authorised_ips|authorized_ips/i.test(message);

const sendMail = async ({ to, subject, text, html }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error('Email send parameters missing. Provide to, subject and text or html.');
  }

  try {
    const sender = parseSender(FROM_ADDRESS);

    const emailPayload = {
      sender: sender,
      to: Array.isArray(to)
        ? to.map((email) => ({ email }))
        : [{ email: to }],
      subject: subject
    };

    if (text) {
      emailPayload.textContent = text;
    }

    if (html) {
      emailPayload.htmlContent = html;
    }

    const response = await client.transactionalEmails.sendTransacEmail(emailPayload);
    return response;
  } catch (err) {
    const { status, message } = extractError(err);
    // Never log the API key itself — only status and provider message.
    console.error('Failed to send email via Brevo', { status, message });

    if (status === 401 && !isBrevoKeyDisabledError({ status, message })) {
      console.error(
        'Brevo rejected the request IP (401). Add the current public IP at ' +
        'https://app.brevo.com/security/authorised_ips (Brevo Dashboard > Security > Authorized IPs).'
      );
    } else if (isBrevoKeyDisabledError({ status, message })) {
      console.error(
        'Brevo API key rejected (401). Re-enable the key in the Brevo Dashboard (Settings > API Keys) ' +
        'or generate a new v3 API key starting with "xkeysib-".'
      );
    }

    throw new Error('Failed to send email');
  }
};

module.exports = {
  sendMail
};