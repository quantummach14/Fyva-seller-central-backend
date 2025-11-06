const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class DaburPoConversionFile extends Model { }

DaburPoConversionFile.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    sku_code: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sku_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    mrp: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    ean: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    hsn: {
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
    status: {
        type: DataTypes.STRING,
        allowNull: true,
    },

}, {
    sequelize,
    tableName: 'dabur_po_conversion_file',
    modelName: 'daburPoConversionFile',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

DaburPoConversionFile.sync({ alter: false })
    .then(() => {
        console.log('Dabur Po Conversion File table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });



module.exports = DaburPoConversionFile;
