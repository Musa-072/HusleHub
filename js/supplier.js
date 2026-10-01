document.addEventListener('DOMContentLoaded', () => {
  const tabWholesaler = document.getElementById('tabWholesaler');
  const tabDelivery = document.getElementById('tabDelivery');
  const catContainer = document.getElementById('supplierCategories');
  const resultsContainer = document.getElementById('results');
  const btnLocate = document.getElementById('btnLocate');
  const locStatus = document.getElementById('locStatus');
  const detailDialog = document.getElementById('detail');
  const supplierDetailPage = document.getElementById('supplierDetailPage');
  const mapElement = document.getElementById('map');
  const isDetailPage = document.body && document.body.dataset.page === 'supplier-detail';

  // 3. Mock Database (Includes Lat/Lng for Leaflet)
  const mockData = [
    { id: 'bakery-1', type: 'wholesaler', category: 'bakery', name: 'Tembisa Bulk Bakery', dist: '2.1', desc: 'Fresh loaves daily for kota vendors at wholesale rates.', lat: -26.0125, lng: 28.2190 },
    { id: 'meat-1', type: 'wholesaler', category: 'meat', name: 'East Rand Meats', dist: '3.5', desc: 'Discounted sausages, polony, and cold meats.', lat: -26.1685, lng: 28.2435 },
    { id: 'delivery-1', type: 'delivery', category: 'bike', name: 'Speedy Kasi Delivery', dist: '1.2', desc: 'Local food delivery fleet for fast food businesses.', lat: -26.1420, lng: 28.1600 },
    { id: 'delivery-2', type: 'delivery', category: 'van', name: 'Gauteng Loaders', dist: '4.8', desc: 'Bakkie hire for moving bulk stock and equipment.', lat: -26.1200, lng: 28.1800 }
  ];

  if (isDetailPage || supplierDetailPage) {
    renderDetailPage();
    return;
  }

  // 1. Initialize Leaflet Map (Centered on Gauteng/Edenvale area)
  const map = mapElement ? L.map('map').setView([-26.1438, 28.1632], 12) : null;
  if (map) {
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      subdomains: ['a', 'b', 'c']
    });

    tiles.on('tileerror', () => {
      if (locStatus) {
        locStatus.textContent = '📍 Map tiles are temporarily unavailable, but nearby supplier results are still showing.';
      }
    });

    tiles.addTo(map);
  }

  let userMarker = null;
  let currentMapMarkers = [];

  function updateLocationStatus(message) {
    if (locStatus) locStatus.textContent = message;
  }

  function setUserLocation(lat, lng, label = 'Your current location') {
    if (!map) return;
    if (userMarker) map.removeLayer(userMarker);

    userMarker = L.marker([lat, lng]).addTo(map);
    userMarker.bindPopup(`<strong>${label}</strong>`);
    map.flyTo([lat, lng], 12, { duration: 1.2 });
  }

  async function locateUser() {
    if (!navigator.geolocation) {
      updateLocationStatus('📍 Geolocation is not supported in this browser.');
      return;
    }

    if (btnLocate) {
      btnLocate.disabled = true;
      btnLocate.textContent = 'Finding you…';
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      let label = 'Your current location';
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.display_name) label = data.display_name;
        }
      } catch (err) {
        // fall back to generic label when reverse lookup fails
      }

      setUserLocation(lat, lng, label);
      updateLocationStatus(`📍 Your location: ${label}`);
    } catch (err) {
      const message = err && err.message
        ? err.message
        : 'Location permission was blocked or your device could not determine your position.';
      updateLocationStatus(`📍 ${message}`);
    } finally {
      if (btnLocate) {
        btnLocate.disabled = false;
        btnLocate.textContent = 'Use my current location';
      }
    }
  }

  if (btnLocate) {
    btnLocate.addEventListener('click', locateUser);
  }

  function getCategoryLabel(catId) {
    const labels = {
      bakery: 'Bakery & Bread',
      meat: 'Butchery',
      packaging: 'Packaging',
      equipment: 'Equipment',
      bike: 'Bike Couriers',
      van: 'Bakkie Hire',
      cold: 'Cold Chain'
    };
    return labels[catId] || 'Partner';
  }

  function openDetail(itemId) {
    window.location.href = `supplier-detail.html?id=${encodeURIComponent(itemId)}`;
  }

  function renderDetailPage() {
    if (!supplierDetailPage) return;

    const id = new URLSearchParams(window.location.search).get('id');
    const item = mockData.find(entry => entry.id === id);

    if (!item) {
      supplierDetailPage.innerHTML = `
        <div class="empty">
          <h3>Supplier not found</h3>
          <p>The supplier you tried to open is unavailable. <a href="supplier.html">Go back to the supplier list</a>.</p>
        </div>
      `;
      return;
    }

    supplierDetailPage.innerHTML = `
      <section class="finder" style="padding-top: 2rem;">
        <a href="supplier.html" class="btn btn-ghost btn-sm">← Back to suppliers</a>
        <h1 style="margin-top: 1rem;">${item.name}</h1>
        <div class="chips" style="margin-top: 1rem;">
          <span class="chip">${getCategoryLabel(item.category)}</span>
          <span class="chip chip-featured">Verified B2B Partner</span>
        </div>
      </section>

      <section class="card" style="margin-top: 1.5rem; overflow: hidden;">
        <div class="card-body">
          <div class="card-top">
            <h3>${item.name}</h3>
            <span class="dist">${item.dist} km</span>
          </div>
          <p class="desc">${item.desc}</p>
          <dl class="facts">
            <div><dt>Type</dt><dd>${item.type === 'wholesaler' ? 'Wholesale supplier' : 'Delivery & logistics'}</dd></div>
            <div><dt>Distance</dt><dd>${item.dist} km away</dd></div>
            <div><dt>Location</dt><dd>${item.lat}, ${item.lng}</dd></div>
          </dl>
          <div class="actions">
            <a class="btn btn-primary" href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}" target="_blank" rel="noopener">Directions</a>
            <a class="btn btn-ghost" href="supplier.html">Back to list</a>
          </div>
        </div>
      </section>
    `;
  }

  if (detailDialog) {
    detailDialog.addEventListener('click', (event) => {
      const closeTarget = event.target.closest('[data-close]');
      if (event.target === detailDialog || closeTarget) {
        detailDialog.close();
      }
    });
  }

  // 2. Define Mode Categories
  const categories = {
    wholesaler: [
      { id: 'all', name: 'All Suppliers', icon: '📦' },
      { id: 'bakery', name: 'Bakery & Bread', icon: '🥖' },
      { id: 'meat', name: 'Butchery', icon: '🥩' },
      { id: 'packaging', name: 'Packaging', icon: '🥡' },
      { id: 'equipment', name: 'Equipment', icon: '🛠️' }
    ],
    delivery: [
      { id: 'all', name: 'All Delivery', icon: '🚚' },
      { id: 'bike', name: 'Bike Couriers', icon: '🛵' },
      { id: 'van', name: 'Bakkie Hire', icon: '🚐' },
      { id: 'cold', name: 'Cold Chain', icon: '❄️' }
    ]
  };

  let currentMode = 'wholesaler';
  let currentCategory = 'all';

  function renderCategories() {
    catContainer.innerHTML = '';
    const activeCats = categories[currentMode];
    
    activeCats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `tile ${currentCategory === cat.id ? 'selected' : ''}`;
      btn.innerHTML = `<div class="tile-icon">${cat.icon}</div><span class="tile-count">${cat.name}</span>`;
      btn.onclick = () => {
        currentCategory = cat.id;
        renderCategories();
        renderResults();
      };
      catContainer.appendChild(btn);
    });
  }

  function renderResults() {
    resultsContainer.innerHTML = '';
    
    // Clear old map markers
    currentMapMarkers.forEach(m => map.removeLayer(m));
    currentMapMarkers = [];

    const filtered = mockData.filter(item => 
      item.type === currentMode && (currentCategory === 'all' || item.category === currentCategory)
    );

    if (filtered.length === 0) {
      resultsContainer.innerHTML = `<div class="empty"><h3>No partners found</h3><p>Try expanding your search radius.</p></div>`;
      return;
    }

    filtered.forEach(item => {
      // Create HTML Card matching original CSS
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.id = item.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `View details for ${item.name}`);
      card.innerHTML = `
        <div class="card-body">
          <div class="card-top">
            <h3>${item.name}</h3>
            <span class="dist">${item.dist} km</span>
          </div>
          <p class="desc">${item.desc}</p>
          <div class="chips">
            <span class="chip chip-featured">Verified B2B Partner</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => openDetail(item.id));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(item.id);
        }
      });

      resultsContainer.appendChild(card);

      // Attach Map Marker and Popup
      const marker = L.marker([item.lat, item.lng]).addTo(map);
      marker.bindPopup(`<strong>${item.name}</strong><br>${item.desc}`);
      currentMapMarkers.push(marker);
    });
    
    // Automatically zoom map to fit all current markers
    if (currentMapMarkers.length > 0) {
      const group = L.featureGroup(currentMapMarkers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // Handle Tab Switching
  tabWholesaler.addEventListener('click', () => {
    currentMode = 'wholesaler';
    currentCategory = 'all';
    tabWholesaler.setAttribute('aria-selected', 'true');
    tabDelivery.setAttribute('aria-selected', 'false');
    renderCategories();
    renderResults();
  });

  tabDelivery.addEventListener('click', () => {
    currentMode = 'delivery';
    currentCategory = 'all';
    tabDelivery.setAttribute('aria-selected', 'true');
    tabWholesaler.setAttribute('aria-selected', 'false');
    renderCategories();
    renderResults();
  });

  // Execute initial load
  renderCategories();
  renderResults();
});