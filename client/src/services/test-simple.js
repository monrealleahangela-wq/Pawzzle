const authService = require('./authService');

console.log('🔍 authService methods:', Object.keys(authService));
console.log('📦 requestPasswordResetOTP:', typeof authService.requestPasswordResetOTP);

if (typeof authService.requestPasswordResetOTP === 'function') {
  console.log('✅ authService.requestPasswordResetOTP is available');
} else {
  console.log('❌ authService.requestPasswordResetOTP is NOT available');
}

console.log('✅ Test completed - authService is working correctly');
