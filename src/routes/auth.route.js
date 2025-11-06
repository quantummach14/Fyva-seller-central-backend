const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');

router.post('/login', AuthController.login);

router.get('/health', function(req, res) { return res.status(200).send({message:"working fine"}) });

router.post('/sendOtp', AuthController.verifyExistingEmail);

router.post('/verifyOTP', AuthController.verifyOTP);

router.post('/resetPassword', AuthController.resetPassword);

router.get('/usersData', AuthController.usersData);

router.get('/checkToken', AuthController.checkToken);

module.exports = router;