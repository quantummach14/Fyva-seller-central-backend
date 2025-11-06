const express = require("express");
require('dotenv').config();
const initMySQL = require("./src/config/db");
const cors = require('cors');
const authRouter = require('./src/routes/auth.route');
const orderRouter = require('./src/routes/order');
const financeRouter = require('./src/routes/finance')
const reportRouter = require('./src/routes/report')
const authenticateToken = require('./src/middleware/authMiddleware');
const bodyParser = require("body-parser");
const sequelize = require('./src/config/db');
const User = require('./src/models/User');
const OrderBookingData = require('./src/models/orderBookingData');
const DaburPurchaseData = require("./src/models/daburPurcahseData");
const ZendeskTicketingData = require("./src/models/zendeskTicketingData");
const grnTable = require('./src/models/grnTable');
const DaburPincode = require('./src/models/daburPincode');
const OrderDetail = require('./src/models/orderDetail');
const RemittanceData = require('./src/models/remittanceData');
const InventoryItem = require('./src/models/inventoryItem');
const Refund = require('./src/models/refund');
const WhatsappResponse = require('./src/models/whatsappResponse');
const PoFileUploads = require('./src/models/PoFileUploads');
const ProductMaster = require('./src/models/productMaster');
const DaburPoConversionFile = require('./src/models/daburPoConversionFile');
const ChatbotMessages = require("./src/models/ChatbotMessages");
const initializeSocket = require("./src/helper/socket");
const ModelAssociations = require("./src/models/ModelAssociations");
const app = express();
const server = require('http').createServer(app); // Create HTTP server
app.use(cors({
  'origin': "*"
}));

// Body parser middleware
app.use(bodyParser.json({ limit: "20mb" }));

// Routes
app.use("/health", function (req, res) {
  console.log('successful working----->>>>>>>>>>>>>>>.')
  return res.status(200).send({ message: "Successfully working" });
});
app.use("/auth", authRouter); // Assuming testRouter handles routes for /user
app.use("/order", orderRouter); // Assuming testRouter handles routes for /order

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

// Define the async function for syncing the subscription model
async function syncSubscription() {
  try {
    await User.sync({ alter: false });
    await OrderBookingData.sync({ alter: false });
    console.log('OrderBookingData model synced with database');
    await DaburPurchaseData.sync({ alter: false });
    console.log('daburPurchaseData model synced with database');
    await ZendeskTicketingData.sync({ alter: false });
    console.log('zendeskTicketingData model synced with database');
    await grnTable.sync({ alter: false });
    console.log('grnTable model synced with database');
    await OrderDetail.sync({ alter: false});
    console.log('OrderDetail model synced with database');
    await RemittanceData.sync({alter: false});
    console.log('RemittedData model synced with database');
    await DaburPincode.sync({alter: false});
    console.log('Dabur Pincode model synced with database');
    await InventoryItem.sync({alter: false});
    console.log('Inventory Item model synced with database');
    await Refund.sync({alter: false});
    console.log('Refund Item model synced with database');
    await WhatsappResponse.sync({alter: false});
    console.log('WhatsappResponse model synced with database');
    await DaburPoConversionFile.sync({alter: false});
    console.log('Dabur Po Conversion File model synced with database');
    await PoFileUploads.sync({alter: false});
    console.log('Dabur Po File Uploads model synced with database');
    await ProductMaster.sync({alter: false});
    console.log('Product Master Uploads model synced with database');
    await ChatbotMessages.sync({alter: false});
    console.log('Chatbot Messages model synced with database');

  } catch (error) {
    console.error('Error syncing Subscription model: ', error);
  }


}

sequelize.sync()
  .then(() => {
    syncSubscription();
    console.log('Models synced with the database.');
  })
  .catch(err => {
    console.error('Error syncing models: ', err);
  });

// Start the server
const PORT = process.env.PORT || 3003;
server.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    initializeSocket.initialize(server);
});
