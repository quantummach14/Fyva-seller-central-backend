const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class ProductMaster extends Model { }

ProductMaster.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    sku_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    brand: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    vendor: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    variant_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    product_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    category: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    title_with_grammage: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    tags: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    weight_unit: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    title: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    handle: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    image: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    variant: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    ean_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    mrp: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    selling_price: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    discount: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    mfg_date: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    shelf_life: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    available_inventory_bglr: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    available_inventory_ggn: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    statutory_reqs: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    manufacturer_address: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
    },
    marketed_by: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
    },
    manufactured_by: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
    },
    manufactured_unit_2: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
    },
    manufactured_unit_3: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
    },
    manufactured_unit_4: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
    },
    updated_datetime: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    weight: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    original_weight: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    unit: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
},
    {
        sequelize,
        modelName: 'productMaster',
        tableName: 'product_master',
    });

module.exports = ProductMaster;
