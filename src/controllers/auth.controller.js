const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateOTP, sendOTP } = require('../helper/otpGenerator');
const User = require('../models/User'); // Import the User model
class AuthController {

    static async login(req, res) {
        const { email, password } = req.body;

        try {
            // Find user by email
            const user = await User.findOne({ where: { email } });
            console.log('users>>',user);
            // console.log('sdsdsd');
            var ram  = '';

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            if (user.status == 0) {
                return res.status(403).json({ message: 'Your account is inactive. Please contact support.' });
            }

            // Compare the password entered by the user with the stored hashed password
            const isPasswordValid = await bcrypt.compare(password, user.password);

            if (!isPasswordValid) {
                return res.status(400).json({ message: 'Invalid email or password' });
            }

            // Generate a JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET || 'your_jwt_secret',
                { expiresIn: '1d' } // Token expiration time
            );

            // Return success response with the token and user data
            return res.status(200).json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    phone_number: user.phone_number,
                    status: user.status,
                    subscription: user.is_subscription
                }
            });

        } catch (error) {
            console.log('Login error: ', error);
            return res.status(500).json({ message: 'Error logging in' });
        }
    }

    static async verifyExistingEmail(req, res) {
        const { email } = req.body;
        console.log('Request body:', req.body);

        if (!email || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        try {
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(404).json({ message: 'User not found, please register first' });
            }

            const otp = generateOTP();
            console.log('Generated OTP:', otp);

            const emailSend = await sendOTP(email, otp);
            console.log('OTP sent to:', email);

            // Calculate OTP expiration time (e.g., 10 minutes from now)
            const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiration

            // Save OTP and expiration time to the user's record in the database
            await User.update(
                { otp, otpExpiration },
                { where: { email } }
            );

            return res.status(200).json({ message: 'OTP sent successfully to your email' });
        } catch (error) {
            console.error('Error sending OTP:', error);
            return res.status(500).json({ message: 'Error sending OTP, please try again later' });
        }
    }

    // Verify OTP
    static async verifyOTP(req, res) {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        try {
            const user = await User.findOne({ where: { email } });
            if (!user || !user.otp || !user.otpExpiration) {
                return res.status(404).json({ message: 'OTP not found or expired' });
            }

            const now = new Date();
            if (now > user.otpExpiration) {
                return res.status(400).json({ message: 'OTP expired' });
            }

            if (user.otp !== otp) {
                return res.status(400).json({ message: 'Invalid OTP' });
            }

            // Clear OTP fields after successful verification
            // await User.update(
            //     { otp: null, otpExpiration: null }, 
            //     { where: { email } }
            // );

            return res.status(200).json({ message: 'OTP verified successfully' });
        } catch (error) {
            console.error('Error verifying OTP:', error);
            return res.status(500).json({ message: 'Error verifying OTP' });
        }
    }

    static async resetPassword(req, res) {
        const { email, newPassword, confirmPassword } = req.body;

        // Check if the required fields are provided
        if (!email || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: 'Email, new password, and confirm password are required' });
        }

        // Step 1: Check if newPassword matches confirmPassword
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'New password and confirm password do not match' });
        }

        try {
            // Step 2: Find the user by email
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Step 3: Hash the new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // Step 4: Update the user's password in the database
            await User.update(
                { password: hashedPassword },
                { where: { email } }
            );

            // Step 5: Return success response
            return res.status(200).json({ message: 'Password reset successfully' });
        } catch (error) {
            console.error('Error resetting password:', error);
            return res.status(500).json({ message: 'Error resetting password' });
        }
    }

    static async resetPassword(req, res) {
        const { email, newPassword, confirmPassword } = req.body;
    
        // Validate inputs
        if (!email || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: 'email, newPassword, and confirmPassword fields are required' });
        }
    
        // Check if newPassword and confirmPassword match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'newPassword and confirmPassword do not match' });
        }
    
        try {
            // Find the user by email
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(400).json({ message: 'User not found' });
            }
    
            // Compare the new password with the old password
            const isSamePassword = await bcrypt.compare(newPassword, user.password);
            if (isSamePassword) {
                return res.status(400).json({ message: 'New password cannot be the same as the previous password' });
            }
    
            // Hash the new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);
    
            // Update the user's password
            await User.update(
                { password: hashedPassword },
                { where: { email } }
            );
    
            return res.status(200).json({ message: 'Password reset successfully' });
    
        } catch (error) {
            console.error('Error resetting password:', error);
            return res.status(500).json({ message: 'Error resetting password' });
        }
    }
    
    static async usersData(req, res) {
        try {
            // Fetch all users from the database
            const users = await User.findAll();
            console.log('Usesr data are:', users);

            // Return the users as JSON
            return res.status(200).json(users);
        } catch (error) {
            console.error('Error fetching users:', error);
            return res.status(500).json({ message: 'Error fetching users' });
        }
    }

    static async checkToken(req, res) {
        // If the token is valid and the middleware passed, you can respond
        return res.status(200).json({
            message: 'Token is valid',
            user: req.user, // Return user information from the verified token
        });
    }
    // static async usersData(req, res) {
    //     const users = await User.findAll();
    //     return res.status(200)
    // }
}

module.exports = AuthController;

