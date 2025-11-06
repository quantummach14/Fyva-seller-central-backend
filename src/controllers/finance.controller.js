const { Sequelize, Op, fn, col, where, literal } = require('sequelize');
const OrderBookingData = require('../models/orderBookingData');
const DaburPurchaseData = require('../models/daburPurcahseData');
const InventoryItem = require('../models/inventoryItem');
const OrderDetail = require('../models/orderDetail');
const poFileUploads = require('../models/PoFileUploads');
const DaburPoConversionFile = require('../models/daburPoConversionFile');
const RemittanceData = require('../models/remittanceData');
const FinanceHelper = require('../helper/finance.helper');
const sequelize = require('../config/db');
const exceljs = require('exceljs'); // For XLS export
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const ExcelJS = require("exceljs");
const today = new Date();
// const pdf = require('html-pdf');
const puppeteer = require('puppeteer');

class FinanaceController {

    static async salePurchaseSummary(req, res) {
        try {
            console.log("enter>>>>>");

            const salePurchaseData = await FinanceHelper.getSalePurchaseData();
            return res.status(200).json({
                success: true,
                data: salePurchaseData
            });
        } catch (error) {
            console.error('Error in salePurchaseSummary Data:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for Sale Purchase Summary'
            });
        }
    }

    static async skusalePurchaseSummary(req, res) {
        try {
            const { page = 1, limit = 10, startDate, endDate, location } = req.body;

            // Fetch SKU sale purchase data
            const skuSalePurchaseData = await FinanceHelper.getSkuSalePurchaseData(page, limit, startDate, endDate, location);

            return res.status(200).json({
                success: true,
                data: skuSalePurchaseData,
            });
        } catch (error) {
            console.error('Error fetching SKU sale purchase summary:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for SKU sale purchase summary',
            });
        }
    }

    static async remittanceAndOutstandingData(req, res) {
        try {
            const { startDate, endDate, location = '' } = req.body;
            if (!!startDate !== !!endDate) return res.status(404).json({
                success: false,
                message: "Provide both start_date and end_date",
            })
            const remittanceOutStandingData = await FinanceHelper.getRemittanceOutstandingData(startDate, endDate, location);
            return res.status(200).json({
                success: true,
                data: remittanceOutStandingData,
            });
        } catch (error) {
            console.error('Error fetching SKU sale purchase summary:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for SKU sale purchase summary',
            });
        }
    }

    static async inventoryHealthModule(req, res) {
        try {
            const bodyData = req.body;
            const sortField = req.body.sortField ?? null;
            const inventorySortField = req.body.sortInventoryField ?? null;
            const sortOrder = req.body.sortOrder ?? null;
            const inventorySortOrder = req.body.sortInventoryOrder ?? null;

            const computedColumns = [
                'sales_180_days',
                'sales_90_days',
                'sales_30_days',
                'sales_15_days',
                'total_orders',
                'total_revenue',
                'sales_per_day',
                'Inventory_qty',
            ];

            let orderByClause = [];
            if (sortField && computedColumns.includes(sortField)) {
                orderByClause = [Sequelize.literal(`${sortField} ${sortOrder}`)];
            }

            const location = bodyData?.location ?? "";
            const startDate = bodyData?.startDate ?? "";
            const endDate = bodyData?.endDate ?? "";
            const limit = bodyData?.limit ?? 10;
            const page = bodyData?.page ?? 1;
            const offset = (page - 1) * limit;

            // Main Data Query
            const orderDetailData = await OrderDetail.findAll({
                attributes: [
                    'sku',
                    [Sequelize.fn('MAX', Sequelize.col('orderDetail.name')), 'max_name'],
                    [Sequelize.fn('MAX', Sequelize.col('orderDetail.title')), 'max_title'],
                    [Sequelize.col('order_data.warehouse_name'), 'warehouse_name'],
                    [Sequelize.fn('COUNT', Sequelize.col('orderDetail.order_no')), 'total_orders'],
                    [Sequelize.literal('SUM(orderDetail.quantity * orderDetail.price)'), 'total_revenue'],
                    [Sequelize.literal(`ROUND(SUM(quantity) / GREATEST(DATEDIFF(CURDATE(), MIN(order_data.datetime)), 1), 2)`), 'sales_per_day']
                ],
                include: [
                    {
                        model: OrderBookingData,
                        as: 'order_data',
                        attributes: [],
                        where: {
                            ...(location ? {
                                warehouse_name: Sequelize.where(
                                    Sequelize.fn('LOWER', Sequelize.col('order_data.warehouse_name')),
                                    '=',
                                    location.toLowerCase()
                                )
                            } : {}),
                            ...(startDate || endDate
                                ? {
                                    [Sequelize.Op.and]: [
                                        startDate ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('order_data.datetime')), '>=', startDate) : null,
                                        endDate ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('order_data.datetime')), '<=', endDate) : null
                                    ].filter(Boolean)
                                } : {})
                        },
                        required: true
                    }
                ],
                group: ['order_data.warehouse_name', 'sku'],
                subQuery: false,
                order: orderByClause.length > 0 ? orderByClause : undefined,
                limit,
                offset,
                raw: true
            });

            const countResult = await OrderDetail.findAll({
                attributes: [
                    [Sequelize.literal('DISTINCT CONCAT(order_data.warehouse_name, "-", sku)'), 'sku_group']
                ],
                include: [
                    {
                        model: OrderBookingData,
                        as: 'order_data',
                        attributes: [],
                        where: {
                            ...(location ? {
                                warehouse_name: Sequelize.where(
                                    Sequelize.fn('LOWER', Sequelize.col('order_data.warehouse_name')),
                                    '=',
                                    location.toLowerCase()
                                )
                            } : {}),
                            ...(startDate || endDate
                                ? {
                                    [Sequelize.Op.and]: [
                                        startDate ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('order_data.datetime')), '>=', startDate) : null,
                                        endDate ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('order_data.datetime')), '<=', endDate) : null
                                    ].filter(Boolean)
                                } : {})
                        },
                        required: true
                    }
                ],
                raw: true
            });
            const totalCount = countResult.length;

            // Inventory Data
            const inventoryData = await InventoryItem.findAll({
                attributes: [
                    [Sequelize.literal(`
                        CASE 
                            WHEN location = 'H1' THEN 'Bangalore'
                            WHEN location = 'GND' THEN 'Gurgaon'
                            ELSE location
                        END
                    `), 'mapped_location'],
                    'sku_code',
                    [Sequelize.literal('SUM(qty)'), 'Inventory_qty']
                ],
                where: location
                    ? {
                        location: location.toLowerCase() === 'bangalore'
                            ? 'H1'
                            : location.toLowerCase() === 'gurgaon'
                                ? 'GND'
                                : ''
                    }
                    : {},
                group: ['mapped_location', 'sku_code'],
                order: inventorySortField ? [Sequelize.literal(`${inventorySortField} ${inventorySortOrder}`)] : undefined,
                raw: true
            });

            // Dabur Purchase Data
            const daburPurchaseData = await sequelize.query(`
                SELECT 
                    city, 
                    material_number, 
                    SUM(received_qty) AS total_received_qty,
                    (
                        SELECT dpd.received_qty
                        FROM dabur_purchase_data dpd
                        WHERE dpd.city = outer_dpd.city
                          AND dpd.material_number = outer_dpd.material_number
                        ORDER BY dpd.created_at DESC
                        LIMIT 1
                    ) AS last_received_qty
                FROM dabur_purchase_data AS outer_dpd
                ${location ? `WHERE city = '${location}'` : ''}
                GROUP BY city, material_number
            `, { type: Sequelize.QueryTypes.SELECT });

            // Combine Results
            const combinedData = orderDetailData.map(orderDetail => {
                const matchingInventory = inventoryData.find(data => data.mapped_location === orderDetail.warehouse_name && data.sku_code === orderDetail.sku);
                const matchingDabur = daburPurchaseData.find(data => data.city === orderDetail.warehouse_name && data.material_number === orderDetail.sku);

                return {
                    sku: orderDetail.sku,
                    name: orderDetail.max_name,
                    title: orderDetail.max_title,
                    warehouse_name: orderDetail.warehouse_name,
                    total_orders: orderDetail.total_orders,
                    total_revenue: orderDetail.total_revenue,
                    sales_per_day: orderDetail.sales_per_day,
                    Inventory_qty: matchingInventory ? matchingInventory.Inventory_qty : 0,
                    total_received_qty: matchingDabur ? matchingDabur.total_received_qty : 0,
                    last_received_qty: matchingDabur ? matchingDabur.last_received_qty : 0,
                };
            });

            return res.status(200).json({
                success: true,
                data: combinedData,
                page,
                total_count: totalCount
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    }

    static async exportInventoryHealth(req, res) {
        try {
            const queryData = req.query;
            const location = queryData?.location ?? "";
            const startDate = queryData?.startDate ?? "";
            const endDate = queryData?.endDate ?? "";

            const dateFilter = {};
            if (startDate) dateFilter.datetime = { [Sequelize.Op.gte]: new Date(`${startDate} 00:00:00`) };
            if (endDate) dateFilter.datetime = { ...(dateFilter.datetime || {}), [Sequelize.Op.lte]: new Date(`${endDate} 23:59:59`) };

            console.log("query->>>>>>>>>>", queryData)

            // Fetch order details with sales data
            const orderDetailData = await OrderDetail.findAll({
                attributes: [
                    'sku',
                    [Sequelize.fn('MAX', Sequelize.col('orderDetail.name')), 'max_name'],
                    [Sequelize.fn('MAX', Sequelize.col('orderDetail.title')), 'max_title'],
                    [Sequelize.col('order_data.warehouse_name'), 'warehouse_name'],
                    [Sequelize.fn('COUNT', Sequelize.col('orderDetail.order_no')), 'total_orders'],
                    [Sequelize.literal('SUM(orderDetail.quantity * orderDetail.price)'), 'total_revenue'],
                    [Sequelize.literal(`ROUND(SUM(quantity) / GREATEST(DATEDIFF(CURDATE(), MIN(order_data.datetime)), 1), 2)`), 'sales_per_day']
                ],
                include: [
                    {
                        model: OrderBookingData,
                        as: 'order_data',
                        attributes: ['warehouse_name'], // Include datetime column
                        where: {
                            ...(location
                                ? {
                                    warehouse_name: Sequelize.where(
                                        Sequelize.fn('LOWER', Sequelize.col('order_data.warehouse_name')),
                                        '=',
                                        location.toLowerCase()
                                    )
                                }
                                : {}),
                            ...(startDate || endDate
                                ? {
                                    [Sequelize.Op.and]: [
                                        startDate ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('order_data.datetime')), '>=', startDate) : null,
                                        endDate ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('order_data.datetime')), '<=', endDate) : null
                                    ].filter(Boolean)
                                }
                                : {})

                        },
                        required: true, // Ensures we are getting matching rows only
                    }
                ],
                group: ['order_data.warehouse_name', 'sku'],
                raw: true
            });

            // Fetch inventory data
            const inventoryData = await InventoryItem.findAll({
                attributes: [
                    [Sequelize.literal(`CASE WHEN location = 'H1' THEN 'Bangalore' WHEN location = 'GND' THEN 'Gurgaon' ELSE location END`), 'mapped_location'],
                    'sku_code',
                    [Sequelize.literal('SUM(qty)'), 'Inventory_qty']
                ],
                where: location ? { location: location.toLowerCase() === 'bangalore' ? 'H1' : location.toLowerCase() === 'gurgaon' ? 'GND' : '' } : {},
                group: ['mapped_location', 'sku_code'],
                raw: true
            });

            // Fetch Dabur purchase data
            const daburPurchaseData = await sequelize.query(`
                SELECT city, material_number, SUM(received_qty) AS total_received_qty,
                    (SELECT dpd.received_qty FROM dabur_purchase_data dpd WHERE dpd.city = outer_dpd.city AND dpd.material_number = outer_dpd.material_number ORDER BY dpd.created_at DESC LIMIT 1) AS last_received_qty
                FROM dabur_purchase_data AS outer_dpd
                ${location ? `WHERE city = '${location}'` : ''}
                GROUP BY city, material_number
            `, { type: Sequelize.QueryTypes.SELECT });

            // Combine the data
            const combinedData = orderDetailData.map(orderDetail => {
                const matchingInventory = inventoryData.find(data => data.mapped_location === orderDetail.warehouse_name && data.sku_code === orderDetail.sku);
                const matchingDabur = daburPurchaseData.find(data => data.city === orderDetail.warehouse_name && data.material_number === orderDetail.sku);

                return {
                    sku: orderDetail.sku,
                    name: orderDetail.max_name,
                    title: orderDetail.max_title,
                    warehouse_name: orderDetail.warehouse_name,
                    total_orders: orderDetail.total_orders,
                    total_revenue: orderDetail.total_revenue,
                    // contribution_percentage: (orderDetail.contribution_percentage).toFixed(2),
                    // sales_180_days: orderDetail.sales_180_days,
                    // sales_90_days: orderDetail.sales_90_days,
                    // sales_30_days: orderDetail.sales_30_days,
                    // sales_15_days: orderDetail.sales_15_days,
                    sales_per_day: orderDetail.sales_per_day,
                    velocity: (orderDetail.sales_per_day * 10).toFixed(2),
                    Inventory_qty: matchingInventory ? matchingInventory.Inventory_qty : 0,
                    total_received_qty: matchingDabur ? matchingDabur.total_received_qty : 0,
                    last_received_qty: matchingDabur ? matchingDabur.last_received_qty : 0,
                };
            });

            // Generate Excel file
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Inventory Health');
            worksheet.columns = [
                { header: 'City', key: 'warehouse_name' },
                { header: 'SKU', key: 'sku' },
                { header: 'SKU Name', key: 'name' },
                { header: 'SKU Description', key: 'title' },
                { header: 'Total Orders', key: 'total_orders' },
                { header: 'Total Revenue', key: 'total_revenue' },
                // { header: 'Contribution Percentage', key: 'contribution_percentage' },
                // { header: 'Sales 180 Days', key: 'sales_180_days' },
                // { header: 'Sales 90 Days', key: 'sales_90_days' },
                // { header: 'Sales 30 Days', key: 'sales_30_days' },
                // { header: 'Sales 15 Days', key: 'sales_15_days' },
                { header: 'Sales per Day', key: 'sales_per_day' },
                { header: 'Velocity', key: 'velocity' },
                { header: 'SOH', key: 'Inventory_qty' },
                { header: 'Total PO Qty', key: 'total_received_qty' },
                { header: 'Last PO Qty', key: 'last_received_qty' },
            ];

            // Add data rows
            combinedData.forEach(data => worksheet.addRow(data));

            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=inventory_health.xlsx');

            // Write file to response
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    }

    static async generatePoPdf(req, res) {
        try {
            const { location } = req.query;
            console.log("location->>>>>>>>>", location);

            const now = new Date();
            const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            // ✅ Step 0: Map readable location to code
            const locationMapReadableToCode = {
                gurgaon: 'GND',
                bangalore: 'H1'
            };
            const locationCode = location ? locationMapReadableToCode[location.toLowerCase()] : null;

            // ✅ Step 1: Latest inventory data
            const latestInventoryRecords = await sequelize.query(`
                SELECT ii.*
                FROM inventory_items ii
                INNER JOIN (
                    SELECT MAX(id) as max_id
                    FROM inventory_items
                    WHERE 1=1
                    ${locationCode ? 'AND location = :locationCode' : ''}
                    GROUP BY sku_code, location
                ) grouped ON ii.id = grouped.max_id
            `, {
                model: InventoryItem,
                mapToModel: true,
                replacements: { locationCode }
            });

            const inventoryMap = new Map();
            latestInventoryRecords.forEach(item => {
                const key = `${item.sku_code}_${item.location}`;
                inventoryMap.set(key, {
                    sku_code: item.sku_code,
                    location: item.location,
                    qty: item.qty,
                    shopify_qty: item.shopify_qty
                });
            });

            // ✅ Step 2: Order quantities (last 14 days)
            const orders14 = await sequelize.query(`
                SELECT sku, warehouse_name, SUM(quantity) AS total_qty
                FROM order_details
                WHERE DATE(datetime) >= :startDate AND DATE(datetime) <= :endDate AND warehouse_name IS NOT NULL
                ${location ? 'AND LOWER(warehouse_name) = :location' : ''}
                GROUP BY sku, warehouse_name
            `, {
                replacements: {
                    startDate: fourteenDaysAgo.toISOString().split('T')[0],
                    endDate: now.toISOString().split('T')[0],
                    location: location?.toLowerCase()
                },
                type: sequelize.QueryTypes.SELECT
            });

            const orderQtyMap14 = new Map(
                orders14.map(row => [`${row.sku}_${row.warehouse_name}`, Number(row.total_qty)])
            );

            // ✅ Step 3: Order quantities (last 30 days)
            const orders30 = await sequelize.query(`
                SELECT sku, warehouse_name, SUM(quantity) AS total_qty
                FROM order_details
                WHERE DATE(datetime) >= :startDate AND DATE(datetime) <= :endDate AND warehouse_name IS NOT NULL
                ${location ? 'AND LOWER(warehouse_name) = :location' : ''}
                GROUP BY sku, warehouse_name
            `, {
                replacements: {
                    startDate: thirtyDaysAgo.toISOString().split('T')[0],
                    endDate: now.toISOString().split('T')[0],
                    location: location?.toLowerCase()
                },
                type: sequelize.QueryTypes.SELECT
            });

            const orderQtyMap30 = new Map(
                orders30.map(row => [`${row.sku}_${row.warehouse_name}`, Number(row.total_qty)])
            );

            // ✅ Step 4: PO Conversion Data
            const daburPOConversionData = await DaburPoConversionFile.findAll({
                attributes: ['sku_code', 'mrp', 'hsn', 'gst', 'case_size', 'sku_name'],
                raw: true,
            });

            // ✅ Fetch the latest customer_po_number from dabur_purchase_data
            let queryOptions = {
                attributes: ['customer_po_number'],
                where: {
                    customer_po_number: { [Op.ne]: null },
                    city: sequelize.where(sequelize.fn('LOWER', sequelize.col('city')), Op.eq, location.toLowerCase())  // Apply LOWER() to the city column and compare it with the lowercased location
                },
                order: [['id', 'DESC']],  // Orders by id descending to get the latest
                limit: 1  // Ensures only the latest entry is fetched
            };


            const latestPoData = await DaburPurchaseData.findOne(queryOptions);

            let customerPoNumber = latestPoData ? latestPoData.customer_po_number : null;

            const daburpurchaseData = await DaburPurchaseData.findAll({
                attributes: ['customer_po_number', 'city', 'material_number', 'received_qty', 'po_qty'],
                where: {
                    customer_po_number: customerPoNumber
                }
            });

            const latestDaburDataMap = new Map(
                daburpurchaseData.map(item => [
                    `${item.material_number}_${item.city}`,
                    {
                        received_qty: item.received_qty !== null ? Number(item.received_qty) : null,
                        po_qty: item.po_qty !== null ? Number(item.po_qty) : null
                    }
                ])
            );

            console.log("Latest PO Number: ", customerPoNumber);
            let regex = /([A-Za-z]+)(\d+)$/;
            let match = customerPoNumber.match(regex);
            if (match) {
                let prefix = match[1];
                let numericPart = match[2];
                let incrementedNumeric = (parseInt(numericPart, 10) + 1).toString();
                customerPoNumber = prefix + incrementedNumeric;

                console.log("Updated PO Number: ", customerPoNumber);  // Should output 'GND24'
            } else {
                console.log("PO Number format is not valid.");
            }




            const daburPOConversionDataMap = new Map(
                daburPOConversionData.map(item => [
                    `${item.sku_code}`,
                    {
                        mrp: item.mrp !== null ? Number(item.mrp) : null,
                        case_size: item.case_size !== null ? Number(item.case_size) : null,
                        hsn: item.hsn || null,
                        gst: item.gst || null,
                        sku_name: item.sku_name || null
                    },
                ])
            );

            // ✅ Step 5: Map codes back to readable locations
            const locationMap = {
                H1: 'Bangalore',
                GND: 'Gurgaon'
            };

            // ✅ Step 6: Final merge
            const result = [];
            let totalTaxable = 0;
            let totalTax = 0;
            let totalGrand = 0;

            for (const [key, item] of inventoryMap.entries()) {
                const readableLocation = locationMap[item.location];
                const mapKey = `${item.sku_code}_${readableLocation}`;
                const poKey = `${item.sku_code}`;

                const latestData = latestDaburDataMap.get(key);

                const lastGrnPOQty = latestData?.received_qty ?? null;
                const lastPOQty = latestData ? latestData?.po_qty : 0;

                const last_po_status = latestData
                    ? (lastGrnPOQty !== null ? 'Updated' : 'Pending')
                    : 'NA';

                let vinQty = Math.max(Number(item.shopify_qty), Number(item.qty));
                if (last_po_status === 'Pending') {
                    vinQty += Number(lastPOQty);
                }
                const qty14 = orderQtyMap14.get(mapKey) || 0;
                const qty30 = orderQtyMap30.get(mapKey) || 0;

                let newPoQty = 0;
                if (vinQty < qty14) {
                    newPoQty = qty14 - vinQty;
                } else if (vinQty < qty30) {
                    newPoQty = qty30 - vinQty;
                }

                if (newPoQty > 0) {
                    const PoConsversionData = daburPOConversionDataMap.get(poKey);
                    const gstPercent = parseFloat(PoConsversionData?.gst?.replace('%', '') || 0);
                    const discountRate = 0.75;
                    const mrp = parseFloat(PoConsversionData?.mrp || 0);
                    const qty = parseFloat(newPoQty || 0);
                    const case_size = PoConsversionData?.case_size ?? 0;
                    const skuName = PoConsversionData?.sku_name ?? '';

                    let NoOfCases = case_size > 0 ? Math.ceil(newPoQty / case_size) : 0;
                    NoOfCases = NoOfCases * case_size;

                    const effectivePrice = mrp * discountRate;
                    const taxableValue = NoOfCases * effectivePrice;
                    const gstValue = taxableValue * (gstPercent / 100);
                    const totalValue = taxableValue + gstValue;

                    totalTaxable += taxableValue;
                    totalTax += gstValue;
                    totalGrand += totalValue;

                    result.push({
                        sku_code: item.sku_code,
                        location: readableLocation,
                        vinculum_qty: vinQty,
                        shopify_qty: Number(item.shopify_qty),
                        ordered_14_days: qty14,
                        ordered_30_days: qty30,
                        new_po_qty: NoOfCases,
                        hsn: PoConsversionData?.hsn,
                        mrp: PoConsversionData?.mrp,
                        gst: PoConsversionData?.gst,
                        case_size: PoConsversionData?.case_size,
                        sku_name: skuName,
                        taxableValue,
                        gstValue,
                        totalValue,
                        customerPoNumber
                    });
                }
            }

            const numberInWords = await FinanaceController.numberToWords(totalGrand);

            const templatePath = path.join(__dirname, '../views/inventoryHealthReport.ejs');
            const html = await ejs.renderFile(templatePath, {
                data: result,
                location: location,
                totalTaxable,
                totalTax,
                totalGrand,
                numberInWords,
                customerPoNumber
            });
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setContent(html, {
                waitUntil: 'load',
                timeout: 60000
            });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
            });

            await browser.close();

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="inventory-health-report.pdf"');
            res.setHeader('Content-Length', pdfBuffer.length);
            res.end(pdfBuffer);

        } catch (err) {
            console.error('Error generating PO PDF:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async numberToWords(num) {
        const ones = [
            "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
            "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
            "seventeen", "eighteen", "nineteen"
        ];
        const tens = [
            "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
        ];

        function convert_hundreds(n) {
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
            return ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " and " + convert_hundreds(n % 100) : "");
        }

        function convert_thousands(n) {
            if (n < 1000) return convert_hundreds(n);
            if (n < 100000) {
                return convert_hundreds(Math.floor(n / 1000)) + " thousand" +
                    (n % 1000 ? " " + convert_hundreds(n % 1000) : "");
            }
            if (n < 10000000) {
                return convert_hundreds(Math.floor(n / 100000)) + " lakh" +
                    (n % 100000 ? " " + convert_thousands(n % 100000) : "");
            }
            return convert_hundreds(Math.floor(n / 10000000)) + " crore" +
                (n % 10000000 ? " " + convert_thousands(n % 10000000) : "");
        }

        if (isNaN(num)) return "invalid number";

        const [wholePart, decimalPart] = num.toString().split(".");
        const wholeNumber = parseInt(wholePart);
        const paise = parseInt((decimalPart || "0").slice(0, 2).padEnd(2, "0")); // Max 2 digits

        let words = convert_thousands(wholeNumber) + " rupees";
        if (paise > 0) {
            words += " and " + convert_thousands(paise) + " paise";
        }

        return words;
    }

    static async generatePoFilePdf(req, res) {
        try {
            const { location, date } = req.query;
            console.log("location and Date->>>>>>>>>", location, date);

            // const startOfToday = new Date(today.setHours(0, 0, 0, 0)); // 00:00:00
            // const endOfToday = new Date(today.setHours(23, 59, 59, 999)); // 23:59:59

            const formattedDate = new Date().toISOString().slice(0, 10);

            const existingPo = await DaburPurchaseData.findOne({
                where: {
                    [Op.and]: [
                        where(fn('DATE', col('customer_po_date')), formattedDate),
                        where(fn('LOWER', col('city')), location.toLowerCase())
                    ]
                }
            });
            console.log('existingPo-->>', existingPo);

            if (existingPo) {
                return res.status(400).json({
                    success: false,
                    message: `PO already created for ${location} on ${date}`
                });
            }
            const poFileData = await poFileUploads.findAll({
                attributes: [
                    'sku_code', 'sku_name', 'mrp', 'ean', 'hsn', 'gst_percentage',
                    'case_size', 'shelf_life', 'case_required', 'qty_required',
                    'total_cost', 'final_qty', 'status', 'city', 'created_at'
                ],
                where: {
                    city: location ? location : { [Op.ne]: null },
                    status: 'active',
                    [Op.and]: [
                        where(fn('DATE', col('created_at')), date) // compares only the date part
                    ]
                }
            });
            console.log("city-->>", location)

            // ✅ Step 2: Get the latest customer_po_number
            const latestPoData = await DaburPurchaseData.findOne({
                order: [['id', 'DESC']],
                limit: 1,
                attributes: ['customer_po_number', 'city'],
                where: {
                    city: location
                }
            });

            let customerPoNumber = latestPoData ? latestPoData.customer_po_number : null;

            // ✅ Step 3: Increment PO number
            let regex = /([A-Za-z]+)(\d+)$/;
            let match = customerPoNumber ? customerPoNumber.match(regex) : null;
            if (match) {
                let prefix = match[1];
                let numericPart = match[2];
                let incrementedNumeric = (parseInt(numericPart, 10) + 1).toString().padStart(numericPart.length, '0');
                customerPoNumber = prefix + incrementedNumeric;
                console.log("Updated PO Number: ", customerPoNumber);
            } else {
                console.log("PO Number format is not valid.");
            }

            // ✅ Step 4: Format data & calculate grand total
            let grandTotal = 0;
            let grandTax = 0;
            let taxableTotal = 0;
            const result = poFileData.map(item => {
                const originalTotal = parseFloat(item.final_qty * item.mrp);
                const discountedTotal = originalTotal * 0.75;

                console.log("discountedTotal-->>>", discountedTotal)

                const gstRate = parseFloat(item.gst_percentage) || 0;
                // const gstAmount = (discountedTotal * gstRate) / 100;
                const taxableAmount = discountedTotal / (1 + (gstRate / 100));  // 9000 / 1.18
                const gstAmount = discountedTotal - taxableAmount;
                const sgst = gstAmount / 2;
                const cgst = gstAmount / 2;
                const totalAmount = parseFloat(discountedTotal - gstAmount).toFixed(2);



                taxableTotal += taxableAmount;
                grandTax += gstAmount;
                grandTotal += discountedTotal;
                return {
                    sku_code: item.sku_code,
                    sku_name: item.sku_name,
                    mrp: item.mrp,
                    ean: item.ean,
                    hsn: item.hsn,
                    gst_percentage: item.gst_percentage,
                    case_size: item.case_size,
                    shelf_life: item.shelf_life,
                    case_required: item.case_required,
                    final_qty: item.final_qty,
                    original_total_cost: originalTotal.toFixed(2),
                    discounted_total_cost: discountedTotal.toFixed(2),
                    sgst: sgst.toFixed(2),
                    cgst: cgst.toFixed(2),
                    city: item.city,
                    created_at: item.created_at,
                    totalAmount: totalAmount,
                    grandTotal: grandTotal,
                };
            });

            const purchaseDataToInsert = poFileData.map(item => {
                const itemMrp = parseFloat(item.mrp);
                const itemPrice = itemMrp * 0.75;

                console.log("itemPrice-->>>", itemPrice)
                return {
                    city: item.city,
                    customer_po_number: customerPoNumber,
                    customer_po_date: new Date().toISOString().split('T')[0],// or new Date(date) if you trust the input
                    material_number: item.sku_code,
                    customer_article_no: item.ean,
                    disc: item.sku_name,
                    mrp: item.mrp,
                    net_price: itemPrice,
                    hsn_code: item.hsn,
                    gst: item.gst_percentage / 100,
                    case_size: item.case_size,
                    cases: item.case_required,
                    po_qty: item.final_qty
                };
            });

            await DaburPurchaseData.bulkCreate(purchaseDataToInsert);

            const totalInWords = FinanaceController.numberToWord(grandTotal.toFixed(2));

            // ✅ Step 5: Render EJS
            const templatePath = path.join(__dirname, '../views/poFileUploadReport.ejs');
            const html = await ejs.renderFile(templatePath, {
                data: result,
                location,
                date,
                customerPoNumber,
                totalInWords,
                grandTotal,
                grandTax,
                taxableTotal
            });
            console.log("result->>>>>>>", result)

            // ✅ Step 6: Generate PDF
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'load', timeout: 60000 });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                // margin: { top: '3mm', bottom: '1mm' }
            });

            await browser.close();

            // ✅ Step 7: Send PDF as response
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="po-file-upload-report.pdf"');
            res.setHeader('Content-Length', pdfBuffer.length);
            res.end(pdfBuffer);

        } catch (err) {
            console.error('Error generating PO File Upload PDF:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static numberToWord(num) {
        const ones = [
            "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
            "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
            "seventeen", "eighteen", "nineteen"
        ];
        const tens = [
            "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
        ];

        function convert_hundreds(n) {
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
            return ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " and " + convert_hundreds(n % 100) : "");
        }

        function convert_thousands(n) {
            if (n < 1000) return convert_hundreds(n);
            if (n < 100000) {
                return convert_hundreds(Math.floor(n / 1000)) + " thousand" +
                    (n % 1000 ? " " + convert_hundreds(n % 1000) : "");
            }
            if (n < 10000000) {
                return convert_hundreds(Math.floor(n / 100000)) + " lakh" +
                    (n % 100000 ? " " + convert_thousands(n % 100000) : "");
            }
            return convert_hundreds(Math.floor(n / 10000000)) + " crore" +
                (n % 10000000 ? " " + convert_thousands(n % 10000000) : "");
        }

        if (isNaN(num)) return "invalid number";

        const [wholePart, decimalPart] = num.toString().split(".");
        const wholeNumber = parseInt(wholePart);
        const paise = parseInt((decimalPart || "0").slice(0, 2).padEnd(2, "0"));

        let words = convert_thousands(wholeNumber) + " rupees";
        if (paise > 0) {
            words += " and " + convert_thousands(paise) + " paise";
        }

        return words;
    }

    // static async updateShopifyMetafields(req, res) {
    //     try {
    //         const result = await FinanceHelper.getManufacturedPayload(); // assuming FinanceHelper is correct

    //         if (result) {
    //             res.status(200).json({
    //                 message: 'Manufactured metafields updated successfully',
    //                 totalUpdated: result
    //             });
    //         } else {
    //             res.status(400).json({
    //                 message: 'Manufactured metafields not updated ',
    //             });

    //         }

    //     } catch (error) {
    //         console.error('Controller Error:', error.message);
    //         res.status(500).json({
    //             message: 'Failed to update manufactured metafields',
    //             error: error.message
    //         });
    //     }
    // }

    // static async updateSkuTitle(req, res) {
    //     try {
    //         const result = await FinanceHelper.updateSkuTitle(); // assuming FinanceHelper is correct

    //         if (result) {
    //             res.status(200).json({
    //                 message: 'Sku Title updated successfully',
    //                 totalUpdated: result
    //             });
    //         } else {
    //             res.status(400).json({
    //                 message: 'Sku Title not updated ',
    //             });

    //         }

    //     } catch (error) {
    //         console.error('Controller Error:', error.message);
    //         res.status(500).json({
    //             message: 'Failed to update Sku Title',
    //             error: error.message
    //         });
    //     }
    // }

    static async getChatbotMessgaes(req, res) {
        try {
            const { ipAddress, userId, chat } = req.body;
            if (!ipAddress || !userId || !chat) return res.status(404).json({
                success: false,
                message: "ipAddress, userId and chat are required fileds",
            })
            const chatData = await FinanceHelper.getChatData(ipAddress, userId, chat);
            return res.status(200).json({
                success: true,
                data: chatData,
            });
        } catch (error) {
            console.error('Error fetching Chat Data:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for Chat Data',
            });
        }
    }

    static async getSiensInventoryHealthModule(req, res) {
        try {
            const {
                location, startDate, endDate, limit, page,
                sortField, sortOrder, sortInventoryField, sortInventoryOrder
            } = req.body;

            const { combinedData, totalCount } = await FinanceHelper.getSiensInventoryHealthModule({
                location, startDate, endDate, limit, page,
                sortField, sortOrder, inventorySortField: sortInventoryField, inventorySortOrder: sortInventoryOrder
            });

            return res.status(200).json({
                success: true,
                data: combinedData,
                page: page || 1,
                total_count: totalCount
            });
        } catch (error) {
            console.error("Error in inventoryHealthModule:", error);
            return res.status(500).json({
                success: false,
                message: "Server error"
            });
        }
    }

    static async exportSiensInventoryHealthModule(req, res) {
        try {
            const queryData = req.query;
            const location = queryData?.location ?? "";
            const startDate = queryData?.startDate ?? "";
            const endDate = queryData?.endDate ?? "";

            const siensSkus = [
                "FR464015SET", "FR465030ET", "FR467030ET", "FR462030ET", "FR466030ET",
                "FR463100ET", "DABC115", "DABC116", "DABC117", "DABC118", "DABC119",
                "DABC120", "DABC121", "DABC122", "DABC123", "DABC124", "DABC125", "DABC126"
            ];

            // ✅ Orders Data
            const orderDetailData = await OrderDetail.findAll({
                attributes: [
                    "sku",
                    [Sequelize.fn("MAX", Sequelize.col("orderDetail.name")), "max_name"],
                    [Sequelize.fn("MAX", Sequelize.col("orderDetail.title")), "max_title"],
                    [Sequelize.col("order_data.warehouse_name"), "warehouse_name"],
                    [Sequelize.fn("COUNT", Sequelize.col("orderDetail.order_no")), "total_orders"],
                    [Sequelize.literal("SUM(orderDetail.quantity * orderDetail.price)"), "total_revenue"],
                    [Sequelize.literal(`ROUND(SUM(quantity) / GREATEST(DATEDIFF(CURDATE(), MIN(order_data.datetime)), 1), 2)`), "sales_per_day"]
                ],
                include: [
                    {
                        model: OrderBookingData,
                        as: "order_data",
                        attributes: [],
                        where: {
                            ...(location ? {
                                warehouse_name: Sequelize.where(
                                    Sequelize.fn("LOWER", Sequelize.col("order_data.warehouse_name")),
                                    "=",
                                    location.toLowerCase()
                                )
                            } : {}),
                            ...(startDate || endDate ? {
                                [Sequelize.Op.and]: [
                                    startDate ? Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), ">=", startDate) : null,
                                    endDate ? Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), "<=", endDate) : null
                                ].filter(Boolean)
                            } : {})
                        },
                        required: true
                    }
                ],
                where: { sku: siensSkus },
                group: ["order_data.warehouse_name", "sku"],
                raw: true
            });

            // ✅ Inventory Data
            const inventoryData = await InventoryItem.findAll({
                attributes: [
                    [Sequelize.literal(`
                    CASE 
                        WHEN location = 'H1' THEN 'Bangalore'
                        WHEN location = 'GND' THEN 'Gurgaon'
                        ELSE location
                    END
                `), "mapped_location"],
                    "sku_code",
                    [Sequelize.literal("SUM(qty)"), "Inventory_qty"]
                ],
                where: {
                    ...(location
                        ? {
                            location: location.toLowerCase() === "bangalore"
                                ? "H1"
                                : location.toLowerCase() === "gurgaon"
                                    ? "GND"
                                    : ""
                        }
                        : {}),
                    sku_code: siensSkus
                },
                group: ["mapped_location", "sku_code"],
                raw: true
            });

            // ✅ Dabur Purchase
            const daburPurchaseData = await sequelize.query(`
            SELECT 
                city, 
                material_number, 
                SUM(received_qty) AS total_received_qty,
                (
                    SELECT dpd.received_qty
                    FROM dabur_purchase_data dpd
                    WHERE dpd.city = outer_dpd.city
                      AND dpd.material_number = outer_dpd.material_number
                    ORDER BY dpd.created_at DESC
                    LIMIT 1
                ) AS last_received_qty
            FROM dabur_purchase_data AS outer_dpd
            ${location ? `WHERE city = '${location}'` : ""}
            ${location ? `AND` : `WHERE`} material_number IN (${siensSkus.map(sku => `'${sku}'`).join(",")})
            GROUP BY city, material_number
        `, { type: Sequelize.QueryTypes.SELECT });

            // ✅ Combine Data
            const combinedData = orderDetailData.map(orderDetail => {
                const matchingInventory = inventoryData.find(
                    data => data.mapped_location === orderDetail.warehouse_name && data.sku_code === orderDetail.sku
                );
                const matchingDabur = daburPurchaseData.find(
                    data => data.city === orderDetail.warehouse_name && data.material_number === orderDetail.sku
                );

                return {
                    warehouse_name: orderDetail.warehouse_name,
                    sku: orderDetail.sku,
                    name: orderDetail.max_name,
                    title: orderDetail.max_title,
                    total_orders: orderDetail.total_orders,
                    total_revenue: orderDetail.total_revenue,
                    sales_per_day: orderDetail.sales_per_day,
                    velocity: (orderDetail.sales_per_day * 10).toFixed(2),
                    Inventory_qty: matchingInventory ? matchingInventory.Inventory_qty : 0,
                    total_received_qty: matchingDabur ? matchingDabur.total_received_qty : 0,
                    last_received_qty: matchingDabur ? matchingDabur.last_received_qty : 0
                };
            });

            // ✅ Generate Excel
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet("Siens Inventory Health");
            worksheet.columns = [
                { header: "City", key: "warehouse_name" },
                { header: "SKU", key: "sku" },
                { header: "SKU Name", key: "name" },
                { header: "SKU Description", key: "title" },
                { header: "Total Orders", key: "total_orders" },
                { header: "Total Revenue", key: "total_revenue" },
                { header: "Sales per Day", key: "sales_per_day" },
                { header: "Velocity", key: "velocity" },
                { header: "SOH", key: "Inventory_qty" },
                { header: "Total PO Qty", key: "total_received_qty" },
                { header: "Last PO Qty", key: "last_received_qty" },
            ];

            combinedData.forEach(data => worksheet.addRow(data));

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=siens_inventory_health.xlsx");

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error("Export Error:", error);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    }

    static async exportSiensInventoryHealth(req, res) {
        try {
            const { location, startDate, endDate, sortField, sortOrder, inventorySortField, inventorySortOrder } = req.query;

            const data = await FinanceHelper.exportSiensInventoryHealthModule({
                location, startDate, endDate, sortField, sortOrder, inventorySortField, inventorySortOrder
            });

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Siens Inventory Health");

            sheet.columns = [
                { header: "SKU", key: "sku", width: 15 },
                { header: "Name", key: "name", width: 20 },
                { header: "Title", key: "title", width: 20 },
                { header: "Warehouse", key: "warehouse_name", width: 15 },
                { header: "Total Orders", key: "total_orders", width: 15 },
                { header: "Total Revenue", key: "total_revenue", width: 20 },
                { header: "Sales/Day", key: "sales_per_day", width: 15 },
                { header: "Inventory Qty", key: "Inventory_qty", width: 15 },
                { header: "Total Received Qty", key: "total_received_qty", width: 20 },
                { header: "Last Received Qty", key: "last_received_qty", width: 20 },
            ];

            sheet.addRows(data);

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=siens_inventory_health.xlsx");

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error("Export Error:", error);
            res.status(500).json({ message: "Error exporting Excel", error });
        }
    }



}

module.exports = FinanaceController;
