/**
 * Modelo de Paciente
 * Gestiona datos personales, antecedentes y contacto
 */

const db = require('../config/database');

const Patient = {
  /**
   * Obtiene todos los pacientes
   */
  findAll: async (limit = 50, offset = 0) => {
    const result = await db.query(
      'SELECT id, name, dni, email, phone, birthdate, created_at FROM patients ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  },

  /**
   * Busca un paciente por ID
   */
  findById: async (id) => {
    const result = await db.query(
      'SELECT * FROM patients WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Busca un paciente por DNI
   */
  findByDni: async (dni) => {
    const result = await db.query(
      'SELECT * FROM patients WHERE dni = $1',
      [dni]
    );
    return result.rows[0];
  },

  /**
   * Busca un paciente por email
   */
  findByEmail: async (email) => {
    const result = await db.query(
      'SELECT * FROM patients WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  /**
   * Crea un nuevo paciente
   */
  create: async (patientData) => {
    const { name, dni, email, phone, birthdate, address, observations } = patientData;
    
    const result = await db.query(
      `INSERT INTO patients (name, dni, email, phone, birthdate, address, observations) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [name, dni, email, phone, birthdate, address, observations]
    );
    return result.rows[0];
  },

  /**
   * Actualiza datos del paciente
   */
  update: async (id, patientData) => {
    const { name, email, phone, birthdate, address, observations } = patientData;
    
    const result = await db.query(
      `UPDATE patients 
       SET name = $1, email = $2, phone = $3, birthdate = $4, address = $5, observations = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, email, phone, birthdate, address, observations, id]
    );
    return result.rows[0];
  },

  /**
   * Elimina un paciente
   */
  delete: async (id) => {
    const result = await db.query(
      'DELETE FROM patients WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  },
};

module.exports = Patient;
