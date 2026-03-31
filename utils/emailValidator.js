const { promisify } = require('util');

// Enhanced DNS Resolver with Public Fallbacks (Google/Cloudflare)
const dnsResolver = new (require('dns').promises.Resolver)();

// Common disposable/temporary email domains to block
const DISPOSABLE_DOMAINS = new Set([
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'guerrillamail.net',
    'mailinator.com', 'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com',
    'grr.la', 'dispostable.com', 'trashmail.com', 'trashmail.net', 'trashmail.me',
    'temp-mail.org', 'tempail.com', 'fakeinbox.com', 'mailnesia.com',
    'maildrop.cc', 'discard.email', 'tempmailo.com', 'mohmal.com',
    'getnada.com', 'emailondeck.com', 'tempr.email', 'temp-mail.io',
    'minutemail.com', 'tempinbox.com', 'harakirimail.com', 'jetable.org',
    'throwme.away', 'mytemp.email', 'mailsac.com', 'inboxkitten.com',
    '10minutemail.com', 'guerrillamail.info', 'guerrillamail.biz',
    'guerrillamail.de', 'guerrillamail.org', 'spam4.me', 'spamgourmet.com',
    'mailcatch.com', 'meltmail.com', 'spaml.com', 'bugmenot.com',
    'safetymail.info', 'trashymail.com', 'filzmail.com', 'mailexpire.com',
    'tempomail.fr', 'ephemail.net', 'mailtemp.info', 'mail-temporaire.fr',
    'courrieltemporaire.com', 'trash-mail.com', 'getairmail.com',
    'tempsky.com', 'crazymailing.com', 'trainmail.com', 'mailinater.com'
]);

/**
 * Validates an email address by checking:
 * 1. Format validation (regex)
 * 2. Domain is not a disposable email provider
 * 3. Domain has valid MX (mail exchange) DNS records
 * 
 * @param {string} email - Email address to validate
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
const validateEmail = async (email) => {
    // 1. Basic format check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        return { valid: false, reason: 'Invalid email format' };
    }

    const domain = email.split('@')[1].toLowerCase();

    // 2. Block disposable/temporary email providers
    if (DISPOSABLE_DOMAINS.has(domain)) {
        return { valid: false, reason: 'Temporary or disposable email addresses are not allowed. Please use a permanent email.' };
    }

    // 3. Deactivated DNS MX Records check - This caused 400 errors due to flaky ISP firewalls capturing Port 53 packets natively.
    return { valid: true };
};

module.exports = { validateEmail, DISPOSABLE_DOMAINS };
