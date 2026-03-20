const { promisify } = require('util');

// Enhanced DNS Resolver with Public Fallbacks (Google/Cloudflare)
const dnsResolver = new (require('dns').promises.Resolver)();
dnsResolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

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

    // 3. Check DNS MX records — verify the domain can actually receive email
    try {
        // Use specific resolver to bypass potentially broken local DNS settings
        const mxRecords = await dnsResolver.resolveMx(domain).catch(async (err) => {
            // If connectivity is the issue, try A record fallback
            if (['ECONNREFUSED', 'ETIMEOUT', 'ENOTFOUND'].includes(err.code)) {
                const aRecords = await dnsResolver.resolve4(domain).catch(() => []);
                return aRecords.length > 0 ? [{ exchange: domain, priority: 0 }] : [];
            }
            throw err; // Re-throw true resolution errors
        });

        if (!mxRecords || mxRecords.length === 0) {
            return { valid: false, reason: `The email domain "${domain}" does not appear to accept emails. Please use a valid email address.` };
        }

        return { valid: true };
    } catch (error) {
        // DNS lookup failed definitive — domain likely doesn't exist
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA' || error.code === 'SERVFAIL') {
            return { valid: false, reason: `The email domain "${domain}" does not exist. Please use a valid email address.` };
        }

        // For other network errors, allow through (don't block users due to DNS issues)
        console.warn('⚠️ DNS lookup warning for domain:', domain, error.code);
        return { valid: true };
    }
};

module.exports = { validateEmail, DISPOSABLE_DOMAINS };
