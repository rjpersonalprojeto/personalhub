/* PersonalHUB — Plataforma Multi-Personal Trainer & Alunos (SPA + PWA).
   Perfis: CEO (Admin Geral) | Professor (Personal Trainer) | Aluno (Cliente). */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9));
const day = (d = new Date()) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const addDays = (n, d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = s => String(s || '').split('-').reverse().join('/');
const toast = m => { const t = $('#toast'); if (!t) return; t.textContent = m; t.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3000); };
const BRAND = () => (window.APP_CONFIG && window.APP_CONFIG.BRAND_NAME) || 'PersonalHUB';
const cleanPhone = p => String(p || '').replace(/\D/g, '');
const waUrl = p => { const d = cleanPhone(p); return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : ''; };

/* ---------- Segurança: hash SHA-256 com salt (modo local/demo) ---------- */
async function hash(pw, salt) {
  const str = String(salt || '') + String(pw || '');
  try {
    if (window.crypto?.subtle?.digest) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch { }
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

async function verifyUserPassword(u, rawPw) {
  if (!u) return false;
  const p = String(rawPw ?? '');
  const pTrim = p.trim();
  if (u.plainPw && (u.plainPw === p || u.plainPw === pTrim)) return true;
  if (await hash(p, u.salt) === u.hash) return true;
  if (pTrim !== p && await hash(pTrim, u.salt) === u.hash) return true;
  return false;
}

/* ---------- Banco de dados (localStorage / IndexedDB / Supabase) ---------- */
const KEY = 'personalhub_db_v1';
let DB, S = { user: null, view: 'home', param: null, calcGrams: null, plate: [] };

/* IndexedDB robusto para celulares: evita erro de cota (QuotaExceededError) ao salvar fotos no Android */
const IDB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    return new Promise(resolve => {
      let done = false;
      const finish = res => { if (!done) { done = true; resolve(res); } };
      const timer = setTimeout(() => finish(null), 250);
      try {
        if (!window.indexedDB) return finish(null);
        const req = indexedDB.open('personalhub_store_v1', 1);
        req.onupgradeneeded = e => {
          try {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('store')) d.createObjectStore('store');
          } catch { }
        };
        req.onsuccess = e => { clearTimeout(timer); this.db = e.target.result; finish(this.db); };
        req.onerror = () => { clearTimeout(timer); finish(null); };
        req.onblocked = () => { clearTimeout(timer); finish(null); };
      } catch { finish(null); }
    });
  },
  async get(k) {
    try {
      const db = await this.open();
      if (!db) return null;
      return new Promise(resolve => {
        let done = false;
        const finish = res => { if (!done) { done = true; resolve(res); } };
        const timer = setTimeout(() => finish(null), 250);
        try {
          const tx = db.transaction('store', 'readonly');
          const req = tx.objectStore('store').get(k);
          req.onsuccess = () => { clearTimeout(timer); finish(req.result || null); };
          req.onerror = () => { clearTimeout(timer); finish(null); };
        } catch { finish(null); }
      });
    } catch { return null; }
  },
  async set(k, v) {
    try {
      const db = await this.open();
      if (!db) return false;
      return new Promise(resolve => {
        let done = false;
        const finish = res => { if (!done) { done = true; resolve(res); } };
        const timer = setTimeout(() => finish(null), 500);
        try {
          const tx = db.transaction('store', 'readwrite');
          tx.objectStore('store').put(v, k);
          tx.oncomplete = () => { clearTimeout(timer); finish(true); };
          tx.onerror = () => { clearTimeout(timer); finish(false); };
        } catch { finish(false); }
      });
    } catch { return false; }
  }
};

/* Captura de instalação do PWA (Android / Chrome / Edge) */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.querySelectorAll('.btn-install-pwa').forEach(b => b.style.display = 'inline-flex');
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  toast('PersonalHUB instalado com sucesso! 🎉');
});

async function installPwa() {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        toast('PersonalHUB está sendo instalado na sua tela inicial! 🎉');
      }
      deferredInstallPrompt = null;
      return;
    } catch { }
  }
  modal(`<h2>📲 Instalar PersonalHUB no Celular</h2>
  <div style="display:flex;align-items:center;gap:12px;margin:8px 0 12px;background:#101518;padding:10px 12px;border-radius:12px;border:1px solid var(--line)">
    <img src="logo.jpg" style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:1.5px solid var(--gold)" alt="PersonalHUB">
    <div>
      <b style="font-size:1rem;color:#fff">PersonalHUB</b>
      <span class="mut" style="display:block;font-size:.76rem">App Oficial · Treinos, Nutrição e Comunidade</span>
    </div>
  </div>
  <p class="mut" style="margin-bottom:10px;font-size:.82rem">Você pode instalar o PersonalHUB direto pelo navegador no seu celular para treinar em tela cheia:</p>
  
  <div class="card" style="margin-bottom:8px">
    <b class="gold" style="font-size:.88rem">🤖 No Android (Google Chrome / Samsung):</b>
    <p class="mut" style="margin-top:4px;font-size:.8rem;line-height:1.4">
      1. Toque nos <b>3 pontinhos (⋮)</b> no canto superior direito do navegador.<br>
      2. Toque em <b>"Instalar aplicativo"</b> ou <b>"Adicionar à tela inicial"</b>.<br>
      3. O ícone oficial com a logo verde aparecerá direto na tela do seu celular!
    </p>
  </div>

  <div class="card" style="margin-bottom:8px">
    <b class="gold" style="font-size:.88rem">🍎 No iPhone (Safari):</b>
    <p class="mut" style="margin-top:4px;font-size:.8rem;line-height:1.4">
      1. Toque no botão de <b>Compartilhar</b> (ícone do quadrado com a seta para cima ⎋).<br>
      2. Role para baixo e selecione <b>"Adicionar à Tela de Início"</b>.<br>
      3. Toque em <b>Adicionar</b> no canto superior direito.
    </p>
  </div>

  <div class="card">
    <b class="gold" style="font-size:.88rem">💻 No Computador (Chrome / Edge):</b>
    <p class="mut" style="margin-top:4px;font-size:.8rem;line-height:1.4">Clique no ícone de computador com seta para baixo na barra de endereços do navegador e clique em <b>Instalar</b>.</p>
  </div>

  <button class="btn block" style="margin-top:12px" onclick="closeModal()">Entendido</button>`);
}

const TIPS_SEED = [
  ['Cortar o açúcar ajuda a reduzir peso e desinchar', 'O açúcar em excesso aumenta a retenção de líquido e o armazenamento de gordura. Troque refrigerantes e doces por água, frutas e chás sem açúcar.'],
  ['Beba mais água para reduzir a retenção de líquidos', 'Quanto mais hidratado, menos o corpo retém água. Use a meta diária do app (35 ml por kg de peso corporal).'],
  ['Reduza sódio e ultraprocessados', 'Embutidos, temperos prontos e salgadinhos têm muito sal e causam inchaço. Prefira temperos naturais como alho, cebola e ervas.'],
  ['Proteína em todas as refeições aumenta a saciedade', 'Ovos, frango, peixe, iogurte e leguminosas ajudam a controlar a fome e preservar a massa muscular no emagrecimento.'],
  ['Durma bem: sono ruim atrapalha o emagrecimento', 'Dormir menos de 7h desregula hormônios da fome (grelina e leptina) e aumenta a vontade de doces.'],
  ['Prefira alimentos naturais e fibras', 'Frutas, verduras, aveia e grãos integrais melhoram a digestão, desincham e prolongam a saciedade.'],
].map(([t, b]) => ({ id: uid(), owner: null, title: t, body: b }));

const LIB_RAW = `Supino reto|Peito
Supino inclinado|Peito
Crucifixo|Peito
Flexão de braço|Peito
Puxada frontal|Costas
Remada curvada|Costas
Remada baixa|Costas
Barra fixa|Costas
Agachamento livre|Pernas
Leg press 45°|Pernas
Cadeira extensora|Pernas
Mesa flexora|Pernas
Afundo|Pernas
Stiff|Pernas
Elevação pélvica|Glúteos
Panturrilha em pé|Pernas
Desenvolvimento com halteres|Ombros
Elevação lateral|Ombros
Rosca direta|Bíceps
Rosca martelo|Bíceps
Tríceps corda|Tríceps
Tríceps testa|Tríceps
Abdominal supra|Abdômen
Prancha|Abdômen
Abdominal infra|Abdômen`;
const LIBRARY = LIB_RAW.split('\n').map(l => { const [name, group] = l.split('|'); return { name, group }; });
const mkEx = (name, group, sets, reps, load, rest) => ({ id: uid(), name, group, sets, reps, load, rest, notes: '', media: '' });

/* ---------- Helpers Financeiros & Reajustes ---------- */
const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function addMonthsIso(isoDate, months = 1) {
  const base = isoDate ? new Date(isoDate + 'T12:00:00') : new Date();
  if (isNaN(base.getTime())) return day(addDays(30 * months));
  const targetDay = base.getDate();
  base.setMonth(base.getMonth() + months);
  if (base.getDate() < targetDay) base.setDate(0);
  return day(base);
}

function getFinDefaults() {
  DB.settings = DB.settings || {};
  if (!DB.settings.__fin_defaults__) {
    DB.settings.__fin_defaults__ = {
      trainerFee: 149.90,
      autoStudentFee: 59.90,
      trainerStudentFee: 180.00,
    };
  }
  return DB.settings.__fin_defaults__;
}

function getBankAccountConfig() {
  DB.settings = DB.settings || {};
  const ceoUser = (DB.users || []).find(u => u.role === 'ceo' || u.role === 'admin');
  const ceoSavedBank = ceoUser && DB.settings[ceoUser.id]?.bankAccount;
  if (!DB.settings.__bank_account__) {
    DB.settings.__bank_account__ = ceoSavedBank || {
      bankName: '260 - Nu Pagamentos S.A. (Nubank)',
      accountType: 'Conta Corrente',
      agency: '0001',
      accountNumber: '9845120-7',
      holderName: 'PersonalHUB Gestão Esportiva LTDA',
      holderDoc: '48.123.456/0001-90',
      pixKeyType: 'E-mail',
      pixKey: 'financeiro@personalhub.com',
      city: 'SAO PAULO',
      allowPix: true,
      allowCredit: true,
      allowDebit: true,
      maxInstallments: 6,
      updatedAt: day(),
    };
  }
  return DB.settings.__bank_account__;
}

function getReceivingBankForUser(u) {
  const globalBank = getBankAccountConfig();
  if (u?.finance?.recipientBank && u.finance.recipientBank.accountNumber) {
    return { ...globalBank, ...u.finance.recipientBank };
  }
  return globalBank;
}

function buildPixPayload(bank, amount, txId = 'PHUB01') {
  const key = String(bank?.pixKey || 'financeiro@personalhub.com').trim();
  const name = String(bank?.holderName || 'PERSONALHUB').normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 25).toUpperCase();
  const city = String(bank?.city || 'SAO PAULO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 15).toUpperCase();
  const amtStr = Number(amount || 0).toFixed(2);
  const f = (id, val) => id + String(val.length).padStart(2, '0') + val;
  const gui = f('00', 'br.gov.bcb.pix') + f('01', key);
  const mai = f('26', gui);
  const addData = f('62', f('05', String(txId).replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'PHUB01'));
  const raw = '000201' + mai + '520400005303986' + f('54', amtStr) + '5802BR' + f('59', name) + f('60', city) + addData + '6304';
  let crc = 0xFFFF;
  for (let i = 0; i < raw.length; i++) {
    crc ^= raw.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
  }
  return raw + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function renderPixQrSvg(payload) {
  const size = 25;
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = (border || inner) ? 1 : 0;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);
  let seedVal = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    seedVal ^= payload.charCodeAt(i);
    seedVal = Math.imul(seedVal, 16777619);
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inF1 = r < 8 && c < 8;
      const inF2 = r < 8 && c >= size - 8;
      const inF3 = r >= size - 8 && c < 8;
      if (inF1 || inF2 || inF3) continue;
      if (r === 6 || c === 6) { grid[r][c] = (r + c) % 2 === 0 ? 1 : 0; continue; }
      seedVal ^= (r * 31 + c * 17) + payload.charCodeAt((r * size + c) % payload.length);
      seedVal = Math.imul(seedVal, 16777619);
      grid[r][c] = (Math.abs(seedVal) % 10) < 5 ? 1 : 0;
    }
  }
  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#0b1014"/>`;
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" style="width:100%;height:100%;shape-rendering:crispEdges">${rects}</svg>`;
}

function getDefaultFeeForUser(u) {
  const defs = getFinDefaults();
  if (u?.role === 'trainer') return +(defs.trainerFee || 149.90);
  if (u?.autonomous || !u?.trainerId) return +(defs.autoStudentFee || 59.90);
  const trSet = u?.trainerId && DB.settings?.[u.trainerId]?.defaultStudentFee;
  return +(trSet || defs.trainerStudentFee || 180.00);
}

function ensureUserFinance(u, fallbackOverride = {}) {
  if (!u || u.role === 'ceo' || u.role === 'admin') return null;
  const defAmount = getDefaultFeeForUser(u);
  const f = u.finance || {};
  const dueDate = f.dueDate || fallbackOverride.dueDate || day(addDays(7));
  const dueDay = +(f.dueDay || fallbackOverride.dueDay || Number(dueDate.split('-')[2]) || 10);
  u.finance = {
    amount: +(f.amount ?? fallbackOverride.amount ?? defAmount),
    dueDate,
    dueDay: Math.min(28, Math.max(1, dueDay)),
    cycle: f.cycle || fallbackOverride.cycle || 'Mensal',
    method: f.method || fallbackOverride.method || 'PIX',
    paid: typeof f.paid === 'boolean' ? f.paid : (fallbackOverride.paid ?? false),
    lastPaidDate: f.lastPaidDate ?? fallbackOverride.lastPaidDate ?? null,
    lastAdjustment: f.lastAdjustment || null,
    recipientBank: f.recipientBank || null,
    notes: f.notes ?? fallbackOverride.notes ?? '',
    history: Array.isArray(f.history) ? f.history : (fallbackOverride.history || []),
  };
  return u.finance;
}

function finStatus(u) {
  const f = ensureUserFinance(u);
  if (!f) return { code: 'paid', label: 'Isento', badgeClass: 'paid', daysDiff: 0, detailText: '', amount: 0, dueDate: day() };
  const todayIso = day();
  const daysDiff = Math.round((new Date(f.dueDate + 'T12:00:00') - new Date(todayIso + 'T12:00:00')) / 864e5);
  if (f.paid) {
    return {
      code: 'paid',
      label: '✅ Já Pagou (Em dia)',
      shortLabel: '✅ Pago',
      badgeClass: 'paid',
      daysDiff,
      detailText: `${f.lastPaidDate ? 'Pago em ' + fmtDate(f.lastPaidDate) + ' · ' : ''}Próx. vencimento: ${fmtDate(f.dueDate)}`,
      amount: f.amount,
      dueDate: f.dueDate,
      method: f.method,
      cycle: f.cycle,
    };
  }
  if (daysDiff < 0) {
    const late = Math.abs(daysDiff);
    return {
      code: 'overdue',
      label: `🚨 Inadimplente (${late}d em atraso)`,
      shortLabel: `🚨 Atrasado (${late}d)`,
      badgeClass: 'overdue',
      daysDiff,
      detailText: `Falta pagar · Venceu há ${late} dia(s) (${fmtDate(f.dueDate)})`,
      amount: f.amount,
      dueDate: f.dueDate,
      method: f.method,
      cycle: f.cycle,
    };
  }
  if (daysDiff === 0) {
    return {
      code: 'soon',
      label: '⚠️ Vence Hoje! (Falta pagar)',
      shortLabel: '⚠️ Vence Hoje',
      badgeClass: 'soon',
      daysDiff,
      detailText: `Falta pagar · Vence hoje (${fmtDate(f.dueDate)})`,
      amount: f.amount,
      dueDate: f.dueDate,
      method: f.method,
      cycle: f.cycle,
    };
  }
  if (daysDiff <= 5) {
    return {
      code: 'soon',
      label: `⏰ A Vencer em ${daysDiff}d (Falta pagar)`,
      shortLabel: `⏰ Vence em ${daysDiff}d`,
      badgeClass: 'soon',
      daysDiff,
      detailText: `Falta pagar · Vence em ${daysDiff} dia(s) (${fmtDate(f.dueDate)})`,
      amount: f.amount,
      dueDate: f.dueDate,
      method: f.method,
      cycle: f.cycle,
    };
  }
  return {
    code: 'due',
    label: `⏳ Falta Pagar (Vence ${fmtDate(f.dueDate)})`,
    shortLabel: `⏳ A Vencer (${fmtDate(f.dueDate).slice(0, 5)})`,
    badgeClass: 'due',
    daysDiff,
    detailText: `Falta pagar · Vence em ${daysDiff} dias (${fmtDate(f.dueDate)})`,
    amount: f.amount,
    dueDate: f.dueDate,
    method: f.method,
    cycle: f.cycle,
  };
}

function waBillingUrl(u) {
  const d = cleanPhone(u?.phone);
  if (!d) return '';
  const st = finStatus(u);
  const val = fmtBRL(st.amount);
  const dt = fmtDate(st.dueDate);
  const first = (u.name || '').split(' ')[0];
  let msg = '';
  if (st.code === 'overdue') {
    msg = `Olá ${first}, tudo bem? Passando para lembrar que sua mensalidade no ${BRAND()} no valor de ${val} (vencimento em ${dt}) consta em aberto no sistema. Assim que realizar o pagamento, me avise para darmos baixa! 💪`;
  } else if (st.code === 'paid') {
    msg = `Olá ${first}! Confirmamos o recebimento da sua mensalidade (${val}) no ${BRAND()}. Muito obrigado e excelentes treinos! 💪🔥`;
  } else {
    msg = `Olá ${first}, tudo bem? Lembrete amigável de que sua mensalidade no ${BRAND()} (${val}) tem vencimento programado para ${dt}. Qualquer dúvida estamos à disposição! 💪`;
  }
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(msg)}`;
}

async function seed() {
  const salt = () => uid() + uid();
  const mk = async (name, email, pw, role, extra = {}) => {
    const s = salt();
    return { id: uid(), name, email, role, salt: s, hash: await hash(pw, s), active: true, phone: '', trainerId: null, ...extra };
  };
  const ceo = await mk('CEO Admin', 'ceo@personalhub.com', 'Admin@123', 'ceo', { phone: '(11) 99999-0000' });

  // Professores (Mini CEOs) — pagam assinatura da plataforma ao CEO
  const t1 = await mk('Prof. Carlos Mendes', 'carlos@personalhub.com', 'carlos123', 'trainer', {
    phone: '(11) 98888-1111',
    notes: 'CREF 012345-G/SP · Hipertrofia e Emagrecimento',
    finance: {
      amount: 149.90, dueDate: day(addDays(25)), dueDay: 10, cycle: 'Mensal', method: 'PIX',
      paid: true, lastPaidDate: day(addDays(-5)), notes: 'Plano Mini CEO Profissional',
      history: [{ id: uid(), date: day(addDays(-5)), amount: 149.90, method: 'PIX', note: 'Mensalidade Mini CEO paga' }],
    },
  });
  const t2 = await mk('Profª. Fernanda Lima', 'fernanda@personalhub.com', 'fernanda123', 'trainer', {
    phone: '(11) 97777-2222',
    notes: 'CREF 054321-G/SP · Funcional e Condicionamento',
    finance: {
      amount: 149.90, dueDate: day(addDays(-4)), dueDay: 5, cycle: 'Mensal', method: 'PIX',
      paid: false, lastPaidDate: day(addDays(-34)), notes: 'Plano Mini CEO · Pendente no mês atual',
      history: [{ id: uid(), date: day(addDays(-34)), amount: 149.90, method: 'PIX', note: 'Mensalidade mês anterior' }],
    },
  });
  const t3 = await mk('Prof. Marcos Rocha', 'marcos@personalhub.com', 'marcos123', 'trainer', {
    phone: '(11) 96666-3333',
    notes: 'CREF 098765-G/SP · Performance e Força',
    finance: {
      amount: 149.90, dueDate: day(addDays(3)), dueDay: 15, cycle: 'Mensal', method: 'Cartão',
      paid: false, lastPaidDate: day(addDays(-27)), notes: 'Plano Mini CEO · Vence nos próximos dias',
      history: [{ id: uid(), date: day(addDays(-27)), amount: 149.90, method: 'Cartão', note: 'Mensalidade mês anterior' }],
    },
  });

  // Alunos vinculados aos Professores (gerenciados no Financeiro do Professor Mini CEO)
  const a = await mk('Maria Silva', 'maria@personalhub.com', 'maria123', 'student', {
    trainerId: t1.id, phone: '(11) 99111-2233', age: 29, height: 165, goal: 'Emagrecimento', injuries: 'Nenhuma', notes: 'Treina 4x por semana', weight: 68,
    finance: {
      amount: 180.00, dueDate: day(addDays(22)), dueDay: 10, cycle: 'Mensal', method: 'PIX',
      paid: true, lastPaidDate: day(addDays(-8)), notes: 'Consultoria Personal em dia',
      history: [{ id: uid(), date: day(addDays(-8)), amount: 180.00, method: 'PIX', note: 'Mensalidade paga ao Prof. Carlos' }],
    },
  });
  const b = await mk('João Santos', 'joao@personalhub.com', 'joao123', 'student', {
    trainerId: t1.id, phone: '(11) 99222-3344', age: 34, height: 178, goal: 'Hipertrofia', injuries: 'Dor leve no ombro direito', notes: '', weight: 82,
    finance: {
      amount: 180.00, dueDate: day(addDays(-5)), dueDay: 5, cycle: 'Mensal', method: 'PIX',
      paid: false, lastPaidDate: day(addDays(-35)), notes: 'Mensalidade vencida — cobrar no WhatsApp',
      history: [{ id: uid(), date: day(addDays(-35)), amount: 180.00, method: 'PIX', note: 'Mensalidade mês anterior' }],
    },
  });
  const b2 = await mk('Bruna Ferreira', 'bruna@personalhub.com', 'bruna123', 'student', {
    trainerId: t1.id, phone: '(11) 99444-5566', age: 26, height: 162, goal: 'Definição muscular', injuries: 'Nenhuma', notes: 'Treina à noite', weight: 60,
    finance: {
      amount: 200.00, dueDate: day(addDays(4)), dueDay: 15, cycle: 'Mensal', method: 'Cartão',
      paid: false, lastPaidDate: day(addDays(-26)), notes: 'A vencer nesta semana',
      history: [{ id: uid(), date: day(addDays(-26)), amount: 200.00, method: 'Cartão', note: 'Mensalidade mês anterior' }],
    },
  });
  const c = await mk('Ana Costa', 'ana@personalhub.com', 'ana123', 'student', {
    trainerId: t2.id, phone: '(11) 99555-6677', age: 41, height: 160, goal: 'Condicionamento', injuries: '', notes: 'Prefere treinar pela manhã', weight: 62,
    finance: {
      amount: 170.00, dueDate: day(addDays(18)), dueDay: 20, cycle: 'Mensal', method: 'PIX',
      paid: true, lastPaidDate: day(addDays(-12)), notes: 'Aluna da Profª Fernanda',
      history: [{ id: uid(), date: day(addDays(-12)), amount: 170.00, method: 'PIX', note: 'Mensalidade paga' }],
    },
  });

  const sampleReport = {
    everTrained: 'Sim, já treinei antes',
    trainTimeNow: 'Menos de 3 meses',
    trainTimePast: 'Treinei por 6 meses há 1 ano',
    level: 'Iniciante',
    hasInjury: 'Sim',
    injuryAreas: ['Joelho'],
    injuryDesc: 'Desconforto leve no joelho direito ao descer muito no agachamento',
    hasBroken: 'Sim',
    brokenDesc: 'Quebrei o punho esquerdo na infância (já recuperado)',
    goal: 'Emagrecimento',
    height: 174,
    weight: 86,
    age: 27,
    daysPerWeek: 3,
    futureVision: 'Quero perder 8 kg nos próximos 4 meses, diminuir a barriga, ganhar disposição e treinar sem sentir dor no joelho.',
    updatedAt: new Date().toISOString(),
  };

  // Alunos Sem Personal (pagam mensalidade diretamente ao CEO)
  const dAuto = await mk('Lucas Oliveira', 'lucas@personalhub.com', 'lucas123', 'student', {
    trainerId: null, autonomous: true, phone: '(11) 99333-4455', age: 27, height: 174, weight: 86,
    goal: 'Emagrecimento', injuries: 'Joelho: Desconforto leve | Fratura antiga: Punho esquerdo',
    notes: 'Aluno Autônomo (Sem Personal) — Treino gerado pelo Relatório de Objetivos',
    report: sampleReport,
    finance: {
      amount: 59.90, dueDate: day(addDays(-3)), dueDay: 5, cycle: 'Mensal', method: 'PIX',
      paid: false, lastPaidDate: day(addDays(-33)), notes: 'Assinatura App Sem Personal (Direto CEO)',
      history: [{ id: uid(), date: day(addDays(-33)), amount: 59.90, method: 'PIX', note: 'Mensalidade App Sem Personal' }],
    },
  });
  const eAuto = await mk('Mariana Ribeiro', 'mariana@personalhub.com', 'mariana123', 'student', {
    trainerId: null, autonomous: true, phone: '(11) 99777-8899', age: 31, height: 168, weight: 65,
    goal: 'Hipertrofia', injuries: 'Nenhuma',
    notes: 'Aluna Sem Personal — Assinante direta da plataforma',
    report: { ...sampleReport, level: 'Intermediário', hasInjury: 'Não', injuryAreas: [], injuryDesc: '', hasBroken: 'Não', brokenDesc: '', goal: 'Hipertrofia (Ganho de massa muscular)', height: 168, weight: 65, age: 31 },
    finance: {
      amount: 59.90, dueDate: day(addDays(20)), dueDay: 15, cycle: 'Mensal', method: 'PIX',
      paid: true, lastPaidDate: day(addDays(-10)), notes: 'Assinatura App Sem Personal paga em dia',
      history: [{ id: uid(), date: day(addDays(-10)), amount: 59.90, method: 'PIX', note: 'Mensalidade App Sem Personal paga' }],
    },
  });
  const fAuto = await mk('Pedro Almeida', 'pedro@personalhub.com', 'pedro123', 'student', {
    trainerId: null, autonomous: true, phone: '(11) 99666-1122', age: 24, height: 180, weight: 79,
    goal: 'Condicionamento', injuries: 'Nenhuma',
    notes: 'Aluno Sem Personal — A vencer',
    report: { ...sampleReport, level: 'Iniciante', hasInjury: 'Não', injuryAreas: [], injuryDesc: '', hasBroken: 'Não', brokenDesc: '', goal: 'Condicionamento físico e saúde', height: 180, weight: 79, age: 24 },
    finance: {
      amount: 59.90, dueDate: day(addDays(3)), dueDay: 12, cycle: 'Mensal', method: 'Cartão',
      paid: false, lastPaidDate: day(addDays(-27)), notes: 'Assinatura App Sem Personal a vencer',
      history: [],
    },
  });

  const treinoPadrao = () => [
    { id: uid(), name: 'Treino A - Peito e Tríceps', exercises: [mkEx('Supino reto', 'Peito', 4, '10', '30 kg', 60), mkEx('Crucifixo', 'Peito', 3, '12', '12 kg', 45), mkEx('Tríceps corda', 'Tríceps', 3, '12', '20 kg', 45)] },
    { id: uid(), name: 'Treino B - Pernas (Quadríceps)', exercises: [mkEx('Agachamento livre', 'Pernas', 4, '12', '40 kg', 90), mkEx('Leg press 45°', 'Pernas', 4, '12', '120 kg', 90), mkEx('Cadeira extensora', 'Pernas', 3, '12-15', '35 kg', 60), mkEx('Panturrilha em pé', 'Pernas', 4, '15', '40 kg', 30)] },
    { id: uid(), name: 'Treino C - Costas e Bíceps', exercises: [mkEx('Puxada frontal', 'Costas', 4, '10', '45 kg', 60), mkEx('Remada baixa', 'Costas', 3, '12', '40 kg', 60), mkEx('Rosca direta', 'Bíceps', 3, '12', '15 kg', 45)] },
    { id: uid(), name: 'Treino D - Posterior, Glúteos e Ombros', exercises: [mkEx('Elevação pélvica', 'Glúteos', 4, '10-12', '50 kg', 90), mkEx('Stiff', 'Pernas', 4, '10-12', '35 kg', 75), mkEx('Mesa flexora', 'Pernas', 3, '12', '30 kg', 60), mkEx('Desenvolvimento com halteres', 'Ombros', 3, '12', '12 kg', 60)] },
  ];

  DB = {
    users: [ceo, t1, t2, t3, a, b, b2, c, dAuto, eAuto, fAuto],
    workouts: {
      [a.id]: treinoPadrao(),
      [b.id]: treinoPadrao(),
      [b2.id]: treinoPadrao(),
      [c.id]: treinoPadrao(),
      [dAuto.id]: generateAutoWorkout(dAuto.report),
      [eAuto.id]: generateAutoWorkout(eAuto.report),
      [fAuto.id]: generateAutoWorkout(fAuto.report),
    },
    templates: [{ id: uid(), owner: t1.id, name: 'ABC Clássico Hipertrofia', days: treinoPadrao() }],
    checkins: [], water: [], logs: [], cardio: [], weights: [],
    messages: [{ id: uid(), from: t1.id, to: 'all', text: 'Bem-vindos ao PersonalHUB! Bons treinos hoje! 💪', date: new Date().toISOString(), read: false }],
    posts: [
      { id: uid(), uid: a.id, authorName: a.name, authorRole: 'student', text: 'Treino de hoje concluído! Cada dia mais focada na meta! 🔥', image: '', likes: [b.id, t1.id], date: new Date(Date.now() - 3600000 * 3).toISOString() },
      { id: uid(), uid: b.id, authorName: b.name, authorRole: 'student', text: 'Bora pra cima! Hidratação em dia e treino pago! 💧🏋️', image: '', likes: [a.id, c.id, t1.id], date: new Date(Date.now() - 3600000 * 8).toISOString() },
      { id: uid(), uid: t1.id, authorName: t1.name, authorRole: 'trainer', text: 'Orgulho de ver a dedicação de todos vocês na semana! Constância sempre!', image: '', likes: [a.id, b.id, c.id], date: new Date(Date.now() - 3600000 * 20).toISOString() },
    ],
    tips: TIPS_SEED,
    foods: FOODS_SEED.map(f => ({ ...f, owner: null })),
    settings: {
      __fin_defaults__: { trainerFee: 149.90, autoStudentFee: 59.90, trainerStudentFee: 180.00 },
    },
  };
  [a, b, b2, c, dAuto, eAuto, fAuto].forEach(u => DB.weights.push(
    { id: uid(), uid: u.id, date: day(addDays(-14)), kg: u.weight + 1.5 },
    { id: uid(), uid: u.id, date: day(addDays(-7)), kg: u.weight + 0.7 },
    { id: uid(), uid: u.id, date: day(), kg: u.weight }
  ));
  save();
}

/* ======================= SINCRONIZAÇÃO EM TEMPO REAL (PROFESSOR & ALUNO) ======================= */
const realtimeChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('personalhub_realtime_sync') : null;

function broadcastRealtime(type, data = {}) {
  const payload = { type, ...data, timestamp: Date.now() };
  try {
    if (realtimeChannel) realtimeChannel.postMessage(payload);
  } catch (err) { }
  try {
    localStorage.setItem('personalhub_realtime_ping', JSON.stringify(payload));
  } catch (err) { }
}

function handleRealtimeSync(data = {}) {
  if (!data || !data.type) return;

  // 1. Recarrega os dados do DB mais recentes se estiver em modo local
  if (!Cloud.enabled) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const updated = JSON.parse(raw);
        if (updated && Array.isArray(updated.users)) {
          DB = updated;
          if (S.user) S.user = userById(S.user.id) || S.user;
        }
      }
    } catch (err) { }
  } else {
    Cloud.refresh().catch(() => {});
  }

  // 2. Se a visualização atual envolver o aluno cujo treino ou carga foi alterado, atualiza a interface
  const curTargetUid = S.wkTargetUid || (S.user?.role === 'student' ? S.user.id : (S.param || null));
  const isRelevant = !data.studentId || data.studentId === curTargetUid;

  if (isRelevant) {
    const isTyping = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (!isTyping) {
      if (typeof _refreshWorkoutViewOrModal === 'function') {
        _refreshWorkoutViewOrModal();
      } else if (typeof render === 'function') {
        render();
      }
    } else if (data.field && data.exId && data.value !== undefined) {
      const inp = document.getElementById(`inp-${data.field}-${data.exId}`);
      if (inp && inp !== document.activeElement) inp.value = data.value;
    }
  }

  // 3. Efeito visual no badge de tempo real se existir na tela
  const badge = document.getElementById('realtimeSyncBadge');
  if (badge) {
    badge.style.transform = 'scale(1.08)';
    badge.style.transition = 'transform .18s';
    setTimeout(() => { if (badge) badge.style.transform = 'scale(1)'; }, 250);
  }
}

if (realtimeChannel) {
  realtimeChannel.onmessage = e => handleRealtimeSync(e.data);
}

const save = () => {
  if (!DB) return;
  DB.__updatedAt = Date.now();
  if (Cloud.enabled) Cloud.queue();
  try {
    localStorage.setItem(KEY, JSON.stringify(DB));
  } catch (e) {
    try {
      const compactDb = {
        ...DB,
        posts: (DB.posts || []).map(p => ({ ...p, image: (p.image && p.image.length > 8000) ? '' : p.image })),
      };
      localStorage.setItem(KEY, JSON.stringify(compactDb));
    } catch (e2) {
      console.warn('localStorage cheio, protegido por IndexedDB:', e2);
    }
  }
  IDB.set(KEY, DB).catch(() => {});
  broadcastRealtime('db_saved');
};

function mergeUserLists(primaryUsers = [], secondaryUsers = []) {
  const out = [...primaryUsers];
  const byId = new Map(out.map(u => [u.id, u]));
  const byEmail = new Map(out.filter(u => u.email).map(u => [u.email.trim().toLowerCase(), u]));
  secondaryUsers.forEach(u => {
    if (!u || !u.email) return;
    const em = u.email.trim().toLowerCase();
    const existing = byId.get(u.id) || byEmail.get(em);
    if (!existing) {
      out.push(u);
      byId.set(u.id, u);
      byEmail.set(em, u);
    } else if ((u.updatedAt || 0) > (existing.updatedAt || 0)) {
      Object.assign(existing, u);
    } else if (!existing.plainPw && u.plainPw) {
      existing.plainPw = u.plainPw;
    }
  });
  return out;
}

async function syncFromLocalStore() {
  if (Cloud.enabled) return;
  let lsDb = null, idbDb = null;
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try { lsDb = JSON.parse(raw); } catch { }
  }
  try { idbDb = await IDB.get(KEY); } catch { }

  if (lsDb && idbDb) {
    const lsTime = +(lsDb.__updatedAt || 0);
    const idbTime = +(idbDb.__updatedAt || 0);
    const newer = idbTime > lsTime ? idbDb : lsDb;
    const older = idbTime > lsTime ? lsDb : idbDb;
    newer.users = mergeUserLists(newer.users || [], older.users || []);
    newer.workouts = { ...(older.workouts || {}), ...(newer.workouts || {}) };
    DB = newer;
    return DB;
  }
  const chosen = lsDb || idbDb;
  if (chosen && Array.isArray(chosen.users) && chosen.users.length) {
    if (DB && Array.isArray(DB.users)) {
      chosen.users = mergeUserLists(chosen.users, DB.users);
    }
    DB = chosen;
  }
  return DB;
}

async function ensureAllFinancesAndMigrate() {
  if (!DB || !Array.isArray(DB.users)) return;
  let changed = false;
  DB.users.forEach(u => { if (u.role === 'admin') { u.role = 'ceo'; changed = true; } });
  if (!DB.posts) { DB.posts = []; changed = true; }
  if (!DB.settings) { DB.settings = {}; changed = true; }
  getFinDefaults();

  // Garante exemplos completos caso o banco salvo seja de uma versão anterior sem financeiro
  const t1 = DB.users.find(u => u.email === 'carlos@personalhub.com');
  const t2 = DB.users.find(u => u.email === 'fernanda@personalhub.com');

  DB.users.forEach((u, idx) => {
    if (u.role === 'ceo') return;
    if (!u.finance) {
      changed = true;
      if (u.email === 'carlos@personalhub.com') {
        ensureUserFinance(u, { amount: 149.90, dueDate: day(addDays(25)), dueDay: 10, paid: true, lastPaidDate: day(addDays(-5)), method: 'PIX', notes: 'Plano Mini CEO em dia', history: [{ id: uid(), date: day(addDays(-5)), amount: 149.90, method: 'PIX', note: 'Mensalidade Mini CEO paga' }] });
      } else if (u.email === 'fernanda@personalhub.com') {
        ensureUserFinance(u, { amount: 149.90, dueDate: day(addDays(-4)), dueDay: 5, paid: false, lastPaidDate: day(addDays(-34)), method: 'PIX', notes: 'Plano Mini CEO em atraso' });
      } else if (u.email === 'maria@personalhub.com') {
        ensureUserFinance(u, { amount: 180.00, dueDate: day(addDays(22)), dueDay: 10, paid: true, lastPaidDate: day(addDays(-8)), method: 'PIX', notes: 'Mensalidade paga' });
      } else if (u.email === 'joao@personalhub.com') {
        ensureUserFinance(u, { amount: 180.00, dueDate: day(addDays(-5)), dueDay: 5, paid: false, lastPaidDate: day(addDays(-35)), method: 'PIX', notes: 'Mensalidade em atraso' });
      } else if (u.email === 'lucas@personalhub.com') {
        ensureUserFinance(u, { amount: 59.90, dueDate: day(addDays(-3)), dueDay: 5, paid: false, lastPaidDate: day(addDays(-33)), method: 'PIX', notes: 'Assinatura App Sem Personal' });
      } else {
        const isPaid = idx % 3 === 0;
        const offset = isPaid ? 20 : (idx % 2 === 0 ? 4 : -3);
        ensureUserFinance(u, {
          amount: getDefaultFeeForUser(u),
          dueDate: day(addDays(offset)),
          dueDay: 10,
          paid: isPaid,
          lastPaidDate: isPaid ? day(addDays(-10)) : null,
          method: 'PIX',
        });
      }
    } else {
      ensureUserFinance(u);
    }
  });

  // Se banco antigo não tinha a aluna a vencer do Prof. Carlos ou alunos autônomos extras, adiciona suavemente
  if (t1 && !DB.users.some(u => u.email === 'bruna@personalhub.com')) {
    const s = uid() + uid();
    const bruna = {
      id: uid(), name: 'Bruna Ferreira', email: 'bruna@personalhub.com', role: 'student', salt: s, hash: await hash('bruna123', s),
      active: true, phone: '(11) 99444-5566', trainerId: t1.id, autonomous: false, age: 26, height: 162, weight: 60,
      goal: 'Definição muscular', injuries: 'Nenhuma', notes: 'Treina à noite',
      finance: { amount: 200.00, dueDate: day(addDays(4)), dueDay: 15, cycle: 'Mensal', method: 'Cartão', paid: false, lastPaidDate: day(addDays(-26)), notes: 'A vencer nesta semana', history: [] },
    };
    DB.users.push(bruna);
    DB.workouts[bruna.id] = DB.workouts[DB.users.find(x => x.trainerId === t1.id)?.id] || [];
    changed = true;
  }
  if (!DB.users.some(u => u.email === 'marcos@personalhub.com')) {
    const s = uid() + uid();
    const marcos = {
      id: uid(), name: 'Prof. Marcos Rocha', email: 'marcos@personalhub.com', role: 'trainer', salt: s, hash: await hash('marcos123', s),
      active: true, phone: '(11) 96666-3333', trainerId: null, notes: 'CREF 098765-G/SP · Performance e Força',
      finance: { amount: 149.90, dueDate: day(addDays(3)), dueDay: 15, cycle: 'Mensal', method: 'Cartão', paid: false, lastPaidDate: day(addDays(-27)), notes: 'Plano Mini CEO · A vencer', history: [] },
    };
    DB.users.push(marcos);
    changed = true;
  }
  if (!DB.users.some(u => u.email === 'mariana@personalhub.com')) {
    const s = uid() + uid();
    const rep = { everTrained: 'Sim, já treinei antes', trainTimeNow: 'De 3 a 6 meses', trainTimePast: '1 ano', level: 'Intermediário', hasInjury: 'Não', injuryAreas: [], injuryDesc: '', hasBroken: 'Não', brokenDesc: '', goal: 'Hipertrofia (Ganho de massa muscular)', height: 168, weight: 65, age: 31, daysPerWeek: 3, futureVision: 'Ganhar massa magra e definição.', updatedAt: new Date().toISOString() };
    const mariana = {
      id: uid(), name: 'Mariana Ribeiro', email: 'mariana@personalhub.com', role: 'student', salt: s, hash: await hash('mariana123', s),
      active: true, phone: '(11) 99777-8899', trainerId: null, autonomous: true, age: 31, height: 168, weight: 65,
      goal: 'Hipertrofia', injuries: 'Nenhuma', notes: 'Aluna Sem Personal — Assinante direta da plataforma', report: rep,
      finance: { amount: 59.90, dueDate: day(addDays(20)), dueDay: 15, cycle: 'Mensal', method: 'PIX', paid: true, lastPaidDate: day(addDays(-10)), notes: 'Assinatura App Sem Personal em dia', history: [{ id: uid(), date: day(addDays(-10)), amount: 59.90, method: 'PIX', note: 'Mensalidade App Sem Personal paga' }] },
    };
    DB.users.push(mariana);
    DB.workouts[mariana.id] = generateAutoWorkout(rep);
    changed = true;
  }
  if (!DB.users.some(u => u.email === 'pedro@personalhub.com')) {
    const s = uid() + uid();
    const rep = { everTrained: 'Não, nunca treinei na vida (1ª vez)', trainTimeNow: 'Começando agora (0 meses)', trainTimePast: 'Nunca treinou', level: 'Iniciante', hasInjury: 'Não', injuryAreas: [], injuryDesc: '', hasBroken: 'Não', brokenDesc: '', goal: 'Condicionamento físico e saúde', height: 180, weight: 79, age: 24, daysPerWeek: 3, futureVision: 'Melhorar condicionamento e perder gordura.', updatedAt: new Date().toISOString() };
    const pedro = {
      id: uid(), name: 'Pedro Almeida', email: 'pedro@personalhub.com', role: 'student', salt: s, hash: await hash('pedro123', s),
      active: true, phone: '(11) 99666-1122', trainerId: null, autonomous: true, age: 24, height: 180, weight: 79,
      goal: 'Condicionamento', injuries: 'Nenhuma', notes: 'Aluno Sem Personal — A vencer', report: rep,
      finance: { amount: 59.90, dueDate: day(addDays(3)), dueDay: 12, cycle: 'Mensal', method: 'Cartão', paid: false, lastPaidDate: day(addDays(-27)), notes: 'Assinatura App Sem Personal a vencer', history: [] },
    };
    DB.users.push(pedro);
    DB.workouts[pedro.id] = generateAutoWorkout(rep);
    changed = true;
  }

  // Garante que fichas padrão de 3 dias (A, B, C) tenham também o Treino D para divisão ABCD completa
  DB.users.filter(u => u.role === 'student').forEach(u => {
    const ws = DB.workouts[u.id] || [];
    if (ws.length === 3 && ws.every((w, i) => w.name.startsWith('Treino ' + ['A', 'B', 'C'][i]))) {
      ws.push({
        id: uid(),
        name: 'Treino D - Posterior, Glúteos e Ombros',
        exercises: [
          mkEx('Elevação pélvica', 'Glúteos', 4, '10-12', '50 kg', 90),
          mkEx('Stiff', 'Pernas', 4, '10-12', '35 kg', 75),
          mkEx('Mesa flexora', 'Pernas', 3, '12', '30 kg', 60),
          mkEx('Desenvolvimento com halteres', 'Ombros', 3, '12', '12 kg', 60),
        ],
      });
      changed = true;
    }
  });

  if (changed) save();
}

async function load() {
  if (Cloud.enabled) return;
  await syncFromLocalStore();
  if (DB && Array.isArray(DB.users) && DB.users.length) {
    await ensureAllFinancesAndMigrate();
  } else {
    await seed();
  }
  save();
}

window.addEventListener('storage', e => {
  if (e.key === 'personalhub_realtime_ping' && e.newValue) {
    try { handleRealtimeSync(JSON.parse(e.newValue)); } catch { }
  } else if (e.key === KEY && !Cloud.enabled && e.newValue) {
    try {
      const updated = JSON.parse(e.newValue);
      if (updated && Array.isArray(updated.users)) {
        updated.users = mergeUserLists(updated.users, DB?.users || []);
        DB = updated;
        if (S.user) S.user = userById(S.user.id) || S.user;
        handleRealtimeSync({ type: 'storage_sync' });
      }
    } catch { }
  }
});

/* ---------- Helpers de Perfis e Permissões ---------- */
const isCeo = (u = S.user) => u?.role === 'ceo' || u?.role === 'admin';
const isTrainer = (u = S.user) => u?.role === 'trainer';
const isStaff = (u = S.user) => (isCeo(u) && !S.ceoStudentMode) || isTrainer(u);
const roleLabel = r => r === 'ceo' || r === 'admin' ? (S.ceoStudentMode ? 'CEO (Modo Aluno)' : 'CEO · Admin Geral') : r === 'trainer' ? 'Professor · Mini CEO' : 'Aluno';

const userById = id => DB.users.find(u => u.id === id);
const student = id => DB.users.find(u => u.id === id && u.role === 'student');
const trainers = () => DB.users.filter(u => u.role === 'trainer');
const autoStudents = () => DB.users.filter(u => u.role === 'student' && (u.autonomous || !u.trainerId || u.trainerId === DB.users.find(x => x.role === 'ceo')?.id));
// CEO vê todos os alunos (ou filtra por professor); Professor vê apenas os seus próprios alunos
const students = (trainerFilter = null) => DB.users.filter(u => {
  if (u.role !== 'student') return false;
  if (isCeo()) {
    if (trainerFilter === '__auto__') return !!(u.autonomous || !u.trainerId);
    return trainerFilter ? u.trainerId === trainerFilter : true;
  }
  return u.trainerId === S.user?.id;
});
const trainerName = (id, uObj = null) => {
  if (uObj?.autonomous || !id) return '🤖 Treino Automático (Sem Personal)';
  const t = userById(id);
  if (t?.role === 'ceo') return '👑 Direto com o CEO (Sem Personal)';
  return t ? t.name : '🤖 Treino Automático (Sem Personal)';
};
const my = (k, id = S.user.id) => (DB[k] || []).filter(x => x.uid === id);

/* ---------- Regras de negócio ---------- */
const waterGoal = kg => Math.round((kg || 70) * 35);
const curWeight = id => {
  const w = my('weights', id).sort((x, y) => x.date.localeCompare(y.date)).pop();
  return w ? w.kg : student(id)?.weight || 70;
};
const waterToday = id => my('water', id).filter(w => w.date === day()).reduce((s, w) => s + w.ml, 0);
const trainedDays = id => new Set([...my('logs', id).map(l => l.date), ...my('checkins', id).filter(c => c.trained === 'sim').map(c => c.date)]);
function streak(id) {
  const t = trainedDays(id); let d = new Date(), n = 0;
  if (!t.has(day(d))) d = addDays(-1, d);
  while (t.has(day(d))) { n++; d = addDays(-1, d); }
  return n;
}
const lastTrain = id => [...trainedDays(id)].sort().pop();
const daysSince = id => { const l = lastTrain(id); return l ? Math.floor((new Date(day()) - new Date(l)) / 864e5) : 999; };
function badges(id) {
  const n = my('logs', id).length, s = streak(id), wd = new Set(my('water', id).map(w => w.date));
  const goalHit = [...wd].some(d => my('water', id).filter(w => w.date === d).reduce((a, w) => a + w.ml, 0) >= waterGoal(curWeight(id)));
  return [['🥇 Primeiro treino', n >= 1], ['🔥 3 dias seguidos', s >= 3], ['⚡ 7 dias seguidos', s >= 7], ['💪 10 treinos', n >= 10], ['💧 Meta de água', goalHit], ['🏃 Primeiro cárdio', my('cardio', id).length >= 1]];
}
const QUOTES = ['Disciplina vence motivação.', 'Cada treino te aproxima da sua melhor versão.', 'Foco, força e constância!', 'O corpo alcança o que a mente acredita.', 'Pequenos passos, grandes resultados.', 'Hoje é um ótimo dia para evoluir.', 'Constância é o segredo do resultado.'];
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const sendMsg = (to, text) => { DB.messages.push({ id: uid(), from: S.user?.id || null, to, text, date: new Date().toISOString(), read: false }); save(); };
const push = (title, body) => { if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification(title, { body, icon: 'icons/icon-192.png', vibrate: [200, 100, 200] })).catch(() => new Notification(title, { body })); };

/* ---------- Gráficos SVG ---------- */
function barChart(data) {
  const max = Math.max(1, ...data.map(d => d.v)), w = 100 / data.length;
  return `<svg viewBox="0 0 100 50" style="width:100%;height:150px">${data.map((d, i) => { const h = d.v / max * 34; return `<rect x="${i * w + w * .2}" y="${40 - h}" width="${w * .6}" height="${h}" rx="1.5" fill="url(#g)"/><text x="${i * w + w / 2}" y="46" font-size="4" fill="#9AA6B2" text-anchor="middle">${esc(d.l)}</text><text x="${i * w + w / 2}" y="${38 - h}" font-size="4" fill="#F5F7F8" text-anchor="middle">${d.v || ''}</text>`; }).join('')}<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B6FF3C"/><stop offset="1" stop-color="#72DF00"/></linearGradient></defs></svg>`;
}
function lineChart(pts) {
  if (pts.length < 2) return '<p class="mut">Registre ao menos 2 pesagens para ver o gráfico.</p>';
  const vs = pts.map(p => p.v), mn = Math.min(...vs) - 1, mx = Math.max(...vs) + 1;
  const xy = pts.map((p, i) => [5 + i * 90 / (pts.length - 1), 40 - (p.v - mn) / (mx - mn) * 34]);
  return `<svg viewBox="0 0 100 50" style="width:100%;height:160px"><polyline fill="none" stroke="#8FFF00" stroke-width="1.3" points="${xy.map(p => p.join(',')).join(' ')}"/>${xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="1.7" fill="#B6FF3C"/><text x="${p[0]}" y="${p[1] - 3}" font-size="3.6" fill="#F5F7F8" text-anchor="middle">${pts[i].v}</text><text x="${p[0]}" y="48" font-size="3.2" fill="#9AA6B2" text-anchor="middle">${pts[i].l}</text>`).join('')}</svg>`;
}
const week = () => [...Array(7)].map((_, i) => addDays(i - 6));

/* ---------- UI base (Mesma implementação Responsiva para Celulares e Computadores) ---------- */
const NAV = {
  ceo: [
    ['home', 'layout-dashboard', 'Painel'],
    ['finance', 'dollar-sign', 'Financeiro'],
    ['students', 'users', 'Alunos'],
    ['workouts', 'dumbbell', 'Treinos'],
    ['inbody', 'activity', 'InBody & Dobras'],
    ['trainers', 'shield-check', 'Professores'],
    ['autostudents', 'clipboard-list', 'Sem Personal'],
    ['community', 'flame', 'Comunidade'],
    ['msgs', 'message-circle', 'Avisos'],
    ['study', 'book-open', 'Estudo'],
    ['settings', 'settings', 'Config.'],
  ],
  trainer: [
    ['home', 'layout-dashboard', 'Painel'],
    ['finance', 'dollar-sign', 'Financeiro'],
    ['students', 'users', 'Alunos'],
    ['workouts', 'dumbbell', 'Treinos'],
    ['inbody', 'activity', 'InBody & Dobras'],
    ['community', 'flame', 'Comunidade'],
    ['msgs', 'message-circle', 'Avisos'],
    ['study', 'book-open', 'Estudo'],
    ['settings', 'settings', 'Config.'],
  ],
  student: [
    ['workout', 'dumbbell', 'Treino'],
    ['profile', 'user', 'Perfil'],
    ['inbody', 'activity', 'InBody & Dobras'],
    ['community', 'flame', 'Comunidade'],
    ['study', 'book-open', 'Estudo'],
    ['settings', 'settings', 'Configurações'],
  ],
};

/* No celular (mobile): 5 abas limpas e confortáveis sem rolagem horizontal ou sobrecarga */
const MOBILE_NAV = {
  ceo: [
    ['home', 'layout-dashboard', 'Painel'],
    ['finance', 'dollar-sign', 'Financeiro'],
    ['students', 'users', 'Alunos'],
    ['workouts', 'dumbbell', 'Treinos'],
    ['__more__', 'more-horizontal', 'Mais'],
  ],
  trainer: [
    ['home', 'layout-dashboard', 'Painel'],
    ['finance', 'dollar-sign', 'Financeiro'],
    ['students', 'users', 'Alunos'],
    ['workouts', 'dumbbell', 'Treinos'],
    ['__more__', 'more-horizontal', 'Mais'],
  ],
  student: [
    ['workout', 'dumbbell', 'Treino'],
    ['profile', 'user', 'Perfil'],
    ['community', 'flame', 'Comunidade'],
    ['study', 'book-open', 'Estudo'],
    ['__more__', 'more-horizontal', 'Mais'],
  ],
};

const go = (v, p = null) => { stopCameraStream(); S.view = v; S.param = p; render(); window.scrollTo(0, 0); };
const modal = html => { closeModal(); const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = `<div class="fade">${html}</div>`; m.onclick = e => { if (e.target === m) closeModal(); }; document.body.appendChild(m); icons(); };
const closeModal = () => { stopCameraStream(); $('#modal')?.remove(); };
const icons = () => window.lucide?.createIcons();
const ic = n => `<i data-lucide="${n}"></i>`;

function focusInputEnd(sel) {
  const el = $(sel);
  if (!el) return;
  el.focus();
  try { const len = el.value.length; el.setSelectionRange(len, len); } catch { }
}

function toggleCeoStudentMode(asStudent) {
  S.ceoStudentMode = typeof asStudent === 'boolean' ? asStudent : !S.ceoStudentMode;
  if (S.ceoStudentMode) {
    if (!DB.workouts[S.user.id]) DB.workouts[S.user.id] = S.user.report ? generateAutoWorkout(S.user.report) : [];
    S.view = 'workout';
    toast('Modo "Apenas Aluno" ativado 🏃');
  } else {
    S.view = 'home';
    toast('Painel Completo do CEO restaurado 👑');
  }
  render();
}

/* Menu de Ações Rápidas do Topo (despolui a barra superior) */
function openQuickProfileModal() {
  const u = S.user;
  if (!u) return;
  const isC = isCeo();
  modal(`<h2>👤 ${esc(u.name)}</h2>
  <p class="mut" style="font-size:.82rem">${esc(u.email)} · <b class="gold">${esc(roleLabel(u.role))}</b></p>
  
  <div style="display:grid;gap:8px;margin-top:14px">
    ${isC ? `<button class="action-item-btn" onclick="closeModal();toggleCeoStudentMode()">${S.ceoStudentMode ? '👑 Voltar ao Modo CEO' : '🏃 Alternar para Modo Apenas Aluno'}</button>` : ''}
    <button class="action-item-btn" onclick="closeModal();openSyncModal()">${ic('refresh-cw')} Central de Sincronização & Backup</button>
    <button class="action-item-btn" onclick="closeModal();installPwa()">${ic('download')} Instalar Aplicativo no Celular (PWA)</button>
    ${u.role === 'student' ? `
      <button class="action-item-btn" style="border-color:rgba(74,222,128,.4);color:#4ade80" onclick="closeModal();openInAppPaymentModal('${u.id}')">💳 Pagar Mensalidade no App (PIX / Cartão)</button>
      <button class="action-item-btn" onclick="closeModal();openFinHistoryModal('${u.id}')">📜 Meus Comprovantes</button>
      <button class="action-item-btn" onclick="closeModal();openGoalReportModal('${u.id}')">📋 Meu Relatório de Objetivos (Auto-Treino)</button>
    ` : `
      <button class="action-item-btn" onclick="closeModal();go('finance')">💰 Acessar Financeiro</button>
      <button class="action-item-btn" onclick="closeModal();openBulkAdjustmentModal()">📈 Fazer Reajuste de Mensalidades</button>
      ${isC ? `<button class="action-item-btn" onclick="closeModal();openBankAccountModal()">🏦 Conta Bancária de Recebimento</button>` : ''}
    `}
    <button class="action-item-btn" onclick="closeModal();go('settings')">${ic('settings')} Configurações da Conta</button>
    <button class="action-item-btn danger" onclick="closeModal();logout()">${ic('log-out')} Sair da Conta</button>
  </div>`);
}

/* Menu "Mais ⋯" da Barra Inferior no Mobile (reúne ferramentas sem poluir o rodapé) */
function openMobileMoreModal() {
  const isC = isCeo();
  const isT = isTrainer();
  const u = S.user;

  let items = [];
  if (isC && !S.ceoStudentMode) {
    items = [
      { fn: 'openInbodyModule', icon: 'activity', title: 'InBody & Dobras', sub: 'Laudo 770 e Medidas' },
      { k: 'trainers', icon: 'shield-check', title: 'Professores', sub: `${trainers().length} cadastrados` },
      { k: 'autostudents', icon: 'clipboard-list', title: 'Sem Personal', sub: `${autoStudents().length} diretos` },
      { k: 'community', icon: 'flame', title: 'Comunidade', sub: 'Feed e incentivo' },
      { k: 'msgs', icon: 'message-circle', title: 'Avisos', sub: 'Recados aos alunos' },
      { k: 'study', icon: 'book-open', title: 'Estudo', sub: 'Dicas e nutrição' },
      { fn: 'openBankAccountModal', icon: 'landmark', title: 'Conta Bancária', sub: 'Onde cai o dinheiro' },
      { fn: 'openBulkAdjustmentModal', icon: 'trending-up', title: 'Reajustar', sub: 'Em massa % ou R$' },
      { fn: 'openSyncModal', icon: 'refresh-cw', title: 'Sincronizar', sub: 'PC e Celular' },
      { fn: 'installPwa', icon: 'download', title: 'Instalar App', sub: 'Tela cheia' },
      { k: 'settings', icon: 'settings', title: 'Configurações', sub: 'Ajustes gerais' },
      { fn: 'toggleCeoStudentMode', icon: 'user', title: 'Modo Aluno', sub: 'Visão de treino' },
      { fn: 'logout', icon: 'log-out', title: 'Sair da Conta', sub: 'Fazer logout', danger: true },
    ];
  } else if (isT && !S.ceoStudentMode) {
    items = [
      { fn: 'openInbodyModule', icon: 'activity', title: 'InBody & Dobras', sub: 'Laudo 770 e Medidas' },
      { k: 'community', icon: 'flame', title: 'Comunidade', sub: 'Feed e incentivo' },
      { k: 'msgs', icon: 'message-circle', title: 'Avisos', sub: 'Recados aos alunos' },
      { k: 'study', icon: 'book-open', title: 'Estudo', sub: 'Dicas e artigos' },
      { fn: 'openInAppPaymentModal', icon: 'credit-card', title: 'Minha Assinatura', sub: 'Pagar no app' },
      { fn: 'openBulkAdjustmentModal', icon: 'trending-up', title: 'Fazer Reajuste', sub: 'Reajustar alunos' },
      { fn: 'openSyncModal', icon: 'refresh-cw', title: 'Sincronizar', sub: 'PC e Celular' },
      { fn: 'installPwa', icon: 'download', title: 'Instalar App', sub: 'Tela cheia' },
      { k: 'settings', icon: 'settings', title: 'Configurações', sub: 'Ajustes' },
      { fn: 'logout', icon: 'log-out', title: 'Sair da Conta', sub: 'Desconectar', danger: true },
    ];
  } else {
    items = [
      { fn: 'openInbodyModule', icon: 'activity', title: 'InBody & Dobras', sub: 'Laudo 770 e Medidas' },
      { k: 'cardio', icon: 'timer', title: 'Cárdio', sub: 'Cronômetro HIIT' },
      { k: 'water', icon: 'droplet', title: 'Água', sub: 'Meta de hidratação' },
      { fn: 'openInAppPaymentModal', icon: 'credit-card', title: 'Pagar Mensalidade', sub: 'PIX e Cartões' },
      { fn: 'openFinHistoryModal', icon: 'file-text', title: 'Comprovantes', sub: 'Histórico pago' },
      { fn: 'openGoalReportModal', icon: 'clipboard-list', title: 'Auto-Treino', sub: 'Relatório de metas' },
      { fn: 'openSyncModal', icon: 'refresh-cw', title: 'Sincronizar', sub: 'Backup de dados' },
      { fn: 'installPwa', icon: 'download', title: 'Instalar App', sub: 'Tela cheia' },
      { k: 'settings', icon: 'settings', title: 'Configurações', sub: 'Alertas e perfil' },
      { fn: 'logout', icon: 'log-out', title: 'Sair da Conta', sub: 'Desconectar', danger: true },
    ];
  }

  modal(`<h2>✨ Mais Ferramentas</h2>
  <p class="mut" style="margin-bottom:12px;font-size:.82rem">Acesso rápido a todos os recursos da plataforma:</p>
  <div class="more-grid">
    ${items.map(it => {
      const clickHandler = it.k
        ? `closeModal();go('${it.k}')`
        : it.fn === 'openInbodyModule'
        ? `closeModal();openInbodyModule()`
        : it.fn === 'openInAppPaymentModal'
        ? `closeModal();openInAppPaymentModal('${u.id}')`
        : it.fn === 'openFinHistoryModal'
        ? `closeModal();openFinHistoryModal('${u.id}')`
        : it.fn === 'openGoalReportModal'
        ? `closeModal();openGoalReportModal('${u.id}')`
        : `closeModal();${it.fn}()`;
      return `<button type="button" class="more-card ${it.danger ? 'danger-card' : ''}" onclick="${clickHandler}">
        <div class="more-icon">${ic(it.icon)}</div>
        <div class="more-text">
          <b>${esc(it.title)}</b>
          <small>${esc(it.sub)}</small>
        </div>
      </button>`;
    }).join('')}
  </div>`);
}

/* Módulo InBody 770 & Avaliação Física (Composição Corporal, Dobras Cutâneas 3x, Perimetria e Gráficos SVG) */
function openInbodyModule(studentId) {
  const sid = studentId || S.inbodyStudentId || (S.user?.role === 'student' ? S.user.id : null);
  const st = sid ? (student(sid) || userById(sid)) : (S.user?.role === 'student' ? S.user : students()[0]);
  S.inbodyStudentId = st?.id || null;
  go('inbody', st?.id || null);
}

function renderInbodyView() {
  const isStaffUser = isStaff();
  const allSt = isStaffUser ? students() : [];
  const activeStudentId = S.param || S.inbodyStudentId || (S.user?.role === 'student' ? S.user.id : allSt[0]?.id);
  const activeStudent = activeStudentId ? (student(activeStudentId) || userById(activeStudentId)) : (S.user?.role === 'student' ? S.user : allSt[0]);

  const studentName = activeStudent ? activeStudent.name : (S.user?.name || 'Aluna');
  const studentCode = activeStudent ? (activeStudent.idCode || activeStudent.id || 'gabriela-laroc') : 'gabriela-laroc';
  const iframeSrc = `inbody.html?studentId=${encodeURIComponent(studentCode)}&studentName=${encodeURIComponent(studentName)}`;

  return `<div class="fade">
    <div class="row sp" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <div>
        <h1 style="display:flex;align-items:center;gap:8px">
          ${ic('activity')} <span>InBody 770 & Avaliação Física</span>
        </h1>
        <p class="mut">Laudo InBody 770, 4 Gráficos SVG empilhados, Dobras Cutâneas (Pollock 3/7 + Siri), Adipômetro 3x, Perimetria e Assimetrias.</p>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${isStaffUser && allSt.length > 1 ? `
          <select onchange="go('inbody', this.value)" style="min-width:180px;background:#141C2B;border-color:var(--gold);color:#fff;padding:6px 10px;border-radius:10px">
            ${allSt.map(s => `<option value="${s.id}" ${s.id === activeStudent?.id ? 'selected' : ''}>👤 ${esc(s.name)}</option>`).join('')}
          </select>
        ` : ''}
        <a href="${iframeSrc}" target="_blank" rel="noopener" class="btn sm" style="background:#8FFF00;color:#0B0F17;font-weight:700">
          ↗️ Tela Cheia / Nova Aba
        </a>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;border:1.5px solid rgba(143,255,0,0.3);background:#0B0F17;border-radius:18px;min-height:780px">
      <iframe id="inbodyIframe" src="${iframeSrc}" style="width:100%;height:85vh;min-height:780px;border:none;display:block;" title="PersonalHUB — InBody 770 & Dobras Cutâneas"></iframe>
    </div>
  </div>`;
}

function render() {
  clearInterval(render.tick);
  if (!S.user) return renderLogin();
  const inStudentMode = !isStaff();
  if (inStudentMode && S.view === 'home') S.view = 'workout';
  const navKey = isCeo() && !S.ceoStudentMode ? 'ceo' : isTrainer() ? 'trainer' : 'student';
  const nav = NAV[navKey];
  const navHtml = () => nav.map(([k, i, l]) => `<button class="nav-b ${S.view === k || S.view.startsWith(k.slice(0, -1) + ':') ? 'on' : ''}" onclick="go('${k}')" aria-label="${l}">${ic(i)}<span>${l}</span></button>`).join('');

  const mobileNavHtml = () => {
    const mNav = MOBILE_NAV[navKey] || MOBILE_NAV.student;
    return mNav.map(([k, i, l]) => {
      if (k === '__more__') {
        const isPrimaryActive = mNav.some(([mk]) => mk !== '__more__' && (S.view === mk || S.view.startsWith(mk.slice(0, -1) + ':')));
        const isMoreOn = !isPrimaryActive;
        return `<button class="nav-b ${isMoreOn ? 'on' : ''}" onclick="openMobileMoreModal()" aria-label="${l}">${ic(i)}<span>${l}</span></button>`;
      }
      const on = S.view === k || S.view.startsWith(k.slice(0, -1) + ':');
      return `<button class="nav-b ${on ? 'on' : ''}" onclick="go('${k}')" aria-label="${l}">${ic(i)}<span>${l}</span></button>`;
    }).join('');
  };

  $('#app').innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="logo.jpg" alt="${esc(BRAND())}"><div><div class="brand-title">Personal<span>HUB</span></div><span class="brand-sub">${esc(roleLabel(S.user.role))}</span></div></div>
      ${isCeo() ? `<button class="btn sm ${S.ceoStudentMode ? '' : 'ghost'}" style="margin-bottom:6px;width:100%" onclick="toggleCeoStudentMode()">${S.ceoStudentMode ? '👑 Voltar ao Modo CEO' : '🏃 Modo Apenas Aluno'}</button>` : ''}
      ${navHtml()}
      <div style="flex:1"></div>
      <button class="nav-b" onclick="openSyncModal()">${ic('refresh-cw')}<span>Sincronizar</span></button>
      <button class="nav-b" onclick="installPwa()">${ic('download')}<span>Baixar App</span></button>
      <button class="nav-b" onclick="logout()">${ic('log-out')}<span>Sair</span></button>
    </aside>
    <main class="main">
      <div class="top">
        <div class="brand-mini">
          <img src="logo.jpg" alt="${esc(BRAND())}">
          <div class="brand-title" style="font-size:1.15rem">Personal<span>HUB</span></div>
        </div>
        <div class="row" style="margin-left:auto;gap:6px">
          ${isStaff()
            ? `<button class="btn sm ${S.view === 'finance' ? '' : 'ghost'}" onclick="go('finance')" title="Abrir Financeiro">💰 <span class="hide-xs">Financeiro</span></button>`
            : `<button class="btn sm ok-btn" onclick="openInAppPaymentModal('${S.user.id}')" title="Pagar mensalidade pelo app">💳 <span class="hide-xs">Pagar</span></button>`}
          ${isCeo() ? `<button class="btn sm ${S.ceoStudentMode ? '' : 'ghost'}" onclick="toggleCeoStudentMode()" title="Alternar modo">${S.ceoStudentMode ? '👑 CEO' : '🏃 Aluno'}</button>` : ''}
          <button class="btn ghost sm" onclick="openQuickProfileModal()" title="Menu Rápido">${ic('menu')}<span class="hide-xs">Menu</span></button>
        </div>
      </div>
      <div class="fade" id="view"></div>
    </main>
    <nav class="bottom">${mobileNavHtml()}</nav>
    <div id="chatbot"></div>
  </div>`;
  const V = isStaff() ? ADMIN : STUDENT;
  const f = V[S.view]; $('#view').innerHTML = f ? f() : '';
  renderChatBot();
  icons(); (V.after?.[S.view] || (() => { }))();
}

/* ---------- Login ---------- */
function renderLogin() {
  $('#app').innerHTML = `<div class="login"><div class="card fade" style="max-width:400px">
    <img class="login-logo" src="logo.jpg" alt="${esc(BRAND())}">
    <div class="brand-title" style="font-size:1.85rem;margin-bottom:2px">Personal<span>HUB</span></div>
    <p class="mut" style="margin-bottom:14px;font-size:.85rem">Plataforma de Treinos, Nutrição e Gestão Financeira</p>
    <form onsubmit="doLogin(event)">
      <label for="em">E-mail</label>
      <input id="em" type="email" autocomplete="username" placeholder="seu@email.com" required>
      <div class="row sp" style="margin-top:8px;margin-bottom:3px">
        <label for="pw" style="margin:0">Senha</label>
        <button type="button" class="btn sm ghost" style="padding:1px 7px;min-height:20px;font-size:.7rem" onclick="const p=$('#pw');p.type=p.type==='password'?'text':'password';this.textContent=p.type==='password'?'👁️ Mostrar':'🙈 Ocultar'">👁️ Mostrar</button>
      </div>
      <input id="pw" type="password" autocomplete="current-password" placeholder="••••••" required>
      <div class="err" id="err" role="alert"></div>
      <button class="btn block" style="margin-top:10px">Entrar na plataforma</button>
    </form>
  </div></div>`;
  icons();
}

async function doLogin(e) {
  e.preventDefault();
  const emVal = ($('#em')?.value || '').trim().toLowerCase();
  const pwVal = $('#pw')?.value || '';
  if (Cloud.enabled) {
    $('#err').textContent = 'Entrando...';
    try { S.user = await Cloud.login(emVal, pwVal); S.ceoStudentMode = false; S.view = S.user.role === 'student' ? 'profile' : 'home'; render(); if (S.user.role === 'student') startReminders(); }
    catch (err) { $('#err').textContent = err.message; }
    return;
  }
  await syncFromLocalStore();
  const u = (DB?.users || []).find(x => (x.email || '').trim().toLowerCase() === emVal);
  if (!u) {
    return $('#err').textContent = `O e-mail "${emVal}" não foi encontrado neste navegador. Certifique-se de entrar no mesmo navegador (sem aba anônima) onde o CEO realizou o cadastro.`;
  }
  const ok = await verifyUserPassword(u, pwVal);
  if (!ok) {
    return $('#err').textContent = `Senha incorreta para ${u.name} (${u.email}). Caso necessário, entre como CEO → Professores → clique em "Editar" ou "Senha" para definir a senha.`;
  }
  if (!u.active) return $('#err').textContent = 'Conta desativada. Fale com a administração.';
  S.user = u; S.ceoStudentMode = false;
  sessionStorage.setItem('personalhub_sess', u.id);
  localStorage.setItem('personalhub_sess', u.id);
  S.view = u.role === 'student' ? 'profile' : 'home'; render();
  if (u.role === 'student') startReminders();
}
async function logout() {
  sessionStorage.removeItem('personalhub_sess');
  localStorage.removeItem('personalhub_sess');
  if (Cloud.enabled) await Cloud.logout();
  S.user = null; S.ceoStudentMode = false; render();
}
async function changePw(e, id) {
  e.preventDefault(); const pw = (e.target.pw.value || '').trim();
  if (pw.length < 4) return toast('Informe uma senha válida (mín. 4 caracteres).');
  if (Cloud.enabled) {
    try { id === S.user.id ? await Cloud.setOwnPassword(pw) : await Cloud.fn('resetPassword', { id, password: pw }); closeModal(); toast('Senha atualizada ✅'); }
    catch (err) { toast(err.message); }
    return;
  }
  const u = userById(id) || S.user;
  u.salt = uid() + uid();
  u.hash = await hash(pw, u.salt);
  u.plainPw = pw;
  u.updatedAt = Date.now();
  save(); closeModal(); render(); toast(`Senha de ${u.name} atualizada com sucesso ✅`);
}
const pwForm = id => {
  const u = userById(id);
  return `<form onsubmit="changePw(event,'${id}')">
    ${u ? `<p class="mut" style="margin-bottom:8px">Conta: <b>${esc(u.name)}</b> (${esc(u.email)}) ${u.plainPw ? `· Senha atual: <b class="gold">${esc(u.plainPw)}</b>` : ''}</p>` : ''}
    <label>Nova senha de acesso</label>
    <input name="pw" type="text" minlength="4" required value="${esc(u?.plainPw || '')}" placeholder="Digite a nova senha" autocomplete="new-password">
    <button class="btn block" style="margin-top:12px">💾 Salvar nova senha</button>
  </form>`;
};

/* Menu de Ações Rápidas do Aluno (despolui os cards da lista mantendo 100% dos recursos) */
function openStudentActionsModal(sid) {
  const s = student(sid) || userById(sid);
  if (!s) return;
  const fst = finStatus(s);
  modal(`<h2>👤 Opções do Aluno — ${esc(s.name)}</h2>
  <div class="card" style="margin:8px 0;background:#101518;border-color:var(--gold)">
    <div class="row sp">
      <div>
        <b>${esc(s.name)}</b> <span class="role-pill">${s.autonomous || !s.trainerId ? 'Sem Personal' : 'Com Personal'}</span>
        <div class="mut" style="font-size:.78rem;margin-top:2px">${esc(s.email)} ${s.phone ? '· ' + esc(s.phone) : ''}</div>
        <div class="mut" style="font-size:.78rem">Situação: <span class="fin-badge ${fst.badgeClass}">${fst.label} · ${fmtBRL(fst.amount)}</span></div>
      </div>
      ${s.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waBillingUrl(s)}">💬 WhatsApp</a>` : ''}
    </div>
  </div>
  <div style="display:grid;gap:7px">
    <button class="action-item-btn" style="border-color:rgba(0,229,255,.45);color:#00E5FF" onclick="closeModal();openInbodyModule('${s.id}')">📊 Avaliação Física & InBody 770 (Composição, Dobras e Gráficos)</button>
    <button class="action-item-btn" onclick="closeModal();go('workouts','${s.id}')">🏋️ Ficha de Treino (Ver e Editar)</button>
    <button class="action-item-btn" onclick="closeModal();openStudentProgressionModal('${s.id}')">📈 Progressão de Cargas & Mesociclo</button>
    <button class="action-item-btn" onclick="closeModal();openGoalReportModal('${s.id}')">📋 Relatório de Objetivos (Auto-Treino)</button>
    ${!s.finance?.paid ? `<button class="action-item-btn" style="border-color:rgba(74,222,128,.4);color:#4ade80" onclick="closeModal();openMarkPaidModal('${s.id}')">✅ Confirmar Pagamento / Dar Baixa</button>` : ''}
    <button class="action-item-btn" onclick="closeModal();openFinanceEditModal('${s.id}')">💰 Reajustar Mensalidade & Vencimento</button>
    <button class="action-item-btn" onclick="closeModal();openFinHistoryModal('${s.id}')">📜 Histórico de Pagamentos</button>
    <button class="action-item-btn" onclick="closeModal();exportWorkoutModal('${s.id}')">📤 Exportar / Imprimir Treino</button>
    <button class="action-item-btn" onclick="closeModal();studentForm('${s.id}')">✏️ Editar Cadastro do Aluno</button>
    <button class="action-item-btn" onclick="closeModal();modal('<h2>Redefinir senha</h2>'+pwForm('${s.id}'))">🔑 Redefinir Senha de Acesso</button>
    <button class="action-item-btn" onclick="closeModal();toggleUserActive('${s.id}')">${s.active ? '⏸️ Desativar Aluno' : '▶️ Ativar Aluno'}</button>
    <button class="action-item-btn danger" onclick="closeModal();delStudent('${s.id}')">🗑️ Excluir Aluno</button>
  </div>`);
}

/* Menu de Ações Rápidas do Professor Mini CEO */
function openTrainerActionsModal(tid) {
  const t = userById(tid);
  if (!t) return;
  const count = DB.users.filter(u => u.role === 'student' && u.trainerId === t.id).length;
  const fst = finStatus(t);
  modal(`<h2>👨‍🏫 Opções do Professor — ${esc(t.name)}</h2>
  <div class="card" style="margin:8px 0;background:#101518;border-color:var(--gold)">
    <div class="row sp">
      <div>
        <b>${esc(t.name)}</b> <span class="role-pill">Mini CEO</span>
        <div class="mut" style="font-size:.78rem;margin-top:2px">${esc(t.email)} ${t.phone ? '· ' + esc(t.phone) : ''} · <b>${count} aluno(s)</b></div>
        <div class="mut" style="font-size:.78rem">Assinatura Plataforma: <span class="fin-badge ${fst.badgeClass}">${fst.label} · ${fmtBRL(fst.amount)}</span></div>
      </div>
      ${t.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waBillingUrl(t)}">💬 WhatsApp</a>` : ''}
    </div>
  </div>
  <div style="display:grid;gap:7px">
    <button class="action-item-btn" onclick="closeModal();go('students',{trainerId:'${t.id}'})">👥 Ver Carteira de Alunos (${count})</button>
    ${!t.finance?.paid ? `<button class="action-item-btn" style="border-color:rgba(74,222,128,.4);color:#4ade80" onclick="closeModal();openMarkPaidModal('${t.id}')">✅ Confirmar Pagamento da Assinatura</button>` : `<button class="action-item-btn" onclick="closeModal();reopenBillingCycle('${t.id}')">🔄 Iniciar Novo Ciclo de Cobrança</button>`}
    <button class="action-item-btn" onclick="closeModal();openFinanceEditModal('${t.id}')">📈 Reajustar Mensalidade & Vencimento</button>
    <button class="action-item-btn" onclick="closeModal();openFinHistoryModal('${t.id}')">📜 Histórico de Pagamentos</button>
    <button class="action-item-btn" onclick="closeModal();trainerForm('${t.id}')">✏️ Editar Cadastro do Professor</button>
    <button class="action-item-btn" onclick="closeModal();modal('<h2>Redefinir senha do professor</h2>'+pwForm('${t.id}'))">🔑 Redefinir Senha de Acesso</button>
    <button class="action-item-btn" onclick="closeModal();toggleUserActive('${t.id}')">${t.active ? '⏸️ Desativar Professor' : '▶️ Ativar Professor'}</button>
    <button class="action-item-btn danger" onclick="closeModal();delTrainer('${t.id}')">🗑️ Excluir Professor</button>
  </div>`);
}

/* ======================= PAINEL CEO & PROFESSOR (MINI CEO) ======================= */
const ADMIN = {
  after: {},
  inbody() {
    return renderInbodyView();
  },
  home() {
    const st = students(), act = st.filter(s => s.active), today = day();
    const tr = act.filter(s => trainedDays(s.id).has(today)), away = act.filter(s => daysSince(s.id) > 3);
    const goals = act.filter(s => waterToday(s.id) >= waterGoal(curWeight(s.id)));
    const wk = week().map(d => ({ l: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()], v: act.filter(s => trainedDays(s.id).has(day(d))).length }));
    const myStudentIds = new Set(st.map(s => s.id));
    const ck = DB.checkins.filter(c => c.date === today && myStudentIds.has(c.uid));
    const trs = trainers();
    const autos = autoStudents();

    // Cálculo do resumo financeiro para o Painel Inicial
    const finTargetList = isCeo() ? [...trs, ...autos] : st;
    const finSummary = calcFinanceMetrics(finTargetList);
    const myTrainerFin = isTrainer() ? finStatus(S.user) : null;
    const ceoNoticesForTrainer = isTrainer() ? DB.messages.filter(m => m.to === S.user.id).slice(-3).reverse() : [];

    return `<h1>${isCeo() ? 'Painel Geral (CEO)' : 'Painel do Professor · Mini CEO'}</h1>
    <p class="mut">${greet()}, ${esc(S.user.name.split(' ')[0])}! ${isCeo() ? 'Você tem visão e controle total de todos os professores, financeiro, alunos sem personal e alunos com personal.' : 'Como Mini CEO, você tem autonomia total para cadastrar seus alunos, montar treinos e controlar seu Financeiro e inadimplências.'}</p>

    <!-- Resumo Financeiro Rápido no Painel -->
    <div class="card" style="margin-top:12px;background:linear-gradient(135deg,#142514,#13191d);border-color:var(--gold)">
      <div class="row sp" style="margin-bottom:10px">
        <div>
          <h2 style="margin-bottom:2px">💰 Resumo Financeiro ${isCeo() ? '(Professores & Alunos Sem Personal)' : '(Meus Alunos)'}</h2>
          <p class="mut">${isCeo() ? 'Controle quem já pagou, datas a vencer, inadimplências, reajustes e a conta bancária de recebimento.' : 'Acompanhe os alunos que já pagaram, quem ainda falta pagar, vencimentos e inadimplências.'}</p>
        </div>
        <div class="row">
          <button class="btn" onclick="go('finance')">💰 Abrir Aba Financeiro</button>
          ${isCeo() ? `<button class="btn ghost sm" onclick="openBankAccountModal()">🏦 Conta Bancária</button>` : ''}
          <button class="btn ghost sm" onclick="openBulkAdjustmentModal()">📈 Fazer Reajuste</button>
          ${isTrainer() ? `<button class="btn ghost sm" onclick="studentForm()">${ic('plus')}Cadastrar Aluno</button>` : ''}
        </div>
      </div>
      <div class="grid">
        <div class="fin-stat ok" style="cursor:pointer" onclick="S.finFilter='paid';go('finance')">
          <b>${fmtBRL(finSummary.paidTotal)}</b>
          <span>✅ Já pagaram (${finSummary.paidCount})</span>
        </div>
        <div class="fin-stat warn" style="cursor:pointer" onclick="S.finFilter='due';go('finance')">
          <b>${fmtBRL(finSummary.dueTotal)}</b>
          <span>⏳ Falta pagar / A vencer (${finSummary.dueCount})</span>
        </div>
        <div class="fin-stat bad" style="cursor:pointer" onclick="S.finFilter='overdue';go('finance')">
          <b>${fmtBRL(finSummary.overdueTotal)}</b>
          <span>🚨 Inadimplentes (${finSummary.overdueCount})</span>
        </div>
        <div class="fin-stat" style="cursor:pointer" onclick="S.finFilter='all';go('finance')">
          <b class="gold">${fmtBRL(finSummary.expectedTotal)}</b>
          <span>📊 Total previsto (${finTargetList.length})</span>
        </div>
      </div>
    </div>

    ${isTrainer() && myTrainerFin ? `<div class="card" style="border-left:4px solid ${myTrainerFin.code === 'overdue' ? '#f87171' : myTrainerFin.code === 'paid' ? '#4ade80' : '#fbbf24'}">
      <div class="row sp">
        <div>
          <b>🏷️ Minha Assinatura na Plataforma (Mini CEO):</b> <span class="fin-badge ${myTrainerFin.badgeClass}">${myTrainerFin.label}</span>
          <div class="mut" style="margin-top:2px">Valor: <b class="gold">${fmtBRL(myTrainerFin.amount)}</b> (${esc(myTrainerFin.cycle)}) · ${esc(myTrainerFin.detailText)}</div>
        </div>
        <div class="row">
          <button class="btn sm ok-btn" onclick="openInAppPaymentModal('${S.user.id}')">💳 Pagar pelo App (PIX, Crédito ou Débito)</button>
          <button class="btn sm ghost" onclick="openFinHistoryModal('${S.user.id}')">📜 Comprovantes</button>
        </div>
      </div>
      ${ceoNoticesForTrainer.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #242e35">${ceoNoticesForTrainer.map(m => `<div class="msg" style="margin-bottom:4px"><b>📣 Aviso da Administração (CEO):</b> ${esc(m.text)} <span class="mut">(${fmtDate(m.date.slice(0, 10))})</span></div>`).join('')}</div>` : ''}
    </div>` : ''}

    ${isCeo() ? `<div class="card" style="margin-top:10px;background:linear-gradient(135deg,#192b0c,#13191d);border-color:var(--gold)">
      <div class="row sp">
        <div>
          <h2 style="margin-bottom:4px">📋 Controle de Alunos Sem Personal & Modo Aluno</h2>
          <p class="mut">Gerencie os alunos que montam treino automático pelo Relatório de Objetivos e pagam mensalidade direto sem precisar de personal.</p>
        </div>
        <div class="row">
          <button class="btn" onclick="go('autostudents')">Alunos Sem Personal (${autos.length})</button>
          <button class="btn ghost" onclick="toggleCeoStudentMode(true)">🏃 Entrar como Apenas Aluno</button>
        </div>
      </div>
    </div>` : ''}

    <div class="grid" style="margin:14px 0">
      ${isCeo() ? `<div class="card stat" style="cursor:pointer" onclick="go('trainers')"><b>${trs.length}</b><span>Professores (Mini CEOs)</span></div>` : ''}
      ${isCeo() ? `<div class="card stat" style="cursor:pointer" onclick="go('autostudents')"><b>${autos.length}</b><span>Alunos Sem Personal</span></div>` : ''}
      <div class="card stat" style="cursor:pointer" onclick="go('students')"><b>${st.length}</b><span>${isCeo() ? 'Total de Alunos' : 'Meus Alunos'}</span></div>
      <div class="card stat"><b>${act.length}</b><span>Alunos ativos</span></div>
      <div class="card stat"><b>${tr.length}</b><span>Treinaram hoje</span></div>
      <div class="card stat"><b>${away.length}</b><span>Sem treinar +3 dias</span></div>
      <div class="card stat"><b>${goals.length}</b><span>Metas de água batidas</span></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Frequência semanal</h2>${barChart(wk)}</div>
      <div class="card"><h2>⚠️ Alunos ausentes (+3 dias)</h2>${away.length ? away.map(s => `<div class="row sp" style="padding:6px 0;border-bottom:1px solid #222a30"><span><b>${esc(s.name)}</b> <span class="mut">(${daysSince(s.id) > 100 ? 'nunca treinou' : daysSince(s.id) + ' dias'})</span></span><div class="row">${s.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waUrl(s.phone)}">WhatsApp</a>` : ''}<button class="btn sm ghost" onclick="sendMsg('${s.id}','Sentimos sua falta! Bora treinar hoje? 💪');toast('Aviso enviado!')">Cobrar no app</button></div></div>`).join('') : '<p class="mut">Todos os alunos estão em dia 🎉</p>'}</div>
    </div>
    <div class="card"><h2>Respostas dos alunos hoje</h2>${ck.length ? ck.map(c => `<div class="msg"><b>${esc(student(c.uid)?.name)}</b> — Dia: ${esc(c.mood || '—')} · Treinou: ${esc(c.trained || '—')}</div>`).join('') : '<p class="mut">Nenhum check-in registrado hoje.</p>'}</div>`;
  },

  /* --- ABA FINANCEIRO COMPLETA (CEO & PROFESSOR MINI CEO) --- */
  finance() {
    return renderFinanceView();
  },

  /* --- 2ª PÁGINA DO CEO: Alunos Sem Personal (Treino Automático via Relatório) & Controle de Papel --- */
  autostudents() {
    if (!isCeo()) return '<p class="mut">Acesso restrito ao CEO.</p>';
    const list = autoStudents();
    const allUsers = DB.users.filter(u => u.id !== S.user.id);
    return `<div class="row sp">
      <div>
        <h1>Alunos Sem Personal & Controle de Acesso</h1>
        <p class="mut">Controle total dos alunos que respondem o <b>Relatório de Objetivos</b> para gerar treino automático e pagam a mensalidade diretamente sem precisar do personal.</p>
      </div>
      <div class="row">
        <button class="btn ghost" onclick="S.finTab='auto';go('finance')">💰 Financeiro Sem Personal</button>
        <button class="btn ghost" onclick="toggleCeoStudentMode(true)">🏃 Ver como Apenas Aluno</button>
        <button class="btn" onclick="studentForm(null, true)">${ic('plus')}Novo Aluno (Sem Personal)</button>
      </div>
    </div>

    <div class="card" style="margin-top:14px;border-color:var(--gold)">
      <h2>🔀 Controle de Perfil: Definir quem é "Apenas Aluno" vs "Professor (Mini CEO)"</h2>
      <p class="mut" style="margin-bottom:10px">Defina o perfil de cada conta cadastrada. O <b>Professor</b> atua como um Mini CEO (cadastra alunos, monta treinos e tem aba Financeiro própria).</p>
      <div style="display:grid;gap:8px">
        ${allUsers.map(u => {
          const isOnlyStudent = u.role === 'student';
          const isAuto = u.role === 'student' && (u.autonomous || !u.trainerId);
          const fst = finStatus(u);
          return `<div class="row sp" style="padding:8px 10px;background:#11161a;border-radius:10px;border:1px solid #253038">
            <div>
              <b>${esc(u.name)}</b> <span class="mut">(${esc(u.email)})</span>
              <span class="role-pill" style="margin-left:6px">${isOnlyStudent ? (isAuto ? '🏃 Aluno Sem Personal' : '🏃 Aluno Com Personal') : '👨‍🏫 Professor · Mini CEO'}</span>
              <span class="fin-badge ${fst.badgeClass}" style="margin-left:4px">${fst.shortLabel} · ${fmtBRL(fst.amount)}</span>
            </div>
            <div class="row" style="gap:6px">
              <button class="btn sm ${isOnlyStudent && isAuto ? '' : 'ghost'}" onclick="setUserAccountType('${u.id}','auto_student')">🏃 Aluno Sem Personal</button>
              <button class="btn sm ${isOnlyStudent && !isAuto ? '' : 'ghost'}" onclick="setUserAccountType('${u.id}','trainer_student')">🏋️ Aluno Com Personal</button>
              <button class="btn sm ${u.role === 'trainer' ? '' : 'ghost'}" onclick="setUserAccountType('${u.id}','trainer')">👨‍🏫 Professor (Mini CEO)</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <h2 style="margin-top:18px">📋 Alunos Sem Personal — Relatórios, Treinos & Mensalidades (${list.length})</h2>
    ${list.map(s => {
      const r = s.report;
      const ws = DB.workouts[s.id] || [];
      const fst = finStatus(s);
      return `<div class="card">
        <div class="row sp">
          <div class="row">
            <div class="avatar">${esc(s.name[0])}</div>
            <div>
              <b>${esc(s.name)}</b> <span class="role-pill">🤖 Sem Personal</span>
              <span class="fin-badge ${fst.badgeClass}" style="margin-left:4px">${fst.label} · ${fmtBRL(fst.amount)}</span>
              <div class="mut">${esc(s.email)} ${s.phone ? '· 📞 ' + esc(s.phone) : ''} · ${ws.length} dia(s) de treino · ${esc(fst.detailText)}</div>
            </div>
          </div>
          <div class="row" style="gap:5px;flex-shrink:0">
            ${!s.finance?.paid ? `<button class="btn sm ok-btn" onclick="openMarkPaidModal('${s.id}')" title="Confirmar pagamento">✅ Pagar</button>` : ''}
            <button class="btn sm" onclick="openGoalReportModal('${s.id}')">📋 ${r ? 'Relatório' : 'Preencher'}</button>
            <button class="btn sm ghost" onclick="go('workouts','${s.id}')">🏋️ Treino</button>
            <button class="btn sm ghost" onclick="openStudentActionsModal('${s.id}')" title="Mais opções">⋯ Mais</button>
          </div>
        </div>
        ${r ? renderReportSummaryHtml(r) : `<p class="mut" style="margin-top:10px">⚠️ Este aluno ainda não preencheu o Relatório de Objetivos. Clique em <b>"Preencher Relatório"</b> para montar o treino automático dele.</p>`}
      </div>`;
    }).join('') || '<div class="card"><p class="mut">Nenhum aluno sem personal cadastrado ainda.</p></div>'}`;
  },

  /* --- Gestão de Professores / Mini CEOs (Exclusivo CEO) --- */
  trainers() {
    if (!isCeo()) return '<p class="mut">Acesso restrito ao CEO.</p>';
    const q = (S.param?.q || '').toLowerCase();
    const list = trainers().filter(t => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || (t.phone || '').includes(q));
    return `<div class="row sp">
      <div>
        <h1>Professores · Mini CEOs (${trainers().length})</h1>
        <p class="mut">Cada professor cadastrado atua como um <b>Mini CEO</b>: gerencia seus alunos, cadastra novos clientes, monta treinos e possui sua própria aba de <b>Financeiro</b>.</p>
      </div>
      <div class="row">
        <button class="btn ghost" onclick="S.finTab='trainers';go('finance')">💰 Financeiro dos Professores</button>
        <button class="btn" onclick="trainerForm()">${ic('plus')}Novo Professor (Mini CEO)</button>
      </div>
    </div>
    <input id="searchTrainerInp" placeholder="Buscar professor por nome, e-mail ou telefone..." value="${esc(S.param?.q || '')}" oninput="S.param={q:this.value};render();focusInputEnd('#searchTrainerInp')" style="margin:12px 0"/>
    ${list.map(t => {
      const count = DB.users.filter(u => u.role === 'student' && u.trainerId === t.id).length;
      const fst = finStatus(t);
      return `<div class="card row sp" style="align-items:center;gap:10px">
        <div class="row" style="flex:1;min-width:0">
          <div class="avatar">${esc(t.name[0])}</div>
          <div style="min-width:0">
            <div class="row" style="gap:5px;flex-wrap:wrap">
              <b>${esc(t.name)}</b> <span class="role-pill">👨‍🏫 Mini CEO</span> ${t.active ? '' : '<span class="mut" style="font-size:.75rem">(Inativo)</span>'}
              <span class="fin-badge ${fst.badgeClass}">${fst.label} · ${fmtBRL(fst.amount)}</span>
            </div>
            <div class="mut" style="font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.email)} ${t.phone ? '· 📞 ' + esc(t.phone) : ''} · <b class="gold">${count} aluno(s)</b> · ${esc(fst.detailText)}</div>
            ${t.notes ? `<div class="mut" style="font-size:.75rem">${esc(t.notes)}</div>` : ''}
          </div>
        </div>
        <div class="row" style="gap:5px;flex-shrink:0">
          ${!t.finance?.paid ? `<button class="btn sm ok-btn" onclick="openMarkPaidModal('${t.id}')" title="Confirmar pagamento da assinatura">✅ Pagar</button>` : ''}
          <button class="btn sm" onclick="go('students',{trainerId:'${t.id}'})">👥 Alunos (${count})</button>
          ${t.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waBillingUrl(t)}" title="Chamar no WhatsApp">💬</a>` : ''}
          <button class="btn sm ghost" onclick="openTrainerActionsModal('${t.id}')" title="Mais opções">⋯ Mais</button>
        </div>
      </div>`;
    }).join('') || '<div class="card"><p class="mut">Nenhum professor encontrado.</p></div>'}`;
  },

  /* --- Gestão de Alunos (CEO e Professores Mini CEO) --- */
  students() {
    const q = (S.param?.q || '').toLowerCase();
    const tf = S.param?.trainerId || '';
    const list = students(tf || null).filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.phone || '').includes(q));
    return `<div class="row sp">
      <div>
        <h1>${isCeo() ? 'Alunos (Clientes)' : 'Meus Alunos (Carteira Mini CEO)'}</h1>
        <p class="mut">${isCeo() ? 'Gerencie todos os alunos da plataforma, fichas de treino e mensalidades.' : 'Cadastre seus alunos, acompanhe treinos e controle os pagamentos e vencimentos de cada um.'}</p>
      </div>
      <div class="row">
        <button class="btn ghost" onclick="go('finance')">💰 Ver Financeiro</button>
        ${isCeo() ? `<button class="btn ghost" onclick="studentForm(null, true)">${ic('sparkles')}Novo Aluno (Sem Personal)</button>` : ''}
        <button class="btn" onclick="studentForm()">${ic('plus')}Novo Aluno</button>
      </div>
    </div>
    <div class="row" style="margin:12px 0">
      <input id="searchStudentInp" placeholder="Buscar aluno por nome, e-mail ou telefone..." value="${esc(S.param?.q || '')}" oninput="S.param={...S.param,q:this.value};render();focusInputEnd('#searchStudentInp')" style="flex:2;min-width:220px"/>
      ${isCeo() ? `<select onchange="S.param={...S.param,trainerId:this.value};render()" style="flex:1;min-width:200px">
        <option value="">Todos os alunos (${students().length})</option>
        <option value="__auto__" ${tf === '__auto__' ? 'selected' : ''}>🤖 Sem Personal / Treino Automático (${autoStudents().length})</option>
        <option value="${S.user.id}" ${tf === S.user.id ? 'selected' : ''}>Diretos do CEO</option>
        ${trainers().map(t => `<option value="${t.id}" ${tf === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
      </select>` : ''}
    </div>
    ${list.map(s => {
      const fst = finStatus(s);
      return `<div class="card row sp" style="align-items:center;gap:10px">
        <div class="row" style="cursor:pointer;flex:1;min-width:0" onclick="go('student:view','${s.id}')">
          <div class="avatar">${esc(s.name[0])}</div>
          <div style="min-width:0">
            <div class="row" style="gap:5px;flex-wrap:wrap">
              <b>${esc(s.name)}</b> ${s.active ? '' : '<span class="mut" style="font-size:.75rem">(inativo)</span>'}
              <span class="fin-badge ${fst.badgeClass}">${fst.shortLabel} · ${fmtBRL(fst.amount)}</span>
            </div>
            <div class="mut" style="font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.goal || 'Sem objetivo')} · ${curWeight(s.id)} kg · 🔥${streak(s.id)} ${s.phone ? '· 📞 ' + esc(s.phone) : ''}</div>
            <div class="mut" style="font-size:.74rem">📅 ${esc(fst.detailText)} ${isCeo() ? `· <span class="gold">${esc(trainerName(s.trainerId, s))}</span>` : ''}</div>
          </div>
        </div>
        <div class="row" style="gap:5px;flex-shrink:0">
          ${!s.finance?.paid ? `<button class="btn sm ok-btn" onclick="openMarkPaidModal('${s.id}')" title="Confirmar pagamento da mensalidade">✅ Pagar</button>` : ''}
          <button class="btn sm" onclick="go('workouts','${s.id}')">🏋️ Treinos</button>
          ${s.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waBillingUrl(s)}" title="Chamar no WhatsApp">💬</a>` : ''}
          <button class="btn sm ghost" onclick="openStudentActionsModal('${s.id}')" title="Mais opções">⋯ Mais</button>
        </div>
      </div>`;
    }).join('') || '<div class="card"><p class="mut">Nenhum aluno cadastrado ainda. Clique em "Novo Aluno" para cadastrar.</p></div>'}`;
  },

  'student:view'() {
    const s = student(S.param); if (!s) return '<p class="mut">Aluno não encontrado.</p>';
    const w = my('weights', s.id).sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ l: fmtDate(x.date).slice(0, 5), v: x.kg }));
    const logs = my('logs', s.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const fst = finStatus(s);
    return `<button class="btn ghost sm" onclick="go('students')">← Voltar para alunos</button>
    <div class="row sp" style="margin-top:10px">
      <h1>${esc(s.name)}</h1>
      <div class="row">
        ${!s.finance?.paid ? `<button class="btn sm ok-btn" onclick="openMarkPaidModal('${s.id}')">✅ Dar Baixa Mensalidade</button>` : ''}
        <button class="btn sm ghost" onclick="openFinanceEditModal('${s.id}')">💰 Mensalidade (${fmtBRL(fst.amount)})</button>
        <button class="btn sm" onclick="openGoalReportModal('${s.id}')">📋 Relatório & Auto-Treino</button>
        ${s.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waBillingUrl(s)}">💬 WhatsApp (${esc(s.phone)})</a>` : ''}
        <button class="btn sm ghost" onclick="studentForm('${s.id}')">${ic('pencil')}Editar ficha</button>
      </div>
    </div>
    <div class="card">
      <div class="row sp" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #242d33">
        <div>
          <span class="mut">Situação Financeira:</span>
          <span class="fin-badge ${fst.badgeClass}" style="margin-left:6px">${fst.label}</span>
          <div class="mut" style="margin-top:4px">Mensalidade: <b class="gold">${fmtBRL(fst.amount)}</b> (${esc(fst.cycle)} · ${esc(fst.method)}) · ${esc(fst.detailText)}</div>
        </div>
        <div class="row">
          <button class="btn sm ghost" onclick="openFinanceEditModal('${s.id}')">📈 Reajustar / Alterar Vencimento</button>
          <button class="btn sm ghost" onclick="openFinHistoryModal('${s.id}')">📜 Histórico</button>
        </div>
      </div>
      <div class="grid">
        <div><span class="mut">Idade</span><br>${s.age || '—'}</div>
        <div><span class="mut">Altura</span><br>${s.height || '—'} cm</div>
        <div><span class="mut">Peso atual</span><br>${curWeight(s.id)} kg</div>
        <div><span class="mut">Objetivo</span><br>${esc(s.goal || '—')}</div>
        <div><span class="mut">Meta de água</span><br>${waterGoal(curWeight(s.id))} ml</div>
        <div><span class="mut">Sequência</span><br>🔥 ${streak(s.id)} dias</div>
      </div>
      <p style="margin-top:10px"><span class="mut">Telefone (opcional):</span> ${s.phone ? esc(s.phone) : 'Não informado'}</p>
      <p><span class="mut">E-mail (login):</span> ${esc(s.email)}</p>
      ${isCeo() ? `<p><span class="mut">Modalidade / Professor:</span> <b class="gold">${esc(trainerName(s.trainerId, s))}</b></p>` : ''}
      <p><span class="mut">Lesões / restrições:</span> ${esc(s.injuries || '—')}</p>
      <p><span class="mut">Observações:</span> ${esc(s.notes || '—')}</p>
    </div>
    ${s.report ? `<div class="card"><h2>📋 Relatório de Objetivos Respondido</h2>${renderReportSummaryHtml(s.report)}</div>` : ''}
    <div class="grid2">
      <div class="card"><h2>Evolução do peso</h2>${lineChart(w)}</div>
      <div class="card"><h2>Treinos concluídos</h2>${logs.map(l => `<div class="msg">${fmtDate(l.date)} — ${esc(l.name)}</div>`).join('') || '<p class="mut">Nenhum treino concluído ainda.</p>'}</div>
    </div>
    <div class="row">
      <button class="btn" onclick="go('workouts','${s.id}')">${ic('dumbbell')}Editar treinos</button>
      <button class="btn ghost" onclick="openStudentProgressionModal('${s.id}')">${ic('trending-up')}Progressão de Cargas & Mesociclo</button>
      <button class="btn ghost" onclick="exportWorkoutModal('${s.id}')">${ic('download')}Exportar treino</button>
      <button class="btn ghost" onclick="importWorkoutModal('${s.id}')">${ic('upload')}Importar treino</button>
      <button class="btn ghost" onclick="msgForm('${s.id}')">${ic('send')}Enviar recado</button>
    </div>`;
  },

  /* --- Editor de Treinos com Sincronização em Tempo Real --- */
  workouts() {
    const sts = students();
    const sid = (S.param && sts.some(x => x.id === S.param)) ? S.param : sts[0]?.id;
    if (!sid) return '<h1>Treinos & Evolução em Tempo Real</h1><div class="card"><p class="mut">Cadastre um aluno primeiro na aba Alunos para montar, importar ou exportar treinos.</p></div>';
    const ws = DB.workouts[sid] = DB.workouts[sid] || [];
    const mode = S.adminWorkoutMode || 'interactive';

    return `
      <div class="row sp" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <div>
          <h1 style="display:flex;align-items:center;gap:8px">
            <span>🏋️ Treinos & Evolução de Cargas</span>
            <span class="realtime-badge" id="realtimeSyncBadge"><span class="realtime-pulse"></span> Tempo Real</span>
          </h1>
          <p class="mut">Adicione, edite ou remova exercícios e acompanhe a evolução de cargas e microciclos do aluno em tempo real.</p>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <select onchange="go('workouts',this.value)" style="min-width:200px;background:#141C2B;border-color:var(--gold);color:#fff;padding:6px 10px;border-radius:10px;font-weight:600">
            ${sts.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>👤 ${esc(s.name)} ${isCeo() ? '(' + esc(trainerName(s.trainerId, s)) + ')' : ''}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Barra de Ferramentas do Professor (Mini CEO / CEO) -->
      <div class="card" style="margin-bottom:12px;padding:10px 12px;background:#101518;border-color:#26343e">
        <div class="row sp" style="gap:6px;flex-wrap:wrap">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn sm" onclick="addDay('${sid}')">${ic('plus')} Novo Dia</button>
            <button class="btn sm ghost" onclick="openGoalReportModal('${sid}')">⚡ Gerar pelo Relatório</button>
            <button class="btn sm ghost" onclick="exportWorkoutModal('${sid}')">${ic('download')} Exportar</button>
            <button class="btn sm ghost" onclick="importWorkoutModal('${sid}')">${ic('upload')} Importar</button>
            <button class="btn sm ghost" onclick="dupForm('${sid}')">${ic('copy')} Duplicar</button>
            <button class="btn sm ghost" onclick="tplForm('${sid}')">${ic('bookmark')} Modelos</button>
          </div>
          <div class="row" style="gap:6px">
            <button class="btn sm ghost" style="color:#00E5FF;border-color:rgba(0,229,255,.3)" onclick="openInbodyModule('${sid}')">
              ${ic('activity')} InBody & Avaliação
            </button>
            ${mode === 'all_days'
              ? `<button class="btn sm" onclick="S.adminWorkoutMode='interactive';render()">🏋️ Visão Interativa & Cargas</button>`
              : `<button class="btn sm ghost" onclick="S.adminWorkoutMode='all_days';render()">📋 Visão Geral (Todos os Dias)</button>`}
          </div>
        </div>
      </div>

      ${mode === 'interactive'
        ? renderStudentWorkoutModule(sid, true)
        : `
          ${ws.map(d => `<div class="card">
            <div class="row sp" style="margin-bottom:8px">
              <input value="${esc(d.name)}" onchange="renameDay('${sid}','${d.id}',this.value)" style="max-width:340px;font-weight:700">
              <div class="row" style="gap:6px">
                <button class="btn sm" onclick="exForm('${sid}','${d.id}')">${ic('plus')} Exercício</button>
                <button class="btn sm danger" onclick="delDay('${sid}','${d.id}')" title="Excluir dia">${ic('trash-2')}</button>
              </div>
            </div>
            <div ondragover="event.preventDefault()">
              ${d.exercises.map((x, i) => `<div class="ex" draggable="true" ondragstart="S.drag=[${i},'${d.id}']" ondrop="dropEx(event,'${sid}','${d.id}',${i})" ondragover="event.preventDefault()">
                <span class="mut" style="cursor:grab">⠿</span>
                <div class="info"><b>${esc(x.name)}</b><span class="mut">${esc(x.group || 'Geral')} · ${x.sets}x${esc(x.reps)} · ${esc(x.load || '—')} · ${x.rest || 60}s</span>${x.notes ? `<div class="mut">📝 ${esc(x.notes)}</div>` : ''}</div>
                <button class="btn sm ghost" aria-label="Subir" onclick="moveEx('${sid}','${d.id}',${i},-1)">↑</button>
                <button class="btn sm ghost" aria-label="Descer" onclick="moveEx('${sid}','${d.id}',${i},1)">↓</button>
                <button class="btn sm ghost" onclick="exForm('${sid}','${d.id}','${x.id}')">${ic('pencil')}</button>
                <button class="btn sm danger" onclick="delExConfirm('${sid}','${d.id}','${x.id}')">${ic('trash-2')}</button>
              </div>`).join('') || '<p class="mut" style="margin-top:8px">Sem exercícios neste dia. Clique em "+ Exercício" acima.</p>'}
            </div>
          </div>`).join('') || '<div class="card"><p class="mut">Nenhum dia de treino criado para este aluno. Clique em "Novo dia", "Gerar pelo Relatório" ou "Importar".</p></div>'}
        `}
    `;
  },

  community() { return communityView(); },

  msgs() {
    const myStIds = new Set(students().map(s => s.id));
    const all = [...DB.messages].filter(m => isCeo() || m.from === S.user.id || m.to === S.user.id || myStIds.has(m.to)).reverse().slice(0, 40);
    return `<div class="row sp"><h1>Mensagens e avisos</h1><button class="btn" onclick="msgForm('all')">${ic('send')}Novo aviso</button></div>
    <div style="margin-top:12px">${all.map(m => {
      const targetUser = userById(m.to);
      const fromUser = userById(m.from);
      const toLabel = m.to === 'all' ? 'Todos os alunos' : (m.to === S.user.id ? 'Você (' + S.user.name + ')' : (targetUser?.name || '?'));
      return `<div class="msg"><b>De: ${esc(fromUser?.name || 'Administração')} → Para: ${esc(toLabel)}</b> <span class="mut">· ${new Date(m.date).toLocaleString('pt-BR')}</span><br>${esc(m.text)}</div>`;
    }).join('') || '<p class="mut">Nenhuma mensagem enviada.</p>'}</div>`;
  },

  study() { return studyView(true); },

  settings() {
    const gemKey = localStorage.getItem('personalhub_gemini_key') || window.APP_CONFIG?.GEMINI_API_KEY || '';
    const isCloud = Cloud.enabled;
    const bank = getBankAccountConfig();
    return `<h1>Configurações</h1>
    <div class="card row sp">
      <div class="row">
        <div class="avatar">${esc(S.user.name[0])}</div>
        <div><b>${esc(S.user.name)}</b><div class="mut">${esc(S.user.email)} · ${esc(roleLabel(S.user.role))}</div></div>
      </div>
      <div class="row">
        <button class="btn sm ghost" onclick="go('finance')">💰 Abrir Financeiro</button>
        ${isTrainer() ? `<button class="btn sm ok-btn" onclick="openInAppPaymentModal('${S.user.id}')">💳 Pagar Minha Assinatura</button>` : ''}
        ${isCeo() ? `<button class="btn sm ghost" onclick="toggleCeoStudentMode(true)">🏃 Modo Apenas Aluno</button>` : ''}
      </div>
    </div>

    ${isCeo() ? `<div class="card" style="border-color:var(--gold)">
      <div class="row sp">
        <div>
          <h2>🏦 Conta Bancária de Recebimento (PIX, Crédito e Débito)</h2>
          <p class="mut" style="margin-top:2px">Conta onde caem os pagamentos realizados pelos <b>Professores</b> e <b>Alunos</b> dentro do aplicativo:</p>
          <div style="margin-top:6px;font-size:.84rem">
            <b>${esc(bank.bankName)}</b> · Ag: <b>${esc(bank.agency)}</b> · Conta: <b>${esc(bank.accountNumber)}</b> (${esc(bank.accountType)})<br>
            Titular: <b class="gold">${esc(bank.holderName)}</b> (${esc(bank.holderDoc)}) · Chave PIX (${esc(bank.pixKeyType)}): <b>${esc(bank.pixKey)}</b>
          </div>
        </div>
        <button class="btn" onclick="openBankAccountModal()">🏦 Ajustar Conta Bancária</button>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="row sp">
        <div>
          <h2>📲 Baixar PersonalHUB no Celular (App PWA)</h2>
          <p class="mut" style="margin-top:2px">Instale o aplicativo direto no seu Android ou iPhone para acesso rápido com tela cheia, sem barra do navegador.</p>
        </div>
        <button class="btn-install" onclick="installPwa()">${ic('download')}Instalar Aplicativo</button>
      </div>
    </div>

    <div class="card">
      <div class="row sp" style="margin-bottom:8px">
        <div>
          <h2>🔄 Sincronização entre Celular e Computador</h2>
          <p class="mut">Mantenha todos os professores, alunos, financeiro, treinos e fotos sincronizados entre o PC e o celular.</p>
        </div>
        <span class="sync-badge ${isCloud ? 'online' : 'local'}">${isCloud ? '☁️ Supabase Conectado' : '💾 Modo Local (IndexedDB)'}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="openSyncModal()">${ic('refresh-cw')}Central de Sincronização & Backup</button>
        <button class="btn ghost" onclick="openSupabaseModal()">${ic('database')}Configurar Nuvem (Supabase)</button>
      </div>
    </div>

    <div class="card">
      <h2>Alterar minha senha</h2>
      ${pwForm(S.user.id)}
    </div>
    <div class="card">
      <h2>🤖 Chave de IA para Câmera Nutricional (Opcional)</h2>
      <p class="mut">O scanner de refeição já funciona automaticamente. Se desejar usar reconhecimento avançado por IA (Google Gemini Vision), cole sua chave gratuita do Google AI Studio abaixo:</p>
      <form onsubmit="event.preventDefault();localStorage.setItem('personalhub_gemini_key',this.k.value.trim());toast('Chave de IA salva ✅')">
        <label>Chave Gemini API (opcional)</label>
        <input name="k" type="password" placeholder="AIzaSy..." value="${esc(gemKey)}">
        <button class="btn ghost" style="margin-top:10px">Salvar chave de IA</button>
      </form>
    </div>
    <button class="btn ghost block" onclick="logout()">${ic('log-out')}Sair da conta</button>`;
  },
};

/* ======================= MÓDULO FINANCEIRO, INADIMPLÊNCIA, CONTA BANCÁRIA & CHECKOUT NO APP ======================= */
function calcFinanceMetrics(list) {
  let paidTotal = 0, dueTotal = 0, overdueTotal = 0, expectedTotal = 0;
  let paidCount = 0, dueCount = 0, overdueCount = 0;
  (list || []).forEach(u => {
    const st = finStatus(u);
    const val = +(st.amount || 0);
    expectedTotal += val;
    if (st.code === 'paid') {
      paidTotal += val;
      paidCount++;
    } else if (st.code === 'overdue') {
      overdueTotal += val;
      overdueCount++;
    } else {
      dueTotal += val;
      dueCount++;
    }
  });
  return { paidTotal, dueTotal, overdueTotal, expectedTotal, paidCount, dueCount, overdueCount };
}

function renderFinanceView() {
  const trs = trainers();
  const autos = autoStudents();
  const trStudents = DB.users.filter(u => u.role === 'student' && !u.autonomous && u.trainerId && u.trainerId !== S.user.id);

  // Abas do CEO vs Visão do Professor (Mini CEO)
  if (!S.finTab) S.finTab = isCeo() ? 'ceo_all' : 'my_students';
  if (!isCeo()) S.finTab = 'my_students';
  const fStatus = S.finFilter || 'all';
  const q = (S.finQ || '').toLowerCase();

  let rawList = [];
  let sectionTitle = '';
  let sectionSub = '';

  if (isCeo()) {
    if (S.finTab === 'trainers') {
      rawList = trs;
      sectionTitle = `👨‍🏫 Mensalidades dos Professores · Mini CEOs (${trs.length})`;
      sectionSub = 'Professores cadastrados na plataforma que já pagaram ou irão pagar a assinatura ao CEO pelo app.';
    } else if (S.finTab === 'auto') {
      rawList = autos;
      sectionTitle = `🤖 Alunos Sem Personal (${autos.length})`;
      sectionSub = 'Alunos que treinam pelo Gerador Automático e pagam a mensalidade diretamente ao CEO sem precisar de personal.';
    } else if (S.finTab === 'trainer_students') {
      rawList = trStudents;
      sectionTitle = `🏋️ Carteira dos Professores (${trStudents.length})`;
      sectionSub = 'Visão de auditoria das mensalidades dos alunos gerenciados por cada professor (Mini CEO).';
    } else {
      rawList = [...trs, ...autos];
      sectionTitle = `👑 Carteira Direta do CEO: Professores + Alunos Sem Personal (${rawList.length})`;
      sectionSub = 'Controle unificado dos Professores (Mini CEOs) e dos Alunos Sem Personal que pagam diretamente à conta bancária configurada.';
    }
  } else {
    rawList = students();
    sectionTitle = `👨‍🏫 Meus Alunos Cadastrados (${rawList.length})`;
    sectionSub = 'Como Mini CEO, gerencie aqui os alunos que já pagaram, quem ainda falta pagar, datas de vencimento, inadimplências e reajustes.';
  }

  const metrics = calcFinanceMetrics(rawList);

  // Filtragem por status e busca
  const filtered = rawList.filter(u => {
    const st = finStatus(u);
    if (fStatus === 'paid' && st.code !== 'paid') return false;
    if (fStatus === 'overdue' && st.code !== 'overdue') return false;
    if (fStatus === 'due' && !(st.code === 'due' || st.code === 'soon')) return false;
    if (q) {
      const hay = `${u.name} ${u.email} ${u.phone || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const order = { overdue: 0, soon: 1, due: 2, paid: 3 };
    const sa = finStatus(a), sb = finStatus(b);
    if (order[sa.code] !== order[sb.code]) return order[sa.code] - order[sb.code];
    return String(sa.dueDate).localeCompare(String(sb.dueDate));
  });

  const defs = getFinDefaults();
  const bank = getBankAccountConfig();
  const myDefaultFee = isTrainer() ? (DB.settings?.[S.user.id]?.defaultStudentFee || defs.trainerStudentFee) : defs.autoStudentFee;

  return `<div class="row sp">
    <div>
      <h1>💰 Financeiro, Pagamentos no App & Inadimplência</h1>
      <p class="mut">${isCeo() ? 'Gerencie os pagamentos dos Professores (Mini CEOs), dos Alunos Sem Personal, reajustes e a Conta Bancária onde cai o dinheiro.' : 'Painel Financeiro do Professor (Mini CEO): controle quem já pagou, quem falta pagar, datas a vencer, reajustes e pague sua assinatura pelo app.'}</p>
    </div>
    <div class="row">
      ${isCeo() ? `<button class="btn" onclick="openBankAccountModal()">🏦 Conta Bancária de Recebimento</button>` : `<button class="btn ok-btn" onclick="openInAppPaymentModal('${S.user.id}')">💳 Pagar Minha Assinatura no App</button>`}
      <button class="btn ghost" onclick="openBulkAdjustmentModal()">📈 Fazer Reajuste</button>
      ${isCeo() ? `<button class="btn ghost" onclick="trainerForm()">${ic('plus')}Novo Professor</button><button class="btn ghost" onclick="studentForm(null, true)">${ic('plus')}Aluno Sem Personal</button>` : `<button class="btn ghost" onclick="studentForm()">${ic('plus')}Cadastrar Aluno</button>`}
      <button class="btn ghost sm" onclick="exportFinanceReportModal()">${ic('download')}Exportar</button>
    </div>
  </div>

  <!-- Card da Conta Bancária de Recebimento (Exclusivo CEO para configurar onde cai o dinheiro) -->
  ${isCeo() ? `<div class="card" style="margin-top:12px;background:linear-gradient(135deg,#12241c,#13191d);border-color:var(--gold)">
    <div class="row sp">
      <div style="flex:1;min-width:250px">
        <div class="row" style="gap:8px;margin-bottom:4px">
          <h2 style="margin:0">🏦 Conta Bancária de Destino (Recebimento de Alunos e Professores)</h2>
          <span class="fin-badge paid">Ativa p/ PIX, Crédito e Débito</span>
        </div>
        <p class="mut" style="margin-bottom:6px">Todos os pagamentos feitos no aplicativo por <b>Alunos</b> e <b>Professores</b> via <b>PIX</b>, <b>Cartão de Crédito</b> ou <b>Cartão de Débito</b> caem diretamente nesta conta:</p>
        <div class="grid" style="font-size:.83rem;gap:8px">
          <div style="background:#0d1317;padding:8px 10px;border-radius:10px;border:1px solid #222e36">
            <span class="mut">Instituição / Banco</span><br>
            <b>${esc(bank.bankName)}</b> <span class="mut">(${esc(bank.accountType)})</span>
          </div>
          <div style="background:#0d1317;padding:8px 10px;border-radius:10px;border:1px solid #222e36">
            <span class="mut">Agência e Conta</span><br>
            <b>Ag: ${esc(bank.agency)} · Conta: ${esc(bank.accountNumber)}</b>
          </div>
          <div style="background:#0d1317;padding:8px 10px;border-radius:10px;border:1px solid #222e36">
            <span class="mut">Titular / Favorecido</span><br>
            <b class="gold">${esc(bank.holderName)}</b> <span class="mut">(${esc(bank.holderDoc)})</span>
          </div>
          <div style="background:#0d1317;padding:8px 10px;border-radius:10px;border:1px solid #222e36">
            <span class="mut">Chave PIX (${esc(bank.pixKeyType)})</span><br>
            <b class="gold">${esc(bank.pixKey)}</b>
          </div>
        </div>
      </div>
      <div class="row" style="align-self:center">
        <button class="btn" onclick="openBankAccountModal()">⚙️ Ajustar Conta Bancária / PIX</button>
      </div>
    </div>
  </div>` : ''}

  ${isCeo() ? `<div class="row" style="margin:12px 0 8px;gap:6px;overflow-x:auto;padding-bottom:2px">
    <button class="chip ${S.finTab === 'ceo_all' ? 'on' : ''}" onclick="S.finTab='ceo_all';render()">👑 Todos do CEO (${trs.length + autos.length})</button>
    <button class="chip ${S.finTab === 'trainers' ? 'on' : ''}" onclick="S.finTab='trainers';render()">👨‍🏫 Professores · Mini CEOs (${trs.length})</button>
    <button class="chip ${S.finTab === 'auto' ? 'on' : ''}" onclick="S.finTab='auto';render()">🤖 Alunos Sem Personal (${autos.length})</button>
    <button class="chip ${S.finTab === 'trainer_students' ? 'on' : ''}" onclick="S.finTab='trainer_students';render()">🏋️ Alunos dos Professores (${trStudents.length})</button>
  </div>` : ''}

  <!-- Cards de Indicadores Financeiros -->
  <div class="grid" style="margin:12px 0">
    <div class="fin-stat ok" style="cursor:pointer" onclick="S.finFilter='paid';render()">
      <b>${fmtBRL(metrics.paidTotal)}</b>
      <span>✅ Já Pagaram (${metrics.paidCount})</span>
    </div>
    <div class="fin-stat warn" style="cursor:pointer" onclick="S.finFilter='due';render()">
      <b>${fmtBRL(metrics.dueTotal)}</b>
      <span>⏳ Falta Pagar / A Vencer (${metrics.dueCount})</span>
    </div>
    <div class="fin-stat bad" style="cursor:pointer" onclick="S.finFilter='overdue';render()">
      <b>${fmtBRL(metrics.overdueTotal)}</b>
      <span>🚨 Inadimplentes / Vencidos (${metrics.overdueCount})</span>
    </div>
    <div class="fin-stat" style="cursor:pointer" onclick="S.finFilter='all';render()">
      <b class="gold">${fmtBRL(metrics.expectedTotal)}</b>
      <span>📊 Receita Total Prevista (${rawList.length})</span>
    </div>
  </div>

  <!-- Barra de Valores Padrão e Reajuste Rápido -->
  <div class="card" style="background:linear-gradient(135deg,#162412,#13191d);border-color:var(--line)">
    <div class="row sp">
      <div style="font-size:.84rem">
        ${isCeo()
          ? `🏷️ <b>Mensalidades Padrão Atuais:</b> Professor (Mini CEO): <b class="gold">${fmtBRL(defs.trainerFee)}</b> · Aluno Sem Personal: <b class="gold">${fmtBRL(defs.autoStudentFee)}</b> · Aluno c/ Personal: <b class="gold">${fmtBRL(defs.trainerStudentFee)}</b>`
          : `🏷️ <b>Sua Mensalidade Padrão p/ Novos Alunos:</b> <b class="gold">${fmtBRL(myDefaultFee)}</b> · Você possui <b>${rawList.length} aluno(s)</b> na sua carteira`}
      </div>
      <div class="row">
        <button class="btn sm ghost" onclick="openBulkAdjustmentModal()">📈 Reajustar Valores (% ou R$)</button>
        ${metrics.overdueCount > 0 ? `<button class="btn sm danger" onclick="remindAllOverdue()">🔔 Cobrar Todos Inadimplentes (${metrics.overdueCount})</button>` : ''}
      </div>
    </div>
  </div>

  <!-- Filtros de Status e Pesquisa -->
  <div class="card" style="padding:10px 14px">
    <div class="row sp" style="gap:8px">
      <div class="row" style="gap:6px">
        <button class="chip ${fStatus === 'all' ? 'on' : ''}" onclick="S.finFilter='all';render()">Todos (${rawList.length})</button>
        <button class="chip ${fStatus === 'overdue' ? 'on' : ''}" onclick="S.finFilter='overdue';render()">🚨 Inadimplentes (${metrics.overdueCount})</button>
        <button class="chip ${fStatus === 'due' ? 'on' : ''}" onclick="S.finFilter='due';render()">⏳ Falta Pagar / A Vencer (${metrics.dueCount})</button>
        <button class="chip ${fStatus === 'paid' ? 'on' : ''}" onclick="S.finFilter='paid';render()">✅ Já Pagaram (${metrics.paidCount})</button>
      </div>
      <input id="finSearchInp" placeholder="Buscar por nome, e-mail ou telefone..." value="${esc(S.finQ || '')}" oninput="S.finQ=this.value;render();focusInputEnd('#finSearchInp')" style="max-width:290px;min-width:190px;margin:0">
    </div>
  </div>

  <div style="margin:12px 0 8px">
    <h2>${sectionTitle}</h2>
    <p class="mut">${sectionSub}</p>
  </div>

  ${filtered.map(u => {
    const st = finStatus(u);
    const f = u.finance;
    const isProf = u.role === 'trainer';
    const isAuto = u.role === 'student' && (u.autonomous || !u.trainerId);
    const stCount = isProf ? DB.users.filter(x => x.role === 'student' && x.trainerId === u.id).length : 0;
    const typeBadge = isProf
      ? `👨‍🏫 Professor · Mini CEO (${stCount} aluno${stCount === 1 ? '' : 's'})`
      : (isAuto ? '🤖 Aluno Sem Personal (Direto)' : `🏋️ Aluno (${esc(trainerName(u.trainerId, u))})`);

    return `<div class="fin-row-card ${st.code}">
      <div class="row sp">
        <div class="row" style="flex:1;min-width:240px">
          ${u.photo ? `<img class="avatar" src="${u.photo}" alt="">` : `<div class="avatar">${esc(u.name[0])}</div>`}
          <div style="flex:1">
            <div class="row" style="gap:6px">
              <b style="font-size:1rem">${esc(u.name)}</b>
              <span class="role-pill">${typeBadge}</span>
              <span class="fin-badge ${st.badgeClass}">${st.label}</span>
            </div>
            <div class="row" style="margin-top:4px;gap:10px;font-size:.84rem">
              <span>💰 Mensalidade: <b class="gold" style="font-size:.96rem">${fmtBRL(f.amount)}</b> <span class="mut">(${esc(f.cycle)} · ${esc(f.method)})</span></span>
              <span>📅 <b>${esc(st.detailText)}</b></span>
            </div>
            ${f.lastAdjustment ? `<div class="mut" style="font-size:.75rem;margin-top:2px">📈 Último reajuste em ${fmtDate(f.lastAdjustment.date)}: era ${fmtBRL(f.lastAdjustment.oldAmount)} → <b>${fmtBRL(f.lastAdjustment.newAmount)}</b> ${f.lastAdjustment.reason ? `(${esc(f.lastAdjustment.reason)})` : ''}</div>` : ''}
            ${f.notes ? `<div class="mut" style="font-size:.76rem;margin-top:2px">📝 ${esc(f.notes)}</div>` : ''}
            <div class="mut" style="font-size:.75rem;margin-top:2px">${esc(u.email)} ${u.phone ? '· 📞 ' + esc(u.phone) : ''}</div>
          </div>
        </div>

        <div class="row" style="gap:6px">
          ${!f.paid
            ? `<button class="btn sm ok-btn" onclick="openInAppPaymentModal('${u.id}')">💳 Pagar no App</button>
               <button class="btn sm ghost" onclick="openMarkPaidModal('${u.id}')">✅ Dar Baixa</button>`
            : `<button class="btn sm ghost" onclick="reopenBillingCycle('${u.id}')" title="Marcar próximo mês como pendente ou estornar">🔄 Novo Ciclo</button>`
          }
          <button class="btn sm ghost" onclick="openFinanceEditModal('${u.id}')">📈 Reajustar / Venc.</button>
          ${u.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waBillingUrl(u)}">💬 WhatsApp</a>` : ''}
          ${!f.paid ? `<button class="btn sm ghost" onclick="sendBillingReminderApp('${u.id}')">🔔 Cobrar no App</button>` : ''}
          <button class="btn sm ghost" onclick="openFinHistoryModal('${u.id}')" title="Histórico de pagamentos">📜 (${(f.history || []).length})</button>
        </div>
      </div>
    </div>`;
  }).join('') || `<div class="card"><p class="mut">Nenhum registro encontrado para este filtro.</p></div>`}

  ${isTrainer() ? (() => {
    const mySt = finStatus(S.user);
    const destBank = getReceivingBankForUser(S.user);
    return `<div class="card" style="margin-top:18px;border-color:var(--gold)">
      <div class="row sp">
        <div>
          <h2>👑 Minha Assinatura na Plataforma PersonalHUB (Mini CEO)</h2>
          <p class="mut">Pague sua assinatura diretamente pelo aplicativo via <b>PIX</b>, <b>Cartão de Crédito</b> ou <b>Cartão de Débito</b>:</p>
          <div style="margin-top:8px">
            <span class="fin-badge ${mySt.badgeClass}">${mySt.label}</span>
            <span style="margin-left:8px">Valor: <b class="gold">${fmtBRL(mySt.amount)}</b> (${esc(mySt.cycle)} · ${esc(mySt.method)})</span>
            <div class="mut" style="margin-top:4px">📅 ${esc(mySt.detailText)} · Conta destino: <b>${esc(destBank.bankName)}</b> (Ag ${esc(destBank.agency)} / Cc ${esc(destBank.accountNumber)})</div>
          </div>
        </div>
        <div class="row">
          <button class="btn ok-btn" onclick="openInAppPaymentModal('${S.user.id}')">💳 Pagar Assinatura pelo App (PIX / Crédito / Débito)</button>
          <button class="btn ghost sm" onclick="openFinHistoryModal('${S.user.id}')">📜 Meus Comprovantes</button>
        </div>
      </div>
    </div>`;
  })() : ''}`;
}

/* --- Configuração da Conta Bancária Recebedora pelo CEO --- */
function openBankAccountModal() {
  if (!isCeo()) return toast('Apenas o CEO pode alterar a conta bancária de recebimento.');
  const b = getBankAccountConfig();
  const bankSuggestions = [
    '260 - Nu Pagamentos S.A. (Nubank)',
    '001 - Banco do Brasil S.A.',
    '341 - Itaú Unibanco S.A.',
    '077 - Banco Inter S.A.',
    '104 - Caixa Econômica Federal',
    '237 - Banco Bradesco S.A.',
    '033 - Banco Santander (Brasil) S.A.',
    '336 - Banco C6 S.A. (C6 Bank)',
    '290 - Pagseguro Internet S.A. (PagBank)',
    '323 - Mercado Pago',
    '756 - Banco Cooperativo do Brasil (Sicoob)',
    '748 - Banco Cooperativo Sicredi',
  ];
  modal(`<h2>🏦 Conta Bancária de Recebimento (CEO)</h2>
  <p class="mut" style="margin-bottom:10px">Configure a conta bancária e chave PIX onde cairá o dinheiro dos pagamentos feitos por <b>Alunos</b> e <b>Professores</b> pelo aplicativo (via <b>PIX</b>, <b>Cartão de Crédito</b> ou <b>Cartão de Débito</b>):</p>
  <form onsubmit="saveBankAccountConfig(event)">
    <div class="grid2">
      <div>
        <label>Banco / Instituição Financeira</label>
        <input name="bankName" list="bankList" required value="${esc(b.bankName)}" placeholder="Ex.: 260 - Nubank, 341 - Itaú...">
        <datalist id="bankList">${bankSuggestions.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      </div>
      <div>
        <label>Tipo de Conta</label>
        <select name="accountType">
          ${['Conta Corrente', 'Conta de Pagamento', 'Conta Poupança'].map(t => `<option ${b.accountType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="grid2">
      <div><label>Agência</label><input name="agency" required value="${esc(b.agency)}" placeholder="Ex.: 0001"></div>
      <div><label>Número da Conta com Dígito</label><input name="accountNumber" required value="${esc(b.accountNumber)}" placeholder="Ex.: 9845120-7"></div>
    </div>

    <div class="grid2">
      <div><label>Nome do Titular / Razão Social (Favorecido)</label><input name="holderName" required value="${esc(b.holderName)}" placeholder="Ex.: PersonalHUB Gestão Esportiva"></div>
      <div><label>CPF ou CNPJ do Titular</label><input name="holderDoc" required value="${esc(b.holderDoc)}" placeholder="Ex.: 00.000.000/0001-00 ou CPF"></div>
    </div>

    <div class="card" style="margin-top:10px;background:#101518;border-color:var(--gold)">
      <h3 style="color:var(--gold);margin-bottom:6px">💠 Configuração de Chave PIX e Cartões no App</h3>
      <div class="grid2">
        <div>
          <label>Tipo de Chave PIX</label>
          <select name="pixKeyType">
            ${['E-mail', 'CNPJ', 'CPF', 'Celular', 'Chave Aleatória'].map(t => `<option ${b.pixKeyType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Chave PIX que receberá os pagamentos</label>
          <input name="pixKey" required value="${esc(b.pixKey)}" placeholder="Ex.: financeiro@personalhub.com">
        </div>
      </div>
      <div class="grid2">
        <div><label>Cidade do Titular (Padrão BR Code PIX)</label><input name="city" required value="${esc(b.city || 'SAO PAULO')}" placeholder="Ex.: SAO PAULO"></div>
        <div>
          <label>Parcelamento Máximo no Cartão de Crédito</label>
          <select name="maxInstallments">
            ${[1, 2, 3, 4, 6, 10, 12].map(n => `<option value="${n}" ${+(b.maxInstallments || 6) === n ? 'selected' : ''}>Até ${n}x sem juros</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:10px;gap:14px">
        <label style="display:inline-flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--txt)">
          <input type="checkbox" name="allowPix" ${b.allowPix !== false ? 'checked' : ''} style="width:17px;min-height:17px;margin:0"> 💠 Aceitar PIX no App
        </label>
        <label style="display:inline-flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--txt)">
          <input type="checkbox" name="allowCredit" ${b.allowCredit !== false ? 'checked' : ''} style="width:17px;min-height:17px;margin:0"> 💳 Aceitar Cartão de Crédito
        </label>
        <label style="display:inline-flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--txt)">
          <input type="checkbox" name="allowDebit" ${b.allowDebit !== false ? 'checked' : ''} style="width:17px;min-height:17px;margin:0"> 💳 Aceitar Cartão de Débito
        </label>
      </div>
    </div>

    <div class="row" style="margin-top:14px">
      <button class="btn block" style="flex:1">💾 Salvar Conta Bancária de Recebimento</button>
      <button class="btn ghost" type="button" onclick="closeModal()">Cancelar</button>
    </div>
  </form>`);
}

function saveBankAccountConfig(e) {
  e.preventDefault();
  if (!isCeo()) return;
  const f = e.target;
  const bank = {
    bankName: f.bankName.value.trim(),
    accountType: f.accountType.value,
    agency: f.agency.value.trim(),
    accountNumber: f.accountNumber.value.trim(),
    holderName: f.holderName.value.trim(),
    holderDoc: f.holderDoc.value.trim(),
    pixKeyType: f.pixKeyType.value,
    pixKey: f.pixKey.value.trim(),
    city: (f.city.value || 'SAO PAULO').trim().toUpperCase(),
    maxInstallments: +f.maxInstallments.value || 6,
    allowPix: !!f.allowPix.checked,
    allowCredit: !!f.allowCredit.checked,
    allowDebit: !!f.allowDebit.checked,
    updatedAt: day(),
  };
  if (!bank.allowPix && !bank.allowCredit && !bank.allowDebit) {
    bank.allowPix = true;
  }
  DB.settings = DB.settings || {};
  DB.settings.__bank_account__ = bank;
  if (S.user?.id) {
    DB.settings[S.user.id] = { ...(DB.settings[S.user.id] || {}), bankAccount: bank };
  }
  // Propaga a conta recebedora para todos os usuários para sincronizar também na nuvem
  (DB.users || []).forEach(u => {
    if (u.role !== 'ceo' && u.role !== 'admin') {
      ensureUserFinance(u);
      u.finance.recipientBank = { ...bank };
    }
  });
  save();
  closeModal();
  render();
  toast('Conta bancária de recebimento atualizada com sucesso! 🏦✅');
}

/* --- Checkout de Pagamento Direto pelo Aplicativo (PIX, Cartão de Crédito e Cartão de Débito) --- */
function detectCardBrand(numStr) {
  const d = String(numStr || '').replace(/\D/g, '');
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'MASTERCARD';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|650|6516|6550)/.test(d)) return 'ELO';
  if (/^(34|37)/.test(d)) return 'AMEX';
  if (/^(606282|3841)/.test(d)) return 'HIPERCARD';
  return 'CARTÃO';
}

function formatCardInput(inp) {
  const digits = inp.value.replace(/\D/g, '').slice(0, 16);
  inp.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  updateCardLivePreview();
}

function formatExpiryInput(inp) {
  const digits = inp.value.replace(/\D/g, '').slice(0, 4);
  inp.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
  updateCardLivePreview();
}

function updateCardLivePreview() {
  const numEl = $('#ccNumInp');
  const nameEl = $('#ccNameInp');
  const expEl = $('#ccExpInp');
  const numOut = $('#ccPrevNum');
  const nameOut = $('#ccPrevName');
  const expOut = $('#ccPrevExp');
  const brandOut = $('#ccPrevBrand');
  if (numOut && numEl) {
    const raw = numEl.value.trim();
    numOut.textContent = raw || '•••• •••• •••• ••••';
    if (brandOut) brandOut.textContent = detectCardBrand(raw);
  }
  if (nameOut && nameEl) nameOut.textContent = (nameEl.value.trim() || 'NOME DO TITULAR').toUpperCase();
  if (expOut && expEl) expOut.textContent = expEl.value.trim() || 'MM/AA';
}

function copyPixToClipboard(text, label = 'Código PIX') {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(`${label} copiado! 📋✅`)).catch(() => toast(`${label} selecionado!`));
  } else {
    const inp = $('#pixCopyInput');
    if (inp) { inp.select(); document.execCommand('copy'); }
    toast(`${label} copiado! 📋✅`);
  }
}

function openInAppPaymentModal(targetUid = S.user?.id, initialTab = null) {
  const u = userById(targetUid) || S.user;
  if (!u) return;
  const f = ensureUserFinance(u);
  if (!f) return toast('Esta conta é isenta de mensalidade.');
  const bank = getReceivingBankForUser(u);
  const availTabs = [];
  if (bank.allowPix !== false) availTabs.push('pix');
  if (bank.allowCredit !== false) availTabs.push('credit');
  if (bank.allowDebit !== false) availTabs.push('debit');
  if (!availTabs.length) availTabs.push('pix');

  const tab = (initialTab && availTabs.includes(initialTab)) ? initialTab : (S.payTab && availTabs.includes(S.payTab) ? S.payTab : availTabs[0]);
  S.payTab = tab;

  const txCode = 'PHUB' + String(u.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() + String(Date.now()).slice(-4);
  const pixPayload = buildPixPayload(bank, f.amount, txCode);
  const qrSvg = renderPixQrSvg(pixPayload);
  const maxInst = +(bank.maxInstallments || 6);
  const isProf = u.role === 'trainer';
  const planTitle = isProf ? 'Assinatura Professor (Mini CEO)' : (u.autonomous || !u.trainerId ? 'Mensalidade Aluno Sem Personal' : 'Mensalidade Aluno');

  modal(`<h2>💳 Pagamento pelo Aplicativo — ${esc(u.name)}</h2>
  <div class="card" style="margin:8px 0;background:linear-gradient(135deg,#142514,#12181c);border-color:var(--gold)">
    <div class="row sp">
      <div>
        <span class="role-pill">${esc(planTitle)}</span>
        <div style="margin-top:4px;font-size:.84rem">Vencimento: <b>${fmtDate(f.dueDate)}</b> · Ciclo: <b>${esc(f.cycle)}</b></div>
      </div>
      <div style="text-align:right">
        <span class="mut" style="font-size:.75rem">Valor a pagar</span>
        <div class="gold" style="font:700 1.65rem var(--font-h);line-height:1">${fmtBRL(f.amount)}</div>
      </div>
    </div>
    <div class="bank-dest-box" style="margin-top:10px;margin-bottom:0">
      <div class="row sp">
        <div>
          <b class="gold">🏦 Conta Bancária de Destino (Recebedor):</b><br>
          <span>Favorecido: <b>${esc(bank.holderName)}</b> (${esc(bank.holderDoc)})</span><br>
          <span>Banco: <b>${esc(bank.bankName)}</b> · Ag: <b>${esc(bank.agency)}</b> · Conta: <b>${esc(bank.accountNumber)}</b> (${esc(bank.accountType)})</span>
        </div>
        ${isCeo() ? `<button type="button" class="btn sm ghost" onclick="openBankAccountModal()">⚙️ Alterar Conta</button>` : ''}
      </div>
    </div>
  </div>

  <label style="margin-top:6px">Escolha como deseja pagar pelo aplicativo:</label>
  <div class="pay-tabs">
    ${bank.allowPix !== false ? `<div class="pay-tab ${tab === 'pix' ? 'on' : ''}" onclick="openInAppPaymentModal('${u.id}','pix')"><b>💠 PIX</b>Instantâneo</div>` : ''}
    ${bank.allowCredit !== false ? `<div class="pay-tab ${tab === 'credit' ? 'on' : ''}" onclick="openInAppPaymentModal('${u.id}','credit')"><b>💳 Crédito</b>Até ${maxInst}x s/ juros</div>` : ''}
    ${bank.allowDebit !== false ? `<div class="pay-tab ${tab === 'debit' ? 'on' : ''}" onclick="openInAppPaymentModal('${u.id}','debit')"><b>💳 Débito</b>À vista no cartão</div>` : ''}
  </div>

  ${tab === 'pix' ? `
    <div class="card" style="text-align:center;background:#10161a">
      <b class="gold" style="font-size:.92rem">💠 Escaneie o QR Code PIX ou use o PIX Copia e Cola</b>
      <div class="qr-box">${qrSvg}</div>
      <div style="font-size:.82rem;margin-bottom:8px">
        Chave PIX (${esc(bank.pixKeyType)}): <b class="gold">${esc(bank.pixKey)}</b>
        <button type="button" class="btn sm ghost" style="padding:2px 8px;min-height:24px;margin-left:6px" onclick="copyPixToClipboard('${esc(bank.pixKey)}','Chave PIX')">📋 Copiar Chave</button>
      </div>
      <label style="text-align:left">Código PIX Copia e Cola (BR Code Oficial):</label>
      <div class="row" style="gap:6px">
        <input id="pixCopyInput" readonly value="${esc(pixPayload)}" style="flex:1;font-family:monospace;font-size:.75rem">
        <button type="button" class="btn sm" onclick="copyPixToClipboard('${esc(pixPayload)}','Código PIX Copia e Cola')">📋 Copiar Código</button>
      </div>
      <form onsubmit="processInAppPayment(event,'${u.id}','PIX')" style="margin-top:14px">
        <input type="hidden" name="txCode" value="${esc(txCode)}">
        <button class="btn ok-btn block" style="min-height:46px;font-size:.96rem">✅ Confirmar Pagamento via PIX (${fmtBRL(f.amount)})</button>
      </form>
    </div>
  ` : ''}

  ${tab === 'credit' ? `
    <form onsubmit="processInAppPayment(event,'${u.id}','Cartão de Crédito')">
      <input type="hidden" name="txCode" value="${esc(txCode)}">
      <div class="cc-preview">
        <div class="row sp">
          <div class="cc-chip"></div>
          <span class="role-pill" id="ccPrevBrand">CRÉDITO</span>
        </div>
        <div class="cc-num" id="ccPrevNum">•••• •••• •••• ••••</div>
        <div class="cc-meta">
          <div><span style="font-size:.62rem;opacity:.7;display:block">Titular do Cartão</span><b id="ccPrevName">${esc(u.name.toUpperCase())}</b></div>
          <div><span style="font-size:.62rem;opacity:.7;display:block">Validade</span><b id="ccPrevExp">MM/AA</b></div>
        </div>
      </div>

      <label>Número do Cartão de Crédito</label>
      <input id="ccNumInp" name="cardNumber" required minlength="16" maxlength="19" placeholder="0000 0000 0000 0000" oninput="formatCardInput(this)" inputmode="numeric">

      <label>Nome Impresso no Cartão</label>
      <input id="ccNameInp" name="cardHolder" required value="${esc(u.name.toUpperCase())}" placeholder="COMO ESTÁ NO CARTÃO" oninput="updateCardLivePreview()">

      <div class="grid">
        <div>
          <label>Validade (MM/AA)</label>
          <input id="ccExpInp" name="cardExpiry" required minlength="5" maxlength="5" placeholder="12/29" oninput="formatExpiryInput(this)" inputmode="numeric">
        </div>
        <div>
          <label>CVV (3 ou 4 dígitos)</label>
          <input name="cardCvv" type="password" required minlength="3" maxlength="4" placeholder="123" inputmode="numeric">
        </div>
        <div>
          <label>CPF/CNPJ do Titular</label>
          <input name="cardDoc" required placeholder="000.000.000-00">
        </div>
      </div>

      <label>Parcelamento no Cartão de Crédito</label>
      <select name="installments">
        ${Array.from({ length: maxInst }, (_, i) => i + 1).map(n => `<option value="${n}">${n}x de ${fmtBRL(f.amount / n)} sem juros (Total: ${fmtBRL(f.amount)})</option>`).join('')}
      </select>

      <button class="btn ok-btn block" style="margin-top:14px;min-height:46px;font-size:.96rem">🔒 Pagar ${fmtBRL(f.amount)} com Cartão de Crédito</button>
    </form>
  ` : ''}

  ${tab === 'debit' ? `
    <form onsubmit="processInAppPayment(event,'${u.id}','Cartão de Débito')">
      <input type="hidden" name="txCode" value="${esc(txCode)}">
      <div class="cc-preview" style="background:linear-gradient(135deg,#0f292e 0%,#101820 65%,#1a2c38 100%)">
        <div class="row sp">
          <div class="cc-chip"></div>
          <span class="role-pill" id="ccPrevBrand">DÉBITO À VISTA</span>
        </div>
        <div class="cc-num" id="ccPrevNum">•••• •••• •••• ••••</div>
        <div class="cc-meta">
          <div><span style="font-size:.62rem;opacity:.7;display:block">Titular do Cartão de Débito</span><b id="ccPrevName">${esc(u.name.toUpperCase())}</b></div>
          <div><span style="font-size:.62rem;opacity:.7;display:block">Validade</span><b id="ccPrevExp">MM/AA</b></div>
        </div>
      </div>

      <label>Número do Cartão de Débito</label>
      <input id="ccNumInp" name="cardNumber" required minlength="16" maxlength="19" placeholder="0000 0000 0000 0000" oninput="formatCardInput(this)" inputmode="numeric">

      <label>Nome Impresso no Cartão</label>
      <input id="ccNameInp" name="cardHolder" required value="${esc(u.name.toUpperCase())}" placeholder="COMO ESTÁ NO CARTÃO" oninput="updateCardLivePreview()">

      <div class="grid">
        <div>
          <label>Validade (MM/AA)</label>
          <input id="ccExpInp" name="cardExpiry" required minlength="5" maxlength="5" placeholder="12/29" oninput="formatExpiryInput(this)" inputmode="numeric">
        </div>
        <div>
          <label>CVV (Código de Segurança)</label>
          <input name="cardCvv" type="password" required minlength="3" maxlength="4" placeholder="123" inputmode="numeric">
        </div>
        <div>
          <label>CPF/CNPJ do Titular</label>
          <input name="cardDoc" required placeholder="000.000.000-00">
        </div>
      </div>

      <button class="btn ok-btn block" style="margin-top:14px;min-height:46px;font-size:.96rem">🔒 Pagar ${fmtBRL(f.amount)} no Cartão de Débito</button>
    </form>
  ` : ''}

  <button class="btn ghost block" style="margin-top:8px" onclick="closeModal()">Fechar</button>`);
}

function processInAppPayment(e, targetUid, methodType) {
  e.preventDefault();
  const u = userById(targetUid) || S.user;
  if (!u) return;
  const f = ensureUserFinance(u);
  const bank = getReceivingBankForUser(u);
  const fd = Object.fromEntries(new FormData(e.target));

  let methodLabel = methodType;
  let cardLast4 = null;
  let cardBrand = null;

  if (methodType === 'Cartão de Crédito' || methodType === 'Cartão de Débito') {
    const cleanCard = String(fd.cardNumber || '').replace(/\D/g, '');
    if (cleanCard.length < 13) return toast('Digite um número de cartão válido.');
    cardLast4 = cleanCard.slice(-4);
    cardBrand = detectCardBrand(cleanCard);
    const inst = +(fd.installments || 1);
    methodLabel = methodType === 'Cartão de Crédito'
      ? `Cartão de Crédito ${cardBrand} (•••• ${cardLast4}) · ${inst}x`
      : `Cartão de Débito ${cardBrand} (•••• ${cardLast4})`;
  } else {
    methodLabel = 'PIX';
  }

  const paidAmount = +f.amount;
  const paidDate = day();
  const nextDue = addMonthsIso(f.dueDate, f.cycle === 'Trimestral' ? 3 : f.cycle === 'Semestral' ? 6 : f.cycle === 'Anual' ? 12 : 1);
  const txId = fd.txCode || ('PHUB-' + uid().slice(0, 8).toUpperCase());

  f.paid = true;
  f.lastPaidDate = paidDate;
  f.method = methodType;
  f.dueDate = nextDue;
  f.dueDay = Math.min(28, Math.max(1, Number(nextDue.split('-')[2]) || f.dueDay));
  f.recipientBank = {
    bankName: bank.bankName,
    accountType: bank.accountType,
    agency: bank.agency,
    accountNumber: bank.accountNumber,
    holderName: bank.holderName,
    holderDoc: bank.holderDoc,
    pixKey: bank.pixKey,
  };

  const receipt = {
    id: txId,
    date: paidDate,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    amount: paidAmount,
    method: methodLabel,
    cardLast4,
    recipientBank: { ...f.recipientBank },
    note: `Pago pelo App via ${methodLabel} · Destino: ${bank.bankName} (Ag ${bank.agency} / Cc ${bank.accountNumber} - ${bank.holderName})`,
  };
  f.history = f.history || [];
  f.history.unshift(receipt);

  // Envia aviso de confirmação se permitido pela sessão atual
  if (!Cloud.enabled || isStaff()) {
    const ceoUser = DB.users.find(x => x.role === 'ceo');
    if (ceoUser && u.id !== ceoUser.id) {
      DB.messages.push({
        id: uid(),
        from: u.id,
        to: u.trainerId || ceoUser.id,
        text: `💳 Pagamento realizado pelo App! ${u.name} pagou ${fmtBRL(paidAmount)} via ${methodLabel}. Valor destinado à conta ${bank.bankName} (Ag ${bank.agency} · Cc ${bank.accountNumber}).`,
        date: new Date().toISOString(),
        read: false,
      });
    }
  }

  save();
  render();
  openPaymentReceiptModal(u.id, receipt.id);
  toast(`Pagamento via ${methodType} aprovado com sucesso! 🎉✅`);
}

function openPaymentReceiptModal(targetUid, txId = null) {
  const u = userById(targetUid) || S.user;
  if (!u) return;
  const f = ensureUserFinance(u);
  const hist = f?.history || [];
  const tx = (txId && hist.find(h => h.id === txId)) || hist[0];
  if (!tx) return toast('Nenhum comprovante encontrado.');
  const rb = tx.recipientBank || getReceivingBankForUser(u);

  modal(`<h2>🧾 Comprovante de Pagamento Digital</h2>
  <div class="card" style="background:#0d1418;border:1.5px solid #4ade80;margin:10px 0">
    <div style="text-align:center;padding-bottom:10px;border-bottom:1px dashed #26343d">
      <span class="fin-badge paid" style="font-size:.82rem">✅ PAGAMENTO APROVADO NO APP</span>
      <div class="gold" style="font:700 1.9rem var(--font-h);margin-top:6px">${fmtBRL(tx.amount)}</div>
      <div class="mut">Autenticação: <b>${esc(tx.id)}</b> · ${fmtDate(tx.date)} ${tx.time ? 'às ' + esc(tx.time) : ''}</div>
    </div>
    <div style="margin-top:10px;font-size:.84rem;display:grid;gap:6px">
      <div class="row sp"><span class="mut">Pagador(a):</span><b>${esc(u.name)} (${esc(roleLabel(u.role))})</b></div>
      <div class="row sp"><span class="mut">Forma de Pagamento:</span><b class="gold">${esc(tx.method || 'PIX')}</b></div>
      <div class="row sp"><span class="mut">Próximo Vencimento:</span><b>${fmtDate(f.dueDate)}</b></div>
      <div style="margin-top:6px;padding-top:8px;border-top:1px dashed #26343d">
        <span class="mut" style="display:block;margin-bottom:3px">🏦 Conta Bancária Recebedora (Destino):</span>
        <b>${esc(rb.holderName)}</b> <span class="mut">(${esc(rb.holderDoc)})</span><br>
        <span>${esc(rb.bankName)} · Ag: <b>${esc(rb.agency)}</b> · Conta: <b>${esc(rb.accountNumber)}</b></span>
      </div>
    </div>
  </div>
  <div class="row">
    <button class="btn block" style="flex:1" onclick="closeModal()">Concluir</button>
    <button class="btn ghost" type="button" onclick="openFinHistoryModal('${u.id}')">📜 Ver Histórico</button>
  </div>`);
}

/* --- Ações Financeiras: Dar Baixa, Novo Ciclo, Editar/Reajustar Individual e Reajuste em Lote --- */
function openMarkPaidModal(targetUid) {
  const u = userById(targetUid);
  if (!u) return;
  const f = ensureUserFinance(u);
  const nextDue = addMonthsIso(f.dueDate, f.cycle === 'Trimestral' ? 3 : f.cycle === 'Semestral' ? 6 : f.cycle === 'Anual' ? 12 : 1);
  modal(`<h2>✅ Confirmar Pagamento — ${esc(u.name)}</h2>
  <p class="mut" style="margin-bottom:10px">Registre o recebimento da mensalidade e atualize a situação para <b>Em dia (Pago)</b>:</p>
  <form onsubmit="confirmPayment(event,'${u.id}')">
    <div class="grid">
      <div><label>Valor recebido (R$)</label><input name="amount" type="number" step="0.01" min="0" required value="${f.amount}"></div>
      <div><label>Data do pagamento</label><input name="paidDate" type="date" required value="${day()}"></div>
      <div><label>Forma de pagamento</label>
        <select name="method">${['PIX', 'Cartão', 'Boleto', 'Dinheiro'].map(m => `<option ${f.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <label>Data do próximo vencimento</label>
    <input name="nextDueDate" type="date" required value="${nextDue}">
    <label>Observação do comprovante / recibo (opcional)</label>
    <input name="note" placeholder="Ex.: Pago via PIX · Comprovante confirmado" value="Mensalidade paga (${f.cycle})">
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;color:var(--txt)">
      <input type="checkbox" name="notify" checked style="width:18px;min-height:18px;margin:0"> Enviar confirmação de pagamento por aviso no aplicativo
    </label>
    <div class="row" style="margin-top:14px">
      <button class="btn ok-btn block" style="flex:1">✅ Confirmar Recebimento</button>
      <button class="btn ghost" type="button" onclick="closeModal()">Cancelar</button>
    </div>
  </form>`);
}

function confirmPayment(e, targetUid) {
  e.preventDefault();
  const u = userById(targetUid);
  if (!u) return;
  const f = ensureUserFinance(u);
  const fd = Object.fromEntries(new FormData(e.target));
  const amount = +fd.amount || f.amount;
  f.paid = true;
  f.lastPaidDate = fd.paidDate || day();
  f.method = fd.method || f.method;
  if (fd.nextDueDate) {
    f.dueDate = fd.nextDueDate;
    f.dueDay = Math.min(28, Math.max(1, Number(fd.nextDueDate.split('-')[2]) || f.dueDay));
  }
  f.history = f.history || [];
  f.history.unshift({
    id: uid(),
    date: f.lastPaidDate,
    amount,
    method: f.method,
    note: fd.note || 'Pagamento confirmado',
  });
  if (e.target.notify?.checked) {
    sendMsg(u.id, `✅ Pagamento confirmado! Recebemos sua mensalidade de ${fmtBRL(amount)} (${f.method}). Próximo vencimento: ${fmtDate(f.dueDate)}. Muito obrigado! 💪`);
  }
  save();
  closeModal();
  render();
  toast(`Pagamento de ${u.name} confirmado! ✅💰`);
}

function reopenBillingCycle(targetUid) {
  const u = userById(targetUid);
  if (!u) return;
  const f = ensureUserFinance(u);
  f.paid = false;
  save();
  render();
  toast(`${u.name} marcado como "Falta Pagar (A vencer)" para o ciclo de ${fmtDate(f.dueDate)} 📅`);
}

function openFinanceEditModal(targetUid) {
  const u = userById(targetUid);
  if (!u) return;
  const f = ensureUserFinance(u);
  modal(`<h2>📈 Reajustar Mensalidade & Vencimento — ${esc(u.name)}</h2>
  <p class="mut" style="margin-bottom:8px">Ajuste o valor da mensalidade, aplique um percentual de reajuste ou altere a data de vencimento:</p>
  <form onsubmit="saveFinanceEdit(event,'${u.id}')" id="finEditForm">
    <label>Atalho de Reajuste Rápido sobre o valor atual (${fmtBRL(f.amount)})</label>
    <div class="row" style="margin-bottom:8px;gap:5px">
      ${[[-10, '-10% (Desconto)'], [5, '+5%'], [10, '+10%'], [15, '+15%'], [20, '+20%']].map(([pct, lbl]) => `<button type="button" class="chip" onclick="const inp=$('#finEditForm input[name=amount]');inp.value=(${f.amount}*(1+${pct}/100)).toFixed(2);$('#finEditForm input[name=reason]').value='Reajuste de ${pct > 0 ? '+' + pct : pct}%'">${lbl}</button>`).join('')}
    </div>
    <div class="grid">
      <div><label>Valor da Mensalidade (R$)</label><input name="amount" type="number" step="0.01" min="0" required value="${f.amount}"></div>
      <div><label>Data de Vencimento</label><input name="dueDate" type="date" required value="${f.dueDate}"></div>
    </div>
    <div class="grid">
      <div>
        <label>Periodicidade</label>
        <select name="cycle">${['Mensal', 'Trimestral', 'Semestral', 'Anual'].map(c => `<option ${f.cycle === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div>
        <label>Forma de Pagamento</label>
        <select name="method">${['PIX', 'Cartão', 'Boleto', 'Dinheiro'].map(m => `<option ${f.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
      <div>
        <label>Status do Ciclo Atual</label>
        <select name="status">
          <option value="unpaid" ${!f.paid ? 'selected' : ''}>⏳ Falta Pagar (Pendente / A vencer)</option>
          <option value="paid" ${f.paid ? 'selected' : ''}>✅ Já Pagou (Em dia)</option>
        </select>
      </div>
    </div>
    <label>Motivo do reajuste / alteração (opcional)</label>
    <input name="reason" placeholder="Ex.: Reajuste anual, mudança de plano, desconto fidelidade...">
    <label>Observações financeiras</label>
    <input name="notes" value="${esc(f.notes || '')}" placeholder="Ex.: Paga todo dia 10 via PIX">
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;color:var(--txt)">
      <input type="checkbox" name="notify" checked style="width:18px;min-height:18px;margin:0"> Avisar ${esc(u.name.split(' ')[0])} no app caso o valor ou vencimento mude
    </label>
    <div class="row" style="margin-top:14px">
      <button class="btn block" style="flex:1">💾 Salvar Alterações / Reajuste</button>
      <button class="btn ghost" type="button" onclick="closeModal()">Cancelar</button>
    </div>
  </form>`);
}

function saveFinanceEdit(e, targetUid) {
  e.preventDefault();
  const u = userById(targetUid);
  if (!u) return;
  const f = ensureUserFinance(u);
  const fd = Object.fromEntries(new FormData(e.target));
  const oldAmount = +f.amount;
  const newAmount = +fd.amount;

  if (Math.abs(newAmount - oldAmount) >= 0.01) {
    const pct = oldAmount > 0 ? +(((newAmount - oldAmount) / oldAmount) * 100).toFixed(1) : 0;
    f.lastAdjustment = {
      date: day(),
      oldAmount,
      newAmount,
      pct,
      reason: (fd.reason || 'Reajuste de mensalidade').trim(),
    };
  }
  f.amount = newAmount;
  f.dueDate = fd.dueDate || f.dueDate;
  f.dueDay = Math.min(28, Math.max(1, Number(f.dueDate.split('-')[2]) || f.dueDay));
  f.cycle = fd.cycle || 'Mensal';
  f.method = fd.method || 'PIX';
  f.paid = fd.status === 'paid';
  if (f.paid && !f.lastPaidDate) f.lastPaidDate = day();
  f.notes = (fd.notes || '').trim();

  if (e.target.notify?.checked && Math.abs(newAmount - oldAmount) >= 0.01) {
    sendMsg(u.id, `📌 Atualização da sua mensalidade no ${BRAND()}: novo valor ${fmtBRL(newAmount)} (${f.cycle}) com vencimento em ${fmtDate(f.dueDate)}${fd.reason ? ' · Motivo: ' + fd.reason : ''}.`);
  }
  save();
  closeModal();
  render();
  toast('Dados financeiros e reajuste salvos ✅');
}

function openBulkAdjustmentModal() {
  const defs = getFinDefaults();
  const myDefaultFee = isTrainer() ? (DB.settings?.[S.user.id]?.defaultStudentFee || defs.trainerStudentFee) : defs.autoStudentFee;
  modal(`<h2>📈 Fazer Reajuste de Mensalidades</h2>
  <p class="mut" style="margin-bottom:10px">${isCeo() ? 'Aplique reajustes nas mensalidades dos Professores (Mini CEOs), dos Alunos Sem Personal ou atualize os valores padrão da plataforma:' : 'Aplique reajuste nas mensalidades de todos os seus alunos de uma só vez e defina sua mensalidade padrão:'}</p>
  <form onsubmit="applyBulkAdjustment(event)">
    <label>1. Quem receberá o reajuste?</label>
    <select name="targetGroup">
      ${isCeo() ? `
        <option value="trainers">👨‍🏫 Todos os Professores · Mini CEOs (${trainers().length})</option>
        <option value="auto_students">🤖 Todos os Alunos Sem Personal (${autoStudents().length})</option>
        <option value="ceo_both">👑 Professores + Alunos Sem Personal (${trainers().length + autoStudents().length})</option>
        <option value="all_students">🏋️ Todos os Alunos da Plataforma (${students().length})</option>
      ` : `
        <option value="my_students">👥 Todos os Meus Alunos (${students().length})</option>
      `}
    </select>

    <label>2. Tipo de Reajuste</label>
    <select name="adjType" onchange="const u=$('#adjUnitLbl');if(u)u.textContent=this.value==='pct'?'Percentual de Reajuste (%) — ex.: 10 para +10%':this.value==='add'?'Valor a Somar/Subtrair (R$) — ex.: 20':'Novo Valor Fixo da Mensalidade (R$)'">
      <option value="pct">📊 Reajuste por Porcentagem (%) — Ex.: +10%</option>
      <option value="fixed">💵 Definir Novo Valor Fixo Único (R$) — Ex.: R$ 199,90</option>
      <option value="add">➕ Acréscimo ou Desconto em Reais (R$) — Ex.: +R$ 15,00</option>
    </select>

    <label id="adjUnitLbl">Percentual de Reajuste (%) — ex.: 10 para +10%</label>
    <input name="val" type="number" step="0.01" required placeholder="Ex.: 10" value="10">

    <label>Motivo do Reajuste</label>
    <input name="reason" value="Reajuste periódico de mensalidade" placeholder="Ex.: Reajuste anual / Atualização de plano">

    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;color:var(--txt)">
      <input type="checkbox" name="updateDefaults" checked style="width:18px;min-height:18px;margin:0"> Atualizar também o valor padrão para novos cadastros futuros
    </label>
    <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer;color:var(--txt)">
      <input type="checkbox" name="notifyAll" checked style="width:18px;min-height:18px;margin:0"> Enviar aviso automático no app informando o novo valor reajustado
    </label>

    <div class="row" style="margin-top:14px">
      <button class="btn block" style="flex:1">📈 Aplicar Reajuste Agora</button>
      <button class="btn ghost" type="button" onclick="closeModal()">Cancelar</button>
    </div>
  </form>`);
}

function applyBulkAdjustment(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const val = parseFloat(fd.val);
  if (isNaN(val)) return toast('Informe um valor válido.');

  let list = [];
  if (isCeo()) {
    if (fd.targetGroup === 'trainers') list = trainers();
    else if (fd.targetGroup === 'auto_students') list = autoStudents();
    else if (fd.targetGroup === 'ceo_both') list = [...trainers(), ...autoStudents()];
    else list = students();
  } else {
    list = students();
  }

  if (!list.length) return toast('Nenhuma conta encontrada neste grupo.');

  const calcNew = oldVal => {
    if (fd.adjType === 'pct') return Math.max(0, +(oldVal * (1 + val / 100)).toFixed(2));
    if (fd.adjType === 'add') return Math.max(0, +(oldVal + val).toFixed(2));
    return Math.max(0, +val.toFixed(2));
  };

  list.forEach(u => {
    const f = ensureUserFinance(u);
    const oldAmount = +f.amount;
    const newAmount = calcNew(oldAmount);
    const pct = oldAmount > 0 ? +(((newAmount - oldAmount) / oldAmount) * 100).toFixed(1) : 0;
    f.amount = newAmount;
    f.lastAdjustment = {
      date: day(),
      oldAmount,
      newAmount,
      pct,
      reason: (fd.reason || 'Reajuste de mensalidade').trim(),
    };
    if (e.target.notifyAll?.checked) {
      sendMsg(u.id, `📈 Comunicado de Reajuste: sua mensalidade no ${BRAND()} foi atualizada de ${fmtBRL(oldAmount)} para ${fmtBRL(newAmount)} (${fd.reason || 'Atualização de plano'}). Próximo vencimento: ${fmtDate(f.dueDate)}.`);
    }
  });

  if (e.target.updateDefaults?.checked) {
    const defs = getFinDefaults();
    if (isCeo()) {
      if (fd.targetGroup === 'trainers' || fd.targetGroup === 'ceo_both') defs.trainerFee = calcNew(defs.trainerFee);
      if (fd.targetGroup === 'auto_students' || fd.targetGroup === 'ceo_both') defs.autoStudentFee = calcNew(defs.autoStudentFee);
      if (fd.targetGroup === 'all_students') defs.trainerStudentFee = calcNew(defs.trainerStudentFee);
    } else {
      DB.settings[S.user.id] = DB.settings[S.user.id] || {};
      const curDef = DB.settings[S.user.id].defaultStudentFee || defs.trainerStudentFee;
      DB.settings[S.user.id].defaultStudentFee = calcNew(curDef);
    }
  }

  save();
  closeModal();
  render();
  toast(`Reajuste aplicado com sucesso em ${list.length} conta(s)! 📈✅`);
}

function sendBillingReminderApp(targetUid) {
  const u = userById(targetUid);
  if (!u) return;
  const st = finStatus(u);
  const text = st.code === 'overdue'
    ? `⚠️ Olá, ${u.name.split(' ')[0]}! Sua mensalidade de ${fmtBRL(st.amount)} (vencida em ${fmtDate(st.dueDate)}) consta em aberto no sistema. Por favor, regularize ou envie o comprovante para darmos baixa!`
    : `📅 Olá, ${u.name.split(' ')[0]}! Lembrete amigável: sua mensalidade de ${fmtBRL(st.amount)} vence em ${fmtDate(st.dueDate)}. Bons treinos! 💪`;
  sendMsg(u.id, text);
  toast(`Aviso de cobrança enviado no app para ${u.name}! 🔔`);
}

function remindAllOverdue() {
  const list = (isCeo() ? [...trainers(), ...autoStudents()] : students()).filter(u => finStatus(u).code === 'overdue');
  if (!list.length) return toast('Não há inadimplentes no momento!');
  list.forEach(u => {
    const st = finStatus(u);
    sendMsg(u.id, `⚠️ Lembrete Financeiro: sua mensalidade de ${fmtBRL(st.amount)} venceu em ${fmtDate(st.dueDate)}. Entre em contato para regularização.`);
  });
  toast(`Cobrança enviada no app para ${list.length} inadimplente(s)! 🔔`);
}

function openFinHistoryModal(targetUid) {
  const u = userById(targetUid);
  if (!u) return;
  const f = ensureUserFinance(u);
  const st = finStatus(u);
  const hist = f.history || [];
  const bank = getReceivingBankForUser(u);
  modal(`<h2>📜 Histórico Financeiro — ${esc(u.name)}</h2>
  <div class="card" style="margin:8px 0">
    <div class="row sp">
      <span>Status Atual: <span class="fin-badge ${st.badgeClass}">${st.label}</span></span>
      <b>${fmtBRL(f.amount)} / ${esc(f.cycle)}</b>
    </div>
    <div class="mut" style="margin-top:4px">${esc(st.detailText)} · Forma preferencial: ${esc(f.method)}</div>
    <div class="mut" style="margin-top:4px">🏦 Conta de Destino: <b>${esc(bank.bankName)}</b> (Ag ${esc(bank.agency)} · Cc ${esc(bank.accountNumber)} · ${esc(bank.holderName)})</div>
    ${f.lastAdjustment ? `<div class="mut" style="margin-top:4px">📈 Último reajuste: ${fmtDate(f.lastAdjustment.date)} (${fmtBRL(f.lastAdjustment.oldAmount)} → ${fmtBRL(f.lastAdjustment.newAmount)})</div>` : ''}
    <div class="row" style="margin-top:10px">
      <button class="btn sm ok-btn" onclick="openInAppPaymentModal('${u.id}')">💳 Pagar pelo App (PIX, Crédito ou Débito)</button>
    </div>
  </div>
  <h3 style="margin:10px 0 6px">Pagamentos Registrados (${hist.length})</h3>
  <div>
    ${hist.map(h => `<div class="msg">
      <div class="row sp">
        <b>✅ ${fmtBRL(h.amount)} (${esc(h.method || 'PIX')})</b>
        <div class="row" style="gap:6px">
          <span class="mut">${fmtDate(h.date)}</span>
          <button type="button" class="btn sm ghost" style="padding:2px 7px;min-height:22px;font-size:.7rem" onclick="openPaymentReceiptModal('${u.id}','${h.id}')">🧾 Comprovante</button>
        </div>
      </div>
      <div class="mut">${esc(h.note || 'Pagamento confirmado')}</div>
    </div>`).join('') || '<p class="mut">Nenhum pagamento anterior registrado no histórico.</p>'}
  </div>
  <button class="btn block" style="margin-top:12px" onclick="closeModal()">Fechar</button>`);
}

function exportFinanceReportModal() {
  const list = isCeo() ? [...trainers(), ...autoStudents()] : students();
  const m = calcFinanceMetrics(list);
  const lines = [
    `============================================================`,
    `PERSONALHUB - RELATÓRIO FINANCEIRO (${isCeo() ? 'CEO GERAL' : 'PROFESSOR MINI CEO: ' + S.user.name})`,
    `Data de emissão: ${fmtDate(day())}`,
    `============================================================`,
    `RESUMO:`,
    `- Já Pagaram (Recebido): ${fmtBRL(m.paidTotal)} (${m.paidCount})`,
    `- Falta Pagar (A Vencer): ${fmtBRL(m.dueTotal)} (${m.dueCount})`,
    `- Inadimplentes (Em Atraso): ${fmtBRL(m.overdueTotal)} (${m.overdueCount})`,
    `- Total Previsto no Ciclo: ${fmtBRL(m.expectedTotal)} (${list.length})`,
    `============================================================`,
    ``,
    ...list.map(u => {
      const st = finStatus(u);
      const roleStr = u.role === 'trainer' ? 'Professor (Mini CEO)' : (u.autonomous || !u.trainerId ? 'Aluno Sem Personal' : 'Aluno');
      return `• ${u.name} [${roleStr}] | ${fmtBRL(st.amount)} | Venc.: ${fmtDate(st.dueDate)} | Status: ${st.label}`;
    }),
  ];
  downloadFile(`financeiro-personalhub-${day()}.txt`, lines.join('\n'));
  toast('Relatório financeiro exportado ✅');
}

/* ---------- Alteração Rápida de Papel pelo CEO (Apenas Aluno vs Professor) ---------- */
function setUserAccountType(uidTarget, mode) {
  if (!isCeo()) return;
  const u = userById(uidTarget);
  if (!u) return;
  if (mode === 'auto_student') {
    u.role = 'student';
    u.autonomous = true;
    u.trainerId = null;
    ensureUserFinance(u, { amount: getFinDefaults().autoStudentFee });
    if (!DB.workouts[u.id]) DB.workouts[u.id] = u.report ? generateAutoWorkout(u.report) : [];
    toast(`${u.name} agora é Apenas Aluno (Sem Personal · Treino Automático) 🏃`);
  } else if (mode === 'trainer_student') {
    u.role = 'student';
    u.autonomous = false;
    u.trainerId = u.trainerId || trainers()[0]?.id || S.user.id;
    ensureUserFinance(u, { amount: getFinDefaults().trainerStudentFee });
    if (!DB.workouts[u.id]) DB.workouts[u.id] = [];
    toast(`${u.name} agora é Apenas Aluno (Com Personal) 🏋️`);
  } else if (mode === 'trainer') {
    u.role = 'trainer';
    u.autonomous = false;
    u.trainerId = null;
    ensureUserFinance(u, { amount: getFinDefaults().trainerFee });
    toast(`${u.name} agora é Professor · Mini CEO 👨‍🏫`);
  }
  save();
  render();
}

/* ---------- Cadastro / Edição de Professores Mini CEO (CEO) ---------- */
function trainerForm(id) {
  const defs = getFinDefaults();
  const t = id ? userById(id) : { role: 'trainer' };
  const fin = t.finance || { amount: defs.trainerFee, dueDate: day(addDays(10)), method: 'PIX', paid: false };
  modal(`<h2>${id ? 'Editar' : 'Novo'} Professor (Mini CEO)</h2>
  <p class="mut" style="margin-bottom:8px">Ao cadastrar o professor, ele será um <b>Mini CEO</b> com acesso aos seus alunos, controle de cadastro e aba de <b>Financeiro</b> própria.</p>
  <form onsubmit="saveTrainer(event,'${id || ''}')">
    <label>Tipo de acesso na plataforma</label>
    <select name="accType">
      <option value="trainer" ${t.role === 'trainer' ? 'selected' : ''}>👨‍🏫 Professor · Mini CEO (Personal Trainer com Financeiro e Alunos)</option>
      <option value="auto_student" ${t.role === 'student' && t.autonomous ? 'selected' : ''}>🏃 Apenas Aluno — Sem Personal (Paga mensalidade direto ao CEO)</option>
      <option value="student" ${t.role === 'student' && !t.autonomous ? 'selected' : ''}>🏋️ Apenas Aluno — Com Personal Trainer</option>
    </select>
    <label>Nome completo</label><input name="name" required value="${esc(t.name)}" placeholder="Ex.: Prof. Lucas Oliveira">
    <label>E-mail (login)</label><input name="email" type="email" required value="${esc(t.email)}" placeholder="lucas@email.com">
    <label>Telefone / WhatsApp (opcional)</label><input name="phone" type="tel" value="${esc(t.phone)}" placeholder="(11) 99999-9999 (opcional)">
    <label>🔑 Senha de acesso ${id ? '(edite abaixo se quiser alterar a senha)' : '(mín. 4 caracteres)'}</label>
    <input name="pw" type="text" ${id ? '' : 'required'} minlength="4" value="${esc(t.plainPw || '')}" placeholder="${id ? 'Digite uma nova senha para alterar (ou deixe em branco)' : 'Crie uma senha de acesso'}">
    <label>CREF / Especialidade / Observações (opcional)</label><input name="notes" value="${esc(t.notes)}" placeholder="Ex.: CREF 123456-G/SP · Hipertrofia">

    <div class="card" style="margin-top:12px;background:#101518;border-color:var(--gold)">
      <h3 style="color:var(--gold);margin-bottom:6px">💰 Mensalidade / Assinatura para o CEO</h3>
      <div class="grid">
        <div><label>Mensalidade (R$)</label><input name="finAmount" type="number" step="0.01" min="0" required value="${fin.amount ?? defs.trainerFee}"></div>
        <div><label>Data de Vencimento</label><input name="finDueDate" type="date" required value="${fin.dueDate || day(addDays(10))}"></div>
      </div>
      <div class="grid">
        <div>
          <label>Status do Pagamento</label>
          <select name="finPaid">
            <option value="false" ${!fin.paid ? 'selected' : ''}>⏳ Falta Pagar (A vencer / Pendente)</option>
            <option value="true" ${fin.paid ? 'selected' : ''}>✅ Já Pagou (Em dia)</option>
          </select>
        </div>
        <div>
          <label>Forma de Pagamento</label>
          <select name="finMethod">${['PIX', 'Cartão', 'Boleto', 'Dinheiro'].map(m => `<option ${fin.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
      </div>
    </div>

    <button class="btn block" style="margin-top:12px">Salvar cadastro e conta</button>
  </form>`);
}
async function saveTrainer(e, id) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const cleanEmail = (f.email || '').trim().toLowerCase();
  const cleanPw = (f.pw || '').trim();
  if (DB.users.some(u => (u.email || '').trim().toLowerCase() === cleanEmail && u.id !== id)) return toast('E-mail já cadastrado.');
  const targetRole = f.accType === 'trainer' ? 'trainer' : 'student';
  const isAuto = f.accType === 'auto_student';
  const trainerId = isAuto ? null : (targetRole === 'student' ? (trainers()[0]?.id || S.user.id) : null);
  let u = id ? userById(id) : null;
  if (!u) {
    if (Cloud.enabled) {
      try {
        const action = targetRole === 'trainer' ? 'createTrainer' : 'createStudent';
        const r = await Cloud.fn(action, { email: cleanEmail, password: cleanPw, name: f.name.trim(), phone: f.phone || '', trainerId });
        u = { id: r.id, role: targetRole, autonomous: isAuto, trainerId, active: true };
      } catch (err) { return toast(err.message); }
    } else {
      const salt = uid() + uid();
      u = { id: uid(), role: targetRole, autonomous: isAuto, trainerId, active: true, salt, hash: await hash(cleanPw, salt), plainPw: cleanPw };
    }
    DB.users.push(u);
    if (targetRole === 'student') DB.workouts[u.id] = [];
  } else {
    u.role = targetRole;
    u.autonomous = isAuto;
    if (isAuto || targetRole === 'trainer') u.trainerId = null;
    if (targetRole === 'student' && !DB.workouts[u.id]) DB.workouts[u.id] = [];
    if (cleanPw) {
      if (Cloud.enabled) {
        try { await Cloud.fn('resetPassword', { id: u.id, password: cleanPw }); } catch (err) { return toast(err.message); }
      } else {
        u.salt = uid() + uid();
        u.hash = await hash(cleanPw, u.salt);
        u.plainPw = cleanPw;
      }
    }
  }
  Object.assign(u, { name: f.name.trim(), email: cleanEmail, phone: (f.phone || '').trim(), notes: (f.notes || '').trim(), updatedAt: Date.now() });
  const isPaid = f.finPaid === 'true';
  ensureUserFinance(u);
  u.finance.amount = +(f.finAmount || getDefaultFeeForUser(u));
  u.finance.dueDate = f.finDueDate || u.finance.dueDate;
  u.finance.dueDay = Math.min(28, Math.max(1, Number(u.finance.dueDate.split('-')[2]) || 10));
  u.finance.method = f.finMethod || 'PIX';
  u.finance.paid = isPaid;
  if (isPaid && !u.finance.lastPaidDate) {
    u.finance.lastPaidDate = day();
    u.finance.history = u.finance.history || [];
    if (!u.finance.history.length) u.finance.history.push({ id: uid(), date: day(), amount: u.finance.amount, method: u.finance.method, note: 'Pagamento inicial no cadastro' });
  }
  save(); closeModal(); render();
  toast(targetRole === 'student' ? 'Conta de Aluno salva e sincronizada ✅' : 'Professor (Mini CEO) salvo com sucesso ✅');
}
async function delTrainer(id) {
  const hasStudents = DB.users.some(u => u.role === 'student' && u.trainerId === id);
  if (hasStudents) return toast('Este professor ainda possui alunos vinculados. Transfira ou exclua os alunos antes.');
  if (!confirm('Excluir este professor?')) return;
  if (Cloud.enabled) { try { await Cloud.fn('delete', { id }); } catch (err) { return toast(err.message); } }
  DB.users = DB.users.filter(u => u.id !== id);
  save(); render(); toast('Professor excluído');
}

/* ---------- Cadastro / Edição de Alunos (com Mensalidade, Vencimento e Status Financeiro) ---------- */
function studentForm(id, defaultAuto = false) {
  const defs = getFinDefaults();
  const s = id ? (userById(id) || {}) : { autonomous: defaultAuto, trainerId: defaultAuto ? '__auto__' : (isTrainer() ? S.user.id : (trainers()[0]?.id || S.user.id)) };
  const curTrainerVal = (s.autonomous || !s.trainerId) ? '__auto__' : s.trainerId;
  const defFee = (defaultAuto || curTrainerVal === '__auto__') ? defs.autoStudentFee : (isTrainer() ? (DB.settings?.[S.user.id]?.defaultStudentFee || defs.trainerStudentFee) : defs.trainerStudentFee);
  const fin = s.finance || { amount: defFee, dueDate: day(addDays(10)), method: 'PIX', paid: false };

  modal(`<h2>${id ? 'Editar' : 'Novo'} Aluno (Cliente)</h2>
  <form onsubmit="saveStudent(event,'${id || ''}')">
    ${isCeo() ? `<label>Tipo de conta / Acompanhamento</label><select name="trainerId" onchange="const a=this.form.finAmount;if(a&&!'${id || ''}')a.value=this.value==='__auto__'?'${defs.autoStudentFee}':this.value==='__make_trainer__'?'${defs.trainerFee}':'${defs.trainerStudentFee}'">
      <option value="__auto__" ${curTrainerVal === '__auto__' ? 'selected' : ''}>🤖 Apenas Aluno — Sem Personal (Paga mensalidade direto ao CEO)</option>
      <option value="${S.user.id}" ${curTrainerVal === S.user.id ? 'selected' : ''}>👑 Aluno Direto do CEO (${esc(S.user.name)})</option>
      ${trainers().map(t => `<option value="${t.id}" ${curTrainerVal === t.id ? 'selected' : ''}>👨‍🏫 Aluno do Personal: ${esc(t.name)}</option>`).join('')}
      <option value="__make_trainer__">👨‍🏫 Cadastrar como Professor · Mini CEO (Personal Trainer)</option>
    </select>` : ''}
    <label>Nome completo</label><input name="name" required value="${esc(s.name)}" placeholder="Nome do aluno">
    <label>E-mail (login do aluno)</label><input name="email" type="email" required value="${esc(s.email)}" placeholder="aluno@email.com">
    <label>Telefone / WhatsApp (opcional)</label><input name="phone" type="tel" value="${esc(s.phone)}" placeholder="(11) 99999-9999 (opcional)">
    <label>🔑 Senha de acesso ${id ? '(edite abaixo se quiser alterar a senha)' : '(mín. 4 caracteres)'}</label>
    <input name="pw" type="text" ${id ? '' : 'required'} minlength="4" value="${esc(s.plainPw || '')}" placeholder="${id ? 'Digite uma nova senha para alterar (ou deixe em branco)' : 'Crie uma senha para o aluno'}">
    <div class="grid">
      <div><label>Idade</label><input name="age" type="number" value="${s.age || ''}"></div>
      <div><label>Altura (cm)</label><input name="height" type="number" value="${s.height || ''}"></div>
      <div><label>Peso (kg)</label><input name="weight" type="number" step="0.1" value="${s.weight || ''}"></div>
    </div>
    <label>Objetivo</label>
    <select name="goal">${['Emagrecimento', 'Hipertrofia', 'Condicionamento', 'Definição muscular', 'Reabilitação', 'Saúde geral'].map(g => `<option ${g === s.goal ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <label>Lesões / restrições</label><input name="injuries" value="${esc(s.injuries)}">
    <label>Observações</label><textarea name="notes" rows="2">${esc(s.notes)}</textarea>

    <div class="card" style="margin-top:12px;background:#101518;border-color:var(--gold)">
      <h3 style="color:var(--gold);margin-bottom:6px">💰 Controle Financeiro do Aluno</h3>
      <div class="grid">
        <div><label>Mensalidade (R$)</label><input name="finAmount" type="number" step="0.01" min="0" required value="${fin.amount ?? defFee}"></div>
        <div><label>Data de Vencimento</label><input name="finDueDate" type="date" required value="${fin.dueDate || day(addDays(10))}"></div>
      </div>
      <div class="grid">
        <div>
          <label>Situação do Pagamento</label>
          <select name="finPaid">
            <option value="false" ${!fin.paid ? 'selected' : ''}>⏳ Falta Pagar (A vencer / Pendente)</option>
            <option value="true" ${fin.paid ? 'selected' : ''}>✅ Já Pagou (Em dia)</option>
          </select>
        </div>
        <div>
          <label>Forma de Pagamento</label>
          <select name="finMethod">${['PIX', 'Cartão', 'Boleto', 'Dinheiro'].map(m => `<option ${fin.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
      </div>
    </div>

    <button class="btn block" style="margin-top:12px">Salvar aluno e financeiro</button>
  </form>`);
}
async function saveStudent(e, id) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const cleanEmail = (f.email || '').trim().toLowerCase();
  const cleanPw = (f.pw || '').trim();
  if (DB.users.some(u => (u.email || '').trim().toLowerCase() === cleanEmail && u.id !== id)) return toast('E-mail já cadastrado.');
  if (isCeo() && f.trainerId === '__make_trainer__') {
    const fakeForm = e.target;
    const inp = document.createElement('input');
    inp.type = 'hidden'; inp.name = 'accType'; inp.value = 'trainer';
    fakeForm.appendChild(inp);
    return saveTrainer(e, id);
  }
  const isAuto = isCeo() ? f.trainerId === '__auto__' : false;
  const trainerId = isAuto ? null : (isCeo() ? (f.trainerId || S.user.id) : S.user.id);
  let u = id ? userById(id) : null;
  if (!u) {
    if (Cloud.enabled) {
      try { const r = await Cloud.fn('createStudent', { email: cleanEmail, password: cleanPw, name: f.name.trim(), phone: f.phone || '', trainerId }); u = { id: r.id, role: 'student', active: true, trainerId, autonomous: isAuto }; }
      catch (err) { return toast(err.message); }
    } else {
      const salt = uid() + uid();
      u = { id: uid(), role: 'student', active: true, trainerId, autonomous: isAuto, salt, hash: await hash(cleanPw, salt), plainPw: cleanPw };
    }
    DB.users.push(u); DB.workouts[u.id] = [];
  } else {
    u.role = 'student';
    u.autonomous = isAuto;
    u.trainerId = trainerId;
    if (cleanPw) {
      if (Cloud.enabled) {
        try { await Cloud.fn('resetPassword', { id: u.id, password: cleanPw }); } catch (err) { return toast(err.message); }
      } else {
        u.salt = uid() + uid();
        u.hash = await hash(cleanPw, u.salt);
        u.plainPw = cleanPw;
      }
    }
  }
  Object.assign(u, { name: f.name.trim(), email: cleanEmail, phone: (f.phone || '').trim(), age: +f.age || null, height: +f.height || null, weight: +f.weight || null, goal: f.goal, injuries: f.injuries, notes: f.notes, updatedAt: Date.now() });
  const isPaid = f.finPaid === 'true';
  ensureUserFinance(u);
  u.finance.amount = +(f.finAmount || getDefaultFeeForUser(u));
  u.finance.dueDate = f.finDueDate || u.finance.dueDate;
  u.finance.dueDay = Math.min(28, Math.max(1, Number(u.finance.dueDate.split('-')[2]) || 10));
  u.finance.method = f.finMethod || 'PIX';
  u.finance.paid = isPaid;
  if (isPaid && !u.finance.lastPaidDate) {
    u.finance.lastPaidDate = day();
    u.finance.history = u.finance.history || [];
    if (!u.finance.history.length) u.finance.history.push({ id: uid(), date: day(), amount: u.finance.amount, method: u.finance.method, note: 'Pagamento inicial no cadastro' });
  }
  if (f.weight && !id) DB.weights.push({ id: uid(), uid: u.id, date: day(), kg: +f.weight });
  save(); closeModal(); render(); toast(isAuto ? 'Aluno Sem Personal salvo com sucesso ✅' : 'Aluno salvo com sucesso ✅');
}
const toggleUserActive = async id => {
  const u = userById(id); if (!u) return;
  if (Cloud.enabled) { try { await Cloud.fn('setActive', { id, active: !u.active }); } catch (err) { return toast(err.message); } }
  u.active = !u.active; save(); render();
};
const delStudent = async id => {
  if (!confirm('Excluir aluno e todos os dados dele?')) return;
  if (Cloud.enabled) { try { await Cloud.fn('delete', { id }); } catch (err) { return toast(err.message); } }
  DB.users = DB.users.filter(u => u.id !== id); delete DB.workouts[id];
  ['checkins', 'water', 'logs', 'cardio', 'weights'].forEach(k => DB[k] = DB[k].filter(x => x.uid !== id));
  save(); render(); toast('Aluno excluído');
};
function msgForm(to) {
  const targets = isCeo() ? [...trainers(), ...students()] : students();
  modal(`<h2>Enviar recado ou aviso</h2><form onsubmit="event.preventDefault();sendMsg(this.to.value,this.text.value);closeModal();toast('Enviado ✅');render()"><label>Para</label><select name="to"><option value="all" ${to === 'all' ? 'selected' : ''}>Todos os meus alunos</option>${targets.map(s => `<option value="${s.id}" ${s.id === to ? 'selected' : ''}>${esc(s.name)} (${s.role === 'trainer' ? 'Professor' : 'Aluno'})</option>`).join('')}</select><label>Mensagem</label><textarea name="text" required></textarea><button class="btn block" style="margin-top:12px">Enviar</button></form>`);
}

/* ---------- Editor de Treinos + Exportar / Importar via Documento ---------- */
const touched = sid => {
  save();
  sendMsg(sid, '🔔 Seu treino foi atualizado! Confira na aba Treino.');
  broadcastRealtime('workout_change', { studentId: sid });
  _refreshWorkoutViewOrModal();
};
const dayOf = (sid, did) => DB.workouts[sid]?.find(d => d.id === did);
const addDay = sid => { DB.workouts[sid] = DB.workouts[sid] || []; DB.workouts[sid].push({ id: uid(), name: 'Treino ' + String.fromCharCode(65 + DB.workouts[sid].length), exercises: [] }); touched(sid); };
const renameDay = (sid, did, v) => { const d = dayOf(sid, did); if (d) { d.name = v; touched(sid); } };
const delDay = (sid, did) => { if (confirm('Excluir este dia de treino?')) { DB.workouts[sid] = DB.workouts[sid].filter(d => d.id !== did); touched(sid); } };
const delEx = (sid, did, xid) => { const d = dayOf(sid, did); if (d) { d.exercises = d.exercises.filter(x => x.id !== xid); touched(sid); } };
const delExConfirm = (sid, did, xid) => {
  const d = dayOf(sid, did);
  if (!d) return;
  const ex = d.exercises?.find(x => x.id === xid);
  const exName = ex ? ex.name : 'o exercício';
  if (!confirm(`Remover "${exName}" deste treino? Essa alteração sincronizará em tempo real no app do aluno.`)) return;
  d.exercises = d.exercises.filter(x => x.id !== xid);
  touched(sid);
  toast(`🗑️ Exercício "${exName}" removido em tempo real!`);
};
const moveEx = (sid, did, i, dir) => { const a = dayOf(sid, did)?.exercises, j = i + dir; if (!a || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; touched(sid); };
const dropEx = (e, sid, did, to) => { e.preventDefault(); const [from, d0] = S.drag || []; if (d0 !== did || from === undefined) return; const a = dayOf(sid, did)?.exercises; if (!a) return; a.splice(to, 0, a.splice(from, 1)[0]); touched(sid); };

function exForm(sid, did, xid) {
  const x = xid ? dayOf(sid, did)?.exercises.find(e => e.id === xid) : { sets: 3, reps: '12', rest: 60 };
  if (!x) return;
  modal(`<h2>${xid ? '✏️ Editar' : '➕ Novo'} Exercício</h2>${xid ? '' : `<label>Biblioteca rápida</label><select onchange="const l=LIBRARY[this.value];if(l){this.form.name.value=l.name;this.form.group.value=l.group}"><option value="">— escolher da biblioteca —</option>${LIBRARY.map((l, i) => `<option value="${i}">${l.group} · ${l.name}</option>`).join('')}</select>`}
  <form onsubmit="saveEx(event,'${sid}','${did}','${xid || ''}')"><label>Nome do exercício</label><input name="name" required value="${esc(x.name || '')}">
  <label>Grupo muscular</label><input name="group" value="${esc(x.group || 'Geral')}" list="grp"><datalist id="grp">${[...new Set(LIBRARY.map(l => l.group))].map(g => `<option>${g}</option>`).join('')}</datalist>
  <div class="grid"><div><label>Séries</label><input name="sets" type="number" min="1" value="${x.sets || 3}"></div><div><label>Repetições</label><input name="reps" value="${esc(x.reps || '12')}"></div><div><label>Carga Ref.</label><input name="load" value="${esc(x.load || '')}"></div><div><label>Descanso (s)</label><input name="rest" type="number" value="${x.rest || 60}"></div></div>
  <label>Observações / Dica técnica</label><input name="notes" value="${esc(x.notes || '')}"><label>Vídeo (YouTube) ou imagem — link</label><input name="media" type="url" value="${esc(x.media || '')}"><button class="btn block" style="margin-top:12px;background:#8FFF00;color:#0B0F17;font-weight:700">💾 Salvar Exercício em Tempo Real</button></form>`);
}
function saveEx(e, sid, did, xid) {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.sets = +f.sets; f.rest = +f.rest; const d = dayOf(sid, did);
  if (!d) return;
  if (xid) Object.assign(d.exercises.find(x => x.id === xid), f); else d.exercises.push({ id: uid(), ...f });
  closeModal(); touched(sid); toast('Exercício salvo com sucesso! ✅⚡');
}
function dupForm(sid) {
  modal(`<h2>Duplicar treinos</h2><form onsubmit="event.preventDefault();dupTo('${sid}',this.to.value)"><label>Copiar para</label><select name="to">${students().filter(s => s.id !== sid).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><p class="mut">Substitui os treinos atuais do aluno de destino.</p><button class="btn block" style="margin-top:12px">Duplicar</button></form>`);
}
const dupTo = (sid, to) => { DB.workouts[to] = JSON.parse(JSON.stringify(DB.workouts[sid])).map(d => ({ ...d, id: uid(), exercises: d.exercises.map(x => ({ ...x, id: uid() })) })); closeModal(); touched(to); toast('Treinos duplicados ✅'); };
function tplForm(sid) {
  const myTpls = DB.templates.filter(t => isCeo() || !t.owner || t.owner === S.user.id);
  modal(`<h2>Modelos de treino</h2><form onsubmit="event.preventDefault();saveTpl('${sid}',this.n.value)" class="row"><input name="n" placeholder="Nome do modelo" required style="flex:1"><button class="btn sm">Salvar atual</button></form><hr style="border-color:#222a30;margin:12px 0">${myTpls.map(t => `<div class="row sp card"><b>${esc(t.name)}</b><div class="row"><button class="btn sm" onclick="applyTpl('${sid}','${t.id}')">Aplicar</button><button class="btn sm danger" onclick="DB.templates=DB.templates.filter(x=>x.id!=='${t.id}');save();tplForm('${sid}')">✕</button></div></div>`).join('') || '<p class="mut">Nenhum modelo salvo.</p>'}`);
}
const saveTpl = (sid, name) => { DB.templates.push({ id: uid(), owner: S.user.id, name, days: JSON.parse(JSON.stringify(DB.workouts[sid])) }); save(); tplForm(sid); toast('Modelo salvo ✅'); };
const applyTpl = (sid, tid) => { const t = DB.templates.find(x => x.id === tid); DB.workouts[sid] = JSON.parse(JSON.stringify(t.days)).map(d => ({ ...d, id: uid(), exercises: d.exercises.map(x => ({ ...x, id: uid() })) })); closeModal(); touched(sid); };

/* --- EXPORTAR E IMPORTAR TREINO VIA DOCUMENTO --- */
function formatWorkoutText(stName, days) {
  const lines = [
    `====================================================`,
    `PERSONALHUB - FICHA DE TREINO`,
    `Aluno(a): ${stName}`,
    `Data: ${fmtDate(day())}`,
    `====================================================`,
    '',
  ];
  (days || []).forEach(d => {
    lines.push(`### ${d.name}`);
    (d.exercises || []).forEach(x => {
      lines.push(`- ${x.name} | ${x.group || 'Geral'} | ${x.sets}x${x.reps} | ${x.load || '-'} | ${x.rest || 60}s${x.notes ? ' | Obs: ' + x.notes : ''}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function exportWorkoutModal(sid) {
  const s = student(sid) || S.user;
  const ws = DB.workouts[sid] || [];
  if (!ws.length) return toast('Este aluno ainda não possui treinos para exportar.');
  modal(`<h2>📤 Exportar Treino — ${esc(s.name)}</h2>
  <p class="mut" style="margin-bottom:14px">Escolha o formato do documento para baixar ou imprimir o treino:</p>
  <div style="display:grid;gap:10px">
    <button class="btn block" onclick="doExportWorkout('${sid}','json')">📄 Baixar Documento Estruturado (.json) — Ideal p/ Importar</button>
    <button class="btn ghost block" onclick="doExportWorkout('${sid}','txt')">📝 Baixar Ficha de Treino em Texto (.txt)</button>
    <button class="btn ghost block" onclick="doExportWorkout('${sid}','print')">🖨️ Imprimir / Salvar Ficha em PDF</button>
  </div>`);
}

function doExportWorkout(sid, fmt) {
  const s = student(sid) || S.user;
  const ws = DB.workouts[sid] || [];
  const slug = normStr(s.name || 'aluno').replace(/[^a-z0-9]+/g, '-');
  if (fmt === 'json') {
    const doc = {
      platform: 'PersonalHUB',
      version: 1,
      exportedAt: new Date().toISOString(),
      studentName: s.name,
      days: ws.map(d => ({ name: d.name, exercises: d.exercises.map(({ name, group, sets, reps, load, rest, notes, media }) => ({ name, group, sets, reps, load, rest, notes, media })) })),
    };
    downloadFile(`treino-${slug}.json`, JSON.stringify(doc, null, 2), 'application/json;charset=utf-8');
    closeModal();
    return toast('Documento .json exportado ✅');
  }
  if (fmt === 'txt') {
    downloadFile(`treino-${slug}.txt`, formatWorkoutText(s.name, ws));
    closeModal();
    return toast('Ficha .txt exportada ✅');
  }
  if (fmt === 'print') {
    const w = window.open('', '_blank');
    if (!w) return toast('Permita pop-ups para imprimir/salvar PDF.');
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Treino - ${esc(s.name)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin:0 0 4px}h2{margin:18px 0 8px;border-bottom:2px solid #72DF00;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}th{background:#f3f8ec}</style></head><body>
    <h1>PersonalHUB — Ficha de Treino</h1>
    <p><b>Aluno(a):</b> ${esc(s.name)} · <b>Professor:</b> ${esc(trainerName(s.trainerId))} · <b>Data:</b> ${fmtDate(day())}</p>
    ${ws.map(d => `<h2>${esc(d.name)}</h2><table><tr><th>Exercício</th><th>Grupo</th><th>Séries x Reps</th><th>Carga</th><th>Descanso</th><th>Observações</th></tr>${d.exercises.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.group || '—')}</td><td>${x.sets} x ${esc(x.reps)}</td><td>${esc(x.load || '—')}</td><td>${x.rest}s</td><td>${esc(x.notes || '')}</td></tr>`).join('')}</table>`).join('')}
    <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
    closeModal();
  }
}

function importWorkoutModal(sid) {
  const s = student(sid);
  modal(`<h2>📥 Importar Treino — ${esc(s?.name || '')}</h2>
  <p class="mut" style="margin-bottom:10px">Envie um documento <b>.json</b> ou <b>.txt</b> exportado do PersonalHUB (ou cole o conteúdo da ficha abaixo):</p>
  <form onsubmit="doImportWorkout(event,'${sid}')">
    <label>Selecionar documento (.json ou .txt)</label>
    <input type="file" accept=".json,.txt,application/json,text/plain" onchange="readWorkoutDoc(this)">
    <label>Ou cole o texto / JSON do treino aqui</label>
    <textarea id="impTxt" rows="6" placeholder="### Treino A - Peito\n- Supino reto | Peito | 4x10 | 30 kg | 60s" required></textarea>
    <label>Modo de importação</label>
    <select name="mode">
      <option value="replace">Substituir os treinos atuais do aluno</option>
      <option value="append">Adicionar aos treinos atuais do aluno</option>
    </select>
    <button class="btn block" style="margin-top:12px">${ic('upload')}Importar treino agora</button>
  </form>`);
}

function readWorkoutDoc(input) {
  const f = input.files?.[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('#impTxt').value = r.result; };
  r.readAsText(f);
}

function parseWorkoutDocument(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return [];
  // 1) Tenta ler JSON
  if (txt.startsWith('{') || txt.startsWith('[')) {
    const j = JSON.parse(txt);
    const arr = Array.isArray(j) ? j : (j.days || j.workouts || []);
    return arr.map(d => ({
      id: uid(),
      name: String(d.name || 'Treino Importado'),
      exercises: (d.exercises || []).map(x => ({
        id: uid(),
        name: String(x.name || 'Exercício'),
        group: String(x.group || 'Geral'),
        sets: +x.sets || 3,
        reps: String(x.reps || '12'),
        load: String(x.load || ''),
        rest: +x.rest || 60,
        notes: String(x.notes || ''),
        media: String(x.media || ''),
      })),
    }));
  }
  // 2) Lê documento TXT estruturado
  const days = [];
  let cur = null;
  txt.split(/\r?\n/).forEach(line => {
    const l = line.trim();
    if (!l || l.startsWith('===') || /^PersonalHUB|^Aluno\(a\):|^Data:/i.test(l)) return;
    if (/^(###|Treino\s+[A-Z0-9])/i.test(l)) {
      cur = { id: uid(), name: l.replace(/^###\s*/, '').trim(), exercises: [] };
      days.push(cur);
      return;
    }
    if (!cur) { cur = { id: uid(), name: 'Treino Importado', exercises: [] }; days.push(cur); }
    const clean = l.replace(/^[-*•]\s*/, '');
    const parts = clean.split('|').map(p => p.trim());
    const name = parts[0] || clean;
    const group = parts[1] || 'Geral';
    const sr = (parts[2] || '3x12').split(/x/i);
    const sets = parseInt(sr[0], 10) || 3;
    const reps = (sr[1] || '12').trim();
    const load = parts[3] === '-' ? '' : (parts[3] || '');
    const rest = parseInt(parts[4], 10) || 60;
    const notes = (parts[5] || '').replace(/^Obs:\s*/i, '');
    cur.exercises.push({ id: uid(), name, group, sets, reps, load, rest, notes, media: '' });
  });
  return days.filter(d => d.exercises.length > 0);
}

function doImportWorkout(e, sid) {
  e.preventDefault();
  try {
    const days = parseWorkoutDocument($('#impTxt').value);
    if (!days.length) return toast('Não foi possível identificar exercícios no documento.');
    const mode = e.target.mode.value;
    DB.workouts[sid] = mode === 'append' ? [...(DB.workouts[sid] || []), ...days] : days;
    closeModal();
    touched(sid);
    toast(`Treino importado com sucesso (${days.length} dia(s)) ✅`);
  } catch (err) {
    toast('Erro ao ler documento: verifique o formato.');
  }
}

/* ======================= COMUNIDADE (FEED DOS ALUNOS) ======================= */
function communityView() {
  const posts = [...(DB.posts || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const draftImg = S.postDraftImg || '';
  return `<h1>Comunidade 💪</h1>
  <p class="mut" style="margin-bottom:14px">Espaço de incentivo entre todos os alunos e professores. Publique sua foto ou conquista do dia e mande força (💪) para a galera!</p>

  <div class="card">
    <h3>✨ Nova publicação</h3>
    <form onsubmit="createPost(event)" style="margin-top:8px">
      <textarea id="postTxt" rows="3" placeholder="Escreva algo motivador, conte como foi seu treino de hoje...">${esc(S.postDraftTxt || '')}</textarea>
      ${draftImg ? `<div style="position:relative;margin-top:10px"><img src="${draftImg}" class="post-img" alt="Prévia"><button type="button" class="btn sm danger" style="position:absolute;top:10px;right:10px" onclick="S.postDraftImg='';S.postDraftTxt=$('#postTxt')?.value||'';render()">Remover foto ✕</button></div>` : ''}
      <div class="row sp" style="margin-top:10px">
        <label class="btn ghost sm" style="margin:0;cursor:pointer">
          ${ic('camera')}Adicionar foto
          <input type="file" accept="image/*" hidden onchange="selectPostPhoto(this.files[0])">
        </label>
        <button class="btn" type="submit">${ic('send')}Publicar no feed</button>
      </div>
    </form>
  </div>

  <div>
    ${posts.map(p => {
      const author = userById(p.uid);
      const name = author?.name || p.authorName || 'Aluno(a)';
      const role = author?.role || p.authorRole || 'student';
      const photo = author?.photo || p.authorPhoto || '';
      const likes = Array.isArray(p.likes) ? p.likes : [];
      const liked = likes.includes(S.user.id);
      const canDel = p.uid === S.user.id || isCeo() || (isTrainer() && author?.trainerId === S.user.id);
      return `<div class="post-card fade">
        <div class="row sp post-head">
          <div class="row" style="gap:10px">
            ${photo ? `<img class="avatar" src="${photo}" alt="">` : `<div class="avatar">${esc(name[0] || 'U')}</div>`}
            <div>
              <b>${esc(name)}</b> <span class="role-pill">${esc(roleLabel(role))}</span>
              <div class="mut" style="font-size:.76rem">${new Date(p.date).toLocaleString('pt-BR')}</div>
            </div>
          </div>
          ${canDel ? `<button class="btn sm danger" onclick="deletePost('${p.id}')" title="Excluir publicação">${ic('trash-2')}</button>` : ''}
        </div>
        ${p.text ? `<p style="white-space:pre-wrap;margin:8px 0;font-size:.98rem">${esc(p.text)}</p>` : ''}
        ${p.image ? `<img class="post-img" src="${p.image}" alt="Foto da publicação">` : ''}
        <div class="row sp" style="margin-top:12px;padding-top:10px;border-top:1px solid #222a30">
          <button type="button" class="strength-btn ${liked ? 'on' : ''}" onclick="toggleStrength('${p.id}')" aria-label="Dar joinha de força">
            <span class="emo">💪</span>
            <span>${liked ? 'Força enviada' : 'Mandar força'}</span>
            <b>· ${likes.length}</b>
          </button>
          <span class="mut" style="font-size:.78rem">${likes.length === 1 ? '1 pessoa mandou 💪' : likes.length > 1 ? likes.length + ' pessoas mandaram 💪' : 'Seja o primeiro a mandar 💪'}</span>
        </div>
      </div>`;
    }).join('') || '<div class="card"><p class="mut">Ainda não há publicações. Seja o primeiro a postar seu treino hoje! 💪</p></div>'}
  </div>`;
}

function selectPostPhoto(file) {
  if (!file) return;
  S.postDraftTxt = $('#postTxt')?.value || '';
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const maxDim = 640;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      S.postDraftImg = c.toDataURL('image/jpeg', 0.72);
      render();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

function createPost(e) {
  e.preventDefault();
  const text = ($('#postTxt')?.value || '').trim();
  const image = S.postDraftImg || '';
  if (!text && !image) return toast('Escreva algo ou adicione uma foto para publicar.');
  DB.posts = DB.posts || [];
  DB.posts.unshift({
    id: uid(),
    uid: S.user.id,
    authorName: S.user.name,
    authorRole: S.user.role,
    authorPhoto: S.user.photo || '',
    text,
    image,
    likes: [],
    date: new Date().toISOString(),
  });
  S.postDraftTxt = '';
  S.postDraftImg = '';
  save();
  render();
  toast('Publicado na Comunidade! 💪🔥');
}

function toggleStrength(pid) {
  const p = (DB.posts || []).find(x => x.id === pid);
  if (!p) return;
  p.likes = Array.isArray(p.likes) ? p.likes : [];
  const i = p.likes.indexOf(S.user.id);
  if (i < 0) {
    p.likes.push(S.user.id);
    toast('💪 Força enviada!');
  } else {
    p.likes.splice(i, 1);
  }
  save();
  render();
}

function deletePost(pid) {
  if (!confirm('Excluir esta publicação da comunidade?')) return;
  DB.posts = (DB.posts || []).filter(x => x.id !== pid);
  save();
  render();
  toast('Publicação excluída');
}

/* ======================= ABA ESTUDO / NUTRIÇÃO INTELIGENTE ======================= */
function studyView(admin) {
  const f = S.study || (S.study = { q: '', cat: '', tab: 'foods', grams: '' });
  const list = DB.foods.filter(x => normStr(x.name).includes(normStr(f.q)) && (!f.cat || x.cat === f.cat));
  return `<h1>Nutrição & Estudo</h1>
  <div class="card" style="background:linear-gradient(135deg,#18290d,#13191d);border-color:var(--gold)">
    <div class="row sp">
      <div>
        <h2 style="margin-bottom:4px">📸 Scanner de Refeição por Câmera</h2>
        <p class="mut">Aponte a câmera do celular para o seu prato e descubra na hora a estimativa de calorias e macronutrientes.</p>
      </div>
      <button class="btn cam-cta" onclick="openCalorieCamera()">${ic('camera')}Saiba quanto de caloria está comendo agora</button>
    </div>
  </div>

  <div class="row" style="margin:10px 0">
    <button class="chip ${f.tab === 'foods' ? 'on' : ''}" onclick="S.study.tab='foods';render()">🍎 Calculadora & Tabela de Calorias</button>
    <button class="chip ${f.tab === 'tips' ? 'on' : ''}" onclick="S.study.tab='tips';render()">💡 Dicas de Alimentação</button>
  </div>

  ${f.tab === 'tips' ? `
    ${admin ? `<button class="btn" style="margin-bottom:12px" onclick="tipForm()">${ic('plus')}Nova dica</button>` : ''}
    <div class="grid2">${DB.tips.map(t => `<div class="card"><h3>${esc(t.title)}</h3><p class="mut" style="margin-top:6px">${esc(t.body)}</p>${admin ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost" onclick="tipForm('${t.id}')">Editar</button><button class="btn sm danger" onclick="DB.tips=DB.tips.filter(x=>x.id!=='${t.id}');save();render()">Excluir</button></div>` : ''}</div>`).join('')}</div>`
    : `
    <div class="card">
      <h3 style="color:var(--gold);margin-bottom:6px">⚡ Digite o alimento para calcular sozinho</h3>
      <p class="mut" style="margin-bottom:8px">Basta escrever o nome do alimento (ex.: <b>amendoim</b>, <b>frango</b>, <b>banana</b> ou <b>amendoim 50g</b>) e o cálculo aparece automaticamente:</p>
      <div class="row">
        <input id="fq" placeholder="Ex.: amendoim, arroz, 2 ovos, peito de frango..." value="${esc(f.q)}" oninput="onFoodType(this.value)" style="flex:2;min-width:210px">
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:150px">
          <input id="fgrams" type="number" min="1" step="any" placeholder="Porção (g)" value="${esc(f.grams)}" oninput="onGramsType(this.value)" title="Quantidade em gramas">
          <span class="mut">g</span>
        </div>
      </div>
      <div id="autocalc" style="margin-top:12px">${renderAutoCalcBox()}</div>
    </div>

    <div class="row" style="margin:10px 0">
      <button class="chip ${!f.cat ? 'on' : ''}" onclick="S.study.cat='';render()">Todos</button>
      ${Object.entries(FOOD_CATS).map(([k, v]) => `<button class="chip ${f.cat === k ? 'on' : ''}" onclick="S.study.cat='${k}';render()">${v}</button>`).join('')}
    </div>
    ${admin ? `<button class="btn" style="margin-bottom:10px" onclick="foodForm()">${ic('plus')}Novo alimento</button>` : ''}
    <div class="card" style="overflow-x:auto" id="foodtbl">${foodTable(list, admin)}</div>
  `}
  <p class="mut" style="margin-top:10px">⚠️ As informações são educativas e aproximadas, e não substituem a orientação de um nutricionista.</p>`;
}

function onFoodType(val) {
  S.study.q = val;
  S.study.grams = '';
  $('#fgrams').value = '';
  $('#autocalc').innerHTML = renderAutoCalcBox();
  renderFoods();
}
function onGramsType(val) {
  S.study.grams = val;
  $('#autocalc').innerHTML = renderAutoCalcBox();
}
function setQuickGrams(g) {
  S.study.grams = g;
  if ($('#fgrams')) $('#fgrams').value = g;
  $('#autocalc').innerHTML = renderAutoCalcBox();
}
function addPlateItem(name, grams, kcal, p, c, g) {
  S.plate = S.plate || [];
  S.plate.push({ id: uid(), name, grams: +grams, kcal: +kcal, p: +p, c: +c, g: +g });
  $('#autocalc').innerHTML = renderAutoCalcBox();
  toast(`${name} (${grams}g) adicionado à refeição!`);
}
function removePlateItem(id) {
  S.plate = (S.plate || []).filter(x => x.id !== id);
  $('#autocalc').innerHTML = renderAutoCalcBox();
}

function renderAutoCalcBox() {
  const f = S.study || {};
  const res = f.q ? autoCalcFood(f.q, +f.grams || null, DB.foods) : null;
  const plateHtml = (S.plate && S.plate.length) ? (() => {
    const totK = S.plate.reduce((a, x) => a + x.kcal, 0);
    const totP = S.plate.reduce((a, x) => a + x.p, 0).toFixed(1);
    const totC = S.plate.reduce((a, x) => a + x.c, 0).toFixed(1);
    const totG = S.plate.reduce((a, x) => a + x.g, 0).toFixed(1);
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="row sp"><b>🍽️ Minha refeição somada (${S.plate.length} item(ns)): <span class="gold">${totK} kcal</span></b><button class="btn sm danger" onclick="S.plate=[];$('#autocalc').innerHTML=renderAutoCalcBox()">Limpar</button></div>
      <div class="mut" style="margin:4px 0 8px">Proteínas: ${totP}g · Carboidratos: ${totC}g · Gorduras: ${totG}g</div>
      ${S.plate.map(x => `<div class="row sp" style="font-size:.84rem;padding:4px 0"><span>• ${esc(x.name)} (${x.grams}g) — <b>${x.kcal} kcal</b></span><button class="btn sm ghost" onclick="removePlateItem('${x.id}')">✕</button></div>`).join('')}
    </div>`;
  })() : '';

  if (!res) return plateHtml || `<div class="mut" style="font-size:.83rem">💡 Exemplo: digite <b>amendoim</b> acima para ver o cálculo automático na hora.</div>`;

  const { food, isEstimated, grams, kcal, p, c, g, badge } = res;
  return `<div class="calc-card fade">
    <div class="row sp">
      <div>
        <span class="role-pill">${badge[0]} ${badge[1]} · ${FOOD_CATS[food.cat] || 'Alimento'}</span>
        <h2 style="margin:6px 0 2px;font-size:1.45rem">${esc(food.name)} ${isEstimated ? '<span class="mut" style="font-size:.8rem">(estimativa automática)</span>' : ''}</h2>
        <span class="mut">Cálculo automático para <b>${grams} g</b> (${food.kcal} kcal a cada 100g)</span>
      </div>
      <button class="btn sm" type="button" onclick="addPlateItem('${esc(food.name)}',${grams},${kcal},${p},${c},${g})">+ Somar na refeição</button>
    </div>
    <div class="macro-grid">
      <div class="macro-box"><b>${kcal} kcal</b><span>Calorias</span></div>
      <div class="macro-box"><b>${p} g</b><span>Proteínas</span></div>
      <div class="macro-box"><b>${c} g</b><span>Carboidratos</span></div>
      <div class="macro-box"><b>${g} g</b><span>Gorduras</span></div>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="mut" style="font-size:.8rem">Porções rápidas:</span>
      ${[15, 30, 50, 100, 150, 200].map(n => `<button type="button" class="chip ${grams === n ? 'on' : ''}" style="padding:5px 11px;min-height:32px;font-size:.8rem" onclick="setQuickGrams(${n})">${n}g (${Math.round(food.kcal * n / 100)} kcal)</button>`).join('')}
    </div>
    ${plateHtml}
  </div>`;
}

function foodTable(list, admin) {
  return `<table><tr><th>Alimento</th><th>kcal/100g</th><th>Porção padrão</th><th>P</th><th>C</th><th>G</th><th></th>${admin ? '<th></th>' : ''}</tr>${list.map(x => {
    const b = foodBadge(x.kcal), k = v => Math.round(v * x.port) / 100;
    return `<tr style="cursor:pointer" onclick="if(event.target.tagName!=='BUTTON'){S.study.q='${esc(x.name)}';S.study.grams=${x.port};render()}"><td title="Clique para calcular"><b>${esc(x.name)}</b></td><td>${x.kcal}</td><td>${x.port} g = <b>${Math.round(x.kcal * x.port / 100)} kcal</b></td><td>${k(x.p)}g</td><td>${k(x.c)}g</td><td>${k(x.g)}g</td><td title="${b[1]}">${b[0]}</td>${admin ? `<td><button class="btn sm ghost" onclick="foodForm('${x.id}')">✎</button><button class="btn sm danger" onclick="DB.foods=DB.foods.filter(f=>f.id!=='${x.id}');save();render()">✕</button></td>` : ''}</tr>`;
  }).join('') || '<tr><td colspan="7">Use a calculadora acima para estimar qualquer alimento automaticamente.</td></tr>'}</table><p class="mut" style="margin-top:6px">Dica: toque em qualquer alimento da tabela para jogar na calculadora automática. P/C/G = proteína, carboidrato e gordura por porção.</p>`;
}
function renderFoods() {
  const f = S.study;
  const tbl = $('#foodtbl');
  if (tbl) tbl.innerHTML = foodTable(DB.foods.filter(x => normStr(x.name).includes(normStr(f.q)) && (!f.cat || x.cat === f.cat)), isStaff());
}

function tipForm(id) {
  const t = DB.tips.find(x => x.id === id) || {};
  modal(`<h2>Dica nutricional</h2><form onsubmit="event.preventDefault();const f=this;if('${id || ''}'){Object.assign(DB.tips.find(x=>x.id==='${id || ''}'),{title:f.title.value,body:f.body.value})}else DB.tips.unshift({id:uid(),owner:isCeo()?null:S.user.id,title:f.title.value,body:f.body.value});save();closeModal();render()"><label>Título</label><input name="title" required value="${esc(t.title)}"><label>Texto</label><textarea name="body" required>${esc(t.body)}</textarea><button class="btn block" style="margin-top:12px">Salvar</button></form>`);
}

/* Modal de Novo Alimento: preenche e calcula sozinho ao digitar o nome! */
function foodForm(id) {
  const x = DB.foods.find(f => f.id === id) || { cat: 'F', port: 100 };
  modal(`<h2>${id ? 'Editar' : 'Novo'} alimento</h2>
  <p class="mut" style="margin-bottom:8px">Digite o nome do alimento (ex.: <b>amendoim</b>) e os valores nutricionais são preenchidos automaticamente:</p>
  <form onsubmit="saveFood(event,'${id || ''}')" id="fform">
    <label>Nome do alimento</label>
    <input name="name" required value="${esc(x.name)}" oninput="autoFillFoodForm(this.value)" placeholder="Ex.: Amendoim, Tapioca, Salmão...">
    <label>Categoria</label>
    <select name="cat">${Object.entries(FOOD_CATS).map(([k, v]) => `<option value="${k}" ${k === x.cat ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <div class="grid">
      <div><label>kcal/100g</label><input name="kcal" type="number" step="any" required value="${x.kcal ?? ''}"></div>
      <div><label>Proteína (100g)</label><input name="p" type="number" step="any" value="${x.p ?? 0}"></div>
      <div><label>Carbo (100g)</label><input name="c" type="number" step="any" value="${x.c ?? 0}"></div>
      <div><label>Gordura (100g)</label><input name="g" type="number" step="any" value="${x.g ?? 0}"></div>
      <div><label>Porção (g)</label><input name="port" type="number" value="${x.port}"></div>
    </div>
    <button class="btn block" style="margin-top:12px">Salvar alimento</button>
  </form>`);
}
function autoFillFoodForm(val) {
  const form = $('#fform'); if (!form || !val.trim()) return;
  const res = autoCalcFood(val, 100, FOODS_SEED);
  if (!res) return;
  form.cat.value = res.food.cat || 'C';
  form.kcal.value = res.food.kcal;
  form.p.value = res.food.p;
  form.c.value = res.food.c;
  form.g.value = res.food.g;
  form.port.value = res.food.port || 100;
}
function saveFood(e, id) {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); ['kcal', 'p', 'c', 'g', 'port'].forEach(k => f[k] = +f[k]);
  if (id) Object.assign(DB.foods.find(x => x.id === id), f); else DB.foods.unshift({ id: uid(), owner: isCeo() ? null : S.user.id, ...f });
  save(); closeModal(); render(); toast('Alimento salvo ✅');
}

/* ---------- SCANNER DE REFEIÇÃO POR CÂMERA ("Saiba quanto de caloria está comendo agora") ---------- */
let camStream = null;
function stopCameraStream() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
}

async function openCalorieCamera() {
  S.camItems = [];
  modal(`<h2>📸 Saiba quanto de caloria está comendo agora</h2>
  <p class="mut">Aponte a câmera para o seu prato ou envie uma foto da refeição para calcular as calorias automaticamente.</p>
  <div class="cam-wrap" id="camBox">
    <video id="camVid" autoplay playsinline muted></video>
    <div class="cam-guide"></div>
  </div>
  <div class="row" style="justify-content:center;margin-bottom:10px">
    <button class="btn" type="button" id="btnSnap" onclick="snapCameraPhoto()">📸 Capturar foto e calcular</button>
    <label class="btn ghost" style="margin:0;cursor:pointer">
      📷 Abrir câmera / Galeria
      <input type="file" accept="image/*" capture="environment" hidden onchange="handleMealPhotoFile(this.files[0])">
    </label>
  </div>
  <div id="camResult"></div>`);

  try {
    if (navigator.mediaDevices?.getUserMedia) {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const v = $('#camVid');
      if (v) v.srcObject = camStream;
    } else {
      throw new Error('use_file');
    }
  } catch {
    const b = $('#camBox');
    if (b) b.innerHTML = `<div style="padding:24px;text-align:center"><p class="mut">Toque em <b>"📷 Abrir câmera / Galeria"</b> abaixo para tirar a foto do seu prato no celular ou escolher uma imagem.</p></div>`;
    const snap = $('#btnSnap');
    if (snap) snap.style.display = 'none';
  }
}

function snapCameraPhoto() {
  const v = $('#camVid');
  if (!v || !v.videoWidth) return toast('Use o botão "Abrir câmera / Galeria" para enviar a foto.');
  const c = document.createElement('canvas');
  const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
  c.width = Math.round(v.videoWidth * scale);
  c.height = Math.round(v.videoHeight * scale);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.82);
  stopCameraStream();
  processMealPhotoDataUrl(dataUrl);
}

function handleMealPhotoFile(file) {
  if (!file) return;
  stopCameraStream();
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const scale = Math.min(1, 720 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      processMealPhotoDataUrl(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

async function processMealPhotoDataUrl(dataUrl) {
  const box = $('#camBox');
  if (box) box.innerHTML = `<img id="mealPreviewImg" src="${dataUrl}" alt="Foto da refeição">`;
  const snap = $('#btnSnap');
  if (snap) snap.style.display = 'none';
  const out = $('#camResult');
  if (out) out.innerHTML = `<div class="card" style="text-align:center"><p class="gold">🔍 Analisando sua refeição e calculando calorias...</p></div>`;

  const base64 = dataUrl.split(',')[1];
  const gemKey = localStorage.getItem('personalhub_gemini_key') || window.APP_CONFIG?.GEMINI_API_KEY || '';

  // 1) Tenta IA Gemini direta se houver chave configurada
  if (gemKey) {
    try {
      const prompt = 'Você é um nutricionista brasileiro. Identifique os alimentos nesta foto de refeição, estime o peso em gramas de cada um e calcule calorias (kcal), proteínas (p), carboidratos (c) e gorduras (g). Responda SOMENTE JSON: {"items":[{"name":"string","grams":numero,"kcal":numero,"p":numero,"c":numero,"g":numero}],"note":"string"}';
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(gemKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
        if (parsed.items?.length) {
          S.camItems = parsed.items.map(i => ({ id: uid(), name: i.name, grams: +i.grams || 100, kcal: Math.round(+i.kcal || 0), p: +(+i.p || 0).toFixed(1), c: +(+i.c || 0).toFixed(1), g: +(+i.g || 0).toFixed(1) }));
          S.camNote = parsed.note || 'Análise por visão computacional IA concluída.';
          return renderCamResult();
        }
      }
    } catch (e) { console.warn('Fallback para análise local:', e); }
  }

  // 2) Tenta Supabase Edge Function se ativa
  if (Cloud.enabled) {
    try {
      const r = await Cloud.analyzeMealEdge({ image: base64, mime: 'image/jpeg' });
      if (r?.items?.length) {
        S.camItems = r.items.map(i => ({ id: uid(), ...i }));
        S.camNote = r.note || 'Análise por IA concluída.';
        return renderCamResult();
      }
    } catch { }
  }

  // 3) Analisador visual local instantâneo (funciona 100% offline/sem chave)
  const imgEl = $('#mealPreviewImg');
  await new Promise(r => setTimeout(r, 450));
  const preset = analyzePlateImageLocal(imgEl);
  S.camItems = preset.items.map(i => ({ id: uid(), ...i }));
  S.camNote = `Estimativa automática: ${preset.label}. Você pode ajustar o tipo de prato ou os itens abaixo se desejar.`;
  renderCamResult();
}

function selectMealPreset(key) {
  const p = MEAL_PRESETS.find(x => x.key === key);
  if (!p) return;
  S.camItems = p.items.map(i => ({ id: uid(), ...i }));
  S.camNote = `Perfil selecionado: ${p.label}.`;
  renderCamResult();
}

function updateCamItemGrams(id, newGrams) {
  const it = S.camItems.find(x => x.id === id);
  if (!it || !(newGrams > 0)) return;
  const ratio = newGrams / (it.grams || 100);
  it.grams = +newGrams;
  it.kcal = Math.round(it.kcal * ratio);
  it.p = +(it.p * ratio).toFixed(1);
  it.c = +(it.c * ratio).toFixed(1);
  it.g = +(it.g * ratio).toFixed(1);
  renderCamResult();
}

function addQuickItemToCam(val) {
  const res = autoCalcFood(val, null, DB.foods);
  if (!res) return;
  S.camItems.push({ id: uid(), name: res.food.name, grams: res.grams, kcal: res.kcal, p: res.p, c: res.c, g: res.g });
  renderCamResult();
}

function renderCamResult() {
  const out = $('#camResult'); if (!out) return;
  const items = S.camItems || [];
  const totK = items.reduce((a, x) => a + x.kcal, 0);
  const totP = items.reduce((a, x) => a + x.p, 0).toFixed(1);
  const totC = items.reduce((a, x) => a + x.c, 0).toFixed(1);
  const totG = items.reduce((a, x) => a + x.g, 0).toFixed(1);
  out.innerHTML = `<div class="calc-card fade">
    <div class="row sp">
      <h3>🍽️ Estimativa da sua refeição</h3>
      <span class="role-pill">Total aproximado</span>
    </div>
    <div class="macro-grid">
      <div class="macro-box"><b>${totK} kcal</b><span>Calorias</span></div>
      <div class="macro-box"><b>${totP} g</b><span>Proteínas</span></div>
      <div class="macro-box"><b>${totC} g</b><span>Carboidratos</span></div>
      <div class="macro-box"><b>${totG} g</b><span>Gorduras</span></div>
    </div>
    <p class="mut" style="margin:8px 0">${esc(S.camNote || '')}</p>
    <label>Ajustar perfil rápido do prato (opcional)</label>
    <select onchange="selectMealPreset(this.value)" style="margin-bottom:10px">
      <option value="">— manter itens atuais —</option>
      ${MEAL_PRESETS.map(p => `<option value="${p.key}">${esc(p.label)}</option>`).join('')}
    </select>
    <div>
      ${items.map(x => `<div class="row sp" style="padding:6px 0;border-bottom:1px solid #222a30;font-size:.86rem">
        <span style="flex:1"><b>${esc(x.name)}</b> <span class="mut">(${x.kcal} kcal · P:${x.p}g C:${x.c}g G:${x.g}g)</span></span>
        <div class="row" style="gap:4px">
          <input type="number" value="${x.grams}" style="width:74px;min-height:32px;padding:4px 6px" onchange="updateCamItemGrams('${x.id}',+this.value)">
          <span class="mut">g</span>
          <button class="btn sm danger" type="button" onclick="S.camItems=S.camItems.filter(i=>i.id!=='${x.id}');renderCamResult()">✕</button>
        </div>
      </div>`).join('')}
    </div>
    <form class="row" style="margin-top:10px" onsubmit="event.preventDefault();addQuickItemToCam(this.q.value);this.q.value=''">
      <input name="q" placeholder="Adicionar item ao prato (ex.: amendoim 30g, suco)..." style="flex:1">
      <button class="btn sm">+ Item</button>
    </form>
  </div>`;
}

/* ======================= RELATÓRIO DE OBJETIVOS & GERADOR AUTOMÁTICO DE TREINO ======================= */
function generateAutoWorkout(r = {}) {
  const lvl = r.level || 'Iniciante';
  const goal = r.goal || 'Emagrecimento';
  const daysN = +(r.daysPerWeek || 3);
  const areas = Array.isArray(r.injuryAreas) ? r.injuryAreas : [];
  const fullInjText = normStr([areas.join(' '), r.injuryDesc || '', r.brokenDesc || ''].join(' '));

  const hasShoulderIssue = areas.includes('Ombro') || /ombro|clavicula|manguito|escapula/.test(fullInjText);
  const hasKneeIssue = areas.includes('Joelho') || /joelho|menisco|patela|ligamento|cruzado/.test(fullInjText);
  const hasBackIssue = areas.includes('Coluna / Lombar') || /coluna|lombar|hernia|escoliose|ciatico|vertebra/.test(fullInjText);
  const hasArmBoneIssue = areas.includes('Punho / Cotovelo') || (r.hasBroken === 'Sim' && /braco|punho|mao|cotovelo|radio|ulna|umero/.test(fullInjText));
  const hasLegBoneIssue = areas.includes('Quadril / Tornozelo') || (r.hasBroken === 'Sim' && /perna|tornozelo|pe|tibia|fibula|femur|quadril/.test(fullInjText));

  const sets = lvl === 'Iniciante' ? 3 : (lvl === 'Intermediário' ? (goal.includes('Hipertrofia') ? 4 : 3) : 4);
  const reps = goal.includes('Emagrecimento') || goal.includes('Definição') || goal.includes('Condicionamento')
    ? (lvl === 'Iniciante' ? '15' : '12 a 15')
    : (lvl === 'Avançado' ? '8 a 12' : '10 a 12');
  const rest = goal.includes('Emagrecimento') || goal.includes('Condicionamento') ? 45 : (lvl === 'Avançado' ? 75 : 60);
  const loadDefault = lvl === 'Iniciante' ? 'Leve/Moderada (foco postura)' : (lvl === 'Intermediário' ? 'Moderada (progressiva)' : 'Desafiadora (controle total)');

  const ex = (name, group, customSets, customReps, customNote = '') => {
    const item = mkEx(name, group, customSets || sets, customReps || reps, loadDefault, rest);
    const notes = [];
    if (customNote) notes.push(customNote);
    if (hasArmBoneIssue && ['Peito', 'Costas', 'Bíceps', 'Tríceps', 'Ombros'].includes(group)) {
      notes.push('⚠️ Atenção ao punho/braço (histórico de lesão/fratura): use pegada firme e confortável sem dor.');
    }
    if (hasLegBoneIssue && ['Pernas', 'Glúteos'].includes(group)) {
      notes.push('⚠️ Atenção ao membro inferior (histórico de lesão/fratura): aumente a carga gradualmente.');
    }
    item.notes = notes.join(' · ');
    return item;
  };

  // Seleção segura de exercícios adaptada às lesões/fraturas
  const chestList = [
    hasShoulderIssue
      ? ex('Supino reto', 'Peito', sets, reps, '⚠️ Amplitude controlada (proteção para o ombro, não desça além da linha dos cotovelos)')
      : ex('Supino reto', 'Peito', sets, reps, 'Mantenha as escápulas apoiadas no banco'),
    hasShoulderIssue
      ? ex('Crucifixo', 'Peito', 3, '12 a 15', '⚠️ Faça na máquina/cabo com amplitude confortável para o ombro')
      : ex('Supino inclinado', 'Peito', sets, reps, 'Controle a descida por 2 segundos'),
    ex('Flexão de braço', 'Peito', 3, '10 a 12', lvl === 'Iniciante' ? 'Pode apoiar os joelhos no solo se necessário' : 'Mantenha o abdômen contraído'),
  ];

  const backList = [
    ex('Puxada frontal', 'Costas', sets, reps, 'Puxe em direção ao alto do peito estufando o tórax'),
    hasBackIssue
      ? ex('Remada baixa', 'Costas', sets, reps, '⚠️ Mantenha a coluna ereta e abdômen firme (proteção lombar)')
      : ex('Remada curvada', 'Costas', sets, reps, 'Coluna neutra, puxe em direção ao umbigo'),
    ex('Remada baixa', 'Costas', 3, reps, 'Segure 1 segundo fechando as escápulas'),
  ];

  const legList = [
    hasKneeIssue || hasBackIssue
      ? ex('Elevação pélvica', 'Glúteos', sets, '12 a 15', '⚠️ Exercício seguro para coluna e joelhos — contraia forte os glúteos no topo')
      : ex('Agachamento livre', 'Pernas', sets, reps, 'Pés firmes na largura dos ombros e coluna alinhada'),
    hasKneeIssue
      ? ex('Mesa flexora', 'Pernas', sets, '12 a 15', '⚠️ Fortalecimento posterior para estabilizar o joelho sem sobrecarga patelar')
      : ex('Leg press 45°', 'Pernas', sets, reps, hasBackIssue ? '⚠️ Mantenha o quadril e a lombar 100% colados no encosto' : 'Desça até ~90° empurrando pelos calcanhares'),
    hasKneeIssue
      ? ex('Cadeira extensora', 'Pernas', 3, '15', '⚠️ Use carga leve e amplitude curta onde não haja desconforto no joelho')
      : ex('Cadeira extensora', 'Pernas', sets, reps, 'Segure 1s no topo contraindo o quadríceps'),
    hasBackIssue
      ? ex('Mesa flexora', 'Pernas', sets, reps, '⚠️ Lombar protegida no apoio do banco')
      : ex('Stiff', 'Pernas', sets, reps, 'Coluna reta, desça alongando o posterior de coxa'),
    ex('Panturrilha em pé', 'Pernas', 4, '15', 'Amplitude máxima na subida e descida'),
  ];

  const shoulderList = [
    hasShoulderIssue
      ? ex('Elevação lateral', 'Ombros', 3, '15', '⚠️ Carga leve, suba apenas até a linha abaixo do ombro sem dor')
      : ex('Desenvolvimento com halteres', 'Ombros', sets, reps, 'Sentado com costas apoiadas'),
    ex('Elevação lateral', 'Ombros', 3, '12 a 15', 'Leve flexão nos cotovelos, controle a descida'),
  ];

  const armList = [
    ex('Tríceps corda', 'Tríceps', 3, reps, 'Cotovelos fixos ao lado do tronco'),
    ex('Rosca direta', 'Bíceps', 3, reps, 'Sem balançar o tronco'),
    ex('Rosca martelo', 'Bíceps', 3, reps, 'Fortalece bíceps e antebraço'),
  ];

  const coreCardioList = [
    hasBackIssue
      ? ex('Prancha', 'Abdômen', 3, '30 a 45s', '⚠️ Isometria segura para estabilizar a coluna sem flexão lombar')
      : ex('Abdominal supra', 'Abdômen', 3, '15 a 20', 'Solte o ar ao subir contraindo o abdômen'),
    ex('Prancha', 'Abdômen', 3, '40s', goal.includes('Emagrecimento') ? '🔥 Finalize com 15 a 20 min de Cárdio para acelerar a queima calórica!' : 'Mantenha o core firme'),
  ];

  if (daysN <= 2) {
    return [
      { id: uid(), name: `Treino A - Superiores Completo (${lvl})`, exercises: [chestList[0], chestList[1], backList[0], backList[2], shoulderList[0], armList[0], armList[1]] },
      { id: uid(), name: `Treino B - Inferiores & Core (${lvl})`, exercises: [legList[0], legList[1], legList[2], legList[4], ...coreCardioList] },
    ];
  }
  if (daysN === 3) {
    return [
      { id: uid(), name: `Treino A - Peito, Ombros e Tríceps (${lvl})`, exercises: [chestList[0], chestList[1], shoulderList[0], shoulderList[1], armList[0], coreCardioList[0]] },
      { id: uid(), name: `Treino B - Pernas e Glúteos (${lvl})`, exercises: legList },
      { id: uid(), name: `Treino C - Costas, Bíceps e Core (${lvl})`, exercises: [backList[0], backList[1], backList[2], armList[1], armList[2], coreCardioList[1]] },
    ];
  }
  return [
    { id: uid(), name: `Treino A - Peito e Tríceps (${lvl})`, exercises: [...chestList, armList[0], ex('Tríceps testa', 'Tríceps', 3, reps)] },
    { id: uid(), name: `Treino B - Costas e Bíceps (${lvl})`, exercises: [...backList, armList[1], armList[2]] },
    { id: uid(), name: `Treino C - Pernas e Glúteos (${lvl})`, exercises: legList },
    { id: uid(), name: `Treino D - Ombros, Abdômen e Condicionamento (${lvl})`, exercises: [...shoulderList, ex('Elevação pélvica', 'Glúteos', sets, reps), ...coreCardioList] },
  ];
}

function renderReportSummaryHtml(r) {
  if (!r) return '';
  const bmi = (r.weight && r.height) ? (r.weight / Math.pow(r.height / 100, 2)).toFixed(1) : null;
  const areas = Array.isArray(r.injuryAreas) && r.injuryAreas.length ? r.injuryAreas.join(', ') : 'Nenhuma área marcada';
  return `<div class="calc-card" style="margin-top:10px;margin-bottom:0">
    <div class="row sp">
      <div>
        <span class="role-pill">⚡ Nível: ${esc(r.level || 'Iniciante')}</span>
        <span class="role-pill" style="margin-left:4px">🎯 Objetivo: ${esc(r.goal || '—')}</span>
        <span class="role-pill" style="margin-left:4px">📅 ${r.daysPerWeek || 3}x / semana</span>
      </div>
      ${r.updatedAt ? `<span class="mut" style="font-size:.76rem">Atualizado em ${new Date(r.updatedAt).toLocaleDateString('pt-BR')}</span>` : ''}
    </div>
    <div class="grid" style="margin-top:10px;font-size:.86rem">
      <div><span class="mut">Já treinou antes?</span><br><b>${esc(r.everTrained || '—')}</b></div>
      <div><span class="mut">Tempo que treina hoje</span><br><b>${esc(r.trainTimeNow || '—')}</b></div>
      <div><span class="mut">Tempo que já treinou</span><br><b>${esc(r.trainTimePast || '—')}</b></div>
      <div><span class="mut">Altura / Peso / IMC</span><br><b>${r.height || '—'} cm · ${r.weight || '—'} kg ${bmi ? `(IMC ${bmi})` : ''}</b></div>
      <div><span class="mut">Tem ou já teve lesão?</span><br><b>${esc(r.hasInjury || 'Não')}</b> (${esc(areas)}) ${r.injuryDesc ? '— ' + esc(r.injuryDesc) : ''}</div>
      <div><span class="mut">Já quebrou algum membro?</span><br><b>${esc(r.hasBroken || 'Não')}</b> ${r.brokenDesc ? '— ' + esc(r.brokenDesc) : ''}</div>
    </div>
    ${r.futureVision ? `<div style="margin-top:10px;padding:10px 12px;background:#0e1316;border-left:4px solid var(--gold);border-radius:8px;font-size:.88rem">
      <span class="mut">🌟 Como quer se ver nos próximos meses:</span><br>
      <b>“${esc(r.futureVision)}”</b>
    </div>` : ''}
  </div>`;
}

function goalReportFormHtml(targetUid = S.user?.id, inline = false) {
  const u = userById(targetUid) || S.user || {};
  const r = u.report || {
    everTrained: 'Sim, já treinei antes',
    trainTimeNow: 'Começando agora',
    trainTimePast: '',
    level: 'Iniciante',
    hasInjury: 'Não',
    injuryAreas: [],
    injuryDesc: u.injuries || '',
    hasBroken: 'Não',
    brokenDesc: '',
    goal: u.goal || 'Emagrecimento',
    height: u.height || 170,
    weight: curWeight(u.id) || u.weight || 70,
    age: u.age || 25,
    daysPerWeek: 3,
    futureVision: '',
  };
  const areas = Array.isArray(r.injuryAreas) ? r.injuryAreas : [];
  const allAreas = ['Ombro', 'Joelho', 'Coluna / Lombar', 'Punho / Cotovelo', 'Quadril / Tornozelo'];

  return `<form onsubmit="saveGoalReport(event,'${u.id}',${inline})">
    <div class="grid2">
      <div>
        <label>1. Você já treinou alguma vez na vida?</label>
        <select name="everTrained">
          ${['Sim, já treinei antes', 'Não, nunca treinei na vida (1ª vez)'].map(o => `<option ${r.everTrained === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>2. Há quanto tempo você treina atualmente?</label>
        <select name="trainTimeNow">
          ${['Começando agora (0 meses)', 'Menos de 3 meses', 'De 3 a 6 meses', 'De 6 meses a 1 ano', 'De 1 a 3 anos', 'Mais de 3 anos'].map(o => `<option ${r.trainTimeNow === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="grid2">
      <div>
        <label>3. Se já treinou antes, por quanto tempo treinou?</label>
        <input name="trainTimePast" value="${esc(r.trainTimePast)}" placeholder="Ex.: Nunca treinei / Treinei 8 meses mas parei há 1 ano...">
      </div>
      <div>
        <label>4. Como você se acha hoje em relação ao treino?</label>
        <select name="level">
          ${['Iniciante', 'Intermediário', 'Avançado'].map(o => `<option ${r.level === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="grid">
      <div>
        <label>5. Seu Objetivo Principal</label>
        <select name="goal">
          ${['Emagrecimento e perda de gordura', 'Hipertrofia (Ganho de massa muscular)', 'Definição muscular e tonificação', 'Condicionamento físico e saúde', 'Fortalecimento e reabilitação'].map(o => `<option ${r.goal === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Dias disponíveis na semana</label>
        <select name="daysPerWeek">
          ${[[2, '2 dias por semana (Treino AB)'], [3, '3 dias por semana (Treino ABC)'], [4, '4 dias por semana (Treino ABCD)'], [5, '5 ou mais dias (Treino ABCD Intenso)']].map(([v, l]) => `<option value="${v}" ${+r.daysPerWeek === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="grid">
      <div><label>6. Altura (cm)</label><input name="height" type="number" min="100" max="240" required value="${r.height || ''}" placeholder="Ex.: 170"></div>
      <div><label>7. Peso atual (kg)</label><input name="weight" type="number" step="0.1" min="25" max="300" required value="${r.weight || ''}" placeholder="Ex.: 72.5"></div>
      <div><label>Idade (anos)</label><input name="age" type="number" min="10" max="100" required value="${r.age || ''}" placeholder="Ex.: 28"></div>
    </div>

    <div class="card" style="margin-top:12px;background:#101518">
      <h3>🩺 8. Histórico de Lesões e Fraturas (Membros Quebrados)</h3>
      <div class="grid2">
        <div>
          <label>Possui lesão atual ou já teve alguma lesão?</label>
          <select name="hasInjury">
            ${['Não', 'Sim'].map(o => `<option ${r.hasInjury === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Se sim, marque as regiões sensíveis (opcional):</label>
          <div class="row" style="margin-top:6px">
            ${allAreas.map(a => `<label style="display:inline-flex;align-items:center;gap:5px;margin:0;padding:5px 10px;background:#181F24;border:1px solid var(--line);border-radius:99px;cursor:pointer;color:var(--txt)"><input type="checkbox" name="injuryArea" value="${a}" ${areas.includes(a) ? 'checked' : ''} style="width:16px;min-height:16px;margin:0"> ${a}</label>`).join('')}
          </div>
        </div>
      </div>
      <label>Detalhes da lesão atual ou antiga (se houver)</label>
      <input name="injuryDesc" value="${esc(r.injuryDesc)}" placeholder="Ex.: Nenhuma / Tive tendinite no ombro / Dor no joelho ao agachar...">

      <div class="grid2" style="margin-top:6px">
        <div>
          <label>9. Você já quebrou (fraturou) algum membro ou osso?</label>
          <select name="hasBroken">
            ${['Não', 'Sim'].map(o => `<option ${r.hasBroken === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Se já quebrou algum membro, qual foi e há quanto tempo?</label>
          <input name="brokenDesc" value="${esc(r.brokenDesc)}" placeholder="Ex.: Quebrei o braço esquerdo há 2 anos / Nunca quebrei...">
        </div>
      </div>
    </div>

    <label>🌟 10. Como você quer se ver daqui a alguns meses? (Sua meta e motivação)</label>
    <textarea name="futureVision" rows="3" required placeholder="Ex.: Quero me ver com menos barriga, mais definição muscular, vestindo as roupas que gosto, sem dores no corpo e com muito mais disposição e autoestima!">${esc(r.futureVision)}</textarea>

    <button class="btn block" style="margin-top:14px">⚡ Salvar Relatório e Montar Meu Treino Automaticamente</button>
  </form>`;
}

function openGoalReportModal(targetUid = S.user?.id) {
  const u = userById(targetUid) || S.user;
  modal(`<h2>📋 Relatório de Objetivos — ${esc(u?.name || 'Aluno')}</h2>
  <p class="mut" style="margin-bottom:8px">Responda as perguntas abaixo para o aplicativo montar automaticamente um treino personalizado e seguro para a sua necessidade:</p>
  ${goalReportFormHtml(u?.id, false)}`);
}

function saveGoalReport(e, targetUid, inline = false) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const f = Object.fromEntries(fd);
  const injuryAreas = fd.getAll('injuryArea');
  const u = userById(targetUid) || S.user;
  if (!u) return;

  const report = {
    everTrained: f.everTrained,
    trainTimeNow: f.trainTimeNow,
    trainTimePast: (f.trainTimePast || '').trim() || (f.everTrained.startsWith('Não') ? 'Nunca treinou' : 'Não informado'),
    level: f.level,
    hasInjury: f.hasInjury,
    injuryAreas,
    injuryDesc: (f.injuryDesc || '').trim(),
    hasBroken: f.hasBroken,
    brokenDesc: (f.brokenDesc || '').trim(),
    goal: f.goal,
    height: +f.height || 170,
    weight: +f.weight || 70,
    age: +f.age || 25,
    daysPerWeek: +f.daysPerWeek || 3,
    futureVision: (f.futureVision || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  u.report = report;
  u.height = report.height;
  u.weight = report.weight;
  u.age = report.age;
  u.goal = report.goal;
  const injSummary = [];
  if (report.hasInjury === 'Sim') injSummary.push(`Lesão (${injuryAreas.join(', ') || 'Geral'}): ${report.injuryDesc || 'Sim'}`);
  if (report.hasBroken === 'Sim') injSummary.push(`Fratura: ${report.brokenDesc || 'Sim'}`);
  u.injuries = injSummary.join(' | ') || 'Nenhuma';

  DB.weights = DB.weights.filter(w => !(w.uid === u.id && w.date === day()));
  DB.weights.push({ id: uid(), uid: u.id, date: day(), kg: report.weight });

  DB.workouts[u.id] = generateAutoWorkout(report);
  S.showInlineReport = false;
  save();
  if (!inline) closeModal();
  render();
  toast('Treino personalizado montado com sucesso de acordo com o seu Relatório! 💪🔥');
}

/* ======================= ÁREA DO ALUNO (PERFIL, TREINO, COMUNIDADE, ESTUDO E CONFIGURAÇÕES) ======================= */
const MOODS = [['😄', 'Ótimo', 'Que energia! Aproveite o dia e capriche no treino! 🔥'], ['🙂', 'Bem', 'Boa! Mantenha a constância que o resultado vem. 💪'], ['😐', 'Cansado(a)', 'Normal! Beba água, respire e faça o seu melhor hoje. 💧'], ['😞', 'Difícil', 'Estamos juntos! Um treino leve já ajuda a mudar o dia. ❤️']];
const TRAINED = [['sim', '✅ Já treinei hoje', 'Que orgulho! Descanse e hidrate-se! 🏆'], ['nao', '⏳ Ainda não', 'Ainda dá tempo! Bora treinar hoje? 💪'], ['descanso', '😴 Hoje é descanso', 'Descanso também faz parte da evolução. Durma bem! 😴']];
const todayCheckin = () => my('checkins').find(c => c.date === day()) || { uid: S.user.id, date: day() };
function setCheckin(k, v) {
  let c = my('checkins').find(c => c.date === day()); if (!c) { c = { id: uid(), uid: S.user.id, date: day() }; DB.checkins.push(c); }
  c[k] = v; save(); toast((k === 'mood' ? MOODS.find(m => m[1] === v)[2] : TRAINED.find(t => t[0] === v)[2])); render();
}
const STUDENT = {
  after: { cardio: () => cardioTick() },
  inbody() {
    return renderInbodyView();
  },
  home() { return STUDENT.profile(); },
  profile() {
    const s = S.user, id = s.id, c = todayCheckin();
    const myTrainer = s.trainerId;
    const msgs = DB.messages.filter(m => m.to === id || (m.to === 'all' && (!m.from || !myTrainer || m.from === myTrainer))).reverse().slice(0, 4);
    DB.messages.filter(m => m.to === id && !m.read).forEach(m => m.read = true);
    const away = daysSince(id), q = QUOTES[new Date().getDate() % QUOTES.length], goal = waterGoal(curWeight(id)), wToday = waterToday(id);
    const wHist = my('weights').sort((a, b) => a.date.localeCompare(b.date)).slice(-8).map(x => ({ l: fmtDate(x.date).slice(0, 5), v: x.kg }));
    const fst = s.role === 'student' ? finStatus(s) : null;
    return `<div class="row sp">
      <div>
        <h1>${greet()}, ${esc(s.name.split(' ')[0])}! 💪</h1>
        <p class="mut">“${q}”</p>
      </div>
      <div class="row">
        <button class="btn sm ghost" onclick="go('water')">💧 Água (${Math.min(100, Math.round(wToday / goal * 100))}%)</button>
        <button class="btn sm ghost" onclick="go('cardio')">⏱️ Cárdio</button>
      </div>
    </div>

    ${away > 2 && away < 999 ? `<div class="banner" style="margin-top:10px">😢 Sentimos sua falta! Bora treinar hoje? Último treino há ${away} dias.</div>` : ''}

    <div class="card row" style="margin-top:12px">
      ${s.photo ? `<img class="avatar" src="${s.photo}" alt="">` : `<div class="avatar">${esc(s.name[0])}</div>`}
      <div style="flex:1">
        <b>${esc(s.name)}</b> <span class="role-pill">${s.autonomous || !s.trainerId ? '🤖 Treino Automático (Sem Personal)' : '🏋️ Aluno'}</span>
        <div class="mut">${esc(s.email)} ${s.phone ? '· 📞 ' + esc(s.phone) : ''}</div>
        <div class="mut">Modalidade: <b class="gold">${esc(trainerName(s.trainerId, s))}</b></div>
      </div>
      <label class="btn ghost sm" style="margin:0;cursor:pointer">Trocar foto<input type="file" accept="image/*" hidden onchange="setPhoto(this.files[0])"></label>
    </div>

    ${fst ? `<div class="card" style="border-left:4px solid ${fst.code === 'overdue' ? '#f87171' : fst.code === 'paid' ? '#4ade80' : '#fbbf24'}">
      <div class="row sp">
        <div>
          <b>💰 Minha Mensalidade (${s.autonomous || !s.trainerId ? 'Plano App Sem Personal' : 'Acompanhamento Personal'}):</b>
          <span class="fin-badge ${fst.badgeClass}" style="margin-left:6px">${fst.label}</span>
          <div class="mut" style="margin-top:3px">Valor: <b class="gold">${fmtBRL(fst.amount)}</b> (${esc(fst.cycle)} · ${esc(fst.method)}) · 📅 ${esc(fst.detailText)}</div>
        </div>
        <div class="row">
          <button class="btn sm ok-btn" onclick="openInAppPaymentModal('${s.id}')">💳 Pagar pelo App (PIX, Crédito ou Débito)</button>
          <button class="btn sm ghost" onclick="openFinHistoryModal('${s.id}')">📜 Comprovantes</button>
        </div>
      </div>
    </div>` : ''}

    <div class="grid" style="margin:14px 0">
      <div class="card stat"><b>🔥 ${streak(id)}</b><span>dias seguidos</span></div>
      <div class="card stat"><b>${my('logs').length}</b><span>treinos feitos</span></div>
      <div class="card stat" style="cursor:pointer" onclick="go('water')"><b>${wToday}/${goal}ml</b><span>água hoje (+ beber)</span></div>
      <div class="card stat"><b>${curWeight(id)} kg</b><span>peso (${s.height || '—'} cm)</span></div>
    </div>

    <div class="card" style="border-color:var(--gold)">
      <div class="row sp">
        <div>
          <h2 style="margin-bottom:2px">📋 Meu Relatório de Objetivos (Treino Automático)</h2>
          <p class="mut">Não tem condições de pagar um personal trainer? O aplicativo analisa seu histórico, nível, lesões e metas para montar seu treino sozinho!</p>
        </div>
        <button class="btn" onclick="openGoalReportModal('${s.id}')">${s.report ? '📋 Atualizar Relatório / Remontar Treino' : '⚡ Responder Relatório e Gerar Meu Treino'}</button>
      </div>
      ${s.report ? renderReportSummaryHtml(s.report) : ''}
    </div>

    <div class="grid2">
      <div class="card"><h3>Como está o seu dia hoje?</h3><div class="row" style="margin-top:10px">${MOODS.map(m => `<button class="chip ${c.mood === m[1] ? 'on' : ''}" onclick="setCheckin('mood','${m[1]}')">${m[0]} ${m[1]}</button>`).join('')}</div></div>
      <div class="card"><h3>Você já treinou hoje?</h3><div class="row" style="margin-top:10px">${TRAINED.map(t => `<button class="chip ${c.trained === t[0] ? 'on' : ''}" onclick="setCheckin('trained','${t[0]}')">${t[1]}</button>`).join('')}</div></div>
    </div>

    <div class="card"><h2>Evolução do peso</h2>${lineChart(wHist)}<form class="row" style="margin-top:10px" onsubmit="event.preventDefault();setWeight(+this.kg.value)"><input name="kg" type="number" step="0.1" placeholder="Registrar novo peso (kg)" required style="flex:1"><button class="btn">Registrar peso</button></form></div>
    <div class="card"><h2>🏅 Conquistas</h2><div class="badges">${badges(id).map(b => `<span class="bdg ${b[1] ? '' : 'off'}">${b[0]}</span>`).join('')}</div></div>
    <div class="card"><h2>📣 Recados e Avisos</h2>${msgs.map(m => `<div class="msg"><span class="mut">${new Date(m.date).toLocaleDateString('pt-BR')}</span><br>${esc(m.text)}</div>`).join('') || '<p class="mut">Sem recados no momento.</p>'}</div>`;
  },
  workout() {
    return renderStudentWorkoutModule(S.user.id, false);
  },
  community() { return communityView(); },
  cardio() {
    const C = cardio, hist = my('cardio').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return `<div class="row sp"><h1>Cronômetro de cárdio</h1><button class="btn sm ghost" onclick="go('workout')">← Voltar ao Treino</button></div>
    <div class="card"><div class="row" style="margin-bottom:10px">${Object.keys(METS).map(t => `<button class="chip ${C.type === t ? 'on' : ''}" onclick="cardio.type='${t}';render()">${t}</button>`).join('')}</div>
    <div class="row" style="margin-bottom:10px"><button class="chip ${!C.interval ? 'on' : ''}" onclick="cardio.interval=false;cardioReset();render()">Livre</button><button class="chip ${C.interval ? 'on' : ''}" onclick="cardio.interval=true;cardioReset();render()">Intervalado</button></div>
    ${C.interval ? `<div class="grid"><div><label>Forte (s)</label><input type="number" value="${C.work}" onchange="cardio.work=+this.value"></div><div><label>Leve (s)</label><input type="number" value="${C.rest}" onchange="cardio.rest=+this.value"></div><div><label>Rounds</label><input type="number" value="${C.rounds}" onchange="cardio.rounds=+this.value"></div></div>` : ''}
    <div class="phase gold" id="phase"></div><div class="timer" id="clock">00:00</div>
    <div class="row" style="justify-content:center"><button class="btn" id="cgo" onclick="cardioToggle()"></button><button class="btn ghost" onclick="cardioReset();render()">Zerar</button><button class="btn ghost" onclick="cardioSave()">${ic('save')}Salvar</button></div><p class="mut" style="text-align:center;margin-top:8px" id="ckcal"></p></div>
    <div class="card"><h2>Histórico</h2>${hist.map(h => `<div class="msg">${fmtDate(h.date)} — ${h.type}: ${Math.floor(h.sec / 60)}min · ~${h.kcal} kcal</div>`).join('') || '<p class="mut">Sem registros.</p>'}</div>`;
  },
  water() {
    const id = S.user.id, kg = curWeight(id), goal = waterGoal(kg), w = waterToday(id), pct = Math.min(100, w / goal * 100);
    const wk = week().map(d => ({ l: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()], v: +(my('water').filter(x => x.date === day(d)).reduce((s, x) => s + x.ml, 0) / 1000).toFixed(1) }));
    const mo = [...Array(30)].filter((_, i) => my('water').filter(x => x.date === day(addDays(-i))).reduce((s, x) => s + x.ml, 0) >= goal).length;
    return `<div class="row sp"><h1>Meta de água 💧</h1><button class="btn sm ghost" onclick="go('profile')">← Voltar ao Perfil</button></div>
    <div class="card" style="text-align:center"><div class="cup"><i style="height:${pct}%"></i><span>${Math.round(pct)}%</span></div><h2 style="margin-top:12px">${w} / ${goal} ml</h2><p class="mut">Peso: ${kg} kg × 35 ml = ${(goal / 1000).toFixed(2).replace('.', ',')} L por dia</p>
    ${w >= goal ? '<p class="gold" style="font:700 1.4rem var(--font-h)">Meta batida! 🏆💧</p>' : ''}<div class="row" style="justify-content:center;margin-top:10px">${[200, 300, 500].map(n => `<button class="btn" onclick="addWater(${n})">+${n} ml</button>`).join('')}<button class="btn ghost" onclick="const v=+prompt('Quantos ml?');if(v>0)addWater(v)">Outro</button><button class="btn ghost" onclick="undoWater()">↶ Desfazer</button></div></div>
    <div class="card"><h3>Atualizar seu peso</h3><form class="row" onsubmit="event.preventDefault();setWeight(+this.kg.value)"><input name="kg" type="number" step="0.1" placeholder="Seu peso (kg)" required style="flex:1"><button class="btn">Recalcular meta</button></form></div>
    <div class="card"><h2>Semana (litros)</h2>${barChart(wk)}<p class="mut">Metas batidas nos últimos 30 dias: <b class="gold">${mo}</b></p></div>`;
  },
  study() { return studyView(false); },
  settings() {
    const s = S.user;
    const isCloud = Cloud.enabled;
    return `<h1>Configurações</h1>
    <div class="card row sp">
      <div class="row">
        ${s.photo ? `<img class="avatar" src="${s.photo}" alt="">` : `<div class="avatar">${esc(s.name[0])}</div>`}
        <div>
          <b>${esc(s.name)}</b>
          <div class="mut">${esc(s.email)} · ${esc(roleLabel(s.role))}</div>
        </div>
      </div>
      <div class="row">
        <button class="btn sm ok-btn" onclick="openInAppPaymentModal('${s.id}')">💳 Pagar Mensalidade (PIX / Cartão)</button>
        ${isCeo() ? `<button class="btn sm" onclick="toggleCeoStudentMode(false)">👑 Voltar ao Painel do CEO</button>` : ''}
      </div>
    </div>

    ${s.role === 'student' ? `<div class="card" style="border-color:var(--gold)">
      <div class="row sp">
        <div>
          <h2>💳 Pagamento da Mensalidade pelo Aplicativo</h2>
          <p class="mut" style="margin-top:2px">Pague sua mensalidade direto pelo app via <b>PIX</b> (QR Code / Copia e Cola), <b>Cartão de Crédito</b> ou <b>Cartão de Débito</b>:</p>
        </div>
        <div class="row">
          <button class="btn ok-btn" onclick="openInAppPaymentModal('${s.id}')">💳 Pagar Agora</button>
          <button class="btn ghost sm" onclick="openFinHistoryModal('${s.id}')">📜 Meus Comprovantes</button>
        </div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="row sp">
        <div>
          <h2>📲 Baixar PersonalHUB no Celular (App PWA)</h2>
          <p class="mut" style="margin-top:2px">Instale o app direto no seu Android ou iPhone para treinar com tela cheia e acesso rápido na tela inicial.</p>
        </div>
        <button class="btn-install" onclick="installPwa()">${ic('download')}Instalar Aplicativo</button>
      </div>
    </div>

    <div class="card">
      <div class="row sp" style="margin-bottom:8px">
        <div>
          <h2>🔄 Sincronização entre Celular e Computador</h2>
          <p class="mut">Transfira seus dados, treinos e posts entre o computador e o celular com 1 clique.</p>
        </div>
        <span class="sync-badge ${isCloud ? 'online' : 'local'}">${isCloud ? '☁️ Supabase Conectado' : '💾 Modo Local (IndexedDB)'}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="openSyncModal()">${ic('refresh-cw')}Central de Sincronização</button>
        <button class="btn ghost" onclick="openSupabaseModal()">${ic('database')}Configurar Nuvem (Supabase)</button>
      </div>
    </div>

    <div class="card">
      <h2>📞 Meu Telefone / WhatsApp (Opcional)</h2>
      <form class="row" onsubmit="event.preventDefault();S.user.phone=this.ph.value.trim();save();toast('Telefone atualizado ✅');render()">
        <input name="ph" type="tel" value="${esc(s.phone || '')}" placeholder="(11) 99999-9999 (opcional)" style="flex:1">
        <button class="btn sm">Salvar telefone</button>
      </form>
    </div>

    <div class="card">
      <h2>📋 Relatório de Objetivos (Treino Automático)</h2>
      <p class="mut" style="margin-bottom:10px">Quer refazer sua avaliação de objetivos, atualizar seu nível (iniciante/intermediário/avançado) ou informar uma nova condição física para remontar seu treino?</p>
      <button class="btn ghost" onclick="openGoalReportModal('${s.id}')">📋 Abrir / Refazer meu Relatório de Objetivos</button>
    </div>

    <div class="card">
      <h2>🔔 Lembretes e Alertas</h2>
      <label>Horário do treino</label>
      <input type="time" value="${DB.settings[s.id]?.train || ''}" onchange="setSet('train',this.value)">
      <label>Lembrar de beber água a cada (horas, 0 = desligado)</label>
      <input type="number" min="0" max="6" value="${DB.settings[s.id]?.waterH ?? 0}" onchange="setSet('waterH',+this.value)">
      <button class="btn ghost" style="margin-top:10px" onclick="askNotif()">${ic('bell')}Ativar notificações no aparelho</button>
    </div>

    <div class="card">
      <h2>🔑 Alterar minha senha</h2>
      ${pwForm(s.id)}
    </div>

    <button class="btn ghost block" onclick="logout()">${ic('log-out')}Sair da conta</button>`;
  },
};

const toggleEx = (did, xid) => { S.done = S.done || {}; const k = day() + did, a = S.done[k] = S.done[k] || []; const i = a.indexOf(xid); i < 0 ? a.push(xid) : a.splice(i, 1); render(); };
function finishWorkout(did) {
  const d = DB.workouts[S.user.id].find(x => x.id === did);
  DB.logs.push({ id: uid(), uid: S.user.id, date: day(), workoutId: did, name: d.name }); setCheckinSilent(); save(); toast('Treino concluído! Que orgulho! 🏆🔥'); render();
}

/* ======================= MÓDULO DE PROGRESSÃO DE CARGAS, MICROCICLO (SEMANAL) E MESOCICLO (MENSAL) ======================= */
const MESOCYCLE_OPTIONS = [
  ['Mesociclo 1', 'Mesociclo 1 — Mensal (Adaptação & Base)'],
  ['Mesociclo 2', 'Mesociclo 2 — Força & Hipertrofia'],
  ['Mesociclo 3', 'Mesociclo 3 — Pico & Definição'],
];

const MICRO_WEEKS = [
  { num: 1, key: 'w1', title: 'Semana 1', sub: 'Base', desc: 'Microciclo 1 (Semana Base) — Ajuste técnico e descoberta da carga inicial.' },
  { num: 2, key: 'w2', title: 'Semana 2', sub: 'Progressão', desc: 'Microciclo 2 (Progressão) — Tente subir +1 a +2 reps ou +1 a +2 kg mantendo a técnica!' },
  { num: 3, key: 'w3', title: 'Semana 3', sub: 'Pico/Sobrecarga', desc: 'Microciclo 3 (Pico/Sobrecarga) — Semana de maior desafio de carga antes da consolidação!' },
  { num: 4, key: 'w4', title: 'Semana 4', sub: 'Consolidação', desc: 'Microciclo 4 (Consolidação / Deload) — Consolide os ganhos do mês com execução perfeita.' },
];

const RIR_OPTIONS = [
  ['Fácil / RIR 2', '🟢 Fácil / RIR 2 (Sobrou gás)'],
  ['No Alvo / RIR 1', '⚡ No Alvo / RIR 1 (Ideal)'],
  ['Limite / Falha', '🔥 Limite / Falha (Máximo)'],
];

const SCHEDULE_CYCLE_OPTIONS = ['A', 'B', 'C', 'D', 'Cardio', 'Desc'];
const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function getWorkoutSplitLetter(workoutDay, index = 0) {
  const m = String(workoutDay?.name || '').match(/Treino\s+([A-Z0-9])/i);
  if (m) return m[1].toUpperCase();
  return String.fromCharCode(65 + (index % 26));
}

function parseBaseKg(loadStr, fallback = 20) {
  const m = String(loadStr || '').replace(',', '.').match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : fallback;
}

function parseBaseReps(repsStr, fallback = 12) {
  const m = String(repsStr || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : fallback;
}

function ensureUserWorkoutProgression(userId, mesocycle = 'Mesociclo 1') {
  if (!userId || !DB) return { logs: { w1: {}, w2: {}, w3: {}, w4: {} }, schedule: {}, sessionHistory: [] };
  DB.settings = DB.settings || {};
  DB.settings[userId] = DB.settings[userId] || {};
  DB.settings[userId].loadProgression = DB.settings[userId].loadProgression || {};

  let prog = DB.settings[userId].loadProgression[mesocycle];
  const ws = DB.workouts[userId] || [];
  const uObj = userById(userId);
  const baseBodyKg = curWeight(userId) || uObj?.weight || 68;

  if (!prog) {
    prog = {
      logs: { w1: {}, w2: {}, w3: {}, w4: {} },
      schedule: {
        w1: { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: +(baseBodyKg + 0.9).toFixed(1) },
        w2: { days: ['A', 'B', 'Cardio', 'C', 'D', 'Desc', 'Desc'], weight: +(baseBodyKg + 0.4).toFixed(1) },
        w3: { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: +(baseBodyKg).toFixed(1) },
        w4: { days: ['A', 'B', 'Desc', 'C', 'D', 'Desc', 'Desc'], weight: '' },
      },
      sessionHistory: [],
      seeded: false,
      updatedAt: new Date().toISOString(),
    };
    DB.settings[userId].loadProgression[mesocycle] = prog;
  }

  prog.logs = prog.logs || { w1: {}, w2: {}, w3: {}, w4: {} };
  ['w1', 'w2', 'w3', 'w4'].forEach(k => { prog.logs[k] = prog.logs[k] || {}; });

  if (!prog.schedule) {
    prog.schedule = {
      w1: { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: +(baseBodyKg + 0.9).toFixed(1) },
      w2: { days: ['A', 'B', 'Cardio', 'C', 'D', 'Desc', 'Desc'], weight: +(baseBodyKg + 0.4).toFixed(1) },
      w3: { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: +(baseBodyKg).toFixed(1) },
      w4: { days: ['A', 'B', 'Desc', 'C', 'D', 'Desc', 'Desc'], weight: '' },
    };
  }

  // Pré-popula Semanas 1 e 2 no Mesociclo 1 para que a referência histórica ("Última carga") e o ganho no mês funcionem imediatamente
  if (mesocycle === 'Mesociclo 1' && !prog.seeded && ws.length) {
    ws.forEach((d, dIdx) => {
      const split = getWorkoutSplitLetter(d, dIdx);
      (d.exercises || []).forEach((ex, exIdx) => {
        const baseKg = parseBaseKg(ex.load, 16 + exIdx * 4);
        const baseReps = parseBaseReps(ex.reps, 12);
        const stepKg = baseKg >= 40 ? 4 : 2;
        if (!prog.logs.w1[ex.id]) {
          prog.logs.w1[ex.id] = {
            kg: baseKg,
            reps: baseReps,
            rir: 'No Alvo / RIR 1',
            note: 'Carga base da Semana 1',
            done: true,
            date: day(addDays(-14)),
            workout_split: split,
            exercise_name: ex.name,
          };
        }
        if (!prog.logs.w2[ex.id]) {
          prog.logs.w2[ex.id] = {
            kg: +(baseKg + stepKg).toFixed(1),
            reps: baseReps,
            rir: 'No Alvo / RIR 1',
            note: 'Subiu carga com boa postura',
            done: true,
            date: day(addDays(-7)),
            workout_split: split,
            exercise_name: ex.name,
          };
        }
        if (!prog.logs.w3[ex.id] && exIdx === 0) {
          prog.logs.w3[ex.id] = {
            kg: +(baseKg + stepKg * 2).toFixed(1),
            reps: baseReps,
            rir: 'Limite / Falha',
            note: 'Novo recorde pessoal!',
            done: true,
            date: day(),
            workout_split: split,
            exercise_name: ex.name,
          };
        }
      });
    });
    if (!prog.sessionHistory || !prog.sessionHistory.length) {
      const firstDay = ws[0];
      if (firstDay) {
        prog.sessionHistory = [
          {
            id: uid(),
            date: day(addDays(-7)),
            mesocycle: 'Mesociclo 1',
            week: 2,
            workout_split: getWorkoutSplitLetter(firstDay, 0),
            workout_name: firstDay.name,
            items: (firstDay.exercises || []).map(x => ({
              name: x.name,
              kg: prog.logs.w2[x.id]?.kg || parseBaseKg(x.load, 20),
              reps: prog.logs.w2[x.id]?.reps || 12,
              rir: prog.logs.w2[x.id]?.rir || 'No Alvo / RIR 1',
            })),
            note: 'Ótimo treino de progressão na Semana 2!',
          },
        ];
      }
    }
    prog.seeded = true;
  }

  return prog;
}

function getPreviousWeekEntry(prog, curWeekNum, exId) {
  for (let w = curWeekNum - 1; w >= 1; w--) {
    const entry = prog.logs?.['w' + w]?.[exId];
    if (entry && entry.kg !== '' && entry.kg !== undefined && entry.kg !== null) {
      return { week: w, ...entry };
    }
  }
  return null;
}

function calcMonthProgressionBadge(prog, curWeekNum, exId) {
  const curEntry = prog.logs?.['w' + curWeekNum]?.[exId];
  const w1Entry = prog.logs?.w1?.[exId];
  const curKg = parseFloat(curEntry?.kg);
  const w1Kg = parseFloat(w1Entry?.kg);
  if (isNaN(curKg) || isNaN(w1Kg) || w1Kg <= 0 || curWeekNum === 1) return null;
  const diffKg = +(curKg - w1Kg).toFixed(1);
  const pct = +(((curKg - w1Kg) / w1Kg) * 100).toFixed(0);
  if (diffKg > 0) {
    return { cls: 'up', text: `+${diffKg} kg (+${pct}%) no mês`, diffKg, pct };
  }
  if (diffKg === 0) {
    const diffReps = (parseInt(curEntry?.reps, 10) || 0) - (parseInt(w1Entry?.reps, 10) || 0);
    if (diffReps > 0) return { cls: 'up', text: `=${curKg} kg (+${diffReps} reps)`, diffKg: 0, pct: 0 };
    return { cls: 'same', text: `Carga mantida (${curKg} kg)`, diffKg: 0, pct: 0 };
  }
  return { cls: 'down', text: `${diffKg} kg (${pct}%)`, diffKg, pct };
}

function _refreshWorkoutViewOrModal() {
  if ($('#modal') && S.wkTargetUid && S.view !== 'workout') {
    openStudentProgressionModal(S.wkTargetUid);
  } else {
    render();
  }
  icons();
}

function setMesocycle(meso) {
  S.wkMesocycle = meso;
  const targetUid = S.wkTargetUid || S.user?.id;
  if (targetUid && typeof getWorkoutLoadHistory === 'function') {
    getWorkoutLoadHistory(targetUid, meso).then(() => _refreshWorkoutViewOrModal()).catch(() => _refreshWorkoutViewOrModal());
  } else {
    _refreshWorkoutViewOrModal();
  }
}

function setMicroWeek(wkNum) {
  S.wkMicroWeek = Number(wkNum) || 1;
  _refreshWorkoutViewOrModal();
}

function setWorkoutSubTab(tab) {
  S.wkSubTab = tab;
  _refreshWorkoutViewOrModal();
}

function setWorkoutEvoFilter(flt) {
  S.wkEvoFilter = flt;
  _refreshWorkoutViewOrModal();
}

function selectWorkoutSplit(did, isModal = false) {
  if (isModal) {
    S.wkModalSplitId = did;
    openStudentProgressionModal(S.wkTargetUid);
  } else {
    S.param = did;
    render();
  }
}

function ensureCurExerciseLogObj(userId, mesocycle, wkNum, ex, splitLetter) {
  const prog = ensureUserWorkoutProgression(userId, mesocycle);
  const wkKey = 'w' + wkNum;
  prog.logs[wkKey] = prog.logs[wkKey] || {};
  if (!prog.logs[wkKey][ex.id]) {
    prog.logs[wkKey][ex.id] = {
      kg: '',
      reps: '',
      rir: 'No Alvo / RIR 1',
      note: '',
      done: false,
      date: S.wkDate || day(),
      workout_split: splitLetter,
      exercise_name: ex.name,
    };
  }
  return prog.logs[wkKey][ex.id];
}

function updateExerciseLogField(userId, did, exId, field, rawVal, shouldRender = false) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const wkNum = S.wkMicroWeek || 3;
  const ws = DB.workouts[userId] || [];
  const dIdx = ws.findIndex(x => x.id === did);
  const d = ws[dIdx] || ws[0];
  const ex = d?.exercises?.find(x => x.id === exId) || { id: exId, name: 'Exercício' };
  const split = getWorkoutSplitLetter(d, Math.max(0, dIdx));
  const entry = ensureCurExerciseLogObj(userId, meso, wkNum, ex, split);

  if (field === 'kg') {
    entry.kg = rawVal === '' ? '' : Math.max(0, +(parseFloat(String(rawVal).replace(',', '.')) || 0).toFixed(1));
  } else if (field === 'reps') {
    entry.reps = rawVal === '' ? '' : Math.max(0, parseInt(rawVal, 10) || 0);
  } else if (field === 'rir') {
    entry.rir = String(rawVal || 'No Alvo / RIR 1');
  } else if (field === 'note') {
    entry.note = String(rawVal || '');
  }
  entry.date = S.wkDate || day();
  entry.workout_split = split;
  entry.exercise_name = ex.name;

  save();
  broadcastRealtime('load_update', { studentId: userId, did, exId, field, value: entry[field] });
  if (shouldRender) {
    if ($('#modal') && S.wkTargetUid === userId && S.view !== 'workout') {
      openStudentProgressionModal(userId);
    } else {
      render();
    }
  } else {
    // Atualiza o badge de progressão do exercício em tempo real sem perder foco do teclado no mobile
    const prog = ensureUserWorkoutProgression(userId, meso);
    const badgeEl = document.getElementById(`prog-badge-${exId}`);
    if (badgeEl) {
      const b = calcMonthProgressionBadge(prog, wkNum, exId);
      badgeEl.innerHTML = b ? `<span class="prog-gain-badge ${b.cls}">📈 ${esc(b.text)}</span>` : '';
    }
  }
}

function stepExerciseValue(userId, did, exId, field, delta) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const wkNum = S.wkMicroWeek || 3;
  const ws = DB.workouts[userId] || [];
  const dIdx = ws.findIndex(x => x.id === did);
  const d = ws[dIdx] || ws[0];
  const ex = d?.exercises?.find(x => x.id === exId);
  if (!ex) return;
  const split = getWorkoutSplitLetter(d, Math.max(0, dIdx));
  const prog = ensureUserWorkoutProgression(userId, meso);
  const entry = ensureCurExerciseLogObj(userId, meso, wkNum, ex, split);
  const prev = getPreviousWeekEntry(prog, wkNum, exId);

  if (field === 'kg') {
    const startVal = (entry.kg !== '' && entry.kg !== null && entry.kg !== undefined)
      ? parseFloat(entry.kg)
      : (prev?.kg ? parseFloat(prev.kg) : parseBaseKg(ex.load, 10));
    const nextVal = Math.max(0, +(startVal + delta).toFixed(1));
    entry.kg = nextVal;
    const inp = document.getElementById(`inp-kg-${exId}`);
    if (inp) inp.value = nextVal;
  } else if (field === 'reps') {
    const startReps = (entry.reps !== '' && entry.reps !== null && entry.reps !== undefined)
      ? parseInt(entry.reps, 10)
      : (prev?.reps ? parseInt(prev.reps, 10) : parseBaseReps(ex.reps, 12));
    const nextReps = Math.max(0, startReps + delta);
    entry.reps = nextReps;
    const inp = document.getElementById(`inp-reps-${exId}`);
    if (inp) inp.value = nextReps;
  }
  entry.date = S.wkDate || day();
  save();
  broadcastRealtime('load_update', { studentId: userId, did, exId, field, value: entry[field] });

  const badgeEl = document.getElementById(`prog-badge-${exId}`);
  if (badgeEl) {
    const b = calcMonthProgressionBadge(prog, wkNum, exId);
    badgeEl.innerHTML = b ? `<span class="prog-gain-badge ${b.cls}">📈 ${esc(b.text)}</span>` : '';
  }
}

function repeatPrevWeekLoad(userId, did, exId) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const wkNum = S.wkMicroWeek || 3;
  const ws = DB.workouts[userId] || [];
  const dIdx = ws.findIndex(x => x.id === did);
  const d = ws[dIdx] || ws[0];
  const ex = d?.exercises?.find(x => x.id === exId);
  if (!ex) return;
  const split = getWorkoutSplitLetter(d, Math.max(0, dIdx));
  const prog = ensureUserWorkoutProgression(userId, meso);
  const prev = getPreviousWeekEntry(prog, wkNum, exId);
  const entry = ensureCurExerciseLogObj(userId, meso, wkNum, ex, split);

  if (prev) {
    entry.kg = prev.kg;
    entry.reps = prev.reps || parseBaseReps(ex.reps, 12);
  } else {
    entry.kg = parseBaseKg(ex.load, 10);
    entry.reps = parseBaseReps(ex.reps, 12);
  }
  entry.done = true;
  entry.date = S.wkDate || day();
  save();
  broadcastRealtime('load_update', { studentId: userId, did, exId, kg: entry.kg, reps: entry.reps, done: true });
  toast(`⚡ Carga repetida: ${entry.kg} kg × ${entry.reps} reps!`);
  if ($('#modal') && S.wkTargetUid === userId && S.view !== 'workout') {
    openStudentProgressionModal(userId);
  } else {
    render();
  }
}

function toggleExerciseLoadDone(userId, did, exId) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const wkNum = S.wkMicroWeek || 3;
  const ws = DB.workouts[userId] || [];
  const dIdx = ws.findIndex(x => x.id === did);
  const d = ws[dIdx] || ws[0];
  const ex = d?.exercises?.find(x => x.id === exId);
  if (!ex) return;
  const split = getWorkoutSplitLetter(d, Math.max(0, dIdx));
  const prog = ensureUserWorkoutProgression(userId, meso);
  const entry = ensureCurExerciseLogObj(userId, meso, wkNum, ex, split);
  const prev = getPreviousWeekEntry(prog, wkNum, exId);

  entry.done = !entry.done;
  if (entry.done) {
    if (entry.kg === '' || entry.kg === null || entry.kg === undefined) {
      entry.kg = prev?.kg ?? parseBaseKg(ex.load, 10);
    }
    if (entry.reps === '' || entry.reps === null || entry.reps === undefined) {
      entry.reps = prev?.reps ?? parseBaseReps(ex.reps, 12);
    }
  }
  entry.date = S.wkDate || day();

  // Sincroniza também com S.done do dia
  S.done = S.done || {};
  const k = day() + did;
  const arr = S.done[k] = S.done[k] || [];
  const idx = arr.indexOf(exId);
  if (entry.done && idx < 0) arr.push(exId);
  if (!entry.done && idx >= 0) arr.splice(idx, 1);

  save();
  broadcastRealtime('load_update', { studentId: userId, did, exId, done: entry.done, kg: entry.kg, reps: entry.reps });
  if ($('#modal') && S.wkTargetUid === userId && S.view !== 'workout') {
    openStudentProgressionModal(userId);
  } else {
    render();
  }
}

async function saveCurrentWorkoutLoads(userId, did) {
  const u = userById(userId) || S.user;
  if (!u) return;
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const wkNum = S.wkMicroWeek || 3;
  const wkDate = S.wkDate || day();
  const ws = DB.workouts[userId] || [];
  const dIdx = ws.findIndex(x => x.id === did);
  const d = ws[dIdx] || ws[0];
  if (!d) return toast('Nenhum treino selecionado.');

  const split = getWorkoutSplitLetter(d, Math.max(0, dIdx));
  const prog = ensureUserWorkoutProgression(userId, meso);
  const wkLogs = prog.logs['w' + wkNum] || {};
  const sessionNote = ($('#wkSessionNoteInp')?.value || S.wkSessionNote || '').trim();
  S.wkSessionNote = sessionNote;

  const entriesToSave = [];
  const summaryItems = [];

  (d.exercises || []).forEach(ex => {
    const cur = wkLogs[ex.id] || {};
    const prev = getPreviousWeekEntry(prog, wkNum, ex.id);
    const hasKg = cur.kg !== '' && cur.kg !== undefined && cur.kg !== null;
    if (hasKg || cur.done) {
      const finalKg = hasKg ? Number(cur.kg) : (prev?.kg ?? parseBaseKg(ex.load, 10));
      const finalReps = (cur.reps !== '' && cur.reps !== undefined && cur.reps !== null) ? Number(cur.reps) : (prev?.reps ?? parseBaseReps(ex.reps, 12));
      const finalRir = cur.rir || 'No Alvo / RIR 1';
      const finalNote = cur.note || '';

      cur.kg = finalKg;
      cur.reps = finalReps;
      cur.done = true;
      wkLogs[ex.id] = cur;

      entriesToSave.push({
        date: wkDate,
        user_id: userId,
        mesocycle: meso,
        week: wkNum,
        workout_split: split,
        workout_id: d.id,
        exercise_id: ex.id,
        exercise_name: ex.name,
        weight_kg: finalKg,
        reps_done: finalReps,
        rir: finalRir,
        notes: finalNote,
        done: true,
      });

      summaryItems.push({
        exercise_id: ex.id,
        name: ex.name,
        kg: finalKg,
        reps: finalReps,
        rir: finalRir,
        note: finalNote,
      });
    }
  });

  if (!entriesToSave.length) {
    return toast('⚠️ Preencha a carga (kg) ou marque pelo menos 1 exercício antes de salvar!');
  }

  await saveWorkoutLoadLog({
    entries: entriesToSave,
    sessionSummary: {
      user_id: userId,
      date: wkDate,
      mesocycle: meso,
      week: wkNum,
      workout_split: split,
      workout_name: d.name,
      items: summaryItems,
      note: sessionNote,
    },
  });

  // Registra também no histórico de treinos concluídos (DB.logs) se ainda não registrado hoje
  if (!DB.logs.some(l => l.uid === userId && l.date === wkDate && l.workoutId === d.id)) {
    DB.logs.push({ id: uid(), uid: userId, date: wkDate, workoutId: d.id, name: `${d.name} (${meso} · Sem ${wkNum})` });
  }
  if (userId === S.user?.id) setCheckinSilent();

  save();
  broadcastRealtime('workout_saved', { studentId: userId, did, meso, wkNum });
  toast(`💾 Cargas do ${d.name.split(' - ')[0]} (${meso} · Semana ${wkNum}) salvas com sucesso! 🏆🔥`);
  if ($('#modal') && S.wkTargetUid === userId && S.view !== 'workout') {
    openStudentProgressionModal(userId);
  } else {
    render();
  }
}

function buildWorkoutWhatsAppSummaryText(userId, did) {
  const u = userById(userId) || S.user;
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const wkNum = S.wkMicroWeek || 3;
  const wkMeta = MICRO_WEEKS.find(w => w.num === wkNum) || MICRO_WEEKS[0];
  const wkDate = fmtDate(S.wkDate || day());
  const ws = DB.workouts[userId] || [];
  const dIdx = ws.findIndex(x => x.id === did);
  const d = ws[dIdx] || ws[0];
  const split = getWorkoutSplitLetter(d, Math.max(0, dIdx));
  const prog = ensureUserWorkoutProgression(userId, meso);
  const wkLogs = prog.logs['w' + wkNum] || {};
  const sessionNote = ($('#wkSessionNoteInp')?.value || S.wkSessionNote || '').trim();

  const lines = [
    `💪 *RESUMO DE TREINO E CARGAS — ${BRAND().toUpperCase()}*`,
    `👤 *Aluna(o):* ${u?.name || 'Aluna'}`,
    `📅 *Período:* ${meso} · Semana ${wkNum} (${wkMeta.sub}) — ${wkDate}`,
    `🏋️‍♀️ *Ficha:* ${d?.name || ('Treino ' + split)}`,
    `-----------------------------------------`,
  ];

  let count = 0;
  (d?.exercises || []).forEach((ex, i) => {
    const cur = wkLogs[ex.id] || {};
    const prev = getPreviousWeekEntry(prog, wkNum, ex.id);
    const w1 = prog.logs?.w1?.[ex.id];
    const hasKg = cur.kg !== '' && cur.kg !== undefined && cur.kg !== null;
    if (hasKg || cur.done) {
      count++;
      const kgVal = hasKg ? cur.kg : (prev?.kg ?? parseBaseKg(ex.load, 0));
      const repsVal = cur.reps || prev?.reps || ex.reps;
      let diffStr = '';
      if (prev && prev.kg && !isNaN(parseFloat(kgVal)) && !isNaN(parseFloat(prev.kg))) {
        const diffPrev = +(parseFloat(kgVal) - parseFloat(prev.kg)).toFixed(1);
        if (diffPrev > 0) diffStr = ` _(📈 +${diffPrev}kg vs Sem ${prev.week})_`;
        else if (diffPrev === 0) diffStr = ` _(＝ manteve vs Sem ${prev.week})_`;
      } else if (w1 && w1.kg && wkNum > 1 && !isNaN(parseFloat(kgVal)) && !isNaN(parseFloat(w1.kg))) {
        const diffW1 = +(parseFloat(kgVal) - parseFloat(w1.kg)).toFixed(1);
        if (diffW1 > 0) diffStr = ` _(📈 +${diffW1}kg no mês)_`;
      }
      const checkIcon = cur.done ? '✅' : '🔹';
      lines.push(`${checkIcon} *${i + 1}. ${ex.name}:* ${kgVal} kg × ${repsVal} reps (${cur.rir || 'RIR 1'})${diffStr}`);
      if (cur.note) lines.push(`   📝 _Obs: ${cur.note}_`);
    } else {
      lines.push(`⬜ *${i + 1}. ${ex.name}:* Meta ${ex.sets}x${ex.reps}`);
    }
  });

  if (!count) {
    lines.push(`_(Nenhuma carga preenchida ainda hoje)_`);
  }

  if (sessionNote) {
    lines.push(`-----------------------------------------`);
    lines.push(`💬 *Sensação do treino:* ${sessionNote}`);
  }
  lines.push(`-----------------------------------------`);
  lines.push(`🚀 _Enviado via app ${BRAND()}_`);
  return lines.join('\n');
}

function sendWorkoutLoadsWhatsApp(userId, did, openDirectly = false) {
  const u = userById(userId) || S.user;
  const trainer = u?.trainerId ? userById(u.trainerId) : null;
  const defaultPhone = cleanPhone(trainer?.phone || '');
  const summaryText = buildWorkoutWhatsAppSummaryText(userId, did);
  const directWaHref = defaultPhone
    ? `https://wa.me/${defaultPhone.length <= 11 ? '55' + defaultPhone : defaultPhone}?text=${encodeURIComponent(summaryText)}`
    : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;

  if (openDirectly) {
    window.open(directWaHref, '_blank');
    return;
  }

  modal(`<h2>📲 Enviar Cargas do Treino no WhatsApp</h2>
  <p class="mut" style="margin-bottom:8px">Confira abaixo o resumo formatado com suas cargas, repetições e evolução da semana para enviar ao seu Personal Trainer:</p>
  <label>WhatsApp do Personal Trainer (opcional — deixe em branco para escolher o contato na hora)</label>
  <input id="waTrainerPhoneInp" type="tel" value="${esc(trainer?.phone || '')}" placeholder="(11) 99999-9999">
  <label>Mensagem formatada do treino</label>
  <textarea id="waWorkoutMsgBox" rows="10" style="font-family:monospace;font-size:.8rem;line-height:1.45">${esc(summaryText)}</textarea>
  <div class="row" style="margin-top:12px;gap:8px">
    <button type="button" class="btn btn-wa-green" style="flex:1" onclick="const ph=cleanPhone($('#waTrainerPhoneInp')?.value||'');const txt=$('#waWorkoutMsgBox')?.value||'';const url=ph?('https://wa.me/'+(ph.length<=11?'55'+ph:ph)+'?text='+encodeURIComponent(txt)):('https://wa.me/?text='+encodeURIComponent(txt));window.open(url,'_blank')">📲 Abrir WhatsApp Agora</button>
    <button type="button" class="btn ghost" onclick="copyPixToClipboard($('#waWorkoutMsgBox')?.value||'','Resumo do treino')">📋 Copiar Texto</button>
  </div>`);
}

function cycleMicroScheduleDay(userId, wkNum, dayIdx) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const prog = ensureUserWorkoutProgression(userId, meso);
  const wkKey = 'w' + wkNum;
  prog.schedule[wkKey] = prog.schedule[wkKey] || { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: '' };
  const curVal = prog.schedule[wkKey].days[dayIdx] || 'Desc';
  const nextIdx = (SCHEDULE_CYCLE_OPTIONS.indexOf(curVal) + 1) % SCHEDULE_CYCLE_OPTIONS.length;
  prog.schedule[wkKey].days[dayIdx] = SCHEDULE_CYCLE_OPTIONS[nextIdx];
  saveWeeklySchedule(userId, meso, prog.schedule);
  broadcastRealtime('schedule_update', { studentId: userId, meso, wkNum });
  if ($('#modal') && S.wkTargetUid === userId && S.view !== 'workout') {
    openStudentProgressionModal(userId);
  } else {
    render();
  }
}

function updateMicroWeekWeight(userId, wkNum, kgVal) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const prog = ensureUserWorkoutProgression(userId, meso);
  const wkKey = 'w' + wkNum;
  prog.schedule[wkKey] = prog.schedule[wkKey] || { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: '' };
  const num = parseFloat(String(kgVal).replace(',', '.'));
  prog.schedule[wkKey].weight = isNaN(num) ? '' : +num.toFixed(1);
  if (!isNaN(num) && num > 20 && num < 400) {
    const u = userById(userId);
    if (u) u.weight = +num.toFixed(1);
  }
  saveWeeklySchedule(userId, meso, prog.schedule);
  broadcastRealtime('schedule_update', { studentId: userId, meso, wkNum, weight: prog.schedule[wkKey].weight });
  toast(`⚖️ Peso da Semana ${wkNum} registrado no Mesociclo!`);
}

async function saveFullWeeklyScheduleBtn(userId) {
  const meso = S.wkMesocycle || 'Mesociclo 1';
  const prog = ensureUserWorkoutProgression(userId, meso);
  await saveWeeklySchedule(userId, meso, prog.schedule);
  broadcastRealtime('schedule_saved', { studentId: userId, meso });
  toast(`📅 Cronograma Semanal dos 4 Microciclos (${meso}) salvo com sucesso! ✅`);
}

function addQuickExerciseStudentModal(userId, did) {
  const ws = DB.workouts[userId] || [];
  const d = ws.find(x => x.id === did) || ws[0];
  if (!d) return;
  modal(`<h2>➕ Adicionar Exercício em ${esc(d.name)}</h2>
  <form onsubmit="saveQuickExerciseStudent(event,'${userId}','${d.id}')">
    <label>Escolher da Biblioteca Rápida (opcional)</label>
    <select onchange="const l=LIBRARY[this.value];if(l){this.form.name.value=l.name;this.form.group.value=l.group}">
      <option value="">— ou digite o nome abaixo —</option>
      ${LIBRARY.map((l, i) => `<option value="${i}">${esc(l.group)} · ${esc(l.name)}</option>`).join('')}
    </select>
    <label>Nome do exercício</label>
    <input name="name" required placeholder="Ex.: Elevação Pélvica na Máquina">
    <div class="grid">
      <div><label>Grupo muscular</label><input name="group" value="Geral" placeholder="Ex.: Glúteos"></div>
      <div><label>Séries</label><input name="sets" type="number" min="1" value="4" required></div>
      <div><label>Faixa de Reps</label><input name="reps" value="10-12" required></div>
      <div><label>Carga Inicial (kg)</label><input name="load" value="20 kg" inputmode="decimal"></div>
      <div><label>Descanso (s)</label><input name="rest" type="number" value="60"></div>
    </div>
    <label>Observação / Técnica (opcional)</label>
    <input name="notes" placeholder="Ex.: Segurar 1s no pico da contração">
    <button class="btn block" style="margin-top:12px">➕ Adicionar Exercício</button>
  </form>`);
}

function saveQuickExerciseStudent(e, userId, did) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const ws = DB.workouts[userId] || [];
  const d = ws.find(x => x.id === did) || ws[0];
  if (!d) return;
  const nameVal = typeof f.name === 'string' ? f.name : (f.name?.value || String(f.name || ''));
  const groupVal = typeof f.group === 'string' ? f.group : (f.group?.value || String(f.group || 'Geral'));
  const setsVal = typeof f.sets === 'object' ? f.sets?.value : f.sets;
  const repsVal = typeof f.reps === 'string' ? f.reps : (f.reps?.value || String(f.reps || '12'));
  const loadVal = typeof f.load === 'string' ? f.load : (f.load?.value || String(f.load || ''));
  const restVal = typeof f.rest === 'object' ? f.rest?.value : f.rest;
  const notesVal = typeof f.notes === 'string' ? f.notes : (f.notes?.value || String(f.notes || ''));
  d.exercises.push({
    id: uid(),
    name: nameVal.trim(),
    group: (groupVal || 'Geral').trim(),
    sets: +setsVal || 3,
    reps: (repsVal || '12').trim(),
    load: (loadVal || '').trim(),
    rest: +restVal || 60,
    notes: (notesVal || '').trim(),
    media: '',
  });
  closeModal();
  touched(userId);
  toast('Exercício adicionado à ficha em tempo real! 💪✅');
}

function openStudentProgressionModal(studentId) {
  S.wkTargetUid = studentId;
  const u = userById(studentId);
  if (!u) return;
  const html = renderStudentWorkoutModule(studentId, true);
  modal(`<div style="max-width:100%">${html}</div>`);
}

function renderStudentWorkoutModule(targetUserId = S.user?.id, isTrainerPreview = false) {
  const id = targetUserId || S.user.id;
  S.wkTargetUid = id;
  const u = userById(id) || S.user;
  const ws = DB.workouts[id] || [];
  const r = u?.report;

  if (!S.wkMesocycle) S.wkMesocycle = 'Mesociclo 1';
  if (!S.wkMicroWeek) S.wkMicroWeek = 3;
  if (!S.wkSubTab) S.wkSubTab = 'today';
  if (!S.wkDate) S.wkDate = day();
  if (!S.wkEvoFilter) S.wkEvoFilter = 'ALL';

  const meso = S.wkMesocycle;
  const wkNum = S.wkMicroWeek;
  const wkMeta = MICRO_WEEKS.find(w => w.num === wkNum) || MICRO_WEEKS[2];
  const subTab = S.wkSubTab;

  const reportBanner = `<div class="card" style="background:linear-gradient(135deg,#182a0c,#13191d);border-color:var(--gold)">
    <div class="row sp">
      <div>
        <h2 style="margin-bottom:4px">🤖 Gerador de Treino por Relatório de Objetivos</h2>
        <p class="mut">${r ? `Treino montado para o nível <b>${esc(r.level)}</b> com foco em <b>${esc(r.goal)}</b> (${r.daysPerWeek}x/semana).` : 'Responda o relatório sobre seu tempo de treino, nível, lesões/fraturas e objetivos para o app montar seu treino automaticamente!'}</p>
      </div>
      <div class="row">
        <button class="btn sm" onclick="openGoalReportModal('${id}')">📋 ${r ? 'Refazer Relatório / Ajustar Treino' : 'Responder Relatório Agora'}</button>
        ${!isTrainerPreview ? `<button class="btn sm ghost" onclick="go('cardio')">⏱️ Cárdio</button><button class="btn sm ghost" onclick="go('water')">💧 Água</button>` : ''}
      </div>
    </div>
  </div>`;

  if (!ws.length) {
    return `<h1>${isTrainerPreview ? `Treino & Cargas — ${esc(u.name)}` : 'Meu Treino & Progressão de Cargas'}</h1>
    ${reportBanner}
    <div class="card">
      <h2>📋 Responda seu Relatório de Objetivos para gerar seu treino</h2>
      <p class="mut" style="margin-bottom:10px">Preencha seus dados abaixo e o aplicativo vai criar sua ficha completa (Treino A, B, C, D...) adaptada para você na mesma hora:</p>
      ${goalReportFormHtml(id, true)}
    </div>`;
  }

  const prog = ensureUserWorkoutProgression(id, meso);
  const selId = (isTrainerPreview ? S.wkModalSplitId : S.param) || ws[0].id;
  const dIdx = Math.max(0, ws.findIndex(x => x.id === selId));
  const d = ws[dIdx] || ws[0];
  const splitLetter = getWorkoutSplitLetter(d, dIdx);
  const curWeekLogs = prog.logs['w' + wkNum] || {};

  // Cálculo de conclusão da ficha ativa na semana selecionada
  const totalEx = (d.exercises || []).length;
  const doneCount = (d.exercises || []).filter(x => curWeekLogs[x.id]?.done).length;
  const pctDone = totalEx > 0 ? Math.round((doneCount / totalEx) * 100) : 0;

  // Header principal + Seletor de Período (Mesociclo e Microciclo)
  const topHeaderHtml = `
    <!-- Topo Rápido e Limpo -->
    <div class="row sp" style="margin-bottom:8px;gap:8px">
      <div>
        <h1 style="margin:0;font-size:1.35rem;display:flex;align-items:center;gap:6px">
          <span>${isTrainerPreview ? `📊 ${esc(u.name.split(' ')[0])}` : '🏋️ Treino'}</span>
          <span class="realtime-badge" style="font-size:.65rem;padding:2px 7px" title="Sincronização em tempo real ativa"><span class="realtime-pulse"></span> Ao Vivo</span>
        </h1>
        <div class="mut" style="font-size:.76rem">${esc(meso)} · Semana ${wkNum} (${esc(wkMeta.sub)})</div>
      </div>
      <div class="row" style="gap:5px">
        <select onchange="setMesocycle(this.value)" style="height:32px;min-height:32px;padding:0 8px;font-size:.75rem;font-weight:700;border-radius:9px;background:#11161a;border-color:#26343e">
          ${MESOCYCLE_OPTIONS.map(([val, lbl]) => `<option value="${val}" ${meso === val ? 'selected' : ''}>${val.replace('Mesociclo ', 'Meso ')}</option>`).join('')}
        </select>
        <input type="date" value="${esc(S.wkDate)}" onchange="S.wkDate=this.value" style="height:32px;min-height:32px;padding:0 6px;font-size:.75rem;border-radius:9px;background:#11161a;border-color:#26343e;width:120px">
        ${!isTrainerPreview ? `<button class="btn sm ghost" style="padding:0 8px;min-height:32px" onclick="exportWorkoutModal('${id}')" title="Baixar / Imprimir Ficha">${ic('download')}</button>` : ''}
      </div>
    </div>

    <!-- Pílulas das 4 Semanas (Microciclos) em Linha Única -->
    <div class="wk-pills" style="margin-top:0;margin-bottom:8px">
      ${MICRO_WEEKS.map(w => `
        <button type="button" class="wk-pill ${wkNum === w.num ? 'on' : ''}" onclick="setMicroWeek(${w.num})" style="padding:6px 4px">
          <b style="font-size:.85rem">${w.title}</b>
          <small style="font-size:.65rem">${w.sub}</small>
        </button>
      `).join('')}
    </div>

    <!-- SUB-NAVEGAÇÃO INTERNA NA ABA TREINOS (3 VISÕES RÁPIDAS) -->
    <div class="workout-subnav" style="margin-bottom:10px">
      <button type="button" class="workout-subtab ${subTab === 'today' ? 'on' : ''}" onclick="setWorkoutSubTab('today')">
        ${ic('dumbbell')} <span>Treino do Dia</span>
      </button>
      <button type="button" class="workout-subtab ${subTab === 'schedule' ? 'on' : ''}" onclick="setWorkoutSubTab('schedule')">
        ${ic('calendar')} <span>Cronograma Semanal</span>
      </button>
      <button type="button" class="workout-subtab ${subTab === 'evolution' ? 'on' : ''}" onclick="setWorkoutSubTab('evolution')">
        ${ic('trending-up')} <span>Evolução de Cargas</span>
      </button>
      <button type="button" class="workout-subtab" onclick="openInbodyModule('${id}')" style="border-color:rgba(0,229,255,.35);color:#00E5FF">
        ${ic('activity')} <span>InBody & Dobras</span>
      </button>
    </div>
  `;

  // =========================================================================
  // VISÃO 1: TREINO DO DIA (CARDS DE EXERCÍCIO INTERATIVOS + SALVAR + WHATSAPP)
  // =========================================================================
  if (subTab === 'today') {
    const exercisesHtml = (d.exercises || []).map((x, idx) => {
      const cur = curWeekLogs[x.id] || { kg: '', reps: '', rir: 'No Alvo / RIR 1', note: '', done: false };
      const prev = getPreviousWeekEntry(prog, wkNum, x.id);
      const gainBadge = calcMonthProgressionBadge(prog, wkNum, x.id);
      const isDone = !!cur.done;

      return `<div class="load-ex-card ${isDone ? 'done' : ''}" id="ex-card-${x.id}">
        <!-- Cabeçalho do Exercício -->
        <div class="row sp" style="align-items:flex-start;gap:8px">
          <div style="flex:1">
            <div class="row" style="gap:6px;margin-bottom:3px">
              <span class="role-pill" style="font-size:.68rem;padding:1px 7px">Exercício ${idx + 1} · ${esc(x.group || 'Geral')}</span>
              <span id="prog-badge-${x.id}">
                ${gainBadge ? `<span class="prog-gain-badge ${gainBadge.cls}">📈 ${esc(gainBadge.text)}</span>` : ''}
              </span>
            </div>
            <b style="font-size:1.05rem;color:#fff;display:block">${esc(x.name)}</b>
            <div class="row" style="margin-top:3px;gap:8px;font-size:.8rem">
              <span class="gold">🎯 Meta: <b>${x.sets} séries × ${esc(x.reps)} reps</b></span>
              <span class="mut">·</span>
              <span class="mut">⏱️ Descanso: <b>${x.rest || 60}s</b></span>
              ${x.load ? `<span class="mut">· Ref. ficha: <b>${esc(x.load)}</b></span>` : ''}
            </div>
            ${x.notes ? `<div class="mut" style="font-size:.76rem;margin-top:3px">📝 Dica do Personal: ${esc(x.notes)}</div>` : ''}
          </div>

          <div class="row" style="gap:4px;align-items:center">
            <button type="button" class="ex-action-btn" onclick="exForm('${id}','${d.id}','${x.id}')" title="Editar exercício em tempo real">✏️ <span class="hide-xs">Editar</span></button>
            <button type="button" class="ex-action-btn del" onclick="delExConfirm('${id}','${d.id}','${x.id}')" title="Excluir exercício em tempo real">🗑️ <span class="hide-xs">Excluir</span></button>
            <button type="button" class="done-chk-btn ${isDone ? 'on' : ''}" onclick="toggleExerciseLoadDone('${id}','${d.id}','${x.id}')" title="${isDone ? 'Exercício concluído' : 'Marcar como concluído'}" aria-label="Marcar exercício como concluído">
              ✓
            </button>
          </div>
        </div>

        <!-- Referência Histórica da Semana Anterior + Botão Rápido "Repetir carga" -->
        <div class="prev-load-bar">
          <div>
            ${prev
              ? `🕘 <b>Última carga (Sem ${prev.week}):</b> <span class="gold" style="font-weight:700">${prev.kg} kg (${prev.reps || x.reps} reps)</span>`
              : `🕘 <b>Última carga:</b> <span class="mut">${wkNum === 1 ? 'Semana 1 (defina sua carga base hoje)' : 'Sem registro anterior (' + esc(x.load || 'livre') + ')'}</span>`}
          </div>
          <div class="row" style="gap:6px">
            ${prev ? `<button type="button" class="repeat-load-btn" onclick="repeatPrevWeekLoad('${id}','${d.id}','${x.id}')">⚡ Repetir carga (${prev.kg} kg)</button>` : (x.load ? `<button type="button" class="repeat-load-btn" onclick="repeatPrevWeekLoad('${id}','${d.id}','${x.id}')">⚡ Usar ${esc(x.load)}</button>` : '')}
            <button type="button" class="btn sm ghost" style="padding:2px 7px;min-height:22px;font-size:.7rem" onclick="askExInChat('${esc(x.name)}')">▶ Vídeo / Dúvida</button>
          </div>
        </div>

        <!-- Inputs de Registro Diário da Aluna: Carga Hoje (kg) c/ - e +, Reps Feitas c/ - e +, e Seletor de Esforço/RIR -->
        <div class="load-inputs-grid">
          <div>
            <label style="margin:0 0 3px;font-size:.72rem;font-weight:700;color:var(--gold)">🏋️‍♀️ Carga Hoje (kg)</label>
            <div class="step-ctrl">
              <button type="button" class="step-btn" onclick="stepExerciseValue('${id}','${d.id}','${x.id}','kg',-1)" aria-label="Diminuir carga">−</button>
              <input id="inp-kg-${x.id}" class="step-inp" type="number" step="0.5" min="0" inputmode="decimal" placeholder="0 kg" value="${cur.kg !== '' && cur.kg !== undefined ? cur.kg : ''}" oninput="updateExerciseLogField('${id}','${d.id}','${x.id}','kg',this.value,false)">
              <button type="button" class="step-btn" onclick="stepExerciseValue('${id}','${d.id}','${x.id}','kg',1)" aria-label="Aumentar carga">+</button>
            </div>
          </div>

          <div>
            <label style="margin:0 0 3px;font-size:.72rem;font-weight:700;color:#cbd5e1">🔢 Reps Feitas</label>
            <div class="step-ctrl">
              <button type="button" class="step-btn" onclick="stepExerciseValue('${id}','${d.id}','${x.id}','reps',-1)" aria-label="Diminuir repetições">−</button>
              <input id="inp-reps-${x.id}" class="step-inp" type="number" step="1" min="0" inputmode="numeric" placeholder="${esc(x.reps)}" value="${cur.reps !== '' && cur.reps !== undefined ? cur.reps : ''}" oninput="updateExerciseLogField('${id}','${d.id}','${x.id}','reps',this.value,false)">
              <button type="button" class="step-btn" onclick="stepExerciseValue('${id}','${d.id}','${x.id}','reps',1)" aria-label="Aumentar repetições">+</button>
            </div>
          </div>

          <div class="rir-col">
            <label style="margin:0 0 3px;font-size:.72rem;font-weight:700;color:#cbd5e1">🔥 Esforço / RIR</label>
            <select onchange="updateExerciseLogField('${id}','${d.id}','${x.id}','rir',this.value,false)" style="height:38px;min-height:38px;padding:0 8px;font-size:.78rem;background:#0c1013;border-color:#28343d">
              ${RIR_OPTIONS.map(([val, lbl]) => `<option value="${val}" ${cur.rir === val ? 'selected' : ''}>${lbl}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Campo opcional de observação rápida do exercício -->
        <div style="margin-top:7px">
          <input placeholder="💬 Observação rápida neste exercício (opcional: ex. subi 2kg na última série, banco no 3...)" value="${esc(cur.note || '')}" oninput="updateExerciseLogField('${id}','${d.id}','${x.id}','note',this.value,false)" style="min-height:32px;padding:5px 10px;font-size:.76rem;background:#0c1013;border-color:#222c34">
        </div>
      </div>`;
    }).join('');

    return `${topHeaderHtml}
      <!-- Seletor da Ficha de Treino (A, B, C, D...) & Progresso Integrado -->
      <div class="card" style="padding:10px 12px;margin-bottom:10px;border-color:rgba(143,255,0,.35)">
        <div class="row sp" style="margin-bottom:6px">
          <div class="row" style="gap:6px;overflow-x:auto;padding-bottom:2px">
            ${ws.map((x, i) => {
              const sp = getWorkoutSplitLetter(x, i);
              return `<button type="button" class="chip ${x.id === d.id ? 'on' : ''}" style="white-space:nowrap;padding:4px 12px;font-weight:700" onclick="selectWorkoutSplit('${x.id}',${isTrainerPreview})">
                Treino ${esc(sp)}
              </button>`;
            }).join('')}
          </div>
          <button type="button" class="btn sm ghost" style="padding:2px 8px;min-height:24px;font-size:.72rem" onclick="addQuickExerciseStudentModal('${id}','${d.id}')">➕ Exercício</button>
        </div>
        <div class="row sp" style="font-size:.78rem">
          <span style="font-weight:600;color:#fff">${esc(d.name)}</span>
          <span class="gold" style="font-weight:700">✓ ${doneCount}/${totalEx} (${pctDone}%)</span>
        </div>
        <div class="wk-progress-track" style="margin:4px 0 0">
          <div class="wk-progress-fill" style="width:${pctDone}%"></div>
        </div>
      </div>

      <!-- Lista de Cards de Exercícios Interativos -->
      ${exercisesHtml || `<div class="card" style="text-align:center;padding:24px 14px"><p class="mut" style="margin:0 0 10px">Nenhum exercício cadastrado para este treino.</p></div>`}

      <!-- Botão Rápido para Adicionar Exercício ao Treino em Tempo Real -->
      <button type="button" class="btn block ghost" style="margin:8px 0 14px;border-style:dashed;border-color:var(--gold);color:var(--gold);font-weight:700" onclick="exForm('${id}','${d.id}')">
        ➕ Adicionar Exercício ao ${esc(d.name)}
      </button>

      <!-- Observação Geral e Ações de Finalização (Salvar e WhatsApp) -->
      <div class="card" style="border-color:var(--gold);background:linear-gradient(145deg,#141e12,#12171b)">
        <label style="margin-top:0;font-weight:700;color:var(--gold)">📝 Sensação / Observação Geral do Treino de Hoje (opcional)</label>
        <textarea id="wkSessionNoteInp" rows="2" placeholder="Como você se sentiu hoje? (Ex.: Muita disposição, consegui progredir carga no agachamento e supino!)" oninput="S.wkSessionNote=this.value" style="margin-bottom:10px">${esc(S.wkSessionNote || '')}</textarea>

        <div class="grid2" style="gap:10px">
          <button type="button" class="btn block" style="min-height:46px;font-size:.95rem" onclick="saveCurrentWorkoutLoads('${id}','${d.id}')">
            ${ic('save')} Salvar Cargas do Treino
          </button>
          <button type="button" class="btn btn-wa-green block" style="min-height:46px;font-size:.95rem" onclick="sendWorkoutLoadsWhatsApp('${id}','${d.id}',false)">
            ${ic('share-2')} Enviar Cargas no WhatsApp
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // VISÃO 2: CRONOGRAMA SEMANAL (MICROCICLO SEG-DOM + PESO CORPORAL DA SEMANA)
  // =========================================================================
  if (subTab === 'schedule') {
    let totalPlannedWorkouts = 0;
    ['w1', 'w2', 'w3', 'w4'].forEach(k => {
      const daysArr = prog.schedule?.[k]?.days || [];
      daysArr.forEach(v => { if (['A', 'B', 'C', 'D', 'Cardio'].includes(v)) totalPlannedWorkouts++; });
    });
    const freqPct = Math.min(100, Math.round((totalPlannedWorkouts / 20) * 100));

    return `${topHeaderHtml}
      <div class="card" style="border-color:var(--gold)">
        <div class="row sp">
          <div>
            <h2 style="margin-bottom:2px">🗓️ Cronograma Semanal — 4 Microciclos (${esc(meso)})</h2>
            <p class="mut" style="font-size:.8rem">Toque nos dias de <b>Segunda a Domingo</b> para alternar o planejamento entre <b>Treino A, B, C, D, Cardio ou Descanso</b> e registre seu peso semanal:</p>
          </div>
          <button type="button" class="btn sm" onclick="saveFullWeeklyScheduleBtn('${id}')">${ic('save')} Salvar Cronograma</button>
        </div>
        <div class="row sp" style="margin-top:10px;font-size:.8rem">
          <span>🔥 Sessões planejadas/realizadas no Mesociclo: <b class="gold">${totalPlannedWorkouts} sessões</b></span>
          <span class="gold"><b>${freqPct}% da meta mensal</b></span>
        </div>
        <div class="wk-progress-track">
          <div class="wk-progress-fill" style="width:${freqPct}%"></div>
        </div>
      </div>

      ${MICRO_WEEKS.map(w => {
        const sc = prog.schedule?.[w.key] || { days: ['A', 'B', 'Desc', 'C', 'D', 'Cardio', 'Desc'], weight: '' };
        const isCurWk = wkNum === w.num;
        return `<div class="card" style="${isCurWk ? 'border-color:var(--gold);box-shadow:0 0 16px rgba(143,255,0,.12)' : ''}">
          <div class="row sp">
            <div>
              <span class="role-pill">${w.title} · ${w.sub}</span>
              ${isCurWk ? `<span class="fin-badge paid" style="margin-left:6px">Semana Ativa</span>` : ''}
              <p class="mut" style="font-size:.76rem;margin-top:4px">${esc(w.desc)}</p>
            </div>
            <div style="min-width:145px">
              <label style="margin:0 0 3px;font-size:.7rem">⚖️ Peso na ${w.title} (kg)</label>
              <input type="number" step="0.1" inputmode="decimal" placeholder="Ex.: 64.5" value="${sc.weight !== undefined && sc.weight !== null ? sc.weight : ''}" onchange="updateMicroWeekWeight('${id}',${w.num},this.value)" style="height:34px;min-height:34px;font-weight:700;text-align:center">
            </div>
          </div>

          <div class="micro-days-grid">
            ${WEEKDAY_LABELS.map((dLbl, dIdx) => {
              const val = sc.days?.[dIdx] || 'Desc';
              const btnCls = ['A', 'B', 'C', 'D'].includes(val) ? 'split' : (val === 'Cardio' ? 'cardio' : 'rest');
              const labelTxt = ['A', 'B', 'C', 'D'].includes(val) ? `Treino ${val}` : val;
              return `<div class="micro-day-box">
                <span class="d-lbl">${dLbl}</span>
                <button type="button" class="micro-day-btn ${btnCls}" onclick="cycleMicroScheduleDay('${id}',${w.num},${dIdx})">${esc(labelTxt)}</button>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    `;
  }

  // =========================================================================
  // VISÃO 3: EVOLUÇÃO DE CARGAS (MESOCICLO SEM 1 | SEM 2 | SEM 3 | SEM 4 | GANHO TOTAL)
  // =========================================================================
  const evoFilter = S.wkEvoFilter || 'ALL';
  let progressedExCount = 0;
  let bestGainKg = 0;
  let bestGainName = '—';
  const evoCards = [];

  ws.forEach((wDay, dIdx) => {
    const sp = getWorkoutSplitLetter(wDay, dIdx);
    if (evoFilter !== 'ALL' && evoFilter !== sp) return;

    (wDay.exercises || []).forEach(ex => {
      const w1 = prog.logs.w1?.[ex.id];
      const w2 = prog.logs.w2?.[ex.id];
      const w3 = prog.logs.w3?.[ex.id];
      const w4 = prog.logs.w4?.[ex.id];

      const vals = [w1, w2, w3, w4].map(item => (item && item.kg !== '' && item.kg !== undefined && item.kg !== null) ? parseFloat(item.kg) : null);
      const validVals = vals.filter(v => v !== null && !isNaN(v));
      const firstKg = validVals.length ? validVals[0] : null;
      const lastKg = validVals.length ? validVals[validVals.length - 1] : null;

      let diffKg = 0;
      let diffPct = 0;
      if (firstKg !== null && lastKg !== null && validVals.length >= 2) {
        diffKg = +(lastKg - firstKg).toFixed(1);
        diffPct = firstKg > 0 ? +(((lastKg - firstKg) / firstKg) * 100).toFixed(0) : 0;
        if (diffKg > 0) {
          progressedExCount++;
          if (diffKg > bestGainKg) {
            bestGainKg = diffKg;
            bestGainName = ex.name;
          }
        }
      }

      evoCards.push(`<div class="card" style="margin-bottom:10px">
        <div class="row sp">
          <div>
            <span class="role-pill" style="font-size:.68rem">Treino ${esc(sp)} · ${esc(ex.group || 'Geral')}</span>
            <b style="display:block;font-size:1.02rem;margin-top:3px">${esc(ex.name)}</b>
          </div>
          <span class="mut" style="font-size:.76rem">Meta: ${ex.sets}×${esc(ex.reps)}</span>
        </div>

        <div class="evo-weeks-grid">
          ${[1, 2, 3, 4].map(n => {
            const entry = prog.logs['w' + n]?.[ex.id];
            const has = entry && entry.kg !== '' && entry.kg !== undefined && entry.kg !== null;
            return `<div class="evo-wk-box" style="${wkNum === n ? 'border-color:var(--gold)' : ''}">
              <small>Sem ${n}</small>
              <b>${has ? `${entry.kg} kg` : '—'}</b>
              <span>${has ? `${entry.reps || ex.reps} reps` : 'Sem reg.'}</span>
            </div>`;
          }).join('')}

          <div class="evo-total-box">
            <small>Ganho no Mês</small>
            <b>${diffKg > 0 ? `+${diffKg} kg (+${diffPct}%)` : (validVals.length >= 2 && diffKg === 0 ? 'Manteve' : (diffKg < 0 ? `${diffKg} kg` : 'Em curso'))}</b>
            <span style="font-size:.68rem;color:#d6e0e7;display:block">${firstKg !== null && lastKg !== null ? `${firstKg}kg → ${lastKg}kg` : 'Registre + semanas'}</span>
          </div>
        </div>
      </div>`);
    });
  });

  const savedSessions = prog.sessionHistory || [];

  return `${topHeaderHtml}
    <!-- Resumo Geral da Evolução no Mesociclo -->
    <div class="grid" style="margin-bottom:12px">
      <div class="fin-stat ok">
        <b>${progressedExCount}</b>
        <span>📈 Exercícios com aumento de carga</span>
      </div>
      <div class="fin-stat">
        <b class="gold">${bestGainKg > 0 ? `+${bestGainKg} kg` : '—'}</b>
        <span>🏆 Maior ganho (${esc(bestGainName)})</span>
      </div>
      <div class="fin-stat">
        <b>${savedSessions.length}</b>
        <span>💾 Sessões salvas no ${esc(meso)}</span>
      </div>
    </div>

    <!-- Filtro por Treino (Todos, A, B, C, D) -->
    <div class="row" style="margin-bottom:10px;gap:6px;overflow-x:auto">
      <button type="button" class="chip ${evoFilter === 'ALL' ? 'on' : ''}" onclick="setWorkoutEvoFilter('ALL')">Todos os Treinos</button>
      ${ws.map((wDay, i) => {
        const sp = getWorkoutSplitLetter(wDay, i);
        return `<button type="button" class="chip ${evoFilter === sp ? 'on' : ''}" onclick="setWorkoutEvoFilter('${sp}')">Treino ${esc(sp)}</button>`;
      }).join('')}
    </div>

    <!-- Tabela/Cards Comparativos Lado a Lado (Sem 1 | Sem 2 | Sem 3 | Sem 4 | Ganho Total) -->
    ${evoCards.join('')}

    <!-- Histórico Cronológico de Sessões Salvas -->
    <div class="card" style="margin-top:14px">
      <h2>📜 Histórico de Cargas Salvas (${esc(meso)})</h2>
      ${savedSessions.map(s => `
        <div class="msg" style="margin-bottom:8px">
          <div class="row sp">
            <b>📅 ${fmtDate(s.date)} — ${esc(s.workout_name || ('Treino ' + s.workout_split))}</b>
            <span class="role-pill">Semana ${s.week}</span>
          </div>
          <div class="mut" style="font-size:.78rem;margin-top:4px">
            ${(s.items || []).map(it => `<span style="display:inline-block;margin-right:10px">• <b>${esc(it.name)}:</b> <span class="gold">${it.kg}kg × ${it.reps}</span></span>`).join('')}
          </div>
          ${s.note ? `<div class="mut" style="font-size:.75rem;margin-top:3px">💬 Obs: ${esc(s.note)}</div>` : ''}
        </div>
      `).join('') || '<p class="mut">Nenhuma sessão salva ainda neste Mesociclo. Vá em "Treino do Dia" e toque em "Salvar Cargas do Treino".</p>'}
    </div>
  `;
}
function setCheckinSilent() { let c = my('checkins').find(c => c.date === day()); if (!c) { c = { id: uid(), uid: S.user.id, date: day() }; DB.checkins.push(c); } c.trained = 'sim'; }
const addWater = ml => { const before = waterToday(S.user.id), goal = waterGoal(curWeight(S.user.id)); DB.water.push({ id: uid(), uid: S.user.id, date: day(), ml }); save(); render(); if (before < goal && before + ml >= goal) toast('Meta batida! 🏆💧'); };
const undoWater = () => { const i = DB.water.map(w => w.uid === S.user.id && w.date === day()).lastIndexOf(true); if (i >= 0) { DB.water.splice(i, 1); save(); render(); } };
const setWeight = kg => { if (!(kg > 20 && kg < 400)) return toast('Peso inválido'); DB.weights = DB.weights.filter(w => !(w.uid === S.user.id && w.date === day())); DB.weights.push({ id: uid(), uid: S.user.id, date: day(), kg }); S.user.weight = kg; save(); toast(`Meta recalculada: ${waterGoal(kg)} ml 💧`); render(); };
const setPhoto = f => { if (!f) return; const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 160; c.getContext('2d').drawImage(i, 0, 0, 160, 160); S.user.photo = c.toDataURL('image/jpeg', .8); save(); render(); }; i.src = r.result; }; r.readAsDataURL(f); };
const setSet = (k, v) => { DB.settings[S.user.id] = { ...DB.settings[S.user.id], [k]: v }; save(); toast('Lembrete salvo ✅'); };
const askNotif = async () => { if (!('Notification' in window)) return toast('Navegador sem suporte.'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notificações ativadas ✅' : 'Permissão negada'); };

/* --- cárdio --- */
const METS = { 'Esteira': 8, 'Bike': 7, 'Corrida': 9.8, 'Pular corda': 11, 'Elíptico': 5 };
const cardio = { type: 'Esteira', interval: false, work: 30, rest: 30, rounds: 8, running: false, elapsed: 0, start: 0 };
function cardioReset() { Object.assign(cardio, { running: false, elapsed: 0, start: 0, lastPhase: null }); }
function cardioToggle() { if (cardio.running) { cardio.elapsed += Date.now() - cardio.start; cardio.running = false; } else { cardio.start = Date.now(); cardio.running = true; } cardioTick(); }
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); setTimeout(() => o.stop(), 350); } catch { } navigator.vibrate?.([300, 150, 300]); }
function cardioTick() {
  clearInterval(render.tick); const paint = () => {
    if (S.view !== 'cardio' || !$('#clock')) return clearInterval(render.tick);
    const ms = cardio.elapsed + (cardio.running ? Date.now() - cardio.start : 0), s = Math.floor(ms / 1000); let show = s, ph = cardio.running ? 'Em andamento' : s ? 'Pausado' : 'Pronto';
    if (cardio.interval) {
      const cyc = cardio.work + cardio.rest, total = cyc * cardio.rounds;
      if (s >= total) { show = 0; ph = '🏁 Finalizado'; if (cardio.running) { cardio.elapsed = total * 1000; cardio.running = false; beep(); } }
      else { const r = Math.floor(s / cyc), p = s % cyc, work = p < cardio.work; show = (work ? cardio.work : cyc) - p; ph = `Round ${r + 1}/${cardio.rounds} · ${work ? '🔥 FORTE' : '😮‍💨 LEVE'}`; const key = r + (work ? 'w' : 'r'); if (cardio.running && cardio.lastPhase && cardio.lastPhase !== key) beep(); cardio.lastPhase = key; }
    }
    $('#clock').textContent = String(Math.floor(show / 60)).padStart(2, '0') + ':' + String(show % 60).padStart(2, '0'); $('#phase').textContent = ph;
    $('#cgo').innerHTML = cardio.running ? 'Pausar' : (cardio.elapsed ? 'Retomar' : 'Iniciar'); $('#ckcal').textContent = `≈ ${cardioKcal(s)} kcal`;
  }; paint(); render.tick = setInterval(paint, 250);
}
const cardioKcal = sec => Math.round(METS[cardio.type] * curWeight(S.user.id) * sec / 3600);
function cardioSave() { const ms = cardio.elapsed + (cardio.running ? Date.now() - cardio.start : 0), sec = Math.floor(ms / 1000); if (sec < 10) return toast('Treine um pouco mais antes de salvar.'); DB.cardio.push({ id: uid(), uid: S.user.id, date: day(), type: cardio.type, sec, kcal: cardioKcal(sec) }); save(); cardioReset(); toast('Cárdio salvo ✅'); render(); }

/* --- lembretes --- */
function startReminders() {
  clearInterval(startReminders.t); let lastW = Date.now();
  startReminders.t = setInterval(() => {
    const s = DB.settings[S.user?.id]; if (!s) return; const n = new Date(), hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    if (s.train && s.train === hm && startReminders.last !== day() + hm) { startReminders.last = day() + hm; toast('⏰ Hora do treino!'); push(BRAND(), 'Hora do treino! 💪'); }
    if (s.waterH > 0 && Date.now() - lastW > s.waterH * 36e5) { lastW = Date.now(); toast('💧 Hora de beber água!'); push(BRAND(), 'Beba água! 💧'); }
  }, 30000);
}

/* ======================= CHAT AUTOMATIZADO DE TREINO (BOLINHA FLUTUANTE) ======================= */
const EX_GUIDE = {
  'supino reto': ['Peito', 'Deite no banco reto, retraia as escápulas, pés firmes no chão e desça a barra/halteres de forma controlada até a linha do peito.'],
  'supino inclinado': ['Peito superior', 'No banco inclinado (30° a 45°), desça o peso controlando até a parte alta do peitoral e empurre sem travar os cotovelos.'],
  'crucifixo': ['Peito', 'Abra os braços com leve flexão nos cotovelos alongando o peitoral e feche contraindo no topo.'],
  'flexao de braco': ['Peito e Tríceps', 'Mantenha o abdômen contraído, corpo alinhado em prancha e desça o peito próximo ao solo.'],
  'puxada frontal': ['Costas (Dorsal)', 'Incline levemente o tronco, estufe o peito e puxe a barra em direção à parte superior do peitoral, fechando as escápulas.'],
  'remada curvada': ['Costas', 'Coluna neutra, tronco inclinado à frente, puxe a barra ou halteres em direção ao umbigo apertando as costas.'],
  'remada baixa': ['Costas', 'Sentado com coluna ereta e peito aberto, puxe o triângulo até o abdômen aproximando as escápulas.'],
  'barra fixa': ['Costas e Bíceps', 'Segure na barra e puxe o corpo até o queixo passar da altura da barra, controlando a descida.'],
  'agachamento livre': ['Pernas e Glúteos', 'Pés na largura dos ombros, coluna alinhada e joelhos acompanhando a ponta dos pés ao descer.'],
  'leg press 45': ['Pernas (Quadríceps/Glúteos)', 'Mantenha lombar e quadril colados no banco, desça a plataforma em ~90° e empurre pelos calcanhares sem hiperestender os joelhos.'],
  'cadeira extensora': ['Quadríceps', 'Ajuste o encosto, estenda os joelhos contraindo a parte frontal da coxa no topo e desça devagar.'],
  'mesa flexora': ['Posterior de coxa', 'Mantenha o quadril apoiado no banco e flexione os joelhos trazendo o rolo em direção aos glúteos.'],
  'afundo': ['Pernas e Glúteos', 'Dê um passo à frente e flexione ambos os joelhos a ~90°, mantendo o tronco firme e equilibrado.'],
  'stiff': ['Posterior de coxa e Glúteos', 'Joelhos semi-flexionados, projete o quadril para trás mantendo a coluna reta e a barra próxima às pernas.'],
  'elevacao pelvica': ['Glúteos', 'Apoie a parte superior das costas no banco, suba o quadril contraindo forte os glúteos no topo por 1 segundo.'],
  'panturrilha em pe': ['Panturrilhas', 'Alongue bem o calcanhar na descida e suba na ponta dos pés até a contração máxima.'],
  'desenvolvimento com halteres': ['Ombros', 'Sentado ou em pé, empurre os halteres acima da cabeça sem bater no topo e desça até a linha das orelhas.'],
  'elevacao lateral': ['Ombros (Lateral)', 'Com leve flexão nos cotovelos, eleve os halteres lateralmente até a altura dos ombros sem balançar o tronco.'],
  'rosca direta': ['Bíceps', 'Cotovelos fixos ao lado do tronco, suba a barra/halteres contraindo o bíceps e controle a descida.'],
  'rosca martelo': ['Bíceps e Antebraço', 'Com pegada neutra (palmas voltadas uma para a outra), flexione os cotovelos sem jogar o ombro.'],
  'triceps corda': ['Tríceps', 'Cotovelos colados ao corpo, estenda o antebraço abrindo a corda no final do movimento.'],
  'triceps testa': ['Tríceps', 'Deitado, mantenha os braços apontados para o teto e flexione apenas os cotovelos descendo em direção à testa.'],
  'abdominal supra': ['Abdômen', 'Eleve o tronco superior soltando o ar e contraindo o abdômen, sem puxar o pescoço com as mãos.'],
  'prancha': ['Core / Abdômen', 'Apoie antebraços e pontas dos pés, mantendo o corpo reto e o abdômen contraído durante todo o tempo.'],
  'abdominal infra': ['Abdômen inferior', 'Mantenha a lombar apoiada e eleve as pernas/quadril de forma controlada contraindo o abdômen.'],
};

const ytExerciseUrl = name => `https://www.youtube.com/results?search_query=${encodeURIComponent('como fazer ' + name + ' execução correta academia')}`;

function getStudentWorkoutExercises() {
  if (!S.user) return [];
  const ws = DB.workouts[S.user.id] || [];
  if (!ws.length) return [];
  const activeDay = (S.view === 'workout' && S.param && ws.find(x => x.id === S.param)) || ws[0];
  return { dayName: activeDay.name, list: activeDay.exercises || [], allDays: ws };
}

function findStudentExDetails(exName) {
  if (!S.user) return null;
  const n = normStr(exName);
  const ws = DB.workouts[S.user.id] || [];
  for (const d of ws) {
    for (const x of (d.exercises || [])) {
      if (normStr(x.name).includes(n) || n.includes(normStr(x.name))) {
        return { dayName: d.name, ex: x };
      }
    }
  }
  return null;
}

function initChatIfNeeded() {
  if (S.chatMsgs && S.chatMsgs.uid === S.user?.id) return;
  const firstName = S.user?.name?.split(' ')[0] || 'Aluno(a)';
  S.chatMsgs = [
    {
      from: 'bot',
      html: `Olá, <b>${esc(firstName)}</b>! 🤖💪 Sou o assistente automático do <b>PersonalHUB</b>.<br><br>Ficou com dúvida no treino? Digite <b>"Que exercício é esse?"</b> ou o <b>nome do exercício</b> (ex.: <i>Supino reto</i>, <i>Agachamento</i>, <i>Stiff</i>) que eu te mando o link do vídeo no <b>YouTube</b> na hora!`
    }
  ];
  S.chatMsgs.uid = S.user?.id;
}

function toggleChatBot(forceOpen) {
  initChatIfNeeded();
  S.chatOpen = typeof forceOpen === 'boolean' ? forceOpen : !S.chatOpen;
  renderChatBot();
  if (S.chatOpen) {
    setTimeout(() => {
      const b = $('#chatBody'); if (b) b.scrollTop = b.scrollHeight;
      $('#chatInp')?.focus();
    }, 30);
  }
}

function askExInChat(exName) {
  initChatIfNeeded();
  S.chatOpen = true;
  pushUserAndReply(`Que exercício é esse: ${exName}?`);
}

function quickChatAsk(txt) {
  initChatIfNeeded();
  pushUserAndReply(txt);
}

function sendChatMsg(e) {
  e.preventDefault();
  const inp = $('#chatInp');
  const txt = (inp?.value || '').trim();
  if (!txt) return;
  inp.value = '';
  pushUserAndReply(txt);
}

function pushUserAndReply(txt) {
  initChatIfNeeded();
  S.chatMsgs.push({ from: 'usr', html: esc(txt) });
  const replyHtml = buildBotReply(txt);
  S.chatMsgs.push({ from: 'bot', html: replyHtml });
  renderChatBot();
  setTimeout(() => {
    const b = $('#chatBody'); if (b) b.scrollTop = b.scrollHeight;
  }, 20);
}

function buildBotReply(rawText) {
  const n = normStr(rawText);

  // Limpa expressões comuns de pergunta para extrair o nome do exercício, se houver
  const cleaned = n
    .replace(/\b(que|qual|como|faz|fazer|executar|execucao|exercicio|esse|este|isso|seria|o|a|os|as|do|da|de|no|na|um|uma|me|manda|mandar|mostra|mostrar|video|link|youtube|duvida|sobre|explica|ai|por favor|pfv|ola|oi|bom dia|boa tarde|boa noite)\b/g, ' ')
    .replace(/[?!.,:;'"()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1) Se o aluno perguntou apenas "que exercício é esse?" (sem especificar o nome na frase)
  if (!cleaned || cleaned.length < 2) {
    const wk = getStudentWorkoutExercises();
    if (wk.list && wk.list.length) {
      return `Vi que você está com o <b>${esc(wk.dayName)}</b> na sua ficha! 📋<br>Aqui estão os links do <b>YouTube</b> de cada exercício do seu treino:<br>` +
        wk.list.map(x => `<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08)">
          <b>🏋️ ${esc(x.name)}</b> <span class="mut">(${x.sets}x${esc(x.reps)} · ${esc(x.load || '—')})</span><br>
          <a class="yt-btn" target="_blank" rel="noopener" href="${ytExerciseUrl(x.name)}">▶ Ver no YouTube: ${esc(x.name)}</a>
        </div>`).join('') +
        `<div class="mut" style="margin-top:8px;font-size:.78rem">💡 Ou digite o nome de qualquer outro exercício abaixo!</div>`;
    }
    return `Me diga o <b>nome do exercício</b> que você está em dúvida (por exemplo: <b>Supino reto</b>, <b>Agachamento livre</b>, <b>Puxada frontal</b>, <b>Stiff</b>) ou toque em um dos botões rápidos abaixo que eu já te mando o vídeo no YouTube! 👇`;
  }

  // 2) Tenta casar com os exercícios da ficha do aluno, com a biblioteca ou com o guia
  let matchedName = null;
  let guide = null;

  // Procura na ficha do aluno primeiro
  const studentMatch = findStudentExDetails(cleaned);
  if (studentMatch) {
    matchedName = studentMatch.ex.name;
  }

  // Procura no guia de dicas e biblioteca
  for (const [k, v] of Object.entries(EX_GUIDE)) {
    if (k.includes(cleaned) || cleaned.includes(k)) {
      guide = v;
      if (!matchedName) {
        const libItem = LIBRARY.find(l => normStr(l.name) === k);
        matchedName = libItem ? libItem.name : k.charAt(0).toUpperCase() + k.slice(1);
      }
      break;
    }
  }

  if (!matchedName) {
    const libItem = LIBRARY.find(l => normStr(l.name).includes(cleaned) || cleaned.includes(normStr(l.name)));
    if (libItem) matchedName = libItem.name;
  }

  // Se for qualquer outro exercício digitado pelo aluno (ex.: "Agachamento búlgaro", "Hack machine", "Rosca scott"), usa o nome digitado!
  const displayTitle = matchedName || rawText
    .replace(/^(que|qual)\s+(exercicio|exercício)\s+(e|é)\s+(esse|este|o|a)?\s*[:?-]?\s*/i, '')
    .replace(/^(como\s+faz(er)?\s+(o|a)?\s*)/i, '')
    .replace(/[?!]+$/g, '')
    .trim();

  const finalName = displayTitle || rawText.trim();
  const ytUrl = ytExerciseUrl(finalName);
  const stEx = studentMatch?.ex;

  return `<div>
    <b>🏋️ ${esc(finalName)}</b>
    ${guide ? `<div style="margin-top:4px"><span class="role-pill">🎯 ${esc(guide[0])}</span></div><p style="margin-top:6px;font-size:.83rem;color:#d6e0e7">${esc(guide[1])}</p>` : `<p class="mut" style="margin-top:4px;font-size:.82rem">Confira abaixo o vídeo demonstrativo com a postura e execução correta deste exercício:</p>`}
    ${stEx ? `<div style="margin-top:6px;padding:6px 8px;background:#10161a;border-radius:8px;font-size:.8rem">📋 <b>Na sua ficha (${esc(studentMatch.dayName)}):</b> ${stEx.sets}x${esc(stEx.reps)} · Carga: ${esc(stEx.load || '—')} · Descanso: ${stEx.rest}s</div>` : ''}
    ${stEx?.media ? `<div style="margin-top:6px"><a class="gold" target="_blank" rel="noopener" href="${esc(stEx.media)}">▶ Vídeo anexado pelo seu personal</a></div>` : ''}
    <a class="yt-btn" target="_blank" rel="noopener" href="${ytUrl}">▶ Assistir no YouTube: ${esc(finalName)}</a>
  </div>`;
}

function renderChatBot() {
  const box = $('#chatbot');
  if (!box) return;
  if (!S.user) { box.innerHTML = ''; return; }
  initChatIfNeeded();

  const wk = getStudentWorkoutExercises();
  const exChips = (wk.list && wk.list.length)
    ? wk.list.map(x => x.name)
    : ['Supino reto', 'Agachamento livre', 'Puxada frontal', 'Stiff', 'Elevação pélvica'];

  box.innerHTML = `
    ${S.chatOpen ? `<div class="chat-win fade" role="dialog" aria-label="Chat de dúvidas de treino">
      <div class="chat-head">
        <div class="row" style="gap:9px">
          <div class="avatar" style="width:36px;height:36px;font-size:1.1rem">🤖</div>
          <div>
            <b style="font-size:.95rem;display:block;line-height:1.1">Dúvidas do Treino</b>
            <span class="mut" style="font-size:.73rem">Assistente automático · Links do YouTube</span>
          </div>
        </div>
        <button type="button" class="btn sm ghost" style="padding:4px 9px;min-height:30px" onclick="toggleChatBot(false)" aria-label="Fechar chat">✕</button>
      </div>
      <div class="chat-body" id="chatBody">
        ${S.chatMsgs.map(m => `<div class="chat-bub ${m.from}">${m.html}</div>`).join('')}
      </div>
      <div class="chat-chips">
        <button type="button" onclick="quickChatAsk('Que exercício é esse?')">❓ Que exercício é esse?</button>
        ${exChips.map(name => `<button type="button" onclick="quickChatAsk('Que exercício é esse: ${esc(name)}?')">🏋️ ${esc(name)}</button>`).join('')}
      </div>
      <form class="chat-foot" onsubmit="sendChatMsg(event)">
        <input id="chatInp" placeholder="Ex.: Que exercício é esse? ou Supino..." autocomplete="off">
        <button class="btn sm" type="submit" style="padding:0 14px">Enviar</button>
      </form>
    </div>` : ''}
    <button type="button" class="chat-fab" onclick="toggleChatBot()" title="Dúvidas de exercícios? Abra o chat!" aria-label="Abrir chat de dúvidas de treino">
      ${S.chatOpen ? '✕' : '💬'}
      ${!S.chatOpen ? '<span class="chat-badge">Ajuda</span>' : ''}
    </button>
  `;
}

/* ======================= SINCRONIZAÇÃO ENTRE APARELHOS & BACKUP ======================= */
function openSyncModal() {
  const isCloud = Cloud.enabled;
  const studentCount = (DB.users || []).filter(u => u.role === 'student').length;
  const postCount = (DB.posts || []).length;
  
  modal(`<h2>🔄 Sincronizar Celular e Computador</h2>
  <p class="mut" style="margin-bottom:10px;font-size:.82rem">Mantenha todos os alunos cadastrados no computador disponíveis no seu celular (e vice-versa):</p>

  <!-- Opção 1: Arquivo JSON (Mais Rápido e Completo) -->
  <div class="card" style="margin-bottom:8px">
    <b class="gold" style="font-size:.88rem">📁 1. Transferência por Arquivo (Mais Fácil e Seguro)</b>
    <p class="mut" style="margin-top:3px;font-size:.78rem">Exporte no PC e envie pelo WhatsApp para si mesmo. No celular, toque em "Carregar Dados" e selecione o arquivo. Atualmente você tem <b>${studentCount} alunos</b> e <b>${postCount} posts</b>.</p>
    <div class="row" style="margin-top:8px;gap:6px">
      <button class="btn sm" onclick="exportSyncFile()">${ic('download')}1. Baixar Dados (.json)</button>
      <label class="btn sm ghost" style="margin:0;cursor:pointer">
        ${ic('upload')}2. Carregar Dados
        <input type="file" accept=".json,application/json,text/plain" hidden onchange="importSyncFile(this)">
      </label>
    </div>
  </div>

  <!-- Opção 2: Copiar/Colar Texto -->
  <div class="card" style="margin-bottom:8px">
    <b class="gold" style="font-size:.88rem">📋 2. Transferência por Texto / WhatsApp</b>
    <p class="mut" style="margin-top:3px;font-size:.78rem">Copie o texto dos dados no PC, envie para seu WhatsApp e cole abaixo no celular:</p>
    <div class="row" style="margin-top:6px">
      <button class="btn sm ghost" onclick="copySyncDataText()">${ic('copy')}Copiar Dados (Texto)</button>
    </div>
    <form onsubmit="applySyncTextForm(event)" style="margin-top:8px">
      <textarea id="syncPasteBox" rows="2" placeholder="Cole aqui o texto dos dados copiado do outro aparelho..." style="font-size:.78rem;min-height:50px"></textarea>
      <button class="btn sm" style="margin-top:6px" type="submit">${ic('check')}Aplicar Dados Copiados</button>
    </form>
  </div>

  <!-- Opção 3: Supabase em Tempo Real -->
  <div class="card">
    <div class="row sp">
      <div>
        <b class="gold" style="font-size:.88rem">☁️ 3. Nuvem em Tempo Real (Supabase)</b>
        <p class="mut" style="margin-top:2px;font-size:.78rem">Sincronização 100% automática entre PC e Celular sem precisar exportar arquivos.</p>
      </div>
      <span class="sync-badge ${isCloud ? 'online' : 'local'}">${isCloud ? 'Conectado' : 'Modo Local'}</span>
    </div>
    <div style="margin-top:8px">
      ${isCloud ? `
        <div class="row">
          <button class="btn sm" onclick="Cloud.refresh();toast('Dados atualizados da nuvem! ☁️')">${ic('refresh-cw')}Sincronizar Agora</button>
          <button class="btn sm danger" onclick="disconnectSupabase()">Desconectar</button>
        </div>
      ` : `
        <button class="btn sm ghost" onclick="openSupabaseModal()">${ic('database')}Conectar Supabase (Grátis)</button>
      `}
    </div>
  </div>

  <button class="btn block" style="margin-top:10px" onclick="closeModal()">Fechar</button>`);
}

function applySyncData(imported) {
  if (!imported || typeof imported !== 'object') {
    throw new Error('Conteúdo inválido.');
  }
  const users = Array.isArray(imported.users) ? imported.users : null;
  if (!users || !users.length) {
    throw new Error('Dados inválidos: nenhum usuário encontrado.');
  }

  // Mescla de usuários preservando dados existentes
  const curUsers = DB.users || [];
  const byId = new Map(curUsers.map(u => [u.id, u]));
  const byEmail = new Map(curUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));

  users.forEach(u => {
    const existing = byId.get(u.id) || (u.email && byEmail.get(u.email.toLowerCase()));
    if (existing) {
      Object.assign(existing, u);
    } else {
      curUsers.push(u);
      byId.set(u.id, u);
      if (u.email) byEmail.set(u.email.toLowerCase(), u);
    }
  });
  DB.users = curUsers;

  // Mescla treinos
  if (imported.workouts && typeof imported.workouts === 'object') {
    DB.workouts = DB.workouts || {};
    Object.entries(imported.workouts).forEach(([sid, w]) => {
      DB.workouts[sid] = w;
    });
  }

  // Mescla posts sem duplicar
  if (Array.isArray(imported.posts)) {
    DB.posts = DB.posts || [];
    const pSet = new Set(DB.posts.map(p => p.id));
    imported.posts.forEach(p => {
      if (!pSet.has(p.id)) {
        DB.posts.unshift(p);
        pSet.add(p.id);
      }
    });
  }

  // Mescla pesos, água, logs, cárdio, checkins, mensagens e modelos
  ['weights', 'logs', 'water', 'cardio', 'checkins', 'messages', 'templates'].forEach(k => {
    if (Array.isArray(imported[k])) {
      DB[k] = DB[k] || [];
      const set = new Set(DB[k].map(x => x.id));
      imported[k].forEach(x => {
        if (!set.has(x.id)) {
          DB[k].push(x);
          set.add(x.id);
        }
      });
    }
  });

  if (imported.settings && typeof imported.settings === 'object') {
    DB.settings = { ...(DB.settings || {}), ...imported.settings };
  }

  DB.users.forEach(u => { if (u.role !== 'ceo') ensureUserFinance(u); });
  if (S.user) S.user = userById(S.user.id) || S.user;

  save();
  render();
  const stCount = DB.users.filter(u => u.role === 'student').length;
  const trCount = DB.users.filter(u => u.role === 'trainer').length;
  toast(`Sincronização realizada! 🎉 (${trCount} professores e ${stCount} alunos salvos)`);
}

function exportSyncFile() {
  const data = JSON.stringify(DB, null, 2);
  const now = day().replace(/-/g, '');
  downloadFile(`personalhub-backup-${now}.json`, data, 'application/json;charset=utf-8');
  toast('Arquivo de sincronização exportado! Envie para o celular ✅');
}

function importSyncFile(input) {
  const f = input.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      applySyncData(parsed);
      closeModal();
    } catch (err) {
      toast('Erro ao importar: ' + (err.message || 'arquivo inválido.'));
    }
  };
  r.readAsText(f);
}

function copySyncDataText() {
  try {
    const cleanDb = {
      version: 2,
      exportedAt: new Date().toISOString(),
      users: DB.users || [],
      workouts: DB.workouts || {},
      posts: (DB.posts || []).map(p => ({ ...p, image: (p.image && p.image.length > 4000) ? '' : p.image })),
      weights: DB.weights || [],
      logs: DB.logs || [],
      messages: DB.messages || [],
      settings: DB.settings || {},
    };
    const jsonStr = JSON.stringify(cleanDb);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonStr).then(() => {
        toast('Dados copiados! Cole no WhatsApp e envie para o celular 📲');
      }).catch(() => {
        prompt('Copie o texto abaixo e envie para o celular:', jsonStr);
      });
    } else {
      prompt('Copie o texto abaixo e envie para o celular:', jsonStr);
    }
  } catch (err) {
    toast('Use a opção 1 (Baixar Dados .json), que é mais recomendada.');
  }
}

function applySyncTextForm(e) {
  e.preventDefault();
  const raw = ($('#syncPasteBox')?.value || '').trim();
  if (!raw) return toast('Cole o texto dos dados antes de aplicar.');
  try {
    let jsonStr = raw;
    if (raw.startsWith('ey') || /^[A-Za-z0-9+/=]+$/.test(raw)) {
      try { jsonStr = decodeURIComponent(escape(atob(raw))); } catch { }
    }
    const parsed = JSON.parse(jsonStr);
    applySyncData(parsed);
    closeModal();
  } catch (err) {
    toast('Texto inválido. Verifique se copiou todo o conteúdo.');
  }
}

function openSupabaseModal() {
  const cfg = Cloud.getConfig();
  modal(`<h2>☁️ Configurar Banco em Nuvem (Supabase)</h2>
  <p class="mut" style="margin-bottom:12px">Ao conectar o Supabase, tudo o que você cadastrar no computador aparece <b>automaticamente e na hora</b> no celular (e vice-versa), sem precisar exportar arquivos!</p>
  <form onsubmit="saveSupabaseSettings(event)">
    <label>Supabase Project URL</label>
    <input name="url" placeholder="https://seu-projeto.supabase.co" value="${esc(cfg.url)}" required>
    <label>Supabase Anon Public Key</label>
    <input name="key" type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." value="${esc(cfg.key)}" required>
    <p class="mut" style="font-size:.82rem;margin-top:6px">Encontre essas chaves no painel do seu projeto Supabase em <b>Project Settings → API</b>.</p>
    <div class="row" style="margin-top:14px">
      <button class="btn block" style="flex:1">${ic('check')}Salvar e Conectar Nuvem</button>
      <button class="btn ghost" type="button" onclick="closeModal()">Cancelar</button>
    </div>
  </form>`);
}

async function saveSupabaseSettings(e) {
  e.preventDefault();
  const url = e.target.url.value.trim();
  const key = e.target.key.value.trim();
  try {
    toast('Conectando ao Supabase...');
    await Cloud.connect(url, key);
    closeModal();
    render();
    toast('Nuvem conectada com sucesso! Todos os dados agora estão sincronizados ☁️🎉');
  } catch (err) {
    toast('Erro ao conectar: ' + err.message);
  }
}

async function disconnectSupabase() {
  if (!confirm('Desconectar da nuvem Supabase? O aplicativo continuará funcionando no modo local.')) return;
  await Cloud.disconnect();
  closeModal();
  render();
  toast('Supabase desconectado. Modo local ativado.');
}

/* ---------- Boot ---------- */
(async () => {
  try {
    let u = null;
    if (Cloud.enabled) {
      try {
        u = await Cloud.restore();
        await ensureAllFinancesAndMigrate();
      } catch (e) { console.error('Cloud restore error:', e); }
    } else {
      await load();
      const sid = sessionStorage.getItem('personalhub_sess') || localStorage.getItem('personalhub_sess');
      u = sid && userById(sid);
    }
    if (u && u.active) {
      S.user = u;
      S.view = u.role === 'student' ? 'profile' : 'home';
      if (u.role === 'student') startReminders();
    }
  } catch (err) {
    console.error('Boot error:', err);
  } finally {
    render();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
