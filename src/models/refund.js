const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class Refund extends Model { }

Refund.init({
    
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    order_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    refund_amount: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    refund_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    reason_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    ticket_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    agent_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    agent_id: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    refund_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    txn_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    wallet_txn_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    utr_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    arn: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    refund_process_date: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    settled_date: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    datetime: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    whats_app_response: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    cust_response: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    cust_mobile: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    cust_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    gift_card_amt: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    razor_pay_amt: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    gift_card_refund_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    gift_card_refund_date: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    opt_in_msg_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    refund_mode: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    refund_process_giftcard: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    refund_process_razorpay: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    w_txn_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    w_arn: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
}, {
    sequelize,
    modelName: 'refund',
    tableName: 'refunds',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

Refund.sync({ alter: false })
    .then(() => {
        console.log('Refund table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = Refund;

sequelize.sync();

