const prisma = require('../src/lib/prisma');

// ─── Helper: Recalculate Budget Totals ────────────────────────────────────────
// Dipanggil setiap kali item ditambahkan atau dihapus agar
// totalEstimatedCost dan contingencyFundAmount selalu sinkron.
async function recalculateBudget(budgetId) {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      categories: {
        include: { items: true },
      },
    },
  });

  if (!budget) return;

  const totalEstimatedCost = budget.categories.reduce(
    (total, cat) =>
      total + cat.items.reduce((sum, item) => sum + Number(item.estimatedCost), 0),
    0
  );

  const pct = Number(budget.contingencyFundPercentage); // default 20
  const contingencyFundAmount = (totalEstimatedCost * pct) / 100;

  await prisma.budget.update({
    where: { id: budgetId },
    data: { totalEstimatedCost, contingencyFundAmount },
  });
}

// ─── POST /api/budgets/initialize ────────────────────────────────────────────
// Buat record Budget untuk sebuah event jika belum ada (idempotent / upsert).
const initializeBudget = async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    }

    const existing = await prisma.budget.findUnique({ where: { eventId } });
    if (existing) {
      // Sudah ada — kembalikan 409 agar client tahu & tidak panik
      return res.status(409).json({ success: false, message: 'Budget sudah ada.', data: existing });
    }

    const budget = await prisma.budget.create({
      data: { eventId },
    });

    return res.status(201).json({ success: true, data: budget, message: 'Budget berhasil dibuat.' });
  } catch (error) {
    console.error('[INITIALIZE BUDGET ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal inisialisasi budget.' });
  }
};

// ─── GET /api/budgets/:eventId ────────────────────────────────────────────────
// Ambil data anggaran/RAB berdasarkan ID Event
const getBudgetByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const budget = await prisma.budget.findFirst({
      where: { eventId },
      include: {
        categories: {
          include: { items: true },
        },
      },
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

// ─── POST /api/budgets/categories ────────────────────────────────────────────
// Buat Kategori Anggaran Baru
const createCategory = async (req, res) => {
  try {
    const { budgetId, name } = req.body;

    if (!budgetId || !name?.trim()) {
      return res.status(400).json({ success: false, message: 'budgetId dan name wajib diisi.' });
    }

    const newCategory = await prisma.budgetCategory.create({
      data: {
        budgetId,
        name: name.trim(),
      },
    });

    return res.status(201).json({ success: true, data: newCategory, message: 'Kategori berhasil dibuat.' });
  } catch (error) {
    console.error('[CREATE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal membuat kategori.' });
  }
};

// ─── PUT /api/budgets/categories/:categoryId ─────────────────────────────────
// Update / Rename Kategori Anggaran
const updateCategory = async (req, res) => {
  console.log('[updateCategory] hit — categoryId:', req.params.categoryId);
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    const updated = await prisma.budgetCategory.update({
      where: { id: categoryId },
      data: { name },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    }
    console.error('[UPDATE CATEGORY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── DELETE /api/budgets/categories/:categoryId ──────────────────────────────
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

// ─── POST /api/budgets/categories/:categoryId/items ──────────────────────────
// Tambah Item ke dalam Kategori Anggaran
const createItem = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, qty, hargaSatuan, estimatedCost } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Nama item wajib diisi.' });
    }

    // Cek kategori ada sekaligus ambil budgetId untuk recalculate
    const category = await prisma.budgetCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    }

    const newItem = await prisma.budgetItem.create({
      data: {
        categoryId,
        name: name.trim(),
        qty:           Number(qty)          || 1,
        hargaSatuan:   Number(hargaSatuan)   || 0,
        estimatedCost: Number(estimatedCost) || 0,
      },
    });

    // Update totalEstimatedCost & contingencyFundAmount di Budget
    await recalculateBudget(category.budgetId);

    return res.status(201).json({ success: true, data: newItem, message: 'Item berhasil ditambahkan.' });
  } catch (error) {
    console.error('[CREATE ITEM ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal menambah item.' });
  }
};

// ─── DELETE /api/budgets/items/:itemId ───────────────────────────────────────
// Hapus Item dari Kategori Anggaran
const deleteItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Perlu ambil budgetId dulu sebelum dihapus
    const item = await prisma.budgetItem.findUnique({
      where: { id: itemId },
      include: { category: true },
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan.' });
    }

    const budgetId = item.category.budgetId;

    await prisma.budgetItem.delete({ where: { id: itemId } });

    // Update totalEstimatedCost & contingencyFundAmount di Budget
    await recalculateBudget(budgetId);

    return res.status(200).json({ success: true, message: 'Item berhasil dihapus.' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan.' });
    }
    console.error('[DELETE ITEM ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus item.' });
  }
};

// ─── GET /api/events/:eventId/rab-items ──────────────────────────────────────
// Kembalikan semua budget items dari sebuah event (untuk Import dari RAB di PO)
const getRabItemsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const budget = await prisma.budget.findFirst({
      where: { eventId },
      include: {
        categories: {
          include: { items: true },
        },
      },
    });

    if (!budget) {
      return res.status(404).json({ success: false, message: 'RAB belum dibuat untuk event ini.' });
    }

    const items = budget.categories.flatMap((cat) =>
      cat.items.map((item) => ({
        id: item.id,
        name: item.name,
        qty: Number(item.qty),
        hargaSatuan: Number(item.hargaSatuan),
        estimatedCost: Number(item.estimatedCost),
        categoryName: cat.name,
      }))
    );

    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('[getRabItemsByEvent]', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil item RAB.' });
  }
};

module.exports = {
  initializeBudget,
  getBudgetByEvent,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  deleteItem,
  getRabItemsByEvent,
};
