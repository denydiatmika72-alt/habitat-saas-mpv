// ============================================================
// Test Script: POST /api/auth/register
// Jalankan dengan: node test-register.js
// (Pastikan server sudah running di terminal lain)
// ============================================================

const BASE_URL = '${process.env.NEXT_PUBLIC_API_URL}';

async function testRegister() {
  console.log('🧪 Menguji endpoint POST /api/auth/register...\n');

  const userData = {
    name: 'Test Promotor',
    email: 'test@nexevent.com',
    password: 'password123',
  };

  try {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();

    console.log(`📡 Status HTTP: ${response.status}`);
    console.log('📦 Response Body:');
    console.log(JSON.stringify(data, null, 2));

    if (response.status === 201) {
      console.log('\n✅ SUKSES! User berhasil didaftarkan ke database.');
      console.log(`   ID    : ${data.data?.id}`);
      console.log(`   Name  : ${data.data?.name}`);
      console.log(`   Email : ${data.data?.email}`);
      console.log(`   At    : ${data.data?.created_at}`);
    } else {
      console.log('\n❌ GAGAL:', data.message);
    }

  } catch (error) {
    console.error('\n💥 Error koneksi ke server:', error.message);
    console.error('Pastikan server sudah berjalan di port 5000!');
  }
}

testRegister();
