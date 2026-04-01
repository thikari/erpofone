const router = require('express').Router();
const ctrl   = require('../controllers/cronsController');

router.get('/',       ctrl.index);
router.post('/',      ctrl.create);
router.patch('/:id',  ctrl.update);
router.delete('/:id', ctrl.destroy);

module.exports = router;
