const { BrevoClient } = require('@getbrevo/brevo');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM || 'Eskan Real Estate <abbasskaiki7@proton.me>';

if (!BREVO_API_KEY) {
  throw new Error('BREVO_API_KEY must be set in environment variables');
}

const client = new BrevoClient({ apiKey: BREVO_API_KEY });

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
    console.log('Brevo email sent successfully', response);
    return response;
  } catch (err) {
    console.error('Failed to send email via Brevo', err.response?.body || err.message || err);
    throw new Error('Failed to send email');
  }
};

module.exports = {
  sendMail
};
