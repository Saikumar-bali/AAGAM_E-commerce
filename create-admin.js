const axios = require('axios');

console.log('Attempting to connect to http://localhost:3000/auth/signup...');

async function createAdmin() {
  try {
    const response = await axios.post('http://localhost:3000/auth/signup', {
      email: 'admin@aagam.com',
      password: 'adminPassword123',
      name: 'Aagam Admin',
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
