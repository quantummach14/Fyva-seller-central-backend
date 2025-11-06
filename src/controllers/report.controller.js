const { Sequelize, Op, fn } = require('sequelize');
const OrderBookingData = require('../models/orderBookingData');
const Refund = require('../models/refund');
const exceljs = require('exceljs');

class ReportController {
    static async downloadOrderStatusReport(req, res) {
        try {
            const results = await OrderBookingData.findAll({
                attributes: [
                    'order_number',
                    [Sequelize.fn('DATE', Sequelize.col('datetime')), 'datetime'],
                    'shipping_city',
                    'shipping_zip',
                    'cust_delivery_date',
                    [Sequelize.fn('DATE', Sequelize.col('shipped_datetime')), 'shipped_datetime'],
                    'awb_no',
                    'order_status',
                    'total_price',
                    [Sequelize.literal(`CASE 
                        WHEN financial_status = 'paid' THEN 'prepaid' 
                        WHEN financial_status = 'pending' THEN 'COD' 
                        ELSE financial_status 
                    END`), 'financial_status'],
                    'transporter_status_remark',
                    'shipping_province',
                    'lm_partner',
                    'lm_status',
                    'lm_remarks',
                    'lm_update_datetime'
                ],
                order: [['datetime', 'DESC']],
            });

            // Debug raw results
            console.log('Raw Results:', JSON.stringify(results, null, 2));

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No order status data found.',
                });
            }

            const formattedResults = results.map(item => ({
                order_number: item.order_number,
                datetime: item.datetime,
                shipping_city: item.shipping_city,
                shipping_zip: item.shipping_zip,
                cust_delivery_date: item.cust_delivery_date,
                shipped_datetime: item.dataValues.shipped_datetime,
                awb_no: item.awb_no,
                order_status: item.order_status,
                total_price: item.total_price,
                financial_status: item.financial_status,
                transporter_status_remark: item.dataValues.transporter_status_remark,
                shipping_province: item.shipping_province,
                lm_partner: item.lm_partner,
                lm_status: item.dataValues.lm_status,
                lm_remarks: item.dataValues.lm_remarks,
                lm_update_datetime: item.dataValues.lm_update_datetime,
                order_weight: '',
                lm_charges: '',
                order_tat: '',
            }));
            console.log('Formatted Results:', formattedResults);

            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Order Status Report');
            worksheet.columns = [
                { header: 'Order Number', key: 'order_number' },
                { header: 'Order Date', key: 'datetime' },
                { header: 'Shipping City', key: 'shipping_city' },
                { header: 'Shipping Pincode', key: 'shipping_zip' },
                { header: 'Customer Delivery Date', key: 'cust_delivery_date' },
                { header: 'Shipping Date', key: 'shipped_datetime' },
                { header: 'AWB No', key: 'awb_no' },
                { header: 'Order Status', key: 'order_status' },
                { header: 'Order Amount', key: 'total_price' },
                { header: 'Payment Mode', key: 'financial_status' },
                { header: 'Transporter Remarks', key: 'transporter_status_remark' },
                { header: 'Shipping State', key: 'shipping_province' },
                { header: 'LM Vendor', key: 'lm_partner' },
                { header: 'LM Order Status', key: 'lm_status' },
                { header: 'LM Status Remarks', key: 'lm_remarks' },
                { header: 'Lm Partner Updated Datetime', key: 'lm_update_datetime' },
                { header: 'Order Weight', key: 'order_weight' },
                { header: 'LM Charges As per LM partner', key: 'lm_charges' },
                { header: 'Order TAT', key: 'order_tat' },
            ];
            worksheet.addRows(formattedResults);

            res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.attachment('order-status-report.xlsx');
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Error fetching order status report:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch order status report',
                error: error.message,
            });
        }
    }


    static async downloadRefundReport(req, res) {
        try {
            // Fetch data directly from the model (using Sequelize ORM)
            const results = await Refund.findAll({
                attributes: [
                    'order_no',
                    'refund_amount',
                    'refund_type',
                    'reason',
                    'agent_name',
                    'refund_status',
                    'txn_id',
                    [Sequelize.fn('DATE', Sequelize.col('refund_process_date')), 'refund_process_date'],
                    'arn',
                    [Sequelize.fn('DATE', Sequelize.col('datetime')), 'datetime']
                ],
                order: [['datetime', 'DESC']]  // Sorting by datetime descending
            });
            console.log("results->>>>>>", results)

            // Check if results are empty
            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No order status data found.',
                });
            }

            // Format the results into a structure that will be used for the Excel report
            const formattedResults = results.map(item => ({
                order_no: item.order_no,
                refund_amount: item.refund_amount,
                refund_type: item.refund_type,
                reason: item.reason,
                agent_name: item.agent_name,
                refund_status: item.refund_status,
                txn_id: item.txn_id,
                refund_process_date: item.refund_process_date,
                arn: item.arn,
                datetime: item.datetime,
            }));

            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Refund Report');
            worksheet.columns = [
                { header: 'Order Number', key: 'order_no' },
                { header: 'Refund Amount', key: 'refund_amount' },
                { header: 'Refund Type', key: 'refund_type' },
                { header: 'Reason', key: 'reason' },
                { header: 'Agent Name', key: 'agent_name' },
                { header: 'Refund Status', key: 'refund_status' },
                { header: 'Refund Id', key: 'txn_id' },
                { header: 'Refund Processed Date', key: 'refund_process_date' },
                { header: 'Refund ARN No', key: 'arn' },
                { header: 'Refund Datetime', key: 'datetime' },
            ];
            worksheet.addRows(formattedResults);

            // Set the response headers for file download
            res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.attachment('refund-report.xlsx');
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Error fetching refund status report', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch refund status report',
                error: error.message,
            });
        }
    }



}

module.exports = ReportController;
