--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: asegurar_administrador_activo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asegurar_administrador_activo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cantidad INTEGER;
BEGIN
  -- El lock se conserva hasta el COMMIT y serializa altas, bajas e inactivaciones
  -- concurrentes que podr?an dejar al sistema sin administrador.
  PERFORM pg_advisory_xact_lock(20261109, 1);

  SELECT COUNT(DISTINCT u.id)::INTEGER
  INTO cantidad
  FROM usuarios u
  JOIN usuarios_roles ur ON ur.usuario_id = u.id
  JOIN roles r ON r.id = ur.rol_id
  WHERE u.activo = TRUE
    AND r.codigo = 'administrador';

  IF cantidad < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Debe existir al menos un administrador activo';
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: impedir_solapamiento_agenda(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impedir_solapamiento_agenda() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.profesional_perfil_id IS NULL
     OR NEW.fecha_hora_inicio IS NULL OR NEW.fecha_hora_fin IS NULL
     OR NEW.estado NOT IN ('programado','reprogramado','confirmado') THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_hora_fin <= NEW.fecha_hora_inicio THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='La hora de fin debe ser posterior a la hora de inicio';
  END IF;

  -- Un cambio entre estados que ya ocupaban el mismo intervalo no vuelve a validar
  -- solapamientos hist?ricos preexistentes.
  IF TG_OP='UPDATE'
     AND OLD.estado IN ('programado','reprogramado','confirmado')
     AND OLD.profesional_perfil_id IS NOT DISTINCT FROM NEW.profesional_perfil_id
     AND OLD.fecha_hora_inicio IS NOT DISTINCT FROM NEW.fecha_hora_inicio
     AND OLD.fecha_hora_fin IS NOT DISTINCT FROM NEW.fecha_hora_fin THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(20261109, NEW.profesional_perfil_id);
  IF EXISTS (
    SELECT 1 FROM turnos t
    WHERE t.id <> COALESCE(NEW.id,0)
      AND t.profesional_perfil_id=NEW.profesional_perfil_id
      AND t.estado IN ('programado','reprogramado','confirmado')
      AND t.fecha_hora_inicio < NEW.fecha_hora_fin
      AND t.fecha_hora_fin > NEW.fecha_hora_inicio
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23P01', MESSAGE='El horario seleccionado ya est? ocupado para este profesional';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_turnos_set_timestamps_and_cancellation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_turnos_set_timestamps_and_cancellation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- siempre actualizar updated_at
  NEW.updated_at := NOW();

  -- al cambiar a 'cancelado' poner fecha_cancelacion si antes no estaba cancelado
  IF TG_OP = 'UPDATE' THEN
    IF NEW.estado = 'cancelado' AND (OLD.estado IS DISTINCT FROM 'cancelado') THEN
      NEW.fecha_cancelacion := NOW();
    ELSIF OLD.estado = 'cancelado' AND NEW.estado IS DISTINCT FROM 'cancelado' THEN
      -- si se reincide desde cancelado, limpiar la fecha
      NEW.fecha_cancelacion := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: arancel_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arancel_auditoria (
    id bigint NOT NULL,
    version_id bigint NOT NULL,
    usuario_id integer,
    accion character varying(40) NOT NULL,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: arancel_auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arancel_auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arancel_auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arancel_auditoria_id_seq OWNED BY public.arancel_auditoria.id;


--
-- Name: arancel_referencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arancel_referencias (
    id bigint NOT NULL,
    version_id bigint NOT NULL,
    fila_csv integer NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    categoria text NOT NULL,
    precio numeric(14,2),
    estado_precio text NOT NULL,
    pagina_pdf integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arancel_referencias_categoria_check CHECK ((btrim(categoria) <> ''::text)),
    CONSTRAINT arancel_referencias_codigo_check CHECK ((btrim(codigo) <> ''::text)),
    CONSTRAINT arancel_referencias_estado_precio_check CHECK ((btrim(estado_precio) <> ''::text)),
    CONSTRAINT arancel_referencias_fila_csv_check CHECK ((fila_csv >= 2)),
    CONSTRAINT arancel_referencias_nombre_check CHECK ((btrim(nombre) <> ''::text)),
    CONSTRAINT arancel_referencias_pagina_pdf_check CHECK ((pagina_pdf > 0))
);


--
-- Name: arancel_referencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arancel_referencias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arancel_referencias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arancel_referencias_id_seq OWNED BY public.arancel_referencias.id;


--
-- Name: arancel_versiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arancel_versiones (
    id bigint NOT NULL,
    fuente text NOT NULL,
    version_documental text NOT NULL,
    moneda character varying(10) NOT NULL,
    vigencia date NOT NULL,
    archivo_nombre text NOT NULL,
    archivo_hash_sha256 character(64) NOT NULL,
    creado_por_usuario_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arancel_versiones_fuente_check CHECK ((btrim(fuente) <> ''::text)),
    CONSTRAINT arancel_versiones_moneda_check CHECK ((btrim((moneda)::text) <> ''::text)),
    CONSTRAINT arancel_versiones_version_documental_check CHECK ((btrim(version_documental) <> ''::text))
);


--
-- Name: arancel_versiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arancel_versiones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arancel_versiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arancel_versiones_id_seq OWNED BY public.arancel_versiones.id;


--
-- Name: archivos_clinicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archivos_clinicos (
    id integer NOT NULL,
    historia_id integer NOT NULL,
    nombre_archivo character varying(255),
    ruta_archivo text NOT NULL,
    tipo character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: archivos_clinicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.archivos_clinicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: archivos_clinicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.archivos_clinicos_id_seq OWNED BY public.archivos_clinicos.id;


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id integer NOT NULL,
    entidad character varying(50),
    entidad_id integer,
    accion character varying(50),
    descripcion text,
    fecha timestamp with time zone DEFAULT now(),
    usuario_id integer,
    recurso text,
    recurso_id text,
    status_code integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;


--
-- Name: cargos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargos (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    turno_id integer,
    prestacion_id integer,
    concepto text NOT NULL,
    importe_total numeric(12,2) NOT NULL,
    fecha_cargo date DEFAULT CURRENT_DATE NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cargos_concepto_no_vacio_check CHECK ((btrim(concepto) <> ''::text)),
    CONSTRAINT cargos_importe_total_positivo_check CHECK ((importe_total > (0)::numeric))
);


--
-- Name: cargos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cargos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cargos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cargos_id_seq OWNED BY public.cargos.id;


--
-- Name: configuracion_consultorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_consultorio (
    id integer NOT NULL,
    nombre_consultorio character varying(150) DEFAULT 'Odonton'::character varying NOT NULL,
    whatsapp_numero character varying(30),
    timezone character varying(80) DEFAULT 'America/Argentina/Buenos_Aires'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    autogestion_keywords text DEFAULT 'turno, turnito, cita, consulta, odontologo, odont?loga, odontologia, odontolog?a'::text NOT NULL
);


--
-- Name: configuracion_consultorio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_consultorio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_consultorio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_consultorio_id_seq OWNED BY public.configuracion_consultorio.id;


--
-- Name: configuracion_horarios_atencion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_horarios_atencion (
    id integer NOT NULL,
    dia_semana integer NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    hora_desde time without time zone,
    hora_hasta time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: configuracion_horarios_atencion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_horarios_atencion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_horarios_atencion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_horarios_atencion_id_seq OWNED BY public.configuracion_horarios_atencion.id;


--
-- Name: configuracion_mensajes_automaticos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_mensajes_automaticos (
    id integer NOT NULL,
    tipo character varying(60) NOT NULL,
    contenido text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: configuracion_mensajes_automaticos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_mensajes_automaticos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_mensajes_automaticos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_mensajes_automaticos_id_seq OWNED BY public.configuracion_mensajes_automaticos.id;


--
-- Name: declaraciones_salud; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.declaraciones_salud (
    id bigint NOT NULL,
    paciente_id integer NOT NULL,
    numero_version integer NOT NULL,
    cuestionario_version character varying(40) NOT NULL,
    respondido_por character varying(10) NOT NULL,
    nombre_tutor character varying(160),
    respuestas jsonb DEFAULT '{}'::jsonb NOT NULL,
    estado character varying(12) NOT NULL,
    cargado_por_usuario_id integer NOT NULL,
    reemplaza_declaracion_id bigint,
    completada_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT declaraciones_salud_check CHECK (((((respondido_por)::text = 'tutor'::text) AND (NULLIF(btrim((nombre_tutor)::text), ''::text) IS NOT NULL)) OR (((respondido_por)::text = 'paciente'::text) AND (nombre_tutor IS NULL)))),
    CONSTRAINT declaraciones_salud_check1 CHECK (((((estado)::text = 'completa'::text) AND (completada_at IS NOT NULL)) OR ((estado)::text = 'incompleta'::text))),
    CONSTRAINT declaraciones_salud_estado_check CHECK (((estado)::text = ANY (ARRAY[('incompleta'::character varying)::text, ('completa'::character varying)::text]))),
    CONSTRAINT declaraciones_salud_respondido_por_check CHECK (((respondido_por)::text = ANY (ARRAY[('paciente'::character varying)::text, ('tutor'::character varying)::text])))
);


--
-- Name: declaraciones_salud_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.declaraciones_salud_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: declaraciones_salud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.declaraciones_salud_id_seq OWNED BY public.declaraciones_salud.id;


--
-- Name: demo_generator_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_generator_runs (
    generator_id text NOT NULL,
    seed integer NOT NULL,
    cutoff_date date NOT NULL,
    status text NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    signatures jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: documentos_paciente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_paciente (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    nombre_archivo text NOT NULL,
    ruta_archivo text NOT NULL,
    tipo_archivo character varying(100) NOT NULL,
    descripcion text,
    fecha_subida timestamp with time zone DEFAULT now() NOT NULL,
    historia_clinica_id integer,
    subido_por_usuario_id integer,
    profesional_perfil_id integer
);


--
-- Name: documentos_paciente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documentos_paciente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documentos_paciente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documentos_paciente_id_seq OWNED BY public.documentos_paciente.id;


--
-- Name: historias_clinicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historias_clinicas (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    turno_id integer,
    descripcion text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    fecha_atencion timestamp with time zone,
    profesional_id integer,
    motivo_consulta text,
    diagnostico text,
    tratamientos_realizados text,
    plan_indicaciones text,
    observaciones text,
    odontograma_snapshot jsonb,
    profesional_perfil_id integer,
    creado_por_usuario_id integer
);


--
-- Name: historias_clinicas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historias_clinicas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historias_clinicas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historias_clinicas_id_seq OWNED BY public.historias_clinicas.id;


--
-- Name: historias_clinicas_revisiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historias_clinicas_revisiones (
    id bigint NOT NULL,
    historia_clinica_id integer NOT NULL,
    actor_id integer NOT NULL,
    corregido_at timestamp with time zone DEFAULT now() NOT NULL,
    antes jsonb NOT NULL,
    despues jsonb NOT NULL
);


--
-- Name: historias_clinicas_revisiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historias_clinicas_revisiones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historias_clinicas_revisiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historias_clinicas_revisiones_id_seq OWNED BY public.historias_clinicas_revisiones.id;


--
-- Name: identidad_roles_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identidad_roles_historial (
    id bigint NOT NULL,
    usuario_id integer NOT NULL,
    rol_anterior_id smallint,
    rol_nuevo_id smallint NOT NULL,
    actor_usuario_id integer NOT NULL,
    accion character varying(50) NOT NULL,
    motivo text NOT NULL,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identidad_roles_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identidad_roles_historial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identidad_roles_historial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identidad_roles_historial_id_seq OWNED BY public.identidad_roles_historial.id;


--
-- Name: odontograma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.odontograma (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    diente smallint NOT NULL,
    cara character varying(20) NOT NULL,
    estado character varying(50) NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    actualizado_por_usuario_id integer,
    profesional_perfil_id integer
);


--
-- Name: odontograma_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.odontograma_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: odontograma_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.odontograma_id_seq OWNED BY public.odontograma.id;


--
-- Name: odontograma_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.odontograma_meta (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    sarro boolean DEFAULT false NOT NULL,
    periodontal boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    observaciones text,
    actualizado_por_usuario_id integer,
    profesional_perfil_id integer
);


--
-- Name: odontograma_meta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.odontograma_meta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: odontograma_meta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.odontograma_meta_id_seq OWNED BY public.odontograma_meta.id;


--
-- Name: odontograma_referencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.odontograma_referencias (
    id integer NOT NULL,
    codigo character varying(50) NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    color character varying(7) NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    heredada boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    alcance character varying(10) DEFAULT 'cara'::character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT odontograma_referencias_alcance_check CHECK (((alcance)::text = ANY (ARRAY[('cara'::character varying)::text, ('pieza'::character varying)::text]))),
    CONSTRAINT odontograma_referencias_codigo_formato CHECK (((codigo)::text ~ '^[a-z0-9_]+$'::text)),
    CONSTRAINT odontograma_referencias_color_formato CHECK (((color)::text ~ '^#[0-9A-Fa-f]{6}$'::text))
);


--
-- Name: odontograma_referencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.odontograma_referencias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: odontograma_referencias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.odontograma_referencias_id_seq OWNED BY public.odontograma_referencias.id;


--
-- Name: pacientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pacientes (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    dni character varying(20) NOT NULL,
    nacionalidad character varying(50),
    domicilio character varying(255),
    telefono character varying(30),
    email character varying(150),
    fecha_nacimiento date,
    observaciones text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    alergias text,
    condiciones text,
    estado_tratamiento text
);


--
-- Name: pacientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pacientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pacientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pacientes_id_seq OWNED BY public.pacientes.id;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id integer NOT NULL,
    cargo_id integer NOT NULL,
    importe numeric(12,2) NOT NULL,
    metodo_pago character varying(30) NOT NULL,
    fecha_pago date DEFAULT CURRENT_DATE NOT NULL,
    observaciones text,
    estado character varying(10) DEFAULT 'activo'::character varying NOT NULL,
    fecha_anulacion timestamp with time zone,
    motivo_anulacion text,
    anulado_por_usuario_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pagos_anulacion_coherente_check CHECK (((((estado)::text = 'activo'::text) AND (fecha_anulacion IS NULL) AND (motivo_anulacion IS NULL) AND (anulado_por_usuario_id IS NULL)) OR (((estado)::text = 'anulado'::text) AND (fecha_anulacion IS NOT NULL) AND (motivo_anulacion IS NOT NULL) AND (btrim(motivo_anulacion) <> ''::text) AND (anulado_por_usuario_id IS NOT NULL)))),
    CONSTRAINT pagos_estado_check CHECK (((estado)::text = ANY (ARRAY[('activo'::character varying)::text, ('anulado'::character varying)::text]))),
    CONSTRAINT pagos_importe_positivo_check CHECK ((importe > (0)::numeric)),
    CONSTRAINT pagos_metodo_pago_check CHECK (((metodo_pago)::text = ANY (ARRAY[('efectivo'::character varying)::text, ('tarjeta'::character varying)::text, ('transferencia'::character varying)::text])))
);


--
-- Name: pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_id_seq OWNED BY public.pagos.id;


--
-- Name: prestacion_arancel_referencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestacion_arancel_referencias (
    prestacion_id integer NOT NULL,
    referencia_id bigint NOT NULL,
    vinculado_por_usuario_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prestaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestaciones (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    duracion_minutos integer,
    precio_base numeric(10,2),
    activa boolean DEFAULT true,
    activo boolean DEFAULT true,
    updated_at timestamp with time zone,
    codigo text,
    categoria text,
    precio_modalidad character varying(20),
    precio_inicial_referencia_id bigint,
    CONSTRAINT prestaciones_duracion_minutos_check CHECK ((duracion_minutos > 0)),
    CONSTRAINT prestaciones_precio_consistencia_check CHECK (((precio_modalidad IS NULL) OR (((precio_modalidad)::text = 'fijo'::text) AND (precio_base > (0)::numeric)) OR (((precio_modalidad)::text = ANY (ARRAY[('a_convenir'::character varying)::text, ('sin_definir'::character varying)::text])) AND (precio_base IS NULL)))),
    CONSTRAINT prestaciones_precio_modalidad_check CHECK (((precio_modalidad IS NULL) OR ((precio_modalidad)::text = ANY (ARRAY[('fijo'::character varying)::text, ('a_convenir'::character varying)::text, ('sin_definir'::character varying)::text]))))
);


--
-- Name: prestaciones_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestaciones_historial (
    id bigint NOT NULL,
    prestacion_id integer NOT NULL,
    usuario_id integer,
    accion character varying(30) NOT NULL,
    valores_anteriores jsonb,
    valores_nuevos jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prestaciones_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prestaciones_historial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prestaciones_historial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prestaciones_historial_id_seq OWNED BY public.prestaciones_historial.id;


--
-- Name: prestaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prestaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prestaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prestaciones_id_seq OWNED BY public.prestaciones.id;


--
-- Name: profesionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profesionales (
    id integer NOT NULL,
    usuario_id integer,
    usuario_legacy_id integer,
    nombre_mostrado character varying(150) NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    es_ficticio boolean DEFAULT false NOT NULL,
    compatibilidad_pendiente boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vinculo_confirmado_at timestamp with time zone,
    vinculo_confirmado_por_usuario_id integer,
    vinculo_origen character varying(40),
    CONSTRAINT profesionales_nombre_no_vacio CHECK ((btrim((nombre_mostrado)::text) <> ''::text)),
    CONSTRAINT profesionales_vinculo_confirmacion_coherente CHECK ((((vinculo_confirmado_at IS NULL) AND (vinculo_confirmado_por_usuario_id IS NULL) AND (vinculo_origen IS NULL)) OR ((vinculo_confirmado_at IS NOT NULL) AND (vinculo_confirmado_por_usuario_id IS NOT NULL) AND (vinculo_origen IS NOT NULL) AND (btrim((vinculo_origen)::text) <> ''::text))))
);


--
-- Name: COLUMN profesionales.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profesionales.usuario_id IS 'Cuenta habilitada para operar como este profesional; puede ser NULL para identidades hist?ricas.';


--
-- Name: COLUMN profesionales.usuario_legacy_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profesionales.usuario_legacy_id IS 'Referencia t?cnica al usuario que ocupaba profesional_id antes de separar cuenta y perfil.';


--
-- Name: COLUMN profesionales.compatibilidad_pendiente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profesionales.compatibilidad_pendiente IS 'Identidad hist?rica preservada sin atribuci?n profesional verificada.';


--
-- Name: profesionales_horarios_atencion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profesionales_horarios_atencion (
    id integer NOT NULL,
    profesional_id integer NOT NULL,
    dia_semana integer NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    hora_desde time without time zone,
    hora_hasta time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profesional_perfil_id integer
);


--
-- Name: profesionales_horarios_atencion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profesionales_horarios_atencion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profesionales_horarios_atencion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profesionales_horarios_atencion_id_seq OWNED BY public.profesionales_horarios_atencion.id;


--
-- Name: profesionales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.profesionales ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.profesionales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: protesis_fijas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protesis_fijas (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    tipo character varying(50) NOT NULL,
    dientes smallint[] NOT NULL,
    descripcion text,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    registrado_por_usuario_id integer,
    profesional_perfil_id integer
);


--
-- Name: protesis_fijas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.protesis_fijas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: protesis_fijas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.protesis_fijas_id_seq OWNED BY public.protesis_fijas.id;


--
-- Name: protesis_removibles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protesis_removibles (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    tipo character varying(50) NOT NULL,
    arcada character varying(20) NOT NULL,
    descripcion text,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    registrado_por_usuario_id integer,
    profesional_perfil_id integer
);


--
-- Name: protesis_removibles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.protesis_removibles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: protesis_removibles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.protesis_removibles_id_seq OWNED BY public.protesis_removibles.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    codigo character varying(30) NOT NULL,
    nombre character varying(60) NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: tratamientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tratamientos (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    diente smallint NOT NULL,
    tipo character varying(50) NOT NULL,
    observaciones text,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    registrado_por_usuario_id integer,
    profesional_perfil_id integer
);


--
-- Name: tratamientos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tratamientos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tratamientos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tratamientos_id_seq OWNED BY public.tratamientos.id;


--
-- Name: turno_prestaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turno_prestaciones (
    id bigint NOT NULL,
    turno_id integer NOT NULL,
    prestacion_id integer NOT NULL,
    orden integer NOT NULL,
    nombre_snapshot character varying(100) NOT NULL,
    duracion_minutos_snapshot integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turno_prestaciones_duracion_minutos_snapshot_check CHECK ((duracion_minutos_snapshot > 0)),
    CONSTRAINT turno_prestaciones_orden_check CHECK ((orden > 0))
);


--
-- Name: turno_prestaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turno_prestaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turno_prestaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turno_prestaciones_id_seq OWNED BY public.turno_prestaciones.id;


--
-- Name: turno_solicitudes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turno_solicitudes (
    id bigint NOT NULL,
    tipo_solicitud character varying(40) NOT NULL,
    estado character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    paciente_id integer,
    nombre_apellido text,
    dni character varying(20) NOT NULL,
    telefono character varying(30) NOT NULL,
    motivo text,
    preferencia_horaria text,
    turno_id integer,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: turno_solicitudes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turno_solicitudes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turno_solicitudes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turno_solicitudes_id_seq OWNED BY public.turno_solicitudes.id;


--
-- Name: turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    prestacion_id integer,
    fecha_hora_inicio timestamp with time zone,
    fecha_hora_fin timestamp with time zone,
    estado character varying(30) DEFAULT 'programado'::character varying NOT NULL,
    origen character varying(30) DEFAULT 'interno'::character varying NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fecha_cancelacion timestamp with time zone,
    recordatorio_procesado_at timestamp with time zone,
    recordatorio_enviado_at timestamp with time zone,
    recordatorio_estado text,
    recordatorio_error text,
    respuesta_paciente text,
    respuesta_paciente_at timestamp with time zone,
    reprogramacion_token text,
    reprogramacion_token_expira_at timestamp with time zone,
    profesional_id integer,
    solicitud_preferencia text,
    solicitud_confirmada_at timestamp with time zone,
    solicitud_rechazada_at timestamp with time zone,
    recordatorio_habilitado boolean DEFAULT true NOT NULL,
    profesional_perfil_id integer,
    creado_por_usuario_id integer,
    actualizado_por_usuario_id integer,
    CONSTRAINT chk_fechas_turno CHECK ((fecha_hora_fin > fecha_hora_inicio))
);


--
-- Name: COLUMN turnos.prestacion_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.turnos.prestacion_id IS 'Compatibilidad: debe coincidir con prestacion_id de turno_prestaciones donde orden=1.';


--
-- Name: turnos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turnos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turnos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turnos_id_seq OWNED BY public.turnos.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password_hash text NOT NULL,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    puede_cobrar boolean DEFAULT false NOT NULL,
    debe_cambiar_password boolean DEFAULT false NOT NULL,
    es_demo boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    password_changed_at timestamp with time zone
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    usuario_id integer NOT NULL,
    rol_id smallint NOT NULL,
    asignado_at timestamp with time zone DEFAULT now() NOT NULL,
    asignado_por_usuario_id integer
);


--
-- Name: usuarios_roles_vigentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles_vigentes (
    usuario_id integer NOT NULL,
    rol_id smallint NOT NULL,
    asignado_at timestamp with time zone DEFAULT now() NOT NULL,
    asignado_por_usuario_id integer NOT NULL,
    motivo text NOT NULL,
    CONSTRAINT usuarios_roles_vigentes_motivo_check CHECK ((btrim(motivo) <> ''::text))
);


--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_conversations (
    id bigint NOT NULL,
    phone character varying(30) NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    step character varying(80) NOT NULL,
    paciente_id integer,
    prestacion_id integer,
    profesional_id integer,
    turno_id integer,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.whatsapp_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: whatsapp_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.whatsapp_conversations_id_seq OWNED BY public.whatsapp_conversations.id;


--
-- Name: whatsapp_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_reminders (
    id integer NOT NULL,
    appointment_id integer NOT NULL,
    patient_id integer,
    phone character varying(30) NOT NULL,
    status character varying(50) DEFAULT 'pending_response'::character varying NOT NULL,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp without time zone,
    response_text text,
    channel character varying(30) DEFAULT 'whatsapp'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: whatsapp_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.whatsapp_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: whatsapp_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.whatsapp_reminders_id_seq OWNED BY public.whatsapp_reminders.id;


--
-- Name: arancel_auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_auditoria ALTER COLUMN id SET DEFAULT nextval('public.arancel_auditoria_id_seq'::regclass);


--
-- Name: arancel_referencias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_referencias ALTER COLUMN id SET DEFAULT nextval('public.arancel_referencias_id_seq'::regclass);


--
-- Name: arancel_versiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_versiones ALTER COLUMN id SET DEFAULT nextval('public.arancel_versiones_id_seq'::regclass);


--
-- Name: archivos_clinicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos_clinicos ALTER COLUMN id SET DEFAULT nextval('public.archivos_clinicos_id_seq'::regclass);


--
-- Name: auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria ALTER COLUMN id SET DEFAULT nextval('public.auditoria_id_seq'::regclass);


--
-- Name: cargos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos ALTER COLUMN id SET DEFAULT nextval('public.cargos_id_seq'::regclass);


--
-- Name: configuracion_consultorio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_consultorio ALTER COLUMN id SET DEFAULT nextval('public.configuracion_consultorio_id_seq'::regclass);


--
-- Name: configuracion_horarios_atencion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_horarios_atencion ALTER COLUMN id SET DEFAULT nextval('public.configuracion_horarios_atencion_id_seq'::regclass);


--
-- Name: configuracion_mensajes_automaticos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_mensajes_automaticos ALTER COLUMN id SET DEFAULT nextval('public.configuracion_mensajes_automaticos_id_seq'::regclass);


--
-- Name: declaraciones_salud id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_salud ALTER COLUMN id SET DEFAULT nextval('public.declaraciones_salud_id_seq'::regclass);


--
-- Name: documentos_paciente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente ALTER COLUMN id SET DEFAULT nextval('public.documentos_paciente_id_seq'::regclass);


--
-- Name: historias_clinicas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas ALTER COLUMN id SET DEFAULT nextval('public.historias_clinicas_id_seq'::regclass);


--
-- Name: historias_clinicas_revisiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas_revisiones ALTER COLUMN id SET DEFAULT nextval('public.historias_clinicas_revisiones_id_seq'::regclass);


--
-- Name: identidad_roles_historial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidad_roles_historial ALTER COLUMN id SET DEFAULT nextval('public.identidad_roles_historial_id_seq'::regclass);


--
-- Name: odontograma id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma ALTER COLUMN id SET DEFAULT nextval('public.odontograma_id_seq'::regclass);


--
-- Name: odontograma_meta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta ALTER COLUMN id SET DEFAULT nextval('public.odontograma_meta_id_seq'::regclass);


--
-- Name: odontograma_referencias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_referencias ALTER COLUMN id SET DEFAULT nextval('public.odontograma_referencias_id_seq'::regclass);


--
-- Name: pacientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes ALTER COLUMN id SET DEFAULT nextval('public.pacientes_id_seq'::regclass);


--
-- Name: pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id SET DEFAULT nextval('public.pagos_id_seq'::regclass);


--
-- Name: prestaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones ALTER COLUMN id SET DEFAULT nextval('public.prestaciones_id_seq'::regclass);


--
-- Name: prestaciones_historial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones_historial ALTER COLUMN id SET DEFAULT nextval('public.prestaciones_historial_id_seq'::regclass);


--
-- Name: profesionales_horarios_atencion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales_horarios_atencion ALTER COLUMN id SET DEFAULT nextval('public.profesionales_horarios_atencion_id_seq'::regclass);


--
-- Name: protesis_fijas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_fijas ALTER COLUMN id SET DEFAULT nextval('public.protesis_fijas_id_seq'::regclass);


--
-- Name: protesis_removibles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_removibles ALTER COLUMN id SET DEFAULT nextval('public.protesis_removibles_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: tratamientos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos ALTER COLUMN id SET DEFAULT nextval('public.tratamientos_id_seq'::regclass);


--
-- Name: turno_prestaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_prestaciones ALTER COLUMN id SET DEFAULT nextval('public.turno_prestaciones_id_seq'::regclass);


--
-- Name: turno_solicitudes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_solicitudes ALTER COLUMN id SET DEFAULT nextval('public.turno_solicitudes_id_seq'::regclass);


--
-- Name: turnos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos ALTER COLUMN id SET DEFAULT nextval('public.turnos_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: whatsapp_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_conversations_id_seq'::regclass);


--
-- Name: whatsapp_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_reminders ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_reminders_id_seq'::regclass);


--
-- Name: arancel_auditoria arancel_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_auditoria
    ADD CONSTRAINT arancel_auditoria_pkey PRIMARY KEY (id);


--
-- Name: arancel_referencias arancel_referencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_referencias
    ADD CONSTRAINT arancel_referencias_pkey PRIMARY KEY (id);


--
-- Name: arancel_referencias arancel_referencias_version_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_referencias
    ADD CONSTRAINT arancel_referencias_version_id_codigo_key UNIQUE (version_id, codigo);


--
-- Name: arancel_referencias arancel_referencias_version_id_fila_csv_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_referencias
    ADD CONSTRAINT arancel_referencias_version_id_fila_csv_key UNIQUE (version_id, fila_csv);


--
-- Name: arancel_versiones arancel_versiones_archivo_hash_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_versiones
    ADD CONSTRAINT arancel_versiones_archivo_hash_sha256_key UNIQUE (archivo_hash_sha256);


--
-- Name: arancel_versiones arancel_versiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_versiones
    ADD CONSTRAINT arancel_versiones_pkey PRIMARY KEY (id);


--
-- Name: archivos_clinicos archivos_clinicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos_clinicos
    ADD CONSTRAINT archivos_clinicos_pkey PRIMARY KEY (id);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: cargos cargos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT cargos_pkey PRIMARY KEY (id);


--
-- Name: configuracion_consultorio configuracion_consultorio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_consultorio
    ADD CONSTRAINT configuracion_consultorio_pkey PRIMARY KEY (id);


--
-- Name: configuracion_horarios_atencion configuracion_horarios_atencion_dia_semana_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_horarios_atencion
    ADD CONSTRAINT configuracion_horarios_atencion_dia_semana_key UNIQUE (dia_semana);


--
-- Name: configuracion_horarios_atencion configuracion_horarios_atencion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_horarios_atencion
    ADD CONSTRAINT configuracion_horarios_atencion_pkey PRIMARY KEY (id);


--
-- Name: configuracion_mensajes_automaticos configuracion_mensajes_automaticos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_mensajes_automaticos
    ADD CONSTRAINT configuracion_mensajes_automaticos_pkey PRIMARY KEY (id);


--
-- Name: configuracion_mensajes_automaticos configuracion_mensajes_automaticos_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_mensajes_automaticos
    ADD CONSTRAINT configuracion_mensajes_automaticos_tipo_key UNIQUE (tipo);


--
-- Name: declaraciones_salud declaraciones_salud_paciente_id_numero_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_salud
    ADD CONSTRAINT declaraciones_salud_paciente_id_numero_version_key UNIQUE (paciente_id, numero_version);


--
-- Name: declaraciones_salud declaraciones_salud_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_salud
    ADD CONSTRAINT declaraciones_salud_pkey PRIMARY KEY (id);


--
-- Name: demo_generator_runs demo_generator_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_generator_runs
    ADD CONSTRAINT demo_generator_runs_pkey PRIMARY KEY (generator_id);


--
-- Name: documentos_paciente documentos_paciente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_paciente_pkey PRIMARY KEY (id);


--
-- Name: historias_clinicas historias_clinicas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas
    ADD CONSTRAINT historias_clinicas_pkey PRIMARY KEY (id);


--
-- Name: historias_clinicas_revisiones historias_clinicas_revisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas_revisiones
    ADD CONSTRAINT historias_clinicas_revisiones_pkey PRIMARY KEY (id);


--
-- Name: identidad_roles_historial identidad_roles_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidad_roles_historial
    ADD CONSTRAINT identidad_roles_historial_pkey PRIMARY KEY (id);


--
-- Name: odontograma_meta odontograma_meta_paciente_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta
    ADD CONSTRAINT odontograma_meta_paciente_id_key UNIQUE (paciente_id);


--
-- Name: odontograma_meta odontograma_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta
    ADD CONSTRAINT odontograma_meta_pkey PRIMARY KEY (id);


--
-- Name: odontograma odontograma_paciente_id_diente_cara_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma
    ADD CONSTRAINT odontograma_paciente_id_diente_cara_key UNIQUE (paciente_id, diente, cara);


--
-- Name: odontograma odontograma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma
    ADD CONSTRAINT odontograma_pkey PRIMARY KEY (id);


--
-- Name: odontograma_referencias odontograma_referencias_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_referencias
    ADD CONSTRAINT odontograma_referencias_codigo_key UNIQUE (codigo);


--
-- Name: odontograma_referencias odontograma_referencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_referencias
    ADD CONSTRAINT odontograma_referencias_pkey PRIMARY KEY (id);


--
-- Name: pacientes pacientes_dni_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_dni_key UNIQUE (dni);


--
-- Name: pacientes pacientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: prestacion_arancel_referencias prestacion_arancel_referencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestacion_arancel_referencias
    ADD CONSTRAINT prestacion_arancel_referencias_pkey PRIMARY KEY (prestacion_id, referencia_id);


--
-- Name: prestacion_arancel_referencias prestacion_arancel_referencias_referencia_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestacion_arancel_referencias
    ADD CONSTRAINT prestacion_arancel_referencias_referencia_id_key UNIQUE (referencia_id);


--
-- Name: prestaciones_historial prestaciones_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones_historial
    ADD CONSTRAINT prestaciones_historial_pkey PRIMARY KEY (id);


--
-- Name: prestaciones prestaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones
    ADD CONSTRAINT prestaciones_pkey PRIMARY KEY (id);


--
-- Name: profesionales_horarios_atencion profesionales_horarios_atencion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales_horarios_atencion
    ADD CONSTRAINT profesionales_horarios_atencion_pkey PRIMARY KEY (id);


--
-- Name: profesionales_horarios_atencion profesionales_horarios_atencion_profesional_id_dia_semana_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales_horarios_atencion
    ADD CONSTRAINT profesionales_horarios_atencion_profesional_id_dia_semana_key UNIQUE (profesional_id, dia_semana);


--
-- Name: profesionales profesionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_pkey PRIMARY KEY (id);


--
-- Name: profesionales profesionales_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_usuario_id_key UNIQUE (usuario_id);


--
-- Name: profesionales profesionales_usuario_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_usuario_legacy_id_key UNIQUE (usuario_legacy_id);


--
-- Name: protesis_fijas protesis_fijas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_fijas
    ADD CONSTRAINT protesis_fijas_pkey PRIMARY KEY (id);


--
-- Name: protesis_removibles protesis_removibles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_removibles
    ADD CONSTRAINT protesis_removibles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_codigo_key UNIQUE (codigo);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: tratamientos tratamientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos
    ADD CONSTRAINT tratamientos_pkey PRIMARY KEY (id);


--
-- Name: turno_prestaciones turno_prestaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_prestaciones
    ADD CONSTRAINT turno_prestaciones_pkey PRIMARY KEY (id);


--
-- Name: turno_prestaciones turno_prestaciones_turno_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_prestaciones
    ADD CONSTRAINT turno_prestaciones_turno_id_orden_key UNIQUE (turno_id, orden);


--
-- Name: turno_prestaciones turno_prestaciones_turno_id_prestacion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_prestaciones
    ADD CONSTRAINT turno_prestaciones_turno_id_prestacion_id_key UNIQUE (turno_id, prestacion_id);


--
-- Name: turno_solicitudes turno_solicitudes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_solicitudes
    ADD CONSTRAINT turno_solicitudes_pkey PRIMARY KEY (id);


--
-- Name: turnos turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_pkey PRIMARY KEY (id);


--
-- Name: pacientes uq_pacientes_dni; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT uq_pacientes_dni UNIQUE (dni);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles usuarios_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_pkey PRIMARY KEY (usuario_id, rol_id);


--
-- Name: usuarios_roles_vigentes usuarios_roles_vigentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles_vigentes
    ADD CONSTRAINT usuarios_roles_vigentes_pkey PRIMARY KEY (usuario_id);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_reminders whatsapp_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_reminders
    ADD CONSTRAINT whatsapp_reminders_pkey PRIMARY KEY (id);


--
-- Name: arancel_referencias_codigo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arancel_referencias_codigo_idx ON public.arancel_referencias USING btree (codigo);


--
-- Name: arancel_versiones_fuente_vigencia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arancel_versiones_fuente_vigencia_idx ON public.arancel_versiones USING btree (lower(fuente), vigencia DESC, id DESC);


--
-- Name: idx_cargos_paciente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cargos_paciente_fecha ON public.cargos USING btree (paciente_id, fecha_cargo DESC);


--
-- Name: idx_cargos_prestacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cargos_prestacion ON public.cargos USING btree (prestacion_id) WHERE (prestacion_id IS NOT NULL);


--
-- Name: idx_cargos_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cargos_turno ON public.cargos USING btree (turno_id) WHERE (turno_id IS NOT NULL);


--
-- Name: idx_declaraciones_salud_paciente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_declaraciones_salud_paciente_fecha ON public.declaraciones_salud USING btree (paciente_id, created_at DESC, id DESC);


--
-- Name: idx_documentos_historia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_historia ON public.documentos_paciente USING btree (historia_clinica_id);


--
-- Name: idx_documentos_paciente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_paciente_fecha ON public.documentos_paciente USING btree (fecha_subida DESC);


--
-- Name: idx_documentos_paciente_historia_clinica; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_paciente_historia_clinica ON public.documentos_paciente USING btree (historia_clinica_id, fecha_subida DESC);


--
-- Name: idx_documentos_paciente_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_paciente_paciente_id ON public.documentos_paciente USING btree (paciente_id);


--
-- Name: idx_historia_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historia_paciente ON public.historias_clinicas USING btree (paciente_id);


--
-- Name: idx_historia_revisiones; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historia_revisiones ON public.historias_clinicas_revisiones USING btree (historia_clinica_id, corregido_at DESC, id DESC);


--
-- Name: idx_historias_paciente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historias_paciente_fecha ON public.historias_clinicas USING btree (paciente_id, fecha_atencion DESC, id DESC);


--
-- Name: idx_historias_profesional_perfil_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historias_profesional_perfil_fecha ON public.historias_clinicas USING btree (profesional_perfil_id, fecha_atencion DESC, id DESC);


--
-- Name: idx_horarios_profesional_perfil; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_horarios_profesional_perfil ON public.profesionales_horarios_atencion USING btree (profesional_perfil_id, dia_semana);


--
-- Name: idx_pacientes_apellido_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_apellido_nombre ON public.pacientes USING btree (apellido, nombre);


--
-- Name: idx_pacientes_apellido_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_apellido_trgm ON public.pacientes USING gin (apellido public.gin_trgm_ops);


--
-- Name: idx_pacientes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_created_at ON public.pacientes USING btree (created_at);


--
-- Name: idx_pacientes_dni_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pacientes_dni_unique ON public.pacientes USING btree (dni);


--
-- Name: idx_pacientes_nombre_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_nombre_trgm ON public.pacientes USING gin (nombre public.gin_trgm_ops);


--
-- Name: idx_pagos_cargo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_cargo ON public.pagos USING btree (cargo_id);


--
-- Name: idx_pagos_cargo_activos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_cargo_activos ON public.pagos USING btree (cargo_id) WHERE ((estado)::text = 'activo'::text);


--
-- Name: idx_pagos_fecha_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_fecha_estado ON public.pagos USING btree (fecha_pago DESC, estado);


--
-- Name: idx_tratamientos_paciente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tratamientos_paciente_fecha ON public.tratamientos USING btree (paciente_id, fecha DESC);


--
-- Name: idx_turno_prestaciones_prestacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turno_prestaciones_prestacion ON public.turno_prestaciones USING btree (prestacion_id);


--
-- Name: idx_turno_solicitudes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turno_solicitudes_estado ON public.turno_solicitudes USING btree (estado);


--
-- Name: idx_turno_solicitudes_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turno_solicitudes_paciente ON public.turno_solicitudes USING btree (paciente_id);


--
-- Name: idx_turno_solicitudes_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turno_solicitudes_turno ON public.turno_solicitudes USING btree (turno_id);


--
-- Name: idx_turnos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_estado ON public.turnos USING btree (estado);


--
-- Name: idx_turnos_fecha_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_fecha_inicio ON public.turnos USING btree (fecha_hora_inicio);


--
-- Name: idx_turnos_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_paciente ON public.turnos USING btree (paciente_id);


--
-- Name: idx_turnos_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_paciente_id ON public.turnos USING btree (paciente_id);


--
-- Name: idx_turnos_perfil_intervalo_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_perfil_intervalo_activo ON public.turnos USING btree (profesional_perfil_id, fecha_hora_inicio, fecha_hora_fin) WHERE ((estado)::text = ANY (ARRAY[('programado'::character varying)::text, ('reprogramado'::character varying)::text, ('confirmado'::character varying)::text]));


--
-- Name: idx_turnos_profesional_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_profesional_inicio ON public.turnos USING btree (profesional_id, fecha_hora_inicio);


--
-- Name: idx_turnos_profesional_perfil_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_profesional_perfil_inicio ON public.turnos USING btree (profesional_perfil_id, fecha_hora_inicio);


--
-- Name: idx_whatsapp_conversations_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_expires ON public.whatsapp_conversations USING btree (expires_at);


--
-- Name: idx_whatsapp_conversations_phone_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_phone_status ON public.whatsapp_conversations USING btree (phone, status);


--
-- Name: odontograma_referencias_nombre_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX odontograma_referencias_nombre_unique ON public.odontograma_referencias USING btree (lower((nombre)::text));


--
-- Name: prestacion_arancel_prestacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prestacion_arancel_prestacion_idx ON public.prestacion_arancel_referencias USING btree (prestacion_id);


--
-- Name: prestaciones_codigo_unico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prestaciones_codigo_unico_idx ON public.prestaciones USING btree (lower(btrim(codigo))) WHERE ((codigo IS NOT NULL) AND (btrim(codigo) <> ''::text));


--
-- Name: prestaciones_duracion_pendiente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prestaciones_duracion_pendiente_idx ON public.prestaciones USING btree (id) WHERE (duracion_minutos IS NULL);


--
-- Name: prestaciones_historial_prestacion_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prestaciones_historial_prestacion_fecha_idx ON public.prestaciones_historial USING btree (prestacion_id, created_at DESC);


--
-- Name: profesionales_horarios_perfil_dia_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profesionales_horarios_perfil_dia_unique ON public.profesionales_horarios_atencion USING btree (profesional_perfil_id, dia_semana) WHERE (profesional_perfil_id IS NOT NULL);


--
-- Name: uq_historias_clinicas_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_historias_clinicas_turno ON public.historias_clinicas USING btree (turno_id) WHERE (turno_id IS NOT NULL);


--
-- Name: uq_odontograma_referencias_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_odontograma_referencias_nombre ON public.odontograma_referencias USING btree (lower((nombre)::text));


--
-- Name: turnos trg_set_timestamps_and_cancellation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_timestamps_and_cancellation BEFORE UPDATE ON public.turnos FOR EACH ROW EXECUTE FUNCTION public.trg_turnos_set_timestamps_and_cancellation();


--
-- Name: turnos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.turnos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: turnos trg_turnos_impedir_solapamiento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_turnos_impedir_solapamiento BEFORE INSERT OR UPDATE OF profesional_perfil_id, fecha_hora_inicio, fecha_hora_fin, estado ON public.turnos FOR EACH ROW EXECUTE FUNCTION public.impedir_solapamiento_agenda();


--
-- Name: usuarios trg_usuarios_administrador_activo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_usuarios_administrador_activo AFTER DELETE OR UPDATE ON public.usuarios DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.asegurar_administrador_activo();


--
-- Name: usuarios_roles trg_usuarios_roles_administrador_activo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_usuarios_roles_administrador_activo AFTER INSERT OR DELETE OR UPDATE ON public.usuarios_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.asegurar_administrador_activo();


--
-- Name: arancel_auditoria arancel_auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_auditoria
    ADD CONSTRAINT arancel_auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: arancel_auditoria arancel_auditoria_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_auditoria
    ADD CONSTRAINT arancel_auditoria_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.arancel_versiones(id) ON DELETE RESTRICT;


--
-- Name: arancel_referencias arancel_referencias_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_referencias
    ADD CONSTRAINT arancel_referencias_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.arancel_versiones(id) ON DELETE RESTRICT;


--
-- Name: arancel_versiones arancel_versiones_creado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arancel_versiones
    ADD CONSTRAINT arancel_versiones_creado_por_usuario_id_fkey FOREIGN KEY (creado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: declaraciones_salud declaraciones_salud_cargado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_salud
    ADD CONSTRAINT declaraciones_salud_cargado_por_usuario_id_fkey FOREIGN KEY (cargado_por_usuario_id) REFERENCES public.usuarios(id);


--
-- Name: declaraciones_salud declaraciones_salud_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_salud
    ADD CONSTRAINT declaraciones_salud_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: declaraciones_salud declaraciones_salud_reemplaza_declaracion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_salud
    ADD CONSTRAINT declaraciones_salud_reemplaza_declaracion_id_fkey FOREIGN KEY (reemplaza_declaracion_id) REFERENCES public.declaraciones_salud(id);


--
-- Name: documentos_paciente documentos_paciente_historia_clinica_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_paciente_historia_clinica_fk FOREIGN KEY (historia_clinica_id) REFERENCES public.historias_clinicas(id) ON DELETE SET NULL;


--
-- Name: documentos_paciente documentos_paciente_historia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_paciente_historia_fkey FOREIGN KEY (historia_clinica_id) REFERENCES public.historias_clinicas(id) ON DELETE SET NULL;


--
-- Name: documentos_paciente documentos_paciente_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_paciente_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: documentos_paciente documentos_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: documentos_paciente documentos_subido_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_subido_por_usuario_fkey FOREIGN KEY (subido_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: archivos_clinicos fk_archivo_historia; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos_clinicos
    ADD CONSTRAINT fk_archivo_historia FOREIGN KEY (historia_id) REFERENCES public.historias_clinicas(id) ON DELETE CASCADE;


--
-- Name: cargos fk_cargo_paciente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT fk_cargo_paciente FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT;


--
-- Name: cargos fk_cargo_prestacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT fk_cargo_prestacion FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE SET NULL;


--
-- Name: cargos fk_cargo_turno; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT fk_cargo_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE SET NULL;


--
-- Name: historias_clinicas fk_historia_paciente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas
    ADD CONSTRAINT fk_historia_paciente FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT;


--
-- Name: historias_clinicas fk_historia_turno; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas
    ADD CONSTRAINT fk_historia_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE SET NULL;


--
-- Name: pagos fk_pago_anulado_por_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT fk_pago_anulado_por_usuario FOREIGN KEY (anulado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: pagos fk_pago_cargo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT fk_pago_cargo FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE RESTRICT;


--
-- Name: turnos fk_turno_paciente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT fk_turno_paciente FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT;


--
-- Name: turnos fk_turno_prestacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT fk_turno_prestacion FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE RESTRICT;


--
-- Name: historias_clinicas historias_clinicas_profesional_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas
    ADD CONSTRAINT historias_clinicas_profesional_fkey FOREIGN KEY (profesional_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: historias_clinicas_revisiones historias_clinicas_revisiones_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas_revisiones
    ADD CONSTRAINT historias_clinicas_revisiones_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: historias_clinicas_revisiones historias_clinicas_revisiones_historia_clinica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas_revisiones
    ADD CONSTRAINT historias_clinicas_revisiones_historia_clinica_id_fkey FOREIGN KEY (historia_clinica_id) REFERENCES public.historias_clinicas(id) ON DELETE RESTRICT;


--
-- Name: historias_clinicas historias_creado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas
    ADD CONSTRAINT historias_creado_por_usuario_fkey FOREIGN KEY (creado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: historias_clinicas historias_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas
    ADD CONSTRAINT historias_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: profesionales_horarios_atencion horarios_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales_horarios_atencion
    ADD CONSTRAINT horarios_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: identidad_roles_historial identidad_roles_historial_actor_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidad_roles_historial
    ADD CONSTRAINT identidad_roles_historial_actor_usuario_id_fkey FOREIGN KEY (actor_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: identidad_roles_historial identidad_roles_historial_rol_anterior_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidad_roles_historial
    ADD CONSTRAINT identidad_roles_historial_rol_anterior_id_fkey FOREIGN KEY (rol_anterior_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: identidad_roles_historial identidad_roles_historial_rol_nuevo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidad_roles_historial
    ADD CONSTRAINT identidad_roles_historial_rol_nuevo_id_fkey FOREIGN KEY (rol_nuevo_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: identidad_roles_historial identidad_roles_historial_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidad_roles_historial
    ADD CONSTRAINT identidad_roles_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: odontograma odontograma_actualizado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma
    ADD CONSTRAINT odontograma_actualizado_por_usuario_fkey FOREIGN KEY (actualizado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: odontograma_meta odontograma_meta_actualizado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta
    ADD CONSTRAINT odontograma_meta_actualizado_por_usuario_fkey FOREIGN KEY (actualizado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: odontograma_meta odontograma_meta_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta
    ADD CONSTRAINT odontograma_meta_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: odontograma_meta odontograma_meta_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta
    ADD CONSTRAINT odontograma_meta_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: odontograma odontograma_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma
    ADD CONSTRAINT odontograma_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: odontograma odontograma_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma
    ADD CONSTRAINT odontograma_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: prestacion_arancel_referencias prestacion_arancel_referencias_prestacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestacion_arancel_referencias
    ADD CONSTRAINT prestacion_arancel_referencias_prestacion_id_fkey FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE RESTRICT;


--
-- Name: prestacion_arancel_referencias prestacion_arancel_referencias_referencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestacion_arancel_referencias
    ADD CONSTRAINT prestacion_arancel_referencias_referencia_id_fkey FOREIGN KEY (referencia_id) REFERENCES public.arancel_referencias(id) ON DELETE RESTRICT;


--
-- Name: prestacion_arancel_referencias prestacion_arancel_referencias_vinculado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestacion_arancel_referencias
    ADD CONSTRAINT prestacion_arancel_referencias_vinculado_por_usuario_id_fkey FOREIGN KEY (vinculado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: prestaciones_historial prestaciones_historial_prestacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones_historial
    ADD CONSTRAINT prestaciones_historial_prestacion_id_fkey FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE RESTRICT;


--
-- Name: prestaciones_historial prestaciones_historial_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones_historial
    ADD CONSTRAINT prestaciones_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: prestaciones prestaciones_precio_inicial_referencia_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestaciones
    ADD CONSTRAINT prestaciones_precio_inicial_referencia_fk FOREIGN KEY (precio_inicial_referencia_id) REFERENCES public.arancel_referencias(id) ON DELETE RESTRICT;


--
-- Name: profesionales profesionales_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: profesionales profesionales_usuario_legacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_usuario_legacy_id_fkey FOREIGN KEY (usuario_legacy_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: profesionales profesionales_vinculo_confirmado_por_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_vinculo_confirmado_por_fk FOREIGN KEY (vinculo_confirmado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: protesis_fijas protesis_fijas_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_fijas
    ADD CONSTRAINT protesis_fijas_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: protesis_fijas protesis_fijas_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_fijas
    ADD CONSTRAINT protesis_fijas_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: protesis_fijas protesis_fijas_registrado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_fijas
    ADD CONSTRAINT protesis_fijas_registrado_por_usuario_fkey FOREIGN KEY (registrado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: protesis_removibles protesis_removibles_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_removibles
    ADD CONSTRAINT protesis_removibles_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: protesis_removibles protesis_removibles_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_removibles
    ADD CONSTRAINT protesis_removibles_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: protesis_removibles protesis_removibles_registrado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_removibles
    ADD CONSTRAINT protesis_removibles_registrado_por_usuario_fkey FOREIGN KEY (registrado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: tratamientos tratamientos_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos
    ADD CONSTRAINT tratamientos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: tratamientos tratamientos_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos
    ADD CONSTRAINT tratamientos_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: tratamientos tratamientos_registrado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos
    ADD CONSTRAINT tratamientos_registrado_por_usuario_fkey FOREIGN KEY (registrado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: turno_prestaciones turno_prestaciones_prestacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_prestaciones
    ADD CONSTRAINT turno_prestaciones_prestacion_id_fkey FOREIGN KEY (prestacion_id) REFERENCES public.prestaciones(id) ON DELETE RESTRICT;


--
-- Name: turno_prestaciones turno_prestaciones_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turno_prestaciones
    ADD CONSTRAINT turno_prestaciones_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE CASCADE;


--
-- Name: turnos turnos_actualizado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_actualizado_por_usuario_fkey FOREIGN KEY (actualizado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: turnos turnos_creado_por_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_creado_por_usuario_fkey FOREIGN KEY (creado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: turnos turnos_profesional_perfil_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_profesional_perfil_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: turnos turnos_profesional_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_profesional_perfil_id_fkey FOREIGN KEY (profesional_perfil_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles usuarios_roles_asignado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_asignado_por_usuario_id_fkey FOREIGN KEY (asignado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles usuarios_roles_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles usuarios_roles_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles_vigentes usuarios_roles_vigentes_asignado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles_vigentes
    ADD CONSTRAINT usuarios_roles_vigentes_asignado_por_usuario_id_fkey FOREIGN KEY (asignado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles_vigentes usuarios_roles_vigentes_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles_vigentes
    ADD CONSTRAINT usuarios_roles_vigentes_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles_vigentes usuarios_roles_vigentes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles_vigentes
    ADD CONSTRAINT usuarios_roles_vigentes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--
