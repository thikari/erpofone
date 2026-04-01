const router = require('express').Router();
const ctrl   = require('../controllers/resourcesController');

router.get('/',      ctrl.index);
router.post('/',     ctrl.create);
router.delete('/:id',ctrl.destroy);

module.exports = router;
