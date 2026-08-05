/* app.js
 * 데이터 로드 → 지도 초기화 → 필터/경로 모듈 연결
 */
(function () {
  'use strict';

  var DATA_URL = 'data/child_safety_zones.json';
  var loadingEl = document.getElementById('map-loading');

  function hideLoading() {
    loadingEl.classList.add('hidden');
    setTimeout(function () { loadingEl.style.display = 'none'; }, 350);
  }

  function showLoadError(msg) {
    loadingEl.innerHTML = '<span style="max-width:260px;text-align:center;color:#e5484d;">' + msg + '</span>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.MapModule.init();

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('데이터 파일을 불러올 수 없습니다 (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        window.MapModule.setData(data);
        window.RouteModule.init(data);
        window.FilterModule.init(data, function (filtered) {
          window.MapModule.render(filtered);
        });
        hideLoading();
      })
      .catch(function (err) {
        console.error(err);
        showLoadError(
          '데이터를 불러오지 못했습니다.<br/>' + err.message +
          '<br/><br/>브라우저 보안 정책상 fetch()는 로컬 서버(http://)에서만 동작합니다.<br/>' +
          '예: <code>python -m http.server</code> 실행 후 접속해주세요.'
        );
      });
  });
})();
