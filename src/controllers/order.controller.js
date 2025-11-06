const { Sequelize, Op, fn, col, where, literal, NUMBER } = require('sequelize');
const sequelize = require('../config/db');
const OrderBookingData = require('../models/orderBookingData');
const ZendeskTicketingData = require('../models/zendeskTicketingData');
const WhatsappResponse = require('../models/whatsappResponse');
const OrderHelper = require('../helper/order.helper');
const { Parser } = require('json2csv');
const exceljs = require('exceljs'); // For XLS export
const fs = require('fs');
const OrderDetail = require('../models/orderDetail');
const ExcelJS = require("exceljs");
const moment = require("moment");

class OrderController {

    static async getOrders(req, res) {
        try {
            // Get today's date in IST
            const today = new Date();
            today.setHours(today.getHours() + 5, today.getMinutes() + 30); // Convert to IST
            const formattedToday = today.toISOString().split('T')[0]; // Format date as YYYY-MM-DD

            // Single query using Sequelize ORM to get all counts for orders
            const orderResult = await OrderBookingData.findAll({
                attributes: [
                    [fn('SUM', literal(`CASE WHEN LOWER(order_status) = 'delivered' AND cust_delivery_date IS NOT NULL AND delivery_date IS NOT NULL THEN 1 ELSE 0 END`)), 'totalDeliveredOrders'],
                    [fn('SUM', literal(`CASE WHEN LOWER(order_status) = 'delivered' AND cust_delivery_date >= delivery_date AND cust_delivery_date IS NOT NULL AND delivery_date IS NOT NULL THEN 1 ELSE 0 END`)), 'onTimeDelivery'],
                    [fn('SUM', literal(`CASE WHEN LOWER(order_status) = 'delivered' AND cust_delivery_date < delivery_date AND cust_delivery_date IS NOT NULL AND delivery_date IS NOT NULL THEN 1 ELSE 0 END`)), 'delayedDelivery'],
                    [fn('SUM', literal(`CASE WHEN DATE(cust_delivery_date) <= '${formattedToday}' AND LOWER(order_status) NOT IN ('shipped & returned', 'delivered', 'pending', 'cancelled', 'rto', 'rto-initiated') THEN 1 ELSE 0 END`)), 'delayedOrders'],
                    [fn('SUM', literal(`CASE WHEN DATE(datetime) = '${formattedToday}' AND TIME(datetime) <= '11:30:00' AND LOWER(order_status) != 'packed' AND (TIME(datetime) <= '12:30:00' OR order_status != 'packed') THEN 1 ELSE 0 END`)), 'delayInPacking']
                ],
                raw: true
            });

            // Since findAll returns an array, access the first result
            const [orderData] = orderResult;

            // Query to count tickets where status is NOT 'closed' or 'solved'
            const ticketCounts = await ZendeskTicketingData.count({
                where: {
                    status: {
                        [Op.notIn]: ['closed', 'solved'] // Exclude 'closed' and 'solved' statuses
                    }
                }
            });

            // Return the results
            res.status(200).json({
                totalDeliveredOrders: orderData.totalDeliveredOrders || 0,
                onTimeDelivery: orderData.onTimeDelivery || 0,
                delayedDelivery: orderData.delayedDelivery || 0,
                delayedOrders: orderData.delayedOrders || 0,
                delayInPacking: orderData.delayInPacking || 0,
                total_tickets: ticketCounts
            });
        } catch (error) {
            console.error('Error fetching order and ticket stats:', error.message);
            res.status(500).json({ message: 'Server Error' });
        }
    }

    static async getFilteredOrders(req, res) {
        try {
            const { filter, startDate, endDate, order_number, limit, page_number } = req.body;

            const orders = await OrderHelper.getFilteredOrders({
                filter,
                startDate,
                endDate,
                order_number,
                limit,
                page_number
            });

            const totalPages = Math.ceil(orders.count / (limit || 10));

            return res.status(200).json({
                message: 'Orders fetched successfully',
                data: orders.rows,
                meta: {
                    totalItems: orders.count,
                    totalPages,
                    currentPage: page_number || 1,
                    limit: limit || 10
                }
            });
        } catch (error) {
            console.error('Error in getFilteredOrders:', error);
            return res.status(500).json({ message: 'Server Error', error: error.message });
        }
    }

    static async orderOverview(req, res) {
        try {
            const userId = req.user.id; // Extract user_id from the token (from authMiddleware)
            const bodyData = req.body;
            console.log('body data:', bodyData);

            // Today's Orders for the user
            const todaysOrders = await OrderBookingData.count({
                where: {
                    [Op.and]: [
                        Sequelize.where(Sequelize.fn('DATE', col('datetime')), {
                            [Op.eq]: fn('DATE', fn('NOW')) // Match today's date
                        })
                    ],
                }
            });

            // Yesterday's Orders for the user
            const yesterdaysOrders = await OrderBookingData.count({
                where: {
                    [Op.and]: [
                        Sequelize.where(Sequelize.fn('DATE', col('datetime')), {
                            [Op.eq]: fn('DATE', fn('DATE_SUB', fn('NOW'), literal('INTERVAL 1 DAY'))),  // Match yesterday's date
                        })
                    ],
                }
            });

            // Today's Revenue for the user
            const todaysRevenue = await OrderBookingData.sum('total_price', {
                where: {
                    [Op.and]: [
                        Sequelize.where(Sequelize.fn('DATE', col('datetime')), {
                            [Op.eq]: fn('DATE', fn('NOW')) // Match today's date
                        })
                    ],
                    // user_id: userId 
                }
            });

            // Yesterday's Revenue for the user
            const yesterdaysRevenue = await OrderBookingData.sum('total_price', {
                where: {
                    [Op.and]: [
                        Sequelize.where(Sequelize.fn('DATE', col('datetime')), {
                            [Op.eq]: fn('DATE', fn('DATE_SUB', fn('NOW'), literal('INTERVAL 1 DAY'))),  // Match yesterday's date
                        })
                    ],
                    // user_id: userId,
                }
            });

            const todayShipping = await OrderBookingData.findOne({
                attributes: [
                    [fn('SUM', col('total_shipping')), 'sum'],
                    [fn('COUNT', col('total_shipping')), 'count']
                ],
                where: {
                    [Op.and]: [
                        Sequelize.where(fn('DATE', col('datetime')), {
                            [Op.eq]: fn('DATE', fn('NOW'))
                        })
                        // , { user_id: userId }
                    ]
                }
            });

            const todayShippingSum = parseFloat(todayShipping?.dataValues?.sum || 0);
            const todayShippingCount = parseInt(todayShipping?.dataValues?.count || 0);
            const todayAvgShipping = todayShippingCount > 0 ? Number(todayShippingSum / todayShippingCount).toFixed(2) : 0;

            // 🚚 Yesterday's Average Shipping
            const yesterdayShipping = await OrderBookingData.findOne({
                attributes: [
                    [fn('SUM', col('total_shipping')), 'sum'],
                    [fn('COUNT', col('total_shipping')), 'count']
                ],
                where: {
                    [Op.and]: [
                        Sequelize.where(fn('DATE', col('datetime')), {
                            [Op.eq]: fn('DATE', fn('DATE_SUB', fn('NOW'), literal('INTERVAL 1 DAY')))
                        })
                        // , { user_id: userId }
                    ]
                }
            });

            const yesterdayShippingSum = parseFloat(yesterdayShipping?.dataValues?.sum || 0);
            const yesterdayShippingCount = parseInt(yesterdayShipping?.dataValues?.count || 0);
            const yesterdayAvgShipping = yesterdayShippingCount > 0 ? Number(yesterdayShippingSum / yesterdayShippingCount).toFixed(2) : 0;

            const orderSummary = await OrderHelper.countOrdersByStatus(bodyData.start_date, bodyData.end_date);


            // Return the results
            res.status(200).json({
                orderOverview: {
                    todaysOrders: todaysOrders || 0,
                    yesterdaysOrders: yesterdaysOrders || 0,
                    todaysRevenue: todaysRevenue || 0,
                    yesterdaysRevenue: yesterdaysRevenue || 0,
                    todayAvgShipping: todayAvgShipping || 0,
                    yesterdayAvgShipping: yesterdayAvgShipping || 0
                },
                orderDetails: orderSummary
            }
            );
        } catch (error) {
            console.error('Error fetching dashboard metrics:', error.message);
            res.status(500).json({ message: 'Server Error' });
        }
    }

    static async OtherStatusOverviewData(req, res) {
        try {
            const { start_date, end_date, statusType, limit = 10, page = 1 } = req.body;
            const offset = (page - 1) * limit;

            console.log('Request Body:', req.body);

            const othersStatusData = await OrderHelper.getListingOrdersByStatus(
                start_date,
                end_date,
                statusType,
                limit,
                offset
            );

            res.status(200).json({
                success: true,
                result: othersStatusData,
                total: othersStatusData?.total


            });

        } catch (error) {
            console.error('Error fetching Others Status Data:', error.message);
            res.status(500).json({
                success: false,
                message: 'Server Error',
                error: error.message
            });
        }
    }

    static async ordersDeliveryPartner(req, res) {
        try {

            const bodyData = req.body;
            console.log('body data:', bodyData);
            // Use the helper function to get the data asynchronously
            const partnerData = await OrderHelper.getOrderStatusByPartner(bodyData.start_date, bodyData.end_date);

            // Send the response with the fetched data
            return res.status(200).json({
                success: true,
                data: partnerData
            });
        } catch (error) {
            // Log the error for debugging
            console.error('Error fetching orders by delivery partner:', error.message);

            // Respond with error details
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders by delivery partner',
                error: error.message // Optional: error message for troubleshooting
            });
        }
    }

    static async getOrdersCourierPartner(req, res) {
        try {
            const { start_date: startDate, end_date: endDate } = req.body;
            console.log('data-->>', req.body)

            // Use the helper function to get the data asynchronously
            const partnerData = await OrderHelper.getOrdersCourierData(startDate, endDate);

            // Send the response with the fetched data
            return res.status(200).json({
                success: true,
                data: partnerData,
            });
        } catch (error) {
            // Log the error for debugging
            console.error('Error fetching orders by delivery partner:', error.message);

            // Respond with error details
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders by delivery partner',
                error: error.message, // Optional: error message for troubleshooting
            });
        }
    }

    static async getOrdersCourierlisting(req, res) {
        try {
            // Extract query parameters
            const { startDate, endDate, deliveryPartner, page = 1, limit = 10 } = req.body;
            // Validate delivery partner
            const validPartners = ['dtdc', 'ecom', 'ekart', 'rapid ship'];
            if (!deliveryPartner || !validPartners.includes(deliveryPartner.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid delivery partner. Valid options are: ${validPartners.join(', ')}`,
                });
            }

            // Fetch orders and total count using Sequelize
            const offset = (page - 1) * limit;
            const filters = [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('lm_partner')), deliveryPartner.toLowerCase()),
            ];

            // Conditionally add date filters
            if (startDate && endDate) {
                const validStartDate = new Date(startDate);
                const validEndDate = new Date(endDate);
                if (isNaN(validStartDate) || isNaN(validEndDate)) {
                    throw new Error('Invalid date format');
                }
                const formattedStartDate = validStartDate.toISOString().split('T')[0];
                const formattedEndDate = validEndDate.toISOString().split('T')[0];
                filters.push(
                    sequelize.where(sequelize.fn('DATE', sequelize.col('datetime')), {
                        [Op.gte]: formattedStartDate,
                        [Op.lte]: formattedEndDate,
                    })
                );
            }

            const { count: totalCount, rows: orders } = await OrderBookingData.findAndCountAll({
                where: {
                    [Op.and]: filters, // Dynamically built filters
                },
                offset,
                limit: parseInt(limit, 10),
                order: [['datetime', 'DESC']],
            });

            const totalPages = Math.ceil(totalCount / limit);

            // Send response
            return res.status(200).json({
                success: true,
                data: {
                    orders,
                    pagination: {
                        total: totalCount,
                        page: parseInt(page, 10),
                        totalPages,
                    },
                },
            });
        } catch (error) {
            console.error('Error fetching courier orders:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders',
                error: error.message,
            });
        }
    }

    static async orderCount(req, res) {
        try {
            let { page, limit, startDate, endDate, courier, payment_mode, location } = req.body;

            // Default pagination settings
            if (!page || page <= 0) {
                page = 1;
            }
            if (!limit || limit <= 0) {
                limit = 10;
            }

            page = parseInt(page);
            limit = parseInt(limit);

            const orderCounts = await OrderHelper.getOrderCountsByDate(page, limit, startDate, endDate, courier, payment_mode, location);

            if (!orderCounts.success) {
                return res.status(500).json({
                    success: false,
                    message: orderCounts.message || 'Failed to fetch order counts by date and status',
                });
            }
            console.log('total page-->>>', orderCounts?.pagination?.totalPages)
            return res.status(200).json({
                success: true,
                data: orderCounts.data, // Return the data directly without filtering
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(orderCounts?.pagination?.totalPages),
                    totalOrders: orderCounts?.pagination?.totalOrders,
                },
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getDistinctState(req, res) {
        try {
            const distinctStates = await OrderHelper.getDistinctState();
            return res.status(200).json({
                success: true,
                data: distinctStates
            });
        } catch (error) {
            console.error('Error in getting distinct states:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve distinct states'
            });
        }
    }

    static async getAnalyticsData(req, res) {
        try {
            const { start_date, end_date, type, start_month, end_month, start_year, end_year, locations } = req.body;
            console.log('data-->>', req.body)
            const analyticsData = await OrderHelper.getAnalyticsData({
                start_date,
                end_date,
                type,
                start_month,
                end_month,
                start_year,
                end_year,
                locations
            });
            return res.status(200).json({
                success: true,
                data: analyticsData
            });
        } catch (error) {
            console.error('Error in getAnalyticsData:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for analytics'
            });
        }
    }

    static async getBrandwiseSalesSummary(req, res) {
        try {
            const { locations = [] } = req.body;
            console.log('data-->>', req.body)
            const analyticsData = await OrderHelper.getBrandWiseSales(locations);
            return res.status(200).json({
                success: true,
                data: analyticsData
            });
        } catch (error) {
            console.error('Error in getBrandwiseSalesSummary:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for analytics'
            });
        }
    }

    static async getPurchaseGrnData(req, res) {
        try {
            let { startDate, endDate, page, limit, location } = req.body;
            if (!page || page == '') {
                page = 1;
            }
            if (!limit || limit == '') {
                limit = 10;
            }
            console.log('data-->>', startDate, endDate, page, limit, location)

            const purchaseGrnData = await OrderHelper.getPurchaseGrnData(startDate, endDate, location);
            const purchaseGrnDataSkuWise = await OrderHelper.getPurchaseGrnDataSkuWise(startDate, endDate, page, limit, location);
            console.log('In controller data >>>', purchaseGrnDataSkuWise)
            const pagination = purchaseGrnDataSkuWise.pagination;
            const purchaseGrnDataSkuWiseData = purchaseGrnDataSkuWise.purchaseGrnDataSkuWiseData;
            return res.status(200).json({
                success: true,
                data: {
                    purchaseGrnData,
                    purchaseGrnDataSkuWiseData
                },
                pagination
            });
        } catch (error) {
            console.error('Error in getPurchaseGrnData:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data'
            });
        }

    }

    static async getPendencyFunnel(req, res) {
        try {
            let { page, limit, courier, payment_mode, start_date, end_date, sort_by, sort_order } = req.body;

            if (!page || page === '') page = 1;
            if (!limit || limit === '') limit = 10;

            page = parseInt(page);
            limit = parseInt(limit);
            sort_order = sort_order?.toLowerCase() === 'asc' ? 'asc' : 'desc';

            console.log('get pendency api is working');

            // Base condition for filters
            let filterCondition = '';

            if (courier) {
                filterCondition += ` AND LOWER(lm_partner) = '${courier.toLowerCase()}'`;
            }
            if (payment_mode) {
                const financial_status = payment_mode.toLowerCase() === 'cod' ? 'pending' : 'paid';
                filterCondition += ` AND LOWER(financial_status) = '${financial_status}'`;
            }

            if (start_date && end_date) {
                filterCondition += ` AND DATE(cust_delivery_date) BETWEEN '${start_date}' AND '${end_date}'`;
            } else if (start_date) {
                filterCondition += ` AND DATE(cust_delivery_date) >= '${start_date}'`;
            } else if (end_date) {
                filterCondition += ` AND DATE(cust_delivery_date) <= '${end_date}'`;
            }

            const orderStatsQuery = `
            SELECT 
                shipping_province,
                COUNT(*) AS total_orders,
                SUM(CASE WHEN LOWER(order_status) IN ('delivered') THEN 1 ELSE 0 END) AS delivered_orders,
                SUM(CASE WHEN LOWER(order_status) IN ('cancelled') THEN 1 ELSE 0 END) AS cancelled_orders,
                SUM(CASE WHEN LOWER(order_status) IN (
                    'shipped & returned', 'rto-delivered', 'destroyed', 'lostintransit',
                    'returned', 'rto lock', 'closed', 'ofd lock', 'mis route'
                ) THEN 1 ELSE 0 END) AS terminal_orders
            FROM order_booking_data
            WHERE 1=1 ${filterCondition} 
            GROUP BY shipping_province;
        `;

            const orderStats = await OrderBookingData.sequelize.query(orderStatsQuery, {
                type: Sequelize.QueryTypes.SELECT,
            });

            const offset = (page - 1) * limit;

            const pendencyDataQuery = `
            SELECT 
                shipping_province,
                SUM(IF(TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) < 24, 1, 0)) AS first_day,
                SUM(IF(TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) BETWEEN 24 AND 48, 1, 0)) AS second_day,
                SUM(IF(TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) BETWEEN 48 AND 72, 1, 0)) AS third_day,
                SUM(IF(TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) BETWEEN 72 AND 96, 1, 0)) AS forth_day,
                SUM(IF(TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) > 96, 1, 0)) AS fifth_day
            FROM order_booking_data
            WHERE 
                cust_delivery_date IS NOT NULL 
                AND LOWER(order_status) NOT IN (
                    'delivered', 'cancelled', 'shipped & returned', 'rto-delivered',
                    'destroyed', 'lostintransit', 'returned', 'rto lock', 'closed', 'ofd lock', 'mis route'
                )
                ${filterCondition}
            GROUP BY shipping_province;
        `;

            const pendencyData = await OrderBookingData.sequelize.query(pendencyDataQuery, {
                type: Sequelize.QueryTypes.SELECT,
            });

            const combinedData = pendencyData.map((pendencyRow) => {
                const orderStatRow = orderStats.find(
                    (stat) => stat.shipping_province === pendencyRow.shipping_province
                );
                return {
                    shipping_province: pendencyRow.shipping_province,
                    total_orders: orderStatRow ? orderStatRow.total_orders : 0,
                    delivered_orders: orderStatRow ? orderStatRow.delivered_orders : 0,
                    cancelled_orders: orderStatRow ? orderStatRow.cancelled_orders : 0,
                    terminal_orders: orderStatRow ? orderStatRow.terminal_orders : 0,
                    first_day: pendencyRow.first_day,
                    second_day: pendencyRow.second_day,
                    third_day: pendencyRow.third_day,
                    forth_day: pendencyRow.forth_day,
                    fifth_day: pendencyRow.fifth_day,
                };
            });

            // ✅ Apply Sorting (in-memory)
            if (sort_by && combinedData[0]?.hasOwnProperty(sort_by)) {
                combinedData.sort((a, b) => {
                    const valA = a[sort_by] || 0;
                    const valB = b[sort_by] || 0;
                    return sort_order === 'asc' ? valA - valB : valB - valA;
                });
            }

            // ✅ Apply pagination after sorting
            const paginatedData = combinedData.slice(offset, offset + limit);
            const totalPages = Math.ceil(combinedData.length / limit);

            return res.status(200).json({
                success: true,
                currentPage: page,
                totalPages,
                totalOrders: combinedData.length,
                data: paginatedData,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getPendencyOrdersListing(req, res) {
        try {
            let {
                shipping_province,
                count_type,
                courier,
                payment_mode,
                start_date,
                end_date,
                page,
                limit
            } = req.body;

            if (!shipping_province || !count_type) {
                return res.status(400).json({ success: false, message: "Missing required fields." });
            }

            page = parseInt(page) || 1;
            limit = parseInt(limit) || 10;
            const offset = (page - 1) * limit;

            // Build base WHERE condition
            let whereClause = `WHERE shipping_province = '${shipping_province}'`;

            if (courier) {
                whereClause += ` AND LOWER(lm_partner) = '${courier.toLowerCase()}'`;
            }

            if (payment_mode) {
                const financial_status = payment_mode.toLowerCase() === 'cod' ? 'pending' : 'paid';
                whereClause += ` AND LOWER(financial_status) = '${financial_status}'`;
            }

            if (start_date && end_date) {
                whereClause += ` AND DATE(cust_delivery_date) BETWEEN '${start_date}' AND '${end_date}'`;
            } else if (start_date) {
                whereClause += ` AND DATE(cust_delivery_date) >= '${start_date}'`;
            } else if (end_date) {
                whereClause += ` AND DATE(cust_delivery_date) <= '${end_date}'`;
            }

            // Status condition based on count_type
            const terminal_statuses = [
                'shipped & returned', 'rto-delivered', 'destroyed', 'lostintransit',
                'returned', 'rto lock', 'closed', 'ofd lock', 'mis route'
            ];

            let extraCondition = '';

            switch (count_type) {
                case 'total_orders':
                    break;
                case 'delivered_orders':
                    extraCondition += ` AND LOWER(order_status) = 'delivered'`;
                    break;
                case 'cancelled_orders':
                    extraCondition += ` AND LOWER(order_status) = 'cancelled'`;
                    break;
                case 'terminal_orders':
                    extraCondition += ` AND LOWER(order_status) IN (${terminal_statuses.map(s => `'${s}'`).join(',')})`;
                    break;
                case 'first_day':
                    extraCondition += ` AND LOWER(order_status) NOT IN ('delivered', 'cancelled', ${terminal_statuses.map(s => `'${s}'`).join(',')})`;
                    extraCondition += ` AND TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) < 24`;
                    break;
                case 'second_day':
                    extraCondition += ` AND LOWER(order_status) NOT IN ('delivered', 'cancelled', ${terminal_statuses.map(s => `'${s}'`).join(',')})`;
                    extraCondition += ` AND TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) BETWEEN 24 AND 48`;
                    break;
                case 'third_day':
                    extraCondition += ` AND LOWER(order_status) NOT IN ('delivered', 'cancelled', ${terminal_statuses.map(s => `'${s}'`).join(',')})`;
                    extraCondition += ` AND TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) BETWEEN 48 AND 72`;
                    break;
                case 'forth_day':
                    extraCondition += ` AND LOWER(order_status) NOT IN ('delivered', 'cancelled', ${terminal_statuses.map(s => `'${s}'`).join(',')})`;
                    extraCondition += ` AND TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) BETWEEN 72 AND 96`;
                    break;
                case 'fifth_day':
                    extraCondition += ` AND LOWER(order_status) NOT IN ('delivered', 'cancelled', ${terminal_statuses.map(s => `'${s}'`).join(',')})`;
                    extraCondition += ` AND TIMESTAMPDIFF(HOUR, DATE_ADD(DATE(cust_delivery_date), INTERVAL '15:30' HOUR_MINUTE), NOW()) > 96`;
                    break;
                default:
                    return res.status(400).json({ success: false, message: "Invalid count type." });
            }

            // 🧮 Total Count Query
            const countQuery = `
            SELECT COUNT(*) as totalCount
            FROM order_booking_data
            ${whereClause} ${extraCondition}
        `;

            const [{ totalCount }] = await OrderBookingData.sequelize.query(countQuery, {
                type: Sequelize.QueryTypes.SELECT
            });

            // 📦 Paginated Data Query
            const dataQuery = `
            SELECT 
                order_number, 
                billing_name, 
                created_at,
                cust_delivery_date, 
                phone,
                shipping_city,
                order_status,
                total_price, 
                financial_status, 
                lm_partner
            FROM order_booking_data
            ${whereClause} ${extraCondition}
            ORDER BY cust_delivery_date DESC
            LIMIT :limit OFFSET :offset
        `;

            const orders = await OrderBookingData.sequelize.query(dataQuery, {
                replacements: { limit, offset },
                type: Sequelize.QueryTypes.SELECT,
            });

            return res.status(200).json({
                success: true,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                pageSize: limit,
                data: orders,
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                message: 'Server Error',
            });
        }
    }

    static async getOtiffReport(req, res) {
        try {
            let { page, limit, start_date, end_date } = req.body;

            if (!page || page === '') page = 1;
            if (!limit || limit === '') limit = 10;

            page = parseInt(page);
            limit = parseInt(limit);

            if (!start_date || !end_date || start_date === '' || end_date === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Start date and end date are required',
                });
            }

            const offset = (page - 1) * limit;

            // Main Data Query
            const dataQuery = `
                SELECT 
                    shipping_province, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}'), 1, 0)) AS total_orders, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}') AND LOWER(order_status) = 'delivered', 1, 0)) AS total_deliveries, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}') AND DATE(cust_delivery_date) >= DATE(delivery_date) AND LOWER(order_status) = 'delivered', 1, 0)) AS date_match, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}') AND DATE(cust_delivery_date) < DATE(delivery_date) AND LOWER(order_status) = 'delivered', 1, 0)) AS delay_deliveries, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}') AND LOWER(order_status) = 'cancelled', 1, 0)) AS cancelled, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}') AND LOWER(order_status) IN ('undelivered','rto-initiated', 'rto-delivered', 'shipped & returned', 'lostintransit','rto', 'intransit'), 1, 0)) AS rto, 
                    SUM(IF(DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}') AND LOWER(order_status) NOT IN ('cancelled','undelivered', 'rto-delivered', 'rto', 'rto-initiated', 'delivered','shipped & returned', 'lostintransit', 'intransit'), 1, 0)) AS pending_deliveries 
                FROM order_booking_data
                WHERE DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}')
                GROUP BY shipping_province
                LIMIT ${limit} OFFSET ${offset};
            `;

            // Count total matching shipping_province (without limit/offset)
            const countQuery = `
                SELECT COUNT(DISTINCT shipping_province) AS total_count
                FROM order_booking_data
                WHERE DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}');
            `;

            const pendingStatusQuery = `
                SELECT 
                    shipping_province,
                    LOWER(order_status) AS status,
                    COUNT(*) AS count
                FROM order_booking_data
                WHERE DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}')
                  AND LOWER(order_status) NOT IN ('cancelled','undelivered', 'rto-delivered', 'rto', 'rto-initiated', 'delivered','shipped & returned', 'lostintransit', 'intransit')
                GROUP BY shipping_province, LOWER(order_status);
            `;

            const delayedStatusQuery = `
                SELECT 
                    shipping_province,
                    LOWER(order_status) AS status,
                    COUNT(*) AS count
                FROM order_booking_data
                WHERE DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}')
                  AND DATE(cust_delivery_date) < DATE(delivery_date) 
                  AND LOWER(order_status) = 'delivered'
                GROUP BY shipping_province, LOWER(order_status);
            `;

            const rtoStatusQuery = `
                SELECT 
                    shipping_province,
                    LOWER(order_status) AS status,
                    COUNT(*) AS count
                FROM order_booking_data
                WHERE DATE(cust_delivery_date) >= DATE('${start_date}') AND DATE(cust_delivery_date) <= DATE('${end_date}')
                  AND LOWER(order_status) IN ('undelivered','rto-initiated', 'rto-delivered', 'shipped & returned', 'lostintransit','rto', 'intransit')
                GROUP BY shipping_province, LOWER(order_status);
            `;

            // Execute all queries
            const [data, pendingStatusCounts, delayedStatusCounts, rtoStatusCounts, totalCountResult] = await Promise.all([
                OrderBookingData.sequelize.query(dataQuery, { type: Sequelize.QueryTypes.SELECT }),
                OrderBookingData.sequelize.query(pendingStatusQuery, { type: Sequelize.QueryTypes.SELECT }),
                OrderBookingData.sequelize.query(delayedStatusQuery, { type: Sequelize.QueryTypes.SELECT }),
                OrderBookingData.sequelize.query(rtoStatusQuery, { type: Sequelize.QueryTypes.SELECT }),
                OrderBookingData.sequelize.query(countQuery, { type: Sequelize.QueryTypes.SELECT }),
            ]);

            const totalCount = totalCountResult[0]?.total_count || 0;

            // Map pending deliveries
            const pendingStatusMap = pendingStatusCounts.reduce((acc, curr) => {
                if (!acc[curr.shipping_province]) acc[curr.shipping_province] = {};
                acc[curr.shipping_province][curr.status] = curr.count;
                return acc;
            }, {});

            const delayedStatusMap = delayedStatusCounts.reduce((acc, curr) => {
                if (!acc[curr.shipping_province]) acc[curr.shipping_province] = {};
                acc[curr.shipping_province][curr.status] = curr.count;
                return acc;
            }, {});

            const rtoStatusMap = rtoStatusCounts.reduce((acc, curr) => {
                if (!acc[curr.shipping_province]) acc[curr.shipping_province] = {};
                acc[curr.shipping_province][curr.status] = curr.count;
                return acc;
            }, {});

            // Combine all
            const result = data.map((item) => ({
                ...item,
                status_counts: pendingStatusMap[item.shipping_province] || {},
                delayed_status_counts: delayedStatusMap[item.shipping_province] || {},
                rto_status_counts: rtoStatusMap[item.shipping_province] || {},
            }));

            return res.status(200).json({
                success: true,
                data: result,
                pagination: {
                    page,
                    limit,
                    totalCount,
                },
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getPendingOtiffOrders(req, res) {
        try {
            let { page, limit, start_date, end_date, city } = req.body; // Default page is 1 and limit is 10
            console.log('data-->>', page, limit, start_date, end_date);

            if (!page || page == '') {
                page = 1;
            }
            if (!limit || limit == '') {
                limit = 10;
            }
            page = parseInt(page);
            limit = parseInt(limit);

            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'Start date and end date are required',
                });
            }

            // Calculate the offset based on the page and limit
            const offset = (page - 1) * limit;

            const { count, rows: result } = await OrderBookingData.findAndCountAll({
                where: Sequelize.literal(`
                    DATE(cust_delivery_date) >= DATE('${start_date}') 
                    AND DATE(cust_delivery_date) <= DATE('${end_date}') 
                    AND LOWER(order_status) NOT IN ('cancelled','undelivered', 'rto-delivered', 'rto', 'rto-initiated', 'delivered','shipped & returned', 'lostintransit', 'intransit')
                    AND LOWER(shipping_province) = '${city?.toLowerCase()}'
                `),
                limit,
                offset,
                raw: true,
            });

            res.status(200).json({
                message: 'Delayed orders fetched successfully',
                orders: result,
                pagination: {
                    totalRecords: count,
                    currentPage: page,
                    totalPages: Math.ceil(count / limit),
                    pageSize: limit,
                },
            });
        } catch (error) {
            console.error(error);  // Log the error for debugging
            res.status(500).json({
                success: false,
                message: 'An error occurred while fetching orders.',
            });
        }
    }

    static async getDelayedSbdOrders(req, res) {
        try {
            let { page, limit, start_date, end_date, city } = req.method == 'GET' ? req.query : req.body;
            console.log('data-->>', page, limit, start_date, end_date, city);

            // Validate required fields
            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'Start date and end date are required',
                });
            }

            // Default pagination values if not provided
            page = page || 1;
            limit = limit || 10;
            page = parseInt(page);
            limit = parseInt(limit);

            // Construct the dynamic query condition using Sequelize.Op for better security
            const queryCondition = Sequelize.literal(`
                DATE(cust_delivery_date) >= DATE('${start_date}')
                AND DATE(cust_delivery_date) <= DATE('${end_date}')
                AND DATE(cust_delivery_date) < DATE(delivery_date)
                AND LOWER(order_status) = 'delivered'
                AND LOWER(shipping_province) = '${city?.toLowerCase()}'
            `);

            if (req.method == 'GET') {
                // Fetch all records for Excel download
                const result = await OrderBookingData.findAll({
                    where: queryCondition,
                    raw: true,
                });

                if (result.length === 0) {
                    return res.status(404).json({ success: false, message: 'No records found' });
                }

                // Generate Excel File
                const workbook = new exceljs.Workbook();
                const worksheet = workbook.addWorksheet('Delayed Orders');

                // Define columns
                worksheet.columns = [
                    { header: 'Order Number', key: 'order_number', width: 20 },
                    { header: 'Order Date', key: 'datetime', width: 20 },
                    { header: 'Expected Delivery Date', key: 'cust_delivery_date', width: 20 },
                    { header: 'Courier Partner', key: 'lm_partner', width: 20 },
                    { header: 'Customer Name', key: 'shipping_name', width: 20 },
                    { header: 'Phone Number', key: 'phone', width: 20 },
                    { header: 'State/Province', key: 'shipping_province', width: 20 },
                    { header: 'Total Amount', key: 'total_price', width: 15 },
                    { header: 'Payment Status', key: 'financial_status', width: 20 },
                    { header: 'Attempted', key: 'attempt_count', width: 10 },
                    { header: 'Order Status', key: 'order_status', width: 20 },
                ];

                // Add rows
                result.forEach((order, index) => {
                    worksheet.addRow({
                        sr_no: index + 1,
                        ...order,
                    });
                });

                // Generate dynamic file name
                const fileName = 'delayed_orders.xlsx';

                // Set response headers for file download
                res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.attachment(fileName);
                await workbook.xlsx.write(res);
                res.end();
            } else {
                const offset = (page - 1) * limit;

                const { count, rows: result } = await OrderBookingData.findAndCountAll({
                    where: queryCondition,
                    limit,
                    offset,
                    raw: true,
                });

                res.status(200).json({
                    message: 'Delayed orders fetched successfully',
                    orders: result,
                    pagination: {
                        totalRecords: count,
                        currentPage: page,
                        totalPages: Math.ceil(count / limit),
                        pageSize: limit,
                    },
                });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while fetching delayed SBD orders.',
            });
        }
    }

    static async getDelayedOrders(req, res) {
        try {
            let { page, limit } = req.body;

            page = page && page > 0 ? parseInt(page) : 1;
            limit = limit && limit > 0 ? parseInt(limit) : 10;

            const offset = (page - 1) * limit;

            const formattedToday = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD' format

            const { count, rows: result } = await OrderBookingData.findAndCountAll({
                where: Sequelize.literal(`
                    DATE(cust_delivery_date) <= '${formattedToday}' 
                    AND LOWER(order_status) NOT IN ('shipped & returned', 'delivered', 'pending', 'cancelled', 'rto', 'rto-initiated')
                `),
                limit,
                offset,
                raw: true,
            });

            res.status(200).json({
                message: 'Delayed orders fetched successfully',
                orders: result,
                pagination: {
                    totalRecords: count,
                    currentPage: page,
                    totalPages: Math.ceil(count / limit),
                    pageSize: limit,
                },
            });
        } catch (error) {
            console.error('Error fetching delayed orders:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getDelayedInPackingOrders(req, res) {
        try {
            let { page, limit } = req.body;

            // Default pagination values
            page = page && page > 0 ? parseInt(page) : 1;
            limit = limit && limit > 0 ? parseInt(limit) : 10;

            const offset = (page - 1) * limit;
            const formattedToday = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD' format

            const { count, rows: result } = await OrderBookingData.findAndCountAll({
                where: Sequelize.literal(`
                    DATE(datetime) = '${formattedToday}' 
                    AND TIME(datetime) <= '11:30:00' 
                    AND LOWER(order_status) != 'packed' 
                    AND (TIME(datetime) <= '12:30:00' OR LOWER(order_status) != 'packed')
                `),
                limit,
                offset,
                raw: true,
            });

            // Response with pagination details
            res.status(200).json({
                message: 'Delay in Packing orders fetched successfully',
                success: true,
                orders: result,
                pagination: {
                    totalRecords: count,
                    currentPage: page,
                    totalPages: Math.ceil(count / limit),
                    pageSize: limit,
                },
            });
        } catch (error) {
            console.error('Error fetching delay in Packing orders:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getOpenTickets(req, res) {
        try {
            let { page, limit } = req.body;

            page = page && page > 0 ? parseInt(page) : 1;
            limit = limit && limit > 0 ? parseInt(limit) : 10;

            const offset = (page - 1) * limit;

            // Querying for tickets with 'open' or 'closed' status
            const { count, rows: result } = await ZendeskTicketingData.findAndCountAll({
                where: {
                    status: {
                        [Op.notIn]: ['closed', 'solved'] // Exclude 'closed' and 'solved' statuses
                    }
                },
                limit,
                offset,
                raw: true,
            });

            res.status(200).json({
                message: 'Open tickets fetched successfully',
                tickets: result,
                pagination: {
                    totalRecords: count,
                    currentPage: page,
                    totalPages: Math.ceil(count / limit),
                    pageSize: limit,
                },
            });
        } catch (error) {
            console.error('Error fetching open tickets:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getOrdersByStatus(req, res) {
        try {
            const { page = 1, limit = 10, startDate, courier, status, payment_mode, location } = req.body;
            const offset = (page - 1) * limit;

            // Define status conditions
            let statusCond = [];
            let statusCondition = [];

            if (status === 'pending') {
                // Exclude all other statuses for "pending" orders
                statusCond = [
                    'delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled',
                    'undelivered', 'intransit', 'rto lock', 'rto-initiated', 'rto-delivered',
                    'shipped & returned', 'shipped complete', 'partially shipped'
                ].map(s => s.toLowerCase());
            } else {
                // Include orders only matching the requested status
                const statusMap = {
                    'rto': ['rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock'],
                    'shipped_complete': ['shipped complete', 'partially shipped'],
                    'intransit': ['intransit'],
                    'undelivered': ['undelivered'],
                    'cancelled': ['cancelled'],
                    'packed': ['packed'],
                    'out_for_delivery': ['out_for_delivery', 'out for delivery'],
                    'delivered': ['delivered']
                };
                statusCondition = statusMap[status] ? statusMap[status].map(s => s.toLowerCase()) : [];
            }

            // Fetch total order count for pagination
            const totalOrdersQuery = `
            SELECT COUNT(*) as totalCount
            FROM order_booking_data
            WHERE 
                ${status === 'pending' ? `LOWER(order_status) NOT IN (:statusCond)` : `LOWER(order_status) IN (:statusCondition)`}
                ${startDate ? `AND DATE(datetime) = :startDate` : ''}
                ${courier ? `AND LOWER(lm_partner) = :courier` : ''}
                ${payment_mode ? `AND LOWER(financial_status) = :payment_mode` : ''}
                ${location ? `AND LOWER(warehouse_name) = :location` : ''};
        `;

            const replacements = {
                statusCond,
                statusCondition,
                startDate,
                courier: courier ? courier.toLowerCase() : undefined,
                payment_mode: payment_mode === 'cod' ? 'pending' : 'paid',
                location: location ? location.toLowerCase() : undefined,
            };

            const [[{ totalCount }]] = await sequelize.query(totalOrdersQuery, { replacements });

            // Fetch paginated order data
            const orders = await OrderHelper.getOrders(startDate, courier, status, payment_mode, location, limit, offset);

            res.status(200).json({
                message: 'Orders fetched successfully',
                success: true,
                orders,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    pageSize: limit,
                    totalCount,
                },
            });
        } catch (error) {
            console.error('Error fetching orders:', error.message);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    }

    static async geTicketsListing(req, res) {
        try {
            const { page = 1, limit = 10, startDate, courier, payment_mode, location } = req.body;
            const offset = (page - 1) * limit;

            // Define the query to fetch ticket data along with the order details
            const ticketsQuery = `
                SELECT 
                    obd.order_number, 
                    obd.datetime, 
                    obd.order_status, 
                    obd.lm_partner, 
                    obd.financial_status, 
                    obd.warehouse_name,
                    ztd.*
                FROM 
                    order_booking_data AS obd
                JOIN 
                    zendesk_ticketing_data AS ztd 
                ON 
                    obd.order_number = ztd.shopify_order_id
                WHERE 
                    1 = 1
                    ${startDate ? 'AND DATE(obd.datetime) = :startDate' : ''}
                    ${courier ? 'AND LOWER(obd.lm_partner) = :courier' : ''}
                    ${payment_mode ? 'AND LOWER(obd.financial_status) = :payment_mode' : ''}
                    ${location ? 'AND LOWER(obd.warehouse_name) = :location' : ''}
                LIMIT :limit OFFSET :offset
            `;

            // Define replacements for query parameters
            const replacements = {
                startDate,
                courier: courier ? courier.toLowerCase() : undefined,
                payment_mode: payment_mode
                    ? payment_mode.toLowerCase() === 'cod'
                        ? 'pending'
                        : payment_mode.toLowerCase() === 'prepaid'
                            ? 'paid'
                            : ''
                    : undefined,
                location: location ? location.toLowerCase() : undefined,
                limit,
                offset
            };

            // Fetch the ticket data
            const [tickets] = await sequelize.query(ticketsQuery, { replacements });

            // Count the total number of records for pagination
            const totalCountQuery = `
                SELECT 
                    COUNT(*) AS total_count
                FROM 
                    order_booking_data AS obd
                JOIN 
                    zendesk_ticketing_data AS ztd 
                ON 
                    obd.order_number = ztd.shopify_order_id
                WHERE 
                    1 = 1
                    ${startDate ? 'AND DATE(obd.datetime) = :startDate' : ''}
                    ${courier ? 'AND LOWER(obd.lm_partner) = :courier' : ''}
                    ${payment_mode ? 'AND LOWER(obd.financial_status) = :payment_mode' : ''}
                    ${location ? 'AND LOWER(obd.warehouse_name) = :location' : ''}
            `;

            const [totalCountResult] = await sequelize.query(totalCountQuery, { replacements });
            const totalCount = totalCountResult[0]?.total_count || 0;

            // Return the response
            return res.status(200).json({
                message: 'Ticket Data fetched successfully',
                success: true,
                tickets,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    pageSize: limit,
                    totalCount
                },
            });
        } catch (error) {
            console.error('Error fetching ticket data:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async downloadOrdersCount(req, res) {
        try {
            // Get filters from query parameters
            console.log('query --->>>', req.query);
            const { startDate, endDate, courier, payment_mode, location } = req.query;

            // Initialize SQL query for total and pending orders
            let query = `
            SELECT
            DATE(obd.datetime) AS order_date,
            COUNT(*) AS total_orders,
            SUM(CASE WHEN LOWER(obd.order_status) NOT IN ('delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled', 'rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock', 'shipped complete', 'partially shipped', 'undelivered', 'intransit') THEN 1 ELSE 0 END) AS pending
            FROM
            order_booking_data AS obd
            `;


            // Add filters to query
            if (startDate && endDate) {
                query += ` WHERE DATE(obd.datetime) >= '${startDate}' AND DATE(obd.datetime) <= '${endDate}'`;
            }
            if (courier) {
                query += query.includes('WHERE')
                    ? ` AND LOWER(obd.lm_partner) = '${courier.toLowerCase()}'`
                    : ` WHERE LOWER(obd.lm_partner) = '${courier.toLowerCase()}'`;
            }
            if (payment_mode) {
                const financial_status = payment_mode === 'cod' ? 'pending' : 'paid';
                query += query.includes('WHERE')
                    ? ` AND LOWER(obd.financial_status) = '${financial_status}'`
                    : ` WHERE LOWER(obd.financial_status) = '${financial_status}'`;
            }
            if (location && location != undefined) {
                query += query.includes('WHERE')
                    ? ` AND LOWER(obd.warehouse_name) = '${location.toLowerCase()}'`
                    : ` WHERE LOWER(obd.warehouse_name) = '${location.toLowerCase()}'`;
            }

            // Remove pagination logic (no LIMIT or OFFSET)
            query += ` GROUP BY order_date ORDER BY order_date DESC`;

            // Execute the SQL query
            const results = await sequelize.query(query);
            console.log('results -->>', results)

            // Format the results to match the desired keys
            const formattedResults = results[0].map(item => ({
                order_date: item.order_date,
                total_orders: item.total_orders,
                pending: item.pending
            }));

            // If format is xls
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Orders');
            worksheet.columns = [
                { header: 'Order Date', key: 'order_date' },
                { header: 'Total Orders', key: 'total_orders' },
                { header: 'Pending Orders', key: 'pending' },
            ];
            worksheet.addRows(formattedResults);  // Use formatted data here

            res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.attachment('orders-count.xlsx');
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Error fetching order counts by date:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch order counts by date',
                error: error.message,
            });
        }
    }

    static async downloadOrdersListing(req, res) {
        try {
            console.log('query --->>>', req.query);
            const { statusKey, startDate, endDate, courier, payment_mode, location } = req.query;

            let statusCond = "1=1";

            if (statusKey) {
                const statusKeys = statusKey.split(',').map(status => status.trim().toLowerCase());
                const statusMap = {
                    'pending': "LOWER(obd.order_status) NOT IN ('delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled', 'rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock', 'shipped complete', 'partially shipped', 'undelivered', 'intransit')",
                    'delivered': "LOWER(obd.order_status) IN ('delivered')",
                    'out_for_delivery': "LOWER(obd.order_status) IN ('out_for_delivery', 'out for delivery')",
                    'packed': "LOWER(obd.order_status) IN ('packed')",
                    'cancelled': "LOWER(obd.order_status) IN ('cancelled')",
                    'undelivered': "LOWER(obd.order_status) IN ('undelivered')",
                    'intransit': "LOWER(obd.order_status) IN ('intransit')",
                    'rto': "LOWER(obd.order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock')",
                    'shipped_complete': "LOWER(obd.order_status) IN ('shipped complete', 'partially shipped')"
                };

                const conditions = statusKeys
                    .map(status => statusMap[status] || '')
                    .filter(cond => cond !== '')
                    .join(' OR ');

                statusCond = conditions ? `(${conditions})` : statusCond;
            }

            // Constructing the query dynamically
            const ordersQuery = `
                SELECT
                    obd.order_number,
                    DATE(obd.datetime) AS order_date,
                    DATE(obd.cust_delivery_date) AS cust_delivery_date,
                    obd.lm_partner AS courier,
                    obd.billing_name,
                    obd.phone AS phone,
                    obd.order_status,
                    obd.total_price,
                    obd.financial_status,
                    obd.warehouse_name AS location
                FROM order_booking_data AS obd
                WHERE 
                    ${statusCond}
                    ${startDate ? `AND DATE(obd.datetime) >= :startDate` : ''}
                    ${endDate ? `AND DATE(obd.datetime) <= :endDate` : ''}
                    ${courier ? `AND LOWER(obd.lm_partner) = :courier` : ''}
                    ${payment_mode ? `AND LOWER(obd.financial_status) = :payment_mode` : ''}
                    ${location ? `AND LOWER(obd.warehouse_name) = :location` : ''}
                ORDER BY obd.datetime DESC;
            `;

            // Prepare replacements for the query
            const replacements = {
                ...(startDate && { startDate }),
                ...(endDate && { endDate }),
                ...(courier && { courier: courier.toLowerCase() }),
                ...(payment_mode && { payment_mode: payment_mode === 'cod' ? 'pending' : payment_mode === 'prepaid' ? 'paid' : '' }),
                ...(location && { location: location.toLowerCase() }),
            };

            // Execute the query
            const [orders] = await sequelize.query(ordersQuery, { replacements });

            console.log('orders -->>>', orders);

            // Format the data for Excel
            const formattedOrders = orders.map(order => ({
                order_number: order.order_number,
                order_date: order.order_date,
                cust_delivery_date: order.cust_delivery_date,
                courier: order.courier,
                billing_name: order.billing_name,
                phone: order.phone,
                location: order.location,
                total_price: order.total_price,
                financial_status: order.financial_status,
                order_status: order.order_status,
            }));

            console.log('formatted orders -->>>', formattedOrders);

            // Generate file name dynamically
            let fileName = 'orders';
            if (statusKey) {
                const statusLabels = statusKey.split(',').map(status => status.trim().toLowerCase()).join('-');
                fileName = `${statusLabels}_orders`;
            }
            fileName += '.xlsx';

            // Generate Excel file
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Orders');
            worksheet.columns = [
                { header: 'Order No', key: 'order_number' },
                { header: 'Order Date', key: 'order_date' },
                { header: 'Expected Delivery Date', key: 'cust_delivery_date' },
                { header: 'Courier', key: 'courier' },
                { header: 'Customer Name', key: 'billing_name' },
                { header: 'Phone Number', key: 'phone' },
                { header: 'Location', key: 'location' },
                { header: 'Total Amount', key: 'total_price' },
                { header: 'Payment Status', key: 'financial_status' },
                { header: 'Order Status', key: 'order_status' },
            ];

            // Add rows to the worksheet
            worksheet.addRows(formattedOrders);

            // Set response headers for file download
            res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.attachment(fileName);
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error('Error downloading orders:', error.message);
            res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }
    }

    static async getRtoData(req, res) {
        try {
            let { startDate, endDate } = req.body;

            const rtoCounts = await OrderHelper.RtoData(startDate, endDate);
            const lmData = await OrderHelper.getLmData(startDate, endDate);

            if (!rtoCounts.success) {
                return res.status(500).json({
                    success: false,
                    message: rtoCounts.message || 'Failed to fetch order counts by date and status',
                });
            }

            return res.status(200).json({
                success: true,
                message: 'RTO data fetched successfully',
                data: rtoCounts.data,
                lm_data: lmData
            });
        } catch (error) {
            console.error('Error fetching RTO data:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Server error. Please try again.',
            });
        }
    }

    static async getRtoGraphData(req, res) {
        try {
            let { startDate, endDate } = req.body;

            const { allLmStatus, graphData } = await OrderHelper.UndeliveredGraphData(startDate, endDate);

            const result = {
                success: true,
                message: 'Undelivered graph data fetched successfully',
                data: {
                    lmStatusList: allLmStatus,
                    graphData
                }
            };

            return res.status(200).json(result);

        } catch (error) {
            console.error('Error fetching Undelivered graph data:', error.message);

            const result = {
                success: false,
                message: 'Server error. Please try again.',
                error: error.message,
            };

            return res.status(500).json(result);
        }
    }

    static async getRtoLmGraphData(req, res) {
        try {
            const { startDate, endDate } = req.body;
            const { allPartners, graphData } = await OrderHelper.RtoGraphDataByPartner(startDate, endDate);
            return res.status(200).json({
                success: true,
                message: 'RTO graph data by lm_partner fetched successfully',
                data: {
                    allPartnersList: allPartners,
                    graphData
                }
            });
        } catch (error) {
            console.error('Error in getRtoGraphDataByPartner:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error',
                error
            });
        }
    }

    static async getDelaysData(req, res) {
        try {

            const delaysCounts = await OrderHelper.delaysData();

            if (!delaysCounts.success) {
                return res.status(500).json({
                    success: false,
                    message: delaysCounts.message || 'Failed to fetch delays orders counts ',
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Delays data fetched successfully',
                data: delaysCounts,
            });
        } catch (error) {
            console.error('Error fetching Delays data:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Server error. Please try again.',
            });
        }
    }

    static async downloadRTOData(req, res) {
        try {
            console.log('query --->>>', req.query);
            const { startDate, endDate } = req.query;

            let query = `
            SELECT
                DATE(obd.datetime) AS order_date,
                od.sku,
                od.title,
                od.brand,
                od.quantity,
                od.price,
                obd.order_number,
                obd.order_status,
                obd.shipping_name,
                obd.shipping_city,
                obd.shipping_province

            FROM
                order_details AS od
            JOIN
                order_booking_data AS obd ON od.order_no = obd.order_number
            WHERE
                LOWER(obd.order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned')
            `;

            if (startDate && endDate) {
                query += ` AND DATE(obd.datetime) >= '${startDate}' AND DATE(obd.datetime) <= '${endDate}'`;
            }

            query += ` ORDER BY order_date DESC`;

            const results = await sequelize.query(query);
            console.log('results -->>', results);

            const formattedResults = results[0].map(item => ({
                order_date: item.order_date,
                order_number: item.order_number,
                order_status: item.order_status,
                shipping_name: item.shipping_name,
                shipping_city: item.shipping_city,
                shipping_province: item.shipping_province,
                sku: item.sku,
                title: item.title,
                brand: item.brand,
                quantity: item.quantity,
                price: item.price,
            }));

            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Orders');
            worksheet.columns = [
                { header: 'Order Date', key: 'order_date' },
                { header: 'Order Number', key: 'order_number' },
                { header: 'Order Status', key: 'order_status' },
                { header: 'Customer Name', key: 'shipping_name' },
                { header: 'Shipping City', key: 'shipping_city' },
                { header: 'State', key: 'shipping_province' },
                { header: 'SKU', key: 'sku' },
                { header: 'Title', key: 'title' },
                { header: 'Brand', key: 'brand' },
                { header: 'Quantity', key: 'quantity' },
                { header: 'Price', key: 'price' },
            ];
            worksheet.addRows(formattedResults);

            res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.attachment('rto-data.xlsx');
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Error fetching rto data:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch rto data',
                error: error.message,
            });
        }
    }

    static async getStatusWiseRtoData(req, res) {
        try {
            const body = req.body; // Define body before accessing it

            if (!body.type || !body.status || !body.page) {
                return res.status(400).json({ // Return response properly
                    success: false,
                    message: "Type, status, and page are required!",
                });
            }

            const result = await OrderHelper.getStatusWiseRtoData(body);

            return res.status(200).json({
                success: true,
                total: result.total,
                orderData: result.orderData,
            });
        } catch (error) {
            console.error("Error in getStatusWiseRtoData Controller:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    }

    static async getWhatsappCount(req, res) {
        try {
            const notificationTypes = ["order_confirmation", "out_for_delivery", "delivery_confirmation", "order_cancellation"];
            const whatsappCounts = await WhatsappResponse.findAll({
                attributes: [
                    "type_of_notification",
                    [Sequelize.fn("COUNT", Sequelize.col("type_of_notification")), "total_count"]
                ],
                where: { type_of_notification: { [Op.in]: notificationTypes } },
                group: ["type_of_notification"]
            }).then(data =>
                data.map(({ type_of_notification, dataValues }) => ({
                    type_of_notification,
                    total_count: dataValues.total_count
                }))
            );

            const statusTypes = ["delivered", "read", "failed"];
            const messageStatusCounts = await WhatsappResponse.findAll({
                attributes: [
                    "message_status",
                    [Sequelize.fn("COUNT", Sequelize.col("message_status")), "count"]
                ],
                where: { message_status: { [Op.in]: statusTypes } },
                group: ["message_status"]
            }).then(data =>
                data.map(({ message_status, dataValues }) => ({
                    message_status,
                    count: dataValues.count
                }))
            );
            console.log('messageStatusCounts-->>', messageStatusCounts)

            // Get total_sent count (sum of delivered, read, and failed)
            const total_sent = messageStatusCounts.reduce((sum, item) => sum + (item.count || 0), 0);

            // Get delivered_count (sum of delivered and read)
            const delivered_count = messageStatusCounts
                .filter(item => item.message_status === "delivered" || item.message_status === "read")
                .reduce((sum, item) => sum + (item.count || 0), 0);

            const read_count = messageStatusCounts
                .filter(item => item.message_status === "read")
                .reduce((sum, item) => sum + (item.count || 0), 0);


            const queryNotificationCount = await WhatsappResponse.count({
                where: { type_of_notification: "query" }
            });

            const topFiveNotifications = await WhatsappResponse.findAll({
                attributes: [
                    "type_of_notification",
                    [Sequelize.fn("COUNT", Sequelize.col("type_of_notification")), "total_count"]
                ],
                group: ["type_of_notification"],
                order: [[Sequelize.fn("COUNT", Sequelize.col("type_of_notification")), "DESC"]],
                limit: 5
            }).then(data =>
                data.map(({ type_of_notification, dataValues }) => ({
                    type_of_notification,
                    total_count: dataValues.total_count
                }))
            );

            // Prepare Final Result
            const result = {
                total_sent,
                delivered_count,
                read_count,
                whatsapp_counts: whatsappCounts,
                query_notification_count: queryNotificationCount,
                top_five_notifications: topFiveNotifications
            };

            console.log("data ---->>", result);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            console.error("Error fetching WhatsApp data:", error);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    }

    static async getSalesAnalyticsData(req, res) {
        try {
            const { startDate, endDate, compareStartDate, compareEndDate } = req.body;
            console.log('data-->>', req.body)
            const analyticsData = await OrderHelper.getSalesAnalyticsData({
                startDate, endDate, compareStartDate, compareEndDate
            });
            return res.status(200).json({
                success: true,
                data: analyticsData
            });
        } catch (error) {
            console.error('Error in Sales Analytics graphs Data:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for Sales Analytics Graphs'
            });
        }
    }

    static async getSalesSkuData(req, res) {
        try {
            const { startDate, endDate, compareStartDate, compareEndDate, offset, limit = null, sort_by = null, sort_order = 'asc' } = req.body;
            console.log('data-->>', req.body);

            const getSalesSkuData = await OrderHelper.getSalesSkuData(startDate, endDate, compareStartDate, compareEndDate, limit, sort_by, sort_order, offset);

            return res.status(200).json({
                success: true,
                data: getSalesSkuData
            });
        } catch (error) {
            console.error('Error in Sales Sku Data:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve data for Sales Sku Data'
            });
        }
    }

    // static async getSalesSkuSummary(req, res) {
    //     try {
    //         const { title, filter_type, start_date, end_date } = req.body;

    //         if (!title || !filter_type) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: ' SKU title and filter_type are required'
    //             });
    //         }

    //         console.log('Request body -->', req.body);

    //         const analyticsData = await OrderHelper.getSalesSkuSummary(
    //             title,
    //             filter_type,
    //             start_date,
    //             end_date
    //         );

    //         return res.status(200).json({
    //             success: true,
    //             data: analyticsData
    //         });
    //     } catch (error) {
    //         console.error('Error in Sales SKU Summary API:', error);
    //         return res.status(500).json({
    //             success: false,
    //             message: 'Failed to retrieve SKU sales summary'
    //         });
    //     }
    // }

    static async getDiscountGraph(req, res) {
        try {
            const { type, startDate, endDate, startMonth, endMonth, year } = req.body;
            console.log('Date time ', startDate, endDate)

            // Validate inputs here if needed


            const result = await OrderHelper.getDiscountGraphData({
                type,
                startDate,
                endDate,
                startMonth,
                endMonth,
                year
            });
            console.log("result----------->>>>>>", result)


            return res.status(200).json({
                message: "Discount graph data fetched successfully",
                data: result

            });
        } catch (error) {
            console.error("Error in DiscountController:", error);
            return res.status(500).json({
                message: "Failed to fetch discount graph data",
                error: error.message || error
            });
        }
    }

    static async getSiensCardData(req, res) {
        try {
            const { startDate, endDate, orderNumber } = req.body;

            const data = await OrderHelper.getFilteredSiensCardData({ startDate, endDate, orderNumber });

            return res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error("Error in getOrdersCard:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message
            });
        }
    }

    static async getSiensOrders(req, res) {
        try {
            const { filter, startDate, endDate, order_number, limit, page_number } = req.body;

            const result = await OrderHelper.getFilteredSiensOrders({
                filter,
                startDate,
                endDate,
                order_number,
                limit: parseInt(limit) || 10,
                page_number: parseInt(page_number) || 1,
            });

            return res.json({
                success: true,
                ...result,
            });
        } catch (error) {
            console.error("Error fetching Siens Orders:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    }

    static async exportSiensOrders(req, res) {
        try {
            const { filter, startDate, endDate, order_number } = req.query;

            const todayDate = new Date().toISOString().slice(0, 10);

            const allowedSkus = [
                "FR464015SET", "FR465030ET", "FR467030ET", "FR462030ET", "FR466030ET",
                "FR463100ET", "DABC115", "DABC116", "DABC117", "DABC118",
                "DABC119", "DABC120", "DABC121", "DABC122", "DABC123",
                "DABC124", "DABC125", "DABC126"
            ];

            let whereConditions = [];

            switch (filter) {
                case "new":
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
                    break;

                case "ready_to_ship":
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("lower", Sequelize.col("order_data.order_status")), "packed"),
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
                    break;

                case "pickups_and_manifests":
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("lower", Sequelize.col("order_data.order_status")), {
                            [Op.in]: ["pick complete", "part picked", "partial shipped"],
                        }),
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
                    break;

                case "in_transit":
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("lower", Sequelize.col("order_data.order_status")), {
                            [Op.in]: ["shipped complete", "out-for-delivery"],
                        }),
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
                    break;

                case "delivered":
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("lower", Sequelize.col("order_data.order_status")), "delivered"),
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
                    break;

                case "rto":
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("lower", Sequelize.col("order_data.order_status")), {
                            [Op.in]: ["rto-initiated", "rto-delivered", "shipped & returned", "rto lock"],
                        }),
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
                    break;

                default:
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                    );
            }

            // ✅ SKU restriction
            whereConditions.push({ sku: { [Op.in]: allowedSkus } });

            // ✅ Date filters
            if (startDate) {
                whereConditions.push({
                    "$order_data.datetime$": { [Op.gte]: new Date(startDate + "T00:00:00") },
                });
            }
            if (endDate) {
                whereConditions.push({
                    "$order_data.datetime$": { [Op.lte]: new Date(endDate + "T23:59:59") },
                });
            }

            // ✅ Order number
            if (order_number) {
                whereConditions.push({
                    order_no: { [Op.like]: `%${order_number}%` },
                });
            }

            const whereClause = { [Op.and]: whereConditions };

            // ✅ Get all data (no pagination for export)
            const orders = await OrderDetail.findAll({
                where: whereClause,
                attributes: [
                    [Sequelize.fn("MIN", Sequelize.col("orderDetail.id")), "id"],
                    "order_no",
                    "cust_id",
                    "sku",
                    [Sequelize.fn("SUM", Sequelize.col("orderDetail.quantity")), "quantity"],
                    [Sequelize.fn("MIN", Sequelize.col("orderDetail.price")), "price"],
                    [
                        Sequelize.literal("GROUP_CONCAT(DISTINCT orderDetail.title SEPARATOR ', ')"),
                        "sku_titles"
                    ],
                    // 👇 Now total is per SKU
                    [Sequelize.fn("SUM", Sequelize.literal("orderDetail.price * orderDetail.quantity")), "siens_total"]
                ],
                include: [
                    {
                        model: OrderBookingData,
                        as: "order_data",
                        attributes: [
                            "order_status",
                            "datetime",
                            "order_number",
                            "billing_name",
                            "shipping_address1",
                            "lm_partner",
                            "financial_status",
                            "shipping_city",
                            "shipping_province"
                        ]
                    }
                ],
                // 👇 Added sku in GROUP BY
                group: ["order_no", "cust_id", "sku", "order_data.id"],
                order: [[Sequelize.fn("MIN", Sequelize.col("orderDetail.id")), "DESC"]],
                subQuery: false
            });
            console.log("result----->>>>>", orders)

            // ✅ Create Excel
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Orders");

            // ✅ Define columns
            worksheet.columns = [
                { header: "Date", key: "datetime", width: 10 },
                { header: "Order No", key: "order_no", width: 20 },
                // { header: "Customer ID", key: "cust_id", width: 15 },
                { header: "SKU", key: "sku", width: 20 },
                { header: "SKU Title", key: "title", width: 30 },
                { header: "Status", key: "order_status", width: 15 },
                { header: "SKU Price", key: "price", width: 15 },
                { header: "SKU Quantity", key: "quantity", width: 15 },
                { header: "Total Price", key: "total_price", width: 15 },
                { header: "Billing Name", key: "billing_name", width: 20 },
                { header: "Shipping Address", key: "shipping_address1", width: 40 },
                { header: "Shipping City", key: "shipping_city", width: 40 },
                { header: "Shipping State", key: "shipping_province", width: 40 },
                { header: "Partner", key: "lm_partner", width: 15 },
                { header: "Payment Status", key: "financial_status", width: 15 },
            ];

            orders.forEach(orderInstance => {
                const order = orderInstance.get({ plain: true }); // convert Sequelize instance to plain object

                worksheet.addRow({
                    datetime: order.order_data?.datetime || "",
                    order_no: order.order_no,
                    // cust_id: order.cust_id,
                    sku: order.sku,
                    title: order.sku_titles,
                    quantity: order.quantity,
                    price: order.price,
                    order_status: order.order_data?.order_status || "",
                    total_price: order.siens_total || "",
                    billing_name: order.order_data?.billing_name || "",
                    shipping_address1: order.order_data?.shipping_address1 || "",
                    shipping_city: order.order_data?.shipping_city || "",
                    shipping_province: order.order_data?.shipping_province || "",
                    lm_partner: order.order_data?.lm_partner || "",
                    financial_status: order.order_data?.financial_status || ""
                });
            });


            // ✅ Send Excel file
            res.setHeader(
                "Content-Disposition",
                "attachment; filename=siens_orders.xlsx"
            );
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error("Export Error:", error);
            res.status(500).json({ message: "Failed to export orders", error: error.message });
        }
    }

    static async getSiensSkuSummary(req, res) {
        try {
            const {
                startDate,
                endDate,
                skuSearch,
                page = 1,
                limit = 10
            } = req.body;

            const result = await OrderHelper.getSiensSkuSummaryReport({
                startDate,
                endDate,
                skuSearch,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10)
            });
            return res.status(200).json({
                success: true,
                message: "Siens SKU Summary fetched successfully",
                data: result.data,
                pagination: result.pagination
            });
        } catch (error) {
            console.error("Error in getSiensSkuSummaryReport:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch Siens SKU Summary",
                error: error.message
            });
        }
    }

    static async downloadSiensSkuSummaryReport(req, res) {
        try {
            const { startDate, endDate } = req.query;

            const allowedSkus = [
                "FR464015SET", "DABC115", "DABC116", "FR465030ET", "DABC117", "DABC118",
                "FR467030ET", "DABC121", "DABC122", "FR462030ET", "DABC125", "DABC126",
                "FR466030ET", "DABC123", "DABC124", "FR463100ET", "DABC119", "DABC120"
            ];

            const skuTitleMap = {
                "FR463100ET": "Siens By Dabur Hydrolyzed Marine Collagen",
                "FR464015SET": "Siens By Dabur Daily Pre & Probiotics For Gut health",
                "FR467030ET": "Siens By Dabur Multivitamin for Men",
                "FR465030ET": "Siens By Dabur Hair, Skin & Nails (3 in 1 Gummies)",
                "FR466030ET": "Siens By Dabur Multivitamin for Women",
                "FR462030ET": "Siens By Dabur Omega-3 Fish Oil Capsules",
                "DABC121": "Siens By Dabur Multivitamin for Men | 34 nutrients (Pack of 2)",
                "DABC118": "Siens By Dabur Hair, Skin & Nails (3 in 1 Gummies) (Pack of 3)",
                "DABC120": "Siens By Dabur Hydrolyzed Marine Collagen | Powder (Pack of 3)",
                "DABC123": "Siens By Dabur Multivitamin for Women | 32 nutrients (Pack of 2)",
                "DABC122": "Siens By Dabur Multivitamin for Men | 34 nutrients (Pack of 3)",
                "DABC117": "Siens By Dabur Hair, Skin & Nails (3 in 1 Gummies) (Pack of 2)",
                "DABC124": "Siens By Dabur Multivitamin for Women | 32 nutrients (Pack of 3)",
                "DABC119": "Siens By Dabur Hydrolyzed Marine Collagen | Powder (Pack of 2)",
                "DABC125": "Siens By Dabur Omega-3 Fish Oil Capsules | Support (Pack of 2)",
                "DABC116": "Siens By Dabur Daily Pre & Probiotics For Gut health (Pack of 3)",
                "DABC126": "Siens By Dabur Omega-3 Fish Oil Capsules | Support (Pack of 3)",
                "DABC115": "Siens By Dabur Daily Pre & Probiotics For Gut health (Pack of 2)"
            };

            // 🔹 Build WHERE conditions
            const whereConditions = { sku: { [Op.in]: allowedSkus } };

            if (startDate && endDate) {
                whereConditions["$order_data.datetime$"] = {
                    [Op.between]: [
                        new Date(startDate + "T00:00:00"),
                        new Date(endDate + "T23:59:59")
                    ]
                };
            } else if (startDate) {
                whereConditions["$order_data.datetime$"] = {
                    [Op.gte]: new Date(startDate + "T00:00:00")
                };
            } else if (endDate) {
                whereConditions["$order_data.datetime$"] = {
                    [Op.lte]: new Date(endDate + "T23:59:59")
                };
            }

            // 🔹 Query existing summary data
            const summaryData = await OrderDetail.findAll({
                where: whereConditions,
                attributes: [
                    [Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), "date"],
                    "sku",
                    [Sequelize.fn("MAX", Sequelize.col("title")), "title"],
                    [Sequelize.fn("COUNT", Sequelize.fn("DISTINCT", Sequelize.col("order_no"))), "orders"],
                    [Sequelize.fn("SUM", Sequelize.col("quantity")), "qty"],
                    [Sequelize.literal("SUM(quantity * price)"), "amount"]
                ],
                include: [{
                    model: OrderBookingData,
                    as: "order_data",
                    attributes: [],
                    required: true
                }],
                group: ["date", "sku"],
                order: [[Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), "DESC"]],
                raw: true
            });

            // 🔹 Transform into map for quick lookup
            const dataMap = {};
            summaryData.forEach(row => {
                const date = moment(row.date).format("YYYY-MM-DD");
                if (!dataMap[date]) dataMap[date] = {};
                dataMap[date][row.sku] = {
                    orders: Number(row.orders),
                    qty: Number(row.qty),
                    amount: Number(row.amount)
                };
            });

            // 🔹 Get all dates in range
            let allDates = Object.keys(dataMap);
            if (startDate && endDate) {
                const start = moment(startDate);
                const end = moment(endDate);
                allDates = [];
                for (let m = start.clone(); m.isSameOrBefore(end); m.add(1, "days")) {
                    allDates.push(m.format("YYYY-MM-DD"));
                }
            }

            // 🔹 Create Excel
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Siens Report");

            worksheet.addRow(["Date", "SKU", "Title", "Orders", "Qty Sold", "Sale Value"]);

            allDates.forEach(date => {
                allowedSkus.forEach(sku => {
                    const rowData = dataMap[date] && dataMap[date][sku]
                        ? dataMap[date][sku]
                        : { orders: 0, qty: 0, amount: 0 };

                    worksheet.addRow([
                        date,
                        sku,
                        skuTitleMap[sku],
                        rowData.orders,
                        rowData.qty,
                        rowData.amount
                    ]);
                });
            });

            // 🔹 Auto column width
            worksheet.columns.forEach(col => {
                let maxLength = 0;
                col.eachCell({ includeEmpty: true }, cell => {
                    const length = cell.value ? cell.value.toString().length : 10;
                    if (length > maxLength) maxLength = length;
                });
                col.width = maxLength + 2;
            });

            // 🔹 Send file
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            const fileName = `siens_sku_summary_${moment().format("YYYYMMDD")}.xlsx`;

            res.setHeader(
                "Content-Disposition",
                `attachment; filename=${fileName}`
            );
            await workbook.xlsx.write(res);
            res.end();

        } catch (err) {
            console.error(" Excel Export Error:", err);
            res.status(500).json({ success: false, message: "Failed to export Excel" });
        }
    }

    static async exportOrdersData(req, res) {
        try {
            const { filter, startDate, endDate } = req.query;

            const todayDate = new Date().toISOString().slice(0, 10);
            let whereConditions = [];

            // Filter conditions
            switch (filter) {
                case 'new':
                    whereConditions.push(
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
                case 'ready_to_ship':
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn('lower', Sequelize.col('OrderBookingData.order_status')), 'packed'),
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
                case 'pickups_and_manifests':
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn('lower', Sequelize.col('OrderBookingData.order_status')), {
                            [Op.in]: ['pick complete', 'part picked', 'partial shipped']
                        }),
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
                case 'in_transit':
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn('lower', Sequelize.col('OrderBookingData.order_status')), {
                            [Op.in]: ['shipped complete', 'out-for-delivery']
                        }),
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
                case 'delivered':
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn('lower', Sequelize.col('OrderBookingData.order_status')), 'delivered'),
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
                case 'rto':
                    whereConditions.push(
                        Sequelize.where(Sequelize.fn('lower', Sequelize.col('OrderBookingData.order_status')), {
                            [Op.in]: ['rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock']
                        }),
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
                case 'all':
                default:
                    whereConditions.push(
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('OrderBookingData.datetime')),
                            { [Op.lte]: todayDate }
                        )
                    );
                    break;
            }

            // Date filters
            if (startDate) {
                whereConditions.push(
                    Sequelize.where(
                        Sequelize.col('OrderBookingData.datetime'),
                        { [Op.gte]: new Date(startDate + 'T00:00:00') }
                    )
                );
            }
            if (endDate) {
                whereConditions.push(
                    Sequelize.where(
                        Sequelize.col('OrderBookingData.datetime'),
                        { [Op.lte]: new Date(endDate + 'T23:59:59') }
                    )
                );
            }

            const whereClause = { [Op.and]: whereConditions };

            // Fetch data
            const orders = await OrderBookingData.findAll({
                where: whereClause,
                order: [['id', 'DESC']],
                include: [
                    {
                        model: OrderDetail,
                        as: 'orderDetails',
                        attributes: ['title', 'sku']
                    }
                ]
            });

            // Generate Excel
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Orders');

            worksheet.columns = [
                { header: 'Order Number', key: 'order_number', width: 10 },
                { header: 'Date & Time', key: 'datetime', width: 20 },
                { header: 'SKU Purchased', key: 'title', width: 50 },
                { header: 'SKU Name', key: 'sku', width: 30 },
                { header: 'Total Price', key: 'total_price', width: 10 },
                { header: 'Order Status', key: 'order_status', width: 10 },
                { header: 'Billing Name', key: 'billing_name', width: 20 },
                { header: 'Billing City', key: 'billing_city', width: 10 },
                { header: 'Billing Province', key: 'billing_province', width: 10 },
                { header: 'LM Partner', key: 'lm_partner', width: 10 },
                { header: 'Payment Mode', key: 'payment_mode', width: 10 },
            ];

            orders.forEach(order => {
                worksheet.addRow({
                    order_number: order.order_number,
                    datetime: order.datetime,
                    title: order.orderDetails?.map(d => d.title).join(', ') || '',
                    sku: order.orderDetails?.map(d => d.sku).join(', ') || '',
                    total_price: order.total_price,
                    order_status: order.order_status,
                    billing_name: order.billing_name,
                    billing_city: order.billing_city,
                    billing_province: order.billing_province,
                    lm_partner: order.lm_partner,
                    payment_mode: order.financial_status,
                });
            });

            // Send Excel file
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename=orders_data.xlsx`
            );

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error("Export Orders Error:", error);
            res.status(500).json({ success: false, message: "Failed to export orders" });
        }
    }

    static async getRtoSummary(req, res) {
        try {
            const { startDate, endDate, location } = req.body;

            const summaryData = await OrderHelper.RtoSummaryByPartner(startDate, endDate, location);

            return res.status(200).json({
                success: true,
                message: 'RTO summary data by lm_partner fetched successfully',
                data: summaryData
            });

        } catch (error) {
            console.error('Error in getRtoSummary:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error while fetching RTO summary',
                error: error.message
            });
        }
    }





}


module.exports = OrderController;
