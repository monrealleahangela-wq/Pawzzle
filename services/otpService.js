const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// Fix for connection issues on some cloud networks (like Render)
dns.setServers(['8.8.8.8', '8.8.4.4']);

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

// Cached transporter (so we don't create a new Ethereal account every time)
let cachedTransporter = null;
let cachedUser = null;

// Create reusable transporter
const createTransporter = async () => {
  // Detect if user has changed the default placeholders
  const isUserDefault = process.env.EMAIL_USER === 'your-email@gmail.com' || !process.env.EMAIL_USER;
  const isPassDefault = process.env.EMAIL_PASS === 'your-app-password' || !process.env.EMAIL_PASS;

  // Use Real Credentials if BOTH email and pass have been modified from defaults
  if (!isUserDefault && !isPassDefault) {
    console.log(`🚀 Using REAL email service: ${process.env.EMAIL_SERVICE || 'gmail'} (${process.env.EMAIL_USER})`);
    return {
      transporter: nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        // Add timeout to prevent hanging
        connectionTimeout: 10000,
        greetingTimeout: 10000
      }),
      fromEmail: process.env.EMAIL_USER,
      isEthereal: false
    };
  }

  // Fallback to Ethereal if placeholders are still present
  if (isUserDefault || isPassDefault) {
    console.log('⚠️  EMAIL CONFIGURATION WARNING:');
    if (isUserDefault) console.log('   - EMAIL_USER is still set to placeholder or empty.');
    if (isPassDefault) console.log('   - EMAIL_PASS is still set to placeholder or empty.');
    console.log('   👉 These must be replaced in your .env file to send real emails.');
    console.log('   🔗 Defaulting to Ethereal Testing Mode (Check terminal logs for codes).');
  }

  // Use Ethereal (free test email service) — works without any config
  if (cachedTransporter) {
    return { transporter: cachedTransporter, fromEmail: cachedUser, isEthereal: true };
  }

  console.log('📧 Creating Ethereal test email account...');
  const testAccount = await nodemailer.createTestAccount();

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
  cachedUser = testAccount.user;

  console.log('✅ Ethereal email account ready!');
  console.log(`   📧 Test email: ${testAccount.user}`);
  console.log(`   🔑 Test pass:  ${testAccount.pass}`);
  console.log('   🌐 View sent emails at: https://ethereal.email/login');
  console.log('');

  return { transporter: cachedTransporter, fromEmail: cachedUser, isEthereal: true };
};

// Branded email template wrapper
const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6d7c45 0%,#8fa75a 50%,#a3b86c 100%);padding:36px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${title}</p>
    </div>
    <!-- Body -->
    <div style="padding:36px 32px;">
      ${body}
    </div>
    <!-- Footer -->
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
    const { transporter, fromEmail, isEthereal } = await createTransporter();

    // Always log to file for convenience
    logOTPToFile('REGISTRATION_OTP_EMAIL', email, otp);

    const body = `
      <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Hello ${firstName || 'there'},</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">
        Welcome to Pawzzle! Please verify your email address by entering the code below to complete your registration.
      </p>
      <div style="background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:16px;padding:24px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Your Verification Code</p>
        <div style="font-size:36px;font-weight:900;color:#1e293b;letter-spacing:8px;font-family:monospace;">${otp}</div>
      </div>
      <div style="background:#fefce8;border-left:3px solid #eab308;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        <p style="margin:0;font-size:12px;color:#854d0e;font-weight:600;">⏱ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin:0;">If you didn't create this account, please ignore this email.</p>
    `;

    const mailOptions = {
      from: `"Pawzzle" <${fromEmail}>`,
      to: email,
      subject: '🔐 Verify Your Pawzzle Account',
      html: wrapInTemplate('Email Verification', body)
    };

    const info = await transporter.sendMail(mailOptions);

    if (isEthereal) {
      console.log('📧 Ethereal OTP sent for:', email);
    } else {
      console.log('✅ Real Email OTP sent to:', email);
    }

    return true;
  } catch (error) {
    console.error('❌ Error sending registration OTP email:', error.message);
    return false;
  }
};

const sendPasswordResetOTP = async (email, otp) => {
  try {
    const { transporter, fromEmail, isEthereal } = await createTransporter();

    const body = `
      <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Password Reset Request</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">
        We received a request to reset the password for your Pawzzle account. Use the code below to proceed.
      </p>
      <div style="background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:16px;padding:24px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Your Reset Code</p>
        <div style="font-size:36px;font-weight:900;color:#1e293b;letter-spacing:8px;font-family:monospace;">${otp}</div>
      </div>
      <div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        <p style="margin:0;font-size:12px;color:#991b1b;font-weight:600;">⚠ This code expires in <strong>10 minutes</strong>. If you didn't request this, your account is still secure.</p>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin:0;">For security, never share your OTP with anyone.</p>
    `;

    const mailOptions = {
      from: `"Pawzzle" <${fromEmail}>`,
      to: email,
      subject: '🔑 Reset Your Pawzzle Password',
      html: wrapInTemplate('Password Reset', body)
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Password reset email sent to: ${email} (${isEthereal ? 'Ethereal' : 'Real'})`);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset OTP email:', error.message);
    return false;
  }
};

// Send Login 2FA OTP email
const sendLoginOTP = async (email, otp, firstName) => {
  try {
    const { transporter, fromEmail, isEthereal } = await createTransporter();

    logOTPToFile('LOGIN_2FA_OTP', email, otp);

    const body = `
      <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Secure Login Verification</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">
        Hello ${firstName || 'there'}, use the verification code below to complete your login to Pawzzle.
      </p>
      <div style="background:#f1f5f9;border:2px dashed #6d7c45;border-radius:16px;padding:24px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Your Login Code</p>
        <div style="font-size:36px;font-weight:900;color:#6d7c45;letter-spacing:8px;font-family:monospace;">${otp}</div>
      </div>
      <div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        <p style="margin:0;font-size:12px;color:#0369a1;font-weight:600;">🛡 Keep your account safe. This code expires in <strong>10 minutes</strong>.</p>
      </div>
      <p style="font-size:13px;color:#94a3b8;margin:0;">If you didn't attempt to log in, please secure your account immediately.</p>
    `;

    const mailOptions = {
      from: `"Pawzzle Security" <${fromEmail}>`,
      to: email,
      subject: '🛡 Pawzzle Login Verification Code',
      html: wrapInTemplate('2FA Verification', body)
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Login OTP email sent to: ${email} (${isEthereal ? 'Ethereal' : 'Real'})`);
    return true;
  } catch (error) {
    console.error('❌ Error sending login OTP email:', error.message);
    return false;
  }
};

// Send SMS OTP (Twilio fallback)
const sendSMS_OTP = async (phoneNumber, otp) => {
  try {
    console.log(`📱 Attempting to send SMS OTP to ${phoneNumber}...`);

    // Log for developer access
    logOTPToFile('REGISTRATION_OTP_SMS', phoneNumber, otp);

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (sid && auth && from) {
      const twilio = require('twilio');
      const client = new twilio(sid, auth);

      await client.messages.create({
        body: `Your Pawzzle verification code is: ${otp}`,
        to: phoneNumber,
        from: from
      });
      console.log('✅ SMS OTP sent via Twilio to:', phoneNumber);
      return true;
    }

    // Default simulation for development
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log(`║  📱 SMS OTP SIMULATED FOR: ${phoneNumber.padEnd(25)} ║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  CODE: ${otp.padEnd(46)} ║`);
    console.log('║  (Configure TWILIO credentials in .env for real SMS) ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    return true;
  } catch (error) {
    console.error('❌ Error sending SMS OTP:', error.message);
    return false;
  }
};

// Legacy export for backward compatibility
const sendOTPEmail = sendPasswordResetOTP;

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendRegistrationOTP,
  sendPasswordResetOTP,
  sendLoginOTP,
  sendSMS_OTP
};
