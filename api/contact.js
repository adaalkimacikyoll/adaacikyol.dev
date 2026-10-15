// Vercel Serverless Function: POST /api/contact
// 1) Sends the form submission to Ada's inbox
// 2) Sends an automatic confirmation reply to the visitor
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   GMAIL_USER          e.g. ada.acikyol@gmail.com
//   GMAIL_APP_PASSWORD  16-character Google App Password (NOT your normal password)
// Optional:
//   CONTACT_TO          where notifications go (defaults to GMAIL_USER)

const nodemailer = require('nodemailer');

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD, CONTACT_TO } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars');
    return res.status(500).json({ ok: false, error: 'Mail service is not configured.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const name = String(body.name || '').trim().slice(0, 100);
  const email = String(body.email || '').trim().slice(0, 200);
  const subject = String(body.subject || '').trim().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 5000);
  const honeypot = String(body.website || '').trim(); // bots fill hidden fields

  if (honeypot) return res.status(200).json({ ok: true }); // silently drop spam

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Please fill in name, email and message.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject || '(no subject)');
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  try {
    // 1) Notification to Ada
    await transporter.sendMail({
      from: `"adaacikyol.dev" <${GMAIL_USER}>`,
      to: CONTACT_TO || GMAIL_USER,
      replyTo: `"${name.replace(/"/g, '')}" <${email}>`,
      subject: `[Portfolio] ${subject || 'New message'} — ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || '(no subject)'}\n\n${message}`,
      html: `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
          <h2 style="margin:0 0 12px">New message from your portfolio</h2>
          <p><strong>Name:</strong> ${safeName}<br>
             <strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a><br>
             <strong>Subject:</strong> ${safeSubject}</p>
          <div style="padding:12px 16px;background:#f5f3ff;border-left:3px solid #a78bfa;border-radius:4px">${safeMessage}</div>
        </div>`,
    });

    // 2) Auto-reply to the visitor (formal confirmation)
    const subjectLine = subject || 'your message';
    await transporter.sendMail({
      from: `"Ada Alkım Açıkyol" <${GMAIL_USER}>`,
      to: email,
      replyTo: GMAIL_USER,
      subject: `Message received: ${subjectLine}`,
      text:
        `Dear ${name},\n\n` +
        `Thank you for contacting me through my website. This is an automatic confirmation that your message regarding "${subjectLine}" has been received.\n\n` +
        `I will review it carefully and respond within business days. Should your inquiry be time-sensitive, you are welcome to reply directly to this email.\n\n` +
        `For your reference, a copy of your message is included below:\n\n${message}\n\n` +
        `Kind regards,\n\nAda Alkım Açıkyol\nSoftware Engineering Intern, University of Europe for Applied Sciences\nCo-founder & CEO, Taply\nhttps://adaacikyol.dev`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.65;max-width:600px">
          <p>Dear ${safeName},</p>
          <p>Thank you for contacting me through my website. This is an automatic confirmation that your message regarding <strong>${escapeHtml(subjectLine)}</strong> has been received.</p>
          <p>I will review it carefully and respond within business days. Should your inquiry be time-sensitive, you are welcome to reply directly to this email.</p>
          <p style="color:#666;margin:20px 0 6px">For your reference, a copy of your message is included below:</p>
          <div style="padding:12px 16px;background:#f7f7f9;border-left:3px solid #8b8b99;border-radius:2px;color:#444">${safeMessage}</div>
          <p style="margin-top:24px">Kind regards,</p>
          <p style="margin:0"><strong>Ada Alkım Açıkyol</strong><br>
          <span style="color:#555">Software Engineering Intern, University of Europe for Applied Sciences</span><br>
          <span style="color:#555">Co-founder &amp; CEO, Taply</span><br>
          <a href="https://adaacikyol.dev" style="color:#4a4ad0">adaacikyol.dev</a></p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 10px">
          <p style="font-size:12px;color:#999;margin:0">This is an automated message sent in response to a submission on adaacikyol.dev.</p>
        </div>`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Mail send failed:', err);
    return res.status(500).json({ ok: false, error: 'Message could not be sent. Please email me directly.' });
  }
};
