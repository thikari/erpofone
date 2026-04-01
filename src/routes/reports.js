const router = require('express').Router();
const ctrl   = require('../controllers/reportsController');

router.get('/', ctrl.index);

module.exports = router;
