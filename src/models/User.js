const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class User extends Model { }

User.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    role: {
        type: DataTypes.ENUM,
        values: ['seller','super_admin','admin','agent','seller_admin', 'seller_central_admin', 'seller_siens_admin'],
        defaultValue: 'seller'
    },
    last_login: {
        type: DataTypes.DATE,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: "active"
    },
    otp: {
        type: DataTypes.STRING,
    },
    otp_expiry: {
        type: DataTypes.DATE,
    },
    login_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },


}, {
    sequelize,
    tableName: 'steller_users',
    modelName: 'User',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

User.sync({ alter: false })
    .then(() => {
        console.log('User table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });



module.exports = User;
