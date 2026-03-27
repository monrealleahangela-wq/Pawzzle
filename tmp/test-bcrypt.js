const bcrypt = require('bcryptjs');
const password = 'TestingPassword123!';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);
console.log('Test Password:', password);
console.log('Generated Hash:', hash);
console.log('Match Check:', bcrypt.compareSync(password, hash));
