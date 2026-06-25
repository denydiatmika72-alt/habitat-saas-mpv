// ============================================================
// Test Script: POST /api/auth/login
// Jalankan dengan: node test-login.js
// (Pastikan server sudah running di terminal lain)
// ============================================================

const BASE_URL = '${process.env.NEXT_PUBLIC_API_URL}';

async function testLogin() {
  console.log('🧪 Menguji endpoint POST /api/auth/login...\n');

  // --- Test 1: Login dengan kredensial VALID ---
  console.log('📋 Test 1: Login dengan kredensial yang benar');
  await sendLoginRequest({
    email: 'test@nexevent.com',
    password: 'password123',
  });

  console.log('\n' + '─'.repeat(50) + '\n');

  // --- Test 2: Login dengan PASSWORD SALAH ---
  console.log('📋 Test 2: Login dengan password yang salah');
  await sendLoginRequest({
    email: 'test@nexevent.com',
    password: 'wrongpassword',
  });

  console.log('\n' + '─'.repeat(50) + '\n');

  // --- Test 3: Login dengan EMAIL TIDAK TERDAFTAR ---
  console.log('📋 Test 3: Login dengan email tidak terdaftar');
  await sendLoginRequest({
    email: 'notfound@nexevent.com',
    password: 'password123',
  });
}

async function sendLoginRequest(credentials) {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    console.log(`📡 Status HTTP : ${response.status}`);
    console.log(`📦 Response    : ${JSON.stringify(data, null, 2)}`);

    if (response.status === 200 && data.token) {
      console.log('\n✅ LOGIN BERHASIL!');
      console.log(`   User  : ${data.data?.name} (${data.data?.email})`);
      console.log(`   Token : ${data.token.substring(0, 40)}...`);

      // Decode JWT header & payload (tanpa verifikasi)
      const [header, payload] = data.token.split('.').slice(0, 2);
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());
      console.log('\n🔑 JWT Payload (decoded):');
      console.log(`   id    : ${decodedPayload.id}`);
      console.log(`   email : ${decodedPayload.email}`);
      console.log(`   exp   : ${new Date(decodedPayload.exp * 1000).toLocaleString('id-ID')}`);
    } else {
      console.log(`\n❌ LOGIN DITOLAK: ${data.message}`);
    }
  } catch (error) {
    console.error('💥 Error koneksi:', error.message);
  }
}

testLogin();
