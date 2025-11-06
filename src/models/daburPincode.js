const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class DaburPincode extends Model { }

DaburPincode.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    warehouse_city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Remove `created_at` and `updated_at` from here
  },
  {
    sequelize,
    modelName: 'daburPincode',
    tableName: 'dabur_pincode',
    timestamps: true, // Enable automatic timestamps
    createdAt: 'created_at', // Custom field name for createdAt
    updatedAt: 'updated_at', // Custom field name for updatedAt
    defaultScope: {
      // Ensure default timestamp management is applied
      attributes: {
        include: [
          [sequelize.fn('NOW'), 'created_at'],
          [sequelize.fn('NOW'), 'updated_at']
        ]
      }
    }
  });

// Sync the model with the database
DaburPincode.sync({ alter: false })
  .then(() => {
    console.log('Dabur Pincode table created successfully');
  })
  .catch(err => {
    console.log('Error occurred during table creation:', err);
  });

module.exports = DaburPincode;
