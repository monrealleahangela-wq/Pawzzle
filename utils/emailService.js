const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const dns = require('dns');

// CRITICAL: Ensure DNS resolution works on Render's restricted network
try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
    console.warn('[EmailService] DNS override failed (expected on some systems)');
}

/**
 * Robust Transporter Factory
 * Switches between ports 587 and 465 with aggressive timeouts
 */
const getTransporter = async (useAlternativePort = false) => {
    // Aggressively check for valid credentials
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!user || !user.includes('@') || !pass) {
        throw new Error('SMTP credentials are not configured');
    }

    // Manual IPv4 resolution
    let smtpHost = 'smtp.gmail.com';
    try {
        const { address } = await dns.promises.lookup('smtp.gmail.com', { family: 4 });
        smtpHost = address;
    } catch (e) {
        console.warn('[EmailService] DNS lookup failed:', e.message);
    }

    const port = useAlternativePort ? 465 : 587;
    const secure = useAlternativePort;

    return nodemailer.createTransport({
        host: smtpHost,
        port: port,
        secure: secure,
        auth: { user, pass },
        connectionTimeout: 8000, 
        greetingTimeout: 8000,
        socketTimeout: 10000,
        tls: {
            rejectUnauthorized: true,
            servername: 'smtp.gmail.com',
            minVersion: 'TLSv1.2'
        }
    });
};

const wrapInTemplate = (title, body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <div style="max-width:600px;margin:20px auto;background:#ffffff;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
    <div style="background-color:#9db16b;padding:60px 20px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:38px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">PAWZZLE</h1>
      <p style="margin:15px 0 0;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:5px;text-transform:uppercase;opacity:0.9;">${title}</p>
    </div>
    <div style="padding:50px 40px;text-align:center;">${body}</div>
    <div style="padding:20px;background:#f9f9f9;text-align:center;border-top:1px solid #eeeeee;">
      <p style="margin:0;color:#999999;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Pawzzle • Professional Pet Management Platform</p>
    </div>
  </div>
</body>
</html>
`;

const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const deliverHtmlEmail = async ({ email, subject, html }) => {
    const fromUser = process.env.EMAIL_USER;
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    if (resend && process.env.RESEND_FROM_EMAIL) {
        try {
            const data = await resend.emails.send({
                from: `Pawzzle <${process.env.RESEND_FROM_EMAIL}>`,
                to: email,
                subject,
                html
            });
            return { success: true, provider: 'resend', id: data.id };
        } catch (error) {
            console.warn('[EmailService] Resend delivery failed; trying SMTP:', error.message);
        }
    }
    for (const alternativePort of [false, true]) {
        try {
            const transporter = await getTransporter(alternativePort);
            await transporter.sendMail({ from: `"Pawzzle Support" <${fromUser}>`, to: email, subject, html });
            return { success: true, provider: 'smtp' };
        } catch (error) {
            if (alternativePort) return { success: false, errorMessage: error.message };
        }
    }
    return { success: false, errorMessage: 'Email delivery failed.' };
};

const sendSupplierInvitation = async ({ email, temporaryPassword, contactPerson, businessName, activationToken }) => {
    const clientUrl = process.env.CLIENT_URL || 'https://pawzzle.io';
    const activationUrl = `${clientUrl}/supplier/activate/${encodeURIComponent(activationToken)}`;
    const html = wrapInTemplate('Supplier Invitation', `
        <h2 style="font-size:20px;color:#333333;margin:0 0 20px;font-weight:bold;">Welcome, ${escapeHtml(contactPerson)}!</h2>
        <p style="font-size:14px;color:#666666;line-height:1.6;">${escapeHtml(businessName)} was invited as a supplier by a Pawzzle store. Activate this invitation before signing in.</p>
        <p style="margin:28px 0;"><a href="${activationUrl}" style="display:inline-block;padding:13px 28px;background:#9db16b;color:#fff;text-decoration:none;font-weight:bold;border-radius:8px;">Activate supplier account</a></p>
        <div style="background:#f8f9fa;border-radius:12px;padding:24px;margin:0 auto 20px;max-width:440px;">
          <p style="margin:0 0 8px;color:#777;font-size:11px;">Temporary password</p>
          <div style="font-size:24px;font-weight:bold;color:#59663b;letter-spacing:1px;font-family:monospace;">${escapeHtml(temporaryPassword)}</div>
        </div>
        <p style="font-size:12px;color:#777;line-height:1.5;">This activation link expires in 48 hours and works once. After activation, sign in with this email and temporary password. Pawzzle will require you to choose a private password before using the supplier portal.</p>
    `);
    return deliverHtmlEmail({ email, subject: 'Activate your Pawzzle supplier account', html });
};

const sendSupplierApplicationUpdate = async ({ email, contactPerson, businessName, status, reason }) => {
    const safeStatus = escapeHtml(String(status || '').replace(/_/g, ' '));
    const html = wrapInTemplate('Supplier Application', `
      <h2 style="font-size:20px;color:#333;margin:0 0 18px;">Hello, ${escapeHtml(contactPerson)}</h2>
      <p style="font-size:14px;color:#666;line-height:1.6;">The supplier application for <strong>${escapeHtml(businessName)}</strong> is now <strong>${safeStatus}</strong>.</p>
      ${reason ? `<div style="margin:20px 0;padding:16px;background:#f8f4ee;border-radius:10px;color:#5d4638;font-size:13px;">Reviewer feedback: ${escapeHtml(reason)}</div>` : ''}
      <p style="font-size:12px;color:#777;">Sign in to Pawzzle to review the current status and any required next step.</p>
    `);
    return deliverHtmlEmail({ email, subject: `Pawzzle supplier application: ${String(status).replace(/_/g, ' ')}`, html });
};

const sendStaffInvitation = async (email, password, firstName) => {
    const loginUrl = `${process.env.CLIENT_URL || 'https://pawzzle.io'}/login`;
    
    const bodyHtml = wrapInTemplate('Team Invitation', `
        <h2 style="font-size:20px;color:#333333;margin:0 0 20px;font-weight:bold;">Welcome, ${firstName}!</h2>
        <p style="font-size:14px;color:#666666;margin:0 0 30px;line-height:1.6;max-width:400px;margin-left:auto;margin-right:auto;">
            You have been added as a staff member on the Pawzzle platform. Use the credentials below to access your professional dashboard:
        </p>
        <div style="background:#f8f9fa;border-radius:12px;padding:40px 20px;text-align:center;margin:0 auto 30px;max-width:440px;">
            <p style="margin:0 0 15px;color:#999999;font-size:9px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Account Password</p>
            <div style="font-size:32px;font-weight:bold;color:#9db16b;letter-spacing:2px;font-family:monospace;">${password}</div>
        </div>
        <div style="margin-top:20px;">
            <a href="${loginUrl}" style="display:inline-block;padding:12px 30px;color:#9db16b;text-decoration:none;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;border:1px solid #9db16b;border-radius:4px;">Access Dashboard</a>
        </div>
    `);

    const fromUser = process.env.EMAIL_USER;

    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

    // STAGE 1: Try Resend (Highest Reliability)
    if (resend) {
        try {
            const fromEmail = process.env.RESEND_FROM_EMAIL;
            
            // Only use Resend if we have a verified 'from' address. 
            // The default 'onboarding@resend.dev' only sends to the account owner, 
            // which is NOT what we want for "real" staff emails.
            if (fromEmail) {
                console.log(`🔄 [EmailService] Attempting Resend API for ${email} (From: ${fromEmail})...`);
                const data = await resend.emails.send({
                    from: `Pawzzle <${fromEmail}>`,
                    to: email,
                    subject: '🐾 Welcome to the Pawzzle Team!',
                    html: bodyHtml
                });
                console.log('✅ [EmailService] Resend API Success:', data.id);
                return { success: true, provider: 'resend' };
            } else {
                console.log('ℹ️ [EmailService] Custom Resend From-Email not found. Skipping to SMTP for real delivery.');
            }
        } catch (resendErr) {
            console.error('⚠️ [EmailService] Resend API failed:', resendErr.message);
        }
    } else {
        console.log('ℹ️ [EmailService] Resend API Key not found, skipping to SMTP.');
    }

    // STAGE 2: Try SMTP (587)
    try {
        console.log(`🔄 [EmailService] Attempting SMTP (587) for ${email}...`);
        const transporter = await getTransporter(false);
        await transporter.sendMail({
            from: `"Pawzzle Support" <${fromUser}>`,
            to: email,
            subject: '🐾 Welcome to the Pawzzle Team!',
            html: bodyHtml
        });
        console.log('✅ [EmailService] SMTP (465) Success');
        return { success: true, provider: 'smtp' };
    } catch (e) {
        console.warn(`⚠️ [EmailService] SMTP (587) Failed: ${e.message}. Trying 465...`);
        // STAGE 3: Try SMTP (465)
        try {
            console.log(`🔄 [EmailService] Attempting SMTP (465) for ${email}...`);
            const transporter = await getTransporter(true);
            await transporter.sendMail({
                from: `"Pawzzle Support" <${fromUser}>`,
                to: email,
                subject: '🐾 Welcome to the Pawzzle Team!',
                html: bodyHtml
            });
            console.log('✅ [EmailService] SMTP (465) Success');
            return { success: true, provider: 'smtp' };
        } catch (e2) {
            console.error('❌ [EmailService] ALL delivery methods failed.');
            return { 
                success: false, 
                errorMessage: e2.message || 'All delivery methods failed',
                resendActive: !!resend 
            };
        }
    }
};

module.exports = {
    sendStaffInvitation,
    sendSupplierInvitation,
    sendSupplierApplicationUpdate
};
