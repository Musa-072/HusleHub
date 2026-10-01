document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('supplierDetailPage');
  if (!container) return;

  const mockData = [
    { id: 'bakery-1', type: 'wholesaler', category: 'bakery', name: 'Tembisa Bulk Bakery', dist: '2.1', desc: 'Fresh loaves daily for kota vendors at wholesale rates.', lat: -26.0125, lng: 28.2190 },
    { id: 'meat-1', type: 'wholesaler', category: 'meat', name: 'East Rand Meats', dist: '3.5', desc: 'Discounted sausages, polony, and cold meats.', lat: -26.1685, lng: 28.2435 },
    { id: 'delivery-1', type: 'delivery', category: 'bike', name: 'Speedy Kasi Delivery', dist: '1.2', desc: 'Local food delivery fleet for fast food businesses.', lat: -26.1420, lng: 28.1600 },
    { id: 'delivery-2', type: 'delivery', category: 'van', name: 'Gauteng Loaders', dist: '4.8', desc: 'Bakkie hire for moving bulk stock and equipment.', lat: -26.1200, lng: 28.1800 }
  ];

  const getCategoryLabel = (catId) => {
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
  };

  const itemId = new URLSearchParams(window.location.search).get('id');
  const item = mockData.find(entry => entry.id === itemId);

  if (!item) {
    container.innerHTML = `
      <div class="empty">
        <h3>Supplier not found</h3>
        <p>The supplier you tried to open is unavailable. <a href="supplier.html">Go back to the supplier list</a>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
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
});
