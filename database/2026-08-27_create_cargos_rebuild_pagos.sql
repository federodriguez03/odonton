BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.pagos') IS NULL THEN
    RAISE EXCEPTION 'Precondicion incumplida: public.pagos no existe';
  END IF;
END
$migration$;

LOCK TABLE public.pagos
  IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $migration$
DECLARE
  pagos_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO pagos_count
  FROM public.pagos;

  IF pagos_count <> 0 THEN
    RAISE EXCEPTION
      'Precondicion incumplida: public.pagos contiene % fila(s); se requiere migracion de datos',
      pagos_count;
  END IF;
END
$migration$;

CREATE TABLE public.cargos (
  id SERIAL,
  paciente_id INTEGER NOT NULL,
  turno_id INTEGER,
  prestacion_id INTEGER,
  concepto TEXT NOT NULL,
  importe_total NUMERIC(12,2) NOT NULL,
  fecha_cargo DATE NOT NULL DEFAULT CURRENT_DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cargos_pkey PRIMARY KEY (id),
  CONSTRAINT cargos_concepto_no_vacio_check CHECK (BTRIM(concepto) <> ''),
  CONSTRAINT cargos_importe_total_positivo_check CHECK (importe_total > 0),
  CONSTRAINT fk_cargo_paciente
    FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cargo_turno
    FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE SET NULL,
  CONSTRAINT fk_cargo_prestacion
    FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE SET NULL
);

CREATE INDEX idx_cargos_paciente_fecha
  ON public.cargos (paciente_id, fecha_cargo DESC);

CREATE INDEX idx_cargos_turno
  ON public.cargos (turno_id)
  WHERE turno_id IS NOT NULL;

CREATE INDEX idx_cargos_prestacion
  ON public.cargos (prestacion_id)
  WHERE prestacion_id IS NOT NULL;

DROP TABLE public.pagos;

CREATE TABLE public.pagos (
  id SERIAL,
  cargo_id INTEGER NOT NULL,
  importe NUMERIC(12,2) NOT NULL,
  metodo_pago VARCHAR(30) NOT NULL,
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  observaciones TEXT,
  estado VARCHAR(10) NOT NULL DEFAULT 'activo',
  fecha_anulacion TIMESTAMPTZ,
  motivo_anulacion TEXT,
  anulado_por_usuario_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pagos_pkey PRIMARY KEY (id),
  CONSTRAINT pagos_importe_positivo_check CHECK (importe > 0),
  CONSTRAINT pagos_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia')),
  CONSTRAINT pagos_estado_check
    CHECK (estado IN ('activo', 'anulado')),
  CONSTRAINT pagos_anulacion_coherente_check CHECK (
    (
      estado = 'activo'
      AND fecha_anulacion IS NULL
      AND motivo_anulacion IS NULL
      AND anulado_por_usuario_id IS NULL
    )
    OR
    (
      estado = 'anulado'
      AND fecha_anulacion IS NOT NULL
      AND motivo_anulacion IS NOT NULL
      AND BTRIM(motivo_anulacion) <> ''
      AND anulado_por_usuario_id IS NOT NULL
    )
  ),
  CONSTRAINT fk_pago_cargo
    FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pago_anulado_por_usuario
    FOREIGN KEY (anulado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX idx_pagos_cargo
  ON public.pagos (cargo_id);

CREATE INDEX idx_pagos_cargo_activos
  ON public.pagos (cargo_id)
  WHERE estado = 'activo';

CREATE INDEX idx_pagos_fecha_estado
  ON public.pagos (fecha_pago DESC, estado);

COMMIT;
