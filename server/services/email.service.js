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

const sendSponsorCredential = async ({ to, sponsorName, username, password, eventTitle }) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to,
      subject: `Akun Sponsor Anda Telah Disetujui — nexEvent`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
          <h2 style="color:#065f46">Selamat, ${sponsorName}!</h2>
          <p>Deal sponsor Anda${eventTitle ? ` untuk event <strong>${eventTitle}</strong>` : ''} telah <strong>disetujui</strong>.
          Gunakan kredensial berikut untuk masuk ke Sponsor Dashboard:</p>
          <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;margin:16px 0">
            <tr style="background:#f8fafc">
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:8px">Username</td>
              <td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:8px">${username}</td>
            </tr>
            <tr>
              <td style="border:1px solid #e2e8f0;font-weight:600;padding:8px">Password</td>
              <td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:8px">${password}</td>
            </tr>
          </table>
          <p>
            <a href="https://nexeventapp.tech/sponsor-dashboard"
               style="display:inline-block;background:#065f46;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
              Login ke Sponsor Dashboard
            </a>
          </p>
          <p style="color:#64748b;font-size:12px;margin-top:24px">
            Simpan email ini. Jika lupa password, hubungi promotor Anda.<br>
            Email ini dikirim otomatis oleh sistem nexEvent — nexeventapp.tech
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL] Kredensial sponsor terkirim ke ${to}`);
  } catch (error) {
    console.error('[EMAIL] Gagal kirim kredensial sponsor:', error.message);
  }
};

module.exports = { sendNewUserNotification, sendSponsorCredential };
