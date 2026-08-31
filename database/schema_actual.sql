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
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


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
    autogestion_keywords text DEFAULT 'turno, turnito, cita, consulta, odontologo, odontóloga, odontologia, odontología'::text NOT NULL
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
-- Name: documentos_paciente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_paciente (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    nombre_archivo text NOT NULL,
    ruta_archivo text NOT NULL,
    tipo_archivo character varying(100) NOT NULL,
    descripcion text,
    fecha_subida timestamp with time zone DEFAULT now() NOT NULL
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
    created_at timestamp with time zone DEFAULT now()
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
-- Name: odontograma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.odontograma (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    diente smallint NOT NULL,
    cara character varying(20) NOT NULL,
    estado character varying(50) NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    observaciones text
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
    CONSTRAINT pagos_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'anulado'::character varying])::text[]))),
    CONSTRAINT pagos_importe_positivo_check CHECK ((importe > (0)::numeric)),
    CONSTRAINT pagos_metodo_pago_check CHECK (((metodo_pago)::text = ANY ((ARRAY['efectivo'::character varying, 'tarjeta'::character varying, 'transferencia'::character varying])::text[])))
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
-- Name: prestaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestaciones (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    duracion_minutos integer NOT NULL,
    precio_base numeric(10,2),
    activa boolean DEFAULT true,
    activo boolean DEFAULT true,
    updated_at timestamp with time zone,
    CONSTRAINT prestaciones_duracion_minutos_check CHECK ((duracion_minutos > 0))
);


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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: protesis_fijas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protesis_fijas (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    tipo character varying(50) NOT NULL,
    dientes smallint[] NOT NULL,
    descripcion text,
    fecha timestamp with time zone DEFAULT now() NOT NULL
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
    fecha timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: tratamientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tratamientos (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    diente smallint NOT NULL,
    tipo character varying(50) NOT NULL,
    observaciones text,
    fecha timestamp with time zone DEFAULT now() NOT NULL
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
    CONSTRAINT chk_fechas_turno CHECK ((fecha_hora_fin > fecha_hora_inicio))
);


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
    created_at timestamp with time zone DEFAULT now()
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
-- Name: documentos_paciente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente ALTER COLUMN id SET DEFAULT nextval('public.documentos_paciente_id_seq'::regclass);


--
-- Name: historias_clinicas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historias_clinicas ALTER COLUMN id SET DEFAULT nextval('public.historias_clinicas_id_seq'::regclass);


--
-- Name: odontograma id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma ALTER COLUMN id SET DEFAULT nextval('public.odontograma_id_seq'::regclass);


--
-- Name: odontograma_meta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta ALTER COLUMN id SET DEFAULT nextval('public.odontograma_meta_id_seq'::regclass);


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
-- Name: tratamientos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos ALTER COLUMN id SET DEFAULT nextval('public.tratamientos_id_seq'::regclass);


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
-- Name: tratamientos tratamientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos
    ADD CONSTRAINT tratamientos_pkey PRIMARY KEY (id);


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
-- Name: idx_documentos_paciente_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_paciente_fecha ON public.documentos_paciente USING btree (fecha_subida DESC);


--
-- Name: idx_documentos_paciente_paciente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documentos_paciente_paciente_id ON public.documentos_paciente USING btree (paciente_id);


--
-- Name: idx_historia_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historia_paciente ON public.historias_clinicas USING btree (paciente_id);


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
-- Name: idx_turnos_profesional_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turnos_profesional_inicio ON public.turnos USING btree (profesional_id, fecha_hora_inicio);


--
-- Name: idx_whatsapp_conversations_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_expires ON public.whatsapp_conversations USING btree (expires_at);


--
-- Name: idx_whatsapp_conversations_phone_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_phone_status ON public.whatsapp_conversations USING btree (phone, status);


--
-- Name: turnos trg_set_timestamps_and_cancellation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_timestamps_and_cancellation BEFORE UPDATE ON public.turnos FOR EACH ROW EXECUTE FUNCTION public.trg_turnos_set_timestamps_and_cancellation();


--
-- Name: turnos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.turnos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: documentos_paciente documentos_paciente_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_paciente
    ADD CONSTRAINT documentos_paciente_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


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
-- Name: odontograma_meta odontograma_meta_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma_meta
    ADD CONSTRAINT odontograma_meta_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: odontograma odontograma_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odontograma
    ADD CONSTRAINT odontograma_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: protesis_fijas protesis_fijas_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_fijas
    ADD CONSTRAINT protesis_fijas_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: protesis_removibles protesis_removibles_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protesis_removibles
    ADD CONSTRAINT protesis_removibles_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- Name: tratamientos tratamientos_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tratamientos
    ADD CONSTRAINT tratamientos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

