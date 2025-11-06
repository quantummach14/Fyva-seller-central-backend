const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class WhatsappResponse extends Model { }

WhatsappResponse.init({

    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    order_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    cust_mobile: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    message_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    type_of_notification: {
        type: DataTypes.STRING(200),
        allowNull: false,
    },
    response: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    cust_response: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    type: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    final_action: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    message_status: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'updated_at',
    },
}, {
    sequelize,
    modelName: 'whatsappResponse',
    tableName: 'whatsapp_responses',
    timestamps: true, 
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
WhatsappResponse.sync({ alter: false })
    .then(() => {
        console.log('WhatsappResponse table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = WhatsappResponse;

sequelize.sync();

