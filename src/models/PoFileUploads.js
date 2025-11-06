const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class PoFileUploads extends Model {}

PoFileUploads.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    sku_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    sku_name: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    mrp: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    ean: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    hsn: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    gst_percentage: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    case_size: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    shelf_life: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    case_required: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    qty_required: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    final_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(25),
        allowNull: false,
    },
    total_cost: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    city: {
        type: DataTypes.STRING(25),
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    sequelize,
    modelName: 'PoFileUploads',
    tableName: 'po_file_uploads',
    timestamps: false, // No automatic `createdAt`/`updatedAt`
});

PoFileUploads.sync({ alter: false })
    .then(() => {
        console.log('po_file_uploads table created successfully');
    })
    .catch(err => {
        console.log('Error occurred during table creation:', err);
    });

module.exports = PoFileUploads;

// Sync the model with the database
sequelize.sync();
