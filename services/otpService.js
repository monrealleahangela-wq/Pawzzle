const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// CRITICAL: Ensure DNS resolution works for Email/DB on restricted networks
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  console.warn('[Server] DNS override failed');
}

const Otp = require('../models/Otp');

/**
 * otpService.js
 * Handles generation, persistent storage, and delivery of OTP codes via Email/SMS.
 */

const logOTPToFile = (type, email, otp) => {
  try {
    const logPath = path.join(process.cwd(), 'LATEST_OTP.txt');
    const logEntry = `[${new Date().toLocaleString()}] ${type} for ${email}: ${otp}\n`;
    fs.appendFileSync(logPath, logEntry);
  } catch (err) {
    console.warn('⚠️ Unable to write OTP log:', err.message);
  }
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendWithResend = async (to, subject, html) => {
  const axios = require('axios');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('⚠️ RESEND_API_KEY not found.');
    throw new Error('Missing Resend API Key');
  }

  try {
    const response = await axios.post('https://api.resend.com/emails', {
      from: 'Pawzzle <no-reply@pawzzle.io>',
      to: [to],
      subject: subject,
      html: html
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✨ RESEND SUCCESS:', response.data.id);
      return true;
    } else {
      throw new Error(`Resend Refused: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.error('❌ RESEND API ERROR:', msg);
    throw new Error(msg);
  }
};

const createTransporter = async (portType = '587') => {
  const user = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
  const pass = process.env.EMAIL_PASS || 'aknzqkqqdumntchq';
  let port = 587;
  let secure = false;

  if (portType === '465') {
    port = 465;
    secure = true;
  } else if (portType === '2525') {
    port = 2525;
    secure = false;
  }

  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 5000,
      tls: { rejectUnauthorized: false }
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
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const lastOtp = await Otp.findOne({ email, type }).sort({ createdAt: -1 });
  if (lastOtp && (Date.now() - lastOtp.createdAt.getTime()) < 60000) {
    const remaining = 60 - Math.floor((Date.now() - lastOtp.createdAt.getTime()) / 1000);
    throw new Error(`Wait ${remaining}s before resending.`);
  }
  await Otp.deleteMany({ email, type });
  const otpDoc = new Otp({ email, otp, type, userData, expiresAt });
  return await otpDoc.save();
};

const sendRegistrationOTP = async (email, otp, firstName, userData = null) => {
  try {
    await saveOtpToDb(email, otp, 'registration', userData);
    const bodyHtml = wrapInTemplate('Verification', `
      <p>Hello ${firstName},</p>
      <p>Enter this code to verify your account:</p>
      <div style="font-size:40px;font-weight:900;text-align:center;background:#fff7ed;padding:20px;border-radius:10px;letter-spacing:10px;">${otp}</div>
    `);

    // 1. RESEND FIRST (Best for Render)
    let resendError = '';
    try {
      console.log('🔄 Trying Resend...');
      await sendWithResend(email, '🔐 Verify Your Pawzzle Account', bodyHtml);
      return true;
    } catch (e) { 
      resendError = e.message;
      console.warn('⚠️ Resend Failed:', e.message); 
    }

    // 2. SMTP FALLBACKS
    let smtpErrors = '';
    for (const port of ['587', '465', '2525']) {
      try {
        console.log(`🔄 Trying SMTP Port ${port}...`);
        const { transporter, fromEmail } = await createTransporter(port);
        await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to: email, subject: '🔐 Verify Account', html: bodyHtml });
        return true;
      } catch (err) { smtpErrors += `${port}:${err.message}; `; }
    }

    // FINAL FAILURE REPORTING
    const finalErrorMessage = `Email delivery failed. Resend: ${resendError || 'unknown'}. SMTP: ${smtpErrors || 'all ports blocked'}`;
    throw new Error(finalErrorMessage);

  } catch (error) {
    console.error('❌ sendRegistrationOTP FAILED:', error.message);
    throw error;
  }
};

const sendPasswordResetOTP = async (email, otp) => {
  try {
    await saveOtpToDb(email, otp, 'password_reset');
    const bodyHtml = wrapInTemplate('Reset', `<p>Reset code: <b>${otp}</b></p>`);
    try { return await sendWithResend(email, 'Reset Password', bodyHtml); }
    catch (e) {
      const { transporter, fromEmail } = await createTransporter();
      await transporter.sendMail({ from: fromEmail, to: email, subject: 'Reset Password', html: bodyHtml });
      return true;
    }
  } catch (error) { throw error; }
};

const sendLoginOTP = async (email, otp) => {
  try {
    await saveOtpToDb(email, otp, 'login');
    const bodyHtml = wrapInTemplate('Login', `<p>Login code: <b>${otp}</b></p>`);
    try { return await sendWithResend(email, 'Login Verify', bodyHtml); }
    catch (e) {
      const { transporter, fromEmail } = await createTransporter();
      await transporter.sendMail({ from: fromEmail, to: email, subject: 'Login Verify', html: bodyHtml });
      return true;
    }
  } catch (error) { throw error; }
};

module.exports = { generateOTP, sendRegistrationOTP, sendPasswordResetOTP, sendLoginOTP, sendSMS_OTP: async () => true };
