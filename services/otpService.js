const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Log OTP to a file for easy retrieval during development
const logOTPToFile = (type, email, otp) => {
  const logPath = path.join(process.cwd(), 'LATEST_OTP.txt');
  const logEntry = `[${new Date().toLocaleString()}] ${type} for ${email}: ${otp}\n`;
  fs.appendFileSync(logPath, logEntry);
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper Function to send via Resend API (More reliable on Render as it uses HTTP/S)
const sendWithResend = async (to, subject, html) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('⚠️  RESEND_API_KEY not found. Falling back to other methods.');
    return null;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'Pawzzle <hello@pawzzle.io>',
        to: [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✨ Email sent successfully via RESEND API!', data.id);
      return true;
    } else {
      console.error('❌ RESEND API ERROR:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ RESEND FETCH ERROR:', error.message);
    return false;
  }
};

// Create reusable transporter (Nodemailer Fallback)
const createTransporter = async () => {
  const user = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
  const pass = process.env.EMAIL_PASS || 'aknzqkqqdumntchq';

  const isUserDefault = user === 'your-email@gmail.com';
  const isPassDefault = pass === 'your-app-password';

  if (!isUserDefault && !isPassDefault) {
    const isHostinger = process.env.EMAIL_SERVICE === 'hostinger' || user.endsWith('@pawzzle.io');
    const config = isHostinger ? {
        host: 'smtp.hostinger.com',
        port: 587,
        secure: false,
        auth: { user, pass },
        connectionTimeout: 30000,
        tls: {
          rejectUnauthorized: false
        }
    } : {
        service: 'gmail',
        auth: { user, pass },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        tls: {
          rejectUnauthorized: false
        }
    };
    
    return {
      transporter: nodemailer.createTransport(config),
      fromEmail: user,
      isEthereal: false
    };
  }

  const testAccount = await nodemailer.createTestAccount();
  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    }),
    fromEmail: testAccount.user,
    isEthereal: true
  };
};

// Branded email template wrapper
const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#6d7c45 0%,#8fa75a 50%,#a3b86c 100%);padding:36px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="padding:36px 32px;">${body}</div>
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;">This is an automated message from Pawzzle Pet Platform</p>
      <p style="margin:4px 0 0;color:#cbd5e1;font-size:10px;">© ${new Date().getFullYear()} Pawzzle. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

// Send Registration OTP email
const sendRegistrationOTP = async (email, otp, firstName) => {
  try {
    // 🔑 EMERGENCY LOG
    console.log('-------------------------------------------');
    console.log(`🔑 REGISTRATION OTP for ${email}: [ ${otp} ]`);
    console.log('-------------------------------------------');

    logOTPToFile('REGISTRATION_OTP_EMAIL', email, otp);

    const bodyHtml = wrapInTemplate('Email Verification', `
      <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Hello ${firstName || 'there'},</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">
        Welcome to Pawzzle! Please verify your email address by entering the code below to complete your registration.
      </p>
      <div style="background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:16px;padding:24px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Your Verification Code</p>
        <div style="font-size:36px;font-weight:900;color:#1e293b;letter-spacing:8px;font-family:monospace;">${otp}</div>
      </div>
    `);

    const sent = await sendWithResend(email, '🔐 Verify Your Pawzzle Account', bodyHtml);
    if (sent) return true;

    const { transporter, fromEmail } = await createTransporter();
    await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to: email, subject: '🔐 Verify Your Pawzzle Account', html: bodyHtml });
    return true;
  } catch (error) {
    console.error('❌ Error sending registration OTP email:', error.message);
    return false; // Return false so we catch real errors in production
  }
};

const sendPasswordResetOTP = async (email, otp) => {
  try {
    const bodyHtml = wrapInTemplate('Password Reset', `
      <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Password Reset Request</p>
      <div style="font-size:36px;font-weight:900;color:#1e293b;letter-spacing:8px;font-family:monospace;">${otp}</div>
    `);
    const sent = await sendWithResend(email, '🔑 Reset Your Pawzzle Password', bodyHtml);
    if (sent) return true;

    const { transporter, fromEmail } = await createTransporter();
    await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to: email, subject: '🔑 Reset Your Pawzzle Password', html: bodyHtml });
    return true;
  } catch (error) { 
    console.error('❌ Error sending password reset email:', error.message);
    return false; 
  }
};

const sendLoginOTP = async (email, otp, firstName) => {
  try {
    console.log('-------------------------------------------');
    console.log(`🛡️ LOGIN 2FA OTP for ${email}: [ ${otp} ]`);
    console.log('-------------------------------------------');
    
    const bodyHtml = wrapInTemplate('2FA Verification', `
      <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Login Verification</p>
      <div style="font-size:36px;font-weight:900;color:#6d7c45;letter-spacing:8px;font-family:monospace;">${otp}</div>
    `);
    const sent = await sendWithResend(email, '🛡 Pawzzle Login Verification Code', bodyHtml);
    if (sent) return true;

    const { transporter, fromEmail } = await createTransporter();
    await transporter.sendMail({ from: `"Pawzzle" <${fromEmail}>`, to: email, subject: '🛡 Pawzzle Login Verification Code', html: bodyHtml });
    return true;
  } catch (error) { 
    console.error('❌ Error sending login OTP email:', error.message);
    return true; 
  }
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
