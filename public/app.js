'use strict';
/* InvoiceFlow SPA — vanilla JS, no build step. */

const API = {
  async req(method, url, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
    return data;
  },
  get: (u) => API.req('GET', u),
  post: (u, b) => API.req('POST', u, b),
  put: (u, b) => API.req('PUT', u, b),
  patch: (u, b) => API.req('PATCH', u, b),
  del: (u) => API.req('DELETE', u),
};

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', INR: '₹', JPY: '¥' };
const state = { user: null, billingLive: false, chart: null };

function money(n, cur) {
  const sym = CURRENCY_SYMBOLS[cur || (state.user && state.user.currency) || 'USD'] || '';
  return sym + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function toast(msg, type = 'info') {
  const colors = { info: 'bg-slate-800', success: 'bg-emerald-600', error: 'bg-rose-600' };
  const el = document.createElement('div');
  el.className = `${colors[type]} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm fade-in max-w-xs`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
const app = () => document.getElementById('app');
function go(route) { location.hash = route; }

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    const cfg = await API.get('/api/billing/config'); state.billingLive = cfg.live;
  } catch (e) {}
  try {
    const me = await API.get('/api/auth/me'); state.user = me.user;
  } catch (e) { state.user = null; }
  window.addEventListener('hashchange', render);
  render();
}

/* ---------------- Router ---------------- */
function render() {
  const route = location.hash.replace(/^#/, '') || (state.user ? '/dashboard' : '/');
  if (!state.user) {
    if (route === '/login' || route === '/signup') return renderAuth(route === '/signup' ? 'signup' : 'login');
    return renderLanding();
  }
  // Unverified users must verify their email before using the app.
  if (state.user.email_verified === 0) return renderVerifyNotice();
  // authed routes
  if (route.startsWith('/invoices/new')) return renderInvoiceEditor(null);
  if (route.startsWith('/invoices/')) {
    const id = route.split('/')[2];
    if (route.endsWith('/edit')) return renderInvoiceEditor(id);
    return renderInvoiceView(id);
  }
  if (route === '/invoices') return renderInvoices();
  if (route === '/clients') return renderClients();
  if (route === '/settings') return renderSettings();
  if (route === '/upgrade') return renderUpgrade();
  return renderDashboard();
}

/* ---------------- Landing ---------------- */
function renderLanding() {
  app().innerHTML = `
  <header class="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
    <div class="flex items-center gap-2 font-extrabold text-xl"><span class="text-brand">●</span> InvoiceFlow</div>
    <nav class="flex items-center gap-3">
      <a href="#/login" class="text-sm font-medium text-slate-600 hover:text-slate-900">Log in</a>
      <a href="#/signup" class="text-sm font-semibold bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg">Start free</a>
    </nav>
  </header>

  <section class="max-w-6xl mx-auto px-6 pt-12 pb-20 text-center">
    <span class="inline-block bg-brand-light text-brand text-xs font-semibold px-3 py-1 rounded-full mb-5">For freelancers & small businesses</span>
    <h1 class="text-5xl md:text-6xl font-extrabold tracking-tight max-w-3xl mx-auto leading-tight">Send invoices in seconds. <span class="text-brand">Get paid faster.</span></h1>
    <p class="text-lg text-slate-600 mt-6 max-w-xl mx-auto">Create polished invoices, share them with a single link, and see at a glance who's paid and who's overdue. No spreadsheets. No chasing.</p>
    <div class="mt-8 flex items-center justify-center gap-3">
      <a href="#/signup" class="bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-brand/20">Create your first invoice — free</a>
      <a href="#pricing" class="px-6 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-100">See pricing</a>
    </div>
    <p class="text-xs text-slate-400 mt-3">Free plan includes 5 invoices. No card required.</p>
  </section>

  <section class="max-w-6xl mx-auto px-6 pb-20 grid md:grid-cols-3 gap-6">
    ${[
      ['⚡', 'Lightning-fast invoicing', 'Pick a client, add line items, done. Auto-numbered and tax-ready.'],
      ['🔗', 'Shareable pay links', 'Every invoice gets a clean public link your client can open and print to PDF.'],
      ['📊', 'Money dashboard', 'Track paid, outstanding, and overdue totals with a 6-month revenue chart.'],
    ].map(([i, t, d]) => `
      <div class="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div class="text-3xl">${i}</div>
        <h3 class="font-bold text-lg mt-3">${t}</h3>
        <p class="text-slate-600 text-sm mt-1">${d}</p>
      </div>`).join('')}
  </section>

  <section id="pricing" class="max-w-4xl mx-auto px-6 pb-24">
    <h2 class="text-3xl font-extrabold text-center">Simple pricing</h2>
    <p class="text-center text-slate-600 mt-2">Start free. Upgrade when you're growing.</p>
    <div class="grid md:grid-cols-2 gap-6 mt-10">
      <div class="bg-white rounded-2xl p-8 border border-slate-200">
        <h3 class="font-bold text-xl">Free</h3>
        <div class="text-4xl font-extrabold mt-2">$0<span class="text-base font-medium text-slate-400">/mo</span></div>
        <ul class="mt-5 space-y-2 text-sm text-slate-600">
          <li>✓ Up to 5 invoices</li><li>✓ Up to 3 clients</li><li>✓ Shareable invoice links</li><li>✓ Basic summary</li>
        </ul>
        <a href="#/signup" class="block text-center mt-6 border border-slate-300 hover:bg-slate-50 font-semibold py-2.5 rounded-lg">Get started</a>
      </div>
      <div class="bg-slate-900 text-white rounded-2xl p-8 border border-slate-900 relative">
        <span class="absolute -top-3 right-6 bg-brand text-white text-xs font-bold px-3 py-1 rounded-full">Most popular</span>
        <h3 class="font-bold text-xl">Pro</h3>
        <div class="text-4xl font-extrabold mt-2">$12<span class="text-base font-medium text-slate-400">/mo</span></div>
        <ul class="mt-5 space-y-2 text-sm text-slate-300">
          <li>✓ <b>Unlimited</b> invoices & clients</li><li>✓ Custom logo on invoices</li><li>✓ Full revenue dashboard & reports</li><li>✓ Priority support</li>
        </ul>
        <a href="#/signup" class="block text-center mt-6 bg-brand hover:bg-brand-dark font-semibold py-2.5 rounded-lg">Start free, upgrade anytime</a>
      </div>
    </div>
  </section>

  <footer class="border-t border-slate-200 py-8 text-center text-sm text-slate-400">© ${new Date().getFullYear()} InvoiceFlow</footer>`;
}

/* ---------------- Auth ---------------- */
function renderAuth(mode) {
  app().innerHTML = `
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-8 fade-in">
      <a href="#/" class="flex items-center gap-2 font-extrabold text-xl mb-6"><span class="text-brand">●</span> InvoiceFlow</a>
      <h1 class="text-2xl font-bold">${mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
      <p class="text-slate-500 text-sm mt-1">${mode === 'signup' ? 'Start invoicing for free.' : 'Log in to your account.'}</p>
      <form id="authForm" class="mt-6 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" required class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-brand outline-none" placeholder="you@example.com">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Password</label>
          <input name="password" type="password" required minlength="6" class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-brand outline-none" placeholder="••••••••">
        </div>
        <button class="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg">${mode === 'signup' ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="text-sm text-slate-500 mt-5 text-center">
        ${mode === 'signup'
          ? `Already have an account? <a href="#/login" class="text-brand font-semibold">Log in</a>`
          : `New here? <a href="#/signup" class="text-brand font-semibold">Create an account</a>`}
      </p>
    </div>
  </div>`;
  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { email: fd.get('email'), password: fd.get('password') };
    try {
      const data = await API.post(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', body);
      state.user = data.user;
      if (mode === 'signup' && data.needsVerification) {
        toast('Account created — check your email', 'success');
        go('/verify-email');
      } else {
        toast(mode === 'signup' ? 'Account created!' : 'Logged in', 'success');
        go('/dashboard');
      }
    } catch (err) { toast(err.message, 'error'); }
  });
}

/* ---------------- Email verification notice ---------------- */
function renderVerifyNotice() {
  const u = state.user;
  app().innerHTML = `
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center fade-in">
      <div class="text-4xl">✉️</div>
      <h1 class="text-2xl font-bold mt-3">Verify your email</h1>
      <p class="text-slate-500 mt-2">We sent a verification link to <b>${esc(u.email)}</b>. Click it to activate your account, then come back here.</p>
      <button onclick="checkVerified()" class="w-full mt-6 bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg">I've verified — continue</button>
      <button onclick="resendVerification()" class="w-full mt-3 border border-slate-300 hover:bg-slate-50 font-medium py-2.5 rounded-lg">Resend email</button>
      <button onclick="logout()" class="mt-4 text-sm text-slate-400 hover:text-slate-600">Log out</button>
    </div>
  </div>`;
}
async function checkVerified() {
  try {
    const me = await API.get('/api/auth/me');
    state.user = me.user;
    if (me.user.email_verified === 1) { toast('Email verified!', 'success'); go('/dashboard'); }
    else toast("Not verified yet — check your inbox", 'info');
  } catch (e) { toast(e.message, 'error'); }
}
async function resendVerification() {
  try {
    const r = await API.post('/api/auth/resend-verification');
    if (r.autoVerified) { const me = await API.get('/api/auth/me'); state.user = me.user; toast('Verified!', 'success'); go('/dashboard'); }
    else toast('Verification email sent', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- App shell ---------------- */
function shell(active, content) {
  const u = state.user;
  const planBadge = u.plan === 'pro'
    ? `<span class="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">PRO</span>`
    : `<a href="#/upgrade" class="text-xs font-bold bg-brand-light text-brand px-2 py-0.5 rounded hover:bg-indigo-100">Free · Upgrade</a>`;
  const link = (href, label, icon) => `
    <a href="#${href}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${active === href ? 'bg-brand-light text-brand' : 'text-slate-600 hover:bg-slate-100'}">
      <span class="w-5 text-center">${icon}</span>${label}</a>`;
  app().innerHTML = `
  <div class="flex min-h-screen">
    <aside class="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col p-4">
      <a href="#/dashboard" class="flex items-center gap-2 font-extrabold text-lg px-2 mb-6"><span class="text-brand">●</span> InvoiceFlow</a>
      <nav class="space-y-1">
        ${link('/dashboard', 'Dashboard', '▦')}
        ${link('/invoices', 'Invoices', '🧾')}
        ${link('/clients', 'Clients', '👥')}
        ${link('/settings', 'Settings', '⚙')}
      </nav>
      <div class="mt-auto pt-4 border-t border-slate-100">
        <div class="px-2 text-sm font-medium truncate">${esc(u.email)}</div>
        <div class="px-2 mt-1 mb-3">${planBadge}</div>
        <button onclick="logout()" class="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100">Log out</button>
      </div>
    </aside>
    <main class="flex-1 overflow-auto"><div class="max-w-5xl mx-auto px-8 py-8 fade-in">${content}</div></main>
  </div>`;
}

async function logout() {
  try { await API.post('/api/auth/logout'); } catch (e) {}
  state.user = null; go('/');
}

/* ---------------- Dashboard ---------------- */
async function renderDashboard() {
  shell('/dashboard', `<div class="text-slate-400">Loading…</div>`);
  let s, recent;
  try {
    s = (await API.get('/api/stats')).stats;
    recent = (await API.get('/api/invoices')).invoices.slice(0, 6);
  } catch (e) { return toast(e.message, 'error'); }

  const card = (label, value, sub, color) => `
    <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div class="text-sm text-slate-500">${label}</div>
      <div class="text-2xl font-extrabold mt-1 ${color || ''}">${value}</div>
      ${sub ? `<div class="text-xs text-slate-400 mt-1">${sub}</div>` : ''}
    </div>`;

  const isPro = s.plan === 'pro';
  shell('/dashboard', `
    <div class="flex items-center justify-between mb-6">
      <div><h1 class="text-2xl font-bold">Dashboard</h1><p class="text-slate-500 text-sm">Your business at a glance</p></div>
      <a href="#/invoices/new" class="bg-brand hover:bg-brand-dark text-white font-semibold px-4 py-2.5 rounded-lg text-sm">+ New invoice</a>
    </div>
    ${isPro ? `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${card('Paid', money(s.paid), `${s.invoiceCount} invoices total`, 'text-emerald-600')}
      ${card('Outstanding', money(s.outstanding), 'awaiting payment', 'text-blue-600')}
      ${card('Overdue', money(s.overdue), 'past due date', 'text-rose-600')}
      ${card('Clients', s.clientCount, `${s.draftCount} drafts`, '')}
    </div>
    <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mt-6">
      <h3 class="font-semibold mb-3">Revenue (last 6 months)</h3>
      <canvas id="revChart" height="90"></canvas>
    </div>` : `
    <div class="grid grid-cols-3 gap-4">
      ${card('Invoices', s.invoiceCount, `${s.draftCount} drafts`, '')}
      ${card('Clients', s.clientCount, 'in your address book', '')}
      ${card('Plan', 'Free', 'upgrade for reports', 'text-brand')}
    </div>
    <div class="relative bg-white rounded-2xl border border-slate-100 p-8 shadow-sm mt-6 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-b from-transparent to-white"></div>
      <div class="text-center relative">
        <div class="text-3xl">📊</div>
        <h3 class="font-bold text-lg mt-2">Revenue dashboard & reports</h3>
        <p class="text-slate-500 text-sm mt-1 max-w-sm mx-auto">See paid, outstanding, and overdue totals plus a 6-month revenue chart. Unlock the full dashboard with Pro.</p>
        <a href="#/upgrade" class="inline-block mt-4 bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg">Upgrade to Pro</a>
      </div>
    </div>`}
    <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mt-6">
      <div class="flex items-center justify-between mb-3"><h3 class="font-semibold">Recent invoices</h3><a href="#/invoices" class="text-sm text-brand font-medium">View all →</a></div>
      ${recent.length ? invoiceTable(recent) : `<p class="text-slate-400 text-sm py-6 text-center">No invoices yet. <a href="#/invoices/new" class="text-brand font-medium">Create one →</a></p>`}
    </div>`);

  const ctx = document.getElementById('revChart');
  if (ctx) {
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: s.series.map((p) => p.month),
        datasets: [{ label: 'Paid revenue', data: s.series.map((p) => p.revenue), backgroundColor: '#4f46e5', borderRadius: 6 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => money(v) } } },
      },
    });
  }
}

function statusBadge(status) {
  const map = {
    paid: 'bg-emerald-100 text-emerald-700', sent: 'bg-blue-100 text-blue-700',
    overdue: 'bg-rose-100 text-rose-700', draft: 'bg-slate-100 text-slate-600',
  };
  return `<span class="text-xs font-semibold px-2 py-0.5 rounded ${map[status] || map.draft}">${status}</span>`;
}

function invoiceTable(invoices) {
  return `<div class="overflow-x-auto"><table class="w-full text-sm">
    <thead><tr class="text-left text-slate-400 border-b border-slate-100">
      <th class="py-2 font-medium">Invoice</th><th class="py-2 font-medium">Client</th><th class="py-2 font-medium">Due</th><th class="py-2 font-medium">Status</th><th class="py-2 font-medium text-right">Amount</th><th></th>
    </tr></thead><tbody>
    ${invoices.map((inv) => `<tr class="border-b border-slate-50 hover:bg-slate-50">
      <td class="py-2.5 font-medium"><a href="#/invoices/${inv.id}" class="hover:text-brand">${esc(inv.number)}</a></td>
      <td class="py-2.5 text-slate-600">${esc(inv.client ? inv.client.name : '—')}</td>
      <td class="py-2.5 text-slate-500">${esc(inv.due_date)}</td>
      <td class="py-2.5">${statusBadge(inv.status)}</td>
      <td class="py-2.5 text-right font-semibold">${money(inv.totals.total, inv.currency)}</td>
      <td class="py-2.5 text-right"><a href="#/invoices/${inv.id}" class="text-brand text-xs font-medium">Open</a></td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------------- Invoices list ---------------- */
async function renderInvoices() {
  shell('/invoices', `<div class="text-slate-400">Loading…</div>`);
  let data;
  try { data = await API.get('/api/invoices'); } catch (e) { return toast(e.message, 'error'); }
  const invoices = data.invoices;
  shell('/invoices', `
    <div class="flex items-center justify-between mb-6">
      <div><h1 class="text-2xl font-bold">Invoices</h1><p class="text-slate-500 text-sm">${invoices.length} total${data.plan !== 'pro' ? ` · ${data.freeLimit - invoices.length} left on free plan` : ''}</p></div>
      <a href="#/invoices/new" class="bg-brand hover:bg-brand-dark text-white font-semibold px-4 py-2.5 rounded-lg text-sm">+ New invoice</a>
    </div>
    <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      ${invoices.length ? invoiceTable(invoices) : `<p class="text-slate-400 text-sm py-10 text-center">No invoices yet. <a href="#/invoices/new" class="text-brand font-medium">Create your first →</a></p>`}
    </div>`);
}

/* ---------------- Invoice view ---------------- */
async function renderInvoiceView(id) {
  shell('/invoices', `<div class="text-slate-400">Loading…</div>`);
  let inv;
  try { inv = (await API.get('/api/invoices/' + id)).invoice; } catch (e) { return toast(e.message, 'error'); }
  const t = inv.totals;
  const shareUrl = location.origin + '/i/' + inv.public_token;
  const itemRows = inv.items.map((it) => `<tr>
      <td class="py-2">${esc(it.description)}</td>
      <td class="py-2 text-right">${it.quantity}</td>
      <td class="py-2 text-right">${money(it.unit_price, inv.currency)}</td>
      <td class="py-2 text-right">${money(it.quantity * it.unit_price, inv.currency)}</td>
    </tr>`).join('');

  shell('/invoices', `
    <a href="#/invoices" class="text-sm text-slate-500 hover:text-slate-800">← Back to invoices</a>
    <div class="flex items-center justify-between mt-3 mb-6">
      <div><h1 class="text-2xl font-bold flex items-center gap-3">${esc(inv.number)} ${statusBadge(inv.status)}</h1>
        <p class="text-slate-500 text-sm">For ${esc(inv.client ? inv.client.name : '')}</p></div>
      <div class="flex gap-2">
        <button onclick="sendInvoice(${inv.id})" class="bg-brand hover:bg-brand-dark text-white font-medium px-3 py-2 rounded-lg text-sm">✉ Send to client</button>
        <a href="#/invoices/${inv.id}/edit" class="border border-slate-300 hover:bg-slate-50 font-medium px-3 py-2 rounded-lg text-sm">Edit</a>
        <a href="/i/${inv.public_token}" target="_blank" class="border border-slate-300 hover:bg-slate-50 font-medium px-3 py-2 rounded-lg text-sm">Open / PDF</a>
        <button onclick="deleteInvoice(${inv.id})" class="text-rose-600 hover:bg-rose-50 font-medium px-3 py-2 rounded-lg text-sm">Delete</button>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm mb-5 flex flex-wrap items-center gap-3">
      <span class="text-sm font-medium text-slate-600">Status:</span>
      ${['draft', 'sent', 'paid', 'overdue'].map((st) => `
        <button onclick="setStatus(${inv.id}, '${st}')" class="text-xs font-semibold px-3 py-1.5 rounded-lg ${inv.status === st ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${st}</button>`).join('')}
      <div class="ml-auto flex items-center gap-2">
        <input id="shareUrl" readonly value="${shareUrl}" class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-64 text-slate-500">
        <button onclick="copyShare()" class="text-xs font-semibold bg-slate-800 text-white px-3 py-1.5 rounded-lg">Copy link</button>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
      <div class="flex justify-between text-sm mb-4">
        <div><div class="text-slate-400 text-xs uppercase">Issue date</div>${esc(inv.issue_date)}</div>
        <div><div class="text-slate-400 text-xs uppercase">Due date</div>${esc(inv.due_date)}</div>
      </div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-slate-400 border-b border-slate-100"><th class="py-2 font-medium">Description</th><th class="py-2 font-medium text-right">Qty</th><th class="py-2 font-medium text-right">Unit</th><th class="py-2 font-medium text-right">Amount</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="4" class="py-3 text-slate-400">No items</td></tr>'}</tbody>
      </table>
      <div class="mt-4 ml-auto w-64 text-sm space-y-1">
        <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span>${money(t.subtotal, inv.currency)}</span></div>
        ${t.discount ? `<div class="flex justify-between"><span class="text-slate-500">Discount</span><span>-${money(t.discount, inv.currency)}</span></div>` : ''}
        ${inv.tax_rate ? `<div class="flex justify-between"><span class="text-slate-500">Tax (${inv.tax_rate}%)</span><span>${money(t.taxAmount, inv.currency)}</span></div>` : ''}
        <div class="flex justify-between text-lg font-extrabold border-t border-slate-100 pt-2 mt-1"><span>Total</span><span>${money(t.total, inv.currency)}</span></div>
      </div>
      ${inv.notes ? `<div class="mt-5 pt-4 border-t border-slate-100 text-sm text-slate-500 whitespace-pre-wrap">${esc(inv.notes)}</div>` : ''}
    </div>`);
}

async function setStatus(id, status) {
  try { await API.patch(`/api/invoices/${id}/status`, { status }); toast('Status updated', 'success'); renderInvoiceView(id); }
  catch (e) { toast(e.message, 'error'); }
}
async function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;
  try { await API.del('/api/invoices/' + id); toast('Invoice deleted', 'success'); go('/invoices'); }
  catch (e) { toast(e.message, 'error'); }
}
function copyShare() {
  const el = document.getElementById('shareUrl');
  el.select(); navigator.clipboard.writeText(el.value).then(() => toast('Link copied!', 'success'));
}
async function sendInvoice(id) {
  try {
    const r = await API.post(`/api/invoices/${id}/send`);
    if (r.sent) toast('Invoice emailed to your client ✉', 'success');
    else if (r.reason === 'no_client_email') toast('Add an email to this client first', 'error');
    else if (!r.configured) {
      navigator.clipboard && navigator.clipboard.writeText(r.shareUrl);
      toast('Email not set up yet — link copied. Marked as sent.', 'info');
    } else toast('Could not send: ' + (r.reason || 'unknown'), 'error');
    renderInvoiceView(id);
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- Invoice editor ---------------- */
async function renderInvoiceEditor(id) {
  shell('/invoices', `<div class="text-slate-400">Loading…</div>`);
  let clients = [], inv = null;
  try {
    clients = (await API.get('/api/clients')).clients;
    if (id) inv = (await API.get('/api/invoices/' + id)).invoice;
  } catch (e) { return toast(e.message, 'error'); }

  if (!clients.length) {
    return shell('/invoices', `
      <a href="#/invoices" class="text-sm text-slate-500">← Back</a>
      <div class="bg-white rounded-2xl border border-slate-100 p-10 shadow-sm mt-4 text-center">
        <h2 class="text-xl font-bold">Add a client first</h2>
        <p class="text-slate-500 mt-1">You need at least one client before creating an invoice.</p>
        <a href="#/clients" class="inline-block mt-5 bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg">Go to Clients</a>
      </div>`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const items = inv ? inv.items : [{ description: '', quantity: 1, unit_price: 0 }];
  state._items = items.map((it) => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price }));

  shell('/invoices', `
    <a href="#/invoices" class="text-sm text-slate-500 hover:text-slate-800">← Back</a>
    <h1 class="text-2xl font-bold mt-3 mb-6">${id ? 'Edit invoice' : 'New invoice'}</h1>
    <form id="invForm" class="space-y-6">
      <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm grid md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Client</label>
          <select name="client_id" class="w-full border border-slate-300 rounded-lg px-3 py-2">
            ${clients.map((c) => `<option value="${c.id}" ${inv && inv.client_id === c.id ? 'selected' : ''}>${esc(c.name)}${c.company ? ' · ' + esc(c.company) : ''}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Status</label>
          <select name="status" class="w-full border border-slate-300 rounded-lg px-3 py-2">
            ${['draft', 'sent', 'paid', 'overdue'].map((s) => `<option ${inv && inv.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Issue date</label>
          <input type="date" name="issue_date" value="${inv ? inv.issue_date : today}" class="w-full border border-slate-300 rounded-lg px-3 py-2">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Due date</label>
          <input type="date" name="due_date" value="${inv ? inv.due_date : today}" class="w-full border border-slate-300 rounded-lg px-3 py-2">
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <h3 class="font-semibold mb-3">Line items</h3>
        <div id="items"></div>
        <button type="button" onclick="addItem()" class="text-sm text-brand font-semibold mt-2">+ Add line</button>

        <div class="grid md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-100">
          <div>
            <label class="block text-sm font-medium mb-1">Tax rate (%)</label>
            <input type="number" step="0.01" name="tax_rate" value="${inv ? inv.tax_rate : 0}" class="w-full border border-slate-300 rounded-lg px-3 py-2" oninput="recalc()">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Discount (flat)</label>
            <input type="number" step="0.01" name="discount" value="${inv ? inv.discount : 0}" class="w-full border border-slate-300 rounded-lg px-3 py-2" oninput="recalc()">
          </div>
        </div>
        <div class="mt-5 ml-auto w-64 text-sm space-y-1">
          <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span id="t_subtotal">—</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Tax</span><span id="t_tax">—</span></div>
          <div class="flex justify-between text-lg font-extrabold border-t border-slate-100 pt-2"><span>Total</span><span id="t_total">—</span></div>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <label class="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea name="notes" rows="3" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Payment terms, thank-you note, bank details…">${inv ? esc(inv.notes) : ''}</textarea>
      </div>

      <div class="flex gap-3">
        <button class="bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-2.5 rounded-lg">${id ? 'Save changes' : 'Create invoice'}</button>
        <a href="#/invoices" class="px-6 py-2.5 rounded-lg font-medium text-slate-600 hover:bg-slate-100">Cancel</a>
      </div>
    </form>`);

  renderItems();
  recalc();
  document.getElementById('invForm').addEventListener('submit', (e) => submitInvoice(e, id));
}

function renderItems() {
  const wrap = document.getElementById('items');
  wrap.innerHTML = state._items.map((it, i) => `
    <div class="flex gap-2 mb-2 items-center">
      <input data-i="${i}" data-f="description" value="${esc(it.description)}" placeholder="Description" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" oninput="itemChange(this)">
      <input data-i="${i}" data-f="quantity" type="number" step="0.01" value="${it.quantity}" placeholder="Qty" class="w-20 border border-slate-300 rounded-lg px-2 py-2 text-sm text-right" oninput="itemChange(this)">
      <input data-i="${i}" data-f="unit_price" type="number" step="0.01" value="${it.unit_price}" placeholder="Price" class="w-28 border border-slate-300 rounded-lg px-2 py-2 text-sm text-right" oninput="itemChange(this)">
      <button type="button" onclick="removeItem(${i})" class="text-slate-400 hover:text-rose-600 w-8">✕</button>
    </div>`).join('');
}
function itemChange(el) {
  const i = +el.dataset.i, f = el.dataset.f;
  state._items[i][f] = f === 'description' ? el.value : el.value;
  recalc();
}
function addItem() { state._items.push({ description: '', quantity: 1, unit_price: 0 }); renderItems(); recalc(); }
function removeItem(i) { state._items.splice(i, 1); if (!state._items.length) state._items.push({ description: '', quantity: 1, unit_price: 0 }); renderItems(); recalc(); }
function recalc() {
  const form = document.getElementById('invForm'); if (!form) return;
  const subtotal = state._items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const discount = Number(form.discount.value) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (Number(form.tax_rate.value) || 0) / 100;
  document.getElementById('t_subtotal').textContent = money(subtotal);
  document.getElementById('t_tax').textContent = money(tax);
  document.getElementById('t_total').textContent = money(taxable + tax);
}
async function submitInvoice(e, id) {
  e.preventDefault();
  const f = e.target;
  const body = {
    client_id: Number(f.client_id.value),
    status: f.status.value,
    issue_date: f.issue_date.value,
    due_date: f.due_date.value,
    tax_rate: Number(f.tax_rate.value) || 0,
    discount: Number(f.discount.value) || 0,
    notes: f.notes.value,
    items: state._items.filter((it) => it.description || it.unit_price),
  };
  try {
    const data = id ? await API.put('/api/invoices/' + id, body) : await API.post('/api/invoices', body);
    toast(id ? 'Invoice saved' : 'Invoice created', 'success');
    go('/invoices/' + data.invoice.id);
  } catch (err) {
    if (err.data && err.data.upgrade) { toast(err.message, 'error'); setTimeout(() => go('/upgrade'), 800); }
    else toast(err.message, 'error');
  }
}

/* ---------------- Clients ---------------- */
async function renderClients() {
  shell('/clients', `<div class="text-slate-400">Loading…</div>`);
  let data;
  try { data = await API.get('/api/clients'); } catch (e) { return toast(e.message, 'error'); }
  const clients = data.clients;
  const sub = data.plan !== 'pro'
    ? `${clients.length} of ${data.freeLimit} used on free plan`
    : `${clients.length} total`;
  shell('/clients', `
    <div class="flex items-center justify-between mb-6">
      <div><h1 class="text-2xl font-bold">Clients</h1><p class="text-slate-500 text-sm">${sub}</p></div>
      <button onclick="clientForm()" class="bg-brand hover:bg-brand-dark text-white font-semibold px-4 py-2.5 rounded-lg text-sm">+ Add client</button>
    </div>
    <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      ${clients.length ? `<div class="divide-y divide-slate-100">${clients.map((c) => `
        <div class="flex items-center justify-between py-3">
          <div><div class="font-medium">${esc(c.name)}</div><div class="text-sm text-slate-500">${esc(c.company)} ${c.email ? '· ' + esc(c.email) : ''}</div></div>
          <div class="flex gap-2">
            <button onclick='clientForm(${JSON.stringify(c).replace(/'/g, "&#39;")})' class="text-sm text-slate-600 hover:text-brand px-2">Edit</button>
            <button onclick="deleteClient(${c.id})" class="text-sm text-rose-600 hover:bg-rose-50 px-2 rounded">Delete</button>
          </div>
        </div>`).join('')}</div>`
        : `<p class="text-slate-400 text-sm py-10 text-center">No clients yet. Add your first to start invoicing.</p>`}
    </div>
    <div id="modal"></div>`);
}
function clientForm(c) {
  c = c || {};
  document.getElementById('modal').innerHTML = `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40" onclick="if(event.target===this)closeModal()">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 fade-in">
        <h2 class="text-lg font-bold mb-4">${c.id ? 'Edit client' : 'Add client'}</h2>
        <form id="clientForm" class="space-y-3">
          <input name="name" required placeholder="Name *" value="${esc(c.name || '')}" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          <input name="company" placeholder="Company" value="${esc(c.company || '')}" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          <input name="email" type="email" placeholder="Email" value="${esc(c.email || '')}" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          <textarea name="address" rows="2" placeholder="Address" class="w-full border border-slate-300 rounded-lg px-3 py-2">${esc(c.address || '')}</textarea>
          <div class="flex gap-2 justify-end pt-2">
            <button type="button" onclick="closeModal()" class="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
            <button class="bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2 rounded-lg">Save</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('clientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { name: fd.get('name'), company: fd.get('company'), email: fd.get('email'), address: fd.get('address') };
    try {
      if (c.id) await API.put('/api/clients/' + c.id, body); else await API.post('/api/clients', body);
      toast('Saved', 'success'); closeModal(); renderClients();
    } catch (err) {
      if (err.data && err.data.upgrade) { closeModal(); toast(err.message, 'error'); setTimeout(() => go('/upgrade'), 800); }
      else toast(err.message, 'error');
    }
  });
}
function closeModal() { const m = document.getElementById('modal'); if (m) m.innerHTML = ''; }
async function deleteClient(id) {
  if (!confirm('Delete this client? Their invoices will also be removed.')) return;
  try { await API.del('/api/clients/' + id); toast('Client deleted', 'success'); renderClients(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ---------------- Settings ---------------- */
async function renderSettings() {
  const u = state.user;
  shell('/settings', `
    <h1 class="text-2xl font-bold mb-6">Settings</h1>
    <form id="profileForm" class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4 max-w-lg">
      <h3 class="font-semibold">Business profile</h3>
      <p class="text-sm text-slate-500 -mt-2">Shown on every invoice you send.</p>
      <div><label class="block text-sm font-medium mb-1">Business name</label>
        <input name="business_name" value="${esc(u.business_name)}" class="w-full border border-slate-300 rounded-lg px-3 py-2"></div>
      <div><label class="block text-sm font-medium mb-1">Business email</label>
        <input name="business_email" type="email" value="${esc(u.business_email)}" class="w-full border border-slate-300 rounded-lg px-3 py-2"></div>
      <div><label class="block text-sm font-medium mb-1">Address</label>
        <textarea name="business_address" rows="3" class="w-full border border-slate-300 rounded-lg px-3 py-2">${esc(u.business_address)}</textarea></div>
      <div><label class="block text-sm font-medium mb-1">Currency</label>
        <select name="currency" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          ${Object.keys(CURRENCY_SYMBOLS).map((c) => `<option ${u.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select></div>
      <button class="bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg">Save profile</button>
    </form>

    ${u.plan === 'pro' ? `
    <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm mt-6 max-w-lg">
      <h3 class="font-semibold">Business logo</h3>
      <p class="text-sm text-slate-500 mt-1">Appears on your invoices and the emails you send.</p>
      <div class="mt-4 flex items-center gap-4">
        <div class="w-32 h-20 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
          ${u.business_logo ? `<img src="${u.business_logo}" alt="logo" class="max-h-full max-w-full object-contain">` : `<span class="text-xs text-slate-400">No logo</span>`}
        </div>
        <div class="flex flex-col gap-2 items-start">
          <input id="logoInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onchange="uploadLogo(this)" class="text-sm">
          ${u.business_logo ? `<button type="button" onclick="removeLogo()" class="text-sm text-rose-600 hover:bg-rose-50 px-2 py-1 rounded">Remove logo</button>` : ''}
        </div>
      </div>
      <p class="text-xs text-slate-400 mt-2">PNG, JPG, GIF, WEBP or SVG · up to ~500KB.</p>
    </div>` : `
    <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm mt-6 max-w-lg">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold">Business logo <span class="text-xs font-bold bg-brand-light text-brand px-2 py-0.5 rounded ml-1">PRO</span></h3>
          <p class="text-sm text-slate-500 mt-1">Add your logo to invoices and emails. Available on Pro.</p>
        </div>
        <a href="#/upgrade" class="shrink-0 bg-brand hover:bg-brand-dark text-white font-semibold px-4 py-2 rounded-lg text-sm">Upgrade</a>
      </div>
    </div>`}

    <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm mt-6 max-w-lg">
      <h3 class="font-semibold">Plan</h3>
      <p class="text-sm text-slate-500 mt-1">You are on the <b>${u.plan === 'pro' ? 'Pro' : 'Free'}</b> plan.</p>
      ${u.plan === 'pro'
        ? `<button onclick="cancelPlan()" class="mt-4 border border-slate-300 hover:bg-slate-50 font-medium px-4 py-2 rounded-lg text-sm">Cancel subscription</button>`
        : `<a href="#/upgrade" class="inline-block mt-4 bg-brand hover:bg-brand-dark text-white font-semibold px-5 py-2.5 rounded-lg">Upgrade to Pro</a>`}
    </div>`);
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await API.put('/api/auth/me', Object.fromEntries(fd));
      state.user = data.user; toast('Profile saved', 'success'); renderSettings();
    } catch (err) { toast(err.message, 'error'); }
  });
}
async function cancelPlan() {
  if (!confirm('Cancel Pro and return to the Free plan?')) return;
  try { await API.post('/api/billing/cancel'); state.user.plan = 'free'; toast('Subscription canceled', 'success'); renderSettings(); }
  catch (e) { toast(e.message, 'error'); }
}
async function uploadLogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 500000) { toast('Image too large (max ~500KB)', 'error'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = await API.put('/api/auth/me', { business_logo: reader.result });
      state.user = data.user; toast('Logo saved', 'success'); renderSettings();
    } catch (err) {
      if (err.data && err.data.upgrade) { toast(err.message, 'error'); setTimeout(() => go('/upgrade'), 800); }
      else toast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}
async function removeLogo() {
  try { const data = await API.put('/api/auth/me', { business_logo: '' }); state.user = data.user; toast('Logo removed', 'success'); renderSettings(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ---------------- Upgrade ---------------- */
function renderUpgrade() {
  shell('/upgrade', `
    <div class="max-w-md mx-auto text-center">
      <h1 class="text-3xl font-extrabold">Upgrade to Pro</h1>
      <p class="text-slate-500 mt-2">Unlimited invoices and priority support.</p>
      <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm mt-6 text-left">
        <div class="text-4xl font-extrabold">$12<span class="text-base font-medium text-slate-400">/mo</span></div>
        <ul class="mt-5 space-y-2 text-sm text-slate-600">
          <li>✓ Unlimited invoices & clients</li><li>✓ Custom logo on invoices</li><li>✓ Full revenue dashboard & reports</li><li>✓ Shareable links & PDF</li><li>✓ Priority support</li>
        </ul>
        <button onclick="startCheckout()" class="w-full mt-6 bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-xl">Upgrade now</button>
        ${state.billingLive ? '' : '<p class="text-xs text-slate-400 mt-3 text-center">Demo mode: upgrade is instant and free (no Stripe key configured).</p>'}
      </div>
      <a href="#/dashboard" class="inline-block mt-4 text-sm text-slate-500">← Back to dashboard</a>
    </div>`);
}
async function startCheckout() {
  try {
    const data = await API.post('/api/billing/checkout');
    if (data.alreadyPro) { toast("You're already Pro", 'info'); return; }
    if (data.url && data.url.startsWith('http')) { window.location.href = data.url; return; }
    // mock upgrade
    state.user.plan = 'pro';
    toast('Welcome to Pro! 🎉', 'success');
    go('/dashboard');
  } catch (e) { toast(e.message, 'error'); }
}

// expose handlers used by inline onclick
Object.assign(window, {
  logout, setStatus, deleteInvoice, copyShare, sendInvoice, addItem, removeItem, itemChange, recalc,
  clientForm, closeModal, deleteClient, cancelPlan, startCheckout,
  checkVerified, resendVerification, uploadLogo, removeLogo,
});

// handle ?upgraded=1 redirect from Stripe
if (location.search.includes('upgraded=1')) {
  history.replaceState({}, '', location.pathname);
  setTimeout(() => toast('Payment successful — welcome to Pro! 🎉', 'success'), 400);
}
// handle ?verified=1/0 redirect from the email verification link
if (location.search.includes('verified=1')) {
  history.replaceState({}, '', location.pathname);
  setTimeout(() => toast('Email verified — you’re all set!', 'success'), 400);
} else if (location.search.includes('verified=0')) {
  history.replaceState({}, '', location.pathname);
  setTimeout(() => toast('That verification link was invalid or expired.', 'error'), 400);
}

boot();
