// Run this locally to generate a password hash for your .env file:
//   node scripts/set-admin-password.js "your-new-password"
// Copy the printed hash into ADMIN_PASS_HASH in your .env (or Render env vars).

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.log('Usage: node scripts/set-admin-password.js "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nAdd this to your .env / Render environment variables:\n');
console.log(`ADMIN_PASS_HASH=${hash}\n`);
