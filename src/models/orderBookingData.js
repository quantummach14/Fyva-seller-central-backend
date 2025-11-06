const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

class OrderBookingData extends Model { }

OrderBookingData.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    shopify_id: {
        type: DataTypes.STRING(25),
    },
    email: {
        type: DataTypes.STRING(50), // Increased size
    },
    name: {
        type: DataTypes.STRING(25), // Increased size
    },
    created_at: {
        type: DataTypes.DATE,
    },
    updated_at: {
        type: DataTypes.DATE,
    },
    // closed_at: {
    //     type: DataTypes.DATE,
    // },
    note: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    note_attributes: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    token: {
        type: DataTypes.STRING(25), // Increased size
    },
    gateway: {
        type: DataTypes.STRING(25), // Increased size
    },
    total_price: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for price
    },
    subtotal_price: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for price
    },
    total_weight: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for weight
    },
    total_tax: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for tax
    },
    tax_included: {
        type: DataTypes.BOOLEAN, // Change to BOOLEAN
    },
    currency: {
        type: DataTypes.STRING(25), // ISO currency codes are usually 3 chars
        allowNull: true,
    },
    financial_status: {
        type: DataTypes.STRING(25),
    },
    // confirmed: {
    //     type: DataTypes.BOOLEAN, // Change to BOOLEAN
    // },
    total_discount: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for discount
    },
    cart_tocken: {
        type: DataTypes.STRING(25), // Increased size
    },
    // buyer_accepts_marketing: {
    //     type: DataTypes.BOOLEAN, // Change to BOOLEAN
    // },
    cancelled_at: {
        type: DataTypes.DATE,
    },
    cancel_reason: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    // total_price_usd: {
    //     type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for price
    // },
    checkout_token: {
        type: DataTypes.STRING(25), // Increased size
    },
    // processed_at: {
    //     type: DataTypes.DATE,
    // },
    // device_id: {
    //     type: DataTypes.STRING(25), // Increased size
    // },
    // app_id: {
    //     type: DataTypes.STRING(25), // Increased size
    // },
    // browser_ip: {
    //     type: DataTypes.STRING(25), // IPv6 can be up to 45 chars
    // },
    order_number: {
        type: DataTypes.STRING(25),
    },
    payment_gateway: {
        type: DataTypes.STRING(25),
    },
    processing_method: {
        type: DataTypes.STRING(25),
    },
    // checkout_id: {
    //     type: DataTypes.STRING(25), // Increased size
    // },
    // source_name: {
    //     type: DataTypes.STRING(25),
    // },
    fullfilment_status: {
        type: DataTypes.STRING(25),
    },
    tax_price: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for tax price
    },
    tax_rate: {
        type: DataTypes.DECIMAL(5, 4), // Use DECIMAL for tax rate
    },
    tax_title: {
        type: DataTypes.STRING(25),
    },
    // currency1: {
    //     type: DataTypes.STRING(25), // ISO currency codes are usually 3 chars
    // },
    // tax_price2: {
    //     type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for tax price
    // },
    // tax_rate2: {
    //     type: DataTypes.DECIMAL(5, 4), // Use DECIMAL for tax rate
    // },
    // tax_title2: {
    //     type: DataTypes.STRING(25),
    // },
    // currency2: {
    //     type: DataTypes.STRING(25), // ISO currency codes are usually 3 chars
    // },
    order_status: {
        type: DataTypes.STRING(25),
    },
    // contact_email: {
    //     type: DataTypes.STRING(25), // Increased size
    // },
    // tags: {
    //     type: DataTypes.TEXT, // Changed to TEXT
    // },
    // billing_fname: {
    //     type: DataTypes.STRING(25),
    // },
    billing_address1: {
        type: DataTypes.TEXT, // Changed to TEXT
    }, 
    phone: {
        type: DataTypes.STRING(25), // Limit phone number size
    },
    billing_city: {
        type: DataTypes.STRING(25),
    },
    billing_zip: {
        type: DataTypes.STRING(25), // Adjust for zip code length
    },
    billing_province: {
        type: DataTypes.STRING(25),
    },
    // billing_lname: {
    //     type: DataTypes.STRING(25),
    // },
    billing_address2: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    // company: {
    //     type: DataTypes.STRING(25), // Increased size
    // },
    latitude: {
        type: DataTypes.DECIMAL(10, 8), // Decimal for coordinates
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8), // Decimal for coordinates
    },
    billing_name: {
        type: DataTypes.STRING(25), // Increased size
    },
    billing_country_code: {
        type: DataTypes.STRING(25), // ISO country codes are usually 3 chars
    },
    // billing_province_code: {
    //     type: DataTypes.STRING(25), // ISO province codes are usually 3 chars
    // },
    // shipping_fname: {
    //     type: DataTypes.STRING(25),
    // },
    shipping_address1: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    phone1: {
        type: DataTypes.STRING(25), // Limit phone number size
    },
    shipping_city: {
        type: DataTypes.STRING(25),
    },
    shipping_zip: {
        type: DataTypes.STRING(25), // Adjust for zip code length
    },
    shipping_province: {
        type: DataTypes.STRING(25),
    },
    shipping_country: {
        type: DataTypes.STRING(25),
    },
    // shipping_lname: {
    //     type: DataTypes.STRING(25),
    // },
    shipping_address2: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    // lm_partner: {
    //     type: DataTypes.STRING(25),
    //     allowNull: true,
    // },
    lm_partner: {
        type: DataTypes.ENUM('dtdc_manager', 'ecom_manager'),
        allowNull: true,
    },
    loading_status: {
        type: DataTypes.STRING(25),
        allowNull: true,
    },
    int_updated_datetime: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    shipping_company: {
        type: DataTypes.STRING(25), // Increased size
    },
    shipping_lat: {
        type: DataTypes.DECIMAL(10, 8), // Decimal for coordinates
    },
    shipping_long: {
        type: DataTypes.DECIMAL(11, 8), // Decimal for coordinates
    },
    shipping_name: {
        type: DataTypes.STRING(25), // Increased size
    },
    shipping_country_code: {
        type: DataTypes.STRING(25), // ISO country codes are usually 3 chars
    },
    shipping_province_code: {
        type: DataTypes.STRING(25), // ISO province codes are usually 3 chars
    },
    // paid_at: {
    //     type: DataTypes.DATE,
    // },
    total_shipping: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for shipping cost
    },
    platform_fee: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for platform fee
    },
    low_order_fee: {
        type: DataTypes.DECIMAL(10, 2), // Use DECIMAL for low order fee
    },
    discount_code: {
        type: DataTypes.TEXT, // Changed to TEXT
    },
    shipping_type: {
        type: DataTypes.STRING(25),
    },
    payment_ref: {
        type: DataTypes.STRING(25), // Increased size
    },
    refund: {
        type: DataTypes.STRING(25),
    },
    // vendor: {
    //     type: DataTypes.STRING(25),
    // },
    // risk_level: {
    //     type: DataTypes.STRING(25),
    // },
    source: {
        type: DataTypes.STRING(25),
        allowNull: true,
    },
    receipt_no: {
        type: DataTypes.STRING(25),
    },
    datetime: {
        type: DataTypes.DATE,
    },
    cust_id: {
        type: DataTypes.STRING(25), // If cust_id can exceed 55 chars, consider TEXT
    },
    invoice_date: {
        type: DataTypes.STRING(25), // Date formatted as 'YYYY-MM-DD'
    },
    delivery_date: {
        type: DataTypes.STRING(25), // Date formatted as 'YYYY-MM-DD'
    },
    cust_delivery_date: {
        type: DataTypes.DATE,
    },
    cust_delivery_slot: {
        type: DataTypes.STRING(25), // Can hold slot names, adjust if needed
    },
    cust_delivery_slot_id: {
        type: DataTypes.STRING(25),
    },
    awb_no: {
        type: DataTypes.STRING(25), // Air Waybill number, usually fixed length
    },
    sfx_status: {
        type: DataTypes.STRING(25), // Status code, if it can grow larger, consider TEXT
    },
    sfx_delivery_date: {
        type: DataTypes.STRING(25), // Date formatted as 'YYYY-MM-DD'
    },
    sfx_datetime: {
        type: DataTypes.DATE,
    },
    // binary_update_date: {
    //     type: DataTypes.DATE, // Consider using DATE for proper date management
    //     allowNull: true,
    // },
    // order_update_date: {
    //     type: DataTypes.DATE,
    // },
    ttt_invoice: {
        type: DataTypes.STRING(25), // If you expect it to be fixed length
    },
    client_order_id: {
        type: DataTypes.STRING(25),
    },
    whizz_awb_no: {
        type: DataTypes.STRING(25), // Air Waybill number
    },
    gift_card_amt: {
        type: DataTypes.DECIMAL(10, 2), // Monetary values as DECIMAL
        allowNull: true,
    },
    razor_pay_amt: {
        type: DataTypes.DECIMAL(10, 2), // Monetary values as DECIMAL
        allowNull: true,
    },
    eligible_cashback: {
        type: DataTypes.DECIMAL(10, 2), // Monetary values as DECIMAL
        allowNull: true,
    },
    payment_details: {
        type: DataTypes.STRING(25), // Adjust size if payment details are longer
        allowNull: true,
    },
    // final_gift_card_amt_paid: {
    //     type: DataTypes.DECIMAL(10, 2), // Monetary values as DECIMAL
    //     allowNull: true,
    // },
    // final_razorpay_amt_paid: {
    //     type: DataTypes.DECIMAL(10, 2), // Monetary values as DECIMAL
    //     allowNull: true,
    // },
    payment_id: {
        type: DataTypes.STRING(25),
        allowNull: true,
    },
    // order_source: {
    //     type: DataTypes.STRING(25),
    //     allowNull: true,
    // },
    // is_hotel_order: {
    //     type: DataTypes.BOOLEAN, // True/false value
    //     allowNull: true,
    // },
    // is_hotel_order_pushed: {
    //     type: DataTypes.BOOLEAN, // True/false value
    //     allowNull: true,
    // },
    source_code: {
        type: DataTypes.STRING(25),
    },
    // is_order_pushed: {
    //     type: DataTypes.BOOLEAN, // True/false value
    // },
    delivery_tip_amount: {
        type: DataTypes.DECIMAL(10, 2), // Monetary values as DECIMAL
        allowNull: true,
    },
    customer_mobileno: {
        type: DataTypes.STRING(25), // Standard mobile number length
        allowNull: true,
    },
    customer_alternate_mobileno: {
        type: DataTypes.STRING(25), // Standard mobile number length
        allowNull: true,
    },
    b_mobileno: {
        type: DataTypes.STRING(25), // Standard mobile number length
        allowNull: true,
    },
    b_alt_mobileno: {
        type: DataTypes.STRING(25), // Standard mobile number length
        allowNull: true,
    },
    s_mobileno: {
        type: DataTypes.STRING(25), // Standard mobile number length
        allowNull: true,
    },
    s_alt_mobileno: {
        type: DataTypes.STRING(25), // Standard mobile number length
        allowNull: true,
    },
    delivery_team: {
        type: DataTypes.STRING(25), // Can hold team names
    },
    lm_status: {
        type: DataTypes.STRING(25), // Can hold team names
    },
    lm_remarks: {
        type: DataTypes.STRING(255), // Can hold team names
    },
    lm_update_datetime: {
        type: DataTypes.STRING(25), // Can hold team names
    },
    /* Add additional fields as necessary */
}, {
    sequelize,
    modelName: 'OrderBookingData',
    tableName: 'order_booking_data',
    timestamps: false, // Set to true if you want Sequelize to manage timestamps
});

// OrderBookingData.hasMany(OrderDetail, {
//     foreignKey: 'order_no',
//     sourceKey: 'order_number',
// });
OrderBookingData.sync({ alter: false })
    .then(() => {
        console.log('orderBookingTable table create successfully');

    })
    .catch(err => {
        console.log('Error occured during create table', err);

    });

module.exports = OrderBookingData;

// Sync the model with the database
sequelize.sync();
