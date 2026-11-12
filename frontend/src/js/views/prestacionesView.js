import { confirmArancelesCsv, confirmCargaCatalogo, configurarDuracionPrestaciones, createPrestacion, desactivarPrestacion, getPrestaciones, previewArancelesCsv, previewCargaCatalogo, updatePrestacion } from '../api.js';
import { renderAlert } from '../components/alerts.js';

const state = { prestaciones: [], filtroEstado: 'activas', search: '', selected: new Set(), mode: 'create', editId: null, arancelPreview: null, cargaPreview: null };
const ui = {
  alertContainer: document.getElementById('alert-container'), tbody: document.getElementById('prestaciones-tbody'),
  filtroEstado: document.getElementById('prestaciones-filtro-estado'), openCreateButton: document.getElementById('open-prestacion-modal'),
  form: document.getElementById('prestacion-form'), modalTitle: document.getElementById('prestacion-modal-label'),
  submitButton: document.getElementById('prestacion-submit-btn'), inputCodigo: document.getElementById('prestacion-codigo'),
  inputNombre: document.getElementById('prestacion-nombre'), inputCategoria: document.getElementById('prestacion-categoria'),
  inputDuracion: document.getElementById('prestacion-duracion'), inputModalidad: document.getElementById('prestacion-modalidad'),
  inputPrecio: document.getElementById('prestacion-precio'), precioWrap: document.getElementById('prestacion-precio-wrap'),
  inputActiva: document.getElementById('prestacion-activa'),
  referencia: document.getElementById('prestacion-referencia-arancel'), openImport: document.getElementById('open-arancel-import-modal'),
  importForm: document.getElementById('arancel-import-form'), importPreview: document.getElementById('arancel-preview'),
  importSummary: document.getElementById('arancel-preview-summary'), importErrors: document.getElementById('arancel-preview-errors'),
  importBody: document.getElementById('arancel-preview-body'), importConfirm: document.getElementById('arancel-confirm-btn'),
  openCarga: document.getElementById('open-carga-catalogo-modal'), cargaSummary: document.getElementById('carga-catalogo-summary'),
  cargaBody: document.getElementById('carga-catalogo-body'), cargaConfirm: document.getElementById('carga-catalogo-confirm'),
  search: document.getElementById('prestaciones-busqueda'), pendingAlert: document.getElementById('prestaciones-pendientes-aviso'),
  pendingText: document.getElementById('prestaciones-pendientes-texto'), pendingLink: document.getElementById('prestaciones-ver-pendientes'),
  selectAll: document.getElementById('prestaciones-seleccionar-todas'), bulkConfigure: document.getElementById('prestaciones-configurar-seleccion'),
  selectionCount: document.getElementById('prestaciones-seleccion-contador'), bulkDuration: document.getElementById('configurar-duracion-minutos'),
  bulkPreview: document.getElementById('configurar-duracion-preview'), bulkConfirm: document.getElementById('configurar-duracion-confirmar'),
};
const modal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('prestacion-modal'));
const importModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('arancel-import-modal'));
const cargaModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('carga-catalogo-modal'));
const durationModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('configurar-duracion-modal'));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));

function etiquetaPrecio(p) {
  if (p.precio_modalidad === 'a_convenir') return 'A convenir';
  if (p.precio_modalidad === 'sin_definir') return 'Sin definir';
  if (p.precio_modalidad === 'fijo' && Number(p.precio_base) > 0) return `$ ${Number(p.precio_base).toFixed(2)}`;
  return '<span class="text-warning">Revisar precio cero</span>';
}
function renderRows(rows) {
  const query=state.search.trim().toLowerCase();
  const visible=rows.filter(p=>!query||String(p.nombre||'').toLowerCase().includes(query)||String(p.codigo||'').toLowerCase().includes(query));
  if (!visible.length) { ui.tbody.innerHTML = '<tr><td colspan="8" class="text-center text-secondary">Sin prestaciones</td></tr>'; updateSelection(); return; }
  ui.tbody.innerHTML = visible.map((p) => `<tr>
    <td><input class="form-check-input" type="checkbox" data-select-prestacion="${p.id}" ${state.selected.has(Number(p.id))?'checked':''} aria-label="Seleccionar ${escapeHtml(p.nombre)}" /></td>
    <td>${escapeHtml(p.codigo || '-')}</td><td>${escapeHtml(p.nombre)}</td><td>${escapeHtml(p.categoria || '-')}</td>
    <td>${p.duracion_minutos === null ? '<span class="badge bg-warning text-dark">Pendiente</span>' : `${p.duracion_minutos} min`}</td><td>${etiquetaPrecio(p)}</td>
    <td><span class="badge ${p.activo ? 'bg-success' : 'bg-secondary'}">${p.activo ? 'Activa' : 'Inactiva'}</span></td>
    <td class="text-end"><div class="btn-group"><button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${p.id}">Editar</button>
    <button class="btn btn-sm ${p.activo ? 'btn-outline-danger' : 'btn-outline-success'}" data-action="${p.activo ? 'deactivate' : 'configure'}" data-id="${p.id}">${p.activo ? 'Desactivar' : 'Configurar y activar'}</button></div></td></tr>`).join('');
  updateSelection();
}
function updateSelection(){ ui.selectionCount.textContent=`${state.selected.size} seleccionadas`; ui.bulkConfigure.disabled=state.selected.size===0; if(ui.selectAll) ui.selectAll.checked=false; }
function syncPrecio() {
  const fijo = ui.inputModalidad.value === 'fijo';
  ui.precioWrap.classList.toggle('d-none', !fijo);
  ui.inputPrecio.required = fijo;
  ui.inputPrecio.disabled = !fijo;
  if (!fijo) ui.inputPrecio.value = '';
}
function openCreateModal() {
  state.mode='create'; state.editId=null; ui.form.reset(); ui.modalTitle.textContent='Nueva prestacion'; ui.submitButton.textContent='Guardar';
  ui.inputActiva.checked=true; ui.referencia.classList.add('d-none'); syncPrecio(); modal?.show();
}
function openEditModal(p,configure=false) {
  state.mode=configure?'configure':'edit'; state.editId=p.id; ui.modalTitle.textContent=configure?'Configurar y activar':'Editar prestacion'; ui.submitButton.textContent=configure?'Guardar y activar':'Guardar cambios';
  ui.inputCodigo.value=p.codigo || ''; ui.inputNombre.value=p.nombre || ''; ui.inputCategoria.value=p.categoria || '';
  ui.inputDuracion.value=p.duracion_minutos || ''; ui.inputModalidad.value=p.precio_modalidad || '';
  ui.inputPrecio.value=p.precio_base ?? ''; ui.inputActiva.checked=configure?true:Boolean(p.activo); ui.inputActiva.disabled=configure; syncPrecio();
  if (p.precio_modalidad === 'fijo') ui.inputPrecio.value=p.precio_base ?? '';
  if (p.referencia_arancel) {
    const r=p.referencia_arancel;
    ui.referencia.innerHTML=`<strong>Referencia vinculada</strong><br>${escapeHtml(r.fuente)} · ${escapeHtml(r.version_documental)} · vigencia ${escapeHtml(r.vigencia)}<br>${escapeHtml(r.codigo)} — ${escapeHtml(r.nombre)}<br>${r.precio === null ? escapeHtml(r.estado_precio) : `${escapeHtml(r.moneda)} ${Number(r.precio).toFixed(2)} · ${escapeHtml(r.estado_precio)}`} · pagina ${escapeHtml(r.pagina_pdf)}`;
    ui.referencia.classList.remove('d-none');
  } else ui.referencia.classList.add('d-none');
  modal?.show();
}

function renderImportPreview(data) {
  state.arancelPreview=data; const s=data.resumen;
  ui.importSummary.textContent=`${s.validas} filas validas · ${s.errores} errores · ${s.nuevas} nuevas · ${s.cambios} cambios · ${s.sin_cambios} sin cambios · ${s.correspondencias} posibles correspondencias${data.archivo.ya_importado?' · archivo ya importado':''}`;
  ui.importErrors.innerHTML=data.errores.length?`<div class="alert alert-danger"><strong>Errores:</strong><ul>${data.errores.map(e=>`<li>Fila ${e.fila_csv}: ${escapeHtml(e.motivos.join('; '))}</li>`).join('')}</ul></div>`:'';
  const options=data.prestaciones.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}${p.codigo?` (${escapeHtml(p.codigo)})`:''}</option>`).join('');
  ui.importBody.innerHTML=data.filas.map(row=>{ const suggested=row.candidatos[0]?.prestacion_id;
    const price=row.precio===null?escapeHtml(row.estado_precio):`${escapeHtml(data.metadata.moneda)} ${Number(row.precio).toFixed(2)} · ${escapeHtml(row.estado_precio)}`;
    return `<tr><td>${row.fila_csv}</td><td>${escapeHtml(row.codigo)}</td><td>${escapeHtml(row.nombre)}</td><td>${escapeHtml(row.categoria)}</td><td>${price}</td><td>${escapeHtml(row.tipo)}</td><td>${row.pagina_pdf}</td><td><select class="form-select form-select-sm" data-arancel-code="${escapeHtml(row.codigo)}"><option value="">No vincular</option>${options}</select>${suggested?`<div class="form-text">Sugerencia: ${escapeHtml(row.candidatos[0].nombre)}</div>`:''}</td></tr>`;
  }).join('');
  ui.importPreview.classList.remove('d-none'); ui.importConfirm.classList.toggle('d-none',data.errores.length>0);
}
function importFormData(includeMappings=false) {
  const formData=new FormData(ui.importForm);
  if(includeMappings) { const mappings=[...ui.importBody.querySelectorAll('select[data-arancel-code]')].filter(s=>s.value).map(s=>({codigo:s.dataset.arancelCode,prestacion_id:Number(s.value)})); formData.set('correspondencias',JSON.stringify(mappings)); }
  return formData;
}
async function loadPrestaciones() {
  try { const data=await getPrestaciones({ estado: state.filtroEstado }); state.prestaciones=data.prestaciones || []; state.selected.clear(); renderRows(state.prestaciones); await loadPendingCount(); }
  catch (error) { renderAlert(ui.alertContainer,error.message,'danger'); }
}
async function loadPendingCount(){ const data=await getPrestaciones({estado:'pendientes'}); const count=Number(data.total||0); ui.pendingAlert.classList.toggle('d-none',count===0); ui.pendingText.textContent=`${count} prestaciones pendientes de duracion.`; }
function openDurationModal(){ const selected=state.prestaciones.filter(p=>state.selected.has(Number(p.id))); ui.bulkDuration.value=''; ui.bulkPreview.innerHTML=`<strong>${selected.length} prestaciones</strong><ul class="small mt-2 mb-0">${selected.map(p=>`<li>${escapeHtml(p.codigo||'Sin codigo')} — ${escapeHtml(p.nombre)}</li>`).join('')}</ul>`; durationModal?.show(); }
async function confirmDuration(){ const duration=Number(ui.bulkDuration.value); if(!Number.isInteger(duration)||duration<15){renderAlert(ui.alertContainer,'Ingresá una duración válida de al menos 15 minutos','danger');return;} try{ui.bulkConfirm.disabled=true;const response=await configurarDuracionPrestaciones({ids:[...state.selected],duracion_minutos:duration});durationModal?.hide();renderAlert(ui.alertContainer,`${response.resultado.cantidad} prestaciones configuradas y activadas`,'success');await loadPrestaciones();}catch(error){renderAlert(ui.alertContainer,error.message,'danger');}finally{ui.bulkConfirm.disabled=false;} }
async function openBulkLoad() {
  ui.cargaSummary.textContent='Preparando vista previa...'; ui.cargaBody.innerHTML=''; ui.cargaConfirm.disabled=true; cargaModal?.show();
  try {
    const data=await previewCargaCatalogo(); state.cargaPreview=data; const s=data.resumen;
    ui.cargaSummary.textContent=`${s.total} referencias · ${s.crear} listas para crear · ${s.ya_vinculadas} ya vinculadas · ${s.pendientes} pendientes de resolver`;
    const pending=data.filas.filter(row=>row.estado_carga==='pendiente_resolver');
    ui.cargaBody.innerHTML=pending.length?pending.map(row=>{
      const exactCode=row.candidatos.some(item=>item.coincide_codigo);
      const candidateText=row.candidatos.map(item=>`${escapeHtml(item.nombre)}${item.codigo?` (${escapeHtml(item.codigo)})`:''}`).join('<br>');
      const options=row.candidatos.map(item=>`<option value="link:${item.id}">Vincular con ${escapeHtml(item.nombre)}</option>`).join('');
      return `<tr><td>${escapeHtml(row.codigo)}</td><td>${escapeHtml(row.nombre)}</td><td>${escapeHtml(row.estado_precio)}</td><td>${candidateText}</td><td><select class="form-select form-select-sm" data-ref-id="${row.id}"><option value="">Dejar pendiente</option>${options}${exactCode?'':'<option value="create">Crear como nueva</option>'}</select></td></tr>`;
    }).join(''):'<tr><td colspan="5" class="text-center text-secondary">No hay posibles duplicados pendientes.</td></tr>';
    ui.cargaConfirm.disabled=false;
  } catch(error){ ui.cargaSummary.textContent=error.message; ui.cargaSummary.className='alert alert-danger'; }
}
async function confirmBulkLoad() {
  const resoluciones=[...ui.cargaBody.querySelectorAll('select[data-ref-id]')].filter(select=>select.value).map(select=>{
    if(select.value==='create') return {referencia_id:Number(select.dataset.refId),accion:'crear'};
    return {referencia_id:Number(select.dataset.refId),accion:'vincular',prestacion_id:Number(select.value.split(':')[1])};
  });
  try { ui.cargaConfirm.disabled=true; const response=await confirmCargaCatalogo({version_id:state.cargaPreview.version.id,resoluciones}); const r=response.resultado;
    renderAlert(ui.alertContainer,`${r.creadas} creadas · ${r.ya_vinculadas+r.vinculadas_existentes} ya vinculadas · ${r.pendientes} pendientes de resolver`,'success');
    cargaModal?.hide(); state.filtroEstado='pendientes'; ui.filtroEstado.value='pendientes'; await loadPrestaciones();
  } catch(error){ renderAlert(ui.alertContainer,error.message,'danger'); ui.cargaConfirm.disabled=false; }
}
function bindEvents() {
  ui.openCreateButton?.addEventListener('click',openCreateModal);
  ui.inputModalidad.addEventListener('change',syncPrecio);
  ui.search?.addEventListener('input',()=>{state.search=ui.search.value;renderRows(state.prestaciones);});
  ui.pendingLink?.addEventListener('click',async()=>{state.filtroEstado='pendientes';ui.filtroEstado.value='pendientes';await loadPrestaciones();});
  ui.bulkConfigure?.addEventListener('click',openDurationModal); ui.bulkConfirm?.addEventListener('click',confirmDuration);
  ui.selectAll?.addEventListener('change',()=>{state.prestaciones.forEach(p=>{if(ui.selectAll.checked)state.selected.add(Number(p.id));else state.selected.delete(Number(p.id));});renderRows(state.prestaciones);ui.selectAll.checked=state.selected.size>0;});
  ui.openImport?.addEventListener('click',()=>{ state.arancelPreview=null; ui.importForm.reset(); document.getElementById('arancel-moneda').value='ARS'; ui.importPreview.classList.add('d-none'); ui.importConfirm.classList.add('d-none'); importModal?.show(); });
  ui.importForm?.addEventListener('submit',async(event)=>{ event.preventDefault(); try{ renderImportPreview(await previewArancelesCsv(importFormData())); }catch(error){ renderAlert(ui.alertContainer,error.message,'danger'); } });
  ui.importConfirm?.addEventListener('click',async()=>{ try{ const result=await confirmArancelesCsv(importFormData(true)); renderAlert(ui.alertContainer,result.mensaje,'success'); importModal?.hide(); await loadPrestaciones(); }catch(error){ renderAlert(ui.alertContainer,error.message,'danger'); } });
  ui.filtroEstado?.addEventListener('change',async()=>{ state.filtroEstado=ui.filtroEstado.value; await loadPrestaciones(); });
  ui.openCarga?.addEventListener('click',openBulkLoad);
  ui.cargaConfirm?.addEventListener('click',confirmBulkLoad);
  ui.tbody.addEventListener('click',async(event)=>{ const button=event.target.closest('button[data-action]'); if(!button)return;
    const p=state.prestaciones.find((item)=>String(item.id)===button.dataset.id); if(button.dataset.action==='edit'){ openEditModal(p); return; } if(button.dataset.action==='configure'){openEditModal(p,true);return;}
    try { await desactivarPrestacion(button.dataset.id);
      renderAlert(ui.alertContainer,'Prestacion desactivada','success'); await loadPrestaciones();
    } catch(error){ renderAlert(ui.alertContainer,error.message,'danger'); }
  });
  ui.tbody.addEventListener('change',(event)=>{const checkbox=event.target.closest('[data-select-prestacion]');if(!checkbox)return;const id=Number(checkbox.dataset.selectPrestacion);if(checkbox.checked)state.selected.add(id);else state.selected.delete(id);updateSelection();});
  ui.form.addEventListener('submit',async(event)=>{ event.preventDefault(); const payload={ codigo:ui.inputCodigo.value.trim(), nombre:ui.inputNombre.value.trim(),
    categoria:ui.inputCategoria.value.trim(), duracion_minutos:Number(ui.inputDuracion.value), precio_modalidad:ui.inputModalidad.value,
    precio_base:ui.inputModalidad.value==='fijo'?Number(ui.inputPrecio.value):null, activo:ui.inputActiva.checked };
    if(state.mode==='configure') payload.activo=true;
    try { if(state.mode==='edit'||state.mode==='configure') await updatePrestacion(state.editId,payload); else await createPrestacion(payload);
      renderAlert(ui.alertContainer,state.mode==='create'?'Prestacion creada':state.mode==='configure'?'Prestacion configurada y activada':'Prestacion actualizada','success'); modal?.hide(); await loadPrestaciones();
    } catch(error){ renderAlert(ui.alertContainer,error.message,'danger'); }
  });
}
export async function initPrestacionesView(){ bindEvents(); document.getElementById('prestacion-modal')?.addEventListener('hidden.bs.modal',()=>{ui.inputActiva.disabled=false;}); await loadPrestaciones(); }
