const nodemailer = require('nodemailer');

/**
 * Robust Transporter Factory
 * Tries to use Port 465 (SSL) by default, but provides configuration for fallback
 */
const getTransporter = (useFallbackPort = false) => {
    const user = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
    const pass = process.env.EMAIL_PASS || 'aknzqkqqdumntchq';
    
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: useFallbackPort ? 587 : 465,
        secure: useFallbackPort ? false : true,
        auth: {
            user: user,
            pass: pass
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        tls: {
            rejectUnauthorized: false
        }
    });
};

const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6d7c45 0%,#8fa75a 50%,#a3b86c 100%);padding:40px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="padding:40px 32px;">${body}</div>
    <div style="padding:24px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;">Automated Message — Pawzzle Platform</p>
      <p style="margin:4px 0 0;color:#cbd5e1;font-size:10px;">© ${new Date().getFullYear()} Pawzzle. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const sendStaffInvitation = async (email, password, firstName) => {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/login`;
    
    const bodyHtml = wrapInTemplate('Team Invitation', `
        <p style="font-size:16px;color:#334155;margin:0 0 12px;font-weight:700;">Welcome, ${firstName}!</p>
        <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.7;">
            You have been added as a staff member on the Pawzzle platform. Use the credentials below to access your professional dashboard:
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:32px;text-align:center;margin:0 0 28px;">
            <p style="margin:0 0 10px;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Account Password</p>
            <div style="font-size:36px;font-weight:900;color:#6d7c45;letter-spacing:2px;font-family:monospace;">${password}</div>
        </div>
        <div style="background:#fff7ed;border-radius:12px;padding:16px;margin:0 0 32px;border-left:4px solid #f97316;">
            <p style="font-size:12px;color:#c2410c;font-weight:700;margin:0;">⚠️ Security Notice: You will be prompted to change this password on your first login.</p>
        </div>
        <div style="text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#6d7c45;color:#ffffff;padding:18px 40px;border-radius:14px;text-decoration:none;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 10px 20px -5px rgba(109,124,69,0.4);">Access Dashboard</a>
        </div>
    `);

    const fromUser = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
    const mailOptions = {
        from: `"Pawzzle Staff Management" <${fromUser}>`,
        to: email,
        subject: '🔐 Access Details: Your New Pawzzle Staff Account',
        html: bodyHtml
    };

    // Try Resend API first (Most reliable on cloud hosts)
    if (process.env.RESEND_API_KEY) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
                },
                body: JSON.stringify({
                    from: `Pawzzle Staff <hello@pawzzle.io>`,
                    to: [email],
                    subject: mailOptions.subject,
                    html: mailOptions.html
                })
            });
            if (response.ok) {
                console.log(`[EmailService] SUCCESS: Sent to ${email} via Resend API`);
                return await response.json();
            }
        } catch (resendErr) {
            console.error(`[EmailService] Resend API failed:`, resendErr.message);
        }
    }

    // Fallback 1: SMTP Port 465 (SSL)
    try {
        const transporter = getTransporter(false);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] SUCCESS: Sent to ${email} via SMTP (Port 465)`);
        return info;
    } catch (smtp465Err) {
        console.warn(`[EmailService] SMTP Port 465 failed, trying fallback Port 587...`);
        
        // Fallback 2: SMTP Port 587 (STARTTLS)
        try {
            const transporterFallback = getTransporter(true);
            const info = await transporterFallback.sendMail(mailOptions);
            console.log(`[EmailService] SUCCESS: Sent to ${email} via SMTP (Port 587)`);
            return info;
        } catch (smtp587Err) {
            console.error(`[EmailService] ALL EMAIL METHODS FAILED for ${email}`);
            console.error(`Details: ${smtp587Err.message}`);
            throw new Error(`Email delivery blocked by network or invalid credentials.`);
        }
    }
};

module.exports = {
    sendStaffInvitation
};
