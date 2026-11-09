const protesisRemoviblesService = require('../services/protesisRemoviblesService');

exports.crear = async (req, res) => {
  try {
    const p = await protesisRemoviblesService.crear(req.body || {}, req.clinicalActor);
    res.status(201).json({ mensaje: 'Protesis removible registrada', protesis: p });
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
};

exports.listar = async (req, res) => {
  try {
    const { pacienteId } = req.query;
    const data = await protesisRemoviblesService.listar({ pacienteId });
    res.json({ protesis: data });
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
};
