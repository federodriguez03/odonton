-- Índices sugeridos
CREATE INDEX IF NOT EXISTS idx_odontograma_paciente_diente ON odontograma(paciente_id, diente);
CREATE INDEX IF NOT EXISTS idx_tratamientos_paciente_diente ON tratamientos(paciente_id, diente);
CREATE INDEX IF NOT EXISTS idx_protesis_fijas_paciente ON protesis_fijas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_protesis_removibles_paciente ON protesis_removibles(paciente_id);
