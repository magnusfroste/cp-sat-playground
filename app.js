'use strict';

/* ============================================================ LAB 1: dispatch */
const WHY = {
  hard: 'Ingen plan finns. Mekanikerns jobb kräver 420 minuter men dagen ger 390, och två tidsfönster krockar i samma timme. Solvern bevisar att det är omöjligt — på millisekunder, utan att gissa.',
  overtime: 'Övertid löser inget här. Det är inte timmarna som fattas, det är fönstren. Lärdom: gissa inte vilket villkor som skaver — låt modellen peka ut det.',
  softwin: 'Glidande fönster räcker inte heller: kapaciteten är fortfarande för liten. Två mjuka regler behövs samtidigt, annars är problemet lika omöjligt.',
  drop: 'Nu blir det lösbart — genom att skjuta två jobb till nästa dag. Priset står direkt i målvärdet, inte i ett mejl tre dagar senare.',
  skills: 'Släpp kompetenskravet och allt får plats, nästan gratis. Men det är inte en plan du skickar till kund. Modellen är aldrig klokare än sina villkor.',
  ot_win: 'Övertid plus glidande fönster: alla elva jobb blir gjorda, 30 minuters övertid per tekniker, totalkostnad 1 300. Det är här en riktig avvägning börjar.',
  all: 'Allt mjukt ger det lägsta talet — men då har du också gett upp kompetenskravet. Optimeraren säger aldrig vad som är rätt, bara vad du sa till den.'
};

let DATA = null;
let current = 'ot_win';

const fmt = n => (n === null || n === undefined) ? '—' : n.toLocaleString('sv-SE');
const pct = (a, b) => (100 * a / b).toFixed(2).replace('.', ',') + ' %';

async function loadData() {
  try {
    const res = await fetch('data/dispatch.json', { cache: 'no-store' });
    DATA = await res.json();
  } catch (e) {
    document.getElementById('gantt').innerHTML =
      '<p class="small" style="color:var(--amber)">Kunde inte läsa data/dispatch.json. Öppna sidan via en webbserver (GitHub Pages) i stället för file://.</p>';
    return;
  }
  renderScenarios();
  selectVariant('ot_win');
}

function renderScenarios() {
  const host = document.getElementById('scenarios');
  host.innerHTML = '';
  for (const [key, v] of Object.entries(DATA.variants)) {
    const b = document.createElement('button');
    b.className = 'sc';
    b.setAttribute('aria-pressed', key === current ? 'true' : 'false');
    b.dataset.k = key;
    const badge = v.status === 'OPTIMAL' ? 'b-opt' : (v.status === 'INFEASIBLE' ? 'b-inf' : 'b-feas');
    const stat = v.status === 'INFEASIBLE' ? 'omöjlig' : 'mål ' + fmt(Math.round(v.objective));
    b.innerHTML = `<div class="t"><span class="n">${v.label}</span>
      <span class="badge ${badge}">${v.status === 'OPTIMAL' ? 'optimal' : v.status.toLowerCase()}</span></div>
      <div class="v">${stat}</div>`;
    b.addEventListener('click', () => selectVariant(key));
    host.appendChild(b);
  }
}

function selectVariant(key) {
  current = key;
  document.querySelectorAll('.sc').forEach(el =>
    el.setAttribute('aria-pressed', el.dataset.k === key ? 'true' : 'false'));
  const v = DATA.variants[key];
  const inst = DATA.instance;
  const DAY = inst.day;

  // --- gantt
  const g = document.getElementById('gantt');
  g.innerHTML = '';
  for (const t of inst.techs) {
    const label = document.createElement('div');
    label.className = 'tlabel';
    label.textContent = t.name;
    const row = document.createElement('div');
    row.className = 'grow';
    for (let m = 60; m < DAY; m += 60) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.left = (100 * m / DAY) + '%';
      row.appendChild(tick);
    }
    for (const a of v.plan.filter(p => p.tech === t.id)) {
      const job = inst.jobs.find(j => j.id === a.job);
      const bar = document.createElement('div');
      bar.className = 'bar ' + job.skill;
      bar.style.left = (100 * a.start / DAY) + '%';
      bar.style.width = (100 * a.dur / DAY) + '%';
      bar.title = `${job.name} · ${a.start}–${a.end} min · ${job.skill}`;
      const wide = a.dur / DAY > 0.16;          // no label inside narrow bars
      bar.textContent = wide ? (job.name.length > 14 ? job.name.slice(0, 13) + '…' : job.name) : '';
      if (a.late > 0) {
        const late = document.createElement('div');
        late.className = 'late';
        late.style.width = Math.min(100, 100 * a.late / a.dur) + '%';
        bar.appendChild(late);
      }
      row.appendChild(bar);
    }
    if (v.status === 'INFEASIBLE') row.style.background = 'repeating-linear-gradient(45deg,#12181f 0 6px,#0e141c 6px 12px)';
    g.appendChild(label);
    g.appendChild(row);
  }

  // --- axis
  const axis = document.getElementById('axis');
  axis.innerHTML = '<div></div><div class="row">' +
    [0, 120, 240, 360, 480].map(m => `<span style="left:${100 * m / DAY}%">${m}</span>`).join('') + '</div>';

  // --- dropped
  const dr = document.getElementById('dropped');
  if (v.status === 'INFEASIBLE') {
    dr.innerHTML = '<div class="dropped">Status: INFEASIBLE — solvern har bevisat att ingen plan uppfyller alla regler.</div>';
  } else if (v.dropped.length) {
    const names = v.dropped.map(id => inst.jobs.find(j => j.id === id).name).join(', ');
    dr.innerHTML = `<div class="dropped">Inte schemalagda: ${names} (flyttas till nästa dag, straff 5 000 st)</div>`;
  } else {
    dr.innerHTML = '<div class="dropped" style="color:var(--mint)">Alla elva jobb är schemalagda.</div>';
  }

  // --- stats
  const ot = Object.values(v.overtime || {}).reduce((a, b) => a + b, 0);
  const late = v.plan.reduce((a, b) => a + (b.late || 0), 0);
  const stats = [
    ['Status', v.status === 'INFEASIBLE' ? 'omöjlig' : v.status.toLowerCase()],
    ['Målvärde', v.objective === null ? '—' : fmt(Math.round(v.objective))],
    ['Lösta på', v.wall_ms < 1 ? '<1 ms' : fmt(v.wall_ms) + ' ms'],
    ['Variabler', fmt(v.vars)],
    ['Villkor', fmt(v.constraints)],
    ['Övertid', v.status === 'INFEASIBLE' ? '—' : ot + ' min'],
    ['Fönsterglid', v.status === 'INFEASIBLE' ? '—' : late + ' min']
  ];
  document.getElementById('stats').innerHTML = stats
    .map(([k, n]) => `<div class="stat"><div class="k">${k}</div><div class="n">${n}</div></div>`).join('');

  // --- breakdown
  const travel = v.plan.reduce((sum, a) => {
    const tech = inst.techs.find(t => t.id === a.tech);
    const job = inst.jobs.find(j => j.id === a.job);
    return sum + DATA.instance.weights.travel * inst.travel[tech.zone][job.zone];
  }, 0);
  const bd = document.getElementById('breakdown');
  if (v.status === 'INFEASIBLE') {
    bd.innerHTML = 'Ingen plan, ingen kostnad. Men modellen är fortfarande liten: ' + fmt(v.vars) +
      ' variabler och ' + fmt(v.constraints) + ' villkor räckte för att bevisa omöjligheten på ' + fmt(v.wall_ms) + ' ms.';
  } else {
    const rows = [
      ['Tappade jobb', 5000 * v.dropped.length, v.dropped.length + ' st'],
      ['Fönsterglid, sent', 20 * late, late + ' min'],
      ['Övertid', 3 * ot, ot + ' min'],
      ['Restid', travel, Math.round(travel / 2) + ' min']
    ].filter(r => r[1] > 0);
    bd.innerHTML = rows.length
      ? '<table>' + rows.map(([n, c, u]) => `<tr><td>${n}</td><td class="muted mono">${u}</td><td class="mono" style="text-align:right">${fmt(c)}</td></tr>`).join('') + '</table>'
      : 'Noll kostnad: planen bryter inga regler, kräver ingen övertid och ingen restid utanför zon.';
  }
  document.getElementById('why').textContent = WHY[key] || '';
}

/* ============================================================ LAB 2: n-queens */
const N = 8;
let events = [], cursor = 0, timer = null, boardEls = [];

function buildEvents(n) {
  const ev = [];
  const cols = [];
  const d1 = new Set(), d2 = new Set();
  let solved = false;
  const stats = { tries: 0, backs: 0, nodes: 0 };

  function rec(r) {
    if (r === n) { ev.push({ t: 'solution', queens: cols.slice(), s: { ...stats } }); return true; }
    for (let c = 0; c < n; c++) {
      stats.tries++;
      ev.push({ t: 'try', r, c });
      const clashCol = cols.includes(c);
      const clashD = d1.has(r - c) || d2.has(r + c);
      if (clashCol || clashD) {
        ev.push({ t: 'reject', r, c, why: clashCol ? 'samma kolumn' : 'samma diagonal', s: { ...stats }, queens: cols.slice() });
        continue;
      }
      cols.push(c); d1.add(r - c); d2.add(r + c); stats.nodes++;
      ev.push({ t: 'place', r, c, s: { ...stats }, queens: cols.slice() });
      if (rec(r + 1)) return true;
      cols.pop(); d1.delete(r - c); d2.delete(r + c); stats.backs++;
      ev.push({ t: 'unplace', r, c, s: { ...stats }, queens: cols.slice() });
    }
    return false;
  }
  rec(0);
  return ev;
}

function initQueens() {
  const host = document.getElementById('board');
  host.style.gridTemplateColumns = `repeat(${N},1fr)`;
  host.innerHTML = '';
  boardEls = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + ((r + c) % 2 ? ' dark' : '');
      cell.dataset.r = r; cell.dataset.c = c;
      host.appendChild(cell);
      boardEls.push(cell);
    }
  }
  events = buildEvents(N);
  cursor = 0;
  drawQueens();
  document.getElementById('log').innerHTML = '';
  document.getElementById('nq-perm').textContent = factorial(N).toLocaleString('sv-SE');
  document.getElementById('c-share').textContent = '0 %';
}

function factorial(n) { let x = 1; for (let i = 2; i <= n; i++) x *= i; return x; }

function drawQueens() {
  const state = replay();
  const { queens, currentRow, rejected, stats } = state;
  for (const cell of boardEls) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    cell.classList.remove('queen', 'tried', 'current', 'attacked');
    cell.textContent = '';
    if (queens[r] === c) { cell.classList.add('queen'); cell.textContent = '♛'; }
    else if (rejected.some(([rr, cc]) => rr === r && cc === c)) { cell.classList.add('tried'); cell.textContent = '·'; }
    if (currentRow === r) cell.classList.add('current');
  }
  document.getElementById('c-nodes').textContent = fmt(stats.nodes);
  document.getElementById('c-tries').textContent = fmt(stats.tries);
  document.getElementById('c-backs').textContent = fmt(stats.backs);
  const share = Math.min(100, 100 * (stats.tries || 0) / factorial(N));
  document.getElementById('c-share').textContent = stats.tries ? pct(stats.tries, factorial(N)) : '0 %';
  const log = document.getElementById('log');
  log.scrollTop = log.scrollHeight;
  return state;
}

function replay() {
  const queens = [];
  let currentRow = 0;
  const rejected = [];
  let stats = { nodes: 0, tries: 0, backs: 0 };
  for (let i = 0; i < cursor; i++) {
    const e = events[i];
    if (e.s) stats = e.s;
    if (e.t === 'try') { currentRow = e.r; }
    if (e.t === 'place') { queens[e.r] = e.c; rejected.length = 0; }
    if (e.t === 'reject') rejected.push([e.r, e.c]);
    if (e.t === 'unplace') { queens.length = e.r; }
    if (e.t === 'solution') { for (let r = 0; r < N; r++) queens[r] = e.queens[r]; currentRow = N; }
  }
  return { queens, currentRow, rejected, stats };
}

function logLine(text, cls) {
  const log = document.getElementById('log');
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  log.appendChild(d);
  if (log.childElementCount > 200) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function stepQueens() {
  if (cursor >= events.length) { stopPlay(); return false; }
  const e = events[cursor++];
  if (e.t === 'try') logLine(`rad ${e.r + 1}: testar kolumn ${e.c + 1}`);
  if (e.t === 'reject') logLine(`  ✕ rad ${e.r + 1} kol ${e.c + 1} — ${e.why}`, 'bad');
  if (e.t === 'place') logLine(`  ✓ dam på rad ${e.r + 1}, kol ${e.c + 1}`, 'ok');
  if (e.t === 'unplace') logLine(`↩ backtrack från rad ${e.r + 1}`, 'bad');
  if (e.t === 'solution') logLine('★ lösning hittad — alla åtta damer står säkert', 'ok');
  drawQueens();
  return true;
}

function startPlay() {
  stopPlay();
  const speed = +document.getElementById('speed').value;
  timer = setInterval(() => {
    if (!stepQueens()) stopPlay();
  }, Math.max(8, 620 / speed));
  document.getElementById('btn-play').textContent = 'Paus';
}

function stopPlay() {
  if (timer) clearInterval(timer);
  timer = null;
  document.getElementById('btn-play').textContent = 'Spela';
}

/* ============================================================ LAB 3: fit test */
const FIT_TEXT = score => {
  if (score >= 7) return ['Ja — det här är CP-SAT:s hemmaplan.', 'tag-ok',
    'Börja med en prototyp på verklig data den här veckan. Mät: hur lång tid tar en plan i dag, hur ofta bryts en regel, vad kostar en dålig plan. Det talet är affärscaset.'];
  if (score >= 5) return ['Troligen ja — men modelleringen är jobbet.', 'tag-warn',
    'Bygg en minsta modell med bara de tre hårdaste reglerna. Om den löser verkliga data på under en sekund är resten konfiguration, inte forskning.'];
  if (score >= 3) return ['Kanske — men inte som första åtgärd.', 'tag-warn',
    'Frågan är om problemet är diskret nog. Om svaret är "det beror på hur vi räknar" behöver du definiera reglerna först, och sedan modellera.'];
  return ['Nej, eller inte än.', 'tag-no',
    'Antingen är problemet för litet (en girig regel räcker), för kontinuerligt (använd LP) eller för odefinierat (definiera reglerna först).'];
};

function initFit() {
  const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
  const update = () => {
    const score = ids.filter(id => document.getElementById(id).checked).length;
    const [head, cls, body] = FIT_TEXT(score);
    document.getElementById('fit-score').textContent = `${score} av 8`;
    document.getElementById('fit-text').innerHTML =
      `<div class="${cls}" style="font-weight:600;margin-bottom:6px">${head}</div>${body}`;
  };
  ids.forEach(id => document.getElementById(id).addEventListener('change', update));
  update();
}

/* ============================================================ CODE SNIPPETS */
const CODE = {
  model: `<span class="c"># Variabler: en start, ett slut, ett eventuellt intervall per (tekniker, jobb)</span>
model = cp_model.CpModel()

start[j] = model.new_int_var(0, DAY, f"s{j}")
end[j]   = model.new_int_var(0, DAY, f"e{j}")
model.add(end[j] == start[j] + job.dur)          <span class="c"># låt solvern propagera åt båda håll</span>

x[t, j] = model.new_bool_var(f"x{t}_{j}")
iv[t, j] = model.new_optional_interval_var(
    start[j], job.dur, end[j], x[t, j], f"iv{t}_{j}")

<span class="c"># Varje jobb tas av exakt en tekniker — eller tappas, med ett pris</span>
model.add(sum(x[t, j] for t in techs if (t, j) in x) + drop[j] == 1)
model.minimize(5000 * sum(drop.values()) + travel + overtime)`,
  nover: `<span class="c"># Ett enda villkor ersätter tusentals parvisa disjunktioner</span>
for t in techs:
    model.add_no_overlap([iv[t, j] for j in jobs if (t, j) in iv])

<span class="c"># Filtrera bort omöjliga tilldelningar innan de blir variabler</span>
for t, tech in enumerate(techs):
    for j, job in enumerate(jobs):
        if job.skill not in tech.skills:
            continue                      <span class="c"># ingen variabel, inget villkor</span>
        x[t, j] = model.new_bool_var(f"x{t}_{j}")

<span class="c"># Symmetri: två utbytbara tekniker ska inte ge dubbla sökträd</span>
model.add(load(t) >= load(t + 1))`,
  soft: `<span class="c"># Hårda fönster kan göra problemet omöjligt. Mjuka fönster ger ett pris i stället.</span>
early = model.new_int_var(0, job.lo, f"early{j}")
late  = model.new_int_var(0, DAY,   f"late{j}")
model.add(start[j] >= job.lo - early)
model.add(end[j]   <= job.hi + late)
objective += 8 * early + 20 * late

<span class="c"># Resultat: planen genomför jobbet och berättar hur mycket löftet gled —
# i stället för att tyst hoppa över jobbet.</span>`,
  diag: `<span class="c"># Andra körningen: minimera bara det som inte gick att lösa</span>
model.minimize(sum(drop.values()))
status = solver.solve(model)

if status == cp_model.INFEASIBLE:
    <span class="c"># Vilka resurser räckte inte? Låt kapaciteten vara antaganden —</span>
    <span class="c"># solvern returnerar då minsta mängd som inte kan uppfyllas.</span>
    a = model.new_bool_var("cap_t")
    model.add(load_t &lt;= max_t).only_enforce_if(a)
    model.add_assumption(a)
    core = solver.sufficient_assumptions_for_infeasibility()

solver.parameters.max_time_in_seconds = 20
solver.parameters.num_search_workers  = 8
print(solver.status_name(status), solver.best_objective_bound)`
};

function initTabs() {
  const pre = document.getElementById('code');
  const set = k => {
    pre.innerHTML = CODE[k];
    document.querySelectorAll('.tab').forEach(t =>
      t.setAttribute('aria-pressed', t.dataset.k === k ? 'true' : 'false'));
  };
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => set(t.dataset.k)));
  set('model');
}

/* ============================================================ boot */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initQueens();
  initFit();
  initTabs();
  document.getElementById('btn-step').addEventListener('click', () => { stopPlay(); stepQueens(); });
  document.getElementById('btn-play').addEventListener('click', () => timer ? stopPlay() : startPlay());
  document.getElementById('btn-reset').addEventListener('click', () => { stopPlay(); initQueens(); });
  document.getElementById('btn-solve').addEventListener('click', () => {
    stopPlay();
    cursor = events.length;                    // replay to the end in one pass
    const st = drawQueens();
    logLine(`★ lösning: ${st.stats.nodes + st.stats.backs} noder, ${st.stats.tries} prövningar, ` +
            `${st.stats.backs} backtrack — ${pct(st.stats.tries, factorial(N))} av alla ${factorial(N).toLocaleString('sv-SE')} placeringar`, 'ok');
  });
  document.getElementById('nq-n').textContent = N;
});