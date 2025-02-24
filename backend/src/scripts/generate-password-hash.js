// backend/src/scripts/generate-password-hash.js
import bcrypt from 'bcryptjs';

const password = 'TOPSEACRET';
bcrypt.hash(password, 10).then(hash => {
  console.log('Password:', password);
  console.log('Hash:', hash);
});