require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Kita masukkan DATABASE_URL langsung ke dalam PrismaClient
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

async function main() {
    try {
        console.log("Mencoba menghubungkan ke database...");
        await prisma.$connect();
        console.log("✅ Database terhubung!");
        // Jika berhasil, jalankan index.js
        require('./src/index.js');
    } catch (e) {
        console.error("❌ GAGAL terhubung ke Database.");
        console.error("DATABASE_URL yang terbaca:", process.env.DATABASE_URL ? "ADA" : "KOSONG");
        console.error("Error Detail:", e.message);
    }
}
main();