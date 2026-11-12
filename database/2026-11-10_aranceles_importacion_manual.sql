-- Referencias documentales de aranceles. Separadas del precio_base operativo.
CREATE TABLE IF NOT EXISTS arancel_versiones (
  id BIGSERIAL PRIMARY KEY,
  fuente TEXT NOT NULL CHECK (BTRIM(fuente) <> ''),
  version_documental TEXT NOT NULL CHECK (BTRIM(version_documental) <> ''),
  moneda VARCHAR(10) NOT NULL CHECK (BTRIM(moneda) <> ''),
  vigencia DATE NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_hash_sha256 CHAR(64) NOT NULL UNIQUE,
  creado_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arancel_referencias (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES arancel_versiones(id) ON DELETE RESTRICT,
  fila_csv INTEGER NOT NULL CHECK (fila_csv >= 2),
  codigo TEXT NOT NULL CHECK (BTRIM(codigo) <> ''),
  nombre TEXT NOT NULL CHECK (BTRIM(nombre) <> ''),
  categoria TEXT NOT NULL CHECK (BTRIM(categoria) <> ''),
  precio NUMERIC(14,2),
  estado_precio TEXT NOT NULL CHECK (BTRIM(estado_precio) <> ''),
  pagina_pdf INTEGER CHECK (pagina_pdf > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version_id, codigo),
  UNIQUE (version_id, fila_csv)
);

CREATE TABLE IF NOT EXISTS prestacion_arancel_referencias (
  prestacion_id INTEGER NOT NULL REFERENCES prestaciones(id) ON DELETE RESTRICT,
  referencia_id BIGINT NOT NULL UNIQUE REFERENCES arancel_referencias(id) ON DELETE RESTRICT,
  vinculado_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prestacion_id, referencia_id)
);

CREATE TABLE IF NOT EXISTS arancel_auditoria (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES arancel_versiones(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  accion VARCHAR(40) NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arancel_referencias_codigo_idx ON arancel_referencias (codigo);
CREATE INDEX IF NOT EXISTS arancel_versiones_fuente_vigencia_idx ON arancel_versiones (LOWER(fuente), vigencia DESC, id DESC);
CREATE INDEX IF NOT EXISTS prestacion_arancel_prestacion_idx ON prestacion_arancel_referencias (prestacion_id);
