-- Preparacion canonica de identidad. No cambia login, JWT ni autorizacion.
-- Requiere SET LOCAL odonton.owner_email antes de ejecutarse.

DO $$
DECLARE
  faltantes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'IDENTIDAD_INCOMPATIBLE: falta public.usuarios';
  END IF;

  IF to_regclass('public.roles') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles' AND column_name='id' AND udt_name='int2') THEN faltantes:=array_append(faltantes,'roles.id smallint'); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles' AND column_name='codigo' AND is_nullable='NO') THEN faltantes:=array_append(faltantes,'roles.codigo NOT NULL'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.roles'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (codigo)') THEN faltantes:=array_append(faltantes,'roles UNIQUE(codigo)'); END IF;
  END IF;

  IF to_regclass('public.usuarios_roles') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios_roles' AND column_name='usuario_id' AND udt_name='int4') THEN faltantes:=array_append(faltantes,'usuarios_roles.usuario_id integer'); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios_roles' AND column_name='rol_id' AND udt_name='int2') THEN faltantes:=array_append(faltantes,'usuarios_roles.rol_id smallint'); END IF;
  END IF;

  IF to_regclass('public.profesionales') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profesionales' AND column_name='id' AND udt_name='int4') THEN faltantes:=array_append(faltantes,'profesionales.id integer'); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profesionales' AND column_name='usuario_id' AND udt_name='int4' AND is_nullable='YES') THEN faltantes:=array_append(faltantes,'profesionales.usuario_id integer nullable'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profesionales'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (usuario_id)') THEN faltantes:=array_append(faltantes,'profesionales UNIQUE(usuario_id)'); END IF;
  END IF;

  IF cardinality(faltantes)>0 THEN
    RAISE EXCEPTION 'IDENTIDAD_INCOMPATIBLE: %',array_to_string(faltantes,', ');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS roles (
  id SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS profesionales (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE REFERENCES usuarios(id) ON DELETE RESTRICT,
  usuario_legacy_id INTEGER UNIQUE REFERENCES usuarios(id) ON DELETE RESTRICT,
  nombre_mostrado VARCHAR(120) NOT NULL CHECK(BTRIM(nombre_mostrado)<>''),
  activo BOOLEAN NOT NULL DEFAULT false,
  es_ficticio BOOLEAN NOT NULL DEFAULT false,
  compatibilidad_pendiente BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles(codigo,nombre) VALUES
  ('dueno','Dueño'),('odontologo','Odontólogo'),('recepcion','Recepción')
ON CONFLICT(codigo) DO UPDATE SET nombre=EXCLUDED.nombre;

CREATE TABLE IF NOT EXISTS usuarios_roles_vigentes (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
  rol_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  asignado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  asignado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  motivo TEXT NOT NULL CHECK(BTRIM(motivo)<>'' )
);

CREATE TABLE IF NOT EXISTS identidad_roles_historial (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  rol_anterior_id SMALLINT REFERENCES roles(id) ON DELETE RESTRICT,
  rol_nuevo_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  actor_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  accion VARCHAR(50) NOT NULL,
  motivo TEXT NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS vinculo_confirmado_at TIMESTAMPTZ;
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS vinculo_confirmado_por_usuario_id INTEGER;
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS vinculo_origen VARCHAR(40);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profesionales_vinculo_confirmado_por_fk') THEN
    ALTER TABLE profesionales ADD CONSTRAINT profesionales_vinculo_confirmado_por_fk
      FOREIGN KEY(vinculo_confirmado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profesionales_vinculo_confirmacion_coherente') THEN
    ALTER TABLE profesionales ADD CONSTRAINT profesionales_vinculo_confirmacion_coherente CHECK(
      (vinculo_confirmado_at IS NULL AND vinculo_confirmado_por_usuario_id IS NULL AND vinculo_origen IS NULL)
      OR (vinculo_confirmado_at IS NOT NULL AND vinculo_confirmado_por_usuario_id IS NOT NULL AND vinculo_origen IS NOT NULL AND BTRIM(vinculo_origen)<>'')
    );
  END IF;
END $$;

DO $$
DECLARE
  owner_email TEXT:=NULLIF(BTRIM(current_setting('odonton.owner_email',true)),'');
  owner_id INTEGER;
  owner_count INTEGER;
  dueno_rol_id SMALLINT;
  vigente_rol_id SMALLINT;
  inserted_count INTEGER;
BEGIN
  IF owner_email IS NULL THEN RAISE EXCEPTION 'OWNER_EMAIL_REQUERIDO: configure odonton.owner_email explicitamente'; END IF;
  SELECT COUNT(*),MIN(id) INTO owner_count,owner_id FROM usuarios WHERE LOWER(email)=LOWER(owner_email) AND COALESCE(activo,true)=true;
  IF owner_count<>1 THEN RAISE EXCEPTION 'OWNER_EMAIL_INVALIDO: se esperaba una cuenta activa unica para %',owner_email; END IF;
  SELECT id INTO dueno_rol_id FROM roles WHERE codigo='dueno';
  SELECT rol_id INTO vigente_rol_id FROM usuarios_roles_vigentes WHERE usuario_id=owner_id;
  IF vigente_rol_id IS NOT NULL AND vigente_rol_id<>dueno_rol_id THEN RAISE EXCEPTION 'OWNER_ROL_CONFLICTIVO: la cuenta ya tiene otro rol canonico'; END IF;

  WITH inserted AS (
    INSERT INTO usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo)
    VALUES(owner_id,dueno_rol_id,owner_id,'Asignacion inicial explicita del dueño')
    ON CONFLICT(usuario_id) DO NOTHING RETURNING usuario_id
  ) SELECT COUNT(*) INTO inserted_count FROM inserted;

  IF inserted_count=1 THEN
    INSERT INTO identidad_roles_historial(usuario_id,rol_nuevo_id,actor_usuario_id,accion,motivo,detalle)
    SELECT owner_id,dueno_rol_id,owner_id,'asignacion_inicial_dueno','Asignacion inicial explicita del dueño',
      jsonb_build_object('owner_email',owner_email,'roles_residuales',COALESCE((SELECT jsonb_agg(r.codigo ORDER BY r.codigo) FROM usuarios_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=owner_id),'[]'::jsonb));
  END IF;
END $$;
