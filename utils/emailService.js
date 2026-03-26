const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendStaffInvitation = async (email, password, firstName) => {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/login`;
    
    const mailOptions = {
        from: `"Pawzzle Admin" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to the Team! Your Staff Account is Ready',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                <h2 style="color: #4f46e5; text-align: center;">Welcome to Pawzzle, ${firstName}!</h2>
                <p>An administrator has created a staff account for you. Below are your login credentials:</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${password}</code></p>
                </div>
                <p style="color: #ef4444; font-weight: bold;">Note: You will be required to change this password immediately upon your first login for security purposes.</p>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${loginUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log In to Your Account</a>
                </div>
                <hr style="margin: 40px 0; border: 0; border-top: 1px solid #e2e8f0;" />
                <p style="font-size: 12px; color: #64748b; text-align: center;">If you did not expect this invitation, please ignore this email.</p>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
};

module.exports = {
    sendStaffInvitation
};
