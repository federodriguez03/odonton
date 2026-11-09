BEGIN;

CREATE TABLE IF NOT EXISTS tratamientos (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  diente SMALLINT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  observaciones TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protesis_fijas (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  dientes SMALLINT[] NOT NULL,
  descripcion TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protesis_removibles (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  arcada VARCHAR(20) NOT NULL,
  descripcion TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE historias_clinicas
  ADD COLUMN IF NOT EXISTS creado_por_usuario_id INTEGER;

ALTER TABLE documentos_paciente
  ADD COLUMN IF NOT EXISTS subido_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

ALTER TABLE tratamientos
  ADD COLUMN IF NOT EXISTS registrado_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

ALTER TABLE protesis_fijas
  ADD COLUMN IF NOT EXISTS registrado_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

ALTER TABLE protesis_removibles
  ADD COLUMN IF NOT EXISTS registrado_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

ALTER TABLE odontograma
  ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

ALTER TABLE odontograma_meta
  ADD COLUMN IF NOT EXISTS actualizado_por_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS profesional_perfil_id INTEGER;

DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('historias_clinicas','historias_creado_por_usuario_fkey','creado_por_usuario_id','usuarios'),
    ('documentos_paciente','documentos_subido_por_usuario_fkey','subido_por_usuario_id','usuarios'),
    ('documentos_paciente','documentos_profesional_perfil_fkey','profesional_perfil_id','profesionales'),
    ('tratamientos','tratamientos_registrado_por_usuario_fkey','registrado_por_usuario_id','usuarios'),
    ('tratamientos','tratamientos_profesional_perfil_fkey','profesional_perfil_id','profesionales'),
    ('protesis_fijas','protesis_fijas_registrado_por_usuario_fkey','registrado_por_usuario_id','usuarios'),
    ('protesis_fijas','protesis_fijas_profesional_perfil_fkey','profesional_perfil_id','profesionales'),
    ('protesis_removibles','protesis_removibles_registrado_por_usuario_fkey','registrado_por_usuario_id','usuarios'),
    ('protesis_removibles','protesis_removibles_profesional_perfil_fkey','profesional_perfil_id','profesionales'),
    ('odontograma','odontograma_actualizado_por_usuario_fkey','actualizado_por_usuario_id','usuarios'),
    ('odontograma','odontograma_profesional_perfil_fkey','profesional_perfil_id','profesionales'),
    ('odontograma_meta','odontograma_meta_actualizado_por_usuario_fkey','actualizado_por_usuario_id','usuarios'),
    ('odontograma_meta','odontograma_meta_profesional_perfil_fkey','profesional_perfil_id','profesionales')
  ) AS v(tabla,restriccion,columna,referencia)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=item.restriccion) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
        item.tabla,item.restriccion,item.columna,item.referencia
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Las filas históricas permanecen en NULL: no se infiere un actor ni se las atribuye
-- al odontólogo de demostración. La aplicación completa ambos identificadores sólo
-- para nuevas escrituras autenticadas posteriores a esta migración.
