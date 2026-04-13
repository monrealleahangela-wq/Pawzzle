const nodemailer = require('nodemailer');
const dns = require('dns');

// CRITICAL: Ensure DNS resolution works on Render's restricted network
try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
    console.warn('[EmailService] DNS override failed (expected on some systems)');
}

/**
 * Robust Transporter Factory
 * Switches to 'service: gmail' as it's the most reliable way to connect to Google SMTP on cloud hosts.
 */
const getTransporter = async () => {
    // Aggressively check for valid credentials
    const user = (process.env.EMAIL_USER && process.env.EMAIL_USER.includes('@')) 
        ? process.env.EMAIL_USER 
        : 'pawzzle.spark@gmail.com';
        
    const pass = (process.env.EMAIL_PASS && process.env.EMAIL_PASS.length > 5) 
        ? process.env.EMAIL_PASS 
        : 'aknzqkqqdumntchq';

    console.log(`[EmailService] Creating transporter for: ${user}`);

    // Manual IPv4 resolution to bypass protocol errors (ENETUNREACH/BIND)
    let smtpHost = 'smtp.gmail.com';
    try {
        const { address } = await dns.promises.lookup('smtp.gmail.com', { family: 4 });
        smtpHost = address;
    } catch (e) {
        console.warn('[EmailService] DNS lookup failed:', e.message);
    }

    return nodemailer.createTransport({
        host: smtpHost,
        port: 465,
        secure: true,
        auth: {
            user: user,
            pass: pass
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        tls: {
            rejectUnauthorized: false,
            servername: 'smtp.gmail.com'
        }
    });
};

const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 15px 35px rgba(0,0,0,0.05);border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#6d7c45 0%,#8fa75a 100%);padding:50px 20px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:34px;font-weight:900;letter-spacing:-1.5px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:10px 0 0;color:rgba(255,255,255,0.8);font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="padding:45px 40px;">${body}</div>
    <div style="padding:30px;background:#f3f4f6;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Auto-Generated Message • Pawzzle Pet Platform</p>
      <p style="margin:5px 0 0;color:#9ca3af;font-size:10px;">© ${new Date().getFullYear()} Pawzzle. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const sendStaffInvitation = async (email, password, firstName) => {
    const loginUrl = `${process.env.CLIENT_URL || 'https://pawzzle.io'}/login`;
    
    const bodyHtml = wrapInTemplate('Team Access Granted', `
        <h2 style="font-size:20px;color:#111827;margin:0 0 15px;font-weight:800;">Welcome, ${firstName}!</h2>
        <p style="font-size:15px;color:#374151;margin:0 0 25px;line-height:1.7;">
            You have been officially enrolled as a staff member on the Pawzzle platform. Use the following temporary password to log in and set up your profile:
        </p>
        <div style="background:#f9fafb;border:2px dashed #6d7c45;border-radius:16px;padding:35px;text-align:center;margin:0 0 30px;">
            <p style="margin:0 0 10px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;">Account Activation Password</p>
            <div style="font-size:40px;font-weight:900;color:#6d7c45;letter-spacing:3px;font-family:'Courier New', Courier, monospace;">${password}</div>
        </div>
        <div style="background:#fff7ed;border-radius:12px;padding:20px;margin:0 0 35px;border-left:5px solid #f97316;">
            <p style="font-size:13px;color:#9a3412;font-weight:600;margin:0;">⚠ Safety Protocol: For your security, you will be required to change this password immediately after your first sign-in.</p>
        </div>
        <div style="text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#6d7c45;color:#ffffff;padding:20px 55px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 12px 24px -6px rgba(109,124,69,0.35);">Log In Now</a>
        </div>
    `);

    const fromUser = (process.env.EMAIL_USER && process.env.EMAIL_USER.includes('@')) 
        ? process.env.EMAIL_USER 
        : 'pawzzle.spark@gmail.com';

    const mailOptions = {
        from: `"Pawzzle Support" <${fromUser}>`,
        to: email,
        subject: '🔐 Welcome! Your Pawzzle Staff Account is Ready',
        html: bodyHtml
    };

    try {
        console.log(`[EmailService] Attempting delivery via Gmail Service to: ${email}...`);
        const transporter = await getTransporter();
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] ✅ SUCCESS! Email delivered to ${email}`);
        return info;
    } catch (smtpErr) {
        console.error(`[EmailService] ❌ GMAIL SMTP FAILED:`, smtpErr.message);
        
        // Final fallback: Resend API (HTTP Bypass)
        if (process.env.RESEND_API_KEY) {
            try {
                console.log(`[EmailService] Final attempt via Resend API...`);
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
                if (response.ok) return await response.json();
            } catch (resendErr) {
                console.error(`[EmailService] ❌ ALL METHODS EXHAUSTED.`);
            }
        }
        
        throw new Error(`Email delivery system failed (SMTP Error: ${smtpErr.message})`);
    }
};

module.exports = {
    sendStaffInvitation
};

