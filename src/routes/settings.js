const router = require('express').Router();
const ctrl   = require('../controllers/settingsController');

router.get('/',                       ctrl.index);
router.post('/keys',                  ctrl.createKey);
router.delete('/keys/:id',            ctrl.deleteKey);
router.patch('/tools/:id/toggle',     ctrl.toggleTool);
router.patch('/tools/:id',            ctrl.updateTool);
router.post('/tokens',                ctrl.createToken);
router.delete('/tokens/:id',          ctrl.deleteToken);

module.exports = router;
