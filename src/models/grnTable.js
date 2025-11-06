const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class grnTable extends Model {}

grnTable.init({

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pocode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    grnno: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    inboundcoe: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    vendor_code: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    vendor_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    invoice_number: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    invoice_date: { 
        type: DataTypes.DATE,
        allowNull: true,
    },
    sku: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    skubarcode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    cost: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lottable: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lottable: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lottable03: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lottable05: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    sequelize,
    modelName: 'grnTable',
    tableName: 'grn_table',
    timestamps: false, // Set to true if you want Sequelize to manage timestamps
});
grnTable.sync({ alter: false })
    .then(() => {
        console.log('grnTable table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = grnTable;

// Sync the model with the database
sequelize.sync();