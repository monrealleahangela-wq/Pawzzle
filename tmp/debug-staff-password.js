const crypto = require('crypto');
function genTempPass() {
    return crypto.randomBytes(8).toString('hex');
}
const pass = genTempPass();
console.log('DEBUG_GENERATED_PASS:', pass);
console.log('ENCRYPTING FOR DB STORE...');
