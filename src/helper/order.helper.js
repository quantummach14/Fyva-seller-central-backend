const orderBookingData = require('../models/orderBookingData');
const OrderDetail = require('../models/orderDetail');
const DaburPurchaseData = require('../models/daburPurcahseData');
const { Op, Sequelize, fn, col, literal } = require('sequelize');
const moment = require('moment');
const sequelize = require('../config/db'); // Adjust the path as necessary
const RemittanceData = require('../models/remittanceData');
const OrderBookingData = require('../models/orderBookingData');
class OrderHelper {

    static async getFilteredOrders({ filter, startDate, endDate, order_number, limit = 10, page_number = 1 }) {
        const offset = (page_number - 1) * limit;
        const todayDate = new Date().toISOString().slice(0, 10);
        let whereConditions = [];

        // Filter by status/type
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

        // Order number partial match
        if (order_number) {
            whereConditions.push({
                order_number: {
                    [Op.like]: `%${order_number}%`
                }
            });
        }

        const whereClause = {
            [Op.and]: whereConditions
        };

        // Query database with filters and pagination
        const result = await OrderBookingData.findAndCountAll({
            where: whereClause,
            order: [['id', 'DESC']],
            limit,
            offset,
            include: [
                {
                    model: OrderDetail,
                    as: 'orderDetails', // 👈 association alias
                    attributes: ['title'] // ✅ only fetch title
                }
            ]
        });

        return result;
    }

    static async countOrdersByStatus(startDate, endDate) {
        try {
            // Ensure that startDate and endDate are valid
            const validStartDate = new Date(startDate);
            const validEndDate = new Date(endDate);

            if (isNaN(validStartDate.getTime()) || isNaN(validEndDate.getTime())) {
                throw new Error('Invalid date format. Please provide valid dates in YYYY-MM-DD format.');
            }

            const result = await sequelize.query(`
                SELECT 
                    COALESCE(COUNT(*), 0) AS totalOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('allocated', 'confirmed','part allocated', 'part picked') THEN 1  ELSE 0 END),0) AS pickupPending,
                   COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('shipped complete', 'intransit') THEN 1 ELSE 0 END), 0) AS inTransitOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'delivered' THEN 1 ELSE 0 END), 0) AS deliveredOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('out_for_delivery', 'out for delivery') THEN 1 ELSE 0 END), 0) AS outForDelivery,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock') THEN 1 ELSE 0 END), 0) AS RTO,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelledOrders,
                   COALESCE(SUM(CASE 
            WHEN LOWER(order_status) NOT IN (
                'allocated', 'confirmed', 'part allocated', 'part picked',
                'shipped complete', 'intransit', 'delivered',
                'out_for_delivery', 'out for delivery',
                'rto-initiated', 'rto-delivered', 'shipped & returned',
                'rto lock', 'cancelled'
            ) 
            THEN 1 ELSE 0 
        END), 0) AS otherOrders
                FROM order_booking_data
                WHERE DATE(datetime) >= :startDate AND DATE(datetime) <= :endDate
            `, {
                replacements: { startDate: startDate, endDate: endDate },
                type: sequelize.QueryTypes.SELECT
            });

            console.log('Query Results:', result);

            // Return the counts in an object with default values if no data exists
            const data = result[0] || {};
            return {
                totalOrders: data.totalOrders || 0,
                pickupPending: data.pickupPending || 0,
                inTransitOrders: data.inTransitOrders || 0,
                deliveredOrders: data.deliveredOrders || 0,
                RTO: data.RTO || 0,
                outForDelivery: data.outForDelivery || 0,
                cancelledOrders: data.cancelledOrders || 0,
                otherOrders: data.otherOrders || 0,
            };
        } catch (error) {
            console.error('Error in counting orders by status:', error.message);
            throw new Error('Failed to count orders');
        }
    }

    // static async getOrdersWithOtherStatuses(start_date, end_date, limit, offset) {
    //     try {
    //         const excludedStatuses = [
    //             'allocated', 'confirmed', 'part allocated', 'part picked',
    //             'shipped complete', 'intransit', 'delivered',
    //             'out_for_delivery', 'out for delivery',
    //             'rto-initiated', 'rto-delivered', 'shipped & returned',
    //             'rto lock', 'cancelled'
    //         ];

    //         // Get total count
    //         const countResult = await sequelize.query(`
    //             SELECT COUNT(*) AS total
    //             FROM order_booking_data
    //             WHERE DATE(datetime) >= :startDate
    //               AND DATE(datetime) <= :endDate
    //               AND LOWER(order_status) NOT IN (:excludedStatuses)
    //         `, {
    //             replacements: {
    //                 startDate: start_date,
    //                 endDate: end_date,
    //                 excludedStatuses
    //             },
    //             type: sequelize.QueryTypes.SELECT
    //         });

    //         const total = countResult[0]?.total || 0;

    //         // Get paginated data
    //         const data = await sequelize.query(`
    //             SELECT *
    //             FROM order_booking_data
    //             WHERE DATE(datetime) >= :startDate
    //               AND DATE(datetime) <= :endDate
    //               AND LOWER(order_status) NOT IN (:excludedStatuses)
    //             ORDER BY datetime DESC
    //             LIMIT :limit OFFSET :offset
    //         `, {
    //             replacements: {
    //                 startDate: start_date,
    //                 endDate: end_date,
    //                 excludedStatuses,
    //                 limit: parseInt(limit),
    //                 offset: parseInt(offset)
    //             },
    //             type: sequelize.QueryTypes.SELECT
    //         });

    //         return { total, data };
    //     } catch (error) {
    //         console.error('Error fetching other status orders:', error.message);
    //         throw new Error('Something went wrong while fetching orders.');
    //     }
    // }

    static async getListingOrdersByStatus(start_date, end_date, statusType, limit, offset) {
        try {
            // Define all statuses
            const statusesMap = {
                pickupPending: ['allocated', 'confirmed', 'part allocated', 'part picked'],
                inTransit: ['shipped complete', 'intransit'],
                delivered: ['delivered'],
                outForDelivery: ['out_for_delivery', 'out for delivery'],
                RTO: ['rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock'],
                cancelled: ['cancelled'],
                other: [ // handled separately below
                    'allocated', 'confirmed', 'part allocated', 'part picked',
                    'shipped complete', 'intransit', 'delivered',
                    'out_for_delivery', 'out for delivery',
                    'rto-initiated', 'rto-delivered', 'shipped & returned',
                    'rto lock', 'cancelled'
                ]
            };

            let whereClause = `DATE(datetime) BETWEEN :startDate AND :endDate`;
            let replacements = { startDate: start_date, endDate: end_date };

            if (statusType === 'other') {
                whereClause += ` AND LOWER(order_status) NOT IN (:statusList)`;
                replacements.statusList = statusesMap.other;
            } else if (statusesMap[statusType]) {
                whereClause += ` AND LOWER(order_status) IN (:statusList)`;
                replacements.statusList = statusesMap[statusType];
            }

            // Count total
            const countResult = await sequelize.query(`
                SELECT COUNT(*) AS total
                FROM order_booking_data
                WHERE ${whereClause}
            `, {
                replacements,
                type: sequelize.QueryTypes.SELECT
            });

            const total = countResult[0]?.total || 0;

            // Fetch paginated data
            const data = await sequelize.query(`
                SELECT *
                FROM order_booking_data
                WHERE ${whereClause}
                ORDER BY datetime DESC
                LIMIT :limit OFFSET :offset
            `, {
                replacements: {
                    ...replacements,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                },
                type: sequelize.QueryTypes.SELECT
            });

            return { total, data };

        } catch (error) {
            console.error('Error fetching order list by status:', error.message);
            throw new Error('Something went wrong while fetching orders.');
        }
    }

    static async getOrderStatusByPartner(startDate, endDate) {
        try {
            const deliveryPartners = ['dtdc', 'ecom', 'ekart', 'rapid ship', 'shipway'];

            // Validate and format date inputs
            const formatDate = (d) => {
                const date = new Date(d);
                if (isNaN(date)) throw new Error('Invalid date format');
                return date.toISOString().split('T')[0];
            };

            const formattedStartDate = formatDate(startDate);
            const formattedEndDate = formatDate(endDate);

            // Map all possible status formats to standard statuses
            const statusMapping = {
                delivered: 'DELIVERED',
                'partially delivered': 'DELIVERED',
                'out_for_delivery': 'OutForDelivery',
                'out-for-delivery': 'OutForDelivery',
                'out for delivery': 'OutForDelivery',
                cancelled: 'Cancelled',
                confirmed: 'Pending',
                pending: 'Pending',
                allocated: 'Pending',
                packed: 'Packed',
                'pick complete': 'OutForDelivery',
                'shipped complete': 'Shippedcomplete',
                'partially shipped': 'Shippedcomplete',
                intransit: 'Shippedcomplete',
                'part allocate': 'Pending',
                'rto-initiated': 'RTO',
                'rto-delivered': 'RTO',
                'shipped & returned': 'RTO',
                'rto lock': 'RTO',
                'rto in transit': 'RTO',
                'shipped and returned': 'RTO',
                'LostInTransit': 'LostInTransit',
                'undelivered': 'Undelivered'
            };

            // Set of allowed final statuses to count
            const validStatuses = new Set([
                'DELIVERED', 'OutForDelivery', 'Packed', 'Pending',
                'Cancelled', 'RTO', 'Shippedcomplete', 'LostInTransit', 'Undelivered'
            ]);

            const results = await Promise.all(deliveryPartners.map(async (partner) => {
                const query = `
                    SELECT order_status 
                    FROM order_booking_data 
                    WHERE LOWER(lm_partner) = :partner
                    AND DATE(datetime) >= :startDate
                    AND DATE(datetime) <= :endDate
                `;

                const orders = await sequelize.query(query, {
                    replacements: {
                        partner: partner.toLowerCase(),
                        startDate: formattedStartDate,
                        endDate: formattedEndDate
                    },
                    type: sequelize.QueryTypes.SELECT
                });

                const statusCounts = Object.fromEntries([...validStatuses].map(status => [status, 0]));

                for (const order of orders) {
                    const rawStatus = String(order.order_status || '').toLowerCase();
                    const mapped = statusMapping[rawStatus] || rawStatus;

                    if (mapped === 'RTO') {
                        statusCounts.RTO++;
                    } else if (validStatuses.has(mapped)) {
                        statusCounts[mapped]++;
                    }
                }

                return {
                    deliveryPartner: partner,
                    totalOrders: orders.length,
                    status: statusCounts
                };
            }));

            return {
                success: true,
                data: results
            };
        } catch (error) {
            console.error('Error in getOrderStatusByPartner:', error);
            return {
                success: false,
                message: 'Failed to fetch order counts and statuses',
                error: error.message
            };
        }
    }

    static async getOrdersCourierData(startDate, endDate) {
        try {
            // Validate and format the dates if provided
            let dateCondition = '';
            let replacements = {};

            if (startDate && endDate) {
                const validStartDate = new Date(startDate);
                const validEndDate = new Date(endDate);

                if (isNaN(validStartDate) || isNaN(validEndDate)) {
                    throw new Error('Invalid date format');
                }

                const formattedStartDate = validStartDate.toISOString().split('T')[0];
                const formattedEndDate = validEndDate.toISOString().split('T')[0];

                dateCondition = `DATE(datetime) >= :startDate AND DATE(datetime) <= :endDate AND `;
                replacements.startDate = formattedStartDate;
                replacements.endDate = formattedEndDate;
            }

            // SQL query with COALESCE to replace NULL with 0
            const query = `
                SELECT 
                    LOWER(lm_partner) AS deliveryPartner,
                    COUNT(*) AS totalOrders,
                    COALESCE(SUM(CASE WHEN LOWER(financial_status) = 'pending' THEN 1 ELSE 0 END), 0) AS cod,
                    COALESCE(SUM(CASE WHEN LOWER(financial_status) = 'paid' THEN 1 ELSE 0 END), 0) AS prepaid,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered','shipped & returned') THEN 1 ELSE 0 END), 0) AS rto,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) NOT IN ('delivered','rto-initiated', 'rto-delivered','shipped & returned') THEN 1 ELSE 0 END), 0) AS otherOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'delivered' AND LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END), 0) AS deliveredPaidOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'delivered' AND LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END), 0) AS deliveredCodOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned') AND LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END), 0) AS paidRtoOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned') AND LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END), 0) AS codRtoOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'intransit' AND LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END), 0) AS inTransitPaidOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'intransit' AND LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END), 0) AS inTransitPendingOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'lostintransit' AND LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END), 0) AS lostInTransitPaidOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'lostintransit' AND LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END), 0) AS lostInTransitPendingOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'undelivered' AND LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END), 0) AS undeliveredPaidOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) = 'undelivered' AND LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END), 0) AS undeliveredPendingOrders,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('delivered','rto-initiated','rto-delivered','shipped & returned','intransit', 'lostintransit','undelivered') AND LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END), 0) AS totalPrepaidAmount,
                    COALESCE(SUM(CASE WHEN LOWER(order_status) IN ('delivered','rto-initiated','rto-delivered','shipped & returned','intransit', 'lostintransit','undelivered') AND LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END), 0) AS totalCodAmount
                FROM 
                    order_booking_data
                WHERE 
                    ${dateCondition}
                    LOWER(lm_partner) IN ('dtdc', 'ecom', 'ekart', 'rapid ship', 'shipway')
                GROUP BY 
                    LOWER(lm_partner)
            `;

            // Execute the query
            const result = await sequelize.query(query, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            });

            console.log("result->>>>>>>>>>>>>", result)


            // Define default response for courier partners
            const defaultPartners = ['dtdc', 'ecom', 'ekart', 'rapid ship', 'shipway'];
            const defaultResponse = defaultPartners.map((partner) => ({
                deliveryPartner: partner,
                totalOrders: 0,
                cod: 0,
                prepaid: 0,
                delivered: 0,
                rto: 0,
                otherOrders: 0,
                deliveredPaidOrders: 0,
                deliveredCodOrders: 0,
                paidRtoOrders: 0,
                codRtoOrders: 0,
                inTransitPaidOrders: 0,
                inTransitPendingOrders: 0,
                totalPrepaidAmount: 0,
                totalCodAmount: 0,
            }));

            console.log("defaultResponse->>>>>>>>>>>", defaultResponse)

            // Merge query result with defaults
            const mergedResult = defaultResponse.map((defaultPartner) => {
                const partnerData = result.find((data) => data.deliveryPartner === defaultPartner.deliveryPartner);
                return partnerData || defaultPartner;
            });

            return mergedResult;
        } catch (error) {
            console.error('Error fetching order counts and statuses by partner:', error);
            return {
                success: false,
                message: 'Failed to fetch order counts and statuses',
                error: error.message,
            };
        }
    }

    static async getOrderCountsByDate(page, limit, startDate, endDate, courier, payment_mode, location) {
        try {
            const offset = (page - 1) * limit;
            // Build the base WHERE clause
            let whereClause = [];
            if (startDate && endDate) {
                whereClause.push(`DATE(obd.datetime) BETWEEN '${startDate}' AND '${endDate}'`);
            }
            if (courier) {
                whereClause.push(`LOWER(obd.lm_partner) = '${courier.toLowerCase()}'`);
            }
            if (payment_mode) {
                const financialStatus = payment_mode === 'cod' ? 'pending' : 'paid';
                whereClause.push(`LOWER(obd.financial_status) = '${financialStatus}'`);
            }
            if (location) {
                whereClause.push(`LOWER(obd.warehouse_name) = '${location.toLowerCase()}'`);
            }
            // Create WHERE clause string for SQL
            const whereClauseStr = whereClause.length ? `WHERE ${whereClause.join(' AND ')}` : '';
            // Main query to fetch order counts
            const query = `
                SELECT
                    DATE(obd.datetime) AS order_date,
                    COUNT(*) AS total_orders,
                    SUM(obd.total_price) AS total_amount,
                    SUM(CASE WHEN LOWER(obd.order_status) = 'delivered' THEN 1 ELSE 0 END) AS delivered,
                    SUM(CASE WHEN LOWER(obd.order_status) IN ('out_for_delivery', 'out for delivery') THEN 1 ELSE 0 END) AS "Out For Delivery",
                    SUM(CASE WHEN LOWER(obd.order_status) = 'packed' THEN 1 ELSE 0 END) AS Packed,
                    SUM(CASE WHEN LOWER(obd.order_status) = 'cancelled' THEN 1 ELSE 0 END) AS Cancelled,
                    SUM(CASE WHEN LOWER(obd.order_status) = 'undelivered' THEN 1 ELSE 0 END) AS Undelivered,
                    SUM(CASE WHEN LOWER(obd.order_status) = 'intransit' THEN 1 ELSE 0 END) AS Intransit,
                    SUM(CASE WHEN LOWER(obd.order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock') THEN 1 ELSE 0 END) AS RTO,
                    SUM(CASE WHEN LOWER(obd.order_status) IN ('shipped complete', 'partially shipped') THEN 1 ELSE 0 END) AS "Shipped complete",
                    SUM(CASE WHEN LOWER(obd.order_status) NOT IN ('delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled', 'rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock', 'shipped complete', 'partially shipped', 'undelivered', 'intransit') THEN 1 ELSE 0 END) AS Pending,
                    SUM(zt.total_tickets) AS ticket_count
                FROM
                    order_booking_data AS obd
                LEFT JOIN (
                    SELECT
                        shopify_order_id,
                        COUNT(*) AS total_tickets
                    FROM
                        zendesk_ticketing_data
                    GROUP BY
                        shopify_order_id
                ) AS zt ON zt.shopify_order_id = obd.order_number
                ${whereClauseStr}
                GROUP BY order_date
                ORDER BY order_date DESC
                LIMIT ${limit} OFFSET ${offset}
            `;

            // Count query to get total orders
            const countQuery = `
                SELECT DATE(obd.datetime) AS order_date, COUNT(*) AS totalOrders
                FROM order_booking_data AS obd
                ${whereClauseStr}
                GROUP BY order_date
                ORDER BY order_date DESC
            `;
            // Query for pending statuses
            let pendingCond = '';
            if (whereClauseStr) {
                pendingCond = whereClauseStr + `AND LOWER(obd.order_status) NOT IN ('delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled', 'rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock', 'shipped complete', 'partially shipped', 'undelivered', 'intransit')`;
            } else {
                pendingCond = `WHERE LOWER(obd.order_status) NOT IN ('delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled', 'rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock', 'shipped complete', 'partially shipped', 'undelivered', 'intransit')`;
            }
            console.log('whereClauseStr', pendingCond)

            const pendingStatusQuery = `
                SELECT
                    DATE(obd.datetime) AS order_date,
                    LOWER(obd.order_status) AS status,
                    COUNT(*) AS count
                FROM order_booking_data AS obd
                ${pendingCond}
                GROUP BY order_date, status;
            `;

            // Query for RTO statuses
            let rtoCond = '';
            if (whereClauseStr) {
                rtoCond = whereClauseStr + ` AND LOWER(obd.order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock')`;
            } else {
                rtoCond = `WHERE LOWER(obd.order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto lock')`;
            }

            const rtoStatusQuery = `
            SELECT
                DATE(obd.datetime) AS order_date,
                LOWER(obd.order_status) AS status,
                COUNT(*) AS count
            FROM order_booking_data as obd
            ${rtoCond}
            GROUP BY order_date, status;
           `;

            // Execute queries
            const [pendingStatusCounts] = await sequelize.query(pendingStatusQuery);
            const [rtoStatusCounts] = await sequelize.query(rtoStatusQuery);
            const [result] = await sequelize.query(countQuery);
            const totalOrders = result?.length || 0;
            const [results] = await sequelize.query(query);

            // Merge pending statuses into the results
            // Merge pending statuses and RTO statuses into the results
            results.forEach(order => {
                // Pending Statuses
                const pendingStatuses = pendingStatusCounts
                    .filter(pending => new Date(order.order_date).toISOString().split('T')[0] === new Date(pending.order_date).toISOString().split('T')[0])
                    .reduce((acc, { status, count }) => {
                        const existingStatus = acc.find(item => item.status === status);
                        if (existingStatus) {
                            existingStatus.count += count;
                        } else {
                            acc.push({ status, count });
                        }
                        return acc;
                    }, []);
                order.pendingStatuses = pendingStatuses;

                // RTO Statuses
                const rtoStatuses = rtoStatusCounts
                    .filter(rto => new Date(order.order_date).toISOString().split('T')[0] === new Date(rto.order_date).toISOString().split('T')[0])
                    .reduce((acc, { status, count }) => {
                        const existingStatus = acc.find(item => item.status === status);
                        if (existingStatus) {
                            existingStatus.count += count;
                        } else {
                            acc.push({ status, count });
                        }
                        return acc;
                    }, []);
                order.rtoStatuses = rtoStatuses;
            });

            return {
                success: true,
                data: results,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalOrders / limit),
                    totalOrders: totalOrders,
                },
            };
        } catch (error) {
            console.error('Error fetching order counts by date:', error);
            return {
                success: false,
                message: 'Failed to fetch order counts by date and statuses',
                error: error.message,
            };
        }
    }

    // static async getOrderDataForGraphs() {
    //     try {
    //         const today = moment().startOf('day').format('YYYY-MM-DD');
    //         const yesterday = moment().subtract(1, 'day').startOf('day').format('YYYY-MM-DD');
    //         const endOfToday = moment().endOf('day').format('YYYY-MM-DD');
    //         const formattedStartDate = moment().startOf('month').format('YYYY-MM-DD'); // Set your desired start date
    //         const endDate = moment().endOf('day').format('YYYY-MM-DD'); // End of today

    //         const intervals = [
    //             '00:00-03:59', '04:00-07:59', '08:00-11:59',
    //             '12:00-15:59', '16:00-19:59', '20:00-23:59'
    //         ];

    //         const initializeData = (date) =>
    //             Object.fromEntries(intervals.map(interval => [interval, { totalSales: 0, fulFilledOrdersOverTime: 0, totalOrders: 0, averageOrderValue: 0 }]));

    //         const initialData = {
    //             [yesterday]: initializeData(yesterday),
    //             [today]: initializeData(today)
    //         };

    //         // Fetch data using a single CASE expression
    //         const results = await orderBookingData.findAll({
    //             attributes: [
    //                 [Sequelize.literal(`
    //                     CASE
    //                         WHEN HOUR(datetime) BETWEEN 0 AND 3 THEN '00:00-03:59'
    //                         WHEN HOUR(datetime) BETWEEN 4 AND 7 THEN '04:00-07:59'
    //                         WHEN HOUR(datetime) BETWEEN 8 AND 11 THEN '08:00-11:59'
    //                         WHEN HOUR(datetime) BETWEEN 12 AND 15 THEN '12:00-15:59'
    //                         WHEN HOUR(datetime) BETWEEN 16 AND 19 THEN '16:00-19:59'
    //                         WHEN HOUR(datetime) BETWEEN 20 AND 23 THEN '20:00-23:59'
    //                     END
    //                 `), 'time_interval'],
    //                 [Sequelize.fn('SUM', Sequelize.col('total_price')), 'totalSales'],
    //                 [Sequelize.fn('DATE', Sequelize.col('datetime')), 'datetime'],
    //                 [Sequelize.fn('AVG', Sequelize.col('total_price')), 'averageOrderValue'],
    //                 [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOrders'],
    //                 [Sequelize.fn('SUM', Sequelize.literal(`
    //                     CASE 
    //                         WHEN LOWER(order_status) = 'delivered' 
    //                         AND cust_delivery_date >= delivery_date 
    //                         AND cust_delivery_date IS NOT NULL 
    //                         AND delivery_date IS NOT NULL THEN 1 
    //                         ELSE 0 
    //                     END
    //                 `)), 'fulFilledOrdersOverTime']
    //             ],
    //             where: {
    //                 datetime: {
    //                     [Op.between]: [yesterday, endOfToday]
    //                 }
    //             },
    //             group: [
    //                 Sequelize.literal('DATE(datetime)'),
    //                 Sequelize.literal(`
    //                     CASE
    //                         WHEN HOUR(datetime) BETWEEN 0 AND 3 THEN '00:00-03:59'
    //                         WHEN HOUR(datetime) BETWEEN 4 AND 7 THEN '04:00-07:59'
    //                         WHEN HOUR(datetime) BETWEEN 8 AND 11 THEN '08:00-11:59'
    //                         WHEN HOUR(datetime) BETWEEN 12 AND 15 THEN '12:00-15:59'
    //                         WHEN HOUR(datetime) BETWEEN 16 AND 19 THEN '16:00-19:59'
    //                         WHEN HOUR(datetime) BETWEEN 20 AND 23 THEN '20:00-23:59'
    //                     END
    //                 `)
    //             ],
    //             order: [
    //                 [Sequelize.literal('datetime'), 'ASC'],
    //                 [Sequelize.literal('time_interval'), 'ASC']
    //             ],
    //             raw: true
    //         });

    //         // Overlay database results onto initial data structure
    //         results.forEach(({ time_interval, totalSales, fulFilledOrdersOverTime, totalOrders, averageOrderValue, datetime }) => {
    //             const dateKey = moment(datetime).format('YYYY-MM-DD');
    //             if (initialData[dateKey] && initialData[dateKey][time_interval]) {
    //                 initialData[dateKey][time_interval].totalSales = totalSales;
    //                 initialData[dateKey][time_interval].fulFilledOrdersOverTime = fulFilledOrdersOverTime;
    //                 initialData[dateKey][time_interval].totalOrders = totalOrders;
    //                 initialData[dateKey][time_interval].averageOrderValue = averageOrderValue;
    //             }
    //         });

    //         // Fetch top products
    //         const topProducts = await OrderDetail.findAll({
    //             attributes: [
    //                 'product_id',
    //                 'name',
    //                 // Retrieves each product's ID
    //                 [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalQuantity'], // Sum of quantities for each product
    //             ],
    //             include: [{
    //                 model: orderBookingData,
    //                 attributes: [],
    //                 required: true, // Ensures only matched records are included
    //                 where: {
    //                     datetime: {
    //                         [Op.between]: [formattedStartDate, endDate] // Filter by both start and end date
    //                     }
    //                 }
    //             }],
    //             group: ['product_id'], // Groups the results by product
    //             order: [[Sequelize.literal('totalQuantity'), 'DESC']], // Orders by totalQuantity, descending
    //             limit: 7, // Limits to top 7 products
    //             raw: true
    //         });

    //         // Return initial data with top products
    //         return {
    //             graphData: initialData,
    //             topProducts: topProducts // Add top products data here
    //         };

    //     } catch (error) {
    //         console.error('Error fetching order data for graphs:', error);
    //         throw error;
    //     }
    // }

    static async getDistinctState() {
        try {
            const states = await orderBookingData.findAll({
                attributes: [
                    [Sequelize.fn('LOWER', Sequelize.col('shipping_province')), 'shipping_province']
                ],
                group: [Sequelize.fn('LOWER', Sequelize.col('shipping_province'))],
                raw: true
            });
            console.log('State list -->>>', states);

            return states.map(city => city.shipping_province);
        } catch (error) {
            console.error('Error in fetching distinct states:', error);
            throw new Error('Failed to fetch distinct states');
        }
    }

    static async getAnalyticsData({ start_date, end_date, type, start_month, end_month, start_year, end_year, locations }) {
        try {
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1; // Get the current month (1-12)
            const today = new Date().toISOString().slice(0, 10); // Current date in YYYY-MM-DD
            const defaultStartDate = `${currentYear}-04-01`; // April of the current financial year

            // Define date ranges based on the filter provided
            let finalStartDate = start_date || defaultStartDate;
            let finalEndDate = end_date || today;

            // If no type is provided, or an invalid type is provided, throw an error
            if (!type || !['date', 'month', 'year'].includes(type)) {
                throw new Error('Invalid type provided. Expected "date", "month", or "year".');
            }

            // Process based on the provided type
            if (type === 'date') {
                // If 'date' type, we already have the start_date and end_date
                finalStartDate = start_date || defaultStartDate;
                finalEndDate = end_date || today;
            } else if (type === 'month') {
                const padded = (n) => (n < 10 ? '0' + n : n);
                const startMonthStr = `${currentYear}-${padded(start_month)}-01`;
                const endMonthLastDay = new Date(currentYear, end_month, 0).getDate();
                const endMonthStr = `${currentYear}-${padded(end_month)}-${padded(endMonthLastDay)}`;

                finalStartDate = startMonthStr;
                finalEndDate = endMonthStr;

                console.log('Final Month Filter:', finalStartDate, finalEndDate);

                // else if (type === 'month') {
                //     // If 'month' type, handle logic for month range (start_month to end_month)
                //     const startMonthDate = new Date(currentYear, start_month - 1, 1); // Start of the start_month
                //     const endMonthDate = new Date(currentYear, end_month, 0); // End of the end_month (last day of the month)
                //     finalStartDate = startMonthDate.toISOString().slice(0, 10);
                //     finalEndDate = endMonthDate.toISOString().slice(0, 10);

            } else if (type === 'year') {
                // If 'financialYear' type, handle logic for financial year range (start_year to end_year)
                console.log('current year--->>>>', currentYear);

                const startDate = new Date(start_year, 3, 1);  // Financial Year starts on April 1st (month 3 in JavaScript Date)
                let endDate;

                // If end year is the current year or if the user selects a future financial year
                if (end_year == currentYear + 1) {
                    // If the end year is next year (e.g., 2024-2025), set the end date to the current date
                    endDate = new Date(); // Current date
                } else {
                    // Else, end date is the last day of the financial year (March 31st of the end year)
                    endDate = new Date(end_year, 2, 31); // March 31st (month 2 in JavaScript Date)
                }

                // Format the dates to 'YYYY-MM-DD' format
                finalStartDate = startDate.toISOString().slice(0, 10);
                finalEndDate = endDate.toISOString().slice(0, 10);


            }

            console.log('Financial Year Start Date:', finalStartDate);
            console.log('Financial Year End Date:', finalEndDate);

            // Filter by location, default is 'All'
            const locationFilter = locations && locations.length > 0 ? locations : [];

            // Calculate metrics
            const totalOrders = await OrderHelper.getTotalOrders(finalStartDate, finalEndDate, locationFilter);
            const totalSales = parseFloat((await OrderHelper.getTotalSales(finalStartDate, finalEndDate, locationFilter)).toFixed(2));
            const totalRevenue = parseFloat((await OrderHelper.getTotalRevenue(finalStartDate, finalEndDate, locationFilter)).toFixed(2));
            const repeatCustomers = await OrderHelper.getRepeatCustomers(finalStartDate, finalEndDate, locationFilter);
            console.log("repeatCustomers --->>>>>>>", repeatCustomers);
            const newCustomers = await this.getNewCustomers(finalStartDate, finalEndDate, locationFilter);
            console.log("newCustomers --->>>>>>>", newCustomers);
            const newVsOldContribution = parseFloat(((newCustomers / totalOrders) * 100).toFixed(2));
            const stateWiseOrders = await OrderHelper.getTotalOrdersStateWise(finalStartDate, finalEndDate, locationFilter);
            const repeatCustomersTotalAmount = await OrderHelper.getRepeatCustomersTotalPrice(finalStartDate, finalEndDate, locationFilter);
            const newCustomersTotalAmount = await OrderHelper.getNewCustomersTotalPrice(finalStartDate, finalEndDate, locationFilter);
            const getNewAndRepeatCustomerCount = await OrderHelper.getNewAndRepeatCustomerCount(finalStartDate, finalEndDate, locationFilter);
            const newRepeatCustomers = await OrderHelper.groupByDateOrMonthOrYear(finalStartDate, finalEndDate, start_year, end_year, type, locationFilter);
            const totalOrdersAndAov = await OrderHelper.getTotalOrdersAndAov(finalStartDate, finalEndDate, locationFilter);
            const topSellingProducts = await OrderHelper.getTopSellingProducts(finalStartDate, finalEndDate, locationFilter);
            const revenueTrendMonthly = await OrderHelper.getRevenueTrendMonthly(finalStartDate, finalEndDate, locationFilter);
            const averageOrderData = await OrderHelper.getWeeklyWiseAverageOrderData();

            // let currentStartDate = new Date(`${finalStartDate.getFullYear}-${finalStartDate.getMonth+1}-01`);
            // let currentEndDate = new Date(`${finalEndDate.getFullYear}-${finalEndDate.getMonth+1}-01`);
            // while (currentStartDate <= currentEndDate) {
            //     // Format the date to YYYY-MM (you can adjust as needed)
            //     let year = currentDate.getFullYear();
            //     let month = (currentDate.getMonth() + 1).toString().padStart(2, '0');  // Get month (1-based, pad with zero)
            //     // console.log(`${year}-${month}`);

            //     // Move to the next month
            //     currentStartDate.setMonth(currentStartDate.getMonth() + 1);
            // }
            console.log("newAndRepeatCustomer-------------->>>>>", newCustomers, repeatCustomers)

            return {
                totalCardData: {
                    totalOrders: totalOrders,
                    totalSales: totalSales,
                    totalRevenue: totalRevenue,
                    repeatCustomers: repeatCustomers,
                    newCustomers: newCustomers,
                    newVsOldContribution: newVsOldContribution,
                },
                stateWiseTotalOrders: stateWiseOrders,
                salesContribution: {
                    repeatCustomersTotalAmount,
                    newCustomersTotalAmount
                },
                newRepeatCustomers: newRepeatCustomers,
                totalOrdersAndAov,
                topSellingProducts,
                revenueTrendMonthly,
                averageOrderData,
                getNewAndRepeatCustomerCount
            };
        } catch (error) {
            console.error('Error in getAnalyticsData:', error);
            throw error;
        }
    }

    static async getTotalOrders(startDate, endDate, locationFilter) {
        console.log('Before Convert start', startDate, endDate);
        console.log('locationFilter and length-->>', locationFilter, locationFilter.length);
        let locations = [];
        if (locationFilter.length > 0) {
            locations = locationFilter.map((location) => location.toLowerCase());
        }

        const totalOrders = await orderBookingData.count({
            col: 'id',
            where: {
                [Op.and]: [
                    Sequelize.where(
                        fn('DATE', col('datetime')),
                        {
                            [Op.gte]: startDate,
                            [Op.lte]: endDate
                        }
                    ),
                    ...(locationFilter.length > 0
                        ? [
                            Sequelize.where(
                                fn('LOWER', col('shipping_province')),
                                { [Op.in]: locations }
                            )
                        ]
                        : [])
                ]
            }
        });

        console.log('total orders--->>>', totalOrders);
        return totalOrders;
    }

    static async getTotalSales(startDate, endDate, locationFilter) {
        // Query to sum total_price within date range and location
        let locations = [];
        if (locationFilter.length > 0) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }
        const result = await orderBookingData.sum('total_price', {
            where: {
                [Op.and]: [
                    Sequelize.where(fn('DATE', col('datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    locationFilter.length > 0
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {}
                ]
            }
        });

        console.log('total sales -->>', result);

        return result || 0;
    }

    static async getTotalRevenue(startDate, endDate, locationFilter) {
        // Calculate total revenue excluding specific order statuses
        const totalSales = await OrderHelper.getTotalSales(startDate, endDate, locationFilter);
        let locations = [];
        if (locationFilter.length > 0) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }
        const canceledAmount = await orderBookingData.sum('total_price', {
            where: {
                [Op.and]: [
                    Sequelize.where(fn('DATE', col('datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    locationFilter.length > 0
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {},
                    Sequelize.where(fn('LOWER', col('order_status')), {
                        [Op.in]: ['cancelled', 'rto', 'rto-initiated', 'lost in transit']
                    })
                ]
            }
        });

        console.log('getTotalRevenue -->>', totalSales - canceledAmount);

        // Calculate revenue and ensure it does not go below zero
        return Math.max(totalSales - (canceledAmount || 0), 0);
    }

    static async getRepeatCustomers(startDate, endDate, locationFilter) {
        try {
            const locations = locationFilter.map(loc => loc.toLowerCase());

            const dateRangeConditions = [
                Sequelize.where(fn('DATE', col('datetime')), { [Op.gte]: startDate }),
                Sequelize.where(fn('DATE', col('datetime')), { [Op.lte]: endDate })
            ];

            if (locations.length > 0) {
                dateRangeConditions.push(
                    Sequelize.where(fn('LOWER', col('shipping_province')), {
                        [Op.in]: locations
                    })
                );
            }

            // Step 1: Get distinct last 10 digits of phone numbers in date range
            const recentPhones = await orderBookingData.findAll({
                attributes: [[fn('DISTINCT', fn('RIGHT', col('phone'), 10)), 'phone']],
                where: { [Op.and]: dateRangeConditions },
                raw: true
            });

            const phoneList = recentPhones.map(row => row.phone);
            if (phoneList.length === 0) return 0;

            // Step 2: Count how many of these phones had orders before startDate
            const repeatPhones = await orderBookingData.findAll({
                attributes: [[fn('DISTINCT', fn('RIGHT', col('phone'), 10)), 'phone']],
                where: {
                    [Op.and]: [
                        Sequelize.where(fn('DATE', col('datetime')), { [Op.lt]: startDate }),
                        Sequelize.where(fn('RIGHT', col('phone'), 10), { [Op.in]: phoneList })
                    ]
                },
                raw: true
            });

            const repeatCustomerCount = repeatPhones.length;
            console.log('Repeat Customers Count -->', repeatCustomerCount);
            return repeatCustomerCount;

        } catch (error) {
            console.error('Error in getRepeatCustomers:', error);
            throw error;
        }
    }

    static async getNewCustomers(startDate, endDate, locationFilter) {
        try {
            const locations = locationFilter.map(loc => loc.toLowerCase());

            const dateRangeConditions = [
                Sequelize.where(fn('DATE', col('datetime')), { [Op.gte]: startDate }),
                Sequelize.where(fn('DATE', col('datetime')), { [Op.lte]: endDate })
            ];

            if (locations.length > 0) {
                dateRangeConditions.push(
                    Sequelize.where(fn('LOWER', col('shipping_province')), {
                        [Op.in]: locations
                    })
                );
            }

            // Step 1: Get distinct phone numbers (last 10 digits) from date range
            const recentPhones = await orderBookingData.findAll({
                attributes: [[fn('DISTINCT', fn('RIGHT', col('phone'), 10)), 'phone']],
                where: { [Op.and]: dateRangeConditions },
                raw: true
            });

            const phoneList = recentPhones.map(row => row.phone);
            if (phoneList.length === 0) return 0;

            // Step 2: Find which of those phones exist before the start date
            const repeatPhones = await orderBookingData.findAll({
                attributes: [[fn('DISTINCT', fn('RIGHT', col('phone'), 10)), 'phone']],
                where: {
                    [Op.and]: [
                        Sequelize.where(fn('DATE', col('datetime')), { [Op.lt]: startDate }),
                        { [Op.and]: Sequelize.where(fn('RIGHT', col('phone'), 10), { [Op.in]: phoneList }) }
                    ]
                },
                raw: true
            });

            const repeatPhoneList = repeatPhones.map(row => row.phone);

            // Step 3: Final filter — phones not in repeat list
            const newCustomerPhones = phoneList.filter(
                phone => !repeatPhoneList.includes(phone)
            );

            const newCustomerCount = newCustomerPhones.length;
            console.log('New Customers Count -->', newCustomerCount);
            return newCustomerCount;

        } catch (error) {
            console.error('Error in getNewCustomers:', error);
            throw error;
        }
    }

    static async getTotalOrdersStateWise(startDate, endDate, locationFilter) {
        const includeAllLocations = locationFilter.length === 0;
        let locations = [];
        if (!includeAllLocations) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }
        // Query to get total orders grouped by shipping_province within the date range
        const orders = await orderBookingData.findAll({
            attributes: [
                [Sequelize.fn('LOWER', Sequelize.col('shipping_province')), 'state'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'order_count']
            ],
            where: {
                [Op.and]: [
                    Sequelize.where(fn('DATE', col('datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    // Apply location filter only if locationFilter is not empty
                    !includeAllLocations
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {}
                ]
            },
            group: ['state'],
            order: [['order_count', 'DESC']]
        });
        // Convert the query result to an object with state names as keys
        const orderData = {};
        orders.forEach(order => {
            orderData[order.get('state')] = parseInt(order.get('order_count'), 10);
        });

        // Prepare the result:
        // - If including all locations, use all available states in `orderData`
        // - If filtering, include only states from `locationFilter`
        const result = (includeAllLocations ? Object.keys(orderData) : locationFilter.map(loc => loc.toLowerCase()))
            .map(state => ({
                state,
                order_count: orderData[state] || 0
            }));

        console.log('State-wise order counts:', result);
        return result;
    }

    static async getRepeatCustomersTotalPrice(startDate, endDate, locationFilter) {
        // Find repeat customer IDs (users who had orders before the start date)
        const repeatCustomerIds = await orderBookingData.findAll({
            attributes: ['phone'],
            where: Sequelize.where(fn('DATE', col('datetime')), { [Op.lt]: startDate }),
            group: ['phone']
        });
        let locations = [];
        if (locationFilter.length > 0) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }

        // Extract user IDs from the result
        const userIds = repeatCustomerIds.map(order => order.get('phone'));

        // Sum total_price for repeat customers within the date range
        const repeatCustomerTotalPrice = await orderBookingData.findOne({
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('total_price')), 'total_price_sum'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_orders']
            ],
            where: {
                [Op.and]: [
                    { phone: { [Op.in]: userIds } },
                    Sequelize.where(fn('DATE', col('datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    locationFilter.length > 0
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {}
                ]
            }
        });

        // const totalPriceSum = repeatCustomerTotalPrice && repeatCustomerTotalPrice.get('total_price_sum')
        //     ? parseFloat(parseFloat(repeatCustomerTotalPrice.get('total_price_sum')).toFixed(2))
        //     : 0.00;

        console.log('Repeat Customer Total Price Sum -->>', repeatCustomerTotalPrice);

        return repeatCustomerTotalPrice;
    }

    static async getNewCustomersTotalPrice(startDate, endDate, locationFilter) {
        // Find repeat customer IDs (users who had orders before the start date)
        const repeatCustomerIds = await orderBookingData.findAll({
            attributes: ['phone'],
            where: Sequelize.where(fn('DATE', col('datetime')), { [Op.lt]: startDate }),
            group: ['phone']
        });
        let locations = [];
        if (locationFilter.length > 0) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }

        // Extract user IDs from the result
        const userIds = repeatCustomerIds.map(order => order.get('phone'));

        // Count total orders for new customers within the date range
        const newOrderTotalPrice = await orderBookingData.findOne({
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('total_price')), 'total_price_sum'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_orders']
            ],
            where: {
                [Op.and]: [
                    { phone: { [Op.notIn]: userIds } },
                    Sequelize.where(fn('DATE', col('datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    locationFilter.length > 0
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {}
                ]
            }
        });
        // const totalPriceSum = newOrderTotalPrice && newOrderTotalPrice.get('total_price_sum')
        //     ? parseFloat(parseFloat(newOrderTotalPrice.get('total_price_sum')).toFixed(2))
        //     : 0.00;

        // console.log('new Customer Total Price Sum -->>', newOrderTotalPrice);
        return newOrderTotalPrice;
    }

    static async groupByDateOrMonthOrYear(startDate, endDate, startYear, endYear, type, locationFilter) {
        let data = [];
        const currentYear = new Date().getFullYear();
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        let locations = [];
        if (locationFilter.length > 0) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }
        if (type === 'date') {
            console.log('endDate:', endDate, 'Type:', typeof endDate);
            console.log('startDate:', startDate, 'Type:', typeof startDate);

            const newEndDate = new Date(endDate);
            const newStartDate = new Date(startDate);

            // Calculate the difference between startDate and endDate in days
            const diffInTime = newEndDate.getTime() - newStartDate.getTime();
            const diffInDays = diffInTime / (1000 * 3600 * 24); // Convert milliseconds to days


            // If the difference is greater than 15 days, group by month
            if (diffInDays > 15) {
                console.log('Grouping by month due to date range being greater than 15 days');

                // Group data by month
                const monthRangeData = await orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('MONTH', Sequelize.col('datetime')), 'month'],
                        [Sequelize.fn('YEAR', Sequelize.col('datetime')), 'year'],
                        [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'newCustomers'],
                        [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'repeatCustomers']
                    ],
                    where: {
                        [Op.and]: [
                            Sequelize.where(fn('DATE', col('datetime')), { [Op.gte]: newStartDate, [Op.lte]: newEndDate }),
                            locationFilter.length > 0
                                ? Sequelize.where(fn('LOWER', col('shipping_province')), { [Op.in]: locations })
                                : {}
                        ]
                    },
                    group: [
                        Sequelize.fn('MONTH', Sequelize.col('datetime')),
                        Sequelize.fn('YEAR', Sequelize.col('datetime'))
                    ],
                    raw: true
                });

                // Push the month-wise data to the result
                for (let item of monthRangeData) {
                    const month = item.month;
                    const year = item.year;
                    const newCustomers = await this.getNewCustomers(month, year, locationFilter);
                    const repeatCustomers = await this.getRepeatCustomers(month, year, locationFilter);

                    data.push({
                        month: monthNames[month - 1],
                        year: year,
                        newCustomers: newCustomers,
                        repeatCustomers: repeatCustomers
                    });
                }

            } else {
                // If the date range is less than or equal to 15 days, group by date
                console.log('Grouping by date as the date range is 15 days or less');

                const dateRangeData = await orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('DATE', Sequelize.col('datetime')), 'date'],
                        [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'newCustomers'],
                        [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'repeatCustomers']
                    ],
                    where: {
                        [Op.and]: [
                            Sequelize.where(fn('DATE', col('datetime')), { [Op.gte]: newStartDate, [Op.lte]: newEndDate }),
                            locationFilter.length > 0
                                ? Sequelize.where(fn('LOWER', col('shipping_province')), { [Op.in]: locations })
                                : {}
                        ]
                    },
                    group: [Sequelize.fn('DATE', Sequelize.col('datetime'))],
                    raw: true
                });

                // Filter and count new and repeat customers
                for (let item of dateRangeData) {
                    const date = item.date;
                    const newCustomers = await this.getNewCustomers(date, date, locationFilter);
                    const repeatCustomers = await this.getRepeatCustomers(date, date, locationFilter);

                    data.push({
                        date: date,
                        newCustomers: newCustomers,
                        repeatCustomers: repeatCustomers
                    });
                }
            }

            console.log('data-->>>', data);
        } else if (type === 'month') {
            // If it's a month range
            const monthData = await orderBookingData.findAll({
                attributes: [
                    [Sequelize.fn('MONTH', Sequelize.col('datetime')), 'month'],
                    [Sequelize.fn('YEAR', Sequelize.col('datetime')), 'year'],
                    [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'newCustomers'],
                    [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'repeatCustomers']
                ],
                where: {
                    [Op.and]: [
                        Sequelize.where(fn('DATE', col('datetime')), { [Op.gte]: startDate, [Op.lte]: endDate }),
                        locationFilter.length > 0
                            ? Sequelize.where(fn('LOWER', col('shipping_province')), { [Op.in]: locations })
                            : {}
                    ]
                },
                group: [Sequelize.fn('MONTH', Sequelize.col('datetime')), Sequelize.fn('YEAR', Sequelize.col('datetime'))],
                order: [
                    [Sequelize.fn('YEAR', Sequelize.col('datetime')), 'ASC'],
                    [Sequelize.fn('MONTH', Sequelize.col('datetime')), 'ASC']
                ],
                raw: true
            });
            console.log('month wise data --->>>>', monthData)
            // Filter and count new and repeat customers month-wise
            for (let item of monthData) {
                const startMonthDate = new Date(item.year, item.month - 1, 1);
                const endMonthDate = new Date(item.year, item.month, 0);

                const newCustomers = await this.getNewCustomers(startMonthDate, endMonthDate, locationFilter);
                const repeatCustomers = await this.getRepeatCustomers(startMonthDate, endMonthDate, locationFilter);

                data.push({
                    month: monthNames[item.month - 1],
                    year: item.year,
                    newCustomers: newCustomers,
                    repeatCustomers: repeatCustomers
                });
            }
        } else if (type === 'year') {
            // Handle logic for financial year
            console.log('current year--->>>>', currentYear);
            // Financial year starts from April 1st of startYear
            const startDate = new Date(startYear, 3, 1);  // Start of the financial year (April 1st)
            let endDate;
            if (endYear === currentYear + 1) {
                // If end year is next year (2024-2025), set the end date to the current date
                endDate = new Date(); // Current date
            } else {
                // Else, end date is March 31st of the end year
                endDate = new Date(endYear, 2, 31);  // March 31st (last day of the financial year)
            }
            // Loop through each month of the financial year (April to March)
            // So we loop from 0 (April) to 11 (March)
            for (let month = 0; month < 12; month++) {
                // Get the start and end dates for the month based on financial year
                const monthStartDate = new Date(startYear, month + 3, 1);  // Financial year starts from April (month 3)
                const monthEndDate = new Date(startYear, month + 4, 0); // Last day of the month

                // If the month is after the current date, break the loop as we can't query future months
                if (monthStartDate > endDate) break;

                // Count repeat customers for the specific month
                const repeatCustomers = await this.getRepeatCustomers(monthStartDate, monthEndDate, locationFilter);
                // Count new customers for the specific month
                const newCustomers = await this.getNewCustomers(monthStartDate, monthEndDate, locationFilter);

                // Push the data for the month
                data.push({
                    month: monthNames[(month + 3) % 12], // Month (1-based, so add 1)
                    newCustomers: newCustomers,
                    repeatCustomers: repeatCustomers
                });
            }
        }
        return data;
    }

    static async getNewAndRepeatCustomerCount(startDate, endDate, locationFilter) {
        try {
            // Normalize location filter
            const locationList = locationFilter.map(loc => loc.toLowerCase());

            // Step 1: Get all distinct phones (last 10 digits) who ordered before startDate = Repeat base
            const repeatCustomers = await orderBookingData.findAll({
                attributes: [[fn('DISTINCT', fn('RIGHT', col('phone'), 10)), 'phone']],
                where: Sequelize.where(fn('DATE', col('datetime')), { [Op.lt]: startDate }),
                raw: true
            });
            const repeatPhones = repeatCustomers.map(row => row.phone);

            // Step 2: Build base conditions for orders within the date range
            const dateRangeConditions = [
                Sequelize.where(fn('DATE', col('datetime')), { [Op.gte]: startDate }),
                Sequelize.where(fn('DATE', col('datetime')), { [Op.lte]: endDate })
            ];

            if (locationList.length > 0) {
                dateRangeConditions.push(
                    Sequelize.where(fn('LOWER', col('shipping_province')), {
                        [Op.in]: locationList
                    })
                );
            }

            // Step 3: Get all distinct phones (last 10 digits) who ordered within date range and location
            const dateRangePhones = await orderBookingData.findAll({
                attributes: [[fn('DISTINCT', fn('RIGHT', col('phone'), 10)), 'phone']],
                where: { [Op.and]: dateRangeConditions },
                raw: true
            });

            const phoneList = dateRangePhones.map(row => row.phone);

            // Step 4: Identify repeat and new customers
            const newCustomerPhones = phoneList.filter(phone => !repeatPhones.includes(phone));
            const repeatCustomerPhones = phoneList.filter(phone => repeatPhones.includes(phone));

            // Final counts
            return {
                new_customers: newCustomerPhones.length,
                repeat_customers: repeatCustomerPhones.length
            };

        } catch (error) {
            console.error('Error in getNewAndRepeatCustomerCount:', error);
            return {
                new_customers: 0,
                repeat_customers: 0,
                error: true
            };
        }
    }

    static async getTotalOrdersAndAov(startDate, endDate, locationFilter) {
        const includeAllLocations = locationFilter.length === 0;
        let locations = [];
        if (!includeAllLocations) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }

        // Query to get total orders grouped by shipping_province within the date range
        const orders = await orderBookingData.findAll({
            attributes: [
                // [Sequelize.fn('LOWER', Sequelize.col('shipping_province')), 'state'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_orders'],
                [Sequelize.fn('SUM', Sequelize.col('total_price')), 'total_amount'],
                [fn('DATE_FORMAT', col('datetime'), '%Y%m'), 'year_month']
            ],
            where: {
                [Op.and]: [
                    Sequelize.where(fn('DATE', col('datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    // Apply location filter only if locationFilter is not empty
                    !includeAllLocations
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {}
                ]
            },
            group: [fn('DATE_FORMAT', col('datetime'), '%Y%m'), 'year_month'],
            order: [['year_month', 'ASC']]
        });
        // Convert the query result to an object with state names as keys
        // const orderData = {};
        // orders.forEach(order => {
        //     orderData[order.get('state')] = parseInt(order.get('order_count'), 10);
        // });

        // Prepare the result:
        // - If including all locations, use all available states in `orderData`
        // - If filtering, include only states from `locationFilter`
        // const result = (includeAllLocations ? Object.keys(orderData) : locationFilter.map(loc => loc.toLowerCase()))
        //     .map(state => ({
        //         state,
        //         order_count: orderData[state] || 0
        //     }));

        // console.log('State-wise order counts:', result);
        return orders;
    }

    static async getWeeklyWiseAverageOrderData() {
        const momentStart = moment().startOf('month');
        const momentEnd = moment().endOf('month');

        // Generate ISO week ranges strictly inside current month
        const weeksOfRange = [];
        let current = momentStart.clone();

        while (current.isBefore(momentEnd)) {
            const weekStart = current.clone().startOf('isoWeek');
            const weekEnd = current.clone().endOf('isoWeek');

            // Only include weeks with at least 1 day in this month
            if (weekEnd.isBefore(momentStart) || weekStart.isAfter(momentEnd)) {
                current.add(1, 'week');
                continue;
            }

            weeksOfRange.push({
                isoWeek: weekStart.isoWeek(),
                start: weekStart.toDate(),
                end: weekEnd.toDate()
            });

            current.add(1, 'week');
        }

        // Where condition for current month
        const whereClause = {
            datetime: {
                [Op.gte]: momentStart.toDate(),
                [Op.lte]: momentEnd.toDate(),
            }
        };

        const orders = await orderBookingData.findAll({
            attributes: [
                [fn('WEEK', col('datetime'), 3), 'week_of_month'], // mode=3 = ISO week
                [fn('COUNT', col('id')), 'total_orders'],
                [fn('SUM', col('total_price')), 'total_revenue'],
                [
                    literal('SUM(total_price) / NULLIF(COUNT(id), 0)'),
                    'avg_order_value',
                ],
                [
                    literal(`
                        SUM(CASE WHEN LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END) /
                        NULLIF(COUNT(CASE WHEN LOWER(financial_status) = 'pending' THEN 1 ELSE NULL END), 0)
                    `),
                    'avg_cod_order_value',
                ],
                [
                    literal(`
                        SUM(CASE WHEN LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END) /
                        NULLIF(COUNT(CASE WHEN LOWER(financial_status) = 'paid' THEN 1 ELSE NULL END), 0)
                    `),
                    'avg_prepaid_order_value',
                ],
            ],
            where: whereClause,
            group: [fn('WEEK', col('datetime'), 3)],
            order: [[literal('week_of_month'), 'ASC']],
            raw: true,
        });

        // Group by ISO week number
        const ordersByWeek = orders.reduce((acc, order) => {
            acc[order.week_of_month] = order;
            return acc;
        }, {});

        const finalResult = weeksOfRange.map(week => {
            const weekData = ordersByWeek[week.isoWeek] || {
                week_of_month: week.isoWeek,
                total_orders: 0,
                total_revenue: 0,
                avg_order_value: 0,
                avg_cod_order_value: 0,
                avg_prepaid_order_value: 0,
            };

            return {
                ...weekData,
                start_date: week.start,
                end_date: week.end,
            };
        });

        return finalResult;
    }

    static async getTopSellingProducts(startDate, endDate, locationFilter) {
        const includeAllLocations = locationFilter.length === 0;
        let locations = [];
        if (!includeAllLocations) {
            locationFilter.forEach(async (location) => {
                locations.push(`${location.toLowerCase()}`);
            });
        }

        // Query to get total orders grouped by shipping_province within the date range
        const orders = await OrderDetail.findAll({
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('quantity')), 'total_qty'],
                // [Sequelize.fn('SUM', Sequelize.col('price')), 'total_amount'],
                [Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'total_amount'],
                [Sequelize.fn('MAX', Sequelize.col('title')), 'product_name'],
                'sku'
            ],
            include: [{
                model: orderBookingData,
                required: true, // Set to true for INNER JOIN, false for LEFT JOIN
                as: 'order_data',
                attributes: []
            }],
            where: {
                [Op.and]: [
                    Sequelize.where(fn('DATE', col('order_data.datetime')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    // Apply location filter only if locationFilter is not empty
                    !includeAllLocations
                        ? Sequelize.where(
                            fn('LOWER', col('shipping_province')),
                            { [Op.in]: locations }
                        )
                        : {}
                ]
            },
            group: ['sku'],
            order: [['total_qty', 'DESC']],
            limit: 10
        });
        // Convert the query result to an object with state names as keys
        // const orderData = {};
        // orders.forEach(order => {
        //     orderData[order.get('state')] = parseInt(order.get('order_count'), 10);
        // });

        // Prepare the result:
        // - If including all locations, use all available states in `orderData`
        // - If filtering, include only states from `locationFilter`
        // const result = (includeAllLocations ? Object.keys(orderData) : locationFilter.map(loc => loc.toLowerCase()))
        //     .map(state => ({
        //         state,
        //         order_count: orderData[state] || 0
        //     }));

        // console.log('State-wise order counts:', result);
        return orders;
    }

    static async getRevenueTrendMonthly(startDate, endDate, locationFilter) {
        let whereCond = `WHERE DATE(datetime) >= '${startDate}' AND DATE(datetime) <= '${endDate}'`;
        if (locationFilter.length > 0) {
            whereCond += ` AND LOWER(shipping_province) IN (?)`;
        }
        let qry = `SELECT SUM(total_price) AS total_sales, 
                          SUM(IF((LOWER(order_status)='cancelled' OR LOWER(order_status)='rto' OR LOWER(order_status)='rto-initiated' OR LOWER(order_status)='lost in transit'), total_price, 0)) AS total_deduction, 
                          MONTHNAME(datetime) AS date_month 
                   FROM order_booking_data 
                   ${whereCond}
                   GROUP BY MONTH(datetime), MONTHNAME(datetime)
                   ORDER BY MONTH(datetime)`;

        const revenueTrendMonthly = await sequelize.query(qry, { replacements: locationFilter });

        console.log('revenue trend month-wise -->>', { qry, revenueTrendMonthly });
        return revenueTrendMonthly[0];
    }

    static async getSalePurchaseData({ start_date, end_date, locations }) {
        try {
            // Get current date details
            const currentYear = new Date().getFullYear();
            const today = new Date().toISOString().slice(0, 10); // Format today's date to 'YYYY-MM-DD'
            const defaultStartDate = `${currentYear}-04-01`; // Start of the financial year (April 1st)

            // Set date range based on provided start_date, end_date, and filter type
            let finalStartDate = start_date || defaultStartDate;
            let finalEndDate = end_date || today;

            if (!type || !['date', 'month', 'year'].includes(type)) {
                throw new Error('Invalid type provided. Expected "date", "month", or "year".');
            }

            // Adjust finalStartDate and finalEndDate based on type
            if (type === 'month') {
                // Monthly range based on start_month and end_month
                const startMonthDate = new Date(currentYear, start_month - 1, 1);
                const endMonthDate = new Date(currentYear, end_month, 0);
                finalStartDate = startMonthDate.toISOString().slice(0, 10);
                finalEndDate = endMonthDate.toISOString().slice(0, 10);
            } else if (type === 'year') {
                // Financial year range based on start_year and end_year
                const startDate = new Date(start_year, 3, 1);  // April 1st
                const endDate = (end_year === currentYear + 1) ? new Date() : new Date(end_year, 2, 31);  // March 31st
                finalStartDate = startDate.toISOString().slice(0, 10);
                finalEndDate = endDate.toISOString().slice(0, 10);
            }

            // Apply location filter if locations are specified
            const locationFilter = locations && locations.length > 0 ? locations : [];

            // Fetch total orders based on filtered dates and location
            const totalStockData = await OrderHelper.getStockData(finalStartDate, finalEndDate, locationFilter);

            // Return only the total orders count for verification
            return {
                filterCriteria: {
                    finalStartDate,
                    finalEndDate,
                    locationFilter,
                    filterType: type
                },
                totalStockData: totalStockData,
                message: "Total Stock Data based on the applied filters."
            };

        } catch (error) {
            console.error("Error fetching data:", error.message);
            throw error; // Optional: rethrow the error for higher-level handling
        }

    }

    static async getStockData(startDate, endDate, locationFilter) {
        console.log('locationFilter and length-->>', locationFilter, locationFilter.length);

        // Query to fetch stock-related data based on filters
        const stockData = await DaburPurchaseData.findAll({
            attributes: [
                'city',  // Location from DaburPurchaseData
                [Sequelize.fn('MONTH', Sequelize.col('created_at')), 'Month'],  // Extract month
                [Sequelize.fn('SUM', Sequelize.col('received_qty')), 'Stock Purchase (Units)'],
                [Sequelize.fn('SUM', Sequelize.col('net_price')), 'Stock Purchase Amount (in Rs)'],
            ],
            where: {
                [Op.and]: [
                    Sequelize.where(Sequelize.fn('DATE', Sequelize.col('created_at')), {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }),
                    locationFilter.length > 0
                        ? Sequelize.where(
                            Sequelize.fn('LOWER', Sequelize.col('city')),
                            { [Op.in]: locationFilter.map(location => location.toLowerCase()) }
                        )
                        : {}
                ]
            },
            include: [
                // {
                //     model: OrderDetail,  // Include OrderDetail model
                //     attributes: [
                //         [Sequelize.fn('SUM', Sequelize.col('stock_sale_units')), 'Stock Sale (Units)']
                //     ],
                //     required: false,  // Ensure it's an outer join (LEFT JOIN)
                // },
                // {
                //     model: OrderBookingData,  // Include OrderBookingData model
                //     attributes: [
                //         [Sequelize.fn('SUM', Sequelize.col('stock_sale_amount')), 'Stock Sale (in Rs)']
                //     ],
                //     required: false,  // Ensure it's an outer join (LEFT JOIN)
                // },
                {
                    model: RemittanceData,  // Include RemittanceData model
                    attributes: [
                        [Sequelize.fn('SUM', Sequelize.col('in_bank')), 'In Bank']
                    ],
                    required: false,  // Ensure it's an outer join (LEFT JOIN)
                }
            ],
            group: [
                'city', // Group by location
                Sequelize.fn('MONTH', Sequelize.col('created_at')) // Group by month
            ],
            raw: true  // Get raw results without extra Sequelize metadata
        });

        console.log('Stock Data--->>>', stockData);
        return stockData;
    }

    static async getPurchaseGrnData(startDate, endDate, location) {
        const whereClause = {};
        // Ensure Op.and is initialized if any condition is added
        whereClause[Op.and] = [];
        // Add Date range condition if startDate and endDate are provided
        if (startDate && endDate) {
            whereClause[Op.and].push(
                Sequelize.where(
                    Sequelize.fn('DATE', Sequelize.col('invoice_date')),
                    { [Op.gte]: startDate, [Op.lte]: endDate }
                )
            );
        }

        // Add Location condition if location is provided
        if (location) {
            whereClause[Op.and].push(
                Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('city')),
                    location.toLowerCase()
                )
            );
        }

        // Remove Op.and if no conditions were added
        if (whereClause[Op.and].length === 0) {
            delete whereClause[Op.and];
        }
        const purchaseGrnData = await DaburPurchaseData.findAll({
            attributes: [
                'city',
                [Sequelize.col('customer_po_number'), 'po_number'],
                [Sequelize.literal('MAX(id)'), 'id'],
                [Sequelize.literal('MAX(invoice_date)'), 'date_of_invoice'],
                [Sequelize.literal('MAX(invoice_no)'), 'invoice_no'],
                [Sequelize.literal('SUM(po_qty)'), 'po_qty'],
                [Sequelize.literal('SUM(inv_qty)'), 'invoice_qty'],
                [Sequelize.literal('SUM(received_qty)'), 'grn_qty'],
                // [Sequelize.literal('ROUND(SUM(inv_total), 2)'), 'invoice_amount'],
                [Sequelize.literal("ROUND(SUM(REPLACE(inv_total, ',', '') + 0), 2)"), 'invoice_amount'],
                [Sequelize.literal('ROUND(SUM(actual_selling_price * received_qty), 2)'), 'grn_amount'],
                [Sequelize.literal('SUM(damaged_qty)'), 'damaged_qty'],
                [Sequelize.literal('SUM(return_qty)'), 'return_qty'],
                [Sequelize.literal('ROUND(SUM(damaged_qty * net_price), 2)'), 'damaged_amount'],
                [Sequelize.literal('ROUND(SUM(return_qty * net_price), 2)'), 'return_amount'],
                [Sequelize.literal("ROUND(IFNULL(SUM(REPLACE(inv_total, ',', '') + 0), 0) - IFNULL(SUM(actual_selling_price * received_qty), 0), 2)"), 'credit_not_to_be_issued']

            ],
            where: whereClause,
            group: ['city', 'customer_po_number'],
            order: [[Sequelize.literal('id'), 'DESC']]
        });
        console.log("purchaseGrnData->>>>", purchaseGrnData)

        return purchaseGrnData;

    }

    static async getPurchaseGrnDataSkuWise(startDate, endDate, page, limit, location) {
        const whereClause = {};
        // Date range condition
        if (startDate && endDate) {
            whereClause[Op.and] = [
                Sequelize.where(
                    Sequelize.fn('DATE', Sequelize.col('invoice_date')),
                    { [Op.gte]: startDate, [Op.lte]: endDate }
                )
            ];
        }
        // Location condition
        if (location) {
            whereClause[Op.and] = [
                ...(whereClause[Op.and] || []),
                Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('city')),
                    location.toLowerCase()
                )
            ];
        }

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        const purchaseGrnDataSkuWiseData = await DaburPurchaseData.findAll({
            attributes: [
                'material_number',
                [Sequelize.col('customer_po_number'), 'po_number'],
                [Sequelize.fn('MAX', Sequelize.col('id')), 'id'],
                [Sequelize.fn('MAX', Sequelize.col('invoice_date')), 'date_of_invoice'],
                [Sequelize.fn('MAX', Sequelize.col('invoice_no')), 'invoice_no'],
                [Sequelize.literal('SUM(po_qty)'), 'po_qty'],
                [Sequelize.literal('SUM(inv_qty)'), 'invoice_qty'],
                [Sequelize.literal('SUM(received_qty)'), 'grn_qty'],
                [Sequelize.literal("ROUND(SUM(REPLACE(inv_total, ',', '') + 0), 2)"), 'invoice_amount'],
                [Sequelize.literal('ROUND(SUM(actual_selling_price * received_qty), 2)'), 'grn_amount'],
                [Sequelize.literal("ROUND(SUM(REPLACE(inv_total, ',', '') + 0) - SUM(actual_selling_price * received_qty), 2)"), 'credit_not_to_be_issued']

            ],
            where: {
                ...whereClause,
            },
            group: ['material_number', 'customer_po_number'],
            order: [[Sequelize.fn('MAX', Sequelize.col('id')), 'DESC']],
            offset,
            limit
        });


        const totalCount = await DaburPurchaseData.findAll({
            attributes: [
                'material_number',
                [Sequelize.literal('MAX(invoice_no)'), 'invoice_no'],
            ],
            where: whereClause,
            group: ['material_number', 'invoice_no']
        });
        const length = totalCount.length;
        console.log('total count >>>>', length);

        const totalPages = Math.ceil(length / limit);
        console.log('total count and page', totalPages, 'page', length)
        return {
            purchaseGrnDataSkuWiseData,
            pagination: {
                total_records: length,
                total_pages: totalPages,
                current_page: page,
                page_size: limit
            }
        };
    }

    static async getBrandWiseSales(location) {
        try {
            const locations = location.map(i => i.toLowerCase());
            const locationQuery = locations.length > 0 ? "LOWER(obd.shipping_province) IN (:locations) AND" : '';

            const query = `SELECT 
                od.brand, 
                ${locations?.length > 0 ? 'obd.shipping_province AS location,' : ''}
                SUM(od.quantity) AS total_order, 
                ROUND((SUM(od.quantity) / (SELECT SUM(quantity) FROM order_details) * 100), 2) AS brand_percentage
            FROM 
                order_details od
            JOIN 
                order_booking_data obd ON od.order_no = obd.order_number
            WHERE 
                ${locationQuery} 
                od.brand IS NOT NULL 
                AND od.brand <> ''
            GROUP BY 
                od.brand ${locations?.length > 0 ? ', obd.shipping_province' : ''}
            ORDER BY 
                total_order DESC
                ${locations.length === 0 ? "LIMIT 5" : ''};
        `
            const totalQuantityQuery = `
            SELECT SUM(quantity) AS total_quantity
            FROM order_details;
        `;

            const [result, totalQuantityResult] = await Promise.all([
                sequelize.query(query, {
                    replacements: { locations },
                    type: sequelize.QueryTypes.SELECT,
                }),
                sequelize.query(totalQuantityQuery, {
                    type: sequelize.QueryTypes.SELECT,
                }),
            ]);
            const totalQuantity = totalQuantityResult[0]?.total_quantity || 0;
            return {
                total_quantity: totalQuantity,
                brand_wise_data: result,
            };
        } catch (error) {
            console.error("Error fetching brand order data:", error);
            throw error;
        }
    }

    static async getOrders(startDate, courier, status, payment_mode, location, limit, offset) {
        let statusCond = [];
        let statusCondition = [];

        if (status === 'pending') {
            // Exclude these statuses for "pending" orders
            statusCond = [
                'delivered', 'out_for_delivery', 'out for delivery', 'packed', 'cancelled',
                'undelivered', 'intransit', 'rto lock', 'rto-initiated', 'rto-delivered',
                'shipped & returned', 'shipped complete', 'partially shipped'
            ].map(s => s.toLowerCase());
        } else {
            // Include only matching status orders
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

        const query = `
            SELECT *
            FROM order_booking_data
            WHERE 
                ${status === 'pending' ? `LOWER(order_status) NOT IN (:statusCond)` : `LOWER(order_status) IN (:statusCondition)`}
                ${startDate ? `AND DATE(datetime) = :startDate` : ''}
                ${courier ? `AND LOWER(lm_partner) = :courier` : ''}
                ${payment_mode ? `AND LOWER(financial_status) = :payment_mode` : ''}
                ${location ? `AND LOWER(warehouse_name) = :location` : ''}
            ORDER BY datetime DESC
            LIMIT :limit OFFSET :offset;
        `;

        const replacements = {
            statusCond,
            statusCondition,
            startDate,
            courier: courier ? courier.toLowerCase() : undefined,
            payment_mode: payment_mode === 'cod' ? 'pending' : 'paid',
            location: location ? location.toLowerCase() : undefined,
            limit: Number(limit),
            offset: Number(offset),
        };

        try {
            const [results] = await sequelize.query(query, { replacements });
            return results;
        } catch (error) {
            console.error('Error fetching orders from helper:', error.message);
            throw error;
        }
    }

    static async RtoData(startDate, endDate) {
        try {
            const validStartDate = new Date(startDate);
            const validEndDate = new Date(endDate);
            const currentDate = new Date();
            let firstDayOfMonth = new Date(startDate);
            let lastDayOfMonth = new Date(endDate);

            if (!startDate && !endDate) {
                const currentDate = new Date();
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                firstDayOfMonth = new Date(year, month, 1);
                lastDayOfMonth = new Date(year, month + 1, 0);

            }

            const formattedFirstDayOfMonth = firstDayOfMonth.toISOString().split('T')[0];
            const formattedLastDayOfMonth = lastDayOfMonth.toISOString().split('T')[0];
            firstDayOfMonth = formattedFirstDayOfMonth;
            lastDayOfMonth = formattedLastDayOfMonth;
            console.log('First Day of Month:', firstDayOfMonth);
            console.log('Last Day of Month:', lastDayOfMonth);

            const rtoCounts = await orderBookingData.findAll({
                attributes: [
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOrders'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto in transit', 'rto reached at destination', 'ofd lock', 'rto lock', 'returned') THEN 1 ELSE 0 END
                    `)), 'rtoOrders'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'rto-initiated' THEN 1 ELSE 0 END
                    `)), 'rtoInitiated'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'rto-delivered' THEN 1 ELSE 0 END
                    `)), 'rtoDelivered'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'shipped & returned' THEN 1 ELSE 0 END
                    `)), 'shippedReturned'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'rto in transit' THEN 1 ELSE 0 END
                    `)), 'rtoInTransit'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'rto reached at destination' THEN 1 ELSE 0 END
                    `)), 'rtoReachedAtDestination'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'ofd lock' THEN 1 ELSE 0 END
                    `)), 'ofdLock'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'rto lock' THEN 1 ELSE 0 END
                    `)), 'rtoLock'],
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) = 'returned' THEN 1 ELSE 0 END
                    `)), 'returned'],
                ],
                where: {
                    ...(startDate && endDate && {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '>=', firstDayOfMonth),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '<=', lastDayOfMonth),
                        ]
                    }),
                },
            });

            const totalOrders = Number(rtoCounts[0]?.dataValues?.totalOrders || 0);
            const totalRTO = Number(rtoCounts[0]?.dataValues?.rtoOrders || 0);
            const rtoPercentage = totalOrders > 0 ? ((totalRTO / totalOrders) * 100).toFixed(2) : 0;
            const rtoInitiated = Number(rtoCounts[0]?.dataValues?.rtoInitiated || 0);
            const rtoDelivered = Number(rtoCounts[0]?.dataValues?.rtoDelivered || 0);
            const shippedReturned = Number(rtoCounts[0]?.dataValues?.shippedReturned || 0);
            const rtoInTransit = Number(rtoCounts[0]?.dataValues?.rtoInTransit || 0);
            const rtoReachedAtDestination = Number(rtoCounts[0]?.dataValues?.rtoReachedAtDestination || 0);
            const ofdLock = Number(rtoCounts[0]?.dataValues?.ofdLock || 0);
            const rtoLock = Number(rtoCounts[0]?.dataValues?.rtoLock || 0);
            const returned = Number(rtoCounts[0]?.dataValues?.returned || 0);


            const generateDateRange = (startDate, endDate) => {
                const dateArray = [];
                const currentDate = new Date(startDate);
                const end = new Date(endDate);

                while (currentDate <= end) {
                    dateArray.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                return dateArray.map(date => date.toISOString().split('T')[0]); // Return an array of dates in 'YYYY-MM-DD' format
            };

            const allDates = generateDateRange(firstDayOfMonth, lastDayOfMonth);

            const rtoGraphData = await orderBookingData.findAll({
                attributes: [
                    [Sequelize.fn('DATE', Sequelize.col('datetime')), 'order_date'], // Format datetime as date for grouping
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOrders'], // Count total orders
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto in transit', 'rto reached at destination', 'ofd lock', 'rto lock', 'returned') 
                            AND LOWER(financial_status) = 'pending' THEN 1 ELSE 0 END
                    `)), 'codRtoOrders'], // Count COD RTO orders
                    [Sequelize.fn('SUM', Sequelize.literal(`
                        CASE WHEN LOWER(order_status) IN ('rto-initiated', 'rto-delivered', 'shipped & returned', 'rto in transit', 'rto reached at destination', 'ofd lock', 'rto lock', 'returned') 
                            AND LOWER(financial_status) = 'paid' THEN 1 ELSE 0 END
                    `)), 'prepaidRtoOrders'], // Count Prepaid RTO orders
                ],
                where: Sequelize.literal(`
                    DATE(datetime) >= '${firstDayOfMonth}' AND DATE(datetime) <= '${lastDayOfMonth}'
                `),
                group: [Sequelize.fn('DATE', Sequelize.col('datetime'))], // Group by date (not datetime)
                order: [[Sequelize.fn('DATE', Sequelize.col('datetime')), 'ASC']], // Optional: Order results by date ascending
            });

            const formattedRtoGraphData = allDates.map(date => {
                console.log('date', date, rtoGraphData)
                const dataForDate = rtoGraphData.find(item => item.dataValues.order_date === date);
                console.log('data', dataForDate)


                if (dataForDate) {
                    return {
                        order_date: date,
                        totalOrders: dataForDate.dataValues.totalOrders || 0,
                        codRtoOrders: dataForDate.dataValues.codRtoOrders || 0,
                        prepaidRtoOrders: dataForDate.dataValues.prepaidRtoOrders || 0,
                    };
                }

                return {
                    order_date: date,
                    totalOrders: 0,
                    codRtoOrders: 0,
                    prepaidRtoOrders: 0,
                };
            });

            console.log('grpgh data ->>>', formattedRtoGraphData);

            const response = {
                success: true,
                status: 200,
                message: 'RTO data fetched successfully',
                data: {
                    totalOrders,
                    totalRTO,
                    rtoPercentage,
                    rtoInitiated,
                    rtoDelivered,
                    shippedReturned,
                    rtoInTransit,
                    rtoReachedAtDestination,
                    ofdLock,
                    rtoLock,
                    returned,
                    rtoGraphData: formattedRtoGraphData,
                },
            };

            return response;
        } catch (error) {
            return {
                success: false,
                status: 500,
                message: error.message || 'Failed to fetch RTO data. Please try again.',
            };
        }
    }

    static async UndeliveredGraphData(startDate, endDate) {
        try {
            // Normalize function to format lm_status like 'RTO Reached' => 'RTO_Reached'
            const normalizeStatus = (status) => {
                if (!status) return "Unknown";
                return status
                    .toLowerCase()
                    .split(" ")
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join("_");
            };

            let firstDayOfMonth = startDate ? new Date(startDate) : null;
            let lastDayOfMonth = endDate ? new Date(endDate) : null;

            const currentDate = new Date();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            if (!firstDayOfMonth) {
                firstDayOfMonth = new Date(year, month, 1);
            }
            if (!lastDayOfMonth) {
                lastDayOfMonth = new Date(year, month + 1, 0);
            }

            const formattedFirstDayOfMonth = firstDayOfMonth.toISOString().split('T')[0];
            const formattedLastDayOfMonth = lastDayOfMonth.toISOString().split('T')[0];

            // 1. Get all unique lm_status values
            const allLmStatusRaw = await orderBookingData.findAll({
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('lm_status')), 'lm_status']],
                where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('order_status')), 'undelivered'),
                raw: true,
            });
            const allLmStatus = allLmStatusRaw.map(item => normalizeStatus(item.lm_status));

            // 2. Get actual undelivered data grouped by date and lm_status
            const undeliveredRaw = await orderBookingData.findAll({
                attributes: [
                    [Sequelize.fn('DATE', Sequelize.col('datetime')), 'order_date'],
                    'lm_status',
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOrders']
                ],
                where: {
                    [Op.and]: [
                        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('order_status')), 'undelivered'),
                        Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '>=', formattedFirstDayOfMonth),
                        Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '<=', formattedLastDayOfMonth)
                    ]
                },
                group: [Sequelize.fn('DATE', Sequelize.col('datetime')), 'lm_status'],
                raw: true
            });

            // 3. Create a map {date -> { lm_status -> count }}
            const dataMap = {};
            undeliveredRaw.forEach(item => {
                const date = item.order_date;
                const status = normalizeStatus(item.lm_status);
                const count = parseInt(item.totalOrders);
                if (!dataMap[date]) dataMap[date] = {};
                dataMap[date][status] = count;
            });

            // 4. Generate list of all dates between start and end
            const allDates = [];
            let current = new Date(firstDayOfMonth);
            while (current <= lastDayOfMonth) {
                allDates.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
            }

            // 5. Build final graph data
            const finalGraphData = [];
            for (const date of allDates) {
                const entry = { date };
                for (const status of allLmStatus) {
                    entry[status] = dataMap[date]?.[status] || 0;
                }
                finalGraphData.push(entry);
            }

            return {
                allLmStatus,
                graphData: finalGraphData
            };

        } catch (error) {
            console.error('Error in UndeliveredGraphData:', error);
            return { allLmStatus: [], graphData: [] };
        }
    }

    static async RtoGraphDataByPartner(startDate, endDate) {
        try {
            const rtoStatuses = [
                'rto-initiated', 'rto-delivered', 'shipped & returned',
                'rto in transit', 'rto reached at destination',
                'ofd lock', 'rto lock', 'returned'
            ];

            // Set date range
            const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const end = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

            const formattedStart = start.toISOString().split('T')[0];
            const formattedEnd = end.toISOString().split('T')[0];

            // Query grouped RTO data
            const rtoRaw = await orderBookingData.findAll({
                attributes: [
                    [Sequelize.fn('DATE', Sequelize.col('datetime')), 'order_date'],
                    'lm_partner',
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOrders']
                ],
                where: {
                    [Op.and]: [
                        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('order_status')), {
                            [Op.in]: rtoStatuses
                        }),
                        Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '>=', formattedStart),
                        Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '<=', formattedEnd)
                    ]
                },
                group: [Sequelize.fn('DATE', Sequelize.col('datetime')), 'lm_partner'],
                raw: true
            });

            // Normalize and map results
            const dataMap = {};
            const partnerSet = new Set();

            for (const item of rtoRaw) {
                const date = item.order_date;
                const partner = (item.lm_partner || 'Unknown').trim().toLowerCase();
                const count = parseInt(item.totalOrders) || 0;

                partnerSet.add(partner);
                if (!dataMap[date]) dataMap[date] = {};
                dataMap[date][partner] = count;
            }

            // Build list of all dates in range
            const allDates = [];
            for (let d = new Date(formattedStart); d <= end; d.setDate(d.getDate() + 1)) {
                allDates.push(d.toISOString().split('T')[0]);
            }

            const allPartners = Array.from(partnerSet).sort(); // sorted for cleaner UI

            // Format final graph data
            const graphData = allDates.map(date => {
                const row = { date };
                allPartners.forEach(partner => {
                    row[partner] = dataMap[date]?.[partner] || 0;
                });
                return row;
            });

            return { allPartners, graphData };

        } catch (err) {
            console.error("Error in RtoGraphDataByPartner:", err);
            return { allPartners: [], graphData: [] };
        }
    }

    static async getLmData(startDate, endDate) {
        try {
            // 1) Optional date filter
            const whereCondition = {};
            if (startDate && endDate) {
                whereCondition.datetime = {
                    [Op.gte]: startDate,
                    [Op.lte]: endDate,
                };
            }

            // Helpers for normalized fields
            const normLmStatus = Sequelize.literal("LOWER(TRIM(lm_status))");
            const normOrderStatus = Sequelize.literal("LOWER(TRIM(order_status))");

            // 2) LM-side aggregation (counts per partner, grouped by lm_status only)
            const lmResults = await orderBookingData.findAll({
                attributes: [
                    [normLmStatus, "status"],
                    [Sequelize.fn("SUM", Sequelize.literal(
                        "CASE WHEN LOWER(lm_partner) = 'dtdc' THEN 1 ELSE 0 END"
                    )), "dtdc_count"],
                    [Sequelize.fn("SUM", Sequelize.literal(
                        "CASE WHEN LOWER(lm_partner) = 'ecom' THEN 1 ELSE 0 END"
                    )), "ecom_count"],
                    [Sequelize.fn("SUM", Sequelize.literal(
                        "CASE WHEN LOWER(lm_partner) = 'ekart' THEN 1 ELSE 0 END"
                    )), "ekart_count"],
                    [Sequelize.fn("SUM", Sequelize.literal(
                        "CASE WHEN LOWER(lm_partner) = 'rapid ship' THEN 1 ELSE 0 END"
                    )), "rapidship_count"],
                    [Sequelize.fn("SUM", Sequelize.literal(
                        "CASE WHEN LOWER(lm_partner) = 'shipway' THEN 1 ELSE 0 END"
                    )), "shipway_count"],
                ],
                where: {
                    ...whereCondition,
                    lm_status: { [Op.ne]: null },
                },
                group: [normLmStatus],
                raw: true,
            });

            // 3) Vinculum-side aggregation (count grouped by order_status only)
            const vincResults = await orderBookingData.findAll({
                attributes: [
                    [normOrderStatus, "status"],
                    // since we already filter out nulls, COUNT(1) per group is fine
                    [Sequelize.fn("COUNT", Sequelize.literal("1")), "vinculum_count"],
                ],
                where: {
                    ...whereCondition,
                    order_status: { [Op.ne]: null },
                },
                group: [normOrderStatus],
                raw: true,
            });

            // 4) Merge by status (union of both sets)
            const asNumber = (v) => (v == null ? 0 : Number(v));
            const map = new Map();

            // Seed with LM rows (partner counts)
            for (const r of lmResults) {
                const key = r.status?.trim().toLowerCase();
                if (!key) continue;

                map.set(key, {
                    status: key,
                    dtdc_count: asNumber(r.dtdc_count),
                    ecom_count: asNumber(r.ecom_count),
                    ekart_count: asNumber(r.ekart_count),
                    rapidship_count: asNumber(r.rapidship_count),
                    shipway_count: asNumber(r.shipway_count),
                    vinculum_count: 0, // will be filled from vincResults if present
                });
            }

            // Add Vinculum rows (only vinculum_count)
            for (const r of vincResults) {
                const key = r.status?.trim().toLowerCase();
                if (!key) continue;

                if (!map.has(key)) {
                    map.set(key, {
                        status: key,
                        dtdc_count: 0,
                        ecom_count: 0,
                        ekart_count: 0,
                        rapidship_count: 0,
                        shipway_count: 0,
                        vinculum_count: asNumber(r.vinculum_count),
                    });
                } else {
                    const obj = map.get(key);
                    obj.vinculum_count = asNumber(r.vinculum_count);
                }
            }

            // 5) Clean invalid/test statuses
            const invalid = new Set(["", "empty", "null", "na"]);
            const filtered = Array.from(map.values()).filter((row) => {
                const s = row.status?.trim().toLowerCase();
                return s && !invalid.has(s) && !s.startsWith("test");
            });

            return filtered;
        } catch (error) {
            console.error("Error fetching LM Data:", error);
            throw error;
        }
    }

    static async getStatusWiseRtoData(body) {
        try {
            const page = body.page || 1;
            const limit = body.limit || 10;
            const offset = (page - 1) * limit;

            // Get start and end date from body (if provided)
            let { startDate, endDate } = body;
            let whereCondition = {};

            if (startDate && endDate) {
                whereCondition[Sequelize.Op.and] = [
                    Sequelize.where(Sequelize.fn("DATE", Sequelize.col("datetime")), { [Sequelize.Op.gte]: startDate }),
                    Sequelize.where(Sequelize.fn("DATE", Sequelize.col("datetime")), { [Sequelize.Op.lte]: endDate })
                ];
            }

            // Apply status and type filter
            if (body.status) {
                const status = body.status.toLowerCase();
                const type = body.type?.toLowerCase() || "";

                if (type === "vinculum") {
                    whereCondition.order_status = Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("order_status")), status);
                } else if (type === "dtdc") {
                    whereCondition = {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_status")), status),
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_partner")), type),
                        ]
                    };
                } else if (type === "ecom") {
                    whereCondition = {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_status")), status),
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_partner")), type),
                        ]
                    };
                } else if (type === "ekart") {
                    whereCondition = {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_status")), status),
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_partner")), type),
                        ]
                    };
                } else if (type === "rapid ship") {
                    whereCondition = {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_status")), status),
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_partner")), type),
                        ]
                    };
                } else if (type === "shipway") {
                    whereCondition = {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_status")), status),
                            Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("lm_partner")), type),
                        ]
                    };
                }
            }

            // Get paginated data
            const { rows, count } = await OrderBookingData.findAndCountAll({
                where: whereCondition,
                limit,
                offset,
                raw: true
            });

            // Get total count without limit & offset
            const totalCount = await OrderBookingData.count({ where: whereCondition });

            console.log("Final Data:", totalCount, rows, count);

            return {
                total: totalCount,
                orderData: rows,
            };
        } catch (error) {
            console.error("Error in getStatusWiseRtoData:", error);
            throw error;
        }
    }

    static async delaysData() {
        try {
            const result = await orderBookingData.findOne({
                attributes: [
                    [Sequelize.fn("COUNT", Sequelize.col("order_status")), "totalOrders"],
                    [Sequelize.fn("SUM", Sequelize.literal(`CASE WHEN LOWER(order_status) = 'destroyed' THEN 1 ELSE 0 END`)), "destroyedOrders"]
                ],
                raw: true
            });

            console.log("Result ->>>>>>>>>>>>>>>>>", result);

            return {
                success: true,
                destroyedOrders: result?.destroyedOrders || 0
            };
        } catch (error) {
            console.error("Error fetching delays data:", error.message);
            return {
                success: false,
                message: "Something went wrong",
                error: error.message
            };
        }
    }

    static async getSalesAnalyticsData({ startDate, endDate, compareStartDate, compareEndDate }) {
        try {
            // Validate inputs
            if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
                throw new Error('startDate, endDate, compareStartDate, and compareEndDate are all required.');
            }

            // Format date safely
            const formatDate = (date) => {
                const d = new Date(date);
                if (isNaN(d.getTime())) {
                    throw new Error(`Invalid date: ${date}`);
                }
                return d.toISOString().split('T')[0];
            };

            // Format and parse dates
            const formattedStartDate = formatDate(startDate);
            const formattedEndDate = formatDate(endDate);
            const formattedCompareStartDate = formatDate(compareStartDate);
            const formattedCompareEndDate = formatDate(compareEndDate);

            const parsedStartDate = new Date(formattedStartDate);
            const parsedEndDate = new Date(formattedEndDate);
            const parsedCompareStartDate = new Date(formattedCompareStartDate);
            const parsedCompareEndDate = new Date(formattedCompareEndDate);

            // Call the metrics helper with the updated date range
            const getAllMetrics = await this.getAllMetrics(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const totalSalesOvertime = await this.getTotalSalesOvertime(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const totalSalesBreakdown = await this.getSalesBreakdownOverTime(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const topSalesByProduct = await this.totalSalesByProduct(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const getSalesAttributeMarketing = await this.getSalesAttributeMarketing(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const getSalesByChannel = await this.getSalesByChannel(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const averageOrderValueOverTime = await this.averageOrderValueOverTime(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const grossSales = await this.grossSales(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);
            const salesProductSummary = await this.salesProductSummary(parsedStartDate, parsedEndDate, parsedCompareStartDate, parsedCompareEndDate);

            return {
                getAllMetrics,
                totalSalesOvertime,
                totalSalesBreakdown,
                topSalesByProduct,
                getSalesAttributeMarketing,
                getSalesByChannel,
                averageOrderValueOverTime,
                grossSales,
                salesProductSummary,
            };
        } catch (error) {
            console.error('Error in getSalesAnalyticsData:', error.message);
            throw error;
        }
    }

    static async getAllMetrics(startDate, endDate, compareStartDate, compareEndDate) {
        try {
            const formatDate = (date) => date.toISOString().split('T')[0];

            const startDateFormatted = formatDate(startDate);
            const endDateFormatted = formatDate(endDate);
            const compareStartDateFormatted = formatDate(compareStartDate);
            const compareEndDateFormatted = formatDate(compareEndDate);
            const compareDateFormatted = `${compareStartDateFormatted} to ${compareEndDateFormatted}`;

            // Fetch metrics (orders, fulfilled, customers) from orderBookingData
            const fetchBookingMetricsByDateRange = async (startDate, endDate) => {
                console.log('In Metrics', startDate, endDate)
                const data = await orderBookingData.findOne({
                    attributes: [
                        [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOrders'],
                        [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('cust_id'))), 'totalCustomers'],
                        [
                            Sequelize.fn(
                                'COUNT',
                                Sequelize.literal(`DISTINCT CASE WHEN TRIM(LOWER(order_status)) = 'delivered' THEN cust_id END`)
                            ),
                            'fulfilledOrders'
                        ]
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.gte]: startDate
                            }),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.lte]: endDate
                            })
                        ]
                    },
                    raw: true
                });

                return data || {};
            };

            // Fetch gross sales
            const fetchGrossSales = async (startDate, endDate) => {
                const result = await OrderDetail.findOne({
                    attributes: [
                        [Sequelize.literal('SUM(quantity * CAST(price AS DECIMAL(10,2)))'), 'totalSales']
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.gte]: startDate
                            }),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.lte]: endDate
                            })
                        ]
                    },
                    raw: true
                });

                return Number(result?.totalSales || 0);
            };

            // Fetch total discount
            const fetchTotalDiscount = async (startDate, endDate) => {
                const result = await OrderDetail.findOne({
                    attributes: [
                        [
                            Sequelize.literal(`
                                ROUND(SUM(
                                    (COALESCE(mrp, 0) * COALESCE(quantity, 0)) -
                                    (COALESCE(price, 0) * COALESCE(quantity, 0)) +
                                    COALESCE(discount, 0)
                                ), 2)
                            `),
                            "total_discount"
                        ]
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.gte]: startDate
                            }),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.lte]: endDate
                            })
                        ]
                    },
                    raw: true
                });

                return Number(result?.total_discount || 0);
            };

            // Distinct phones
            const fetchDistinctPhonesByDate = async (startDate, endDate) => {
                const phonesData = await orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('DISTINCT', Sequelize.fn('RIGHT', Sequelize.col('phone'), 10)), 'phone']
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.gte]: startDate
                            }),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.lte]: endDate
                            })
                        ]
                    },
                    raw: true
                });

                return phonesData.map((p) => p.phone);
            };

            // Returning customers
            const getReturningCount = async (phones, date) => {
                if (!phones.length) return 0;

                const returningPhones = await orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('DISTINCT', Sequelize.fn('RIGHT', Sequelize.col('phone'), 10)), 'phone']
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(
                                Sequelize.fn('RIGHT', Sequelize.col('phone'), 10),
                                { [Sequelize.Op.in]: phones }
                            ),
                            {
                                datetime: { [Sequelize.Op.lt]: date + ' 00:00:00' }
                            }
                        ]
                    },
                    raw: true
                });

                return returningPhones.length;
            };

            // Fetch all data in parallel
            const [
                mainMetrics,
                compareMetrics,
                mainGrossSales,
                compareGrossSales,
                mainPhones,
                comparePhones,
                mainDiscount,
                compareDiscount
            ] = await Promise.all([
                fetchBookingMetricsByDateRange(startDateFormatted, endDateFormatted),
                fetchBookingMetricsByDateRange(compareStartDateFormatted, compareEndDateFormatted),
                fetchGrossSales(startDateFormatted, endDateFormatted),
                fetchGrossSales(compareStartDateFormatted, compareEndDateFormatted),
                fetchDistinctPhonesByDate(startDateFormatted, endDateFormatted),
                fetchDistinctPhonesByDate(compareStartDateFormatted, compareEndDateFormatted),
                fetchTotalDiscount(startDateFormatted, endDateFormatted),
                fetchTotalDiscount(compareStartDateFormatted, compareEndDateFormatted)
            ]);

            const [mainReturningCount, compareReturningCount] = await Promise.all([
                getReturningCount(mainPhones, startDateFormatted),
                getReturningCount(comparePhones, compareStartDateFormatted)
            ]);

            // Percentage calculation helper
            const getChangePercent = (todayVal, compareVal) => {
                return compareVal === 0
                    ? (todayVal > 0 ? 100 : 0)
                    : ((todayVal - compareVal) / compareVal) * 100;
            };

            return {
                summary: {
                    range: `${startDateFormatted} to ${endDateFormatted}`,
                    compareDate: compareDateFormatted,
                    grossSales: {
                        today: mainGrossSales.toFixed(2),
                        compare: compareGrossSales.toFixed(2),
                        percentageChange: getChangePercent(mainGrossSales, compareGrossSales).toFixed(2)
                    },
                    discount: {
                        today: mainDiscount.toFixed(2),
                        compare: compareDiscount.toFixed(2),
                        percentageChange: getChangePercent(mainDiscount, compareDiscount).toFixed(2)
                    },
                    ordersFulfilled: {
                        today: Number(mainMetrics.fulfilledOrders || 0),
                        compare: Number(compareMetrics.fulfilledOrders || 0),
                        percentageChange: getChangePercent(
                            Number(mainMetrics.fulfilledOrders || 0),
                            Number(compareMetrics.fulfilledOrders || 0)
                        ).toFixed(2)
                    },
                    totalOrders: {
                        today: Number(mainMetrics.totalOrders || 0),
                        compare: Number(compareMetrics.totalOrders || 0),
                        percentageChange: getChangePercent(
                            Number(mainMetrics.totalOrders || 0),
                            Number(compareMetrics.totalOrders || 0)
                        ).toFixed(2)
                    },
                    returningCustomerRate: {
                        today: mainReturningCount,
                        compare: compareReturningCount,
                        percentageChange: getChangePercent(
                            mainReturningCount,
                            compareReturningCount
                        ).toFixed(2)
                    }
                }
            };
        } catch (error) {
            console.error('Error in getAllMetrics:', error.message);
            throw error;
        }
    }

    static async getTotalSalesOvertime(startDate, endDate, compareStartDate, compareEndDate) {
        try {
            const formatDate = (date) => new Date(date).toISOString().split('T')[0];

            const getReadableDate = (date) =>
                new Date(date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                });

            const startFormatted = formatDate(startDate);
            const endFormatted = formatDate(endDate);
            const compareStartFormatted = formatDate(compareStartDate);
            const compareEndFormatted = formatDate(compareEndDate);

            const readableCurrent = `${getReadableDate(startDate)} - ${getReadableDate(endDate)}`;
            const readableCompare = `${getReadableDate(compareStartDate)} - ${getReadableDate(compareEndDate)}`;

            const [currentSales, compareSales] = await Promise.all([
                orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('HOUR', Sequelize.col('datetime')), 'hour'],
                        [Sequelize.literal('ROUND(SUM(total_price), 2)'), 'totalSales']
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.between]: [startFormatted, endFormatted]
                            })
                        ]
                    },
                    group: [Sequelize.fn('HOUR', Sequelize.col('datetime'))],
                    order: [[Sequelize.fn('HOUR', Sequelize.col('datetime')), 'ASC']],
                    raw: true
                }),
                orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('HOUR', Sequelize.col('datetime')), 'hour'],
                        [Sequelize.literal('ROUND(SUM(total_price), 2)'), 'totalSales']
                    ],
                    where: {
                        [Sequelize.Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
                                [Sequelize.Op.between]: [compareStartFormatted, compareEndFormatted]
                            })
                        ]
                    },
                    group: [Sequelize.fn('HOUR', Sequelize.col('datetime'))],
                    order: [[Sequelize.fn('HOUR', Sequelize.col('datetime')), 'ASC']],
                    raw: true
                })
            ]);

            const calculateTotal = (data) =>
                data.reduce((sum, row) => sum + parseFloat(row.totalSales || 0), 0);

            const totalCurrent = calculateTotal(currentSales);
            const totalCompare = calculateTotal(compareSales);

            const percentageChange =
                totalCompare === 0
                    ? (totalCurrent === 0 ? 0 : 100)
                    : (((totalCurrent - totalCompare) / totalCompare) * 100).toFixed(2);

            const buildHourlyArray = (data) => {
                const hourMap = {};
                data.forEach(row => {
                    hourMap[row.hour] = parseFloat(parseFloat(row.totalSales || 0).toFixed(2));
                });

                const hourlySales = [];
                for (let i = 0; i < 24; i++) {
                    hourlySales.push(hourMap[i] || 0);
                }

                return hourlySales;
            };

            const currentGraphData = buildHourlyArray(currentSales);
            const compareGraphData = buildHourlyArray(compareSales);

            return {
                summary: {
                    startDate: startFormatted,
                    endDate: endFormatted,
                    compareDateRange: `${compareStartFormatted} to ${compareEndFormatted}`,
                    totalCurrent,
                    totalCompare,
                    percentageChange: parseFloat(percentageChange)
                },
                graph: [
                    {
                        name: readableCurrent,
                        data: currentGraphData
                    },
                    {
                        name: readableCompare,
                        data: compareGraphData
                    }
                ]
            };
        } catch (error) {
            console.error('Error in getTotalSalesOvertime:', error.message);
            throw error;
        }
    }

    static async getSalesBreakdownOverTime(startDate, endDate, compareStartDate, compareEndDate) {
        try {
            if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
                throw new Error('startDate, endDate, compareStartDate, and compareEndDate are required');
            }

            const formatDate = (date) => new Date(date).toISOString().split('T')[0];

            const startFormatted = formatDate(startDate);
            const endFormatted = formatDate(endDate);
            const compareStartFormatted = formatDate(compareStartDate);
            const compareEndFormatted = formatDate(compareEndDate);

            const getData = async (start, end) => {
                const dateCondition = start === end
                    ? Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), start)
                    : Sequelize.where(
                        Sequelize.fn('DATE', Sequelize.col('datetime')),
                        { [Sequelize.Op.between]: [start, end] }
                    );

                const [orderDetailData, orderBookingData] = await Promise.all([
                    OrderDetail.findOne({
                        attributes: [
                            [Sequelize.literal('SUM(quantity * price)'), 'grossSales'],
                            [Sequelize.literal('SUM(quantity * price) - SUM(discount)'), 'netSales'],
                            [Sequelize.literal('SUM(quantity * price + discount)'), 'totalSales'],
                            [
                                Sequelize.literal(`
                                    SUM((COALESCE(mrp, 0) * COALESCE(quantity, 0)) - 
                                        (COALESCE(price, 0) * COALESCE(quantity, 0)) + 
                                        COALESCE(discount, 0))
                                `),
                                'discounts'
                            ]
                        ],
                        where: dateCondition,
                        raw: true
                    }),
                    OrderBookingData.findOne({
                        attributes: [
                            [Sequelize.fn('SUM', Sequelize.col('total_shipping')), 'shippingCharges'],
                            [Sequelize.fn('SUM', Sequelize.col('total_tax')), 'totalTaxes']
                        ],
                        where: dateCondition,
                        raw: true
                    })
                ]);

                const parse = (val) => parseFloat(val) || 0;

                return {
                    grossSales: parse(orderDetailData?.grossSales),
                    discounts: parse(orderDetailData?.discounts),
                    netSales: parse(orderDetailData?.netSales),
                    totalSales: parse(orderDetailData?.totalSales),
                    shippingCharges: parse(orderBookingData?.shippingCharges),
                    totalTaxes: parse(orderBookingData?.totalTaxes)
                };
            };

            const currentData = await getData(startFormatted, endFormatted);
            const compareData = await getData(compareStartFormatted, compareEndFormatted);

            const calculatePercentageChange = (currentVal, compareVal) => {
                if (compareVal === 0) return currentVal === 0 ? 0 : 100;
                return (((currentVal - compareVal) / compareVal) * 100).toFixed(2);
            };

            const percentageChange = {
                grossSales: calculatePercentageChange(currentData.grossSales, compareData.grossSales),
                discounts: calculatePercentageChange(currentData.discounts, compareData.discounts),
                netSales: calculatePercentageChange(currentData.netSales, compareData.netSales),
                totalSales: calculatePercentageChange(currentData.totalSales, compareData.totalSales),
                shippingCharges: calculatePercentageChange(currentData.shippingCharges, compareData.shippingCharges),
                totalTaxes: calculatePercentageChange(currentData.totalTaxes, compareData.totalTaxes)
            };

            return {
                currentDateRange: {
                    // startDate: startFormatted,
                    // endDate: endFormatted,
                    ...currentData
                },
                compareDateRange: {
                    // startDate: compareStartFormatted,
                    // endDate: compareEndFormatted,
                    ...compareData
                },
                percentageChange
            };
        } catch (error) {
            console.error('Error in getSalesBreakdownOverTime:', error.message);
            throw error;
        }
    }

    static async totalSalesByProduct(startDate, endDate, compareStartDate, compareEndDate) {
        try {
            if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
                throw new Error('startDate, endDate, compareStartDate, and compareEndDate are all required');
            }

            const formatDate = (date) => new Date(date).toISOString().split('T')[0];

            const formattedStart = formatDate(startDate);
            const formattedEnd = formatDate(endDate);
            const formattedCompareStart = formatDate(compareStartDate);
            const formattedCompareEnd = formatDate(compareEndDate);

            // 1. Get sales for current period (startDate to endDate)
            const currentSales = await OrderDetail.findAll({
                attributes: [
                    'sku',
                    'title',
                    [Sequelize.literal('SUM((mrp * quantity) - discount)'), 'totalSales']
                ],
                where: Sequelize.where(
                    Sequelize.fn('DATE', Sequelize.col('datetime')),
                    {
                        [Sequelize.Op.between]: [formattedStart, formattedEnd]
                    }
                ),
                group: ['sku', 'title'],
                raw: true
            });

            // 2. Get sales for compare period
            const compareSales = await OrderDetail.findAll({
                attributes: [
                    'sku',
                    [Sequelize.literal('SUM((mrp * quantity) - discount)'), 'totalSales']
                ],
                where: Sequelize.where(
                    Sequelize.fn('DATE', Sequelize.col('datetime')),
                    {
                        [Sequelize.Op.between]: [formattedCompareStart, formattedCompareEnd]
                    }
                ),
                group: ['sku'],
                raw: true
            });

            // 3. Map compare data for quick lookup
            const compareMap = {};
            compareSales.forEach(item => {
                compareMap[item.sku] = parseFloat(item.totalSales || 0);
            });

            // 4. Merge and calculate percentage change
            const merged = currentSales.map(item => {
                const sku = item.sku;
                const title = item.title;
                const currentTotal = parseFloat(item.totalSales || 0);
                const compareTotal = compareMap[sku] || 0;

                const percentage = compareTotal === 0
                    ? (currentTotal === 0 ? 0 : 100)
                    : ((currentTotal - compareTotal) / compareTotal) * 100;

                return {
                    sku,
                    title,
                    currentTotal: currentTotal.toFixed(2),
                    compareTotal: compareTotal.toFixed(2),
                    percentage: percentage.toFixed(2)
                };
            });

            // 5. Sort and return top 5 by current sales
            merged.sort((a, b) => parseFloat(b.currentTotal) - parseFloat(a.currentTotal));
            return merged.slice(0, 5);

        } catch (error) {
            console.error('Error in totalSalesByProduct:', error.message);
            throw error;
        }
    }

    static async getSalesAttributeMarketing(startDate, endDate, compareStart, compareEnd) {
        try {
            const formatDate = (date) => new Date(date).toISOString().split('T')[0];
            const formattedStart = formatDate(startDate);
            const formattedEnd = formatDate(endDate);
            const formattedCompareStart = formatDate(compareStart);
            const formattedCompareEnd = formatDate(compareEnd);

            // Normalize utm_source values
            const normalizeSource = (source) => {
                const s = (source || '').toLowerCase();
                if (["fb", "fb_paid", "facebook", "fb ads"].includes(s)) return "Facebook";
                if (["ig", "igshopping"].includes(s)) return "Instagram";
                if (["cashkaro", "ad", "ans"].includes(s)) return "Adgroves";
                if (s === "google") return "Google";
                return source?.trim() || "Unknown";
            };

            const fetchSales = async (startDate, endDate) => {
                const whereClause = {
                    [Sequelize.Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('datetime')),
                            startDate === endDate
                                ? startDate
                                : { [Sequelize.Op.between]: [startDate, endDate] }
                        ),
                        {
                            utm_source: {
                                [Sequelize.Op.and]: [
                                    { [Sequelize.Op.not]: null },
                                    { [Sequelize.Op.ne]: '' }
                                ]
                            }
                        }
                    ]
                };

                const data = await orderBookingData.findAll({
                    attributes: [
                        'utm_source',
                        [Sequelize.fn('SUM', Sequelize.col('total_price')), 'totalSales']
                    ],
                    where: whereClause,
                    group: ['utm_source'],
                    raw: true
                });

                return data.reduce((acc, row) => {
                    const source = normalizeSource(row.utm_source);
                    const total = parseFloat(row.totalSales) || 0;
                    acc[source] = (acc[source] || 0) + total;
                    return acc;
                }, {});
            };

            const [todaySales, compareSales] = await Promise.all([
                fetchSales(formattedStart, formattedEnd),
                fetchSales(formattedCompareStart, formattedCompareEnd)
            ]);

            const allSources = new Set([
                ...Object.keys(todaySales),
                ...Object.keys(compareSales)
            ]);

            const salesSummary = Array.from(allSources).map(source => {
                const todayVal = todaySales[source] || 0;
                const compareVal = compareSales[source] || 0;
                const percentageChange = compareVal === 0
                    ? (todayVal > 0 ? 100 : 0)
                    : ((todayVal - compareVal) / compareVal) * 100;

                return {
                    source,
                    today: todayVal.toFixed(2),
                    compare: compareVal.toFixed(2),
                    percentageChange: percentageChange.toFixed(2),
                };
            }).sort((a, b) => parseFloat(b.today) - parseFloat(a.today));

            return {
                summary: {
                    startDate: formattedStart,
                    endDate: formattedEnd,
                    compareStart: formattedCompareStart,
                    compareEnd: formattedCompareEnd,
                    salesByUtmSource: salesSummary,
                },
            };
        } catch (error) {
            console.error('Error in getSalesAttributeMarketing:', error.message);
            throw error;
        }
    }

    static async getSalesByChannel(startDate, endDate, compareStartDate, compareEndDate) {
        if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
            throw new Error('startDate, endDate, compareStartDate and compareEndDate are required');
        }

        const { Op, fn, col } = Sequelize;

        const formatDate = (date) => new Date(date).toISOString().split('T')[0];

        // Normalize UTM sources
        const normalizeSource = (source) => {
            if (!source) return 'Other';
            const s = source.toLowerCase();
            if (["fb", "fb_paid", "facebook", "fb ads"].includes(s)) return "Facebook";
            if (["ig", "igshopping"].includes(s)) return "Instagram";
            if (["cashkaro", "ad", "ans"].includes(s)) return "Adgroves";
            if (["google"].includes(s)) return "Google";
            return source;
        };

        try {
            const start = formatDate(startDate);
            const end = formatDate(endDate);
            const compareStart = formatDate(compareStartDate);
            const compareEnd = formatDate(compareEndDate);

            const [mainSales, compareSales] = await Promise.all([
                orderBookingData.findAll({
                    attributes: ['utm_source', [fn('SUM', col('total_price')), 'totalSales']],
                    where: {
                        datetime: {
                            [Op.gte]: `${start}T00:00:00.000Z`,
                            [Op.lte]: `${end}T23:59:59.999Z`,
                        },
                        utm_source: {
                            [Op.and]: [
                                { [Op.ne]: null },
                                { [Op.ne]: '' },
                            ],
                        },
                    },
                    group: ['utm_source'],
                    raw: true,
                }),
                orderBookingData.findAll({
                    attributes: ['utm_source', [fn('SUM', col('total_price')), 'totalSales']],
                    where: {
                        datetime: {
                            [Op.gte]: `${compareStart}T00:00:00.000Z`,
                            [Op.lte]: `${compareEnd}T23:59:59.999Z`,
                        },
                        utm_source: {
                            [Op.and]: [
                                { [Op.ne]: null },
                                { [Op.ne]: '' },
                            ],
                        },
                    },
                    group: ['utm_source'],
                    raw: true,
                }),
            ]);

            const normalizeAndSum = (salesArray) => {
                const result = {};
                for (const { utm_source, totalSales } of salesArray) {
                    const key = normalizeSource(utm_source);
                    result[key] = (result[key] || 0) + parseFloat(totalSales || 0);
                }
                return result;
            };

            const mainMap = normalizeAndSum(mainSales);
            const compareMap = normalizeAndSum(compareSales);

            const totalMainSales = Object.values(mainMap).reduce((sum, val) => sum + val, 0);
            const totalCompareSales = Object.values(compareMap).reduce((sum, val) => sum + val, 0);

            const percentageChange = totalCompareSales === 0
                ? (totalMainSales > 0 ? 100 : 0)
                : ((totalMainSales - totalCompareSales) / totalCompareSales) * 100;

            const allSources = new Set([...Object.keys(mainMap), ...Object.keys(compareMap)]);

            const channelBreakdown = Array.from(allSources).map(source => {
                const mainTotal = mainMap[source] || 0;
                const compareTotal = compareMap[source] || 0;
                const shareOfTotal = totalMainSales === 0 ? 0 : (mainTotal / totalMainSales) * 100;

                return {
                    utmSource: source,
                    mainTotal: mainTotal.toFixed(2),
                    compareTotal: compareTotal.toFixed(2),
                    shareOfTotal: shareOfTotal.toFixed(2),
                };
            }).sort((a, b) => b.mainTotal - a.mainTotal);

            return {
                startDate: start,
                endDate: end,
                compareStartDate: compareStart,
                compareEndDate: compareEnd,
                totalMainSales: totalMainSales.toFixed(2),
                totalCompareSales: totalCompareSales.toFixed(2),
                percentageChange: percentageChange.toFixed(2),
                channelBreakdown
            };

        } catch (error) {
            console.error('Error in getSalesByChannel:', error.message);
            throw error;
        }
    }

    static async averageOrderValueOverTime(startDate, endDate, compareStartDate, compareEndDate) {
        try {
            console.log('->>>startDate, endDate, compareStartDate, compareEndDate', startDate, endDate, compareStartDate, compareEndDate);

            const formatDate = (date) => {
                if (!date) throw new Error(`Invalid date value: ${date}`);
                const d = date instanceof Date ? date : new Date(date);
                if (isNaN(d.getTime())) throw new Error(`Invalid date format: ${date}`);
                return d.toISOString().slice(0, 10);
            };

            const getReadableDate = (date) =>
                (date instanceof Date ? date : new Date(date)).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                });

            // Format the dates safely
            const startFormatted = formatDate(startDate);
            const endFormatted = formatDate(endDate);
            const compareStartFormatted = formatDate(compareStartDate);
            const compareEndFormatted = formatDate(compareEndDate);

            const mainReadable = `${getReadableDate(startDate)} - ${getReadableDate(endDate)}`;
            const compareReadable = `${getReadableDate(compareStartDate)} - ${getReadableDate(compareEndDate)}`;

            const fetchRangeData = (from, to) =>
                orderBookingData.findAll({
                    attributes: [
                        [Sequelize.fn('HOUR', Sequelize.col('datetime')), 'hour'],
                        [Sequelize.literal('ROUND(SUM(total_price), 2)'), 'totalSales'],
                        [Sequelize.fn('COUNT', Sequelize.col('id')), 'orderCount'],
                    ],
                    where: {
                        datetime: {
                            [Sequelize.Op.gte]: new Date(`${from}T00:00:00`),
                            [Sequelize.Op.lte]: new Date(`${to}T23:59:59`),
                        },
                    },
                    group: [Sequelize.fn('HOUR', Sequelize.col('datetime'))],
                    order: [[Sequelize.fn('HOUR', Sequelize.col('datetime')), 'ASC']],
                    raw: true,
                });

            const [mainData, compareData] = await Promise.all([
                fetchRangeData(startFormatted, endFormatted),
                fetchRangeData(compareStartFormatted, compareEndFormatted),
            ]);

            const calculateTotals = (data) => ({
                totalSales: data.reduce((sum, row) => sum + parseFloat(row.totalSales), 0),
                totalOrders: data.reduce((sum, row) => sum + parseInt(row.orderCount, 10), 0),
            });

            const { totalSales: mainTotal, totalOrders: mainOrders } = calculateTotals(mainData);
            const { totalSales: compareTotal, totalOrders: compareOrders } = calculateTotals(compareData);

            const mainAvg = mainOrders ? mainTotal / mainOrders : 0;
            const compareAvg = compareOrders ? compareTotal / compareOrders : 0;

            const percentageChange = compareAvg === 0
                ? (mainAvg > 0 ? 100 : 0)
                : ((mainAvg - compareAvg) / compareAvg) * 100;

            const buildHourlyAvgArray = (data) => {
                const hourMap = Object.fromEntries(
                    data.map(({ hour, totalSales, orderCount }) => [
                        hour,
                        orderCount == 0 ? 0 : parseFloat((totalSales / orderCount).toFixed(2)),
                    ])
                );
                return Array.from({ length: 24 }, (_, i) => hourMap[i] || 0);
            };

            const mainGraphData = buildHourlyAvgArray(mainData);
            const compareGraphData = buildHourlyAvgArray(compareData);

            return {
                summary: {
                    startDate: startFormatted,
                    endDate: endFormatted,
                    compareStartDate: compareStartFormatted,
                    compareEndDate: compareEndFormatted,
                    mainTotal: parseFloat(mainTotal.toFixed(2)),
                    compareTotal: parseFloat(compareTotal.toFixed(2)),
                    mainAvg: parseFloat(mainAvg.toFixed(2)),
                    compareAvg: parseFloat(compareAvg.toFixed(2)),
                    percentageChange: parseFloat(percentageChange.toFixed(2)),
                },
                graph: [
                    { name: mainReadable, data: mainGraphData },
                    { name: compareReadable, data: compareGraphData },
                ],
            };
        } catch (error) {
            console.error('Error in averageOrderValueOverTime:', error.message);
            throw error;
        }
    }

    static async grossSales(startDate, endDate, compareStartDate, compareEndDate) {
        try {
            if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
                throw new Error('startDate, endDate, compareStartDate, and compareEndDate are required');
            }

            const formatDate = (date) => new Date(date).toISOString().split('T')[0];
            const formattedStart = formatDate(startDate);
            const formattedEnd = formatDate(endDate);
            const formattedCompareStart = formatDate(compareStartDate);
            const formattedCompareEnd = formatDate(compareEndDate);

            console.log("Date Range →", formattedStart, "to", formattedEnd);
            console.log("Compare Range →", formattedCompareStart, "to", formattedCompareEnd);

            // 1. Get sales for selected date range (startDate to endDate)
            const currentSales = await OrderDetail.findAll({
                attributes: [
                    'sku',
                    'title',
                    [Sequelize.literal('SUM((mrp * quantity) - discount)'), 'totalSales']
                ],
                where: {
                    datetime: {
                        [Op.gte]: new Date(`${formattedStart}T00:00:00`),
                        [Op.lte]: new Date(`${formattedEnd}T23:59:59`)
                    }
                },
                group: ['sku', 'title'],
                raw: true
            });

            // 2. Get sales for compare date range
            const compareSales = await OrderDetail.findAll({
                attributes: [
                    'sku',
                    [Sequelize.literal('SUM((mrp * quantity) - discount)'), 'totalSales']
                ],
                where: {
                    datetime: {
                        [Op.gte]: new Date(`${formattedCompareStart}T00:00:00`),
                        [Op.lte]: new Date(`${formattedCompareEnd}T23:59:59`)
                    }
                },
                group: ['sku'],
                raw: true
            });

            // 3. Build a map for compare data
            const compareMap = {};
            compareSales.forEach(item => {
                compareMap[item.sku] = parseFloat(item.totalSales || 0);
            });

            // 4. Merge current and compare data
            const merged = currentSales.map(item => {
                const currentTotal = parseFloat(item.totalSales || 0);
                const compareTotal = compareMap[item.sku] || 0;
                const percentage = compareTotal === 0
                    ? (currentTotal > 0 ? 100 : 0)
                    : ((currentTotal - compareTotal) / compareTotal) * 100;

                return {
                    sku: item.sku,
                    title: item.title,
                    currentTotal: currentTotal.toFixed(2),
                    compareTotal: compareTotal.toFixed(2),
                    percentageChange: percentage.toFixed(2)
                };
            });

            // Sort and return top 10
            merged.sort((a, b) => parseFloat(b.currentTotal) - parseFloat(a.currentTotal));
            return merged.slice(0, 10);

        } catch (error) {
            console.error('Error in grossSales:', error.message);
            throw error;
        }
    }

    // static async getDiscountGraph(today, compareStartDate, compareEndDate) {
    //     try {
    //         const formatDate = (date) => date.toISOString().split('T')[0];
    //         const todayFormatted = formatDate(today);
    //         const compareStartFormatted = formatDate(compareStartDate);
    //         const compareEndFormatted = formatDate(compareEndDate);

    //         const fetchDiscountByDateRange = async (startDate, endDate) => {
    //             const discountData = await OrderDetail.findAll({
    //                 attributes: [
    //                     [Sequelize.fn('DATE', Sequelize.col('datetime')), 'date'],
    //                     [
    //                         Sequelize.literal('SUM((CAST(mrp AS DECIMAL(10,2)) - CAST(price AS DECIMAL(10,2)) + CAST(discount AS DECIMAL(10,2))))'),
    //                         'discountAmount'
    //                     ]
    //                 ],
    //                 where: {
    //                     [Sequelize.Op.and]: [
    //                         Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
    //                             [Sequelize.Op.gte]: startDate
    //                         }),
    //                         Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), {
    //                             [Sequelize.Op.lte]: endDate
    //                         })
    //                     ]
    //                 },
    //                 group: [Sequelize.fn('DATE', Sequelize.col('datetime'))],
    //                 raw: true
    //             });

    //             return discountData.map(item => ({
    //                 date: item.date,
    //                 discountAmount: Number(item.discountAmount || 0).toFixed(2)
    //             }));
    //         };

    //         const [todayData, compareData] = await Promise.all([
    //             fetchDiscountByDateRange(todayFormatted, todayFormatted),
    //             fetchDiscountByDateRange(compareStartFormatted, compareEndFormatted)
    //         ]);

    //         return {
    //             today: todayFormatted,
    //             compareRange: `${compareStartFormatted} to ${compareEndFormatted}`,
    //             todayData,
    //             compareData
    //         };
    //     } catch (error) {
    //         console.error('Error in getDiscountGraph:', error.message);
    //         throw error;
    //     }
    // }

    static async salesProductSummary(startDate, endDate, compareStartDate, compareEndDate) {
        if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
            throw new Error('startDate, endDate, compareStartDate, and compareEndDate are required');
        }

        const formatDate = (date) => new Date(date).toISOString().split('T')[0];
        const round = (value, digits = 2) => +Number(value || 0).toFixed(digits);
        const calculatePercentage = (current, previous) => {
            current = +current || 0;
            previous = +previous || 0;
            if (previous === 0) return current === 0 ? 0 : 100;
            return round(((current - previous) / previous) * 100);
        };

        const formattedStart = formatDate(startDate);
        const formattedEnd = formatDate(endDate);
        const formattedCompareStart = formatDate(compareStartDate);
        const formattedCompareEnd = formatDate(compareEndDate);

        const fields = {
            net_items_sold: `quantity`,
            gross_sales: `(mrp * quantity)`,
            discounts: `((mrp * quantity) - (price * quantity) + discount)`,
            returns: `qty_returned`
        };

        const attributes = [];

        for (const [key, expr] of Object.entries(fields)) {
            attributes.push(
                [sequelize.literal(
                    `SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedStart}' AND '${formattedEnd}' THEN ${expr} ELSE 0 END)`
                ), `${key}_current`],

                [sequelize.literal(
                    `SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedCompareStart}' AND '${formattedCompareEnd}' THEN ${expr} ELSE 0 END)`
                ), `${key}_compare`]
            );
        }

        const [data = {}] = await OrderDetail.findAll({ attributes, raw: true });

        const summaryRow = {
            title: 'Summary',
            vendor: '',
            product_type: ''
        };

        for (const key of Object.keys(fields)) {
            const currentValue = round(data[`${key}_current`], key === 'returns' || key === 'net_items_sold' ? 0 : 2);
            const compareValue = round(data[`${key}_compare`], key === 'returns' || key === 'net_items_sold' ? 0 : 2);
            const percentage = calculatePercentage(currentValue, compareValue);

            summaryRow[`${key}_current`] = currentValue;
            summaryRow[`${key}_compare`] = compareValue;
            summaryRow[`${key}_percentage`] = percentage;
        }

        // Compute net sales
        const net_sales_current = summaryRow.gross_sales_current - summaryRow.discounts_current;
        const net_sales_compare = summaryRow.gross_sales_compare - summaryRow.discounts_compare;
        summaryRow.net_sales_current = round(net_sales_current);
        summaryRow.net_sales_compare = round(net_sales_compare);
        summaryRow.net_sales_percentage = calculatePercentage(net_sales_current, net_sales_compare);

        // Add date info
        summaryRow.start_date = formattedStart;
        summaryRow.end_date = formattedEnd;
        summaryRow.compare_start_date = formattedCompareStart;
        summaryRow.compare_end_date = formattedCompareEnd;

        return { summaryRow };
    }

    static async getSalesSkuData(startDate, endDate, compareStartDate, compareEndDate, limit = null, sort_by = null, sort_order = 'asc', offset = 0) {
        if (!startDate || !endDate || !compareStartDate || !compareEndDate)
            throw new Error('startDate, endDate, compareStartDate, and compareEndDate are required');

        limit = limit !== null ? parseInt(limit) : null;
        if (limit !== null && limit < 1) throw new Error('`limit` must be greater than 0.');

        const formatDate = (date) => new Date(date).toISOString().split('T')[0];
        const formattedStart = formatDate(startDate);
        const formattedEnd = formatDate(endDate);
        const formattedCompareStart = formatDate(compareStartDate);
        const formattedCompareEnd = formatDate(compareEndDate);

        const round = (value, digits = 2) => +parseFloat(value || 0).toFixed(digits);

        const calculatePercentageChange = (currentValue, compareValue) => {
            const current = parseFloat(currentValue) || 0;
            const compare = parseFloat(compareValue) || 0;
            if (compare === 0) return current === 0 ? 0 : 100;
            return round(((current - compare) / compare) * 100);
        };

        const allData = await OrderDetail.findAll({
            attributes: [
                'sku',
                'title',
                'vendor',

                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedStart}' AND '${formattedEnd}' THEN quantity ELSE 0 END)`), 'net_items_sold_current'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedStart}' AND '${formattedEnd}' THEN (price * quantity) ELSE 0 END)`), 'gross_sales_current'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedStart}' AND '${formattedEnd}' THEN ((mrp * quantity) - (price * quantity) + discount) ELSE 0 END)`), 'discounts_current'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedStart}' AND '${formattedEnd}' THEN qty_returned ELSE 0 END)`), 'returns_current'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedStart}' AND '${formattedEnd}' THEN ((mrp * quantity) - IFNULL(discount, 0)) ELSE 0 END)`), 'net_sales_current'],

                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedCompareStart}' AND '${formattedCompareEnd}' THEN quantity ELSE 0 END)`), 'net_items_sold_compare'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedCompareStart}' AND '${formattedCompareEnd}' THEN (price * quantity) ELSE 0 END)`), 'gross_sales_compare'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedCompareStart}' AND '${formattedCompareEnd}' THEN ((mrp * quantity) - (price * quantity) + discount) ELSE 0 END)`), 'discounts_compare'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedCompareStart}' AND '${formattedCompareEnd}' THEN qty_returned ELSE 0 END)`), 'returns_compare'],
                [Sequelize.literal(`SUM(CASE WHEN DATE(datetime) BETWEEN '${formattedCompareStart}' AND '${formattedCompareEnd}' THEN ((mrp * quantity) - IFNULL(discount, 0)) ELSE 0 END)`), 'net_sales_compare']
            ],
            where: {
                [Op.or]: [
                    {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), { [Op.gte]: formattedStart }),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), { [Op.lte]: formattedEnd })
                        ]
                    },
                    {
                        [Op.and]: [
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), { [Op.gte]: formattedCompareStart }),
                            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), { [Op.lte]: formattedCompareEnd })
                        ]
                    }
                ]
            },
            group: ['sku', 'title', 'vendor'],
            raw: true
        });

        const enrichedData = allData.map(row => ({
            ...row,
            net_items_sold_compare_percent: calculatePercentageChange(row.net_items_sold_current, row.net_items_sold_compare),
            gross_sales_compare_percent: calculatePercentageChange(row.gross_sales_current, row.gross_sales_compare),
            discounts_compare_percent: calculatePercentageChange(row.discounts_current, row.discounts_compare),
            returns_compare_percent: calculatePercentageChange(row.returns_current, row.returns_compare),
            net_sales_percent: calculatePercentageChange(row.net_sales_current, row.net_sales_compare)
        }));

        const sortKeyMap = {
            sku: 'sku',
            title: 'title',
            vendor: 'vendor',
            netItemsSold: 'net_items_sold_current',
            grossSales: 'gross_sales_current',
            discounts: 'discounts_current',
            returns: 'returns_current',
            netSales: 'net_sales_current'
        };

        if (sort_by && sortKeyMap[sort_by]) {
            const key = sortKeyMap[sort_by];
            enrichedData.sort((a, b) => {
                const valA = a[key] ?? '';
                const valB = b[key] ?? '';

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sort_order === 'desc' ? valB - valA : valA - valB;
                } else {
                    const compare = String(valA).localeCompare(String(valB));
                    return sort_order === 'desc' ? -compare : compare;
                }
            });
        }

        const paginatedData = limit !== null ? enrichedData.slice(offset, offset + limit) : enrichedData;

        return {
            skuRows: paginatedData,
            pagination: {
                totalItems: enrichedData.length,
                limit,
                totalPages: limit ? Math.ceil(enrichedData.length / limit) : 1,
                hasMore: limit ? (offset + limit < enrichedData.length) : false
            }
        };
    }

    static async getDiscountGraphData({ type, startDate, endDate, startMonth, endMonth, year } = {}) {
        try {
            const now = new Date();
            const monthNames = {
                january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
                july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
            };

            // Date range logic
            let startDateObj, endDateObj;
            if (type === 'date' && startDate && endDate) {
                startDateObj = new Date(`${startDate}T00:00:00`);
                endDateObj = new Date(`${endDate}T23:59:59`);
            } else if (type === 'month' && startMonth && endMonth) {
                const parseMonth = (m) => isNaN(m) ? monthNames[m.toLowerCase()] : parseInt(m) - 1;
                const y = year || now.getFullYear();
                const startMon = parseMonth(startMonth);
                const endMon = parseMonth(endMonth);
                if (startMon > endMon) throw new Error("startMonth cannot be after endMonth");
                startDateObj = new Date(y, startMon, 1);
                endDateObj = new Date(y, endMon + 1, 0, 23, 59, 59);
            } else {
                startDateObj = new Date(now.getFullYear(), now.getMonth(), 1);
                endDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            }

            const dateFilter = { [Op.gte]: startDateObj, [Op.lte]: endDateObj };
            const whereCondition = { datetime: dateFilter };

            // Generate date array
            const getDateArray = (start, end) => {
                const arr = [];
                let dt = new Date(start);
                while (dt <= end) {
                    arr.push(dt.toISOString().slice(0, 10));
                    dt.setDate(dt.getDate() + 1);
                }
                return arr;
            };
            const dateArray = getDateArray(startDateObj, endDateObj);

            // 🔶 Step 1: Total discount per day
            const rawTotalDiscounts = await OrderDetail.findAll({
                where: whereCondition,
                attributes: [
                    [Sequelize.fn("DATE", Sequelize.col("datetime")), "date"],
                    [Sequelize.literal(`
                        SUM((COALESCE(mrp, 0) * COALESCE(quantity, 0)) -
                            (COALESCE(price, 0) * COALESCE(quantity, 0)) +
                            COALESCE(discount, 0))
                    `), "total_discount"]
                ],
                group: [Sequelize.fn("DATE", Sequelize.col("datetime"))],
                order: [[Sequelize.fn("DATE", Sequelize.col("datetime")), "ASC"]],
                raw: true
            });

            const totalDiscountMap = {};
            rawTotalDiscounts.forEach(row => {
                const val = parseFloat(row.total_discount);
                totalDiscountMap[row.date] = isNaN(val) ? "0.00" : val.toFixed(2);
            });

            const totalDiscountByDate = dateArray.map(date => ({
                date,
                total_discount: totalDiscountMap[date] || "0.00"
            }));

            // 🔶 Step 2: Top 10 SKUs by total quantity in selected range
            const topSkusRaw = await OrderDetail.findAll({
                where: whereCondition,
                attributes: [
                    "sku",
                    [Sequelize.fn("SUM", Sequelize.col("quantity")), "total_quantity"]
                ],
                group: ["sku"],
                order: [[Sequelize.literal("total_quantity"), "DESC"]],
                limit: 10,
                raw: true
            });
            const topSkus = topSkusRaw.map(r => r.sku);
            if (topSkus.length === 0) {
                return {
                    message: "Discount graph data fetched successfully",
                    data: { totalDiscountByDate, topSkuDiscountByDate: [] }
                };
            }

            // 🔶 Step 3: Discount by date and sku for those top 10
            const rawTopSkuDiscounts = await OrderDetail.findAll({
                where: {
                    ...whereCondition,
                    sku: { [Op.in]: topSkus }
                },
                attributes: [
                    "sku",
                    [Sequelize.fn("DATE", Sequelize.col("datetime")), "date"],
                    [Sequelize.literal(`
                        SUM((COALESCE(mrp, 0) * COALESCE(quantity, 0)) -
                            (COALESCE(price, 0) * COALESCE(quantity, 0)) +
                            COALESCE(discount, 0))
                    `), "total_discount"]
                ],
                group: ["sku", Sequelize.fn("DATE", Sequelize.col("datetime"))],
                order: [
                    [Sequelize.fn("DATE", Sequelize.col("datetime")), "ASC"],
                    [Sequelize.literal("total_discount"), "DESC"]
                ],
                raw: true
            });

            // Map date → sku → discount
            const skuDateDiscountMap = {};
            dateArray.forEach(date => {
                skuDateDiscountMap[date] = {};
                topSkus.forEach(sku => {
                    skuDateDiscountMap[date][sku] = "0.00";
                });
            });
            rawTopSkuDiscounts.forEach(row => {
                const val = parseFloat(row.total_discount);
                skuDateDiscountMap[row.date][row.sku] = isNaN(val) ? "0.00" : val.toFixed(2);
            });

            // 🔶 Step 4: Format final graph response
            const topSkuDiscountByDate = dateArray.map(date => ({
                date,
                skus: skuDateDiscountMap[date]
            }));

            return {
                message: "Discount graph data fetched successfully",
                data: {
                    totalDiscountByDate,
                    topSkuDiscountByDate
                }
            };

        } catch (error) {
            console.error("Error in getDiscountGraphData:", error);
            throw error;
        }
    }

    static async getFilteredSiensCardData({ startDate, endDate, orderNumber }) {
        try {
            const allowedSkus = [
                "FR464015SET", "FR465030ET", "FR467030ET", "FR462030ET", "FR466030ET",
                "FR463100ET", "DABC115", "DABC116", "DABC117", "DABC118", "DABC119",
                "DABC120", "DABC121", "DABC122", "DABC123", "DABC124", "DABC125", "DABC126"
            ];

            const orderDetailWhere = { sku: { [Op.in]: allowedSkus } };
            const orderDataWhere = {};

            if (startDate) {
                orderDataWhere.datetime = { [Op.gte]: new Date(startDate + "T00:00:00") };
            }
            if (endDate) {
                orderDataWhere.datetime = {
                    ...(orderDataWhere.datetime || {}),
                    [Op.lte]: new Date(endDate + "T23:59:59"),
                };
            }
            if (orderNumber) {
                orderDetailWhere.order_no = { [Op.like]: `%${orderNumber}%` };
            }

            const result = await OrderDetail.findOne({
                attributes: [],
                where: orderDetailWhere,
                include: [
                    {
                        model: OrderBookingData,
                        as: "order_data",
                        attributes: [
                            [
                                Sequelize.fn(
                                    "COUNT",
                                    Sequelize.fn("DISTINCT", Sequelize.col("order_data.order_number"))
                                ),
                                "totalOrders"
                            ],
                            [
                                Sequelize.fn(
                                    "COUNT",
                                    Sequelize.fn(
                                        "DISTINCT",
                                        Sequelize.literal(
                                            `CASE WHEN LOWER(order_data.financial_status) = 'pending' 
                                              THEN order_data.order_number END`
                                        )
                                    )
                                ),
                                "codOrders"
                            ],
                            [
                                Sequelize.fn(
                                    "COUNT",
                                    Sequelize.fn(
                                        "DISTINCT",
                                        Sequelize.literal(
                                            `CASE WHEN LOWER(order_data.financial_status) = 'paid' 
                                              THEN order_data.order_number END`
                                        )
                                    )
                                ),
                                "prepaidOrders"
                            ]
                        ],
                        where: orderDataWhere,
                    }
                ],
                raw: true
            });
            console.log("result---->>>", result)

            return {
                totalOrders: Number(result?.["order_data.totalOrders"] || 0),
                codOrders: Number(result?.["order_data.codOrders"] || 0),
                prepaidOrders: Number(result?.["order_data.prepaidOrders"] || 0)
            };

        } catch (error) {
            console.error(" Error in getFilteredSiensCardData:", error);
            throw error;
        }
    }

    static async getFilteredSiensOrders({ filter, startDate, endDate, order_number, limit = 10, page_number = 1 }) {
        const offset = (page_number - 1) * limit;
        const todayDate = new Date().toISOString().slice(0, 10);

        const allowedSkus = [
            "FR464015SET", "FR465030ET", "FR467030ET", "FR462030ET", "FR466030ET",
            "FR463100ET", "DABC115", "DABC116", "DABC117", "DABC118",
            "DABC119", "DABC120", "DABC121", "DABC122", "DABC123",
            "DABC124", "DABC125", "DABC126"
        ];

        let whereConditions = [];

        // ✅ qualify datetime as order_data.datetime
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

            case "all":
            default:
                whereConditions.push(
                    Sequelize.where(Sequelize.fn("DATE", Sequelize.col("order_data.datetime")), { [Op.lte]: todayDate })
                );
                break;
        }

        // ✅ Always check SKU
        whereConditions.push({
            sku: { [Op.in]: allowedSkus },
        });

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

        // ✅ Order number partial match
        if (order_number) {
            whereConditions.push({
                order_no: { [Op.like]: `%${order_number}%` },
            });
        }

        const whereClause = { [Op.and]: whereConditions };

        // ✅ DISTINCT order_no + group by order_no
        const result = await OrderDetail.findAndCountAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn("MIN", Sequelize.col("orderDetail.id")), "id"],
                "order_no",
                "cust_id",
                [Sequelize.fn("MIN", Sequelize.col("orderDetail.sku")), "sku"],
                [Sequelize.fn("MIN", Sequelize.col("orderDetail.title")), "sku_title"],
            ],
            include: [
                {
                    model: OrderBookingData,
                    as: "order_data",
                    attributes: [
                        "order_status",
                        "datetime",
                        "order_number",
                        "total_price",
                        "billing_name",
                        "shipping_address1",
                        "lm_partner",
                        "financial_status"
                    ]
                }
            ],
            group: ["order_no", "cust_id", "order_data.id"],
            order: [[Sequelize.fn("MIN", Sequelize.col("orderDetail.id")), "DESC"]],
            limit,
            offset,
            subQuery: false
        });

        return {
            currentPage: page_number,
            totalPages: Math.ceil(result.count.length / limit),
            totalRecords: result.count.length,
            data: result.rows
        };
    }

    static async getSiensSkuSummaryReport({ startDate, endDate, page = 1, limit = 10 }) {
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

        const whereConditions = { sku: { [Op.in]: allowedSkus } };

        if (startDate && endDate) {
            whereConditions["$order_data.datetime$"] = {
                [Op.between]: [new Date(startDate + "T00:00:00"), new Date(endDate + "T23:59:59")]
            };
        } else if (startDate) {
            whereConditions["$order_data.datetime$"] = { [Op.gte]: new Date(startDate + "T00:00:00") };
        } else if (endDate) {
            whereConditions["$order_data.datetime$"] = { [Op.lte]: new Date(endDate + "T23:59:59") };
        }

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

        // ✅ Pivot data date-wise
        const pivotedData = {};
        summaryData.forEach(row => {
            const date = row.date;
            if (!pivotedData[date]) pivotedData[date] = {};

            pivotedData[date][row.sku] = {
                title: skuTitleMap[row.sku], // title same rahega
                // "#Orders": Number(row.orders),
                // "#Qty Sold": Number(row.qty),
                // "Sale Value": Number(row.amount)
                orders: Number(row.orders),
                qty: Number(row.qty),
                amount: Number(row.amount)

            };
        });

        // ✅ Fill missing SKUs with 0 in same order
        Object.keys(pivotedData).forEach(date => {
            allowedSkus.forEach(sku => {
                if (!pivotedData[date][sku]) {
                    pivotedData[date][sku] = {
                        title: skuTitleMap[sku],
                        // "#Orders": 0,
                        // "#Qty Sold": 0,
                        // "Sale Value": 0
                        orders: 0,
                        qty: 0,
                        amount: 0
                    };
                }
            });
        });

        // ✅ Pagination + SKU order maintain
        const allDates = Object.keys(pivotedData).sort((a, b) => new Date(b) - new Date(a));
        const paginatedDates = allDates.slice((page - 1) * limit, page * limit);

        const finalData = paginatedDates.map(date => {
            const row = { date };
            allowedSkus.forEach(sku => {
                row[sku] = pivotedData[date][sku];
            });
            return row;
        });

        return {
            data: finalData,
            pagination: {
                totalRecords: allDates.length,
                currentPage: page,
                totalPages: Math.ceil(allDates.length / limit),
                limit
            }
        };
    }

    // static async RtoSummaryByPartner(startDate, endDate, warehouse_name = null) {
    //     try {
    //         const rtoStatuses = [
    //             'rto-initiated', 'rto-delivered', 'shipped & returned',
    //             'rto in transit', 'rto reached at destination',
    //             'ofd lock', 'rto lock', 'returned'
    //         ];

    //         // Build dynamic WHERE condition
    //         const whereCondition = {
    //             [Op.and]: [
    //                 Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('order_status')), {
    //                     [Op.in]: rtoStatuses
    //                 })
    //             ]
    //         };

    //         // ✅ Add date filters if provided
    //         if (startDate && endDate) {
    //             whereCondition[Op.and].push(
    //                 Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '>=', startDate),
    //                 Sequelize.where(Sequelize.fn('DATE', Sequelize.col('datetime')), '<=', endDate)
    //             );
    //         }

    //         // ✅ Add warehouse filter if provided
    //         if (warehouse_name) {
    //             whereCondition[Op.and].push({
    //                 warehouse_name: warehouse_name
    //             });
    //         }

    //         // Fetch grouped RTO data by vendor + payment type
    //         const rtoData = await orderBookingData.findAll({
    //             attributes: [
    //                 'lm_partner',
    //                 'financial_status',
    //                 [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_orders'],
    //                 [Sequelize.fn('SUM', Sequelize.col('total_price')), 'total_value']
    //             ],
    //             where: whereCondition,
    //             group: ['lm_partner', 'financial_status'],
    //             raw: true
    //         });

    //         // Format result
    //         const result = {};

    //         for (const row of rtoData) {
    //             const vendor = row.lm_partner || 'Unknown';
    //             const payment = (row.financial_status || '').toLowerCase();
    //             const orderCount = parseInt(row.total_orders) || 0;
    //             const orderValue = parseFloat(row.total_value) || 0;

    //             if (!result[vendor]) {
    //                 result[vendor] = {
    //                     Vendor: vendor,
    //                     totalOrders: 0,
    //                     totalValue: 0,
    //                     prepaidOrders: 0,
    //                     prepaidValue: 0,
    //                     codOrders: 0,
    //                     codValue: 0
    //                 };
    //             }

    //             // Add totals
    //             result[vendor].totalOrders += orderCount;
    //             result[vendor].totalValue += orderValue;

    //             if (payment === 'paid') {
    //                 result[vendor].prepaidOrders += orderCount;
    //                 result[vendor].prepaidValue += orderValue;
    //             } else if (payment === 'pending') {
    //                 result[vendor].codOrders += orderCount;
    //                 result[vendor].codValue += orderValue;
    //             }
    //         }

    //         // Prepare final output
    //         const finalData = Object.values(result).map(vendor => ({
    //             Vendor: vendor.Vendor,
    //             Total_RTO: `${vendor.totalOrders} / ₹${vendor.totalValue.toFixed(2)}`,
    //             Prepaid: `${vendor.prepaidOrders} / ₹${vendor.prepaidValue.toFixed(2)}`,
    //             COD: `${vendor.codOrders} / ₹${vendor.codValue.toFixed(2)}`
    //         }));

    //         return finalData;

    //     } catch (err) {
    //         console.error("Error in RtoSummaryByPartner:", err);
    //         return [];
    //     }
    // }

    static async RtoSummaryByPartner({ startDate, endDate, location }) {
        try {
            // 🧩 Build Base Where Condition
            const whereCondition = {};

            // ✅ Efficient Date Range Filter using DATE() (ignores time)
            if (startDate && endDate) {
                whereCondition[Op.and] = [
                    Sequelize.where(fn('DATE', col('order_date')), '>=', startDate),
                    Sequelize.where(fn('DATE', col('order_date')), '<=', endDate),
                ];
            }

            // ✅ Location Filter
            if (location) {
                whereCondition.warehouse_name = location;
            }

            // ✅ RTO-related statuses (standardized lowercase for consistency)
            const rtoStatuses = [
                'rto-initiated',
                'rto-delivered',
                'shipped & returned',
                'rto in transit',
                'rto reached at destination',
                'ofd lock',
                'rto lock',
                'returned',
            ];
            whereCondition.order_status = { [Op.in]: rtoStatuses };

            // ✅ Single Aggregated Query
            const result = await OrderBookingData.findAll({
                attributes: [
                    [fn('COALESCE', fn('LOWER', col('lm_partner')), 'na'), 'vendor'],

                    // 📦 Total RTO Orders & Amount
                    [fn('COUNT', col('id')), 'rto_orders'],
                    [fn('COALESCE', fn('SUM', col('total_price')), 0), 'rto_total_amount'],

                    // 💳 Prepaid Orders & Amount
                    [
                        fn(
                            'COALESCE',
                            literal(`SUM(CASE WHEN LOWER(financial_status) = 'paid' THEN 1 ELSE 0 END)`),
                            0
                        ),
                        'rto_prepaid_count',
                    ],
                    [
                        fn(
                            'COALESCE',
                            literal(`SUM(CASE WHEN LOWER(financial_status) = 'paid' THEN total_price ELSE 0 END)`),
                            0
                        ),
                        'rto_prepaid_amount',
                    ],

                    // 💵 COD Orders & Amount
                    [
                        fn(
                            'COALESCE',
                            literal(`SUM(CASE WHEN LOWER(financial_status) = 'pending' THEN 1 ELSE 0 END)`),
                            0
                        ),
                        'rto_cod_count',
                    ],
                    [
                        fn(
                            'COALESCE',
                            literal(`SUM(CASE WHEN LOWER(financial_status) = 'pending' THEN total_price ELSE 0 END)`),
                            0
                        ),
                        'rto_cod_amount',
                    ],
                ],
                where: whereCondition,
                group: [col('lm_partner')],
                order: [[fn('LOWER', col('lm_partner')), 'ASC']],
                raw: true,
            });

            // ✅ Format Response — clean & consistent
            const formattedData = result.map(item => ({
                vendor: item.vendor ? item.vendor.toUpperCase() : 'NA',
                total_RTO: `${item.rto_orders}/${parseFloat(item.rto_total_amount).toFixed(2)}`,
                prepaid: `${item.rto_prepaid_count}/${parseFloat(item.rto_prepaid_amount).toFixed(2)}`,
                cod: `${item.rto_cod_count}/${parseFloat(item.rto_cod_amount).toFixed(2)}`,
            }));

            // ✅ Add Overall Summary Row (Optional but useful)
            const totals = result.reduce(
                (acc, curr) => {
                    acc.rto_orders += Number(curr.rto_orders) || 0;
                    acc.rto_total_amount += Number(curr.rto_total_amount) || 0;
                    acc.rto_prepaid_count += Number(curr.rto_prepaid_count) || 0;
                    acc.rto_prepaid_amount += Number(curr.rto_prepaid_amount) || 0;
                    acc.rto_cod_count += Number(curr.rto_cod_count) || 0;
                    acc.rto_cod_amount += Number(curr.rto_cod_amount) || 0;
                    return acc;
                },
                {
                    rto_orders: 0,
                    rto_total_amount: 0,
                    rto_prepaid_count: 0,
                    rto_prepaid_amount: 0,
                    rto_cod_count: 0,
                    rto_cod_amount: 0,
                }
            );

            formattedData.push({
                vendor: 'TOTAL',
                total_RTO: `${totals.rto_orders}/${totals.rto_total_amount.toFixed(2)}`,
                prepaid: `${totals.rto_prepaid_count}/${totals.rto_prepaid_amount.toFixed(2)}`,
                cod: `${totals.rto_cod_count}/${totals.rto_cod_amount.toFixed(2)}`,
            });

            return {
                success: true,
                message: 'Optimized vendor-wise RTO summary fetched successfully',
                data: formattedData,
            };
        } catch (error) {
            console.error('🔥 Error in RtoSummaryByPartner:', error);
            return { success: false, message: error.message };
        }
    }






















}



module.exports = OrderHelper;

