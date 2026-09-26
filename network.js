/* ==========================================================================
   Corner Market – Trade network
   Lets businesses that buy and sell goods work with suppliers and couriers
   that are registered on the platform.

   - Every business can order from suppliers and hire couriers.
   - A business can also switch on the "supplier" and/or "courier" role.
   - Orders move through one shared status flow that all sides can see.

   This file does not modify business.js. It reads the signed-in business from
   the shared store, adds a "Trade network" tab to the dashboard, saves role
   settings on the business record (business.network) and keeps orders in one
   shared list.
   ========================================================================== */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  if (typeof CM === 'undefined' || !$('#dashView') || !$('#panel-advisor')) return;
  const esc = v => CM.esc(String(v ?? ''));   // safe for numbers and empty values too

  /* ---------- Constants ---------- */
  const KEY = 'cm_trade_orders_v1';
  const DONE = ['completed', 'declined', 'cancelled'];
  const ROAD_FACTOR = 1.25;   // straight-line distance x 1.25 is a fair road estimate
  const VEHICLES = { bicycle: 'Bicycle', motorbike: 'Motorbike', car: 'Car', bakkie: 'Bakkie', truck: 'Truck' };
  const TERMS = { cash: 'Cash on delivery or collection', eft: 'EFT before dispatch', acct: '7-day account' };
  const COURIER_PAY = { cash: 'Cash to the courier', eft: 'EFT to the courier' };
  const JOB_LABEL = {
    requested: 'Waiting for the courier', accepted: 'Courier accepted', picked_up: 'Picked up',
    delivered: 'Delivered', declined: 'Courier declined', cancelled: 'Cancelled'
  };
  const ACTIONS = {
    s_accept:    { label: 'Accept order',        cls: 'btn-accent',  done: 'Order accepted.' },
    s_decline:   { label: 'Decline',             cls: 'btn-ghost',   done: 'Order declined.', ask: 'Decline this order?' },
    s_ready:     { label: 'Mark ready',          cls: 'btn-primary', done: 'Marked as ready.' },
    s_collected: { label: 'Mark collected',      cls: 'btn-primary', done: 'Marked as collected.' },
    s_out:       { label: 'Out for delivery',    cls: 'btn-primary', done: 'Marked as out for delivery.' },
    s_delivered: { label: 'Mark delivered',      cls: 'btn-primary', done: 'Marked as delivered.' },
    s_paid:      { label: 'Mark as paid',        cls: 'btn-ghost',   done: 'Marked as paid.' },
    j_accept:    { label: 'Accept delivery job', cls: 'btn-accent',  done: 'Delivery job accepted.' },
    j_decline:   { label: 'Decline',             cls: 'btn-ghost',   done: 'Delivery job declined.', ask: 'Decline this delivery job?' },
    j_pickup:    { label: 'Picked up',           cls: 'btn-primary', done: 'Marked as picked up.' },
    j_delivered: { label: 'Delivered',           cls: 'btn-primary', done: 'Marked as delivered.' },
    b_cancel:    { label: 'Cancel',              cls: 'btn-ghost',   done: 'Cancelled.', ask: 'Cancel this request?' }
  };
  // Actions that move an order forward and need someone's attention
  const PROGRESS = ['s_accept', 's_ready', 's_collected', 's_out', 's_delivered', 'j_accept', 'j_pickup', 'j_delivered'];

  /* ---------- Small helpers ---------- */
  const price = n => CM.formatPrice(n);
  const money = n => esc(price(n));
  const newId = () => 'o_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const allBusinesses = () => CM.getBusinesses();
  const addr = b => [b?.address?.street, b?.address?.suburb, b?.address?.city].filter(Boolean).join(', ');
  const place = b => [b?.address?.suburb, b?.address?.city].filter(Boolean).join(', ');
  const catLabel = b => (CM.catById(b.category) || {}).label || '';
  const fmtDate = iso => { try { return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const clone = v => JSON.parse(JSON.stringify(v));

  const meNow = () => {
    const id = CM.store.get(CM.KEYS.session, null);
    return id ? allBusinesses().find(b => b.id === id) || null : null;
  };

  /* ---------- Contact links ---------- */
  const waDigits = s => {
    const d = String(s || '').replace(/\D/g, '');
    return d.startsWith('0') ? '27' + d.slice(1) : d;   // local numbers -> South African international format
  };
  function contactLinks(b) {
    const out = [];
    if (b.phone) out.push(`<a class="btn btn-ghost btn-sm" href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ''))}">Call</a>`);
    const wa = b.whatsapp || b.phone;
    if (wa) out.push(`<a class="btn btn-whatsapp btn-sm" href="https://wa.me/${waDigits(wa)}" target="_blank" rel="noopener">WhatsApp</a>`);
    return out.join('');
  }

  /* ---------- Distance and delivery price ---------- */
  const rad = x => x * Math.PI / 180;
  function roadKm(a, b) {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const R = 6371;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
  }
  const kmText = d => d == null ? 'unknown distance' : (d < 10 ? d.toFixed(1) : Math.round(d)) + ' km';
  const courierFee = (cn, d) => d == null ? null : Math.round((+cn.courier.baseFee || 0) + (+cn.courier.perKm || 0) * d);

  /* ---------- Network profile (stored on the business record) ---------- */
  const defaultNet = () => ({
    supplies: false, delivers: false,
    supplier: { catalogue: [], leadDays: 1, minOrder: 0, terms: ['cash'], ownDelivery: false, ownDeliveryFee: 0, radiusKm: 30 },
    courier: { vehicle: 'bakkie', baseFee: 40, perKm: 8, radiusKm: 25, maxLoad: '', hours: '' }
  });
  function netOf(b) {
    const d = defaultNet(), n = b?.network || {};
    return {
      supplies: !!n.supplies, delivers: !!n.delivers,
      supplier: { ...d.supplier, ...(n.supplier || {}), catalogue: [...(n.supplier?.catalogue || [])] },
      courier: { ...d.courier, ...(n.courier || {}) }
    };
  }

  /* ---------- Orders storage (shared by every business) ---------- */
  function readOrders() {
    try {
      const v = CM.store.get(KEY, null);
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { const p = JSON.parse(v); if (Array.isArray(p)) return p; }
    } catch { /* fall through */ }
    try { const p = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  function writeOrders(list) {
    try {
      CM.store.set(KEY, list);
      if (JSON.stringify(readOrders()) === JSON.stringify(list)) return true;
    } catch { /* try the fallback */ }
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch { CM.toast('Could not save. Your device storage may be full.', 'error'); return false; }
  }
  const involves = (o, id) => o.fromId === id || o.supplierId === id || o.job?.courierId === id;
  const log = (o, by, text) => {
    const at = new Date().toISOString();
    o.history = [...(o.history || []), { at, by, text }];
    o.updatedAt = at;
  };

  /* ---------- Order rules: who can do what, and when ---------- */
  function actionsFor(o, myId) {
    const out = [];
    const isB = o.fromId === myId, isS = o.supplierId === myId, isJ = o.job?.courierId === myId;
    const st = o.status, js = o.job?.status;
    const live = !DONE.includes(st);

    if (isS && o.type === 'supply' && live) {
      if (st === 'requested') out.push('s_accept', 's_decline');
      if (st === 'accepted') out.push('s_ready');
      if (st === 'ready' && o.fulfilment === 'collect') out.push('s_collected');
      if (st === 'ready' && o.fulfilment === 'supplier') out.push('s_out');
      if (st === 'in_transit' && o.fulfilment === 'supplier') out.push('s_delivered');
    }
    if (isS && o.type === 'supply' && !o.paid && st !== 'declined' && st !== 'cancelled') out.push('s_paid');
    if (isJ && o.type === 'delivery' && !o.paid && st !== 'declined' && st !== 'cancelled') out.push('s_paid');

    if (isJ && live) {
      if (js === 'requested') out.push('j_accept', 'j_decline');
      if (js === 'accepted' && (o.type === 'delivery' || st === 'ready')) out.push('j_pickup');
      if (js === 'picked_up') out.push('j_delivered');
    }
    if (isB && live && (st === 'requested' || st === 'accepted' || (st === 'ready' && o.fulfilment === 'collect'))) out.push('b_cancel');
    return out;
  }

  const needsAction = (o, myId) => {
    if (DONE.includes(o.status)) return false;
    if (actionsFor(o, myId).some(a => PROGRESS.includes(a))) return true;
    return o.fromId === myId && o.job?.status === 'declined';
  };

  function statusInfo(o) {
    const map = o.type === 'delivery'
      ? { requested: ['Waiting for courier', 'warn'], accepted: ['Courier accepted', 'info'], in_transit: ['On the way', 'info'], completed: ['Delivered', 'ok'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'muted'] }
      : { requested: ['Waiting for supplier', 'warn'], accepted: ['Accepted', 'info'], ready: ['Ready', 'info'], in_transit: ['On the way', 'info'], completed: ['Completed', 'ok'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'muted'] };
    return map[o.status] || [o.status, 'muted'];
  }

  function hintFor(o, myId) {
    if (DONE.includes(o.status)) return '';
    const isB = o.fromId === myId, isS = o.supplierId === myId, isJ = o.job?.courierId === myId;
    const js = o.job?.status;
    if (isB && js === 'declined') return 'The courier declined this job. Choose another courier below.';
    if (isJ && js === 'accepted' && o.type === 'supply' && o.status !== 'ready') return 'Waiting for the supplier to mark the goods ready.';
    if (isB && o.type === 'supply' && o.status === 'ready' && o.fulfilment === 'collect') return 'Your order is ready. You can collect it now.';
    if (isB && o.type === 'supply' && o.fulfilment === 'courier' && js === 'requested' && o.status !== 'requested') return 'Waiting for the courier to accept the job.';
    if (isS && o.fulfilment === 'courier' && o.status === 'ready' && js !== 'picked_up') return 'Ready for the courier to collect.';
    return '';
  }

  /* ---------- UI state ---------- */
  const state = { bizId: null, view: 'orders', filter: 'all', q: '', target: null, courier: null, net: null };

  /* ---------- Inject the tab and panel (does not touch business.js) ---------- */
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.dataset.tab = 'network';
  tab.innerHTML = 'Trade network <span id="netBadge" class="net-badge" hidden></span>';
  $('.tab[data-tab="advisor"]').before(tab);

  const panel = document.createElement('div');
  panel.id = 'panel-network';
  panel.className = 'panel';
  panel.hidden = true;
  $('#panel-advisor').before(panel);

  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    $$('.panel').forEach(p => { p.hidden = p !== panel; });
    window.scrollTo({ top: 0 });
  });
  // Render whenever the panel is shown, however it was opened (tab or a "go to" button)
  new MutationObserver(() => { if (!panel.hidden) render(); })
    .observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => { if (!$('#dashView').hidden) updateBadge(); })
    .observe($('#dashView'), { attributes: true, attributeFilter: ['hidden'] });

  function updateBadge() {
    const badge = $('#netBadge'), b = meNow();
    const n = b ? readOrders().filter(o => needsAction(o, b.id)).length : 0;
    badge.hidden = !n;
    badge.innerHTML = n ? `<span aria-hidden="true">${n}</span><span class="sr-only"> ${n === 1 ? 'order needs' : 'orders need'} your action</span>` : '';
  }

  /* ---------- Main render ---------- */
  // Start from a clean slate whenever a different business signs in
  function syncUser(my) {
    if (state.bizId !== my.id) Object.assign(state, { bizId: my.id, view: 'orders', filter: 'all', q: '', target: null, courier: null, net: null });
  }

  function go(view) {
    const my = meNow();
    if (my) syncUser(my);
    state.view = view;
    render();
    window.scrollTo({ top: 0 });
  }

  function render() {
    const my = meNow();
    if (!my) return;
    syncUser(my);

    const orders = readOrders().filter(o => involves(o, my.id));
    const pending = orders.filter(o => needsAction(o, my.id)).length;
    const open = orders.filter(o => !DONE.includes(o.status)).length;
    const partners = allBusinesses().filter(b => b.id !== my.id && (netOf(b).supplies || netOf(b).delivers)).length;
    const group = { orders: ['orders', 'orderDelivery'], find: ['find', 'orderSupply'], setup: ['setup'] };
    const nav = (id, label) => `<button type="button" data-net-view="${id}" ${group[id].includes(state.view) ? 'aria-current="page"' : ''}>${label}</button>`;

    panel.innerHTML = `
      ${my.lat == null ? `<div class="notice notice-warn">
        <strong>Add your address to get distances and delivery prices.</strong>
        <span>Suppliers and couriers are sorted by how close they are to you.</span>
        <button type="button" class="btn btn-accent btn-sm" data-goto="profile">Add address</button></div>` : ''}
      <div class="stats">
        <div class="stat"><span class="stat-num">${pending}</span><span class="stat-label">Need your action</span></div>
        <div class="stat"><span class="stat-num">${open}</span><span class="stat-label">Open orders and jobs</span></div>
        <div class="stat"><span class="stat-num">${partners}</span><span class="stat-label">Suppliers and couriers on Corner Market</span></div>
      </div>
      <nav class="net-nav" aria-label="Trade network sections">
        ${nav('orders', 'Orders and deliveries')}${nav('find', 'Find suppliers and couriers')}${nav('setup', 'Your role')}
      </nav>
      <div id="netBody"></div>`;

    const views = { orders: viewOrders, find: viewFind, setup: viewSetup, orderSupply: viewOrderSupply, orderDelivery: viewOrderDelivery };
    (views[state.view] || viewOrders)($('#netBody', panel), my);
    updateBadge();
  }

  /* ==========================================================================
     Orders view
     ========================================================================== */
  function orderCard(o, my, byId) {
    const isB = o.fromId === my.id, isS = o.supplierId === my.id, isJ = o.job?.courierId === my.id;
    const nm = id => byId[id] ? esc(byId[id].name) : 'Unknown business';
    const [label, tone] = statusInfo(o);
    const live = !DONE.includes(o.status);

    let title;
    if (o.type === 'supply') title = isB ? `Order from ${nm(o.supplierId)}` : isS ? `Order from ${nm(o.fromId)}` : `Delivery from ${nm(o.supplierId)} to ${nm(o.fromId)}`;
    else title = isB ? 'Delivery request' : `Delivery for ${nm(o.fromId)}`;

    const what = o.type === 'supply'
      ? (o.items || []).map(i => `${i.qty} × ${esc(i.name)}${i.unit ? ` (${esc(i.unit)})` : ''}`).join(', ')
      : esc(o.parcel || 'Parcel');

    const rows = [];
    if (o.type === 'supply') {
      const how = o.fulfilment === 'collect' ? 'Buyer collects'
        : o.fulfilment === 'supplier' ? `Supplier delivers, ${o.deliveryFee ? money(o.deliveryFee) : 'free'}`
        : `Courier ${nm(o.job?.courierId)}`;
      rows.push(['Pay the supplier', money((o.goodsTotal || 0) + (o.fulfilment === 'supplier' ? (o.deliveryFee || 0) : 0))]);
      rows.push(['How it gets there', how]);
      rows.push(['Payment', `${esc(TERMS[o.payment] || '')}${o.paid ? ', paid' : ''}`]);
    } else {
      rows.push(['Courier fee', o.job?.fee != null ? money(o.job.fee) : 'To be agreed']);
      rows.push(['Payment', `${esc(COURIER_PAY[o.payment] || '')}${o.paid ? ', paid' : ''}`]);
    }
    if (o.neededBy) rows.push(['Needed by', esc(o.neededBy)]);

    const jobLine = o.job
      ? `<p class="net-line"><strong>Delivery:</strong> ${esc(JOB_LABEL[o.job.status] || '')}. From ${esc(o.job.pickup)} to ${esc(o.job.dropoff)}${o.job.distanceKm != null ? `, about ${esc(kmText(o.job.distanceKm))}` : ''}.${o.type === 'supply' ? ` Courier fee ${o.job.fee != null ? money(o.job.fee) : 'to be agreed'}, paid to the courier.` : ''}</p>`
      : '';

    const parties = [];
    if (!isB && byId[o.fromId]) parties.push([o.type === 'supply' ? 'Buyer' : 'Requested by', byId[o.fromId]]);
    if (o.supplierId && !isS && byId[o.supplierId]) parties.push(['Supplier', byId[o.supplierId]]);
    if (o.job && !isJ && byId[o.job.courierId]) parties.push(['Courier', byId[o.job.courierId]]);
    const contacts = live ? parties.map(([role, b]) => `
      <div class="net-contact"><span>${role}: <strong>${esc(b.name)}</strong>${place(b) ? `, ${esc(place(b))}` : ''}</span>${contactLinks(b)}</div>`).join('') : '';

    const hint = hintFor(o, my.id);
    const buttons = actionsFor(o, my.id).map(a => `<button type="button" class="btn ${ACTIONS[a].cls} btn-sm" data-order="${esc(o.id)}" data-act="${a}">${a === 'b_cancel' ? (o.type === 'supply' ? 'Cancel order' : 'Cancel request') : ACTIONS[a].label}</button>`).join('');

    let recourier = '';
    if (isB && live && o.job?.status === 'declined') {
      const options = allBusinesses()
        .filter(c => c.id !== my.id && c.id !== o.supplierId && c.id !== o.job.courierId && netOf(c).delivers)
        .map(c => ({ c, fee: courierFee(netOf(c), o.job.distanceKm) }))
        .sort((a, b) => (a.fee ?? 1e9) - (b.fee ?? 1e9));
      recourier = options.length ? `
        <div class="net-recourier">
          <label class="sr-only" for="re_${esc(o.id)}">Choose another courier</label>
          <select id="re_${esc(o.id)}">${options.map(x => `<option value="${esc(x.c.id)}">${esc(x.c.name)} (${x.fee != null ? money(x.fee) : 'fee to be agreed'})</option>`).join('')}</select>
          <button type="button" class="btn btn-accent btn-sm" data-order="${esc(o.id)}" data-act="b_recourier">Send to this courier</button>
        </div>` : '<p class="muted small">No other couriers are registered yet. You can cancel this and collect the goods yourself.</p>';
    }

    const activity = (o.history || []).slice().reverse().map(h => `<li>${esc(fmtDate(h.at))}: ${esc(h.text)}</li>`).join('');

    return `
      <article class="box net-order">
        <header>
          <h3>${title}</h3>
          <span class="net-pill net-pill-${tone}">${esc(label)}</span>
        </header>
        <p class="net-line">${what}</p>
        <dl class="net-meta">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${jobLine}
        ${o.note ? `<p class="net-line muted">Note: ${esc(o.note)}</p>` : ''}
        ${hint ? `<p class="net-hint">${esc(hint)}</p>` : ''}
        ${contacts}
        ${recourier}
        ${buttons ? `<div class="net-actions">${buttons}</div>` : ''}
        <details class="net-log"><summary>Activity</summary><ul>${activity}</ul></details>
      </article>`;
  }

  function viewOrders(body, my) {
    const byId = Object.fromEntries(allBusinesses().map(b => [b.id, b]));
    const orders = readOrders().filter(o => involves(o, my.id))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const groups = [
      ['Needs your action', orders.filter(o => needsAction(o, my.id))],
      ['In progress', orders.filter(o => !DONE.includes(o.status) && !needsAction(o, my.id))],
      ['Finished', orders.filter(o => DONE.includes(o.status)).slice(0, 20)]
    ].filter(g => g[1].length);

    body.innerHTML = `
      <div class="row net-toolbar">
        <button type="button" class="btn btn-primary btn-sm" data-net-view="find">Find a supplier or courier</button>
        <button type="button" class="btn btn-ghost btn-sm" data-net-view="orderDelivery">Request a delivery</button>
      </div>` + (groups.length
      ? groups.map(([t, l]) => `<section class="net-group"><h2>${t}</h2>${l.map(o => orderCard(o, my, byId)).join('')}</section>`).join('')
      : `<section class="box"><h2>No orders yet</h2>
          <p class="muted">Order stock from a supplier, or ask a courier to deliver something for you. Orders from other businesses will show up here too.</p>
          <button type="button" class="btn btn-accent btn-sm" data-net-view="find">Find a supplier or courier</button></section>`);
  }

  function handleAction(id, act, extra) {
    const my = meNow();
    const list = readOrders();
    const o = list.find(x => x.id === id);
    if (!my || !o) return;

    if (act === 'b_recourier') {
      const c = allBusinesses().find(b => b.id === extra);
      if (o.fromId !== my.id || o.job?.status !== 'declined' || DONE.includes(o.status)) return;
      if (!c || !netOf(c).delivers || c.id === my.id || c.id === o.supplierId) return CM.toast('Choose a courier from the list.', 'error');
      o.job = { ...o.job, courierId: c.id, status: 'requested', fee: courierFee(netOf(c), o.job.distanceKm) };
      if (o.type === 'delivery') o.status = 'requested';
      log(o, my.id, `Sent the delivery job to ${c.name}.`);
      if (writeOrders(list)) { render(); CM.toast('Delivery job sent to ' + c.name + '.', 'success'); }
      return;
    }

    const spec = ACTIONS[act];
    if (!spec || !actionsFor(o, my.id).includes(act)) return;
    if (spec.ask && !window.confirm(spec.ask)) return;

    const closeJob = () => { if (o.job && !['delivered', 'declined'].includes(o.job.status)) o.job.status = 'cancelled'; };
    let text;
    switch (act) {
      case 's_accept': o.status = 'accepted'; text = 'Supplier accepted the order.'; break;
      case 's_decline': o.status = 'declined'; closeJob(); text = 'Supplier declined the order.'; break;
      case 's_ready': o.status = 'ready'; text = 'Goods are ready.'; break;
      case 's_collected': o.status = 'completed'; text = 'Buyer collected the goods.'; break;
      case 's_out': o.status = 'in_transit'; text = 'Supplier is delivering the goods.'; break;
      case 's_delivered': o.status = 'completed'; text = 'Goods delivered by the supplier.'; break;
      case 's_paid': o.paid = true; text = 'Payment received.'; break;
      case 'j_accept': o.job.status = 'accepted'; if (o.type === 'delivery') o.status = 'accepted'; text = 'Courier accepted the job.'; break;
      case 'j_decline': o.job.status = 'declined'; if (o.type === 'delivery') o.status = 'declined'; text = 'Courier declined the job.'; break;
      case 'j_pickup': o.job.status = 'picked_up'; o.status = 'in_transit'; text = 'Courier picked up the goods.'; break;
      case 'j_delivered': o.job.status = 'delivered'; o.status = 'completed'; text = 'Courier delivered the goods.'; break;
      case 'b_cancel': o.status = 'cancelled'; closeJob(); text = 'Cancelled by the person who ordered.'; break;
      default: return;
    }
    log(o, my.id, text);
    if (writeOrders(list)) { render(); CM.toast(spec.done, 'success'); }
  }

  /* ==========================================================================
     Find suppliers and couriers
     ========================================================================== */
  function viewFind(body, my) {
    body.innerHTML = `
      <div class="box net-find">
        <div class="field">
          <label for="netSearch">Search suppliers and couriers</label>
          <input id="netSearch" type="search" autocomplete="off" placeholder="For example: maize meal, bakkie, cooking oil" value="${esc(state.q)}">
        </div>
        <div class="row" role="group" aria-label="Show">
          ${[['all', 'Everyone'], ['suppliers', 'Suppliers'], ['couriers', 'Couriers']]
            .map(([k, l]) => `<button type="button" class="chip-btn" data-filter="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}
        </div>
      </div>
      <div id="netResults"></div>`;

    const paint = () => {
      const q = state.q.trim().toLowerCase();
      let list = allBusinesses().filter(b => b.id !== my.id)
        .map(b => ({ b, n: netOf(b), d: roadKm(my, b) }))
        .filter(x => x.n.supplies || x.n.delivers);
      if (state.filter === 'suppliers') list = list.filter(x => x.n.supplies);
      if (state.filter === 'couriers') list = list.filter(x => x.n.delivers);
      if (q) list = list.filter(x => [x.b.name, x.b.description, catLabel(x.b), ...x.n.supplier.catalogue.map(i => i.name),
        x.n.delivers ? VEHICLES[x.n.courier.vehicle] : ''].join(' ').toLowerCase().includes(q));
      list.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));

      $('#netResults', body).innerHTML = list.length ? list.map(({ b, n, d }) => {
        const tags = [n.supplies && 'Supplier', n.delivers && 'Courier'].filter(Boolean)
          .map(t => `<span class="net-tag">${t}</span>`).join('');
        const cat = n.supplier.catalogue;
        const supplyLine = n.supplies ? `<p class="net-line"><strong>Sells:</strong> ${cat.slice(0, 4).map(i => esc(i.name)).join(', ')}${cat.length > 4 ? ` and ${cat.length - 4} more` : ''}.
          Minimum order ${money(n.supplier.minOrder || 0)}. Ready in about ${esc(n.supplier.leadDays)} ${+n.supplier.leadDays === 1 ? 'day' : 'days'}.
          ${n.supplier.ownDelivery ? `Delivers within ${esc(n.supplier.radiusKm)} km.` : 'Collection only.'}</p>` : '';
        const courierLine = n.delivers ? `<p class="net-line"><strong>Delivers by ${esc((VEHICLES[n.courier.vehicle] || '').toLowerCase())}:</strong>
          ${money(n.courier.baseFee)} plus ${money(n.courier.perKm)} per km, within ${esc(n.courier.radiusKm)} km.${n.courier.maxLoad ? ` Carries ${esc(n.courier.maxLoad)}.` : ''}${n.courier.hours ? ` ${esc(n.courier.hours)}.` : ''}</p>` : '';
        return `
          <article class="box net-partner">
            <div class="net-partner-head"><h3>${esc(b.name)}</h3><span class="net-tags">${tags}</span></div>
            <p class="muted small">${esc(catLabel(b))}${place(b) ? `, ${esc(place(b))}` : ''}. ${d == null ? 'Distance unknown' : esc(kmText(d)) + ' from you'}.</p>
            ${b.description ? `<p class="net-line">${esc(b.description)}</p>` : ''}
            ${supplyLine}${courierLine}
            <div class="net-actions">
              ${n.supplies ? `<button type="button" class="btn btn-accent btn-sm" data-net-view="orderSupply" data-target="${esc(b.id)}">Order from ${esc(b.name)}</button>` : ''}
              ${n.delivers ? `<button type="button" class="btn btn-primary btn-sm" data-net-view="orderDelivery" data-courier="${esc(b.id)}">Request a delivery</button>` : ''}
              ${contactLinks(b)}
            </div>
          </article>`;
      }).join('') : `<section class="box"><h2>Nobody matches yet</h2>
        <p class="muted">Suppliers and couriers appear here as soon as they switch on their role. Try a shorter search, or check back soon.</p></section>`;
    };

    $('#netSearch', body).addEventListener('input', e => { state.q = e.target.value; paint(); });
    $$('[data-filter]', body).forEach(btn => btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      $$('[data-filter]', body).forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
      paint();
    }));
    paint();
  }

  /* ==========================================================================
     Order from a supplier
     ========================================================================== */
  function viewOrderSupply(body, my) {
    const s = allBusinesses().find(b => b.id === state.target);
    const sn = s && netOf(s);
    if (!s || !sn.supplies || s.id === my.id) { state.view = 'find'; return viewFind(body, my); }
    const sup = sn.supplier;
    const minOrder = +sup.minOrder || 0;
    const d = roadKm(my, s);
    const inRange = d == null || d <= (+sup.radiusKm || 0);
    const jobKm = roadKm(s, my);

    const couriers = allBusinesses()
      .filter(c => c.id !== my.id && c.id !== s.id && netOf(c).delivers)
      .map(c => { const cn = netOf(c); return { b: c, cn, toPickup: roadKm(c, s), fee: courierFee(cn, jobKm) }; })
      .filter(x => x.toPickup == null || x.toPickup <= (+x.cn.courier.radiusKm || 0))
      .sort((a, b) => (a.fee ?? 1e9) - (b.fee ?? 1e9));

    const terms = sup.terms.filter(t => TERMS[t]);
    if (!terms.length) terms.push('cash');
    body.innerHTML = `
      <form id="supplyForm" class="form box">
        <h2>Order from ${esc(s.name)}</h2>
        <p class="muted">${esc(catLabel(s))}${place(s) ? `, ${esc(place(s))}` : ''}. ${d == null ? '' : esc(kmText(d)) + ' from you. '}Ready in about ${esc(sup.leadDays)} ${+sup.leadDays === 1 ? 'day' : 'days'}. Minimum order ${money(minOrder)}.</p>

        <div class="net-items">
          ${sup.catalogue.map(i => `
            <div class="net-item">
              <span><strong>${esc(i.name)}</strong> <small class="muted">${esc(i.unit)}</small></span>
              <span>${money(i.price)}</span>
              <input type="number" min="0" max="999" step="1" value="0" inputmode="numeric" data-item="${esc(i.id)}" aria-label="Quantity of ${esc(i.name)}">
            </div>`).join('')}
        </div>

        <fieldset class="net-fieldset">
          <legend>How will you get it?</legend>
          <label class="net-choice"><input type="radio" name="fulfil" value="collect" checked><span>I will collect it. <small class="muted">No delivery cost.</small></span></label>
          <label class="net-choice"${sup.ownDelivery && inRange ? '' : ' aria-disabled="true"'}>
            <input type="radio" name="fulfil" value="supplier"${sup.ownDelivery && inRange ? '' : ' disabled'}>
            <span>${esc(s.name)} delivers.
              <small class="muted">${!sup.ownDelivery ? 'They do not deliver themselves.' : !inRange ? `You are outside their ${esc(sup.radiusKm)} km delivery range.` : (+sup.ownDeliveryFee ? money(sup.ownDeliveryFee) : 'Free delivery.')}</small></span>
          </label>
          <label class="net-choice"${couriers.length ? '' : ' aria-disabled="true"'}>
            <input type="radio" name="fulfil" value="courier"${couriers.length ? '' : ' disabled'}>
            <span>Hire a courier.
              <small class="muted">${couriers.length ? (my.lat == null ? 'Add your address to see delivery prices.' : 'Prices are estimated from the distance.') : 'No couriers cover this supplier yet.'}</small></span>
          </label>
          <div id="courierPick" class="field" hidden>
            <label for="supCourier">Courier</label>
            <select id="supCourier" name="courier">${couriers.map(x => `<option value="${esc(x.b.id)}">${esc(x.b.name)} (${esc(VEHICLES[x.cn.courier.vehicle] || '')}, ${x.fee != null ? money(x.fee) : 'fee to be agreed'})</option>`).join('')}</select>
          </div>
        </fieldset>

        <div class="grid-2">
          <div class="field">
            <label for="supNeeded">Needed by (optional)</label>
            <input id="supNeeded" name="needed" type="date" min="${esc(CM.today())}">
          </div>
          <div class="field">
            <label for="supPay">How will you pay?</label>
            <select id="supPay" name="payment">${terms.map(t => `<option value="${t}">${esc(TERMS[t])}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field">
          <label for="supNote">Note to the supplier (optional)</label>
          <textarea id="supNote" name="note" rows="2" maxlength="200"></textarea>
        </div>

        <div id="supplySummary" class="net-total" aria-live="polite"></div>
        <div class="row">
          <button type="submit" class="btn btn-accent btn-lg">Send order</button>
          <button type="button" class="btn btn-ghost" data-net-view="find">Back</button>
        </div>
      </form>`;

    const form = $('#supplyForm', body);
    const read = () => {
      const qty = {};
      $$('[data-item]', form).forEach(inp => { const q = Math.max(0, Math.floor(+inp.value || 0)); if (q) qty[inp.dataset.item] = q; });
      const items = sup.catalogue.filter(i => qty[i.id]).map(i => ({ name: i.name, unit: i.unit, price: +i.price || 0, qty: qty[i.id] }));
      const goods = items.reduce((t, i) => t + i.price * i.qty, 0);
      const fulfil = form.elements.fulfil.value;
      const c = couriers.find(x => x.b.id === (form.elements.courier ? form.elements.courier.value : ''));
      return { items, goods, fulfil, c };
    };
    const paint = () => {
      const { goods, fulfil, c } = read();
      $('#courierPick', form).hidden = fulfil !== 'courier';
      const ownFee = fulfil === 'supplier' ? (+sup.ownDeliveryFee || 0) : 0;
      const line = (k, v) => `<div><span>${k}</span><strong>${v}</strong></div>`;
      let html = line('Goods', money(goods));
      if (fulfil === 'supplier') html += line('Delivery by the supplier', ownFee ? money(ownFee) : 'Free');
      html += `<div class="net-grand"><span>You pay the supplier</span><strong>${money(goods + ownFee)}</strong></div>`;
      if (fulfil === 'courier') html += line('Courier fee, paid to the courier', c && c.fee != null ? money(c.fee) : 'To be agreed');
      if (goods > 0 && goods < minOrder) html += `<p class="net-warn">Add ${money(minOrder - goods)} more to reach the minimum order of ${money(minOrder)}.</p>`;
      $('#supplySummary', form).innerHTML = html;
    };
    form.addEventListener('input', paint);
    form.addEventListener('change', paint);
    paint();

    form.addEventListener('submit', e => {
      e.preventDefault();
      const { items, goods, fulfil, c } = read();
      if (!items.length) return CM.toast('Choose at least one item and a quantity.', 'error');
      if (goods < minOrder) return CM.toast(`The minimum order is ${price(minOrder)}.`, 'error');
      if (fulfil === 'supplier' && !inRange) return CM.toast('You are outside this supplier\'s delivery range.', 'error');
      if (fulfil === 'courier' && !c) return CM.toast('Choose a courier.', 'error');

      const now = new Date().toISOString();
      const order = {
        id: newId(), type: 'supply', fromId: my.id, supplierId: s.id,
        items, goodsTotal: goods, fulfilment: fulfil,
        deliveryFee: fulfil === 'supplier' ? (+sup.ownDeliveryFee || 0) : 0,
        neededBy: form.elements.needed.value || '', payment: form.elements.payment.value,
        note: form.elements.note.value.trim(), paid: false, status: 'requested',
        createdAt: now, updatedAt: now,
        history: [{ at: now, by: my.id, text: `Order sent to ${s.name}.` }],
        job: fulfil === 'courier' ? {
          courierId: c.b.id, status: 'requested', fee: c.fee,
          distanceKm: jobKm == null ? null : Math.round(jobKm * 10) / 10,
          pickup: addr(s) || s.name, dropoff: addr(my) || my.name
        } : null
      };
      const list = readOrders();
      list.unshift(order);
      if (!writeOrders(list)) return;
      state.view = 'orders';
      render();
      window.scrollTo({ top: 0 });
      CM.toast(`Order sent to ${s.name}. You will see their reply here.`, 'success');
    });
  }

  /* ==========================================================================
     Request a delivery (no goods order needed)
     ========================================================================== */
  function viewOrderDelivery(body, my) {
    if (my.lat == null) {
      body.innerHTML = `<section class="box"><h2>Request a delivery</h2>
        <p class="muted">The courier collects from your business, so we need your address first.</p>
        <button type="button" class="btn btn-accent btn-sm" data-goto="profile">Add address</button>
        <button type="button" class="btn btn-ghost btn-sm" data-net-view="orders">Back</button></section>`;
      return;
    }
    const couriers = allBusinesses()
      .filter(c => c.id !== my.id && netOf(c).delivers)
      .map(c => ({ b: c, cn: netOf(c), km: roadKm(c, my) }))
      .filter(x => x.km == null || x.km <= (+x.cn.courier.radiusKm || 0))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));

    if (!couriers.length) {
      body.innerHTML = `<section class="box"><h2>Request a delivery</h2>
        <p class="muted">No couriers cover your area yet. Couriers appear here as soon as they register and switch on delivery.</p>
        <button type="button" class="btn btn-ghost btn-sm" data-net-view="orders">Back</button></section>`;
      return;
    }

    body.innerHTML = `
      <form id="deliveryForm" class="form box">
        <h2>Request a delivery</h2>
        <p class="muted">A courier collects from ${esc(addr(my) || my.name)} and takes it to your drop-off address.</p>
        <div class="field">
          <label for="delParcel">What needs to be delivered?</label>
          <input id="delParcel" name="parcel" required maxlength="80" placeholder="For example: 3 boxes of bread rolls">
        </div>
        <div class="field">
          <label for="delDrop">Drop-off address</label>
          <input id="delDrop" name="dropoff" required maxlength="120" placeholder="Street, suburb and town">
        </div>
        <div class="field">
          <label for="delCourier">Courier</label>
          <select id="delCourier" name="courier">${couriers.map(x => `<option value="${esc(x.b.id)}"${x.b.id === state.courier ? ' selected' : ''}>${esc(x.b.name)}: ${esc(VEHICLES[x.cn.courier.vehicle] || '')}, ${money(x.cn.courier.baseFee)} plus ${money(x.cn.courier.perKm)} per km${x.km != null ? `, ${esc(kmText(x.km))} from you` : ''}</option>`).join('')}</select>
          <small>The exact fee is worked out from the distance when you send the request.</small>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="delNeeded">Needed by (optional)</label>
            <input id="delNeeded" name="needed" type="date" min="${esc(CM.today())}">
          </div>
          <div class="field">
            <label for="delPay">How will you pay the courier?</label>
            <select id="delPay" name="payment">${Object.entries(COURIER_PAY).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field">
          <label for="delNote">Note to the courier (optional)</label>
          <textarea id="delNote" name="note" rows="2" maxlength="200"></textarea>
        </div>
        <div class="row">
          <button type="submit" class="btn btn-accent btn-lg">Send request</button>
          <button type="button" class="btn btn-ghost" data-net-view="orders">Back</button>
        </div>
      </form>`;

    const form = $('#deliveryForm', body);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.submitter;
      if (btn) btn.disabled = true;
      try {
        const c = couriers.find(x => x.b.id === form.elements.courier.value);
        const dropText = form.elements.dropoff.value.trim();
        const parcel = form.elements.parcel.value.trim();
        if (!c || !parcel || !dropText) return CM.toast('Add what you are sending, the drop-off address and a courier.', 'error');
        let to = null;
        try { to = await CM.geocode(dropText); } catch { to = null; }
        if (!to) return CM.toast('We could not find that drop-off address. Add the suburb or town and try again.', 'error');

        const km = roadKm(my, to);
        const fee = courierFee(c.cn, km);
        const now = new Date().toISOString();
        const order = {
          id: newId(), type: 'delivery', fromId: my.id, supplierId: null,
          items: [], parcel, goodsTotal: 0, fulfilment: 'courier', deliveryFee: 0,
          neededBy: form.elements.needed.value || '', payment: form.elements.payment.value,
          note: form.elements.note.value.trim(), paid: false, status: 'requested',
          createdAt: now, updatedAt: now,
          history: [{ at: now, by: my.id, text: `Delivery requested from ${c.b.name}.` }],
          job: { courierId: c.b.id, status: 'requested', fee, distanceKm: Math.round(km * 10) / 10, pickup: addr(my) || my.name, dropoff: dropText }
        };
        const list = readOrders();
        list.unshift(order);
        if (!writeOrders(list)) return;
        state.view = 'orders';
        state.courier = null;
        render();
        window.scrollTo({ top: 0 });
        CM.toast(`Request sent to ${c.b.name}. The fee is ${price(fee)}.`, 'success');
      } finally { if (btn) btn.disabled = false; }
    });
  }

  /* ==========================================================================
     Your role: supplier and courier settings
     ========================================================================== */
  function viewSetup(body, my) {
    if (!state.net) state.net = clone(netOf(my));
    const n = state.net, sp = n.supplier, cr = n.courier;

    body.innerHTML = `
      <form id="netSetup" class="form box">
        <h2>How you work with other businesses</h2>
        <p class="muted">Every business can order from suppliers and hire couriers. Turn on a role below if you also serve other businesses. You appear in Find suppliers and couriers as soon as you save.</p>

        <div class="net-role">
          <label class="switch"><input type="checkbox" name="supplies"${n.supplies ? ' checked' : ''}><span>I supply goods to other businesses</span></label>
          <div id="supplierSettings" class="net-sub"${n.supplies ? '' : ' hidden'}>
            <div class="grid-2">
              <div class="field"><label for="nsLead">Days to prepare an order</label>
                <input id="nsLead" name="leadDays" type="number" min="0" max="60" step="1" value="${esc(sp.leadDays)}"></div>
              <div class="field"><label for="nsMin">Minimum order (rand)</label>
                <input id="nsMin" name="minOrder" type="number" min="0" step="1" value="${esc(sp.minOrder)}"></div>
            </div>
            <fieldset class="net-fieldset">
              <legend>How buyers can pay you</legend>
              ${Object.entries(TERMS).map(([k, v]) => `<label class="net-choice"><input type="checkbox" name="terms" value="${k}"${sp.terms.includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}
            </fieldset>
            <label class="switch"><input type="checkbox" name="ownDelivery"${sp.ownDelivery ? ' checked' : ''}><span>I deliver to buyers myself</span></label>
            <div id="ownDeliveryBox" class="grid-2"${sp.ownDelivery ? '' : ' hidden'}>
              <div class="field"><label for="nsOwnFee">Delivery fee (rand, 0 for free)</label>
                <input id="nsOwnFee" name="ownDeliveryFee" type="number" min="0" step="1" value="${esc(sp.ownDeliveryFee)}"></div>
              <div class="field"><label for="nsOwnKm">I deliver up to (km)</label>
                <input id="nsOwnKm" name="radiusKm" type="number" min="1" step="1" value="${esc(sp.radiusKm)}"></div>
            </div>

            <h3>Your catalogue</h3>
            <p class="muted small">Buyers pick from this list. Use your trade prices, not your shop prices.</p>
            <div class="item-form">
              <div class="field"><label for="catName">Item</label><input id="catName" maxlength="60" placeholder="For example: Maize meal"></div>
              <div class="field"><label for="catUnit">Sold per</label><input id="catUnit" maxlength="20" placeholder="10 kg bag"></div>
              <div class="field field-small"><label for="catPrice">Price</label><input id="catPrice" type="number" min="0" step="0.5" inputmode="decimal" placeholder="95"></div>
              <button type="button" id="catAdd" class="btn btn-primary">Add item</button>
            </div>
            <ul id="catList" class="list"></ul>
            <button type="button" id="catCopy" class="link-btn">Copy items from my products list</button>
          </div>
        </div>

        <div class="net-role">
          <label class="switch"><input type="checkbox" name="delivers"${n.delivers ? ' checked' : ''}><span>I deliver goods for other businesses</span></label>
          <div id="courierSettings" class="net-sub"${n.delivers ? '' : ' hidden'}>
            <div class="grid-2">
              <div class="field"><label for="ncVehicle">Vehicle</label>
                <select id="ncVehicle" name="vehicle">${Object.entries(VEHICLES).map(([k, v]) => `<option value="${k}"${cr.vehicle === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
              <div class="field"><label for="ncLoad">What you can carry (optional)</label>
                <input id="ncLoad" name="maxLoad" maxlength="40" value="${esc(cr.maxLoad)}" placeholder="For example: up to 1 ton"></div>
            </div>
            <div class="grid-2">
              <div class="field"><label for="ncBase">Starting fee (rand)</label>
                <input id="ncBase" name="baseFee" type="number" min="0" step="1" value="${esc(cr.baseFee)}"></div>
              <div class="field"><label for="ncKm">Fee per km (rand)</label>
                <input id="ncKm" name="perKm" type="number" min="0" step="0.5" value="${esc(cr.perKm)}"></div>
            </div>
            <div class="grid-2">
              <div class="field"><label for="ncRadius">You work within (km of your address)</label>
                <input id="ncRadius" name="courierRadius" type="number" min="1" step="1" value="${esc(cr.radiusKm)}"></div>
              <div class="field"><label for="ncHours">Delivery hours (optional)</label>
                <input id="ncHours" name="hours" maxlength="60" value="${esc(cr.hours)}" placeholder="Mon to Sat, 06:00 to 18:00"></div>
            </div>
          </div>
        </div>

        <button type="submit" class="btn btn-accent btn-lg">Save trade settings</button>
      </form>`;

    const form = $('#netSetup', body);
    const toggle = (name, id) => form.elements[name].addEventListener('change', e => { $(id, form).hidden = !e.target.checked; });
    toggle('supplies', '#supplierSettings');
    toggle('delivers', '#courierSettings');
    toggle('ownDelivery', '#ownDeliveryBox');

    const paintCat = () => {
      $('#catList', form).innerHTML = sp.catalogue.length
        ? sp.catalogue.map((i, k) => `<li><span class="li-name">${esc(i.name)} <small class="muted">${esc(i.unit)}</small></span>
            <span class="li-price">${money(i.price)}</span>
            <button type="button" class="link-btn" data-cat-del="${k}" aria-label="Remove ${esc(i.name)}">Remove</button></li>`).join('')
        : '<li class="empty-line">No items yet. Add what you sell to other businesses.</li>';
    };
    paintCat();

    const addItem = () => {
      const name = $('#catName', form).value.trim();
      const unit = $('#catUnit', form).value.trim() || 'each';
      const p = Number($('#catPrice', form).value);
      if (!name) return CM.toast('Add the item name.', 'error');
      if ($('#catPrice', form).value === '' || !Number.isFinite(p) || p < 0) return CM.toast('Add a price for this item.', 'error');
      sp.catalogue.push({ id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, unit, price: p });
      ['#catName', '#catUnit', '#catPrice'].forEach(s => { $(s, form).value = ''; });
      $('#catName', form).focus();
      paintCat();
    };
    $('#catAdd', form).addEventListener('click', addItem);
    ['#catName', '#catUnit', '#catPrice'].forEach(s => $(s, form).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    }));
    $('#catList', form).addEventListener('click', e => {
      const b = e.target.closest('[data-cat-del]');
      if (!b) return;
      sp.catalogue.splice(+b.dataset.catDel, 1);
      paintCat();
    });
    $('#catCopy', form).addEventListener('click', () => {
      const have = new Set(sp.catalogue.map(i => i.name.toLowerCase()));
      const fresh = (my.offerings || []).filter(o => o.price !== '' && o.price != null && !have.has(String(o.name).toLowerCase()));
      fresh.forEach(o => sp.catalogue.push({ id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: o.name, unit: 'each', price: +o.price }));
      paintCat();
      CM.toast(fresh.length ? `${fresh.length} ${fresh.length === 1 ? 'item' : 'items'} copied. Change the prices to your trade prices.` : 'Nothing new to copy from your products list.', fresh.length ? 'success' : 'info');
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(form);
      const num = (k, dflt = 0) => { const v = Number(f.get(k)); return Number.isFinite(v) && v >= 0 ? v : dflt; };
      n.supplies = f.has('supplies');
      n.delivers = f.has('delivers');
      sp.leadDays = num('leadDays', 1);
      sp.minOrder = num('minOrder');
      sp.terms = f.getAll('terms').filter(t => TERMS[t]);
      if (!sp.terms.length) sp.terms = ['cash'];
      sp.ownDelivery = f.has('ownDelivery');
      sp.ownDeliveryFee = num('ownDeliveryFee');
      sp.radiusKm = num('radiusKm', 30) || 30;
      cr.vehicle = VEHICLES[f.get('vehicle')] ? f.get('vehicle') : 'bakkie';
      cr.baseFee = num('baseFee');
      cr.perKm = num('perKm');
      cr.radiusKm = num('courierRadius', 25) || 25;
      cr.maxLoad = String(f.get('maxLoad') || '').trim();
      cr.hours = String(f.get('hours') || '').trim();

      if (n.supplies && !sp.catalogue.length) return CM.toast('Add at least one item to your catalogue so buyers can order from you.', 'error');
      if (n.supplies && my.lat == null) CM.toast('Add your address on the Profile tab so buyers can see how far you are.', 'info');

      const saved = CM.updateBusiness(my.id, b => ({ ...b, network: clone(n) }));
      if (!saved) return;
      state.net = null;
      render();
      CM.toast(n.supplies || n.delivers ? 'Saved. Other businesses can now find you.' : 'Saved.', 'success');
    });
  }

  /* ---------- Clicks inside the panel ---------- */
  panel.addEventListener('click', e => {
    const v = e.target.closest('[data-net-view]');
    if (v) {
      if (v.dataset.target) state.target = v.dataset.target;
      if (v.dataset.courier) state.courier = v.dataset.courier;
      go(v.dataset.netView);
      return;
    }
    const a = e.target.closest('[data-order]');
    if (a) {
      const sel = a.dataset.act === 'b_recourier' ? $('select', a.parentElement) : null;
      handleAction(a.dataset.order, a.dataset.act, sel ? sel.value : undefined);
    }
  });

  /* ---------- Keep the badge and list fresh ---------- */
  window.addEventListener('storage', () => {
    if ($('#dashView').hidden) return;
    if (!panel.hidden && !['orderSupply', 'orderDelivery', 'setup'].includes(state.view)) render();
    else updateBadge();
  });
  setInterval(() => { if (!$('#dashView').hidden) updateBadge(); }, 30000);

  // The dashboard may already be showing (returning visitor with a saved session)
  if (!$('#dashView').hidden) updateBadge();
})();
