// Stub — invoice PDF generation will be implemented later
const getInvoices = (req, res) => res.json({ success: true, data: [] });
const getInvoice = (req, res) => res.json({ success: true, data: null });
const getInvoiceByDeal = (req, res) => res.json({ success: true, data: null });
const generateInvoice = (req, res) => res.status(503).json({ success: false, message: 'Coming soon' });
const updateInvoiceStatus = (req, res) => res.status(503).json({ success: false, message: 'Coming soon' });
const deleteInvoice = (req, res) => res.status(503).json({ success: false, message: 'Coming soon' });

module.exports = { getInvoices, getInvoice, getInvoiceByDeal, generateInvoice, updateInvoiceStatus, deleteInvoice };
