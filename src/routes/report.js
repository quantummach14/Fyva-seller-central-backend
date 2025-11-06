const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/report.controller');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/download-order-status-report', ReportController.downloadOrderStatusReport);
router.get('/download-refund-report', ReportController.downloadRefundReport);





module.exports = router;