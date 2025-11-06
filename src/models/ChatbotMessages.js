const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class ChatbotMessages extends Model { }

ChatbotMessages.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        ip_address: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        user_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        chat: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
        }
        // Remove `created_at` and `updated_at` from here
    },
    {
        sequelize,
        modelName: 'ChatbotMessages',
        tableName: 'chatbot_messages',
        timestamps: true, // Enable automatic timestamps
        createdAt: 'created_at', // Custom field name for createdAt
        updatedAt: 'updated_at', // Custom field name for updatedAt
    });

// Sync the model with the database
ChatbotMessages.sync({ alter: false })
    .then(() => {
        console.log('Chatbot Messages table created successfully');
    })
    .catch(err => {
        console.log('Error occurred during table creation:', err);
    });

module.exports = ChatbotMessages;
