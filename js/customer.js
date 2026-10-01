/* ==========================================================================
   Corner Market – customer side
   Pick a category, set your location, see businesses nearest to you.
   ========================================================================== */
(() => {
  const { esc, catById, CATEGORIES } = CM;
  const $ = s => document.querySelector(s);
 
const state = {
    loc: CM.store.get(CM.KEYS.loc, null),
    category: 'all',
    radius: 5,
    query: '',
    samples: true,
    businesses: [] // Add this array to hold database results
  };
  let shown = [];          // businesses currently listed, so the detail view can find them
  let current = null;      // business open in the detail view
  const viewed = new Set();
 
  /* ---------- Location ---------- */
  function renderLocStatus() {
    const text = state.loc
      ? CM.truncate(state.loc.label || 'Location set', 90)
      : 'Location not set. Choose one to see who is nearby.';
    $('#locStatus').innerHTML = `${CM.icon('pin', 'icon icon-inline')}<span>${esc(text)}</span>`;
  }
 
  function setLoc(loc) {
    state.loc = loc;
    CM.store.set(CM.KEYS.loc, loc);
    render();
  }
 
  $('#btnLocate').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Finding you…';
    try {
      const pos = await CM.getPosition();
      const label = await CM.reverseGeocode(pos.lat, pos.lng);
      setLoc({ ...pos, label: label || 'Your current location' });
    } catch (err) {
      CM.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Use my current location';
    }
  });
 
  $('#addrForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#addrInput').value.trim();
    if (!q) return CM.toast('Type a suburb, street or town first.', 'error');
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    try {
      const res = await CM.geocode(q);
      if (!res) CM.toast('We could not find that place. Try adding the town or city.', 'error');
      else setLoc(res);
    } catch (err) {
      CM.toast(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
 
  /* ---------- Data ---------- */
  function pool() {
    if (!state.loc) return [];
    
    // Read from the pre-fetched state array instead of triggering a new database call
    let list = state.businesses.filter(b => b.lat != null && b.lng != null);
    
    if (state.samples) list = list.concat(CM.sampleBusinesses(state.loc));
    return list
      .map(b => ({ ...b, dist: CM.haversine(state.loc, b) }))
      .filter(b => b.dist <= state.radius);
  }
 
  function matchesQuery(b) {
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [b.name, b.description, catById(b.category).label, ...(b.offerings || []).map(o => o.name)]
      .join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }
 
  /* ---------- Rendering ---------- */
  function cover(b, cls = 'cover') {
    return b.image
      ? `<img class="${cls}" src="${esc(b.image)}" alt="">`
      : `<div class="${cls} ph" aria-hidden="true"><span>${esc(CM.initials(b.name))}</span></div>`;
  }
 
  function renderCategories() {
    const base = pool().filter(matchesQuery);
    const counts = {};
    base.forEach(b => { counts[b.category] = (counts[b.category] || 0) + 1; });
    const tiles = [{ id: 'all', label: 'Everything' }, ...CATEGORIES];
    $('#categories').innerHTML = tiles.map(c => {
      const n = c.id === 'all' ? base.length : (counts[c.id] || 0);
      const sel = state.category === c.id;
      return `<button type="button" class="tile${sel ? ' selected' : ''}" data-cat="${c.id}" aria-pressed="${sel}">
        <span class="tile-icon">${CM.icon(c.id)}</span>
        <span class="tile-label">${esc(c.label)}</span>
        ${state.loc ? `<span class="tile-count">${n}</span>` : ''}
      </button>`;
    }).join('');
  }
 
  function renderResults() {
    const cat = state.category === 'all' ? null : catById(state.category);
    $('#resultsTitle').textContent = cat ? `${cat.label} near you` : 'Businesses near you';
    const box = $('#results');
 
    if (!state.loc) {
      shown = [];
      $('#resultsCount').textContent = '';
      box.innerHTML = `<div class="empty">
        <h3>Tell us where you are</h3>
        <p>Use your current location or type your suburb above. We will show the closest businesses first.</p>
      </div>`;
      return;
    }
 
    shown = pool()
      .filter(matchesQuery)
      .filter(b => !cat || b.category === cat.id)
      .sort((a, b) => (Number(!!b.featured) - Number(!!a.featured)) || (a.dist - b.dist));
 
    $('#resultsCount').textContent = `${shown.length} within ${state.radius} km`;
 
    if (!shown.length) {
      box.innerHTML = `<div class="empty">
        <h3>Nothing here yet</h3>
        <p>No ${cat ? esc(cat.label.toLowerCase()) : 'businesses'} within ${state.radius} km${state.query ? ' matching your search' : ''}.
        Try a wider distance, or check back soon. New businesses join every day.</p>
      </div>`;
      return;
    }
 
    box.innerHTML = shown.map(b => {
      const c = catById(b.category);
      const promo = CM.activePromos(b)[0];
      return `<article class="card" tabindex="0" role="button" data-id="${esc(b.id)}" aria-label="View ${esc(b.name)}">
        ${cover(b)}
        <div class="card-body">
          <div class="card-top">
            <h3>${esc(b.name)}</h3>
            <span class="dist">${CM.distanceLabel(b.dist)}</span>
          </div>
          <div class="chips">
            <span class="chip">${esc(c.label)}</span>
            ${b.featured ? '<span class="chip chip-featured">Featured</span>' : ''}
            ${b.sample ? '<span class="chip chip-sample">Sample</span>' : ''}
          </div>
          <p class="desc">${esc(CM.truncate(b.description, 110))}</p>
          ${promo ? `<div class="promo-strip"><strong>${esc(promo.title)}</strong></div>` : ''}
        </div>
      </article>`;
    }).join('');
  }
 
async function render() {
    // Fetch live data from your new async CM.getBusinesses() function
    state.businesses = await CM.getBusinesses(); 
    
    renderLocStatus();
    renderCategories();
    renderResults();
  }
 
  /* ---------- Detail dialog ---------- */
  const dlg = $('#detail');
 
  function openDetail(id) {
    const b = shown.find(x => x.id === id);
    if (!b) return;
    current = b;
    const c = catById(b.category);
    const promos = CM.activePromos(b);
    const offers = b.offerings || [];
 
    const actions = [];
    if (b.phone) actions.push(`<a class="btn btn-primary" data-track href="${esc(CM.telHref(b.phone))}">Call</a>`);
    if (b.whatsapp || b.phone) {
      actions.push(`<a class="btn btn-whatsapp" data-track target="_blank" rel="noopener"
        href="${esc(CM.waHref(b.whatsapp || b.phone, `Hi ${b.name}, I found you on Hustle Hub.`))}">WhatsApp</a>`);
    }
    actions.push(`<a class="btn btn-ghost" data-track target="_blank" rel="noopener" href="${esc(CM.directionsHref(b))}">Directions</a>`);
 
    dlg.innerHTML = `
      <button type="button" class="detail-close" data-close aria-label="Close">×</button>
      ${cover(b, 'detail-cover')}
      <div class="detail-body">
        <h2>${esc(b.name)}</h2>
        <div class="chips">
          <span class="chip">${esc(c.label)}</span>
          <span class="chip chip-dist">${CM.distanceLabel(b.dist)} away</span>
          ${b.featured ? '<span class="chip chip-featured">Featured</span>' : ''}
          ${b.sample ? '<span class="chip chip-sample">Sample</span>' : ''}
        </div>
        <p>${esc(b.description) || 'No description yet.'}</p>
 
        ${promos.length ? `<div class="promo-block">${promos.map(p => `
          <div class="promo"><strong>${esc(p.title)}</strong><span>${esc(p.text)}</span>
          ${p.expires ? `<em>Until ${esc(p.expires)}</em>` : ''}</div>`).join('')}</div>` : ''}
 
        <h3>What they offer</h3>
        ${offers.length ? `<ul class="price-list">${offers.map(o =>
          `<li><span>${esc(o.name)}</span><span>${o.price !== '' && o.price != null ? esc(CM.formatPrice(o.price)) : ''}</span></li>`).join('')}</ul>`
          : '<p class="muted">No items listed yet.</p>'}
 
        <dl class="facts">
          <div><dt>Address</dt><dd>${esc(CM.addressLine(b)) || (b.sample ? 'Sample listing near you' : 'Ask when you contact them')}</dd></div>
          <div><dt>Hours</dt><dd>${esc(b.hours) || 'Not listed'}</dd></div>
        </dl>
 
        <div class="actions">${actions.join('')}</div>
        ${b.sample ? '<p class="muted small">This is a sample listing so you can see how Corner Market works. Real businesses appear here as they join.</p>' : ''}
      </div>`;
 
    if (!b.sample && !viewed.has(b.id)) {
      viewed.add(b.id);
      CM.updateBusiness(b.id, x => ({ ...x, stats: { ...(x.stats || { views: 0, contacts: 0 }), views: ((x.stats && x.stats.views) || 0) + 1 } }));
    }
    dlg.showModal();
  }
 
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
    if (e.target.closest('[data-track]') && current && !current.sample) {
      CM.updateBusiness(current.id, x => ({ ...x, stats: { ...(x.stats || { views: 0, contacts: 0 }), contacts: ((x.stats && x.stats.contacts) || 0) + 1 } }));
    }
  });
 
  /* ---------- Events ---------- */
  $('#categories').addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (!t) return;
    state.category = t.dataset.cat;
    if (!state.loc) CM.toast('Set your location first so we can find businesses near you.', 'info');
    render();
    if (state.loc) $('#resultsTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
 
  const openFromEvent = e => {
    const card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  };
  $('#results').addEventListener('click', openFromEvent);
  $('#results').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
      e.preventDefault();
      openFromEvent(e);
    }
  });
 
  let timer;
  $('#search').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = e.target.value; render(); }, 200);
  });
  $('#radius').addEventListener('change', e => { state.radius = +e.target.value; render(); });
  $('#sampleToggle').addEventListener('change', e => { state.samples = e.target.checked; render(); });
 
  render();
})();