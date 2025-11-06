const Sequelize = require("sequelize");
const HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB = process.env.DB;
const DB_PASSWORD = process.env.DB_PASSWORD;
console.log({DB, DB_USER, DB_PASSWORD});
const sequelize = new Sequelize(
  DB,
  DB_USER,
  DB_PASSWORD,
  {
    host: HOST,
    logging: true, 
    dialect: "mysql",
    define: {
      timestamps: false,
    },
  }
);

sequelize
  .authenticate()
  .then(function (success) {
    console.log("****************************");
    console.log("*    Starting Server");
    console.log(`*    Port: ${process.env.PORT || 3003}`);
    console.log(`*    Database: ${process.env.DB}`);
    console.log("Connection has been established successfully :)");
  })
  .catch(function (err) {
    console.log("Unable to connect to the database:(", err);
  });


  module.exports = sequelize;