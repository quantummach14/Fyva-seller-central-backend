// Import your models here
const OrderDetail = require('./orderDetail');
const OrderBookingData = require('./orderBookingData');
const DaburPincode = require('./daburPincode');
const DaburPurchaseData = require('./daburPurcahseData');
const RemittanceData = require('./remittanceData');

class ModelAssociations {
    constructor() {
        this.setupAssociations();
    }

    setupAssociations() {
        // Setting up the association where OrderDetail belongs to OrderBookingData
        OrderDetail.belongsTo(OrderBookingData, {
            foreignKey: 'order_no',           // Column in OrderDetail that links to OrderBookingData
            targetKey: 'order_number',        // Column in OrderBookingData being referenced
            onDelete: 'NO ACTION',
            onUpdate: 'CASCADE',
            as: 'order_data'
        });

        // Setting up the association where OrderBookingData has many OrderDetails
        OrderBookingData.hasMany(OrderDetail, {
            foreignKey: 'order_no',           // Column in OrderDetail that links to OrderBookingData
            sourceKey: 'order_number',        // Column in OrderBookingData being referenced
            as: 'orderDetails'                // Alias for easier reference in queries
        });

        // // Setting up the association where DaburPurchaseData belongs to DaburPincode
        DaburPurchaseData.belongsTo(DaburPincode, {
            foreignKey: 'city',
            targetKey: 'warehouse_city',
            onDelete: 'NO ACTION',
            onUpdate: 'CASCADE',
            as: 'pincodeData'
        });

        // // Setting up the association where DaburPincode has many DaburPurchaseData
        DaburPincode.hasMany(DaburPurchaseData, {
            foreignKey: 'city',            // Column in DaburPurchaseData that links to DaburPincode
            sourceKey: 'warehouse_city',             // Column in DaburPincode being referenced
            as: 'daburPurchase'           // Alias for easier reference in queries
        });

        DaburPurchaseData.belongsTo(RemittanceData, {
            foreignKey: 'order_no',          // Column in DaburPurchaseData that links to RemittanceData
            targetKey: 'invoice_number',     // Column in RemittanceData being referenced
            onDelete: 'NO ACTION',
            onUpdate: 'CASCADE',
            as: 'remittanceData'             // Alias for easier reference in queries
        });

        // Setting up the association where RemittanceData has many DaburPurchaseData
        RemittanceData.hasMany(DaburPurchaseData, {
            foreignKey: 'order_no',          // Column in DaburPurchaseData that links to RemittanceData
            sourceKey: 'invoice_number',     // Column in RemittanceData being referenced
            as: 'daburPurchaseData'          // Alias for easier reference in queries
        });

        DaburPurchaseData.belongsTo(OrderBookingData, {
            foreignKey: 'city',            // Column in DaburPurchaseData that links to OrderBookingData
            targetKey: 'billing_city',     // Column in OrderBookingData being referenced
            onDelete: 'NO ACTION',
            onUpdate: 'CASCADE',
            as: 'orderBookingData'         // Alias for easier reference in queries
        });

        // Setting up the association where OrderBookingData has many DaburPurchaseData
        OrderBookingData.hasMany(DaburPurchaseData, {
            foreignKey: 'city',            // Column in DaburPurchaseData that links to OrderBookingData
            sourceKey: 'billing_city',     // Column in OrderBookingData being referenced
            as: 'daburPurchaseEntries'     // Alias for easier reference in queries
        });

        OrderDetail.belongsTo(DaburPurchaseData, {
            foreignKey: 'order_no',           // Column in OrderDetail that links to DaburPurchaseData
            targetKey: 'order_no',            // Column in DaburPurchaseData being referenced
            onDelete: 'NO ACTION',
            onUpdate: 'CASCADE',
            as: 'daburPurchase'               // Alias for easier reference in queries
        });

        // // Setting up the association where DaburPurchaseData has many OrderDetails
        DaburPurchaseData.hasMany(OrderDetail, {
            foreignKey: 'order_no',           // Column in OrderDetail that links to DaburPurchaseData
            sourceKey: 'order_no',            // Column in DaburPurchaseData being referenced
            as: 'orderDetails'                // Alias for easier reference in queries
        });
    }
}

module.exports = new ModelAssociations();
