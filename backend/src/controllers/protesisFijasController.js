const protesisFijasService = require('../services/protesisFijasService');

exports.crear = async (req, res) => {
  try {
    const p = await protesisFijasService.crear(req.body || {}, req.clinicalActor);
    res.status(201).json({ mensaje: 'Protesis fija registrada', protesis: p });
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
};

exports.listar = async (req, res) => {
  try {
    const { pacienteId } = req.query;
    const data = await protesisFijasService.listar({ pacienteId });
    res.json({ protesis: data });
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
};
