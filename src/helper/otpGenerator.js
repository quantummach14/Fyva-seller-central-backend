const nodemailer = require('nodemailer');

// Function to generate a 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000); // Generates a random 6-digit number
}

// Function to send email with OTP
async function sendOTP(email, otp) {
    // Setup Nodemailer transport service
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_FROM,
            pass: process.env.EMAIL_PASSWORD, 
        },
    });
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #333;">Email Verification</h2>
            <p style="font-size: 16px; color: #555;">
                Hello,
            </p>
            <p style="font-size: 16px; color: #555;">
                Your OTP for email verification is: <strong style="font-size: 24px; color: #000;">${otp}</strong>
            </p>
            <p style="font-size: 14px; color: #888;">
                This OTP is valid for the next 10 minutes. Please do not share this code with anyone.
            </p>
            <p style="font-size: 16px; color: #555;">
                Thanks,<br>The Support Team
            </p>
        </div>
    `;
    // Mail options
    const mailOptions = {
        from: `${process.env.EMAIL_FROM_APP}`,
        to: email,
        subject: "Email Verification",
        html: htmlContent,
    };

    // Send the email
    return transporter.sendMail(mailOptions);
}

module.exports = {
    generateOTP,
    sendOTP
};