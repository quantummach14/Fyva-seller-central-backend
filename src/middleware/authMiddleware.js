const jwt = require('jsonwebtoken');

// Middleware to authenticate token and optionally check for a specific role
function authenticateToken(requiredRole = null) {
    return (req, res, next) => {
        console.log("hi>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer token"
        // console.log('token ', token);
        
        if (token == null) {
            return res.status(401).json({ message: 'Token is missing' });
        }

        jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
            if (err) return res.status(403).json({ message: 'Invalid token' });

            // Set user information to request
            req.user = user;
            // console.log('user ', user);
            
            // Check user role
            if (requiredRole) {
                // If a specific role is required, check if the user has it
                if (user.role === requiredRole) {
                    return next(); // Move to the next middleware or route handler
                } else {
                    return res.status(403).json({ message: 'Access denied: permissions  denied to this user' });
                }
            } else {
                // No specific role is required, allow access to 'seller' and 'seller_admin'
                if (user.role === 'seller' || user.role === 'seller_admin' || user.role === 'seller_central_admin' || user.role === 'seller_siens_admin') {
                    return next(); // Move to the next middleware or route handler
                } else {
                    return res.status(403).json({ message: 'Access denied: insufficient permissions to this user' });
                }
            }
        });
    };
}

module.exports = authenticateToken;
