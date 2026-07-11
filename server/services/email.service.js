const { Resend } = require('resend');
const QRCode = require('qrcode');
const prisma = require('../src/lib/prisma');
const resend = new Resend(process.env.RESEND_API_KEY);

const IDR = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

const sendNewUserNotification = async (user) => {
  try {
    await resend.emails.send({
      from: 'nexEvent <noreply@nexeventapp.tech>',
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

// Kirim ke KEDUANYA: promotor (untuk arsip) dan sponsor (kredensial asli mereka).
// Domain nexeventapp.tech sudah diverifikasi di Resend — keduanya deliver normal.
const sendSponsorCredential = async ({ promotorEmail, sponsorName, sponsorEmail, username, password }) => {
  const loginUrl = 'https://nexeventapp.tech/login?role=sponsor';
  const waText = encodeURIComponent(
    `Halo ${sponsorName}, akun sponsor Anda di nexEvent telah disetujui!\n\nSilakan login di:\n${loginUrl}\n\nUsername: ${username}\nPassword: ${password}\n\nSimpan informasi ini dengan aman.`
  );

  const promotorHtml = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h2 style="color:#065f46;margin-bottom:4px">Akun Sponsor Berhasil Dibuat</h2>
      <p style="color:#64748b;margin-top:0">Kredensial login untuk sponsor <strong>${sponsorName}</strong>. Silakan teruskan ke mereka.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin:16px 0">
        <tr style="background:#f8fafc"><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px;width:130px">Nama Sponsor</td><td style="border:1px solid #e2e8f0;padding:10px 14px">${sponsorName}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Email Sponsor</td><td style="border:1px solid #e2e8f0;padding:10px 14px">${sponsorEmail || '-'}</td></tr>
        <tr style="background:#f8fafc"><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Username</td><td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:10px 14px">${username}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Password</td><td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:10px 14px">${password}</td></tr>
        <tr style="background:#f8fafc"><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Link Login</td><td style="border:1px solid #e2e8f0;padding:10px 14px"><a href="${loginUrl}" style="color:#065f46">${loginUrl}</a></td></tr>
      </table>
      <p style="margin-bottom:8px">Teruskan ke sponsor via:</p>
      <a href="https://wa.me/?text=${waText}" style="display:inline-block;background:#25d366;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">WhatsApp</a>
      <a href="mailto:${sponsorEmail}?subject=Akun%20Sponsor%20Anda%20Siap%20%E2%80%94%20nexEvent&body=Halo%20${encodeURIComponent(sponsorName)}%2C%0A%0ABerikut%20kredensial%20login%3A%0ALink%3A%20${encodeURIComponent(loginUrl)}%0AUsername%3A%20${encodeURIComponent(username)}%0APassword%3A%20${encodeURIComponent(password)}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Email ke Sponsor</a>
      <p style="color:#64748b;font-size:12px;margin-top:24px">Email ini juga dikirim langsung ke sponsor.</p>
    </div>
  `;

  const sponsorHtml = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <h2 style="color:#065f46">Selamat, ${sponsorName}!</h2>
      <p>Akun sponsor Anda di <strong>nexEvent</strong> sudah aktif. Gunakan kredensial berikut untuk login:</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;margin:16px 0">
        <tr style="background:#f8fafc"><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Username</td><td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:10px 14px">${username}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;font-weight:600;padding:10px 14px">Password</td><td style="border:1px solid #e2e8f0;font-family:monospace;font-size:15px;padding:10px 14px">${password}</td></tr>
      </table>
      <a href="${loginUrl}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Login Sekarang</a>
      <p style="color:#64748b;font-size:12px;margin-top:24px">Simpan email ini. Jika lupa password, hubungi event organizer Anda.<br>Email otomatis dari nexEvent — nexeventapp.tech</p>
    </div>
  `;

  const results = await Promise.allSettled([
    resend.emails.send({ from: 'nexEvent <noreply@nexeventapp.tech>', to: [promotorEmail], subject: `Kredensial Sponsor ${sponsorName} Berhasil Dibuat`, html: promotorHtml }),
    resend.emails.send({ from: 'nexEvent <noreply@nexeventapp.tech>', to: [sponsorEmail], subject: 'Akun Sponsor nexEvent Anda Sudah Aktif', html: sponsorHtml }),
  ]);

  console.log(`[EMAIL] Promotor (${promotorEmail}): ${results[0].status}${results[0].status === 'rejected' ? ' — ' + results[0].reason?.message : ''}`);
  console.log(`[EMAIL] Sponsor (${sponsorEmail}): ${results[1].status}${results[1].status === 'rejected' ? ' — ' + results[1].reason?.message : ''}`);
};

const sendProExpiryReminder = async (user, daysLeft) => {
  try {
    await resend.emails.send({
      from: 'nexEvent <noreply@nexeventapp.tech>',
      to: user.email,
      subject: `Lisensi Pro nexEvent kamu berakhir dalam ${daysLeft} hari`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
          <h2 style="color:#065f46">Lisensi Pro kamu segera berakhir</h2>
          <p>Halo ${user.name}, lisensi Pro nexEvent kamu untuk event ini akan berakhir dalam <strong>${daysLeft} hari</strong> (${new Date(user.proExpiresAt).toLocaleDateString('id-ID')}).</p>
          <p>Perpanjang sekarang agar fitur Pro (Sponsor Magic Link, Expense Tracker, Field Crew, Laporan P&L, dll) tetap aktif.</p>
          <a href="https://nexeventapp.tech/dashboard/upgrade" style="display:inline-block;background:#065f46;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px">Perpanjang Sekarang</a>
          <p style="color:#64748b;font-size:12px;margin-top:24px">Email otomatis dari nexEvent — nexeventapp.tech</p>
        </div>
      `,
    });
    console.log(`[EMAIL] Reminder expiry Pro terkirim ke ${user.email}`);
  } catch (error) {
    console.error('[EMAIL] Gagal kirim reminder expiry Pro:', error.message);
  }
};

// Email konfirmasi pesanan storefront — handle 3 tipe: tiket, merch, bundling.
// order: TicketOrder lengkap dengan { event, items(+ticketType), merchItems(+item,+variant) }.
const sendOrderEmail = async (order) => {
  try {
    const eventTitle = order.event?.title || 'Event';
    let bodyHTML = '';

    // ===== Bagian E-Ticket (kalau ada) =====
    // Tiket bisa dari pembelian langsung (orderItem) ATAU dari tiket di dalam paket (bundleOrderItem).
    {
      const tickets = await prisma.ticket.findMany({
        where: {
          OR: [
            { orderItem: { orderId: order.id } },
            { bundleOrderItem: { orderId: order.id } },
          ],
        },
        include: { orderItem: { include: { ticketType: true } }, ticketType: true },
      });

      if (tickets.length > 0) {
        const ticketHTML = await Promise.all(
          tickets.map(async (ticket) => {
            const qrDataUrl = await QRCode.toDataURL(ticket.ticketCode, { width: 200 });
            const typeName = ticket.orderItem?.ticketType?.name || ticket.ticketType?.name || 'Tiket';
            return `
              <div style="border:1px solid #e2e8f0; padding:16px; margin:16px 0; border-radius:8px;">
                <h3 style="margin:0 0 8px;color:#065f46">${typeName}</h3>
                <p style="margin:0 0 8px">Kode: <strong style="font-family:monospace">${ticket.ticketCode}</strong></p>
                <img src="${qrDataUrl}" alt="QR Code" width="200" height="200" />
                <p style="font-size:12px;color:#64748b;margin-top:8px">Tunjukkan QR code ini saat masuk venue.</p>
              </div>
            `;
          })
        );
        bodyHTML += `<h2 style="color:#065f46;font-size:18px;margin-top:24px">E-Ticket Anda</h2>${ticketHTML.join('')}`;
      }
    }

    // ===== Bagian Merchandise (kalau ada) =====
    if (order.merchItems && order.merchItems.length > 0) {
      const pickupBarcode = await QRCode.toDataURL(`MERCH-${order.orderId}`, { width: 200 });
      const merchLines = order.merchItems
        .map(
          (m) =>
            `<p style="margin:4px 0">• ${m.item?.name || 'Produk'} (${m.variant?.size || '-'}) × ${m.quantity} — ${IDR(m.price * m.quantity)}</p>`
        )
        .join('');

      bodyHTML += `
        <h2 style="color:#065f46;font-size:18px;margin-top:24px">Merchandise Anda</h2>
        <div style="border:1px solid #e2e8f0; padding:16px; margin:16px 0; border-radius:8px;">
          <h3 style="margin:0 0 8px;color:#0f172a">Invoice Pickup Merchandise</h3>
          <p style="margin:0 0 8px">Order ID: <strong style="font-family:monospace">${order.orderId}</strong></p>
          ${merchLines}
          <p style="margin:8px 0"><strong>Total pesanan: ${IDR(order.totalAmount)}</strong></p>
          <img src="${pickupBarcode}" alt="Barcode Pickup" width="200" height="200" />
          <p style="font-size:12px;color:#64748b;margin-top:8px">Tunjukkan barcode ini saat pengambilan merchandise di venue.</p>
        </div>
      `;
    }

    // ===== Bagian Paket Spesial / Bundling (kalau ada) =====
    if (order.bundleItems && order.bundleItems.length > 0) {
      bodyHTML += `<h2 style="color:#065f46;font-size:18px;margin-top:24px">Paket Spesial Anda</h2>`;
      for (const bundleOrder of order.bundleItems) {
        const bundle = bundleOrder.bundle;
        const selections = Array.isArray(bundleOrder.merchSelections) ? bundleOrder.merchSelections : [];

        // Resolve isi paket + size yang dipilih pembeli (untuk merch).
        const itemLines = [];
        let hasMerch = false;
        for (const item of bundle.items) {
          if (item.itemType === 'ticket') {
            const tt = await prisma.ticketType.findUnique({ where: { id: item.ticketTypeId } });
            itemLines.push(`<li>${item.quantity}× Tiket ${tt?.name || 'Tiket'}</li>`);
          } else {
            hasMerch = true;
            const merchItem = await prisma.merchItem.findUnique({ where: { id: item.merchItemId } });
            const selection = selections.find((s) => s.merchItemId === item.merchItemId);
            let sizeLabel = '';
            if (selection?.variantId) {
              const variant = await prisma.merchVariant.findUnique({ where: { id: selection.variantId } });
              sizeLabel = variant ? ` (${variant.size})` : '';
            }
            itemLines.push(`<li>${item.quantity}× ${merchItem?.name || 'Merchandise'}${sizeLabel}</li>`);
          }
        }

        let bundleBarcodeHTML = '';
        if (hasMerch) {
          const barcode = await QRCode.toDataURL(`BUNDLE-${order.orderId}`, { width: 200 });
          bundleBarcodeHTML = `
            <img src="${barcode}" alt="Barcode Pickup Paket" width="200" height="200" />
            <p style="font-size:12px;color:#64748b;margin-top:8px">Tunjukkan barcode ini untuk pengambilan item merchandise dalam paket di venue.</p>
          `;
        }

        bodyHTML += `
          <div style="border:1px solid #e2e8f0; padding:16px; margin:16px 0; border-radius:8px;">
            <h3 style="margin:0 0 8px;color:#0f172a">${bundle.name} × ${bundleOrder.quantity}</h3>
            <p style="margin:0 0 8px"><strong>${IDR(bundleOrder.price * bundleOrder.quantity)}</strong></p>
            <p style="margin:8px 0 4px;font-size:13px;color:#475569">Isi paket:</p>
            <ul style="margin:0 0 8px;padding-left:20px;color:#334155">${itemLines.join('')}</ul>
            ${bundleBarcodeHTML}
          </div>
        `;
      }
    }

    const orderUrl = `https://nexeventapp.tech/order/${order.orderId}`;
    const waText = encodeURIComponent(
      `Pesanan saya untuk ${eventTitle} — Order ID: ${order.orderId}\n\nCek detail di: ${orderUrl}`
    );

    await resend.emails.send({
      from: 'nexEvent <noreply@nexeventapp.tech>',
      to: [order.buyerEmail],
      subject: `Konfirmasi Pesanan — ${eventTitle} | nexEvent`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
          <h1 style="color:#065f46;font-size:20px">Terima kasih, ${order.buyerName}!</h1>
          <p>Pembayaran Anda telah dikonfirmasi. Berikut detail pesanan untuk <strong>${eventTitle}</strong>:</p>
          ${bodyHTML}
          <p style="margin-top:16px">
            <a href="https://wa.me/?text=${waText}" style="background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">
              Bagikan ke WhatsApp
            </a>
          </p>
          <p style="font-size:12px;color:#64748b;margin-top:24px">
            Simpan email ini sebagai bukti pembelian Anda yang sah. Lihat detail pesanan di: <a href="${orderUrl}" style="color:#065f46">${orderUrl}</a>
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL] Konfirmasi pesanan terkirim ke ${order.buyerEmail} (order ${order.orderId}, tipe ${order.orderType})`);
  } catch (error) {
    console.error('[EMAIL] Gagal kirim konfirmasi pesanan:', error.message);
  }
};

// Laporan Akhir Event (Event Summary Report) — dikirim ke promotor saat "Tandai Event Selesai".
// PDF dilampirkan langsung (Resend attachments: content = Buffer). Ringkasan laba/rugi ditaruh di body.
const sendEventSummaryEmail = async ({ to, promotorName, eventTitle, filename, pdfBuffer, pl }) => {
  try {
    const isProfit = pl ? pl.netPL >= 0 : true;
    const summaryHTML = pl
      ? `
        <table cellpadding="6" style="border-collapse:collapse;margin:12px 0;font-size:14px">
          <tr><td style="color:#64748b">Total Pemasukan</td><td style="text-align:right"><strong>${IDR(pl.totalIncome)}</strong></td></tr>
          <tr><td style="color:#64748b">Total Pengeluaran</td><td style="text-align:right"><strong>${IDR(pl.totalExpense)}</strong></td></tr>
          <tr><td style="color:${isProfit ? '#065f46' : '#dc2626'}"><strong>${isProfit ? 'Laba' : 'Rugi'} Bersih</strong></td><td style="text-align:right;color:${isProfit ? '#065f46' : '#dc2626'}"><strong>${IDR(pl.netPL)}</strong></td></tr>
        </table>`
      : '';
    // Resend v6 mengembalikan { data, error } — TIDAK throw saat API menolak (mis. key salah). Cek `error`
    // supaya emailSent yang dikembalikan akurat (menggerakkan pesan ke promotor).
    const { error } = await resend.emails.send({
      from: 'nexEvent <noreply@nexeventapp.tech>',
      to,
      subject: `Laporan Akhir Event — ${eventTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="color:#065f46;margin-bottom:4px">Laporan Akhir Event</h2>
          <p style="color:#64748b;margin-top:0">Halo ${promotorName || 'Promotor'}, event <strong>${eventTitle}</strong> telah ditandai selesai.</p>
          <p style="margin:0 0 4px">Ringkasan keuangan:</p>
          ${summaryHTML}
          <p style="font-size:14px">Laporan lengkap (sponsor, pengeluaran, penjualan tiket per channel, data audiens, petty cash, hutang fee, & pencairan) terlampir sebagai PDF di email ini.</p>
          <p style="font-size:12px;color:#64748b;margin-top:24px">Email ini dikirim otomatis oleh sistem nexEvent — nexeventapp.tech</p>
        </div>
      `,
      attachments: [{ filename: filename || 'Laporan-Event.pdf', content: pdfBuffer }],
    });
    if (error) {
      console.error('[EMAIL] Resend menolak laporan akhir event:', error.message || error);
      return { sent: false, error: error.message || String(error) };
    }
    console.log(`[EMAIL] Laporan akhir event terkirim ke ${to} (${eventTitle})`);
    return { sent: true };
  } catch (error) {
    console.error('[EMAIL] Gagal kirim laporan akhir event:', error.message);
    return { sent: false, error: error.message };
  }
};

module.exports = { sendNewUserNotification, sendSponsorCredential, sendProExpiryReminder, sendOrderEmail, sendEventSummaryEmail };
