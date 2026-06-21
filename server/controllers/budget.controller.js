// Gunakan singleton prisma dengan PrismaPg adapter (wajib di Prisma v7)
const prisma = require('../src/lib/prisma');

// Ambil data anggaran/RAB berdasarkan ID Event
const getBudgetByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const budget = await prisma.budget.findFirst({
      where: { eventId: eventId },
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
        budgetId: budgetId,
        name: name.trim()
      }
    });
    return res.status(201).json({ success: true, data: newCategory, message: 'Kategori berhasil dibuat.' });
  } catch (error) {
    console.error('[CREATE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal membuat kategori.' });
  }
};

// Update / Rename Kategori Anggaran
const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log('[UPDATE CATEGORY] categoryId received:', categoryId);
    const { name } = req.body;

    const updated = await prisma.budgetCategory.update({
      where: { id: categoryId },
      data: { name },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Category not found' });
    }
    console.error('[UPDATE CATEGORY ERROR]', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Hapus Kategori Anggaran
const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log('[DELETE CATEGORY] categoryId received:', categoryId);

    await prisma.budgetCategory.delete({ where: { id: categoryId } });
    return res.status(200).json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    }
    console.error('[DELETE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus kategori.' });
  }
};

module.exports = {
  getBudgetByEvent,
  createCategory,
  updateCategory,
  deleteCategory
};
