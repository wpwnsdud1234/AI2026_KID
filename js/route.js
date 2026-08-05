/* route.js
 * - 지도 클릭 또는 주소 검색으로 출발지/도착지 지정
 * - OSRM 공개 라우팅 서버로 "최단 경로" 계산
 * - 어린이보호구역을 경유지(waypoint)로 삼아 "보호구역 우선 경유 경로" 계산
 *
 * 참고: 클라이언트 단독 구현이라 외부 무료 API(OSRM 데모서버, Nominatim)를
 * 사용한다. 두 서비스 모두 대량/상업적 트래픽에는 적합하지 않으므로,
 * 실제 서비스 전환 시 자체 라우팅/지오코딩 서버로 교체가 필요하다. (PRD 8장 참고)
 */
(function () {
  'use strict';

  var OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving/';
  var NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

  var MAX_WAYPOINTS = 5;      // 경유지로 사용할 최대 보호구역 수
  var MAX_LEG_KM = 400;       // 과도한 전국 경로 요청 방지용 안전장치

  var allData = [];
  var startPoint = null; // {lat, lng}
  var endPoint = null;
  var pickingRole = null; // 'start' | 'end' | null

  var startInput = document.getElementById('route-start-input');
  var endInput = document.getElementById('route-end-input');
  var pickStartBtn = document.getElementById('pick-start-btn');
  var pickEndBtn = document.getElementById('pick-end-btn');
  var findBtn = document.getElementById('find-route-btn');
  var clearBtn = document.getElementById('clear-route-btn');
  var statusEl = document.getElementById('route-status');
  var resultEl = document.getElementById('route-result');
  var shortestDistEl = document.getElementById('route-shortest-dist');
  var shortestTimeEl = document.getElementById('route-shortest-time');
  var safeDistEl = document.getElementById('route-safe-dist');
  var safeTimeEl = document.getElementById('route-safe-time');
  var zoneCountEl = document.getElementById('route-zone-count');

  // ---------------- 지오메트리 헬퍼 (평면 근사, 한반도 규모에서는 충분히 정확) ----------------

  function toXY(lat, lng, refLat, refLng) {
    var R = 6371000;
    var x = (lng - refLng) * (Math.PI / 180) * R * Math.cos(refLat * Math.PI / 180);
    var y = (lat - refLat) * (Math.PI / 180) * R;
    return { x: x, y: y };
  }

  function haversine(a, b) {
    var R = 6371000;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** p를 a-b 선분에 투영, {t, distMeters} 반환. t<0/>1 이면 선분 밖 */
  function projectToSegment(p, a, b) {
    var refLat = a.lat, refLng = a.lng;
    var P = toXY(p.lat, p.lng, refLat, refLng);
    var A = { x: 0, y: 0 };
    var B = toXY(b.lat, b.lng, refLat, refLng);

    var ABx = B.x - A.x, ABy = B.y - A.y;
    var lenSq = ABx * ABx + ABy * ABy;
    if (lenSq === 0) return { t: 0, dist: haversine(p, a) };

    var t = ((P.x - A.x) * ABx + (P.y - A.y) * ABy) / lenSq;
    var projX = A.x + t * ABx, projY = A.y + t * ABy;
    var dist = Math.sqrt((P.x - projX) ** 2 + (P.y - projY) ** 2);
    return { t: t, dist: dist };
  }

  /** 출발-도착 사이 어린이보호구역 중 경유지로 쓸 후보를 선정 */
  function pickWaypointZones(start, end) {
    var routeLen = haversine(start, end);
    if (routeLen < 50) return [];

    var bandWidth = Math.min(2500, Math.max(300, routeLen * 0.12));

    var candidates = [];
    for (var i = 0; i < allData.length; i++) {
      var rec = allData[i];
      var proj = projectToSegment({ lat: rec.lat, lng: rec.lng }, start, end);
      if (proj.t >= -0.03 && proj.t <= 1.03 && proj.dist <= bandWidth) {
        candidates.push({ rec: rec, t: proj.t, dist: proj.dist });
      }
    }

    // 경로 진행 순서(t)로 정렬
    candidates.sort(function (a, b) { return a.t - b.t; });

    // 너무 촘촘한 후보는 건너뛰어 간격을 확보(최소 t 간격)
    var minGap = 1 / (MAX_WAYPOINTS + 1);
    var chosen = [];
    var lastT = -Infinity;
    for (var j = 0; j < candidates.length && chosen.length < MAX_WAYPOINTS; j++) {
      var c = candidates[j];
      if (c.t - lastT >= minGap) {
        chosen.push(c.rec);
        lastT = c.t;
      }
    }
    return chosen;
  }

  // ---------------- 외부 API 호출 ----------------

  function fetchOSRMRoute(points) {
    // points: [{lat,lng}, ...] 최소 2개, 순서대로 경유
    var coordStr = points.map(function (p) {
      return p.lng.toFixed(6) + ',' + p.lat.toFixed(6);
    }).join(';');

    var url = OSRM_BASE + coordStr + '?overview=full&geometries=geojson';

    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('OSRM 요청 실패 (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        throw new Error('경로를 찾을 수 없습니다');
      }
      var route = data.routes[0];
      var coords = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
      return { coords: coords, distance: route.distance, duration: route.duration };
    });
  }

  function geocode(query) {
    var url = NOMINATIM_BASE + '?format=json&limit=1&countrycodes=kr&q=' + encodeURIComponent(query);
    return fetch(url, { headers: { 'Accept-Language': 'ko' } }).then(function (res) {
      if (!res.ok) throw new Error('주소 검색 실패');
      return res.json();
    }).then(function (list) {
      if (!list || !list.length) throw new Error('검색 결과가 없습니다: "' + query + '"');
      return { lat: parseFloat(list[0].lat), lng: parseFloat(list[0].lon), label: list[0].display_name };
    });
  }

  // ---------------- 표시/포맷 ----------------

  function fmtDist(meters) {
    if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
    return Math.round(meters) + ' m';
  }
  function fmtTime(seconds) {
    var min = Math.round(seconds / 60);
    if (min >= 60) return Math.floor(min / 60) + '시간 ' + (min % 60) + '분';
    return min + '분';
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#ff8b8f' : '#ffd873';
  }

  // ---------------- 지도 클릭으로 지점 지정 ----------------

  function stopPicking() {
    pickingRole = null;
    pickStartBtn.classList.remove('picking');
    pickEndBtn.classList.remove('picking');
  }

  function startPicking(role) {
    pickingRole = role;
    pickStartBtn.classList.toggle('picking', role === 'start');
    pickEndBtn.classList.toggle('picking', role === 'end');
    setStatus(role === 'start' ? '지도를 클릭해 출발지를 지정하세요.' : '지도를 클릭해 도착지를 지정하세요.');
  }

  function onMapClick(e) {
    if (!pickingRole) return;
    var latlng = { lat: e.latlng.lat, lng: e.latlng.lng };
    setPoint(pickingRole, latlng, '지도에서 선택한 위치');
    stopPicking();
  }

  function setPoint(role, latlng, label) {
    if (role === 'start') {
      startPoint = latlng;
      startInput.value = label || (latlng.lat.toFixed(5) + ', ' + latlng.lng.toFixed(5));
    } else {
      endPoint = latlng;
      endInput.value = label || (latlng.lat.toFixed(5) + ', ' + latlng.lng.toFixed(5));
    }
    window.MapModule.setRoutePoint(role, [latlng.lat, latlng.lng]);
    setStatus('');
  }

  // ---------------- 메인 경로 탐색 ----------------

  function findRoute() {
    if (!startPoint || !endPoint) {
      setStatus('출발지와 도착지를 먼저 지정해주세요.', true);
      return;
    }

    var directDist = haversine(startPoint, endPoint);
    if (directDist > MAX_LEG_KM * 1000) {
      setStatus('직선거리 ' + MAX_LEG_KM + 'km를 초과하는 경로는 데모 라우팅 서버 부하 방지를 위해 지원하지 않습니다.', true);
      return;
    }

    findBtn.disabled = true;
    resultEl.hidden = true;
    setStatus('경로를 계산하는 중…');

    var zones = pickWaypointZones(startPoint, endPoint);
    var safePoints = [startPoint].concat(zones.map(function (r) { return { lat: r.lat, lng: r.lng }; })).concat([endPoint]);

    Promise.all([
      fetchOSRMRoute([startPoint, endPoint]),
      fetchOSRMRoute(safePoints)
    ]).then(function (results) {
      var shortest = results[0];
      var safe = results[1];

      window.MapModule.drawRoutes(shortest.coords, safe.coords, zones);

      shortestDistEl.textContent = fmtDist(shortest.distance);
      shortestTimeEl.textContent = fmtTime(shortest.duration);
      safeDistEl.textContent = fmtDist(safe.distance);
      safeTimeEl.textContent = fmtTime(safe.duration);

      var extraKm = (safe.distance - shortest.distance) / 1000;
      var zoneMsg = zones.length
        ? '이 경로는 어린이보호구역 ' + zones.length + '곳을 경유하며, 최단 경로보다 약 ' +
          extraKm.toFixed(1) + 'km 더 이동합니다.'
        : '경로 주변에서 경유 가능한 어린이보호구역을 찾지 못해 최단 경로와 동일하게 안내됩니다.';
      zoneCountEl.textContent = zoneMsg;

      resultEl.hidden = false;
      setStatus('');
    }).catch(function (err) {
      console.error(err);
      setStatus('경로 계산 중 오류가 발생했습니다: ' + err.message, true);
    }).finally(function () {
      findBtn.disabled = false;
    });
  }

  function clearRoute() {
    startPoint = null;
    endPoint = null;
    startInput.value = '';
    endInput.value = '';
    resultEl.hidden = true;
    setStatus('');
    stopPicking();
    window.MapModule.clearAllRoute();
  }

  // ---------------- 주소 입력창 검색 (Enter) ----------------

  function bindAddressSearch(input, role) {
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = input.value.trim();
      if (!q) return;
      setStatus('"' + q + '" 검색 중…');
      geocode(q).then(function (loc) {
        setPoint(role, { lat: loc.lat, lng: loc.lng }, loc.label);
      }).catch(function (err) {
        setStatus(err.message, true);
      });
    });
  }

  function init(data) {
    allData = data;

    pickStartBtn.addEventListener('click', function () {
      if (pickingRole === 'start') { stopPicking(); return; }
      startPicking('start');
    });
    pickEndBtn.addEventListener('click', function () {
      if (pickingRole === 'end') { stopPicking(); return; }
      startPicking('end');
    });

    findBtn.addEventListener('click', findRoute);
    clearBtn.addEventListener('click', clearRoute);

    bindAddressSearch(startInput, 'start');
    bindAddressSearch(endInput, 'end');

    window.MapModule.getMap().on('click', onMapClick);
  }

  window.RouteModule = { init: init };
})();
