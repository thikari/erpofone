const router = require('express').Router();
const ctrl   = require('../controllers/activityController');

router.get('/', ctrl.index);

module.exports = router;
