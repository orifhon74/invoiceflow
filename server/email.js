'use strict';
// Email sending for invoices. Primary provider is Resend (HTTP API, no SDK
// dependency — just fetch). If RESEND_API_KEY is not set, we run in a safe
// "not configured" mode: nothing is sent, but the caller still gets the
// shareable link so the flow degrades gracefully.

const RESEND_API_KEY = () => process.env.RESEND_API_KEY || '';
const EMAIL_FROM = () => process.env.EMAIL_FROM || 'InvoiceFlow <onboarding@resend.dev>';

function isConfigured() {
  return !!RESEND_API_KEY();
}

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', INR: '₹', JPY: '¥' };
function money(n, cur) {
  const sym = CURRENCY_SYMBOLS[cur] || '';
  return `${sym}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Builds the HTML + subject for an invoice email. Pure function → unit-testable.
function buildInvoiceEmail({ invoice, client, business, totals, shareUrl }) {
  const cur = invoice.currency;
  const bizName = business.business_name || 'Your supplier';
  const subject = `Invoice ${invoice.number} from ${bizName} — ${money(totals.total, cur)} due ${invoice.due_date}`;
  const logo = business.business_logo
    ? `<div style="margin-bottom:16px"><img src="${business.business_logo}" alt="" style="max-height:56px;max-width:180px;object-fit:contain"></div>`
    : '';
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    ${logo}
    <h2 style="margin:0 0 4px">Invoice ${esc(invoice.number)}</h2>
    <p style="color:#64748b;margin:0 0 20px">from ${esc(bizName)}</p>
    <p>Hi ${esc(client.name || 'there')},</p>
    <p>Please find your invoice below. The amount due is
       <b>${money(totals.total, cur)}</b>, due by <b>${esc(invoice.due_date)}</b>.</p>
    <p style="margin:28px 0">
      <a href="${esc(shareUrl)}" style="background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">View &amp; download invoice</a>
    </p>
    <p style="color:#64748b;font-size:13px">Or copy this link: <br>${esc(shareUrl)}</p>
    ${invoice.notes ? `<p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px;white-space:pre-wrap">${esc(invoice.notes)}</p>` : ''}
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">Sent via InvoiceFlow</p>
  </div>`;
  return { subject, html };
}

// Low-level send helper used by both invoice and verification emails.
async function sendViaResend({ to, subject, html, replyTo }) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (!isConfigured()) return { sent: false, reason: 'not_configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM(), to: [to], reply_to: replyTo || undefined, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, reason: data.message || `provider_error_${res.status}` };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

function buildVerificationEmail({ email, verifyUrl }) {
  const subject = 'Verify your InvoiceFlow email';
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0 0 12px">Confirm your email</h2>
    <p>Welcome to InvoiceFlow! Click below to verify <b>${esc(email)}</b> and start invoicing.</p>
    <p style="margin:28px 0">
      <a href="${esc(verifyUrl)}" style="background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">Verify my email</a>
    </p>
    <p style="color:#64748b;font-size:13px">Or paste this link: <br>${esc(verifyUrl)}</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:28px">If you didn't create an account, you can ignore this email.</p>
  </div>`;
  return { subject, html };
}

async function sendVerificationEmail({ email, verifyUrl }) {
  const { subject, html } = buildVerificationEmail({ email, verifyUrl });
  return sendViaResend({ to: email, subject, html });
}

// Sends the email. Returns { sent: boolean, reason?, id? }.
async function sendInvoiceEmail(payload) {
  const { subject, html } = buildInvoiceEmail(payload);
  const to = payload.client.email;

  if (!to) return { sent: false, reason: 'no_client_email' };
  if (!isConfigured()) return { sent: false, reason: 'not_configured' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM(),
        to: [to],
        reply_to: payload.business.business_email || undefined,
        subject,
        html,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, reason: data.message || `provider_error_${res.status}` };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

module.exports = {
  isConfigured,
  buildInvoiceEmail,
  sendInvoiceEmail,
  buildVerificationEmail,
  sendVerificationEmail,
};
