const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class RemittanceData extends Model { }

RemittanceData.init({

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    start_date: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    end_date: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    total_sales: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    bank_amount: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    cod_amount: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    remitted_amount: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    transaction_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    transaction_date: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    invoice_number: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    city: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    sequelize,
    modelName: 'remittanceData',
    tableName: 'remittance_data',
    timestamps: true, // Set to true if you want Sequelize to manage timestamps
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
RemittanceData.sync({ alter: false })
    .then(() => {
        console.log('remittance_data table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = RemittanceData;

// Sync the model with the database
sequelize.sync();
    
