/* Camada de nuvem PersonalHUB (Supabase): autenticação + sincronização automática.
   O app trabalha com o objeto DB em memória; save() agenda um "flush" que envia
   ao banco só as linhas que mudaram. As regras RLS decidem o que cada perfil acessa. */
const Cloud = (() => {
  const cfg = window.APP_CONFIG || window.RJOTA_CONFIG || {};
  let curUrl = (cfg.SUPABASE_URL || localStorage.getItem('personalhub_supabase_url') || '').trim();
  let curKey = (cfg.SUPABASE_ANON_KEY || localStorage.getItem('personalhub_supabase_key') || '').trim();
  let enabled = !!(curUrl && curKey && window.supabase);
  let sb, snap = {}, timer, busy = false, dirty = false;
  let realtimeChannelSub = null;

  function setupCloudRealtime() {
    if (!sb || !enabled) return;
    try {
      if (realtimeChannelSub) sb.removeChannel(realtimeChannelSub);
      realtimeChannelSub = sb.channel('personalhub-cloud-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, payload => {
          if (typeof handleRealtimeSync === 'function') handleRealtimeSync({ type: 'cloud_workouts_change', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
          if (typeof handleRealtimeSync === 'function') handleRealtimeSync({ type: 'cloud_profiles_change', payload });
        })
        .subscribe();
    } catch (e) {
      console.warn('Supabase Realtime fallback:', e);
    }
  }

  function initClient(url, key) {
    curUrl = (url || '').trim();
    curKey = (key || '').trim();
    enabled = !!(curUrl && curKey && window.supabase);
    if (enabled) {
      try {
        sb = window.supabase.createClient(curUrl, curKey);
        setupCloudRealtime();
      } catch (err) {
        console.error('Erro ao conectar Supabase:', err);
        enabled = false;
      }
    } else {
      if (sb && realtimeChannelSub) {
        try { sb.removeChannel(realtimeChannelSub); } catch { }
        realtimeChannelSub = null;
      }
      sb = null;
    }
    return enabled;
  }
  if (enabled) initClient(curUrl, curKey);

  const strip = (o, keys) => keys.reduce((r, k) => (o[k] !== undefined && (r[k] = o[k]), r), {});
  const plain = k => ({ get: () => DB[k], set: r => { DB[k] = r; }, to: r => r });

  // Mapeamento coleção do app <-> tabela do banco
  const COL = {
    users: {
      table: 'profiles',
      updateOnly: true,
      get: () => DB.users,
      set: r => {
        DB.users = r.map(({ trainer_id, ...u }) => {
          let report = null;
          let finance = null;
          let notes = u.notes || '';
          if (notes.includes('__FINANCE_JSON__:')) {
            try {
              const parts = notes.split('__FINANCE_JSON__:');
              notes = parts[0].trim();
              finance = JSON.parse(parts[1]);
            } catch { }
          }
          if (notes.includes('__REPORT_JSON__:')) {
            try {
              const parts = notes.split('__REPORT_JSON__:');
              notes = parts[0].trim();
              report = JSON.parse(parts[1]);
            } catch { }
          }
          return {
            ...u,
            notes,
            report: report || u.report || null,
            finance: finance || u.finance || null,
            autonomous: u.autonomous ?? (!trainer_id || notes.includes('Autônomo')),
            trainerId: trainer_id || null,
          };
        });
      },
      to: u => {
        let notes = (u.notes || '').split('__REPORT_JSON__:')[0].split('__FINANCE_JSON__:')[0].trim();
        if (u.report) {
          notes = `${notes} __REPORT_JSON__:${JSON.stringify(u.report)}`.trim();
        }
        if (u.finance) {
          notes = `${notes} __FINANCE_JSON__:${JSON.stringify(u.finance)}`.trim();
        }
        return {
          ...strip(u, ['id', 'email', 'name', 'role', 'active', 'phone', 'age', 'height', 'goal', 'injuries', 'weight', 'photo']),
          notes,
          trainer_id: u.trainerId || null,
        };
      },
    },
    workouts: {
      table: 'workouts',
      get: () => Object.entries(DB.workouts).flatMap(([sid, ds]) => (ds || []).map((d, i) => ({ id: d.id, uid: sid, pos: i, data: { name: d.name, exercises: d.exercises } }))),
      set: rows => { DB.workouts = {}; rows.sort((a, b) => a.pos - b.pos).forEach(r => (DB.workouts[r.uid] = DB.workouts[r.uid] || []).push({ id: r.id, ...r.data })); },
      to: r => r,
    },
    templates: { table: 'templates', ...plain('templates') },
    checkins: { table: 'checkins', ...plain('checkins') },
    water: { table: 'water', ...plain('water') },
    cardio: { table: 'cardio', ...plain('cardio') },
    weights: { table: 'weights', ...plain('weights') },
    tips: { table: 'tips', ...plain('tips') },
    foods: { table: 'foods', ...plain('foods') },
    logs: { table: 'logs', get: () => DB.logs, set: r => { DB.logs = r.map(({ workout_id, ...x }) => ({ ...x, workoutId: workout_id })); }, to: ({ workoutId, ...x }) => ({ ...x, workout_id: workoutId }) },
    posts: {
      table: 'posts',
      get: () => DB.posts || [],
      set: r => { DB.posts = r.map(({ author_name, author_role, author_photo, ...x }) => ({ ...x, authorName: author_name, authorRole: author_role, authorPhoto: author_photo, likes: Array.isArray(x.likes) ? x.likes : [] })); },
      to: ({ authorName, authorRole, authorPhoto, ...x }) => ({ ...x, author_name: authorName || '', author_role: authorRole || 'student', author_photo: authorPhoto || '', likes: Array.isArray(x.likes) ? x.likes : [] }),
    },
    messages: { table: 'messages', get: () => DB.messages, set: r => { DB.messages = r.map(({ to_id, from_id, ...x }) => ({ ...x, to: to_id, from: from_id || null })); }, to: ({ to, from, ...x }) => ({ ...x, to_id: to, from_id: from || null }) },
    settings: { table: 'settings', get: () => Object.entries(DB.settings).map(([u, d]) => ({ id: u, uid: u, data: d })), set: r => { DB.settings = {}; r.forEach(x => { DB.settings[x.uid] = x.data; }); }, to: r => r },
  };

  const emptyDB = () => ({ users: [], workouts: {}, templates: [], checkins: [], water: [], logs: [], cardio: [], weights: [], posts: [], messages: [], tips: [], foods: [], settings: {} });

  async function fetchAll(table) {
    let out = [], from = 0;
    for (;;) {
      const { data, error } = await sb.from(table).select('*').order('id').range(from, from + 999);
      if (error) throw error;
      out = out.concat(data);
      if (data.length < 1000) return out;
      from += 1000;
    }
  }
  const rowsOf = c => { c.get().forEach(o => { if (!o.id) o.id = uid(); }); return c.get().map(c.to); };
  const takeSnapshot = () => { for (const [k, c] of Object.entries(COL)) snap[k] = new Map(rowsOf(c).map(r => [r.id, JSON.stringify(r)])); };

  async function loadAll() {
    DB = emptyDB();
    for (const [, c] of Object.entries(COL)) c.set(await fetchAll(c.table));
    // Primeiro acesso do CEO: cadastra alimentos e dicas padrão
    const authId = (await sb.auth.getUser()).data.user?.id;
    const me = DB.users.find(u => u.id === authId);
    if (me?.role === 'ceo' || me?.role === 'admin') {
      if (me.role === 'admin') me.role = 'ceo';
      if (!DB.foods.length) DB.foods = FOODS_SEED.map(f => ({ ...f, owner: null }));
      if (!DB.tips.length) DB.tips = TIPS_SEED.map(t => ({ ...t, owner: null }));
      takeSnapshotEmptyFor(['foods', 'tips']);
      flush();
    } else {
      if (!DB.foods.length) DB.foods = FOODS_SEED;
      if (!DB.tips.length) DB.tips = TIPS_SEED;
      takeSnapshot();
    }
  }
  function takeSnapshotEmptyFor(ks) { takeSnapshot(); ks.forEach(k => { snap[k] = new Map(); }); }

  async function flush() {
    if (busy) { dirty = true; return; }
    busy = true;
    try {
      for (const [k, c] of Object.entries(COL)) {
        const rows = rowsOf(c), cur = new Map(rows.map(r => [r.id, JSON.stringify(r)])), old = snap[k] || new Map();
        for (const r of rows.filter(r => old.get(r.id) !== cur.get(r.id))) {
          const q = (old.has(r.id) || c.updateOnly) ? sb.from(c.table).update(r).eq('id', r.id) : sb.from(c.table).insert(r);
          const { error } = await q; if (error) throw error;
        }
        if (!c.updateOnly) {
          const del = [...old.keys()].filter(i => !cur.has(i));
          if (del.length) { const { error } = await sb.from(c.table).delete().in('id', del); if (error) throw error; }
        }
        snap[k] = cur;
      }
    } catch (e) { console.error(e); toast('⚠️ Falha ao sincronizar. Tente novamente.'); }
    busy = false;
    if (dirty) { dirty = false; flush(); }
  }

  const friendly = e => /Invalid login/i.test(e.message) ? 'E-mail ou senha inválidos.' : /banned/i.test(e.message) ? 'Conta desativada. Fale com a administração.' : e.message;

  return {
    get enabled() { return enabled; },
    getConfig() { return { url: curUrl, key: curKey }; },
    async connect(url, key) {
      if (!url || !key) throw new Error('Preencha a URL e a Anon Key do Supabase.');
      localStorage.setItem('personalhub_supabase_url', url.trim());
      localStorage.setItem('personalhub_supabase_key', key.trim());
      const ok = initClient(url, key);
      if (!ok) throw new Error('Não foi possível inicializar a biblioteca Supabase.');
      await loadAll();
      return true;
    },
    async disconnect() {
      if (sb && realtimeChannelSub) {
        try { sb.removeChannel(realtimeChannelSub); } catch { }
        realtimeChannelSub = null;
      }
      localStorage.removeItem('personalhub_supabase_url');
      localStorage.removeItem('personalhub_supabase_key');
      initClient('', '');
      return true;
    },
    queue() { clearTimeout(timer); timer = setTimeout(flush, 300); },
    async login(email, pw) {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(friendly(error));
      return this.restore(true);
    },
    async restore(strict) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      await loadAll();
      const u = DB.users.find(x => x.id === session.user.id);
      if (!u || !u.active) { await sb.auth.signOut(); if (strict) throw new Error(u ? 'Conta desativada.' : 'Perfil não encontrado.'); return null; }
      return u;
    },
    async logout() { await flush(); await sb.auth.signOut(); },
    async setOwnPassword(pw) { const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; },
    async fn(action, payload) {
      const { data, error } = await sb.functions.invoke('admin-users', { body: { action, ...payload } });
      if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { } throw new Error(m); }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async analyzeMealEdge(payload) {
      const { data, error } = await sb.functions.invoke('analyze-meal', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async refresh() { if (busy || document.getElementById('modal')) return; try { await flush(); await loadAll(); S.user = DB.users.find(u => u.id === S.user.id) || S.user; render(); } catch (e) { console.error(e); } },
    get client() { return sb; },
  };
})();
document.addEventListener('visibilitychange', () => { if (!document.hidden && Cloud.enabled && S.user) Cloud.refresh(); });

/* ======================= PERSISTÊNCIA DE PROGRESSÃO DE CARGAS, MICROCICLO E MESOCICLO ======================= */
const LOAD_LOGS_STORAGE_KEY = 'personalhub_workout_load_logs_v1';
const WEEKLY_SCHED_STORAGE_KEY = 'personalhub_weekly_schedules_v1';

function _readLocalStoreJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function _writeLocalStoreJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn('Aviso ao gravar cache local de progressão:', e);
  }
}

function _ensureUserProgressionStore(userId, mesocycle = 'Mesociclo 1') {
  if (typeof DB !== 'undefined' && DB) {
    DB.settings = DB.settings || {};
    DB.settings[userId] = DB.settings[userId] || {};
    DB.settings[userId].loadProgression = DB.settings[userId].loadProgression || {};
    if (!DB.settings[userId].loadProgression[mesocycle]) {
      DB.settings[userId].loadProgression[mesocycle] = {
        logs: {},
        sessionHistory: [],
        schedule: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return DB.settings[userId].loadProgression[mesocycle];
  }
  return null;
}

/**
 * Salva o registro de carga do exercício (individual ou lote de exercícios do treino).
 * Campos suportados em logData:
 * { date, user_id, mesocycle, week, workout_split, exercise_id, exercise_name, weight_kg, reps_done, rir, notes, done, session_notes }
 * ou { entries: [...], sessionSummary: {...} }
 */
async function saveWorkoutLoadLog(logData) {
  const entries = Array.isArray(logData?.entries) ? logData.entries : [logData];
  const savedRecords = [];

  // 1) Atualiza armazenamento local (localStorage + DB.settings para sincronizar com IndexedDB e tabela settings)
  const allLocalLogs = _readLocalStoreJson(LOAD_LOGS_STORAGE_KEY, []);

  for (const item of entries) {
    if (!item || !item.user_id) continue;
    const record = {
      id: item.id || (typeof uid === 'function' ? uid() : String(Date.now()) + Math.random().toString(36).slice(2, 7)),
      date: item.date || (typeof day === 'function' ? day() : new Date().toISOString().slice(0, 10)),
      user_id: String(item.user_id),
      mesocycle: String(item.mesocycle || 'Mesociclo 1'),
      week: Number(item.week || 1),
      workout_split: String(item.workout_split || 'A'),
       workout_id: item.workout_id || null,
      exercise_id: String(item.exercise_id || ''),
      exercise_name: String(item.exercise_name || ''),
      weight_kg: item.weight_kg === '' || item.weight_kg === null || item.weight_kg === undefined ? '' : Number(item.weight_kg),
      reps_done: item.reps_done === '' || item.reps_done === null || item.reps_done === undefined ? '' : Number(item.reps_done),
      rir: String(item.rir || 'RIR 1 (No Alvo)'),
      notes: String(item.notes || ''),
      done: typeof item.done === 'boolean' ? item.done : true,
      updated_at: new Date().toISOString(),
    };

    const existingIdx = allLocalLogs.findIndex(
      x => x.user_id === record.user_id &&
           x.mesocycle === record.mesocycle &&
           Number(x.week) === record.week &&
           x.exercise_id === record.exercise_id
    );
    if (existingIdx >= 0) {
      record.id = allLocalLogs[existingIdx].id || record.id;
      allLocalLogs[existingIdx] = record;
    } else {
      allLocalLogs.push(record);
    }

    const store = _ensureUserProgressionStore(record.user_id, record.mesocycle);
    if (store) {
      const wkKey = 'w' + record.week;
      store.logs[wkKey] = store.logs[wkKey] || {};
      store.logs[wkKey][record.exercise_id] = {
        kg: record.weight_kg,
        reps: record.reps_done,
        rir: record.rir,
        note: record.notes,
        done: record.done,
        date: record.date,
        workout_split: record.workout_split,
        exercise_name: record.exercise_name,
      };
      store.updatedAt = record.updated_at;
    }

    savedRecords.push(record);
  }

  if (logData?.sessionSummary && logData.sessionSummary.user_id) {
    const sUser = logData.sessionSummary.user_id;
    const sMeso = logData.sessionSummary.mesocycle || 'Mesociclo 1';
    const store = _ensureUserProgressionStore(sUser, sMeso);
    if (store) {
      store.sessionHistory = store.sessionHistory || [];
      store.sessionHistory.unshift({
        id: typeof uid === 'function' ? uid() : String(Date.now()),
        ...logData.sessionSummary,
        createdAt: new Date().toISOString(),
      });
      store.sessionHistory = store.sessionHistory.slice(0, 50);
    }
  }

  _writeLocalStoreJson(LOAD_LOGS_STORAGE_KEY, allLocalLogs);
  if (typeof save === 'function') save();

  // 2) Tenta gravar também na tabela dedicada do Supabase (com fallback silencioso se offline ou tabela não criada)
  if (Cloud.enabled && Cloud.client && savedRecords.length) {
    try {
      const sbRows = savedRecords.map(r => ({
        id: r.id,
        date: r.date,
        user_id: r.user_id,
        mesocycle: r.mesocycle,
        week: r.week,
        workout_split: r.workout_split,
        exercise_id: r.exercise_id,
        weight_kg: r.weight_kg === '' ? null : Number(r.weight_kg),
        reps_done: r.reps_done === '' ? null : Number(r.reps_done),
        rir: r.rir,
        notes: r.notes,
      }));
      const { error } = await Cloud.client.from('workout_load_logs').upsert(sbRows, { onConflict: 'id' });
      if (error) {
        // Fallback automático já garantido via localStorage + DB.settings
        console.debug('Fallback local ativo para workout_load_logs:', error.message);
      }
    } catch (err) {
      console.debug('Modo offline/fallback em saveWorkoutLoadLog:', err?.message || err);
    }
  }

  return savedRecords;
}

/**
 * Busca o histórico de cargas por semana e por exercício para um usuário e mesociclo.
 */
async function getWorkoutLoadHistory(userId, mesocycle = 'Mesociclo 1') {
  const uidStr = String(userId || '');
  const mesoStr = String(mesocycle || 'Mesociclo 1');

  // 1) Se Supabase estiver ativo, tenta sincronizar registros da tabela workout_load_logs
  if (Cloud.enabled && Cloud.client && uidStr) {
    try {
      const { data, error } = await Cloud.client
        .from('workout_load_logs')
        .select('*')
        .eq('user_id', uidStr)
        .eq('mesocycle', mesoStr);
      if (!error && Array.isArray(data) && data.length) {
        const store = _ensureUserProgressionStore(uidStr, mesoStr);
        data.forEach(r => {
          const wkKey = 'w' + Number(r.week || 1);
          if (store) {
            store.logs[wkKey] = store.logs[wkKey] || {};
            store.logs[wkKey][r.exercise_id] = {
              kg: r.weight_kg ?? '',
              reps: r.reps_done ?? '',
              rir: r.rir || 'RIR 1 (No Alvo)',
              note: r.notes || '',
              done: true,
              date: r.date || '',
              workout_split: r.workout_split || 'A',
            };
          }
        });
      }
    } catch (err) {
      console.debug('Fallback local em getWorkoutLoadHistory:', err?.message || err);
    }
  }

  // 2) Combina dados de DB.settings[userId].loadProgression e localStorage
  const store = _ensureUserProgressionStore(uidStr, mesoStr) || { logs: {}, sessionHistory: [], schedule: null };
  const allLocalLogs = _readLocalStoreJson(LOAD_LOGS_STORAGE_KEY, []);
  const userLocalLogs = allLocalLogs.filter(x => x.user_id === uidStr && x.mesocycle === mesoStr);

  userLocalLogs.forEach(r => {
    const wkKey = 'w' + Number(r.week || 1);
    store.logs[wkKey] = store.logs[wkKey] || {};
    if (!store.logs[wkKey][r.exercise_id]) {
      store.logs[wkKey][r.exercise_id] = {
        kg: r.weight_kg ?? '',
        reps: r.reps_done ?? '',
        rir: r.rir || 'RIR 1 (No Alvo)',
        note: r.notes || '',
        done: typeof r.done === 'boolean' ? r.done : true,
        date: r.date || '',
        workout_split: r.workout_split || 'A',
        exercise_name: r.exercise_name || '',
      };
    }
  });

  const allSchedules = _readLocalStoreJson(WEEKLY_SCHED_STORAGE_KEY, {});
  if (!store.schedule && allSchedules[`${uidStr}__${mesoStr}`]) {
    store.schedule = allSchedules[`${uidStr}__${mesoStr}`];
  }

  return {
    userId: uidStr,
    mesocycle: mesoStr,
    byWeek: store.logs,
    sessionHistory: store.sessionHistory || [],
    schedule: store.schedule || null,
    rawLogs: userLocalLogs,
  };
}

/**
 * Salva o planejamento semanal dos microciclos (Semanas 1 a 4, Seg-Dom e peso corporal parcial).
 */
async function saveWeeklySchedule(userId, mesocycle = 'Mesociclo 1', scheduleData = {}) {
  const uidStr = String(userId || '');
  const mesoStr = String(mesocycle || 'Mesociclo 1');
  if (!uidStr) return null;

  const store = _ensureUserProgressionStore(uidStr, mesoStr);
  if (store) {
    store.schedule = JSON.parse(JSON.stringify(scheduleData));
    store.updatedAt = new Date().toISOString();
  }

  const allSchedules = _readLocalStoreJson(WEEKLY_SCHED_STORAGE_KEY, {});
  allSchedules[`${uidStr}__${mesoStr}`] = scheduleData;
  _writeLocalStoreJson(WEEKLY_SCHED_STORAGE_KEY, allSchedules);

  if (typeof save === 'function') save();

  if (Cloud.enabled && Cloud.client) {
    try {
      const row = {
        id: `${uidStr}__${mesoStr}`,
        user_id: uidStr,
        mesocycle: mesoStr,
        schedule_data: scheduleData,
        updated_at: new Date().toISOString(),
      };
      const { error } = await Cloud.client.from('weekly_schedules').upsert(row, { onConflict: 'id' });
      if (error) {
        console.debug('Fallback local ativo para weekly_schedules:', error.message);
      }
    } catch (err) {
      console.debug('Modo offline/fallback em saveWeeklySchedule:', err?.message || err);
    }
  }

  return scheduleData;
}

window.saveWorkoutLoadLog = saveWorkoutLoadLog;
window.getWorkoutLoadHistory = getWorkoutLoadHistory;
window.saveWeeklySchedule = saveWeeklySchedule;

