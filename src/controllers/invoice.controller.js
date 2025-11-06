const { OrderBookingData } = require('../models/orderBookingData');
const { Sequelize, Op, fn, col, where, literal } = require('sequelize');
// const multer = require('multer');
const XLSX = require('xlsx');
const moment = require('moment');  // Use moment.js for date formatting
const DaburPurchaseData = require('../models/daburPurcahseData')

class InvoiceController {
    // static async uploadExcelData(req, res) {
    //     try {
    //         if (!req.file) {
    //             return res.status(400).json({ message: 'No file uploaded' });
    //         }

    //         console.log('File uploaded successfully, processing...');

    //         const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    //         const sheetName = workbook.SheetNames[0];
    //         const worksheet = workbook.Sheets[sheetName];

    //         // Parse the sheet into JSON, skipping the first row (headers)
    //         const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: null, range: 1, header: 1 });
    //         console.log('Parsed data:', rawData);

    //         // Define the database column order (excluding id, created_at, updated_at)
    //         const dbColumns = [
    //             'cfa', 'customer', 'customer_group', 'customer_name', 'city', 'customer_po_number',
    //             'customer_po_date', 'required_delivery_date', 'order_no', 'order_date', 'line_item',
    //             'material_number', 'design_code', 'customer_article_no', 'disc', 'design_code_description',
    //             'mrp', 'net_price', 'delivery_doc', 'del_line_item', 'delivery_date', 'delivery_qty_ea',
    //             'delivery_cv', 'delivery_value', 'received_qty', 'grnno', 'pull_datetime', 'bad_bin'
    //         ];

    //         // Transform raw data to match the database column names based on order
    //         const transformedData = rawData.map(row => {
    //             const transformedRow = {};
    //             // let row = [];
    //             Object.keys(row).forEach((excelHeader, index) => {
    //                 const dbColumn = dbColumns[index];
    //                 if (dbColumn) transformedRow[dbColumn] = row[excelHeader];
    //             });
    //             return transformedRow;
    //         });

    //         console.log('Transformed data:', transformedData);

    //         // Insert data into the database
    //         const createdRecords = await DaburPurchaseData.bulkCreate(transformedData, {
    //             validate: true,
    //             // ignoreDuplicates: true, // Uncomment if you want to ignore duplicates
    //         });

    //         return res.status(200).json({
    //             message: 'File uploaded and data saved successfully!',
    //             savedRecords: createdRecords.length,
    //             parsedData: rawData,
    //             transformedData: transformedData
    //         });

    //     } catch (error) {
    //         console.error('Error uploading Excel data:', error);
    //         res.status(500).json({ message: 'Server Error', error: error.message });
    //     }
    // }



    // static async uploadExcelData(req, res) {
    //     try {
    //         const { filterType } = req.body;
    //         console.log("filterType>>>>>>>>>>>>>>>>>>>>>>", filterType);


    //         // Validate `filterType`
    //         if (!filterType || !['po_file', 'delivery_challan', 'invoice'].includes(filterType)) {
    //             return res.status(400).json({
    //                 message: 'Invalid or missing filterType. Must be one of: PO file, Delivery Challan, Invoice',
    //             });
    //         }

    //         if (!req.file) {
    //             return res.status(400).json({ message: 'No file uploaded' });
    //         }

    //         console.log('File uploaded successfully, processing...');

    //         const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    //         const sheetName = workbook.SheetNames[0];
    //         const worksheet = workbook.Sheets[sheetName];

    //         // Parse the sheet into JSON
    //         const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    //         console.log('Parsed data:', rawData);

    //         // Define column mappings for each filterType
    //         const columnMappings = {
    //             'po_file': {
    //                 'PO No': 'customer_po_number',
    //                 'PO Date': 'customer_po_date',
    //                 'City': 'city',
    //                 'Mat Code ': 'material_number',
    //                 // 'Mat Description': 'disc',
    //                 'Mat Description': 'material_description',
    //                 'design_code_description': 'material_description', 
    //                 'MRP': 'mrp',
    //                 'EAN (Barcode)': 'customer_article_no',
    //                 'Quantity': 'line_item',
    //                 'Net Price': 'net_price',
    //             },
    //             'delivery_challan': {
    //                 'PO No': 'customer_po_number',
    //                 'Order No': 'order_no',
    //                 'Order Line Item': 'line_item',
    //                 'Material Number': 'material_number',
    //                 // 'Customer Article No': 'customer_article_no',
    //                 // 'Material Desc': 'design_code_description',
    //                 'Delivery Date': 'delivery_date',
    //                 'Delivery doc': 'delivery_doc',
    //                 'Del Line item': 'del_line_item',
    //                 'DeliveryQty(EA)': 'delivery_qty_ea',
    //                 'DeliveryQty(CV)': 'delivery_cv',
    //                 'Delivery Value': 'delivery_value',
    //             },
    //             'invoice': {
    //                 'PO No': 'customer_po_number',
    //                 'Order No': 'order_no',
    //                 'Order Line Item': 'line_item',
    //                 'Material Number': 'material_number',
    //                 'Customer Article No': 'customer_article_no',
    //                 'Material Desc': 'design_code_description',
    //                 'Delivery Date': 'delivery_date',
    //                 'Delivery doc': 'delivery_doc',
    //                 'Del Line item': 'del_line_item',
    //                 'DeliveryQty(EA)': 'delivery_qty_ea',
    //                 'DeliveryQty(CV)': 'delivery_cv',
    //                 'Delivery Value': 'delivery_value',
    //             },
    //         };

    //         // Get the specific column mapping for the selected filterType
    //         const columnMapping = columnMappings[filterType];
    //         if (!columnMapping) {
    //             return res.status(400).json({ message: `No column mapping found for filterType: ${filterType}` });
    //         }

    //         // Transform raw data to match the database column names
    //         const transformedData = rawData.map(row => {
    //             const transformedRow = {};
    //             for (const [excelHeader, dbColumn] of Object.entries(columnMapping)) {
    //                 transformedRow[dbColumn] = row[excelHeader] || null;
    //             }
    //             return transformedRow;
    //         });

    //         console.log('Transformed data:', transformedData);

    //         if (filterType === 'po_file') {
    //             // Filter out data that already exists (based on material_number and customer_po_number)
    //             const existingRecords = await DaburPurchaseData.findAll({
    //                 attributes: ['material_number', 'customer_po_number'],
    //                 where: {
    //                     [Op.or]: transformedData.map(row => ({
    //                         material_number: row.material_number,
    //                         customer_po_number: row.customer_po_number,
    //                     })),
    //                 },
    //             });

    //             const existingMap = new Set(
    //                 existingRecords.map(record => `${record.material_number}-${record.customer_po_number}`)
    //             );

    //             // Insert new records that don't exist
    //             const newRecords = transformedData.filter(
    //                 row => !existingMap.has(`${row.material_number}-${row.customer_po_number}`)
    //             );

    //             if (newRecords.length > 0) {
    //                 await DaburPurchaseData.bulkCreate(newRecords, { validate: true });
    //             }

    //             return res.status(200).json({
    //                 message: `${filterType} data processed successfully!`,
    //                 savedRecords: newRecords.length,
    //             });
    //         } else if (filterType === 'delivery_challan' || filterType === 'invoice') {
    //             // For Delivery Challan and Invoice, update the existing rows
    //             for (const row of transformedData) {
    //                 const { material_number, customer_po_number, ...updateFields } = row;

    //                 if (!material_number || !customer_po_number) {
    //                     console.log('Skipping row due to missing material_number or customer_po_number:', row);
    //                     continue;
    //                 }

    //                 await DaburPurchaseData.update(updateFields, {
    //                     where: { material_number, customer_po_number },
    //                 });
    //             }

    //             return res.status(200).json({
    //                 message: `${filterType} data processed successfully!`,
    //             });
    //         }
    //     } catch (error) {
    //         console.error('Error uploading Excel data:', error);
    //         res.status(500).json({ message: 'Server Error', error: error.message });
    //     }
    // }

    static async uploadExcelData(req, res) {
        try {
            const { filterType } = req.body;
            console.log("filterType>>>>>>>>>>>>>>>>>>>>>>", filterType);

            // Validate `filterType`
            if (!filterType || !['po_file', 'delivery_challan', 'invoice'].includes(filterType)) {
                return res.status(400).json({
                    message: 'Invalid or missing filterType. Must be one of: PO file, Delivery Challan, Invoice',
                });
            }

            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            console.log('File uploaded successfully, processing...');

            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Parse the sheet into JSON
            const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
            console.log('Parsed data:', rawData);

            // Define column mappings for each filterType
            const columnMappings = {
               'po_file': {
                    'city': 'city',
                    'customer_po_number': 'customer_po_number',
                    'customer_po_date': 'customer_po_date',
                    'material_number': 'material_number',
                    'customer_article_no': 'customer_article_no',
                    'disc': 'disc',
                    // 'Mat Description': 'material_description',
                    // 'design_code_description': 'material_description',
                    'mrp': 'mrp',
                    'net_price': 'net_price',
                    // 'Quantity': 'line_item',
                    'hsn_code': 'hsn_code',
                    'gst' : 'gst',
                    'case_size': 'case_size',
                    'cases': 'cases',
                    'po_qty': 'po_qty'
                },
                'delivery_challan': {
                    'CustomerPONumber': 'customer_po_number',
                    'Order No': 'order_no',
                    'Order Line Item': 'line_item',
                    'Material Number': 'material_number',
                    'Material Desc': 'design_code_description',
                    'Delivery Date': 'delivery_date',
                    'Delivery doc': 'delivery_doc',
                    // 'Del Line item': 'del_line_item',
                    'DeliveryQty(EA)': 'delivery_qty_ea',
                    'DeliveryQty(CV)': 'delivery_cv',
                    'Delivery Value': 'delivery_value',
                },
                'invoice': {
                    'PO No': 'customer_po_number',
                    'Order No': 'order_no',
                    'Order Line Item': 'line_item',
                    'Material Number': 'material_number',
                    // 'Customer Article No': 'customer_article_no',
                    'Material Desc': 'design_code_description',
                    'Delivery Date': 'delivery_date',
                    'Delivery doc': 'delivery_doc',
                    'Del Line item': 'del_line_item',
                    'DeliveryQty(EA)': 'delivery_qty_ea',
                    'DeliveryQty(CV)': 'delivery_cv',
                    'Delivery Value': 'delivery_value',
                },
            };

            // Get the specific column mapping for the selected filterType
            const columnMapping = columnMappings[filterType];
            if (!columnMapping) {
                return res.status(400).json({ message: `No column mapping found for filterType: ${filterType}` });
            }

            // Helper function to format date
            const formatDate = (dateValue) => {
                if (typeof dateValue === 'number') {
                    // Excel date serial number, so we convert it using XLSX.SSF.parse_date_code
                    const parsedDate = XLSX.SSF.parse_date_code(dateValue);
            
                    console.log('Parsed date from Excel serial:', parsedDate);
            
                    // Create a proper Date object
                    const date = new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d);
                    console.log('new date  ', date);
                    // Format the date to DD/MM/YYYY
                    return moment(date).format('YYYY-MM-DD');
                } else if (dateValue instanceof Date) {
                    // If it's already a JavaScript Date, format it
                    return moment(dateValue).format('YYYY-MM-DD');
                } else if (typeof dateValue === 'string' && dateValue.trim() !== '') {
                    // If it's a string, parse it with moment
                    return moment(dateValue, 'YYYY-MM-DD').format('YYYY-MM-DD');
                }
                return null; // Return null if no valid date value
            };
            



            // Transform raw data to match the database column names and format delivery date
            const transformedData = rawData.map(row => {
                const transformedRow = {};
                for (const [excelHeader, dbColumn] of Object.entries(columnMapping)) {
                    let value = row[excelHeader] || null;

                    // Format 'Delivery Date' to dd/mm/yyyy if it exists
                    if (['Delivery Date', 'customer_po_date'].includes(excelHeader) && value) {
                        value = formatDate(value);
                        console.log(`Formatted ${excelHeader} >>>`, value);
                    }

                    transformedRow[dbColumn] = value;
                }
                return transformedRow;
            });

            console.log('Transformed data:', transformedData);

            if (filterType === 'po_file') {
                // Filter out data that already exists (based on material_number and customer_po_number)
                const existingRecords = await DaburPurchaseData.findAll({
                    attributes: ['material_number', 'customer_po_number'],
                    where: {
                        [Op.or]: transformedData.map(row => ({
                            material_number: row.material_number,
                            customer_po_number: row.customer_po_number,
                        })),
                    },
                });

                const existingMap = new Set(
                    existingRecords.map(record => `${record.material_number}-${record.customer_po_number}`)
                );

                // Insert new records that don't exist
                const newRecords = transformedData.filter(
                    row => !existingMap.has(`${row.material_number}-${row.customer_po_number}`)
                );
                console.log('new records>>>>>>',newRecords)

                if (newRecords.length > 0) {
                    await DaburPurchaseData.bulkCreate(newRecords, { validate: true });
                }

                return res.status(200).json({
                    message: `${filterType} data processed successfully!`,
                    savedRecords: newRecords.length,
                });
            } else if (filterType === 'delivery_challan' || filterType === 'invoice') {
                // For Delivery Challan and Invoice, update the existing rows
                for (const row of transformedData) {
                    const { material_number, customer_po_number, ...updateFields } = row;

                    if (!material_number || !customer_po_number) {
                        console.log('Skipping row due to missing material_number or customer_po_number:', row);
                        continue;
                    }

                    await DaburPurchaseData.update(updateFields, {
                        where: { material_number, customer_po_number },
                    });
                }

                return res.status(200).json({
                    message: `${filterType} data processed successfully!`,
                });
            }
        } catch (error) {
            console.error('Error uploading Excel data:', error);
            res.status(500).json({ message: 'Server Error', error: error.message });
        }
    }


}


module.exports = InvoiceController;