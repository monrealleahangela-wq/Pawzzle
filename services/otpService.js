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

// Log OTP to a file for easy retrieval during development
const logOTPToFile = (type, email, otp) => {
  try {
    const logPath = path.join(process.cwd(), 'LATEST_OTP.txt');
    const logEntry = `[${new Date().toLocaleString()}] ${type} for ${email}: ${otp}\n`;
    fs.appendFileSync(logPath, logEntry);
  } catch (err) {
    // Fail silently in production (e.g. Render/Vercel read-only systems)
    console.warn('⚠️  Unable to write OTP log to file (common in production):', err.message);
  }
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper Function to send via Resend API (Using axios for better fallback/error data)
const sendWithResend = async (to, subject, html) => {
  const axios = require('axios');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('⚠️  RESEND_API_KEY not found. Skipping Resend.');
    return null;
  }

  try {
    const response = await axios.post('https://api.resend.com/emails', {
      from: 'Pawzzle <onboarding@resend.dev>', // Resend trial requires this from address
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
      console.log('✨ Email sent successfully via RESEND API!', response.data.id);
      return true;
    } else {
      console.error('❌ RESEND API ERROR:', response.data);
      return false;
    }
  } catch (error) {
    console.error('❌ RESEND POST FAILURE:', error.response?.data || error.message);
    return false;
  }
};

// Create reusable transporter (Nodemailer Fallback)
const createTransporter = async (useAlternativePort = false) => {
  const user = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
  const pass = process.env.EMAIL_PASS || 'aknzqkqqdumntchq';

  // Manual DNS lookup to force IPv4 and bypass ENETUNREACH/BIND issues
  let smtpHost = 'smtp.gmail.com';
  try {
    const { address } = await require('dns').promises.lookup('smtp.gmail.com', { family: 4 });
    smtpHost = address;
    console.log(`📡 SMTP Host Resolved: ${smtpHost} (IPv4)`);
  } catch (dnsErr) {
    console.warn('⚠️ IPv4 DNS lookup failed, falling back to hostname:', dnsErr.message);
  }

  const port = useAlternativePort ? 465 : 587;
  const secure = useAlternativePort; // 465 is secure, 587 is STARTTLS (secure: false)

  return {
    transporter: nodemailer.createTransport({
      host: smtpHost,
      port: port,
      secure: secure,
      auth: { user, pass },
      connectionTimeout: 8000, // Reduced to 8s to prevent Render request timeout
      greetingTimeout: 8000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false,
        servername: 'smtp.gmail.com',
        minVersion: 'TLSv1.2'
      }
    }),
    fromEmail: user
  };
};

// Branded email template wrapper
const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#fefce8;font-family:sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:24px;border:1px solid #fef08a;overflow:hidden;box-shadow:0 10px 40px -10px rgba(161,98,7,0.1);">
    <div style="background:linear-gradient(135deg,#6d7c45 0%,#8fa75a 100%);padding:40px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:900;letter-spacing:-1px;">PAWZZLE</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:10px;font-weight:800;letter-spacing:4px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="padding:40px 32px;">${body}</div>
    <div style="padding:24px 32px;background:#fffbeb;text-align:center;border-top:1px solid #fef3c7;">
      <p style="margin:0;color:#92400e;font-size:11px;font-weight:700;">Secure Delivery Platform</p>
    </div>
  </div>
</body>
</html>
`;

// Persistent OTP and cooldown check (Required Fix 3 & 6)
const saveOtpToDb = async (email, otp, type, userData = null) => {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
  
  // Cooldown enforcement: 60s (Requirement 6)
  const lastOtp = await Otp.findOne({ email, type }).sort({ createdAt: -1 });
  if (lastOtp && (Date.now() - lastOtp.createdAt.getTime()) < 60000) {
    const remaining = 60 - Math.floor((Date.now() - lastOtp.createdAt.getTime()) / 1000);
    throw new Error(`Please wait ${remaining} seconds before requesting a new code.`);
  }

  // Clear previous codes for this email
  await Otp.deleteMany({ email, type });

  const otpDoc = new Otp({
    email,
    otp,
    type,
    userData,
    expiresAt
  });

  return await otpDoc.save();
};

/**
 * Send Registration OTP email
 * @param {string} email - Recipient
 * @param {string} otp - 6 digit code
 * @param {string} firstName - User's name
 * @param {object} userData - Full registration payload (state preservation)
 */
const sendRegistrationOTP = async (email, otp, firstName, userData = null) => {
  try {
    // 1. Persist to DB immediately
    await saveOtpToDb(email, otp, 'registration', userData);

    console.log(`[REAL-MAIL] Dispatching Registration OTP to ${email}`);
    logOTPToFile('REGISTRATION', email, otp);

    const bodyHtml = wrapInTemplate('Secure Verification', `
      <p style="font-size:16px;color:#451a03;margin:0 0 12px;font-weight:700;">Hello ${firstName || 'Future Pet Owner'},</p>
      <p style="font-size:14px;color:#78350f;margin:0 0 32px;line-height:1.6;">
        Welcome to Pawzzle! To ensure the security of our community, please enter the following verification code to activate your account:
      </p>
      <div style="background:#fff7ed;border:2px solid #fdba74;border-radius:20px;padding:32px;text-align:center;margin:0 0 32px;">
        <div style="font-size:42px;font-weight:900;color:#7c2d12;letter-spacing:10px;font-family:monospace;">${otp}</div>
        <p style="margin:16px 0 0;color:#ea580c;font-size:11px;font-weight:800;text-transform:uppercase;">Expires in 10 minutes</p>
      </div>
      <p style="font-size:12px;color:#9a3412;margin:0;font-weight:600;text-align:center;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    `);

    // 2. PRIMARY Delivery (Direct SMTP / Gmail - Port 587)
    let smtpErrorMessage = '';
    try {
      console.log('🔄 Attempting SMTP Delivery (Primary - 587)...');
      const { transporter, fromEmail } = await createTransporter(false);
      await transporter.sendMail({ 
        from: `"Pawzzle Security" <${fromEmail}>`, 
        to: email, 
        subject: '🔐 Verify Your Pawzzle Account', 
        html: bodyHtml 
      });
      console.log('✅ SMTP (587) Delivery Successful');
      return true;
    } catch (smtpError) {
      smtpErrorMessage += `587: ${smtpError.message}; `;
      console.warn('⚠️ SMTP (587) Failed, trying 465...');
      
      // 3. SECONDARY Delivery (Direct SMTP / Gmail - Port 465)
      try {
        console.log('🔄 Attempting SMTP Delivery (Secondary - 465)...');
        const { transporter, fromEmail } = await createTransporter(true);
        await transporter.sendMail({ 
            from: `"Pawzzle Security" <${fromEmail}>`, 
            to: email, 
            subject: '🔐 Verify Your Pawzzle Account', 
            html: bodyHtml 
        });
        console.log('✅ SMTP (465) Delivery Successful');
        return true;
      } catch (smtpError465) {
        smtpErrorMessage += `465: ${smtpError465.message}`;
        console.warn('⚠️ SMTP (465) Failed, falling back to Resend API...');
      }
    }

    // 4. TERTIARY Delivery (Resend API)
    const resendSuccess = await sendWithResend(email, '🔐 Verify Your Pawzzle Account', bodyHtml);
    if (resendSuccess) {
        console.log('✅ Resend API Delivery Successful');
        return true;
    }

    // Final failure reporting
    const finalError = `Verification Failure: All delivery methods failed. SMTP Issues: [${smtpErrorMessage}]. Resend Status: [${process.env.RESEND_API_KEY ? 'Active' : 'Key Missing'}].`;
    console.error(`🔥 ${finalError}`);
    throw new Error(finalError);
  } catch (error) {
    console.error('❌ DISPATCH FAILURE:', { email, error: error.message });
    throw error;
  }
};

const sendPasswordResetOTP = async (email, otp) => {
  try {
    await saveOtpToDb(email, otp, 'password_reset');
    const bodyHtml = wrapInTemplate('Security Alert', `
      <p style="font-size:15px;color:#451a03;margin:0 0 8px;font-weight:700;">Password Reset Request</p>
      <p style="font-size:14px;color:#78350f;margin:0 0 24px;">Enter this code to reset your password:</p>
      <div style="font-size:40px;font-weight:900;color:#1e293b;letter-spacing:8px;font-family:monospace;text-align:center;">${otp}</div>
    `);
    
    // SMTP First
    try {
      const { transporter, fromEmail } = await createTransporter();
      await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to: email, subject: '🔑 Reset Your Pawzzle Password', html: bodyHtml });
      return true;
    } catch (e) {
      return await sendWithResend(email, '🔑 Reset Your Pawzzle Password', bodyHtml);
    }
  } catch (error) { throw error; }
};

const sendLoginOTP = async (email, otp, firstName) => {
  try {
    await saveOtpToDb(email, otp, 'login');
    const bodyHtml = wrapInTemplate('Identity Guard', `
      <p style="font-size:15px;color:#451a03;margin:0 0 8px;font-weight:700;">Login Verification</p>
      <div style="font-size:40px;font-weight:900;color:#6d7c45;letter-spacing:10px;font-family:monospace;text-align:center;">${otp}</div>
    `);
    
    // SMTP First
    try {
      const { transporter, fromEmail } = await createTransporter();
      await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to: email, subject: '🛡 Pawzzle Login Verification', html: bodyHtml });
      return true;
    } catch (e) {
      return await sendWithResend(email, '🛡 Pawzzle Login Verification', bodyHtml);
    }
  } catch (error) { throw error; }
};

const sendSMS_OTP = async (phoneNumber, otp) => {
  console.log(`║  📱 SMS CODE: ${otp} ║`);
  return true;
};

module.exports = {
  generateOTP,
  sendOTPEmail: sendPasswordResetOTP,
  sendRegistrationOTP,
  sendPasswordResetOTP,
  sendLoginOTP,
  sendSMS_OTP
};
