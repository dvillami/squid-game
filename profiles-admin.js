// Editor de expedientes. Independiente de admin.js y games-admin.js.
(() => {
  'use strict';
  const root = document.getElementById('profilesList');
  const notice = document.getElementById('profilesNotice');
  const reload = document.getElementById('profilesReload');
  const panel = document.getElementById('adminPanel');
  if (!root || !notice || !reload || !panel) return;
  const db = window.sg;
  let loading = false;
  const message = (value, error = false) => {
    notice.textContent = value;
    notice.style.color = error ? '#ff91a4' : '';
  };
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  async function verifyAdmin() {
    if (!db) throw new Error('No hay conexión con Supabase.');
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Inicia sesión como administrador.');
    const { data, error } = await db.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Tu cuenta no tiene permisos de administrador.');
  }
  async function loadProfiles() {
    if (loading || panel.hidden) return;
    loading = true;
    reload.disabled = true;
    message('Cargando expedientes…');
    try {
      await verifyAdmin();
      const [participants, profiles] = await Promise.all([
        db.from('participants').select('id,name').order('id'),
        db.from('supervisor_participant_profiles').select('participant_id,content')
      ]);
      if (participants.error) throw participants.error;
      if (profiles.error) throw profiles.error;
      const byId = new Map((profiles.data || []).map(p => [Number(p.participant_id), p.content || '']));
      root.replaceChildren();
      for (const player of participants.data || []) {
        const card = element('article');
        card.style.cssText = 'padding:16px;border:1px solid #9c526880;border-radius:10px;margin:0 0 12px';
        const heading = element('h3', `Jugador ${String(player.id).padStart(3,'0')} — ${player.name}`);
        heading.style.margin = '0 0 8px';
        const label = element('label', 'Descripción privada para EL SUPERVISOR');
        label.htmlFor = `profile-${player.id}`;
        const field = element('textarea');
        field.id = `profile-${player.id}`;
        field.rows = 6;
        field.maxLength = 20000;
        field.value = byId.get(Number(player.id)) || '';
        field.placeholder = 'Personalidad, relaciones, estudios, aficiones y bromas apropiadas. Evita datos delicados innecesarios.';
        field.style.cssText = 'display:block;box-sizing:border-box;width:100%;margin:8px 0 12px;padding:10px;border-radius:8px;min-height:110px';
        const actions = element('div');
        actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center';
        const save = element('button', 'Guardar expediente');
        save.type = 'button';
        const clear = element('button', 'Borrar expediente');
        clear.type = 'button';
        clear.className = 'outline';
        const state = element('span', field.value.trim() ? 'Expediente existente' : 'Sin expediente');
        state.style.fontSize = '.85em';
        save.addEventListener('click', async () => {
          const content = field.value.trim();
          if (!content) { message('Escribe una descripción o utiliza «Borrar expediente».', true); return; }
          save.disabled = clear.disabled = true;
          try {
            await verifyAdmin();
            const { error } = await db.from('supervisor_participant_profiles')
              .upsert({ participant_id: player.id, content }, { onConflict: 'participant_id' });
            if (error) throw error;
            state.textContent = 'Guardado';
            message(`Expediente de ${player.name} (ID ${player.id}) guardado correctamente.`);
          } catch (e) { message('No se pudo guardar: ' + e.message, true); }
          finally { save.disabled = clear.disabled = false; }
        });
        clear.addEventListener('click', async () => {
          if (!confirm(`¿Borrar el expediente del jugador ${player.id} (${player.name})? El nombre y la foto no se modificarán.`)) return;
          save.disabled = clear.disabled = true;
          try {
            await verifyAdmin();
            const { error } = await db.from('supervisor_participant_profiles').delete().eq('participant_id', player.id);
            if (error) throw error;
            field.value = '';
            state.textContent = 'Sin expediente';
            message(`Expediente del jugador ${player.id} borrado.`);
          } catch (e) { message('No se pudo borrar: ' + e.message, true); }
          finally { save.disabled = clear.disabled = false; }
        });
        actions.append(save, clear, state);
        card.append(heading, label, field, actions);
        root.append(card);
      }
      message(`${participants.data?.length || 0} participantes cargados. Los expedientes están vinculados al ID, no al nombre.`);
    } catch (e) {
      root.replaceChildren();
      message('Error al cargar expedientes: ' + e.message, true);
    } finally {
      loading = false;
      reload.disabled = false;
    }
  }
  reload.addEventListener('click', loadProfiles);
  // admin.js controla el acceso y la visibilidad del panel. No alteramos su flujo.
  const observer = new MutationObserver(() => { if (!panel.hidden) loadProfiles(); });
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  if (!panel.hidden) loadProfiles();
})();
