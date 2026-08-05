/* filter.js
 * 사이드바의 시설종류 / CCTV설치여부 필터 UI를 구성하고,
 * 필터 상태에 따라 데이터를 걸러 콜백으로 전달한다.
 */
(function () {
  'use strict';

  var allData = [];
  var typeCounts = {};
  var state = {
    types: new Set(), // 선택된 시설종류 (빈 값이면 아무것도 선택 안됨)
    cctv: 'all'       // 'all' | 'Y' | 'N'
  };
  var onChangeCallback = null;

  var typeListEl = document.getElementById('type-filter');
  var toggleAllBtn = document.getElementById('type-toggle-all');
  var cctvGroupEl = document.getElementById('cctv-filter');

  var statTotalEl = document.getElementById('stat-total');
  var statYEl = document.getElementById('stat-cctv-y');
  var statNEl = document.getElementById('stat-cctv-n');

  function countTypes(data) {
    var counts = {};
    data.forEach(function (rec) {
      counts[rec.t] = (counts[rec.t] || 0) + 1;
    });
    return counts;
  }

  function buildTypeCheckboxes() {
    // 건수가 많은 순으로 정렬
    var types = Object.keys(typeCounts).sort(function (a, b) {
      return typeCounts[b] - typeCounts[a];
    });

    typeListEl.innerHTML = '';
    types.forEach(function (type) {
      state.types.add(type); // 기본값: 전체 선택

      var label = document.createElement('label');
      label.className = 'type-item';

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.type = type;
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          state.types.add(type);
        } else {
          state.types.delete(type);
        }
        updateToggleAllLabel();
        applyAndNotify();
      });

      var span = document.createElement('span');
      span.textContent = type;

      var count = document.createElement('span');
      count.className = 'type-count';
      count.textContent = typeCounts[type].toLocaleString();

      label.appendChild(checkbox);
      label.appendChild(span);
      label.appendChild(count);
      typeListEl.appendChild(label);
    });

    updateToggleAllLabel();
  }

  function updateToggleAllLabel() {
    var allChecked = state.types.size === Object.keys(typeCounts).length;
    toggleAllBtn.textContent = allChecked ? '전체해제' : '전체선택';
  }

  function bindToggleAll() {
    toggleAllBtn.addEventListener('click', function () {
      var allChecked = state.types.size === Object.keys(typeCounts).length;
      var checkboxes = typeListEl.querySelectorAll('input[type="checkbox"]');
      if (allChecked) {
        state.types.clear();
        checkboxes.forEach(function (cb) { cb.checked = false; });
      } else {
        Object.keys(typeCounts).forEach(function (t) { state.types.add(t); });
        checkboxes.forEach(function (cb) { cb.checked = true; });
      }
      updateToggleAllLabel();
      applyAndNotify();
    });
  }

  function bindCctvSegment() {
    var buttons = cctvGroupEl.querySelectorAll('.seg-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.cctv = btn.dataset.cctv;
        applyAndNotify();
      });
    });
  }

  function getFiltered() {
    return allData.filter(function (rec) {
      if (!state.types.has(rec.t)) return false;
      if (state.cctv !== 'all' && rec.c !== state.cctv) return false;
      return true;
    });
  }

  function updateStats(filtered) {
    var yCount = 0, nCount = 0;
    for (var i = 0; i < filtered.length; i++) {
      if (filtered[i].c === 'Y') yCount++; else nCount++;
    }
    statTotalEl.textContent = filtered.length.toLocaleString();
    statYEl.textContent = yCount.toLocaleString();
    statNEl.textContent = nCount.toLocaleString();
  }

  function applyAndNotify() {
    var filtered = getFiltered();
    updateStats(filtered);
    if (onChangeCallback) onChangeCallback(filtered);
  }

  function init(data, onChange) {
    allData = data;
    onChangeCallback = onChange;
    typeCounts = countTypes(data);

    buildTypeCheckboxes();
    bindToggleAll();
    bindCctvSegment();

    applyAndNotify();
  }

  window.FilterModule = {
    init: init,
    getFiltered: getFiltered
  };
})();
