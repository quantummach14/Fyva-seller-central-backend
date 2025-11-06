const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class InventoryItem extends Model {}

InventoryItem.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    sku_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    location: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    inventory_data: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    qty: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    bin: {
        type: DataTypes.STRING(20), // Good/Bad/Hold
        allowNull: true,
    },
    shopify_qty: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    shopify_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at',
    },
}, {
    sequelize,
    modelName: 'inventoryItem',
    tableName: 'inventory_items',
    timestamps: true, 
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
InventoryItem.sync({ alter: false })
    .then(() => {
        console.log('inventory_item table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = InventoryItem;

sequelize.sync();

