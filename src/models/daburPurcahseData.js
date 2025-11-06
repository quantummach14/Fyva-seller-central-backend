const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class DaburPurchaseData extends Model {}

DaburPurchaseData.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    cfa: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    customer: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    customer_group: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    customer_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    city: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    customer_po_number: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    customer_po_date: { 
        type: DataTypes.DATE,
        allowNull: true,
    },
    required_delivery_date: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    order_no: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    order_date: { 
        type: DataTypes.DATE,
        allowNull: true,
    },
    line_item: {
        type: DataTypes.STRING,
        allowNull: true
    },
    material_number: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    design_code: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    customer_article_no: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    disc: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    design_code_description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    mrp: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    net_price: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    hsn_code: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    gst: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    case_size: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    cases: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    po_qty: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    delivery_doc: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    del_line_item: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    delivery_date: { 
        type: DataTypes.DATE,
        allowNull: true,
    },
    delivery_qty_ea: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    delivery_cv: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    delivery_value: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    received_qty: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    grnno: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    pull_datetime: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    bad_bin: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    final_qty: { 
        type: DataTypes.STRING,
        allowNull: true,
    },
    final_value: { 
        type: DataTypes.STRING,
        allowNull: true,
    },

}, {
    sequelize,
    tableName: 'dabur_purchase_data', // Set table name in lowercase
    modelName: 'daburPurchaseData',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

// Sync the model with the database
DaburPurchaseData.sync({ alter: false })
    .then(() => {
        console.log('dabur_purchase_data table created successfully');
    })
    .catch(err => {
        console.log('Error occurred during table creation:', err);
    });

module.exports = DaburPurchaseData;
