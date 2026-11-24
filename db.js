/* Camada de nuvem PersonalHUB (Supabase REST + Realtime + Polling):
   Sincronização automática multi-celular compatível com TODAS as redes (4G, 5G, Wi-Fi),
   SEM necessidade de Edge Functions ou CLI. Basta rodar supabase/schema.sql (1 tabela). */
const Cloud = (() => {
  const TABLE = 'personalhub_sync';
  const ALL_IDS = ['users', 'workouts', 'settings', 'activity', 'content'];
  const cfg = window.APP_CONFIG || window.RJOTA_CONFIG || {};

  function deriveUrlFromJwt(key) {
    try {
      const parts = String(key || '').split('.');
      if (parts.length !== 3) return '';
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(b64));
      if (json && json.iss === 'supabase' && json.ref) {
        return `https://${json.ref}.supabase.co`;
      }
    } catch { }
    return '';
  }

  function cleanUrl(u) {
    return String(u || '').trim().replace(/\/+$/, '');
  }

  let curKey = String(cfg.SUPABASE_ANON_KEY || localStorage.getItem('personalhub_supabase_key') || '').trim();
  let curUrl = cleanUrl(cfg.SUPABASE_URL || localStorage.getItem('personalhub_supabase_url') || '');
  if (!curUrl && curKey) curUrl = deriveUrlFromJwt(curKey);

  let enabled = !!(curUrl && curKey && /^https?:\/\//i.test(curUrl));
  let sb = null;
  let realtimeChannelSub = null;
  let pollTimer = null;
  let queueTimer = null;
  let busy = false;
  let pendingPush = false;
  let pendingForceAll = false;
  let lastSyncAt = 0;
  let lastSyncError = null;
  let remoteMeta = {}; // { [rowId]: updated_at_string }
  let snap = {};       // { [rowId]: jsonString }
  let workoutKeySnap = new Map();
  let settingsKeySnap = new Map();
  let dirtyUserIds = new Set();
  let dirtyWorkoutKeys = new Set();
  let dirtySettingsKeys = new Set();
  let activePushPromise = null;

  function ensureMetaFields() {
    if (typeof DB === 'undefined' || !DB) return;
    if (!DB.__deleted || typeof DB.__deleted !== 'object') DB.__deleted = { users: {}, activity: {}, content: {} };
    if (!DB.__deleted.users) DB.__deleted.users = {};
    if (!DB.__deleted.activity) DB.__deleted.activity = {};
    if (!DB.__deleted.content) DB.__deleted.content = {};
    if (!DB.__workoutTs || typeof DB.__workoutTs !== 'object') DB.__workoutTs = {};
    if (!DB.__settingsTs || typeof DB.__settingsTs !== 'object') DB.__settingsTs = {};
    if (!DB.workouts || typeof DB.workouts !== 'object') DB.workouts = {};
    if (!DB.settings || typeof DB.settings !== 'object') DB.settings = {};
    if (!Array.isArray(DB.users)) DB.users = [];
    ['templates', 'checkins', 'water', 'logs', 'cardio', 'weights', 'posts', 'messages', 'tips', 'foods'].forEach(k => {
      if (!Array.isArray(DB[k])) DB[k] = [];
    });
  }

  function emptyDB() {
    return {
      users: [],
      workouts: {},
      templates: [],
      checkins: [],
      water: [],
      logs: [],
      cardio: [],
      weights: [],
      posts: [],
      messages: [],
      tips: [],
      foods: [],
      settings: {},
      __deleted: { users: {}, activity: {}, content: {} },
      __workoutTs: {},
      __settingsTs: {},
    };
  }

  function packRow(id) {
    ensureMetaFields();
    if (id === 'users') {
      return { items: DB.users || [], deleted: DB.__deleted.users || {} };
    }
    if (id === 'workouts') {
      return { map: DB.workouts || {}, ts: DB.__workoutTs || {} };
    }
    if (id === 'settings') {
      return { map: DB.settings || {}, ts: DB.__settingsTs || {} };
    }
    if (id === 'activity') {
      return {
        checkins: DB.checkins || [],
        water: DB.water || [],
        logs: DB.logs || [],
        cardio: DB.cardio || [],
        weights: DB.weights || [],
        messages: DB.messages || [],
        deleted: DB.__deleted.activity || {},
      };
    }
    if (id === 'content') {
      return {
        posts: DB.posts || [],
        templates: DB.templates || [],
        foods: DB.foods || [],
        tips: DB.tips || [],
        deleted: DB.__deleted.content || {},
      };
    }
    return {};
  }

  function mergeDeletedMaps(a = {}, b = {}) {
    const out = { ...(a || {}) };
    Object.entries(b || {}).forEach(([k, v]) => {
      const ts = Number(v) || 0;
      if (!out[k] || ts > Number(out[k])) out[k] = ts;
    });
    return out;
  }

  function mergeArrayById(remoteArr = [], localArr = [], mergedDel = {}, opts = {}) {
    const byId = new Map();
    const byEmail = new Map();
    const dedupeEmail = !!opts.dedupeEmail;
    const priorityLocalIds = opts.priorityLocalIds || null;

    const consider = (item, isLocal) => {
      if (!item || typeof item !== 'object') return;
      const itemId = item.id;
      if (!itemId) return;
      const delTs = Number(mergedDel[itemId] || 0);
      const itemTs = Number(item.updatedAt || item.createdAt || 0);
      if (delTs && delTs >= itemTs) return;

      const em = dedupeEmail && item.email ? String(item.email).trim().toLowerCase() : '';
      const existing = byId.get(itemId) || (em ? byEmail.get(em) : null);

      if (!existing) {
        const copy = { ...item };
        byId.set(copy.id, copy);
        if (em) byEmail.set(em, copy);
        return;
      }

      const exTs = Number(existing.updatedAt || existing.createdAt || 0);
      const localForced = isLocal && priorityLocalIds && priorityLocalIds.has(itemId);
      const shouldReplace = localForced || itemTs > exTs || (itemTs === exTs && !isLocal);

      if (shouldReplace) {
        const merged = { ...existing, ...item };
        if (!merged.plainPw && existing.plainPw) merged.plainPw = existing.plainPw;
        if (!merged.hash && existing.hash) { merged.hash = existing.hash; merged.salt = existing.salt; }
        byId.delete(existing.id);
        byId.set(merged.id, merged);
        if (em) byEmail.set(em, merged);
      } else {
        if (!existing.plainPw && item.plainPw) existing.plainPw = item.plainPw;
      }
    };

    (Array.isArray(remoteArr) ? remoteArr : []).forEach(x => consider(x, false));
    (Array.isArray(localArr) ? localArr : []).forEach(x => consider(x, true));
    return [...byId.values()];
  }

  function mergeKeyedMap(remoteMap = {}, remoteTs = {}, localMap = {}, localTs = {}, dirtyKeys = new Set(), deletedUsers = {}) {
    const outMap = {};
    const outTs = {};
    const allKeys = new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})]);

    allKeys.forEach(k => {
      const rTs = Number(remoteTs?.[k] || 0);
      const lTs = Number(localTs?.[k] || 0);
      const delTs = Number(deletedUsers?.[k] || 0);
      if (delTs && delTs >= Math.max(rTs, lTs)) return;

      const hasR = Object.prototype.hasOwnProperty.call(remoteMap || {}, k);
      const hasL = Object.prototype.hasOwnProperty.call(localMap || {}, k);

      if (hasL && (!hasR || dirtyKeys.has(k) || lTs > rTs)) {
        outMap[k] = localMap[k];
        outTs[k] = Math.max(lTs, rTs, dirtyKeys.has(k) ? Date.now() : 0);
      } else if (hasR) {
        outMap[k] = remoteMap[k];
        outTs[k] = rTs;
      }
    });

    return { map: outMap, ts: outTs };
  }

  function applyMergedRow(id, remoteData, preferRemote = false) {
    ensureMetaFields();
    if (!remoteData || typeof remoteData !== 'object') return;

    if (id === 'users') {
      const mergedDel = mergeDeletedMaps(remoteData.deleted, DB.__deleted.users);
      DB.__deleted.users = mergedDel;
      const localItems = preferRemote && !dirtyUserIds.size ? [] : (DB.users || []);
      DB.users = mergeArrayById(remoteData.items || [], localItems, mergedDel, {
        dedupeEmail: true,
        priorityLocalIds: dirtyUserIds,
      });
      return;
    }

    if (id === 'workouts') {
      const merged = mergeKeyedMap(
        remoteData.map || {},
        remoteData.ts || {},
        preferRemote && !dirtyWorkoutKeys.size ? {} : (DB.workouts || {}),
        DB.__workoutTs || {},
        dirtyWorkoutKeys,
        DB.__deleted.users
      );
      DB.workouts = merged.map;
      DB.__workoutTs = merged.ts;
      return;
    }

    if (id === 'settings') {
      const merged = mergeKeyedMap(
        remoteData.map || {},
        remoteData.ts || {},
        preferRemote && !dirtySettingsKeys.size ? {} : (DB.settings || {}),
        DB.__settingsTs || {},
        dirtySettingsKeys,
        DB.__deleted.users
      );
      DB.settings = merged.map;
      DB.__settingsTs = merged.ts;
      return;
    }

    if (id === 'activity') {
      const mergedDel = mergeDeletedMaps(remoteData.deleted, DB.__deleted.activity);
      DB.__deleted.activity = mergedDel;
      ['checkins', 'water', 'logs', 'cardio', 'weights', 'messages'].forEach(k => {
        DB[k] = mergeArrayById(remoteData[k] || [], DB[k] || [], mergedDel);
      });
      return;
    }

    if (id === 'content') {
      const mergedDel = mergeDeletedMaps(remoteData.deleted, DB.__deleted.content);
      DB.__deleted.content = mergedDel;
      ['posts', 'templates', 'foods', 'tips'].forEach(k => {
        DB[k] = mergeArrayById(remoteData[k] || [], DB[k] || [], mergedDel);
      });
    }
  }

  function detectKeyChanges() {
    ensureMetaFields();
    const now = Date.now();
    // Detecta alterações por aluno em workouts
    const wKeys = new Set([...workoutKeySnap.keys(), ...Object.keys(DB.workouts || {})]);
    wKeys.forEach(k => {
      const curStr = JSON.stringify(DB.workouts[k] ?? null);
      if (workoutKeySnap.get(k) !== curStr) {
        dirtyWorkoutKeys.add(k);
        DB.__workoutTs[k] = now;
      }
    });
    // Detecta alterações por usuário em settings
    const sKeys = new Set([...settingsKeySnap.keys(), ...Object.keys(DB.settings || {})]);
    sKeys.forEach(k => {
      const curStr = JSON.stringify(DB.settings[k] ?? null);
      if (settingsKeySnap.get(k) !== curStr) {
        dirtySettingsKeys.add(k);
        DB.__settingsTs[k] = now;
      }
    });
  }

  function takeSnapshot(ids = ALL_IDS) {
    ensureMetaFields();
    ids.forEach(id => {
      snap[id] = JSON.stringify(packRow(id));
      if (id === 'workouts') {
        workoutKeySnap = new Map(Object.entries(DB.workouts || {}).map(([k, v]) => [k, JSON.stringify(v ?? null)]));
        dirtyWorkoutKeys.clear();
      }
      if (id === 'settings') {
        settingsKeySnap = new Map(Object.entries(DB.settings || {}).map(([k, v]) => [k, JSON.stringify(v ?? null)]));
        dirtySettingsKeys.clear();
      }
      if (id === 'users') {
        dirtyUserIds.clear();
      }
    });
  }

  function saveLocalCacheSilently() {
    if (typeof DB === 'undefined' || !DB) return;
    try {
      const keyName = typeof KEY !== 'undefined' ? KEY : 'personalhub_db_v1';
      localStorage.setItem(keyName, JSON.stringify(DB));
    } catch { }
    try {
      const keyName = typeof KEY !== 'undefined' ? KEY : 'personalhub_db_v1';
      if (typeof IDB !== 'undefined' && IDB?.set) IDB.set(keyName, DB).catch(() => {});
    } catch { }
  }

  /* ---------- Cliente HTTPS REST direto (independe de CDN ou WebSocket) ---------- */
  async function restFetch(path, opts = {}, timeoutMs = 12000) {
    if (!curUrl || !curKey) throw new Error('Supabase não configurado.');
    const url = `${curUrl}/rest/v1/${path}`;
    const isJwtKey = String(curKey || '').split('.').length === 3;
    const headers = {
      apikey: curKey,
      ...(isJwtKey ? { Authorization: `Bearer ${curKey}` } : {}),
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        ...opts,
        headers,
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) {
        let msg = `Erro HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          msg = errJson?.message || errJson?.error || errJson?.hint || msg;
          if (/relation.*personalhub_sync.*does not exist|Could not find the table/i.test(msg)) {
            msg = 'Tabela "personalhub_sync" ainda não foi criada no Supabase. Rode o SQL de supabase/schema.sql no SQL Editor!';
          }
        } catch { }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const txt = await res.text();
      return txt ? JSON.parse(txt) : [];
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Tempo esgotado ao conectar na nuvem. Verifique sua internet.');
      throw e;
    } finally {
      if (tid) clearTimeout(tid);
    }
  }

  async function fetchRemoteRows(ids = null) {
    const filter = Array.isArray(ids) && ids.length
      ? `&id=in.(${ids.map(x => encodeURIComponent(x)).join(',')})`
      : '';
    return restFetch(`${TABLE}?select=id,data,updated_at${filter}`, { method: 'GET' });
  }

  async function fetchRemoteMeta() {
    return restFetch(`${TABLE}?select=id,updated_at`, { method: 'GET' }, 8000);
  }

  async function upsertRemoteRows(rows) {
    return restFetch(TABLE, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows),
    });
  }

  /* ---------- Realtime (WebSocket) + Polling leve (funciona em 100% das redes móveis) ---------- */
  function setupRealtimeAndPolling() {
    stopRealtimeAndPolling();
    if (!enabled) return;

    // 1) WebSocket Realtime via supabase-js (se o CDN estiver disponível)
    if (window.supabase?.createClient) {
      try {
        sb = window.supabase.createClient(curUrl, curKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        realtimeChannelSub = sb
          .channel('personalhub-sync-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, payload => {
            const rowId = payload?.new?.id || payload?.old?.id;
            const rowUpd = payload?.new?.updated_at;
            if (rowId && rowUpd && remoteMeta[rowId] === rowUpd) return;
            handleIncomingCloudSignal(rowId ? [rowId] : ALL_IDS);
          })
          .subscribe();
      } catch (e) {
        console.debug('Realtime WebSocket fallback para polling HTTPS:', e?.message || e);
      }
    }

    // 2) Polling leve por metadados (a cada 10s, ~200 bytes) — garante sincronia mesmo em redes 4G/5G que bloqueiam WebSockets
    pollTimer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (busy) return;
      try {
        const metaRows = await fetchRemoteMeta();
        if (!Array.isArray(metaRows)) return;
        const changedIds = [];
        metaRows.forEach(r => {
          if (r.id && r.updated_at && remoteMeta[r.id] !== r.updated_at) {
            changedIds.push(r.id);
          }
        });
        if (changedIds.length) {
          await pullAll({ ids: changedIds, silentUiRefresh: false });
        }
      } catch { }
    }, 10000);
  }

  function stopRealtimeAndPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (sb && realtimeChannelSub) {
      try { sb.removeChannel(realtimeChannelSub); } catch { }
      realtimeChannelSub = null;
    }
    sb = null;
  }

  let incomingTimer = null;
  function handleIncomingCloudSignal(ids) {
    clearTimeout(incomingTimer);
    incomingTimer = setTimeout(async () => {
      if (busy) return;
      try {
        await pullAll({ ids, silentUiRefresh: false });
      } catch { }
    }, 250);
  }

  function refreshUiAfterPull() {
    if (typeof S === 'undefined' || !S) return;
    if (S.user && Array.isArray(DB?.users)) {
      const updatedMe = DB.users.find(u => u.id === S.user.id);
      if (updatedMe) {
        if (!updatedMe.active) {
          S.user = null;
          try { sessionStorage.removeItem('personalhub_sess'); localStorage.removeItem('personalhub_sess'); } catch { }
          if (typeof render === 'function') render();
          if (typeof toast === 'function') toast('Conta desativada pela administração.');
          return;
        }
        S.user = updatedMe;
      }
    }
    if (typeof document !== 'undefined') {
      const isModalOpen = !!document.getElementById('modal');
      const isTyping = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (!isModalOpen && !isTyping && typeof render === 'function' && S.user) {
        render();
      }
    }
  }

  /* ---------- Operações Principais: Pull & Push com Merge Sem Conflitos ---------- */
  async function pullAll(opts = {}) {
    if (!enabled) return { hasRemoteData: false, updated: false };
    const ids = opts.ids || ALL_IDS;
    const rows = await fetchRemoteRows(opts.ids || null);
    if (!Array.isArray(rows) || rows.length === 0) {
      lastSyncAt = Date.now();
      lastSyncError = null;
      return { hasRemoteData: false, updated: false };
    }

    if (typeof DB === 'undefined' || !DB) DB = emptyDB();
    ensureMetaFields();

    const fetchedIds = [];
    rows.forEach(r => {
      if (!r || !r.id) return;
      remoteMeta[r.id] = r.updated_at || new Date().toISOString();
      applyMergedRow(r.id, r.data, !!opts.preferRemote);
      fetchedIds.push(r.id);
    });

    // Garante sementes de alimentos/dicas caso o banco venha sem eles
    if ((!DB.foods || !DB.foods.length) && typeof FOODS_SEED !== 'undefined') DB.foods = FOODS_SEED;
    if ((!DB.tips || !DB.tips.length) && typeof TIPS_SEED !== 'undefined') DB.tips = TIPS_SEED;

    takeSnapshot(fetchedIds.length ? fetchedIds : ids);
    saveLocalCacheSilently();
    lastSyncAt = Date.now();
    lastSyncError = null;

    if (!opts.silentUiRefresh) refreshUiAfterPull();
    return { hasRemoteData: true, updated: true, count: rows.length };
  }

  async function syncNow(forceAll = false) {
    if (!enabled) return false;
    if (typeof DB === 'undefined' || !DB) return false;
    clearTimeout(queueTimer);

    if (busy) {
      pendingPush = true;
      if (forceAll) pendingForceAll = true;
      return activePushPromise || Promise.resolve(true);
    }

    busy = true;
    activePushPromise = (async () => {
      try {
        ensureMetaFields();
        detectKeyChanges();

        const dirtyIds = ALL_IDS.filter(id => {
          if (forceAll) return true;
          const curStr = JSON.stringify(packRow(id));
          return snap[id] !== curStr;
        });

        if (!dirtyIds.length) {
          lastSyncAt = Date.now();
          lastSyncError = null;
          return true;
        }

        // 1) Busca estado remoto atual apenas das coleções alteradas para fazer merge seguro (evita sobrescrever outros celulares!)
        let remoteRows = [];
        try {
          remoteRows = await fetchRemoteRows(dirtyIds);
        } catch (err) {
          // Se falhou ao buscar, propaga erro para manter pendingPush
          throw err;
        }
        const remoteById = new Map((Array.isArray(remoteRows) ? remoteRows : []).map(r => [r.id, r]));

        const nowIso = new Date().toISOString();
        const payloadToUpsert = [];

        dirtyIds.forEach(id => {
          const remoteRow = remoteById.get(id);
          if (remoteRow?.data) {
            applyMergedRow(id, remoteRow.data, false);
          }
          const packed = packRow(id);
          payloadToUpsert.push({ id, data: packed, updated_at: nowIso });
        });

        // 2) Grava no Supabase
        const savedRows = await upsertRemoteRows(payloadToUpsert);
        (Array.isArray(savedRows) ? savedRows : payloadToUpsert).forEach(r => {
          if (r?.id) remoteMeta[r.id] = r.updated_at || nowIso;
        });

        takeSnapshot(dirtyIds);
        saveLocalCacheSilently();
        lastSyncAt = Date.now();
        lastSyncError = null;
        return true;
      } catch (e) {
        lastSyncError = e?.message || 'Erro de sincronização';
        console.error('Cloud syncNow error:', e);
        return false;
      } finally {
        busy = false;
        activePushPromise = null;
        if (pendingPush) {
          const nextForce = pendingForceAll;
          pendingPush = false;
          pendingForceAll = false;
          syncNow(nextForce);
        }
      }
    })();

    return activePushPromise;
  }

  function initClient(url, key) {
    curKey = String(key || '').trim();
    curUrl = cleanUrl(url || '');
    if (!curUrl && curKey) curUrl = deriveUrlFromJwt(curKey);
    enabled = !!(curUrl && curKey && /^https?:\/\//i.test(curUrl));
    remoteMeta = {};
    snap = {};
    if (enabled) {
      setupRealtimeAndPolling();
    } else {
      stopRealtimeAndPolling();
    }
    return enabled;
  }

  if (enabled) initClient(curUrl, curKey);

  return {
    get enabled() { return enabled; },
    get client() { return sb; },
    get status() {
      return {
        enabled,
        url: curUrl,
        lastSyncAt,
        lastSyncError,
      };
    },
    getConfig() { return { url: curUrl, key: curKey }; },

    markUserDirty(id) {
      if (id) dirtyUserIds.add(id);
    },

    markDeleted(bucket, id) {
      if (!id) return;
      ensureMetaFields();
      const b = ['users', 'activity', 'content'].includes(bucket) ? bucket : 'users';
      DB.__deleted[b][id] = Date.now();
    },

    async testConnection(url, key) {
      const prevUrl = curUrl, prevKey = curKey, prevEnabled = enabled;
      try {
        curUrl = cleanUrl(url);
        curKey = String(key || '').trim();
        if (!curUrl && curKey) curUrl = deriveUrlFromJwt(curKey);
        if (!curUrl || !curKey) throw new Error('Preencha a Project URL e a Anon Public Key do Supabase.');
        await fetchRemoteMeta();
        return { ok: true, url: curUrl, key: curKey };
      } finally {
        curUrl = prevUrl; curKey = prevKey; enabled = prevEnabled;
      }
    },

    async connect(url, key) {
      const tested = await this.testConnection(url, key);
      localStorage.setItem('personalhub_supabase_url', tested.url);
      localStorage.setItem('personalhub_supabase_key', tested.key);
      initClient(tested.url, tested.key);

      // Puxa o que já existir na nuvem e faz merge com os dados atuais do dispositivo (não perde cadastros já feitos!)
      const res = await pullAll({ silentUiRefresh: true });
      if (typeof DB === 'undefined' || !DB || !Array.isArray(DB.users) || !DB.users.length) {
        if (typeof seed === 'function') await seed();
      }
      if (typeof ensureAllFinancesAndMigrate === 'function') await ensureAllFinancesAndMigrate();
      // Garante que todos os cadastros locais (ex.: CEO, professores e alunos criados antes) subam imediatamente para a nuvem!
      await syncNow(true);
      return { ok: true, hadRemote: res.hasRemoteData };
    },

    async disconnect() {
      localStorage.removeItem('personalhub_supabase_url');
      localStorage.removeItem('personalhub_supabase_key');
      initClient('', '');
      return true;
    },

    queue() {
      if (!enabled) return;
      clearTimeout(queueTimer);
      queueTimer = setTimeout(() => { syncNow(false); }, 350);
    },

    syncNow,
    pullAll,

    async login(email, pw) {
      const em = String(email || '').trim().toLowerCase();
      // 1) Sempre busca a lista de usuários mais recente da nuvem ANTES de validar o login!
      //    Assim qualquer Professor criado pelo CEO ou Aluno criado pelo Professor entra NA HORA de qualquer celular/rede.
      const pullRes = await pullAll({ ids: ['users'], preferRemote: true, silentUiRefresh: true });
      if (!pullRes.hasRemoteData) {
        // Primeiro acesso na nuvem vazia: inicializa o banco padrão e envia para a nuvem
        if (typeof syncFromLocalStore === 'function') await syncFromLocalStore();
        if (!DB || !Array.isArray(DB.users) || !DB.users.length) {
          if (typeof seed === 'function') await seed();
        }
        if (typeof ensureAllFinancesAndMigrate === 'function') await ensureAllFinancesAndMigrate();
        await syncNow(true);
      }

      const u = (DB?.users || []).find(x => (x.email || '').trim().toLowerCase() === em);
      if (!u) {
        throw new Error(`E-mail "${em}" não encontrado na nuvem. Verifique se o e-mail está correto ou peça ao CEO/Professor para verificar o cadastro.`);
      }
      const ok = typeof verifyUserPassword === 'function' ? await verifyUserPassword(u, pw) : (u.plainPw === pw);
      if (!ok) {
        throw new Error(`Senha incorreta para ${u.name}. Verifique letras maiúsculas/minúsculas ou peça a redefinição de senha.`);
      }
      if (!u.active) {
        throw new Error('Conta desativada. Fale com a administração.');
      }

      // 2) Baixa treinos, cargas, financeiro, mensagens e comunidade da nuvem
      await pullAll({ preferRemote: true, silentUiRefresh: true });
      const freshUser = (DB?.users || []).find(x => x.id === u.id) || u;

      try {
        sessionStorage.setItem('personalhub_sess', freshUser.id);
        localStorage.setItem('personalhub_sess', freshUser.id);
      } catch { }
      setupRealtimeAndPolling();
      return freshUser;
    },

    async restore() {
      if (!enabled) return null;
      let res = { hasRemoteData: false };
      try {
        res = await pullAll({ preferRemote: true, silentUiRefresh: true });
      } catch (err) {
        // Sem internet no momento (ex.: academia sem sinal): usa cache local offline
        console.warn('Cloud offline no boot, usando cache local:', err?.message || err);
        if (typeof syncFromLocalStore === 'function') await syncFromLocalStore();
      }

      if (!res.hasRemoteData && (!DB || !Array.isArray(DB.users) || !DB.users.length)) {
        if (typeof syncFromLocalStore === 'function') await syncFromLocalStore();
        if (!DB || !Array.isArray(DB.users) || !DB.users.length) {
          if (typeof seed === 'function') await seed();
        }
        if (typeof ensureAllFinancesAndMigrate === 'function') await ensureAllFinancesAndMigrate();
        syncNow(true).catch(() => {});
      }

      const sid = sessionStorage.getItem('personalhub_sess') || localStorage.getItem('personalhub_sess');
      if (!sid) return null;
      const u = (DB?.users || []).find(x => x.id === sid);
      if (!u || !u.active) {
        try { sessionStorage.removeItem('personalhub_sess'); localStorage.removeItem('personalhub_sess'); } catch { }
        return null;
      }
      setupRealtimeAndPolling();
      return u;
    },

    async logout() {
      try { await syncNow(false); } catch { }
      try { sessionStorage.removeItem('personalhub_sess'); localStorage.removeItem('personalhub_sess'); } catch { }
    },

    async refresh() {
      if (!enabled || busy) return;
      try {
        await syncNow(false);
        await pullAll({ silentUiRefresh: false });
      } catch (e) {
        console.error('Cloud refresh error:', e);
      }
    },

    async analyzeMealEdge(payload) {
      if (!sb) throw new Error('Edge Function indisponível.');
      const { data, error } = await sb.functions.invoke('analyze-meal', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Cloud.enabled) Cloud.refresh();
  });
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('online', () => {
    if (Cloud.enabled) Cloud.refresh();
  });
}

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
 * Sincroniza automaticamente na nuvem via DB.settings -> save() -> Cloud.queue().
 */
async function saveWorkoutLoadLog(logData) {
  const entries = Array.isArray(logData?.entries) ? logData.entries : [logData];
  const savedRecords = [];
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
  return savedRecords;
}

/**
 * Busca o histórico de cargas por semana e por exercício para um usuário e mesociclo.
 */
async function getWorkoutLoadHistory(userId, mesocycle = 'Mesociclo 1') {
  const uidStr = String(userId || '');
  const mesoStr = String(mesocycle || 'Mesociclo 1');

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
  return scheduleData;
}

window.saveWorkoutLoadLog = saveWorkoutLoadLog;
window.getWorkoutLoadHistory = getWorkoutLoadHistory;
window.saveWeeklySchedule = saveWeeklySchedule;
