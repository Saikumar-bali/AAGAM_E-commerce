const axios = require('axios');
const crypto = require('crypto');

const API_URL = process.env.API_URL || 'http://localhost:3005';

const adminEmail = process.env.ADMIN_EMAIL || 'admin@aagam.com';
const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();
const adminName = process.env.ADMIN_NAME || 'Aagam Admin';

function generateSecurePassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

async function createAdmin() {
  console.log(`Attempting to connect to ${API_URL}/auth/signup...`);
  console.log(`Using admin email: ${adminEmail}`);
  
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Auto-generated secure password: ${adminPassword}`);
    console.log('💡 Set ADMIN_PASSWORD env var to use a custom password');
  }

  try {
    const response = await axios.post(`${API_URL}/auth/signup`, {
      email: adminEmail,
      password: adminPassword,
      name: adminName,
      role: 'ADMIN'
    }, { timeout: 5000 });
    console.log('✅ Admin user created successfully!');
  } catch (error) {
    console.error('❌ Request failed.');
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Could not connect to the server. Is the backend running?');
    } else {
      console.error('❌ Detail:', error.message);
    }
  }
}

createAdmin();