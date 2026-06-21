/**
 * HABITAT - Prisma Client Singleton
 *
 * Prisma v7 WAJIB menggunakan Driver Adapter — tidak ada built-in
 * query engine lagi sejak Rust engine dihapus di v7.
 *
 * Menggunakan connectionString agar tidak crash saat DATABASE_URL
 * belum tersedia di module load time (misalnya di lingkungan non-Render).
 */
require('dotenv/config');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
