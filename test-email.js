require('dotenv').config();
const { sendStaffInvitation } = require('./utils/emailService');

const testEmail = async () => {
    try {
        console.log('Attempting to send test email to pawzzle.spa@gmail.com...');
        await sendStaffInvitation('pawzzle.spa@gmail.com', 'test-password-123', 'Pawzzle');
        console.log('✅ Email sent successfully!');
    } catch (error) {
        console.error('❌ Failed to send email:', error);
    }
};

testEmail();
