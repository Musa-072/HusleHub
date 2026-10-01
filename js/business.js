/* ==========================================================================
   Corner Market – business side
   Register, build a profile with an address, market yourself, get advice.
   ========================================================================== */
(() => {
  const { esc } = CM;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
 
  let biz = null;            // the signed-in business
  let draft = { lat: null, lng: null, image: '', locSource: null, stale: false };
  let chat = [];             // { role: 'user' | 'bot', text }
 
  /* ---------- Helpers ---------- */
  const fmt = text => esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
 
  const newId = () => 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
 
  function refresh() {
    biz = CM.getBusinesses().find(b => b.id === biz.id) || biz;
  }
 
  /* ---------- Category selects ---------- */
  $$('select[data-categories]').forEach(sel => {
    sel.innerHTML = CM.CATEGORIES.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
  });
 
  /* ---------- Auth ---------- */
  function showAuth() {
    $('#authView').hidden = false;
    $('#dashView').hidden = true;
  }
 
  function showDash() {
    $('#authView').hidden = true;
    $('#dashView').hidden = false;
    $('#dashTitle').textContent = biz.name;
    fillProfileForm();
    renderAll();
  }
 
  $$('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.auth-tab').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    $('#registerForm').hidden = btn.dataset.form !== 'register';
    $('#loginForm').hidden = btn.dataset.form !== 'login';
  }));
 
  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = f.get('email').trim().toLowerCase();
    const pw = f.get('password');
    if (pw.length < 6) return CM.toast('Choose a password with at least 6 characters.', 'error');
    const list = CM.getBusinesses();
    if (list.some(b => b.email === email)) return CM.toast('That email already has an account. Log in instead.', 'error');
 
    const b = {
      id: newId(), ownerName: f.get('ownerName').trim(), email, passHash: await CM.hashText(pw),
      name: f.get('name').trim(), category: f.get('category'),
      description: '', phone: '', whatsapp: '', hours: '', image: '',
      address: { street: '', suburb: '', city: '' }, lat: null, lng: null,
      offerings: [], promotions: [], featured: false,
      stats: { views: 0, contacts: 0 }, createdAt: new Date().toISOString()
    };
    list.push(b);
    if (!CM.saveBusinesses(list)) return;
    CM.store.set(CM.KEYS.session, b.id);
    biz = b;
    e.target.reset();
    showDash();
    switchTab('profile');
    CM.toast('Account created. Add your address so customers nearby can find you.', 'success');
  });
 
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = f.get('email').trim().toLowerCase();
    const found = CM.getBusinesses().find(b => b.email === email);
    if (!found || found.passHash !== await CM.hashText(f.get('password'))) {
      return CM.toast('Email or password is not right. Check both and try again.', 'error');
    }
    CM.store.set(CM.KEYS.session, found.id);
    biz = found;
    e.target.reset();
    showDash();
    switchTab('overview');
  });
 
  $('#btnLogout').addEventListener('click', () => {
    CM.store.remove(CM.KEYS.session);
    biz = null;
    chat = [];
    showAuth();
  });
 
  /* ---------- Tabs ---------- */
  function switchTab(name) {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.panel').forEach(p => { p.hidden = p.id !== 'panel-' + name; });
    if (name === 'overview') renderOverview();
    if (name === 'advisor') openAdvisor();
    window.scrollTo({ top: 0 });
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) switchTab(g.dataset.goto);
  });
 
  /* ---------- Profile ---------- */
  const pf = $('#profileForm');
 
  function updateLocStatus() {
    const el = $('#locState');
    if (draft.lat != null) {
      el.className = 'loc-state ok';
      el.textContent = `Location saved (${draft.lat.toFixed(4)}, ${draft.lng.toFixed(4)}). Customers nearby can find you.`;
    } else {
      el.className = 'loc-state warn';
      el.textContent = 'No location yet. Customers cannot find you until you set one.';
    }
  }
 
  function updatePhoto() {
    const box = $('#photoPreview');
    box.innerHTML = draft.image
      ? `<img src="${esc(draft.image)}" alt="Your business photo">`
      : `<span>${esc(CM.initials(biz.name))}</span>`;
    $('#btnRemovePhoto').hidden = !draft.image;
  }
 
  function fillProfileForm() {
    pf.bizName.value = biz.name || '';
    pf.category.value = biz.category || 'other';
    pf.description.value = biz.description || '';
    pf.phone.value = biz.phone || '';
    pf.whatsapp.value = biz.whatsapp || '';
    pf.street.value = biz.address?.street || '';
    pf.suburb.value = biz.address?.suburb || '';
    pf.city.value = biz.address?.city || '';
    pf.hours.value = biz.hours || '';
    draft = { lat: biz.lat, lng: biz.lng, image: biz.image || '', locSource: biz.lat != null ? 'saved' : null, stale: false };
    $('#descCount').textContent = pf.description.value.length;
    updateLocStatus();
    updatePhoto();
  }
 
  pf.description.addEventListener('input', () => { $('#descCount').textContent = pf.description.value.length; });
  ['street', 'suburb', 'city'].forEach(n => pf[n].addEventListener('input', () => {
    if (draft.locSource !== 'gps') draft.stale = true;
  }));
 
  const addressQuery = () => [pf.street.value, pf.suburb.value, pf.city.value].map(s => s.trim()).filter(Boolean).join(', ');
 
  async function locateByAddress() {
    const q = addressQuery();
    if (!pf.suburb.value.trim() && !pf.city.value.trim()) {
      CM.toast('Add at least your suburb or town.', 'error');
      return false;
    }
    const res = await CM.geocode(q);
    if (!res) {
      CM.toast('We could not find that address. Add the town or city, or use your current position.', 'error');
      return false;
    }
    draft.lat = res.lat; draft.lng = res.lng; draft.locSource = 'address'; draft.stale = false;
    updateLocStatus();
    return true;
  }
 
  $('#btnGeocode').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { if (await locateByAddress()) CM.toast('Address found on the map.', 'success'); }
    catch (err) { CM.toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
 
  $('#btnGps').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const pos = await CM.getPosition();
      draft.lat = pos.lat; draft.lng = pos.lng; draft.locSource = 'gps'; draft.stale = false;
      updateLocStatus();
      CM.toast('Position saved. Stand at your business when you do this for the best result.', 'success');
    } catch (err) { CM.toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
 
  $('#photoInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      draft.image = await CM.resizeImage(file);
      updatePhoto();
    } catch (err) { CM.toast(err.message, 'error'); }
    e.target.value = '';
  });
  $('#btnRemovePhoto').addEventListener('click', () => { draft.image = ''; updatePhoto(); });
 
  pf.addEventListener('submit', async e => {
    e.preventDefault();
    const name = pf.bizName.value.trim();
    if (!name) return CM.toast('Your business needs a name.', 'error');
 
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    try {
      if ((draft.lat == null || draft.stale) && (pf.suburb.value.trim() || pf.city.value.trim())) {
        try { await locateByAddress(); } catch (err) { CM.toast(err.message, 'error'); }
      }
      const updated = CM.updateBusiness(biz.id, b => ({
        ...b, name, category: pf.category.value, description: pf.description.value.trim(),
        phone: pf.phone.value.trim(), whatsapp: pf.whatsapp.value.trim(), hours: pf.hours.value.trim(),
        address: { street: pf.street.value.trim(), suburb: pf.suburb.value.trim(), city: pf.city.value.trim() },
        lat: draft.lat, lng: draft.lng, image: draft.image
      }));
      if (!updated) return;
      biz = updated;
      $('#dashTitle').textContent = biz.name;
      renderAll();
      if (biz.lat == null) CM.toast('Saved, but customers cannot find you until you set your location.', 'info');
      else CM.toast('Profile saved. You are now visible to nearby customers.', 'success');
    } finally { if (btn) btn.disabled = false; }
  });
 
  /* ---------- Products & services ---------- */
  function renderItems() {
    const list = $('#itemList');
    if (!biz.offerings.length) {
      list.innerHTML = '<li class="empty-line">Nothing listed yet. Add your first item above.</li>';
      return;
    }
    list.innerHTML = biz.offerings.map((o, i) => `
      <li><span class="li-name">${esc(o.name)}</span>
      <span class="li-price">${o.price !== '' && o.price != null ? esc(CM.formatPrice(o.price)) : ''}</span>
      <button type="button" class="link-btn" data-del-item="${i}" aria-label="Remove ${esc(o.name)}">Remove</button></li>`).join('');
  }
 
  $('#itemForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('itemName').trim();
    if (!name) return;
    const price = f.get('price') === '' ? '' : Number(f.get('price'));
    const updated = CM.updateBusiness(biz.id, b => ({ ...b, offerings: [...b.offerings, { name, price }] }));
    if (!updated) return;
    biz = updated;
    e.target.reset();
    e.target.itemName.focus();
    renderAll();
  });
 
  $('#itemList').addEventListener('click', e => {
    const btn = e.target.closest('[data-del-item]');
    if (!btn) return;
    const i = +btn.dataset.delItem;
    biz = CM.updateBusiness(biz.id, b => ({ ...b, offerings: b.offerings.filter((_, k) => k !== i) }));
    renderAll();
  });
 
  /* ---------- Promotions & featured ---------- */
  function renderPromos() {
    const list = $('#promoList');
    if (!biz.promotions.length) {
      list.innerHTML = '<li class="empty-line">No promotions yet. Publish one and it will appear on your listing.</li>';
    } else {
      list.innerHTML = biz.promotions.map((p, i) => {
        const expired = p.expires && p.expires < CM.today();
        return `<li class="promo-item${expired ? ' expired' : ''}">
          <div><strong>${esc(p.title)}</strong><span>${esc(p.text)}</span>
          <em>${p.expires ? (expired ? 'Ended ' : 'Runs until ') + esc(p.expires) : 'No end date'}</em></div>
          <button type="button" class="link-btn" data-del-promo="${i}" aria-label="Remove ${esc(p.title)}">Remove</button></li>`;
      }).join('');
    }
    $('#featuredToggle').checked = !!biz.featured;
  }
 
  $('#promoForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const title = f.get('title').trim(), text = f.get('text').trim();
    if (!title || !text) return CM.toast('Add a title and a short description.', 'error');
    const promo = { id: 'p_' + Date.now().toString(36), title, text, expires: f.get('expires') || '' };
    const updated = CM.updateBusiness(biz.id, b => ({ ...b, promotions: [promo, ...b.promotions] }));
    if (!updated) return;
    biz = updated;
    e.target.reset();
    renderAll();
    CM.toast('Promotion published. Nearby customers can see it now.', 'success');
  });
 
  $('#promoList').addEventListener('click', e => {
    const btn = e.target.closest('[data-del-promo]');
    if (!btn) return;
    const i = +btn.dataset.delPromo;
    biz = CM.updateBusiness(biz.id, b => ({ ...b, promotions: b.promotions.filter((_, k) => k !== i) }));
    renderAll();
  });
 
  $('#featuredToggle').addEventListener('change', e => {
    biz = CM.updateBusiness(biz.id, { featured: e.target.checked });
    CM.toast(e.target.checked ? 'Featured. You now appear first in nearby results.' : 'Featured listing turned off.', 'success');
  });
 
  /* ---------- Overview & marketing kit ---------- */
  function shareMessage() {
    const link = new URL('customer.html', location.href).href;
    const line = (biz.description || '').split(/(?<=[.!?])\s/)[0] || `We are a ${CM.catById(biz.category).label.toLowerCase()} business near you.`;
    return `Hi! ${biz.name} is now on Corner Market. ${line}\nFind us near you: ${link}`;
  }
 
  function renderOverview() {
    const s = Advisor.strength(biz);
    $('#statViews').textContent = biz.stats?.views || 0;
    $('#statContacts').textContent = biz.stats?.contacts || 0;
    $('#statPromos').textContent = CM.activePromos(biz).length;
    $('#meterFill').style.width = s.score + '%';
    $('#meterScore').textContent = s.score + '%';
    $('#meter').setAttribute('aria-valuenow', s.score);
    $('#missingList').innerHTML = s.missing.length
      ? s.missing.map(m => `<li><strong>${esc(m.label)}</strong><span>${esc(m.tip)}</span></li>`).join('')
      : '<li class="ok"><strong>Your profile is in great shape.</strong><span>Keep it fresh with a new photo or promotion each month.</span></li>';
    $('#visibility').hidden = biz.lat != null;
    $('#shareText').value = shareMessage();
  }
 
  $('#btnCopyShare').addEventListener('click', async () => {
    const ta = $('#shareText');
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.select(); document.execCommand('copy'); }
    CM.toast('Message copied. Paste it into WhatsApp or Facebook.', 'success');
  });
  $('#btnWaShare').addEventListener('click', () => {
    window.open('https://wa.me/?text=' + encodeURIComponent($('#shareText').value), '_blank', 'noopener');
  });
 
  /* ---------- Advisor chat ---------- */
  function renderChat(typing = false) {
    const log = $('#chatLog');
    log.innerHTML = chat.map(m => `<div class="msg ${m.role}"><div class="bubble">${fmt(m.text)}</div></div>`).join('') +
      (typing ? '<div class="msg bot"><div class="bubble typing" aria-label="Advisor is typing"><i></i><i></i><i></i></div></div>' : '');
    // Long replies (like a growth plan) should open at their first line, not the last one
    const last = log.querySelector('.msg:last-child');
    if (typing || !last || !last.classList.contains('bot')) log.scrollTop = log.scrollHeight;
    else log.scrollTop = Math.max(0, last.offsetTop - 12);
  }
 
  function openAdvisor() {
    if (!chat.length) chat.push({ role: 'bot', text: Advisor.greeting(biz) });
    $('#chips').innerHTML = Advisor.chips.map(c => `<button type="button" class="chip-btn">${esc(c)}</button>`).join('');
    renderChat();
    $('#chatInput').focus({ preventScroll: true });
  }
 
  async function send(text) {
    text = text.trim();
    if (!text) return;
    chat.push({ role: 'user', text });
    renderChat(true);
    $('#chatInput').value = '';
    let reply;
    try { reply = await Advisor.ask(text, biz, chat); }
    catch { reply = 'Sorry, something went wrong on my side. Please try again.'; }
    chat.push({ role: 'bot', text: reply });
    renderChat();
  }
 
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send($('#chatInput').value); });
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip-btn');
    if (b) send(b.textContent);
  });
 
  /* ---------- Boot ---------- */
  function renderAll() {
    renderItems();
    renderPromos();
    renderOverview();
    $('#btnPreview').hidden = biz.lat == null;
  }
 
  const sessionId = CM.store.get(CM.KEYS.session, null);
  const existing = sessionId && CM.getBusinesses().find(b => b.id === sessionId);
  if (existing) { biz = existing; showDash(); switchTab('overview'); }
  else showAuth();
})();