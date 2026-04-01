const router = require('express').Router();
const ctrl   = require('../controllers/usageController');

router.get('/',          ctrl.index);
router.get('/api/data',  ctrl.apiData);

module.exports = router;
