const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class OrderDetail extends Model {}

OrderDetail.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    shopify_id: {
        type: DataTypes.STRING(100),
    },
    order_no: {
        type: DataTypes.STRING(100),
    },
    cust_id: {
        type: DataTypes.STRING(100),
    },
    item_id: {
        type: DataTypes.STRING(100),
    },
    item_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    variant_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    title: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    quantity: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    sku: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    variant_title: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    vendor: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    fulfillment_service: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    product_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    require_shipping: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    taxable: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    gift_ard: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    variant_inventory_management: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    properties: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    product_exists: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    fulfillable_quantity: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    price: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    discount: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    product_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    discount_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    fulfillment_status: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    qty_returned: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
    },
    tax_title: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_price: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_rate: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_title2: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_price2: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_rate2: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_title3: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_price3: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_rate3: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    currency_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    shipped_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    shipped_qty: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    shipped_date: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    hsn_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tax_per: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    qty_not_received: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    mrp_diff: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    datetime: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
}, {
    sequelize,
    modelName: 'orderDetail',
    tableName: 'order_details', 
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',// Set to true if you have createdAt and updatedAt fields
});

// OrderDetail.belongsTo(OrderBookingData, {
//     foreignKey: 'order_no',
//     targetKey: 'order_number',
// });

OrderDetail.sync({ alter: false })
    .then(() => {
        console.log('orderDetail table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = OrderDetail;

// Sync the model with the database
sequelize.sync();