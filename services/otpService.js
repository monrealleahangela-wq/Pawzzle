const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');
const Otp = require('../models/Otp');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

const getOtpSecret = () => {
  const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('OTP security configuration is missing');
  return secret;
};

const hashOTP = otp => crypto
  .createHmac('sha256', getOtpSecret())
  .update(String(otp).trim())
  .digest('hex');

const matchesOTP = (submitted, stored) => {
  const candidate = String(submitted || '').trim();
  if (!/^\d{6}$/.test(candidate)) return false;

  if (stored.otpHash) {
    const candidateHash = Buffer.from(hashOTP(candidate), 'hex');
    const storedHash = Buffer.from(stored.otpHash, 'hex');
    return candidateHash.length === storedHash.length && crypto.timingSafeEqual(candidateHash, storedHash);
  }

  // Compatibility for OTP records created shortly before this deployment.
  if (stored.otp) {
    const candidateBuffer = Buffer.from(candidate);
    const storedBuffer = Buffer.from(String(stored.otp).trim());
    return candidateBuffer.length === storedBuffer.length && crypto.timingSafeEqual(candidateBuffer, storedBuffer);
  }

  return false;
};

const sendWithResend = async (to, subject, html) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Resend is not configured');

  const response = await axios.post('https://api.resend.com/emails', {
    from: process.env.RESEND_FROM_EMAIL || 'Pawzzle <no-reply@pawzzle.io>',
    to: [to],
    subject,
    html
  }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (response.status !== 200 && response.status !== 201) throw new Error('Email provider rejected the request');
  return true;
};

const createTransporter = (portType = '587') => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) throw new Error('SMTP credentials are not configured');

  const secure = portType === '465';
  const port = secure ? 465 : Number(portType);
  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 5000,
      tls: { rejectUnauthorized: true, servername: 'smtp.gmail.com', minVersion: 'TLSv1.2' }
    }),
    fromEmail: user
  };
};

const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<body style="background-color:#fefce8;padding:20px;font-family:sans-serif;">
  <div style="max-width:500px;margin:auto;background:#fff;padding:40px;border-radius:20px;border:1px solid #fef08a;">
    <h1 style="color:#6d7c45;text-align:center;">${title}</h1>
    <div style="margin:20px 0;">${body}</div>
    <p style="font-size:10px;color:#92400e;text-align:center;border-top:1px solid #eee;padding-top:20px;">Pawzzle Security</p>
  </div>
</body>
</html>`;

const saveOtpToDb = async (email, otp, type, userData = null) => {
  const normalizedEmail = String(email).trim().toLowerCase();
  const lastOtp = await Otp.findOne({ email: normalizedEmail, type }).sort({ createdAt: -1 });

  if (lastOtp && Date.now() - lastOtp.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - lastOtp.createdAt.getTime())) / 1000);
    throw new Error(`Wait ${remaining}s before resending.`);
  }

  await Otp.deleteMany({ email: normalizedEmail, type });
  return Otp.create({
    email: normalizedEmail,
    otpHash: hashOTP(otp),
    type,
    userData,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS
  });
};

const getActiveOtpSession = async (email, type) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const stored = await Otp.findOne({ email: normalizedEmail, type })
    .sort({ createdAt: -1 })
    .select('+userData');

  if (!stored || stored.expiresAt <= new Date() || stored.attempts >= stored.maxAttempts) return null;
  return stored;
};

const verifyOTP = async (email, type, submittedOtp) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const stored = await Otp.findOne({ email: normalizedEmail, type })
    .sort({ createdAt: -1 })
    .select('+otpHash +otp +userData');

  if (!stored) return { valid: false, reason: 'expired' };
  if (stored.expiresAt <= new Date()) {
    await Otp.deleteOne({ _id: stored._id });
    return { valid: false, reason: 'expired' };
  }
  if (stored.attempts >= stored.maxAttempts) return { valid: false, reason: 'locked' };

  if (!matchesOTP(submittedOtp, stored)) {
    const updated = await Otp.findOneAndUpdate(
      { _id: stored._id, attempts: { $lt: stored.maxAttempts } },
      { $inc: { attempts: 1 } },
      { new: true }
    ).select('attempts maxAttempts');
    return { valid: false, reason: !updated || updated.attempts >= updated.maxAttempts ? 'locked' : 'invalid' };
  }

  const consumed = await Otp.findOneAndDelete({
    _id: stored._id,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: stored.maxAttempts }
  }).select('+userData');

  return consumed
    ? { valid: true, userData: consumed.userData || null }
    : { valid: false, reason: 'expired' };
};

const deliverEmail = async (to, subject, html) => {
  try {
    return await sendWithResend(to, subject, html);
  } catch (resendError) {
    for (const port of ['587', '465', '2525']) {
      try {
        const { transporter, fromEmail } = createTransporter(port);
        await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to, subject, html });
        return true;
      } catch (smtpError) {
        // Try the next configured transport without logging credentials or OTP data.
      }
    }
    throw new Error('Email delivery is unavailable');
  }
};

const sendRegistrationOTP = async (email, otp, firstName, userData = null) => {
  await saveOtpToDb(email, otp, 'registration', userData);
  const html = wrapInTemplate('Verification', `
    <p>Hello ${firstName || 'there'},</p>
    <p>Enter this code to verify your account:</p>
    <div style="font-size:40px;font-weight:900;text-align:center;background:#fff7ed;padding:20px;border-radius:10px;letter-spacing:10px;">${otp}</div>
  `);
  return deliverEmail(email, 'Verify Your Pawzzle Account', html);
};

const sendPasswordResetOTP = async (email, otp) => {
  await saveOtpToDb(email, otp, 'password_reset');
  return deliverEmail(email, 'Reset Password', wrapInTemplate('Reset', `<p>Reset code: <b>${otp}</b></p>`));
};

const sendLoginOTP = async (email, otp) => {
  await saveOtpToDb(email, otp, 'login');
  return deliverEmail(email, 'Login Verification', wrapInTemplate('Login', `<p>Login code: <b>${otp}</b></p>`));
};

module.exports = {
  generateOTP,
  sendRegistrationOTP,
  sendPasswordResetOTP,
  sendLoginOTP,
  verifyOTP,
  getActiveOtpSession,
  sendSMS_OTP: async () => true,
  __test: { hashOTP, matchesOTP, OTP_MAX_ATTEMPTS, OTP_TTL_MS }
};
