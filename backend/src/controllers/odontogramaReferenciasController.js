const service=require('../services/odontogramaReferenciasService');
async function listar(req,res){try{return res.json({referencias:await service.listar({soloActivas:req.query.activas==='true'})});}catch(e){return res.status(400).json({mensaje:e.message});}}
async function crear(req,res){try{return res.status(201).json({referencia:await service.crear(req.body||{})});}catch(e){return res.status(400).json({mensaje:e.message});}}
async function actualizar(req,res){try{return res.json({referencia:await service.actualizar(req.params.id,req.body||{})});}catch(e){return res.status(400).json({mensaje:e.message});}}
async function activar(req,res){try{return res.json({referencia:await service.cambiarActiva(req.params.id,req.body?.activa)});}catch(e){return res.status(400).json({mensaje:e.message});}}
module.exports={listar,crear,actualizar,activar};
