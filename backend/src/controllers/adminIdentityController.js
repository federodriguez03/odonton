const service = require('../services/adminIdentityService');

async function list(req, res, next) {
  try { return res.json({ usuarios: await service.listIdentities() }); } catch (error) { return next(error); }
}
async function create(req, res, next) {
  try { const id = await service.saveIdentity(null, req.body || {}, req.user.usuario_id); return res.status(201).json({ mensaje: 'Usuario creado', id }); } catch (error) { return next(error); }
}
async function update(req, res, next) {
  try { const id = await service.saveIdentity(req.params.id, req.body || {}, req.user.usuario_id); return res.json({ mensaje: 'Usuario actualizado', id }); } catch (error) { return next(error); }
}
module.exports = { list, create, update };
