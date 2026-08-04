import { calculateSafeRoute } from './safe_router.js';

// Application State
let allSchools = [];
let filteredSchools = [];
let map = null;
let markerClusterGroup = null;
let originPoint = null; // { lat, lng, name }
let destPoint = null;   // { lat, lng, name }
let originMarker = null;
let destMarker = null;
let safeRoutePolyline = null;
let standardRoutePolyline = null;
let safeWaypointMarkers = [];

// Custom SVG Icons
const blueMarkerSvg = `
<svg class="marker-pin-svg" viewBox="0 0 384 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z" fill="#2563eb"/>
  <circle cx="192" cy="192" r="100" fill="#ffffff"/>
  <!-- Camera Icon inside -->
  <path d="M140 160h104c8.8 0 16 7.2 16 16v64c0 8.8-7.2 16-16 16H140c-8.8 0-16-7.2-16-16v-64c0-8.8 7.2-16 16-16zm24-20h56l12 20h-80l12-20z" fill="#2563eb"/>
  <circle cx="192" cy="208" r="24" fill="#2563eb"/>
</svg>`;

const redMarkerSvg = `
<svg class="marker-pin-svg" viewBox="0 0 384 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z" fill="#ef4444"/>
  <circle cx="192" cy="192" r="100" fill="#ffffff"/>
  <!-- Warning Slash Icon -->
  <path d="M145 150l94 94m-94 0l94-94" stroke="#ef4444" stroke-width="28" stroke-linecap="round"/>
</svg>`;

const blueIcon = L.divIcon({
  html: blueMarkerSvg,
  className: 'custom-marker-icon',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -40]
});

const redIcon = L.divIcon({
  html: redMarkerSvg,
  className: 'custom-marker-icon',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -40]
});

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  setupUIEventListeners();
  await loadData();
});

function initMap() {
  // Center on South Korea
  map = L.map('map', {
    center: [36.3, 127.8],
    zoom: 7,
    zoomControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Dark Map Tile Layer (CartoDB Dark Matter)
  const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  });
  darkTiles.addTo(map);

  // Marker Cluster Group
  markerClusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  });
  map.addLayer(markerClusterGroup);
}

async function loadData() {
  try {
    const res = await fetch('/data/schools.json');
    if (!res.ok) throw new Error('Data fetch failed');
    allSchools = await res.json();
    filteredSchools = [...allSchools];

    populateFacilityTypes();
    renderMarkers();
    updateStats();
  } catch (err) {
    console.error('Failed to load school data:', err);
  }
}

function populateFacilityTypes() {
  const container = document.getElementById('facility-checkbox-container');
  container.innerHTML = '';

  const typeCounts = {};
  allSchools.forEach(s => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  });

  const sortedTypes = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]);

  sortedTypes.forEach(t => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `
      <input type="checkbox" name="facility-type" value="${t}" checked>
      <span>${t} (${typeCounts[t]})</span>
    `;
    container.appendChild(label);
  });

  // Attach change listener to checkboxes
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', applyFilters);
  });
}

function applyFilters() {
  const searchKey = document.getElementById('search-input').value.trim().toLowerCase();
  const cctvFilter = document.querySelector('input[name="cctv-filter"]:checked').value;
  const checkedTypes = Array.from(document.querySelectorAll('input[name="facility-type"]:checked')).map(cb => cb.value);

  filteredSchools = allSchools.filter(school => {
    // 1. Keyword search (Name or Address)
    if (searchKey) {
      const matchName = school.name.toLowerCase().includes(searchKey);
      const matchRoad = school.road_addr.toLowerCase().includes(searchKey);
      const matchJibun = school.jibun_addr.toLowerCase().includes(searchKey);
      if (!matchName && !matchRoad && !matchJibun) return false;
    }

    // 2. CCTV Y/N Filter
    if (cctvFilter !== 'ALL' && school.cctv_yn !== cctvFilter) {
      return false;
    }

    // 3. Facility Type Filter
    if (!checkedTypes.includes(school.type)) {
      return false;
    }

    return true;
  });

  renderMarkers();
  updateStats();
}

function renderMarkers() {
  markerClusterGroup.clearLayers();

  const markers = [];
  filteredSchools.forEach(school => {
    const icon = school.cctv_yn === 'Y' ? blueIcon : redIcon;
    const marker = L.marker([school.lat, school.lng], { icon });

    marker.bindPopup(() => createPopupContent(school), {
      maxWidth: 320,
      className: 'custom-leaflet-popup'
    });

    markers.push(marker);
  });

  markerClusterGroup.addLayers(markers);
}

function createPopupContent(school) {
  const popupDiv = document.createElement('div');
  popupDiv.className = 'popup-card';

  const isY = school.cctv_yn === 'Y';
  const badgeClass = isY ? 'badge-y' : 'badge-n';
  const badgeText = isY ? `CCTV 설치 (${school.cctv_cnt}대)` : 'CCTV 미설치';

  const addressText = school.road_addr || school.jibun_addr || '주소 정보 없음';

  popupDiv.innerHTML = `
    <div class="popup-header">
      <div class="popup-title">${school.name}</div>
      <span class="popup-cctv-badge ${badgeClass}">${badgeText}</span>
    </div>

    <div class="popup-info-grid">
      <div class="info-row">
        <i class="fa-solid fa-tag"></i>
        <span class="row-text">시설종류:</span>
        <span class="row-val">${school.type}</span>
      </div>
      <div class="info-row">
        <i class="fa-solid fa-location-dot"></i>
        <span class="row-text">주소:</span>
        <span class="row-val">${addressText}</span>
      </div>
      <div class="info-row">
        <i class="fa-solid fa-ruler-horizontal"></i>
        <span class="row-text">보호구역도로폭:</span>
        <span class="row-val">${school.road_width}m</span>
      </div>
      <div class="info-row">
        <i class="fa-solid fa-building-shield"></i>
        <span class="row-text">관할경찰서명:</span>
        <span class="row-val">${school.police}</span>
      </div>
    </div>

    <div class="popup-actions">
      <button class="popup-btn set-origin-btn"><i class="fa-solid fa-location-crosshairs"></i> 출발지로 설정</button>
      <button class="popup-btn set-dest-btn"><i class="fa-solid fa-flag-checkered"></i> 목적지로 설정</button>
    </div>
  `;

  // Attach button events
  popupDiv.querySelector('.set-origin-btn').addEventListener('click', () => {
    setOriginPoint({ lat: school.lat, lng: school.lng, name: school.name });
    map.closePopup();
    switchToRouteTab();
  });

  popupDiv.querySelector('.set-dest-btn').addEventListener('click', () => {
    setDestPoint({ lat: school.lat, lng: school.lng, name: school.name });
    map.closePopup();
    switchToRouteTab();
  });

  return popupDiv;
}

function updateStats() {
  const total = filteredSchools.length;
  const cctvY = filteredSchools.filter(s => s.cctv_yn === 'Y').length;
  const cctvN = total - cctvY;
  const ratio = total > 0 ? Math.round((cctvY / total) * 100) : 0;

  document.getElementById('stat-total-count').textContent = total.toLocaleString();
  document.getElementById('stat-cctv-y-count').textContent = cctvY.toLocaleString();
  document.getElementById('stat-cctv-n-count').textContent = cctvN.toLocaleString();
  document.getElementById('stat-safe-ratio').textContent = `${ratio}%`;
}

function setupUIEventListeners() {
  // Sidebar Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Search Input
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', applyFilters);

  document.getElementById('clear-search-btn').addEventListener('click', () => {
    searchInput.value = '';
    applyFilters();
  });

  // CCTV Filter Radio
  document.querySelectorAll('input[name="cctv-filter"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.radio-chip').forEach(chip => chip.classList.remove('active'));
      radio.closest('.radio-chip').classList.add('active');
      applyFilters();
    });
  });

  // Facility Type Quick Toggles
  document.getElementById('select-all-types').addEventListener('click', () => {
    document.querySelectorAll('input[name="facility-type"]').forEach(cb => cb.checked = true);
    applyFilters();
  });

  document.getElementById('deselect-all-types').addEventListener('click', () => {
    document.querySelectorAll('input[name="facility-type"]').forEach(cb => cb.checked = false);
    applyFilters();
  });

  document.getElementById('reset-filters-btn').addEventListener('click', () => {
    searchInput.value = '';
    document.querySelector('input[name="cctv-filter"][value="ALL"]').checked = true;
    document.querySelectorAll('input[name="facility-type"]').forEach(cb => cb.checked = true);
    applyFilters();
  });

  // Dark/Light Theme Toggle
  document.getElementById('toggle-theme-btn').addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    document.getElementById('toggle-theme-btn').innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  });

  // Route Autocomplete Inputs
  setupAutocomplete('origin-input', 'origin-results', (point) => setOriginPoint(point));
  setupAutocomplete('destination-input', 'dest-results', (point) => setDestPoint(point));

  // Swap Route Points
  document.getElementById('swap-route-btn').addEventListener('click', () => {
    const temp = originPoint;
    setOriginPoint(destPoint);
    setDestPoint(temp);
  });

  // Calculate Safe Route Button
  document.getElementById('calc-route-btn').addEventListener('click', handleCalculateRoute);

  // Clear Route Button
  document.getElementById('clear-route-btn').addEventListener('click', clearRoute);
}

function setupAutocomplete(inputId, listId, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (!val) {
      list.classList.remove('active');
      return;
    }

    const matches = allSchools.filter(s =>
      s.name.toLowerCase().includes(val) || s.road_addr.toLowerCase().includes(val)
    ).slice(0, 6);

    list.innerHTML = '';
    if (matches.length === 0) {
      list.classList.remove('active');
      return;
    }

    matches.forEach(m => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `
        <span class="item-title">${m.name}</span>
        <span class="item-sub">${m.road_addr || m.jibun_addr}</span>
      `;
      item.addEventListener('click', () => {
        input.value = m.name;
        list.classList.remove('active');
        onSelect({ lat: m.lat, lng: m.lng, name: m.name });
      });
      list.appendChild(item);
    });

    list.classList.add('active');
  });

  // Close list on blur
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.remove('active');
    }
  });
}

function switchToRouteTab() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const routeBtn = document.querySelector('.tab-btn[data-tab="route-tab"]');
  routeBtn.classList.add('active');
  document.getElementById('route-tab').classList.add('active');
}

function setOriginPoint(point) {
  originPoint = point;
  document.getElementById('origin-input').value = point ? point.name : '';

  if (originMarker) map.removeLayer(originMarker);

  if (point) {
    originMarker = L.marker([point.lat, point.lng], {
      icon: L.divIcon({
        html: '<div style="background:#3b82f6;color:white;padding:6px 12px;border-radius:20px;font-weight:bold;font-size:12px;box-shadow:0 0 10px #3b82f6;">📍 출발</div>',
        className: '',
        iconAnchor: [30, 15]
      })
    }).addTo(map);
  }
}

function setDestPoint(point) {
  destPoint = point;
  document.getElementById('destination-input').value = point ? point.name : '';

  if (destMarker) map.removeLayer(destMarker);

  if (point) {
    destMarker = L.marker([point.lat, point.lng], {
      icon: L.divIcon({
        html: '<div style="background:#10b981;color:white;padding:6px 12px;border-radius:20px;font-weight:bold;font-size:12px;box-shadow:0 0 10px #10b981;">🏁 목적지</div>',
        className: '',
        iconAnchor: [35, 15]
      })
    }).addTo(map);
  }
}

async function handleCalculateRoute() {
  if (!originPoint || !destPoint) {
    alert('출발지와 목적지를 모두 선택하거나 검색해 주세요.');
    return;
  }

  // Clear previous route polylines
  clearPolylines();

  // Show loading in button
  const calcBtn = document.getElementById('calc-route-btn');
  calcBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 경로 분석 중...';
  calcBtn.disabled = true;

  try {
    const result = await calculateSafeRoute(originPoint, destPoint, allSchools);
    renderRouteResults(result);
  } catch (err) {
    console.error('Route calculation error:', err);
    alert('경로 계산 중 오류가 발생했습니다.');
  } finally {
    calcBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> 안심 경로 탐색';
    calcBtn.disabled = false;
  }
}

function renderRouteResults(result) {
  const { standardRoute, safeRoute } = result;

  // 1. Draw Standard Route Polyline (Gray Dashed)
  const stdLatLngs = standardRoute.coordinates.map(c => [c[1], c[0]]);
  standardRoutePolyline = L.polyline(stdLatLngs, {
    color: '#94a3b8',
    weight: 5,
    dashArray: '8, 8',
    opacity: 0.7
  }).addTo(map);

  // 2. Draw Safe Route Polyline (Neon Green/Cyan Glow)
  const safeLatLngs = safeRoute.coordinates.map(c => [c[1], c[0]]);
  safeRoutePolyline = L.polyline(safeLatLngs, {
    color: '#10b981',
    weight: 8,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Fit bounds to fit both routes
  const bounds = L.latLngBounds([...stdLatLngs, ...safeLatLngs]);
  map.fitBounds(bounds, { padding: [60, 60] });

  // 3. Update Result Cards
  document.getElementById('route-result-container').classList.remove('hidden');

  // Safe Card
  document.getElementById('safe-score-val').textContent = `안전 ${safeRoute.safety.safetyScore}점`;
  document.getElementById('safe-cctv-cnt').textContent = `${safeRoute.safety.cctvCount}대`;
  document.getElementById('safe-school-ratio').textContent = `${safeRoute.safety.coverageRatio}%`;
  document.getElementById('safe-distance').textContent = `${safeRoute.distanceKm}km`;
  document.getElementById('safe-time').textContent = `${safeRoute.durationMin}분`;

  // Standard Card
  document.getElementById('standard-score-val').textContent = `안전 ${standardRoute.safety.safetyScore}점`;
  document.getElementById('standard-cctv-cnt').textContent = `${standardRoute.safety.cctvCount}대`;
  document.getElementById('standard-school-ratio').textContent = `${standardRoute.safety.coverageRatio}%`;
  document.getElementById('standard-distance').textContent = `${standardRoute.distanceKm}km`;
  document.getElementById('standard-time').textContent = `${standardRoute.durationMin}분`;
}

function clearPolylines() {
  if (standardRoutePolyline) {
    map.removeLayer(standardRoutePolyline);
    standardRoutePolyline = null;
  }
  if (safeRoutePolyline) {
    map.removeLayer(safeRoutePolyline);
    safeRoutePolyline = null;
  }
  safeWaypointMarkers.forEach(m => map.removeLayer(m));
  safeWaypointMarkers = [];
}

function clearRoute() {
  clearPolylines();
  setOriginPoint(null);
  setDestPoint(null);
  document.getElementById('route-result-container').classList.add('hidden');
}
