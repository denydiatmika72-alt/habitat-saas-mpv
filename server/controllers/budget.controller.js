const prisma = require('../src/lib/prisma');

// Helper: recalculate & update totalEstimatedCost + contingencyFundAmount
const recalculateBudget = async (budgetId, contingencyFundPercentage) => {
  const allItems = await prisma.budgetItem.findMany({
    where: { category: { budgetId } },
    select: { estimatedCost: true },
  });
  const totalEstimatedCost = allItems.reduce((sum, i) => sum + Number(i.estimatedCost), 0);
  const contingencyFundAmount = totalEstimatedCost * (Number(contingencyFundPercentage) / 100);

  return prisma.budget.update({
    where: { id: budgetId },
    data: { totalEstimatedCost, contingencyFundAmount },
    include: { categories: { include: { items: true } } },
  });
};

// POST /api/budgets/initialize
const initializeBudget = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId)
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    if (event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Anda tidak punya akses ke event ini.' });

    const existing = await prisma.budget.findUnique({ where: { eventId } });
    if (existing)
      return res.status(409).json({ success: false, message: 'Budget untuk event ini sudah ada.' });

    const budget = await prisma.budget.create({
      data: { eventId },
      include: { categories: true },
    });

    return res.status(201).json({ success: true, message: 'RAB berhasil diinisialisasi.', data: budget });
  } catch (err) {
    console.error('[INIT BUDGET ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/budgets/:eventId
const getBudget = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });

    const budget = await prisma.budget.findUnique({
      where: { eventId },
      include: { categories: { include: { items: true } } },
    });

    if (!budget)
      return res.status(404).json({ success: false, message: 'Budget belum diinisialisasi.' });

    return res.status(200).json({ success: true, data: budget });
  } catch (err) {
    console.error('[GET BUDGET ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/budgets/:budgetId/categories — Tambah kategori baru ke budget
const addCategory = async (req, res) => {
  try {
    const { budgetId } = req.params;
    const { name, allocatedBudget } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: 'name wajib diisi.' });

    // Verifikasi budget milik promotor yang login
    const budget = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { event: true },
    });

    if (!budget)
      return res.status(404).json({ success: false, message: 'Budget tidak ditemukan.' });
    if (budget.event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });

    const category = await prisma.budgetCategory.create({
      data: {
        budgetId,
        name,
        allocatedBudget: Number(allocatedBudget) || 0,
      },
      include: { items: true },
    });

    return res.status(201).json({ success: true, message: 'Kategori berhasil ditambahkan.', data: category });
  } catch (err) {
    console.error('[ADD CATEGORY ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/budgets/categories/:categoryId/items — Tambah item + auto-kalkulasi total
const addBudgetItem = async (req, res) => {
  try {
    const { categoryId } = req.params;
    // SEKARANG MENERIMA QTY DAN HARGASATUAN DARI FRONTEND
    const { name, estimatedCost, qty, hargaSatuan } = req.body;

    if (!name || estimatedCost === undefined)
      return res.status(400).json({ success: false, message: 'name dan estimatedCost wajib diisi.' });

    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId },
      include: { budget: { include: { event: true } } },
    });

    if (!category)
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    if (category.budget.event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });

    // MENYIMPAN QTY DAN HARGASATUAN SECARA PERMANEN DI DATABASE
    await prisma.budgetItem.create({
      data: { 
        categoryId, 
        name, 
        qty: Number(qty) || 1, 
        hargaSatuan: Number(hargaSatuan) || 0, 
        estimatedCost: Number(estimatedCost), 
        actualCost: 0 
      },
    });

    const updatedBudget = await recalculateBudget(
      category.budgetId,
      category.budget.contingencyFundPercentage
    );

    return res.status(201).json({
      success: true,
      message: 'Item berhasil ditambahkan dan RAB diperbarui.',
      data: updatedBudget,
    });
  } catch (err) {
    console.error('[ADD BUDGET ITEM ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/budgets/categories/:categoryId — Hapus kategori beserta semua item-nya
const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Cari kategori + verifikasi kepemilikan lewat relasi budget → event
    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId },
      include: {
        budget: {
          include: { event: true },
        },
      },
    });

    if (!category)
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    if (category.budget.event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });

    const budgetId = category.budgetId;
    const contingencyFundPercentage = category.budget.contingencyFundPercentage;

    // 1. Hapus semua budget_items milik kategori ini terlebih dahulu (hindari FK constraint)
    await prisma.budgetItem.deleteMany({
      where: { categoryId },
    });

    // 2. Baru hapus kategorinya
    await prisma.budgetCategory.delete({
      where: { id: categoryId },
    });

    // 3. Recalculate totalEstimatedCost & contingencyFundAmount pada budget induk
    const updatedBudget = await recalculateBudget(budgetId, contingencyFundPercentage);

    return res.status(200).json({
      success: true,
      message: 'Kategori dan seluruh item-nya berhasil dihapus.',
      data: updatedBudget,
    });
  } catch (err) {
    console.error('[DELETE CATEGORY ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/budgets/items/:itemId — Hapus item + auto-kalkulasi ulang
const deleteBudgetItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Cari item + verifikasi kepemilikan
    const item = await prisma.budgetItem.findUnique({
      where: { id: itemId },
      include: {
        category: {
          include: { budget: { include: { event: true } } },
        },
      },
    });

    if (!item)
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan.' });
    if (item.category.budget.event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });

    const budgetId = item.category.budgetId;
    const contingencyFundPercentage = item.category.budget.contingencyFundPercentage;

    await prisma.budgetItem.delete({ where: { id: itemId } });

    const updatedBudget = await recalculateBudget(budgetId, contingencyFundPercentage);

    return res.status(200).json({
      success: true,
      message: 'Item berhasil dihapus dan RAB diperbarui.',
      data: updatedBudget,
    });
  } catch (err) {
    console.error('[DELETE BUDGET ITEM ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { initializeBudget, getBudget, addCategory, deleteCategory, addBudgetItem, deleteBudgetItem };