const nodemailer = require('nodemailer');

/**
 * Robust Transporter Factory
 * Prioritizes Port 587 (STARTTLS) which is more reliable on cloud hosts like Render.
 */
const getTransporter = (useLegacySsl = false) => {
    const user = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
    const pass = process.env.EMAIL_PASS || 'aknzqkqqdumntchq';
    
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: useLegacySsl ? 465 : 587,
        secure: useLegacySsl, // true for 465, false for 587
        auth: {
            user: user,
            pass: pass
        },
        // Aggressive timeouts for cloud environments
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 20000,
        tls: {
            // Do not fail on invalid certificates (helpful for some cloud interceptors)
            rejectUnauthorized: false
        }
    });
};

const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f5;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:30px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.05);border:1px solid #eef2ef;">
    <div style="background:linear-gradient(135deg,#6d7c45 0%,#8fa75a 100%);padding:45px 20px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:800;letter-spacing:-1px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.8);font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="padding:40px 35px;">${body}</div>
    <div style="padding:25px;background:#fafbf9;border-top:1px solid #f0f4ef;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:600;">Pawzzle Pet Management System • Auto-Generated Message</p>
      <p style="margin:5px 0 0;color:#d1d5db;font-size:10px;">© ${new Date().getFullYear()} Pawzzle. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const sendStaffInvitation = async (email, password, firstName) => {
    const loginUrl = `${process.env.CLIENT_URL || 'https://pawzzle.io'}/login`;
    
    const bodyHtml = wrapInTemplate('Team Access Credentials', `
        <h2 style="font-size:18px;color:#1a1a1a;margin:0 0 15px;font-weight:700;">Hello ${firstName},</h2>
        <p style="font-size:15px;color:#4b5563;margin:0 0 25px;line-height:1.6;">
            A staff account has been successfully created for you. You can now access your management dashboard using the temporary credentials provided below.
        </p>
        <div style="background:#f9fafb;border:2px solid #6d7c45;border-radius:12px;padding:25px;text-align:center;margin:0 0 25px;">
            <p style="margin:0 0 10px;color:#6b7280;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Temporary Password</p>
            <div style="font-size:34px;font-weight:900;color:#6d7c45;letter-spacing:3px;font-family:'Courier New',Courier,monospace;">${password}</div>
        </div>
        <div style="background:#fffbeb;border-radius:10px;padding:15px;margin:0 0 30px;border-left:5px solid #f59e0b;">
            <p style="font-size:12px;color:#92400e;font-weight:600;margin:0;">🔒 Action Required: You will be asked to set a permanent password immediately upon your first sign-in.</p>
        </div>
        <div style="text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#6d7c45;color:#ffffff;padding:18px 45px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 10px 20px -5px rgba(109,124,69,0.3);">Login to Pawzzle</a>
        </div>
    `);

    const fromUser = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
    const mailOptions = {
        from: `"Pawzzle Management" <${fromUser}>`,
        to: email,
        subject: '🔐 Account Invitation: Pawzzle Staff Members',
        html: bodyHtml
    };

    // 1. Primary Attempt: Port 587 (STARTTLS) - Most reliable on Render/Cloud
    try {
        console.log(`[EmailService] Attempting delivery to ${email} via Port 587...`);
        const transporter = getTransporter(false);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Delivery SUCCESS via Port 587`);
        return info;
    } catch (err587) {
        console.warn(`[EmailService] Port 587 failed: ${err587.message}. Retrying via Port 465...`);
        
        // 2. Secondary Attempt: Port 465 (SSL)
        try {
            const transporter465 = getTransporter(true);
            const info = await transporter465.sendMail(mailOptions);
            console.log(`[EmailService] Delivery SUCCESS via Port 465`);
            return info;
        } catch (err465) {
            console.error(`[EmailService] SMTP delivery failed completely for ${email}`);
            
            // 3. Final Attempt: HTTP API (Resend) - Bypass all network port blocks
            if (process.env.RESEND_API_KEY) {
                try {
                    console.log(`[EmailService] Attempting HTTP delivery via Resend...`);
                    const response = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
                        },
                        body: JSON.stringify({
                            from: 'Pawzzle <hello@pawzzle.io>',
                            to: [email],
                            subject: mailOptions.subject,
                            html: mailOptions.html
                        })
                    });
                    if (response.ok) {
                        return await response.json();
                    }
                } catch (resendErr) {
                    console.error(`[EmailService] Resend API failed: ${resendErr.message}`);
                }
            }
            
            throw new Error(`Email delivery blocked. SMTP 587 error: ${err587.message}. SMTP 465 error: ${err465.message}`);
        }
    }
};

module.exports = {
    sendStaffInvitation
};

