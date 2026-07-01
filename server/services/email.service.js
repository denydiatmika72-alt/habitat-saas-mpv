const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendNewUserNotification = async (user) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: process.env.ADMIN_EMAIL || 'denydiatmika72@gmail.com',
      subject: `Pendaftar baru menunggu approval — ${user.name}`,
      html: `
        <h2>Ada user baru yang mendaftar di nexEvent!</h2>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td><b>Nama</b></td><td>${user.name}</td></tr>
          <tr><td><b>Email</b></td><td>${user.email}</td></tr>
          <tr><td><b>No. WhatsApp</b></td><td>${user.phone || '-'}</td></tr>
          <tr><td><b>Waktu Daftar</b></td><td>${new Date().toLocaleString('id-ID')}</td></tr>
        </table>
        <br>
        <p>
          ${user.phone
            ? `<a href="https://wa.me/${user.phone.replace(/\D/g, '')}?text=Halo%20${encodeURIComponent(user.name)}%2C%20akun%20nexEvent%20kamu%20sudah%20aktif!">Aktifkan via WhatsApp</a>`
            : ''
          }
        </p>
        <p style="color:#6b7280;font-size:12px">Email ini dikirim otomatis oleh sistem nexEvent.</p>
      `,
    });
    console.log('[EMAIL] Notifikasi user baru terkirim ke admin');
  } catch (error) {
    console.error('[EMAIL] Gagal kirim notifikasi:', error.message);
  }
};

// Kirim ke PROMOTOR (bukan sponsor langsung) karena onboarding@resend.dev
// hanya bisa kirim ke email yang terdaftar di akun Resend — bukan email eksternal.
// Promotor yang meneruskan ke sponsor via WhatsApp/email pribadi.
const sendSponsorCredential = async ({ promotorEmail, sponsorName, sponsorEmail, username, password }) => {
  const loginUrl = 'https://nexeventapp.tech/login?role=sponsor';
  const waText = encodeURIComponent(
    `Halo ${sponsorName}, akun sponsor Anda di nexEvent telah disetujui!\n\nSilakan login di:\n${loginUrl}\n\nUsername: ${username}\nPassword: ${password}\n\nSimpan informasi ini dengan aman.`
  );
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: promotorEmail,
      subject: `Akun Sponsor ${sponsorName} Siap — Teruskan Kredensial`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
          <h2 style="color:#065f46;margin-bottom:4px">Akun Sponsor Berhasil Dibuat</h2>
          <p style="color:#64748b;margin-top:0">Berikut adalah kredensial login untuk sponsor <strong>${sponsorName}</strong>. Silakan teruskan ke mereka.</p>

          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0">
            <tr style="background:#f8fafc">
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px;width:130px">Nama Sponsor</td>
              <td style="border:1px solid #e2e8f0;padding:10px 14px">${sponsorName}</td>
            </tr>
            <tr>
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Email Sponsor</td>
              <td style="border:1px solid #e2e8f0;padding:10px 14px">${sponsorEmail || '-'}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Username</td>
              <td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:10px 14px">${username}</td>
            </tr>
            <tr>
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Password</td>
              <td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:10px 14px">${password}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Link Login</td>
              <td style="border:1px solid #e2e8f0;padding:10px 14px"><a href="${loginUrl}" style="color:#065f46">${loginUrl}</a></td>
            </tr>
          </table>

          <p style="margin-bottom:8px">Teruskan ke sponsor via:</p>
          <a href="https://wa.me/?text=${waText}"
             style="display:inline-block;background:#25d366;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">
            WhatsApp
          </a>
          <a href="mailto:${sponsorEmail}?subject=Akun%20Sponsor%20Anda%20Siap%20%E2%80%94%20nexEvent&body=Halo%20${encodeURIComponent(sponsorName)}%2C%0A%0ABerikut%20kredensial%20login%20sponsor%20dashboard%20Anda%3A%0A%0ALink%3A%20${encodeURIComponent(loginUrl)}%0AUsername%3A%20${encodeURIComponent(username)}%0APassword%3A%20${encodeURIComponent(password)}%0A%0ASimpan%20informasi%20ini%20dengan%20aman."
             style="display:inline-block;background:#065f46;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">
            Email ke Sponsor
          </a>

          <p style="color:#64748b;font-size:12px;margin-top:24px">
            Email ini dikirim ke akun promotor karena domain nexeventapp.tech belum diverifikasi di Resend.<br>
            Setelah domain diverifikasi, email akan langsung dikirim ke sponsor.
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL] Kredensial sponsor dikirim ke promotor ${promotorEmail} (untuk ${sponsorName})`);
  } catch (error) {
    console.error('[EMAIL] Gagal kirim kredensial sponsor:', error.message);
  }
};

module.exports = { sendNewUserNotification, sendSponsorCredential };
