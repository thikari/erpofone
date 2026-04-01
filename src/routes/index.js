const router = require('express').Router();
const ctrl   = require('../controllers/dashboardController');

router.get('/', ctrl.index);

module.exports = router;
