/* map.js
 * Leaflet 지도 초기화, 마커 클러스터링, CCTV 색상 구분, 경로 폴리라인 렌더링.
 */
(function () {
  'use strict';

  var map = null;
  var clusterGroup = null;
  var iconY = null; // CCTV 설치 (파란색)
  var iconN = null; // CCTV 미설치 (빨간색)
  var allData = [];

  // 경로 관련 레이어
  var routeLayerGroup = null;
  var shortestLine = null;
  var safeLine = null;
  var startMarker = null;
  var endMarker = null;

  var KOREA_CENTER = [36.2, 127.9];
  var KOREA_INIT_ZOOM = 7;

  function makeDivIcon(cls) {
    return L.divIcon({
      className: '',
      html: '<div class="zone-marker ' + cls + '" style="width:12px;height:12px;"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      popupAnchor: [0, -6]
    });
  }

  function init() {
    map = L.map('map', {
      center: KOREA_CENTER,
      zoom: KOREA_INIT_ZOOM,
      zoomControl: true,
      preferCanvas: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    iconY = makeDivIcon('cctv-y');
    iconN = makeDivIcon('cctv-n');

    clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      chunkProgress: null,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 17
    });
    map.addLayer(clusterGroup);

    routeLayerGroup = L.layerGroup().addTo(map);

    return map;
  }

  function setData(data) {
    allData = data;
  }

  /** rec 배열을 받아 마커를 생성해 반환 (클러스터 그룹에는 직접 add하지 않음) */
  function buildMarkers(list) {
    var markers = [];
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      var icon = rec.c === 'Y' ? iconY : iconN;
      var m = L.marker([rec.lat, rec.lng], { icon: icon });
      m.bindPopup(window.PopupModule.build(rec), { maxWidth: 260 });
      markers.push(m);
    }
    return markers;
  }

  /** 필터링된 데이터로 지도 마커를 다시 그린다 */
  function render(filteredList) {
    clusterGroup.clearLayers();
    var markers = buildMarkers(filteredList);
    clusterGroup.addLayers(markers);
  }

  function getMap() { return map; }

  // ---------- 경로 관련 ----------

  var routeIcons = {
    start: L.divIcon({
      className: '',
      html: '<div class="route-point-marker">🟢</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    }),
    end: L.divIcon({
      className: '',
      html: '<div class="route-point-marker">🏁</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 22]
    })
  };

  function setRoutePoint(role, latlng) {
    if (role === 'start') {
      if (startMarker) routeLayerGroup.removeLayer(startMarker);
      startMarker = L.marker(latlng, { icon: routeIcons.start, zIndexOffset: 1000 });
      routeLayerGroup.addLayer(startMarker);
    } else {
      if (endMarker) routeLayerGroup.removeLayer(endMarker);
      endMarker = L.marker(latlng, { icon: routeIcons.end, zIndexOffset: 1000 });
      routeLayerGroup.addLayer(endMarker);
    }
  }

  function clearRouteLines() {
    if (shortestLine) { routeLayerGroup.removeLayer(shortestLine); shortestLine = null; }
    if (safeLine) { routeLayerGroup.removeLayer(safeLine); safeLine = null; }
  }

  function clearAllRoute() {
    clearRouteLines();
    if (startMarker) { routeLayerGroup.removeLayer(startMarker); startMarker = null; }
    if (endMarker) { routeLayerGroup.removeLayer(endMarker); endMarker = null; }
  }

  /** coordsLatLng: [[lat,lng], ...] 배열 두 개를 그린다 */
  function drawRoutes(shortestCoords, safeCoords, waypointRecs) {
    clearRouteLines();

    if (shortestCoords && shortestCoords.length) {
      shortestLine = L.polyline(shortestCoords, {
        color: '#7c8aa0',
        weight: 4,
        opacity: 0.85,
        dashArray: '2 10',
        lineCap: 'round'
      }).addTo(routeLayerGroup);
    }

    if (safeCoords && safeCoords.length) {
      safeLine = L.polyline(safeCoords, {
        color: '#ffc629',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round'
      }).addTo(routeLayerGroup);
      safeLine.bringToFront();
    }

    if (waypointRecs && waypointRecs.length) {
      waypointRecs.forEach(function (rec) {
        L.circleMarker([rec.lat, rec.lng], {
          radius: 7,
          color: '#12161f',
          weight: 2,
          fillColor: '#ffc629',
          fillOpacity: 1
        }).bindPopup(window.PopupModule.build(rec)).addTo(routeLayerGroup);
      });
    }

    var group = L.featureGroup(
      [shortestLine, safeLine, startMarker, endMarker].filter(Boolean)
    );
    if (group.getLayers().length) {
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }

  window.MapModule = {
    init: init,
    setData: setData,
    render: render,
    getMap: getMap,
    setRoutePoint: setRoutePoint,
    clearRouteLines: clearRouteLines,
    clearAllRoute: clearAllRoute,
    drawRoutes: drawRoutes
  };
})();
