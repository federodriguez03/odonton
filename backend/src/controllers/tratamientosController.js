const tratamientosService = require('../services/tratamientosService');

exports.listar = async (req, res) => {
  try {
    const { pacienteId, diente, desde, hasta } = req.query;
    const data = await tratamientosService.listar({ pacienteId, diente, desde, hasta });
    res.json({ tratamientos: data });
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const t = await tratamientosService.crear(req.body || {});
    res.status(201).json({ mensaje: 'Tratamiento registrado', tratamiento: t });
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
};
