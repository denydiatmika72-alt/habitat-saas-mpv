/**
 * HABITAT - Prisma Client Singleton
 *
 * Prisma v7 WAJIB menggunakan Driver Adapter — tidak ada built-in
 * query engine lagi sejak Rust engine dihapus di v7.
 *
 * Referensi: https://pris.ly/d/prisma7-client-config
 */
require('dotenv/config');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// Parse DATABASE_URL dari .env secara manual agar bisa set SSL options
const connectionUrl = new URL(process.env.DATABASE_URL);

const pool = new Pool({
  host:     connectionUrl.hostname,
  port:     parseInt(connectionUrl.port) || 5432,
  database: connectionUrl.pathname.replace(/^\//, ''),
  user:     decodeURIComponent(connectionUrl.username),
  password: decodeURIComponent(connectionUrl.password),
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined, // Bypass self-signed cert Supabase
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
