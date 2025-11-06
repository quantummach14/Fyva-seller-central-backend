const { Op } = require('sequelize');
const OrderBookingData = require('../models/orderBookingData');
const RemittanceData = require('../models/remittanceData');
const DaburPurchaseData = require('../models/daburPurcahseData');
class UpdateRemittanceController {

    static async getTotalSales(req, res) {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required.' });
        }

        try {
            // Calculate total sales
            let totalSales = await OrderBookingData.sum('total_price', {
                where: {
                    created_at: {
                        [Op.between]: [new Date(startDate), new Date(endDate)],
                    },
                },
            }) || 0;

            totalSales = parseFloat(totalSales.toFixed(2));

            return res.json({
                success: true,
                message: 'Total sales calculated successfully.',
                data: { totalSales }
            });
        } catch (error) {
            console.error('Error fetching total sales:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async checkLastRemittanceDate(req, res) {
        try {
            const recordCount = await RemittanceData.count();
            if (recordCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'The table is empty.',
                });
            }

            const lastEntry = await RemittanceData.findOne({
                order: [['end_date', 'DESC']], // Order by created_date descending
                attributes: ['end_date'], // Select only the created_date column
            });

            if (!lastEntry) {
                throw new Error('No entries found in the database.');
            }

            const lastDate = new Date(lastEntry.end_date); 

        // Create a new Date object for the next date
        const nextDate = new Date(lastDate);
        nextDate.setDate(lastDate.getDate() + 1);

        // Format the next date into the desired format (YYYY-MM-DD)
        const formattedNextDate = nextDate.toISOString().slice(0, 10);

            return res.json({
                success: true,
                message: 'Last Date Fetched Successfully',
                next_date: formattedNextDate
            });

        } catch (error) {
            console.error('Error fetching total sales:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async updateRemittance(req, res) {
        try {
            const { startDate, endDate ,totalSales, bankAmount, codAmount, transactionId, transactionDate, invoiceNumber } = req.body;
    
            // Validate required fields
            if (!totalSales || !bankAmount || !codAmount || !transactionId || !startDate || !endDate || !transactionDate || !invoiceNumber) {
                return res.status(400).json({ error: 'All fields are required.' });
            }
    
            // Check if the transaction ID is already used
            const existingTransaction = await RemittanceData.findOne({
                where: { transaction_id: transactionId }
            });
            if (existingTransaction) {
                return res.status(400).json({success: false, message: 'Transaction ID already exists. Please use a unique transaction ID.' });
            }
    
            
            // Calculate the remitted amount
            const remittedAmount = (parseFloat(bankAmount) + parseFloat(codAmount)) * 0.02;
    
            const totalAmount = parseFloat(bankAmount) + parseFloat(codAmount);
            if (totalAmount > totalSales) {
                return res.status(400).json({
                    success:false,
                    message: 'The sum of bank amount and COD amount cannot be greater than total sales.'
                });
            }
            // Check if the invoice number exists in the dabur_purchase_data table
            const invoiceExists = await DaburPurchaseData.findOne({
                where: { customer_po_number: invoiceNumber }
            });

            if (!invoiceExists) {
                return res.status(404).json({ success: false, message: 'Invalid Invoice.' });
            }

            const { city } = invoiceExists;

            // Save data to the RemittanceData table
            const remittanceData = await RemittanceData.create({
                start_date: startDate,
                end_date: endDate,
                total_sales: totalSales,
                bank_amount: bankAmount,
                cod_amount: codAmount,
                remitted_amount: remittedAmount,
                transaction_id: transactionId,
                transaction_date: transactionDate,
                invoice_number: invoiceNumber,
                city: city 
            });

            return res.status(201).json({
                success: true,
                message: 'Remittance data saved successfully.',
                data: remittanceData
            });
        } catch (error) {
            console.error('Error saving remittance data:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }


}

module.exports = UpdateRemittanceController;