/* ═══════════════════════════════════════════════
   ErpofOne — main.js
   All client-side interactions
═══════════════════════════════════════════════ */

/* ── Utils ── */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

/* ── Toast notifications ── */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `fixed bottom-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow-lg text-white transition-all duration-300 ${type === 'success' ? 'bg-brand-teal' : 'bg-red-500'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

/* ─────────────────────────────
   MODALS
───────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Close modal on backdrop click
$$('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// Close modal on × buttons
$$('[data-modal-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
});

// Open modal triggers
$$('[data-modal-open]').forEach(btn => {
  btn.addEventListener('click', () => openModal(btn.dataset.modalOpen));
});

/* ─────────────────────────────
   SLIDE PANEL (skill library)
───────────────────────────── */
function openPanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closePanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

$$('[data-panel-open]').forEach(btn => {
  btn.addEventListener('click', () => openPanel(btn.dataset.panelOpen));
});

$$('[data-panel-close]').forEach(btn => {
  btn.addEventListener('click', () => closePanel(btn.dataset.panelClose));
});

$$('.panel-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

/* ─────────────────────────────
   AGENT DETAIL — Skills
───────────────────────────── */

// Toggle a skill on/off (UI only, persisted via API)
$$('.skill-toggle').forEach(btn => {
  btn.addEventListener('click', async function () {
    this.classList.toggle('off');
    const skillId  = this.dataset.skillId;
    const agentId  = this.dataset.agentId;
    const isOn     = !this.classList.contains('off');
    const method   = isOn ? 'POST' : 'DELETE';
    const url      = isOn
      ? `/agents/${agentId}/skills`
      : `/agents/${agentId}/skills/${skillId}`;
    const body     = isOn ? { skillId } : undefined;
    try {
      await api(method, url, body);
    } catch {
      this.classList.toggle('off'); // revert on error
      toast('Failed to update skill', 'error');
    }
  });
});

// Add skill from library panel
$$('[data-add-skill]').forEach(row => {
  row.addEventListener('click', async function () {
    const skillId  = this.dataset.addSkill;
    const agentId  = this.dataset.agentId;
    const alreadyAdded = this.classList.contains('added');

    if (alreadyAdded) {
      const res = await api('DELETE', `/agents/${agentId}/skills/${skillId}`);
      if (res.ok) { this.classList.remove('added'); this.querySelector('.check-mark')?.remove(); }
    } else {
      const res = await api('POST', `/agents/${agentId}/skills`, { skillId });
      if (res.ok) {
        this.classList.add('added');
        const ck = document.createElement('span');
        ck.className = 'check-mark text-brand-teal font-bold ml-auto';
        ck.textContent = '✓';
        this.appendChild(ck);
        toast('Skill added');
      }
    }
  });
});

// Skill library search filter
const libSearch = $('#lib-search');
if (libSearch) {
  libSearch.addEventListener('input', function () {
    const q = this.value.toLowerCase();
    $$('.lib-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
    $$('.lib-category').forEach(cat => {
      const visible = $$('.lib-row', cat).some(r => r.style.display !== 'none');
      cat.style.display = visible ? '' : 'none';
    });
  });
}

/* ─────────────────────────────
   RESOURCES — Add resource
───────────────────────────── */
$$('[data-add-resource]').forEach(btn => {
  btn.addEventListener('click', function () {
    const formId = this.dataset.addResource;
    const form   = document.getElementById(formId);
    if (form) form.classList.toggle('hidden');
  });
});

$$('[data-resource-form]').forEach(form => {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(this));
    const res  = await api('POST', '/resources', data);
    if (res.ok) {
      const list = document.getElementById(this.dataset.resourceList);
      if (list) list.insertAdjacentHTML('afterbegin', buildResourceRow(res.resource));
      this.reset();
      this.classList.add('hidden');
      toast('Resource added');
    } else {
      toast('Failed to add resource', 'error');
    }
  });
});

function buildResourceRow(r) {
  const badgeClass = {
    Notion: 'res-badge-notion', GitHub: 'res-badge-github',
    Drive:  'res-badge-drive',  GDocs:  'res-badge-drive',
  }[r.badge] || 'res-badge-link';
  const short = r.url.replace(/https?:\/\//, '').slice(0, 40);
  return `
    <div class="res-item flex items-center gap-2.5 px-3 py-2.5 border border-gray-100 rounded-lg mb-1.5 hover:border-gray-300 transition-colors group" data-id="${r._id}">
      <span class="text-base w-5 text-center flex-shrink-0">${r.icon}</span>
      <div class="flex-1 min-w-0">
        <span class="text-sm font-medium text-gray-800 block truncate">${r.title}</span>
        <span class="text-[10px] font-mono text-gray-400">${short}</span>
      </div>
      <span class="res-badge ${badgeClass}">${r.badge}</span>
      <button onclick="deleteResource('${r._id}',this)" class="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs ml-1 transition-opacity">✕</button>
    </div>`;
}

async function deleteResource(id, btn) {
  const res = await api('DELETE', `/resources/${id}`);
  if (res.ok) { btn.closest('.res-item').remove(); toast('Removed'); }
}

/* ─────────────────────────────
   TASKS — Create task modal
───────────────────────────── */
const taskForm = $('#task-create-form');
if (taskForm) {
  taskForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(this));
    const res  = await fetch('/tasks', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data),
    }).then(r => r.json());
    if (res.ok) { closeModal('modal-new-task'); toast('Task created'); setTimeout(() => location.reload(), 800); }
    else toast('Failed', 'error');
  });
}

// Update task status inline
$$('[data-task-status]').forEach(btn => {
  btn.addEventListener('click', async function () {
    const id     = this.dataset.taskId;
    const status = this.dataset.taskStatus;
    const res    = await api('PATCH', `/tasks/${id}`, { status });
    if (res.ok) location.reload();
  });
});

/* ─────────────────────────────
   AGENTS — Create agent modal
───────────────────────────── */
const agentForm = $('#agent-create-form');
if (agentForm) {
  agentForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(this));
    const res  = await fetch('/agents', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data),
    }).then(r => r.json());
    if (res.ok) { closeModal('modal-new-agent'); toast('Agent created'); setTimeout(() => location.reload(), 800); }
    else toast('Failed', 'error');
  });
}

/* ─────────────────────────────
   AGENT DETAIL — Tab switching
───────────────────────────── */
$$('[data-tab]').forEach(btn => {
  btn.addEventListener('click', function () {
    const group = this.dataset.tabGroup;
    $$(`[data-tab][data-tab-group="${group}"]`).forEach(b => b.classList.remove('active'));
    $$(`[data-pane][data-tab-group="${group}"]`).forEach(p => p.classList.add('hidden'));
    this.classList.add('active');
    const pane = document.getElementById('pane-' + this.dataset.tab);
    if (pane) pane.classList.remove('hidden');
  });
});

/* ─────────────────────────────
   USAGE — Period & Chart
───────────────────────────── */
const usageChart = $('#usage-chart');
if (usageChart) initUsageChart();

let chartInstance = null;

async function initUsageChart() {
  const period = new URLSearchParams(location.search).get('period') || 'week';
  await loadChartData(period);
}

async function loadChartData(period) {
  const res = await fetch(`/usage/api/data?period=${period}`);
  const { chartLabels, chartData, byAgent, byModel } = await res.json();
  renderChart(chartLabels, chartData);
}

function renderChart(labels, data) {
  if (chartInstance) chartInstance.destroy();
  const ctx = $('#usage-chart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(59,130,246,0.42)',
        hoverBackgroundColor: 'rgba(59,130,246,0.65)',
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2030',
          titleColor: '#9ca3af',
          bodyColor: '#e2e4ef',
          padding: 10,
          callbacks: { label: c => ' €' + c.parsed.y.toFixed(2) },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 } } },
        y: { grid: { color: '#f0f1f8' }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 }, callback: v => '€' + v } },
      },
    },
  });
}

$$('[data-period]').forEach(btn => {
  btn.addEventListener('click', function () {
    const period = this.dataset.period;
    window.location.href = `/usage?period=${period}`;
  });
});

/* ─────────────────────────────
   SKILLS — Create skill form
───────────────────────────── */
const skillForm = $('#skill-create-form');
if (skillForm) {
  skillForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(this));
    const res  = await api('POST', '/skills', data);
    if (res.ok) { closeModal('modal-new-skill'); toast('Skill created'); setTimeout(() => location.reload(), 800); }
    else toast('Failed', 'error');
  });
}
