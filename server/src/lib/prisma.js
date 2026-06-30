const { PrismaClient } = require('@prisma/client')

const prisma = global.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error']
})

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

module.exports = prisma
