const nodemailer = require('nodemailer');

// Reuse robust transporter setup for better reliability on cloud hosts
const createTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER || 'pawzzle.spark@gmail.com',
            pass: process.env.EMAIL_PASS || 'aknzqkqqdumntchq'
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        tls: {
            rejectUnauthorized: false
        }
    });
};


const transporter = createTransporter();

// Verify connection on startup
transporter.verify((error) => {
    if (error) {
        console.error('[EmailService] SMTP Error:', error.message);
    } else {
        console.log('[EmailService] SMTP Server Connected Successfully');
    }
});

const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:36px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="padding:36px 32px;">${body}</div>
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;">Automated Message from Pawzzle Staff Management</p>
      <p style="margin:4px 0 0;color:#cbd5e1;font-size:10px;">© ${new Date().getFullYear()} Pawzzle. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const sendStaffInvitation = async (email, password, firstName) => {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/login`;
    
    const bodyHtml = wrapInTemplate('Team Invitation', `
        <p style="font-size:15px;color:#334155;margin:0 0 8px;font-weight:600;">Welcome to the Team, ${firstName}!</p>
        <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6;">
            Your administrator has created a staff profile for you on the Pawzzle platform. Below are your secure login credentials:
        </p>
        <div style="background:#f1f5f9;border-radius:16px;padding:24px;text-align:center;margin:0 0 24px;">
            <p style="margin:0 0 8px;color:#94a3b8;font-size:9px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Temporary Password</p>
            <div style="font-size:32px;font-weight:900;color:#4f46e5;letter-spacing:2px;font-family:monospace;">${password}</div>
        </div>
        <p style="font-size:12px;color:#ef4444;font-weight:bold;margin:0 0 24px;text-align:center;">
            Security Notice: A password change is MANDATORY upon first login.
        </p>
        <div style="text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:16px 32px;border-radius:12px;text-decoration:none;font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 10px 15px -3px rgba(79,70,229,0.3);">Initialize Account</a>
        </div>
    `);

    const fromUser = process.env.EMAIL_USER || 'pawzzle.spark@gmail.com';
    const mailOptions = {
        from: `"Pawzzle Staff Management" <${fromUser}>`,
        to: email,
        subject: '🔐 Welcome to Pawzzle! Your Staff Account Access Details',
        html: bodyHtml
    };

    try {
        console.log(`[EmailService] Inviting staff: ${email}...`);
        
        // Use Resend as primary fallback if configured (bypasses Render's port blocks)
        if (process.env.RESEND_API_KEY) {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
                },
                body: JSON.stringify({
                    from: `Pawzzle Staff <hello@pawzzle.io>`, // Required Resend domain format
                    to: [email],
                    subject: mailOptions.subject,
                    html: mailOptions.html
                })
            });
            if (response.ok) {
                console.log(`[EmailService] SUCCESS: Invitation sent to ${email} via RESEND`);
                return await response.json();
            }
        }
        
        // Standard SMTP if Resend is missing
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] SUCCESS: Invitation sent to ${email} via SMTP`);
        return info;
    } catch (err) {
        console.error(`[EmailService] FAILED to send to ${email}:`, err.message);
        throw err;
    }
};

module.exports = {
    sendStaffInvitation
};
