/* ==========================================================================
   Hustle Hub – shared helpers (used by customer.js, business.js, advisor.js)
   ========================================================================== */
const CM = (() => {
  /* ---- Settings you can change ---- */
  const CONFIG = {
    currency: 'R',                 // shown before prices
    defaultDialCode: '27',         // used to turn 0821234567 into 27821234567 for WhatsApp links
    geocoder: 'https://nominatim.openstreetmap.org', // free OpenStreetMap address lookup
    brandName: 'Corner Market',
    logo: 'images/logo.png'        // LOGO: put your picture in the images folder and set its file name here
  };

  const KEYS = { biz: 'cm_businesses', session: 'cm_session', loc: 'cm_customer_loc' };

  const CATEGORIES = [
    { id: 'food',      label: 'Food & drinks' },
    { id: 'clothing',  label: 'Clothing' },
    { id: 'groceries', label: 'Groceries & spaza' },
    { id: 'beauty',    label: 'Hair & beauty' },
    { id: 'repairs',   label: 'Repairs & trades' },
    { id: 'home',      label: 'Cleaning & home' },
    { id: 'other',     label: 'Other services' }
  ];
  const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

  /* ---- Formal line icons (replace emoji). Drawn in the current text colour. ---- */
  const ICONS = {
    all:       '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    food:      '<path d="M6 3v6a2 2 0 0 0 4 0V3M8 3v18"/><path d="M16 21V4c2.2 0 4 2.6 4 6.5 0 1.5-1 2.5-2.5 2.5H16"/>',
    clothing:  '<path d="M8 3 3.5 5.5 5 9.5l3-1V20h8V8.5l3 1 1.5-4L16 3a4 4 0 0 1-8 0Z"/>',
    groceries: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2.5l2.2 10.5h10.3l2-7.5H6.2"/>',
    beauty:    '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5 20 18M8 16.5 20 6"/>',
    repairs:   '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z"/>',
    home:      '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    other:     '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    pin:       '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'
  };
  const icon = (id, cls = 'icon') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.other}</svg>`;

  /* Placeholder shown when a business has no photo: its initials, e.g. "Mama Thandi's Kitchen" -> "MT" */
  const initials = name => {
    const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] || '') + (words.length > 1 ? words[1][0] : '')).toUpperCase() || 'CM';
  };

  /* ---- Small utilities ---- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const truncate = (s, n) => {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  };

  const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  const formatPrice = p => {
    const n = Number(p);
    if (!isFinite(n)) return '';
    return CONFIG.currency + (Number.isInteger(n) ? n : n.toFixed(2));
  };

  const distanceLabel = km => km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`;

  const addressLine = b => [b.address?.street, b.address?.suburb, b.address?.city].filter(Boolean).join(', ');

  const activePromos = b => (b.promotions || []).filter(p => !p.expires || p.expires >= today());

  function toast(msg, type = 'info') {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4000);
  }

  /* ---- Storage (localStorage – swap for a real database/API in production) ---- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; }
      catch { toast('Storage is full. Try a smaller photo.', 'error'); return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
  };

  const getBusinesses = () => store.get(KEYS.biz, []);
  const saveBusinesses = list => store.set(KEYS.biz, list);
  function updateBusiness(id, patch) {
    const list = getBusinesses();
    const i = list.findIndex(b => b.id === id);
    if (i < 0) return null;
    list[i] = typeof patch === 'function' ? patch(list[i]) : { ...list[i], ...patch };
    saveBusinesses(list);
    return list[i];
  }

  /* ---- Location ---- */
  function haversine(a, b) {
    const R = 6371, rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const getPosition = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser cannot share your location.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => reject(new Error(e.code === 1
        ? 'Location permission was blocked. Allow it in your browser, or type your address instead.'
        : 'We could not get your location. Type your address instead.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  async function geocode(query) {
    const url = `${CONFIG.geocoder}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('The address lookup service is not responding. Try again in a moment.');
    const data = await r.json();
    if (!data.length) return null;
    return { lat: +data[0].lat, lng: +data[0].lon, label: data[0].display_name };
  }

  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(`${CONFIG.geocoder}/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lng}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d.display_name || null;
    } catch { return null; }
  }

  /* ---- Contact links ---- */
  const telHref = n => 'tel:' + String(n).replace(/[^\d+]/g, '');
  function waHref(n, text = '') {
    let d = String(n || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = CONFIG.defaultDialCode + d.slice(1);
    return `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  }
  const directionsHref = b => `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`;

  /* ---- Passwords (demo only: hashing in the browser is NOT real security) ---- */
  async function hashText(t) {
    const input = 'cm:' + t;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (const ch of input) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return 'f' + h;
  }

  /* ---- Photos: shrink so they fit in browser storage ---- */
  const resizeImage = (file, max = 640) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  /* ---- Sample listings ----
     Real businesses live in localStorage. Until enough real ones join, customers can also see
     sample listings, placed a few hundred metres to a few km around wherever the customer is.
     They are never saved, and are clearly labelled "Sample". */
  const SAMPLES = [
    { id: 's1', name: "Mama Thandi's Kitchen", category: 'food', dN: 0.5, dE: 0.4, hours: 'Mon to Sat, 06:30 to 17:00',
      description: 'Home-style kota, pap and stew, and vetkoek made fresh every morning. Lunch boxes for workers on order.',
      offerings: [['Kota (quarter loaf)', 35], ['Pap and stew', 45], ['Vetkoek and mince', 20]],
      promo: ['Weekday lunch combo', 'Any plate plus a cold drink for R55, 12:00 to 14:00.'], featured: true },
    { id: 's2', name: "Sipho's Braai Stand", category: 'food', dN: -1.2, dE: 0.9, hours: 'Thu to Sun, 11:00 to 21:00',
      description: 'Flame-grilled boerewors, chicken and chisa nyama by the plate or by the kilo.',
      offerings: [['Boerewors roll', 28], ['Chicken quarter', 40], ['Meat by the kg', 180]] },
    { id: 's3', name: 'Vetkoek Corner', category: 'food', dN: 3.1, dE: -2.4, hours: 'Daily, 05:30 to 11:00',
      description: 'Big fluffy vetkoek and hot tea for the early commute.',
      offerings: [['Plain vetkoek', 8], ['Vetkoek with polony', 18], ['Tea or coffee', 10]] },
    { id: 's4', name: 'Fresh Veg by Gogo Lindiwe', category: 'groceries', dN: 0.9, dE: -0.7, hours: 'Mon to Sat, 07:00 to 16:00',
      description: 'Fruit and vegetables from the morning market, sold in small affordable bundles.',
      offerings: [['Tomato bundle', 10], ['Spinach bunch', 8], ['Potatoes (2 kg)', 30]],
      promo: ['Family veg pack', 'Potatoes, onions, tomatoes and cabbage for R60 this week.'] },
    { id: 's5', name: "Bheki's Corner Spaza", category: 'groceries', dN: -0.4, dE: -1.1, hours: 'Daily, 06:00 to 20:00',
      description: 'Bread, milk, airtime, electricity and gas refills. Open late for the street.',
      offerings: [['Bread', 18], ['Airtime (any amount)', 5], ['Gas refill (9 kg)', 260]] },
    { id: 's6', name: 'Thrift and Threads', category: 'clothing', dN: 1.6, dE: 1.4, hours: 'Tue to Sat, 09:00 to 17:00',
      description: 'Clean second-hand jeans, jackets and shoes at fair prices. New stock every Friday.',
      offerings: [['Jeans', 80], ['Jacket', 120], ['Sneakers', 150]] },
    { id: 's7', name: "Nomsa's Alterations and Fashion", category: 'clothing', dN: -2.0, dE: -0.6, hours: 'Mon to Fri, 08:00 to 17:00',
      description: 'Hemming, zips and custom dresses and school wear made to measure.',
      offerings: [['Hem trousers', 40], ['Replace zip', 50], ['Custom dress', 350]] },
    { id: 's8', name: 'Kids School Wear Stall', category: 'clothing', dN: 3.5, dE: 1.0, hours: 'Mon to Sat, 08:00 to 16:00',
      description: 'Uniforms, shoes and socks for primary and high school.',
      offerings: [['Shirt', 55], ['School trousers', 110], ['Socks (3 pairs)', 35]] },
    { id: 's9', name: 'Braids by Zanele', category: 'beauty', dN: 0.7, dE: 1.9, hours: 'Tue to Sun, 08:00 to 18:00',
      description: 'Box braids, cornrows and weaves in a clean, friendly home salon. Bookings on WhatsApp.',
      offerings: [['Cornrows', 150], ['Box braids', 350], ['Wash and blow-dry', 60]],
      promo: ['Bring a friend', 'Book together and each get R30 off.'] },
    { id: 's10', name: 'Fix-It Phone Repairs', category: 'repairs', dN: -0.8, dE: 1.6, hours: 'Mon to Sat, 09:00 to 18:00',
      description: 'Screens, batteries and charging ports fixed while you wait, with a 7-day warranty.',
      offerings: [['Screen replacement', 350], ['Battery swap', 180], ['Charging port', 150]] },
    { id: 's11', name: 'Sparkle Home Cleaning', category: 'home', dN: 2.2, dE: -1.5, hours: 'Mon to Sat, 07:00 to 16:00',
      description: 'Reliable house and yard cleaning by the day or on a weekly plan. We bring our own supplies.',
      offerings: [['Half-day clean', 250], ['Full-day clean', 400], ['Weekly plan (per visit)', 220]] }
  ];

  function sampleBusinesses(loc) {
    const kmPerDegLat = 110.574;
    const kmPerDegLng = 111.32 * Math.cos(loc.lat * Math.PI / 180) || 1;
    return SAMPLES.map(s => ({
      id: s.id, sample: true, name: s.name, category: s.category, description: s.description,
      phone: '', whatsapp: '', hours: s.hours, image: '', address: { street: '', suburb: '', city: '' },
      lat: loc.lat + s.dN / kmPerDegLat,
      lng: loc.lng + s.dE / kmPerDegLng,
      featured: !!s.featured,
      offerings: s.offerings.map(([name, price]) => ({ name, price })),
      promotions: s.promo ? [{ id: s.id + 'p', title: s.promo[0], text: s.promo[1], expires: '' }] : []
    }));
  }

  return {
    CONFIG, KEYS, CATEGORIES, catById, icon, initials, esc, truncate, today, formatPrice, distanceLabel, addressLine,
    activePromos, toast, store, getBusinesses, saveBusinesses, updateBusiness, haversine, getPosition,
    geocode, reverseGeocode, telHref, waHref, directionsHref, hashText, resizeImage, sampleBusinesses
  };
})();

/* ---- Header logo: swaps the "Your logo" slot for the picture at CM.CONFIG.logo, if the file exists ---- */
(function initBrand() {
  const run = () => document.querySelectorAll('.logo-slot').forEach(slot => {
    const host = slot.parentElement;
    const name = (host.textContent || '').replace(slot.textContent, '').trim() || CM.CONFIG.brandName;
    const img = new Image();
    img.className = 'brand-logo';
    img.alt = name + ' logo';
    img.onload = () => { slot.replaceWith(img); host.classList.add('has-logo'); };
    img.src = CM.CONFIG.logo;   // if the file is missing, the slot simply stays in place
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

