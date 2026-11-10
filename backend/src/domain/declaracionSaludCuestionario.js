const VERSION = 'hc_general_v1';
const BASE_ANSWERS = ['yes', 'no', 'unknown'];

const sections = [
  {
    id: 'salud_general', title: 'Salud general y tratamientos', questions: [
      { id: 'enfermedad_actual', label: '¿Tiene o tuvo alguna enfermedad relevante?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: '¿Cuál o cuáles?', type: 'textarea', requiredWhen: ['yes'] }], summary: 'Enfermedades declaradas' },
      { id: 'tratamiento_medico', label: '¿Realiza actualmente algún tratamiento médico?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: 'Tratamiento', type: 'textarea', requiredWhen: ['yes'] }], summary: 'Tratamientos médicos declarados' },
      { id: 'medicacion_habitual', label: '¿Consume medicamentos habitualmente?', answers: BASE_ANSWERS, details: [{ id: 'medicamentos', label: 'Medicamentos y frecuencia', type: 'textarea', requiredWhen: ['yes'] }], summary: 'Medicación habitual declarada' },
      { id: 'medicacion_ultimos_cinco_anios', label: '¿Consumió medicación relevante en los últimos 5 años?', answers: BASE_ANSWERS, details: [{ id: 'medicamentos', label: 'Medicamentos', type: 'textarea', requiredWhen: ['yes'] }] },
      { id: 'cirugias', label: '¿Fue operado/a alguna vez?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: '¿De qué?', type: 'text', requiredWhen: ['yes'] }, { id: 'fecha', label: 'Fecha aproximada', type: 'date', requiredWhen: ['yes'] }], summary: 'Cirugías declaradas' },
      { id: 'transfusiones', label: '¿Recibió transfusiones?', answers: BASE_ANSWERS, details: [{ id: 'detalle', label: 'Detalle', type: 'text', requiredWhen: [] }] },
      { id: 'tratamientos_complementarios', label: '¿Realiza tratamientos homeopáticos, acupuntura u otros?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: '¿Cuáles?', type: 'textarea', requiredWhen: ['yes'] }], summary: 'Otros tratamientos declarados' },
    ],
  },
  {
    id: 'alergias_sangrado', title: 'Alergias, sangrado y cicatrización', questions: [
      { id: 'alergias', label: '¿Tiene alergias conocidas?', answers: BASE_ANSWERS, details: [{ id: 'tipos', label: 'Seleccione las conocidas', type: 'multi', options: ['Anestesia', 'Penicilina', 'Otra droga', 'Otra sustancia'], requiredWhen: ['yes'] }, { id: 'otras', label: 'Detalle', type: 'text', requiredWhen: [] }], summary: 'Alergias declaradas' },
      { id: 'cicatrizacion', label: 'Cuando se lastima o le extraen una pieza, ¿cicatriza bien?', answers: BASE_ANSWERS, summary: 'Alteración de cicatrización declarada', summaryWhen: ['no'] },
      { id: 'sangrado', label: '¿Presenta sangrado abundante o prolongado?', answers: BASE_ANSWERS, details: [{ id: 'detalle', label: 'Detalle', type: 'textarea', requiredWhen: ['yes'] }], summary: 'Sangrado declarado' },
      { id: 'anticoagulantes', label: '¿Toma aspirina o anticoagulantes?', answers: BASE_ANSWERS, details: [{ id: 'medicacion_frecuencia', label: 'Medicamento y frecuencia', type: 'text', requiredWhen: ['yes'] }], summary: 'Anticoagulantes declarados' },
    ],
  },
  {
    id: 'condiciones', title: 'Condiciones y antecedentes médicos', questions: [
      { id: 'diabetes', label: '¿Tiene diabetes?', answers: BASE_ANSWERS, details: [{ id: 'control', label: 'Control y tratamiento', type: 'text', requiredWhen: ['yes'] }], summary: 'Diabetes declarada' },
      { id: 'cardiaco', label: '¿Tiene algún problema cardíaco?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: '¿Cuál?', type: 'text', requiredWhen: ['yes'] }], summary: 'Condición cardíaca declarada' },
      { id: 'hipertension', label: '¿Tiene presión alta?', answers: BASE_ANSWERS, details: [{ id: 'control', label: 'Control o tratamiento', type: 'text', requiredWhen: [] }], summary: 'Hipertensión declarada' },
      { id: 'respiratorio', label: '¿Tiene algún problema respiratorio?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: '¿Cuál?', type: 'text', requiredWhen: ['yes'] }], summary: 'Condición respiratoria declarada' },
      { id: 'renal', label: '¿Tiene problemas renales?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: 'Detalle', type: 'text', requiredWhen: ['yes'] }], summary: 'Condición renal declarada' },
      { id: 'hepatico_hepatitis', label: '¿Tuvo hepatitis o tiene otro problema hepático?', answers: BASE_ANSWERS, details: [{ id: 'tipos', label: 'Tipo de hepatitis, si corresponde', type: 'multi', options: ['A', 'B', 'C', 'Otro problema hepático'], requiredWhen: ['yes'] }, { id: 'detalle', label: 'Detalle', type: 'text', requiredWhen: [] }], summary: 'Condición hepática declarada' },
      { id: 'convulsiones_epilepsia', label: '¿Tuvo convulsiones o tiene epilepsia?', answers: BASE_ANSWERS, details: [{ id: 'medicacion', label: 'Medicación o detalle', type: 'text', requiredWhen: ['yes'] }], summary: 'Convulsiones o epilepsia declaradas' },
      { id: 'infectocontagiosas', label: '¿Tuvo alguna enfermedad infectocontagiosa relevante?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: '¿Cuál?', type: 'text', requiredWhen: ['yes'] }], summary: 'Enfermedad infectocontagiosa declarada' },
      { id: 'fiebre_reumatica', label: '¿Tiene antecedentes de fiebre reumática?', answers: BASE_ANSWERS, details: [{ id: 'proteccion', label: 'Medicación preventiva indicada', type: 'text', requiredWhen: [] }], summary: 'Fiebre reumática declarada' },
      { id: 'colageno_hiperlaxitud', label: '¿Tiene problemas de colágeno o hiperlaxitud?', answers: BASE_ANSWERS, details: [{ id: 'detalle', label: 'Detalle', type: 'text', requiredWhen: ['yes'] }], summary: 'Condición de colágeno declarada' },
    ],
  },
  {
    id: 'habitos_situaciones', title: 'Hábitos y situaciones particulares', questions: [
      { id: 'fuma', label: '¿Fuma?', answers: BASE_ANSWERS, details: [{ id: 'frecuencia', label: 'Frecuencia', type: 'text', requiredWhen: [] }] },
      { id: 'deporte_malestar', label: '¿Siente malestar al realizar actividad física?', answers: [...BASE_ANSWERS, 'not_applicable'], details: [{ id: 'detalle', label: 'Detalle', type: 'text', requiredWhen: ['yes'] }], summary: 'Malestar con actividad física declarado' },
      { id: 'embarazo', label: '¿Está cursando un embarazo?', answers: [...BASE_ANSWERS, 'not_applicable'], details: [{ id: 'fecha_probable_parto', label: 'Fecha probable de parto', type: 'date', requiredWhen: ['yes'] }, { id: 'semanas', label: 'Semanas de gestación', type: 'number', requiredWhen: [] }], summary: 'Embarazo declarado' },
    ],
  },
  {
    id: 'recomendaciones', title: 'Recomendaciones y contactos médicos', questions: [
      { id: 'recomendacion_medica', label: '¿Hay otra enfermedad o recomendación médica que quiera dejar asentada?', answers: BASE_ANSWERS, details: [{ id: 'descripcion', label: 'Detalle declarado', type: 'textarea', requiredWhen: ['yes'] }], summary: 'Recomendaciones médicas declaradas' },
      { id: 'medico_clinico', label: '¿Cuenta con médico/a clínico/a de referencia?', answers: BASE_ANSWERS, details: [{ id: 'nombre_contacto', label: 'Nombre y contacto', type: 'text', requiredWhen: ['yes'] }] },
      { id: 'institucion_derivacion', label: '¿Tiene clínica u hospital de referencia?', answers: BASE_ANSWERS, details: [{ id: 'nombre', label: 'Institución', type: 'text', requiredWhen: ['yes'] }] },
    ],
  },
];

const questions = sections.flatMap((section) => section.questions);
const byId = new Map(questions.map((question) => [question.id, question]));

module.exports = { VERSION, sections, questions, byId };
