const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class ZendeskTicketingData extends Model {}

ZendeskTicketingData.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ticket_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    channel: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    type: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    email_address: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    phone_number: {
        type: DataTypes.STRING(25),
        allowNull: true,
    },
    source: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    feedback_category: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    shopify_order_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    ticket_data: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    subject: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    page_no: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    priority: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    final_description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    requester_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
    },
    assignee_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
    },
}, {
    sequelize,
    modelName: 'zendeskTicketingData',
    tableName: 'zendesk_ticketing_data',
    timestamps: false, // Sequelize won't manage created_at and updated_at columns automatically
});

ZendeskTicketingData.sync({ alter: false })
    .then(() => {
        console.log('ZendeskTicketingData table created successfully');
    })
    .catch(err => {
        console.log('Error occurred during table creation', err);
    });


module.exports = ZendeskTicketingData;
