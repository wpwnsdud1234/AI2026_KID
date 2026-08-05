/* popup.js
 * 마커 클릭 시 표시할 팝업 HTML을 생성한다.
 * 요구사항: 대상시설명 / 주소 / 보호구역도로폭 / 관할경찰서명
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildPopupHtml(rec) {
    var roadWidth = rec.w && rec.w.length ? rec.w + ' m' : '정보 없음';
    var address = rec.a && rec.a.length ? rec.a : '주소 정보 없음';
    var police = rec.p && rec.p.length ? rec.p : '정보 없음';
    var cctvY = rec.c === 'Y';
    var cctvExtra = cctvY && rec.cc ? ' (' + rec.cc + '대)' : '';

    return (
      '<div class="popup-card">' +
        '<h3 class="popup-title">' + escapeHtml(rec.n) + '</h3>' +
        '<div class="popup-row"><span class="popup-key">시설종류</span><span class="popup-val">' + escapeHtml(rec.t) + '</span></div>' +
        '<div class="popup-row"><span class="popup-key">주소</span><span class="popup-val">' + escapeHtml(address) + '</span></div>' +
        '<div class="popup-row"><span class="popup-key">도로폭</span><span class="popup-val">' + escapeHtml(roadWidth) + '</span></div>' +
        '<div class="popup-row"><span class="popup-key">관할경찰서</span><span class="popup-val">' + escapeHtml(police) + '</span></div>' +
        '<span class="popup-badge ' + (cctvY ? 'y' : 'n') + '">' +
          (cctvY ? 'CCTV 설치' + escapeHtml(cctvExtra) : 'CCTV 미설치') +
        '</span>' +
      '</div>'
    );
  }

  window.PopupModule = { build: buildPopupHtml };
})();
