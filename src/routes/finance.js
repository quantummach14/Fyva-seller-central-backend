const express = require('express');
const router = express.Router();
const FinanaceController = require('../controllers/finance.controller');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/sale-purchase-summary', authMiddleware(), FinanaceController.salePurchaseSummary);
router.post('/sku-sale-purchase', authMiddleware(), FinanaceController.skusalePurchaseSummary);
router.post('/remittance-outstanding-data', authMiddleware(), FinanaceController.remittanceAndOutstandingData);
router.post('/inventory-health-module', authMiddleware(), FinanaceController.inventoryHealthModule);
router.get('/export-health-module', FinanaceController.exportInventoryHealth);
router.get('/generate-po-pdf', FinanaceController.generatePoPdf);
router.get('/po-file-upload', FinanaceController.generatePoFilePdf);
// router.get('/update-shopify-metafields', FinanaceController.updateShopifyMetafields);
// router.get('/update-sku-title', FinanaceController.updateSkuTitle);
router.post('/get-chatbot-messages', FinanaceController.getChatbotMessgaes);
router.post('/siens-inventory-health-module', authMiddleware(), FinanaceController.getSiensInventoryHealthModule);
router.get("/export-siens-inventory", FinanaceController.exportSiensInventoryHealth);




module.exports = router;