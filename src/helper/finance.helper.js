const { Op, Sequelize, fn, col } = require('sequelize');
const moment = require('moment');
const sequelize = require('../config/db'); // Adjust the path as necessary
const orderBookingData = require('../models/orderBookingData');
const OrderDetail = require('../models/orderDetail');
const DaburPurchaseData = require('../models/daburPurcahseData');
const DaburPincode = require('../models/daburPincode');
const OrderBookingData = require('../models/orderBookingData');
const RemittanceData = require('../models/remittanceData');
const InventoryItem = require('../models/inventoryItem');
const { setupAssociations } = require('../models/ModelAssociations');
const ProductMaster = require('../models/productMaster');
const axios = require("axios");
const ChatbotMessages = require('../models/ChatbotMessages');

class FinanceHelper {

    // static async getSalePurchaseData() {
    //     const currentMonth = new Date().getMonth() + 1; // Getting the current month (1-12)
    //     const results = await sequelize.query(
    //         `SELECT 
    //             ob.warehouse_name,
    //             '${currentMonth}' as currentmonth,
    //             SUM(dp.delivery_qty_ea) AS stock_purchase,
    //             SUM(CASE WHEN dp.delivery_qty_ea = 0 OR dp.net_price = 0 THEN 0 ELSE dp.delivery_qty_ea * dp.net_price END) AS stock_purchase_amount,
    //             SUM(dp.received_qty) AS grn_qty,
    //             SUM(dp.received_qty * dp.net_price) AS grn_amount,
    //             SUM(rd.remitted_amount) AS paid_to_dabur,
    //             SUM(dp.delivery_qty_ea * dp.net_price) - SUM(rd.remitted_amount) AS total_outstanding_amount,
    //             SUM(rd.bank_amount) AS in_bank,
    //             SUM(od.quantity * od.price) AS stock_sale_amount,
    //             SUM(od.quantity) AS stock_sale_unit
    //         FROM 
    //             order_booking_data ob
    //         JOIN 
    //             order_details od ON ob.order_number = od.order_no
    //         JOIN 
    //             dabur_purchase_data dp ON ob.warehouse_name = dp.city
    //         JOIN 
    //             remittance_data rd ON (dp.customer_po_number = rd.invoice_number AND MONTH(dp.created_at) = MONTH(rd.created_at))
    //         WHERE 
    //             MONTH(ob.created_at) = ? AND 
    //             MONTH(dp.created_at) = ? AND 
    //             MONTH(rd.created_at) = ?
    //         GROUP BY 
    //             ob.warehouse_name;`,
    //         {
    //             replacements: [currentMonth, currentMonth, currentMonth],
    //             type: sequelize.QueryTypes.SELECT
    //         }


    //     );


    //     console.log('results data -->>>', results)

    //     return results;
    // }


    static async getSalePurchaseData(req, res) {
        const selectedMonth = new Date().getMonth() + 1; // Default to the current month
        // Execute the query
        const results = await sequelize.query(
            `SELECT 
                pd.city, 
                ? AS currentmonth, 
                SUM(pd.delivery_qty_ea) AS stock_purchase, 
                SUM(pd.delivery_qty_ea * pd.net_price) AS stock_purchase_amount, 
                SUM(pd.received_qty) AS grn_qty, 
                SUM(pd.received_qty * pd.net_price) AS grn_amount, 
                MAX(sales.sale_units) AS stock_sale, 
                MAX(sales.sale_amount) AS stock_sale_amount, 
                MAX(remittance.paid_to_dabur) AS paid_to_dabur,
                MAX(remittance.in_bank) AS in_bank
            FROM 
                dabur_purchase_data pd
            LEFT JOIN 
                (
                    SELECT 
                        obd.warehouse_name AS city, 
                        SUM(od.quantity) AS sale_units, 
                        SUM(od.quantity * od.price) AS sale_amount 
                    FROM 
                        order_booking_data obd 
                    JOIN 
                        order_details od 
                    ON 
                        obd.order_number = od.order_no 
                    WHERE 
                        MONTH(obd.created_at) = ? 
                    GROUP BY 
                        obd.warehouse_name
                ) AS sales 
            ON 
                pd.city = sales.city
            LEFT JOIN 
                (
                    SELECT 
                        city, 
                        SUM(remitted_amount) AS paid_to_dabur,
                        SUM(bank_amount) AS in_bank
                    FROM 
                        remittance_data 
                    WHERE 
                        MONTH(transaction_date) = ? 
                    GROUP BY 
                        city
                ) AS remittance 
            ON 
                pd.city = remittance.city
            WHERE 
                MONTH(pd.created_at) = ?
                GROUP BY 
                pd.city;`,
            {
                replacements: [selectedMonth, selectedMonth, selectedMonth, selectedMonth],
                type: sequelize.QueryTypes.SELECT,
            }
        );
        console.log('results data -->>>', results)
        return results;

    }

    static async getSkuSalePurchaseData(page, limit, startDate, endDate, location) {
        try {
            const offset = (page - 1) * limit; // Pagination offset
            let locations = []; // Default to an empty array if location is not provided
            if (location) {
                locations = location.map((loc) => loc.toLowerCase()); // Handle multiple locations if provided
            }

            const dateCondition = (field) =>
                startDate && endDate ? `AND DATE(${field}) >= :startDate AND DATE(${field}) <= :endDate` : "";

            // Build the query with conditional location filter
            const query = `
                SELECT p.sku, s.name, p.total_purchase, p.total_bad_bin, s.total_sale
                FROM (
                    SELECT material_number AS sku, SUM(delivery_qty_ea) AS total_purchase, SUM(bad_bin) AS total_bad_bin
                    FROM dabur_purchase_data
                    WHERE 1=1 ${locations.length > 0 ? 'AND lower(city) IN (:locations)' : ''} 
                    ${dateCondition("delivery_date")}
                    GROUP BY material_number
                ) AS p
                LEFT JOIN (
                    SELECT od.sku, od.name, SUM(od.quantity) AS total_sale
                    FROM order_details od
                    JOIN order_booking_data ob ON od.order_no = ob.order_number
                    WHERE 1=1 ${locations.length > 0 ? 'AND lower(ob.warehouse_name) IN (:locations)' : ''}
                    ${dateCondition("ob.datetime")}
                    GROUP BY od.sku, od.name
                ) AS s ON p.sku = s.sku
                LIMIT :limit OFFSET :offset
            `;

            // Fetch data from DB
            const [results] = await sequelize.query(query, {
                replacements: { limit, offset, startDate, endDate, locations },
                raw: true,
            });

            // Format the result
            const finalResult = results.map((row) => ({
                sku: row.sku || null,
                name: row.name || null,
                stock_purchase: row.total_purchase || 0,
                total_sale: row.total_sale || 0,
                warehouse_stock: (row.total_purchase || 0) - (row.total_sale || 0),
                damaged_stock: row.total_bad_bin || 0,
            }));

            // Fetch the total count for pagination
            const countQuery = `
                SELECT COUNT(DISTINCT material_number) AS totalRecords
                FROM dabur_purchase_data
                WHERE 1=1 ${locations.length > 0 ? 'AND lower(city) IN (:locations)' : ''}
                ${dateCondition("delivery_date")}
            `;
            const [countResult] = await sequelize.query(countQuery, {
                replacements: { startDate, endDate, locations },
                raw: true,
            });

            const totalRecords = countResult[0].totalRecords || 0;
            const totalPages = Math.ceil(totalRecords / limit);

            return {
                data: finalResult,
                metadata: { currentPage: page, totalPages, totalRecords, limit },
            };
        } catch (error) {
            console.error('Error fetching SKU sale and purchase data:', error);
            throw error;
        }
    }

    static async getRemittanceOutstandingData(startDate, endDate, location) {
        try {
            const whereConditon = {};
            if (location) whereConditon.city = location;

            if (startDate && endDate) whereConditon.order_date = {
                [Op.between]: [startDate, endDate],
            };
            const purchaseData = await DaburPurchaseData.findOne({
                attributes: [
                    [
                        Sequelize.literal('IFNULL(SUM(delivery_qty_ea * net_price), 0)'),
                        'total_purchase',
                    ],
                    [
                        Sequelize.literal('IFNULL(SUM(received_qty * net_price), 0)'),
                        'total_remittance',
                    ],
                    [
                        Sequelize.literal('SUM((delivery_qty_ea * net_price) - IFNULL((received_qty * net_price), 0))'),
                        'total_outstanding',
                    ],
                ],
                where: whereConditon,
                raw: true, // Return plain JavaScript object
            });

            return purchaseData;
        } catch (error) {
            console.error('Error fetching SKU sale and purchase data:', error);
            throw error;
        }
    }

    static async getManufacturedPayload() {
        try {
            const products = await ProductMaster.findAll({
                attributes: ['variant_id', 'manufactured_by', 'manufactured_unit_2', 'manufactured_unit_3', 'manufactured_unit_4', 'marketed_by'],
                where: {
                    manufactured_by: { [Op.ne]: null },
                    marketed_by: { [Op.ne]: null }
                },
                raw: true
            });

            let successCount = 0;

            for (const product of products) {
                const payload = await this.updateManufacturedMetafields(
                    product.variant_id,
                    product.marketed_by,
                    product.manufactured_by,
                    product.manufactured_unit_2,
                    product.manufactured_unit_3,
                    product.manufactured_unit_4,
                );
                successCount++;
                console.log("payload ------->>>>>>>", payload);
            }

            return successCount;
        } catch (error) {
            console.error('Error in getManufacturedPayload:', error.message);
            return false;
        }
    }

    static async getChatData(ipAddress, userId, chat) {
        try {
            // Save the chat into the database
            const savedChat = await ChatbotMessages.create({
                ip_address: ipAddress,
                user_id: userId,
                chat: chat
            });

            return savedChat; // returns the saved record
        } catch (error) {
            console.error('Error saving chat data:', error);
            throw error;
        }
    }

    static async getSiensInventoryHealthModule({ location, startDate, endDate, limit = 10, page = 1, sortField, sortOrder, inventorySortField, inventorySortOrder }) {
        const siensSkus = [
            "FR464015SET", "FR465030ET", "FR467030ET", "FR462030ET", "FR466030ET",
            "FR463100ET", "DABC115", "DABC116", "DABC117", "DABC118", "DABC119",
            "DABC120", "DABC121", "DABC122", "DABC123", "DABC124", "DABC125", "DABC126"
        ];

        const computedColumns = [
            "total_orders", "total_revenue", "sales_per_day", "Inventory_qty"
        ];

        let orderByClause = [];
        if (sortField && computedColumns.includes(sortField)) {
            orderByClause = [Sequelize.literal(`${sortField} ${sortOrder}`)];
        }

        const offset = (page - 1) * limit;

        // ✅ Main Data
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
            subQuery: false,
            order: orderByClause.length > 0 ? orderByClause : undefined,
            limit,
            offset,
            raw: true
        });

        // ✅ Count
        const countResult = await OrderDetail.findAll({
            attributes: [
                [Sequelize.literal("DISTINCT CONCAT(order_data.warehouse_name, '-', sku)"), "sku_group"]
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
            raw: true
        });
        const totalCount = countResult.length;

        // ✅ Inventory
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
            order: inventorySortField ? [Sequelize.literal(`${inventorySortField} ${inventorySortOrder}`)] : undefined,
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

        // ✅ Combine
        const combinedData = orderDetailData.map(orderDetail => {
            const matchingInventory = inventoryData.find(
                data => data.mapped_location === orderDetail.warehouse_name && data.sku_code === orderDetail.sku
            );
            const matchingDabur = daburPurchaseData.find(
                data => data.city === orderDetail.warehouse_name && data.material_number === orderDetail.sku
            );

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
                last_received_qty: matchingDabur ? matchingDabur.last_received_qty : 0
            };
        });

        return { combinedData, totalCount };
    }

    static async exportSiensInventoryHealthModule({ location, startDate, endDate, sortField, sortOrder, inventorySortField, inventorySortOrder }) {
        const siensSkus = [
            "FR464015SET", "FR465030ET", "FR467030ET", "FR462030ET", "FR466030ET",
            "FR463100ET", "DABC115", "DABC116", "DABC117", "DABC118", "DABC119",
            "DABC120", "DABC121", "DABC122", "DABC123", "DABC124", "DABC125", "DABC126"
        ];

        const computedColumns = ["total_orders", "total_revenue", "sales_per_day", "Inventory_qty"];

        let orderByClause = [];
        if (sortField && computedColumns.includes(sortField)) {
            orderByClause = [Sequelize.literal(`${sortField} ${sortOrder}`)];
        }

        // ✅ Main Orders Data
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
                        ...(location && {
                            warehouse_name: Sequelize.where(
                                Sequelize.fn("LOWER", Sequelize.col("order_data.warehouse_name")),
                                "=",
                                location.toLowerCase()
                            )
                        }),
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
            subQuery: false,
            order: orderByClause.length > 0 ? orderByClause : undefined,
            raw: true
        });

        // ✅ Inventory
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
            order: inventorySortField ? [Sequelize.literal(`${inventorySortField} ${inventorySortOrder}`)] : undefined,
            raw: true
        });

        // ✅ Dabur Purchase Data
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

        // ✅ Merge All
        const combinedData = orderDetailData.map(orderDetail => {
            const matchingInventory = inventoryData.find(
                data => data.mapped_location === orderDetail.warehouse_name && data.sku_code === orderDetail.sku
            );
            const matchingDabur = daburPurchaseData.find(
                data => data.city === orderDetail.warehouse_name && data.material_number === orderDetail.sku
            );

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
                last_received_qty: matchingDabur ? matchingDabur.last_received_qty : 0
            };
        });

        return combinedData;  // ⚡ only data (no pagination, no totalCount)
    }



}

module.exports = FinanceHelper;