const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Ambil data anggaran/RAB berdasarkan ID Event
const getBudgetByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const budget = await prisma.budget.findFirst({
      where: { event_id: eventId },
      include: {
        categories: {
          include: {
            items: true
          }
        }
      }
    });

    if (!budget) {
      return res.status(404).json({ success: false, message: 'RAB belum dibuat untuk event ini.' });
    }

    return res.status(200).json({ success: true, data: budget });
  } catch (error) {
    console.error('[GET BUDGET ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data RAB.' });
  }
};

// Buat Kategori Anggaran Baru
const createCategory = async (req, res) => {
  try {
    const { budgetId, name } = req.body;
    const newCategory = await prisma.budgetCategory.create({
      data: {
        budget_id: budgetId,
        name: name.trim()
      }
    });
    return res.status(201).json({ success: true, data: newCategory, message: 'Kategori berhasil dibuat.' });
  } catch (error) {
    console.error('[CREATE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal membuat kategori.' });
  }
};

// ==========================================
// KODE UTUH RE-NAME KATEGORI (FIX ERROR 404)
// ==========================================
const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params; // UUID string otomatis, tidak pake Number()
    console.log('[UPDATE CATEGORY] categoryId received:', categoryId);
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nama kategori tidak boleh kosong.' });
    }

    // Cari tahu dulu apakah kategorinya ada
    // PENTING: Budget tidak punya promotor_id langsung — harus traversal ke Event
    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId },
      include: {
        budget: {
          include: {
            event: true   // Event yang menyimpan promotor_id
          }
        }
      },
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori anggaran tidak ditemukan.' });
    }

    // Validasi keamanan: promotor_id ada di Event, bukan di Budget
    if (category.budget.event.promotor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses untuk mengubah kategori ini.' });
    }

    // Eksekusi update nama kategori
    const updatedCategory = await prisma.budgetCategory.update({
      where: { id: categoryId },
      data: { name: name.trim() },
    });

    return res.status(200).json({ success: true, data: updatedCategory, message: 'Nama kategori berhasil diubah.' });
  } catch (error) {
    console.error('[UPDATE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal mengubah nama kategori.' });
  }
};

// Hapus Kategori Anggaran
const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log('[DELETE CATEGORY] categoryId received:', categoryId);

    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId },
      include: {
        budget: {
          include: {
            event: true   // promotor_id ada di Event, bukan Budget
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    }

    if (category.budget.event.promotor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    await prisma.budgetCategory.delete({ where: { id: categoryId } });
    return res.status(200).json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (error) {
    console.error('[DELETE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus kategori.' });
  }
};

module.exports = {
  getBudgetByEvent,
  createCategory,
  updateCategory, // Pastikan ini ter-ekspor
  deleteCategory
};