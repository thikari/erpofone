const router = require('express').Router();
const ctrl   = require('../controllers/agentsController');

router.get('/',              ctrl.index);
router.get('/:id',           ctrl.show);
router.post('/',             ctrl.create);
router.patch('/:id',         ctrl.update);
router.delete('/:id',        ctrl.destroy);
router.post('/:id/skills',   ctrl.addSkill);
router.delete('/:id/skills/:skillId', ctrl.removeSkill);

module.exports = router;
