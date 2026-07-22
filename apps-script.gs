/**
 * 현장 기록장 · 수신용 Google Apps Script
 * ------------------------------------------------------------
 * 앱의 "선생님께 제출하기" 버튼이 보내는 기록을 받아
 *   - 스프레드시트 "현장기록장 응답" 에 한 줄씩 저장
 *   - 사진은 드라이브 폴더 "현장기록장 사진" 에 저장하고 링크 연결
 *
 * [배포 방법]  (처음 한 번)
 * 1) script.google.com → 새 프로젝트 → 이 코드 전체 붙여넣기 → 저장
 * 2) 배포 → 새 배포 → 유형: 웹 앱
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자
 * 3) 배포 후 나오는 웹 앱 URL(.../exec)을 앱의 SCRIPT_URL 에 넣기
 *
 * [코드를 고친 뒤 재배포]  ★ 매우 중요 ★
 *   배포 → 배포 관리 → (기존 배포 오른쪽) 연필(편집)
 *   → 버전: "새 버전" 선택 → 배포
 *   (이렇게 하면 URL은 그대로 유지되고 코드만 갱신됩니다.
 *    "새 배포"를 누르면 URL이 새로 생겨 앱과 안 맞으니 주의!)
 *
 * TOKEN 은 앱(SUBMIT_TOKEN)과 값이 같아야 합니다.
 */
const TOKEN = 'fieldlog-2026';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) {
      return json_({ ok: false, error: '토큰 불일치' });
    }

    // ── 스프레드시트 준비 (없으면 자동 생성) ──
    var files = DriveApp.getFilesByName('현장기록장 응답');
    var ss = files.hasNext() ? SpreadsheetApp.open(files.next())
                             : SpreadsheetApp.create('현장기록장 응답');
    var sheet = ss.getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['제출시각', '이름', '날짜', '장소', '방문유형', '키워드',
                       '본 것(사실)', '인상 깊었던 점', '한국과 다른 점', '궁금한 점', '사진']);
    }

    // ── 사진 저장 (한 장이 실패해도 전체가 멈추지 않도록 각각 try/catch) ──
    var photos = data.photos || [];
    var links = [];
    var photoErr = '';
    if (photos.length) {
      var folder;
      try {
        var fit = DriveApp.getFoldersByName('현장기록장 사진');
        folder = fit.hasNext() ? fit.next() : DriveApp.createFolder('현장기록장 사진');
      } catch (fe) {
        photoErr = '폴더오류: ' + fe;
      }
      for (var i = 0; folder && i < photos.length; i++) {
        try {
          var p = String(photos[i] || '');
          var comma = p.indexOf(',');
          var b64 = comma >= 0 ? p.substring(comma + 1) : p;
          var bytes = Utilities.base64Decode(b64);
          var blob = Utilities.newBlob(bytes, 'image/jpeg',
            (data.name || '이름') + '_' + (data.date || '') + '_' + (i + 1) + '.jpg');
          links.push(folder.createFile(blob).getUrl());
        } catch (pe) {
          photoErr = '사진' + (i + 1) + '오류: ' + pe;
        }
      }
    }

    // ── 기록 한 줄 저장 (사진이 실패해도 글은 반드시 저장) ──
    var photoCell = links.join('\n') + (photoErr ? ('\n[' + photoErr + ']') : '');
    sheet.appendRow([new Date(), data.name, data.date, data.place, data.visit,
      (data.keywords || []).join(', '), data.facts, data.impression,
      data.difference, data.question, photoCell]);

    // 사진이 하나도 못 올라갔으면 실패 이유를 앱에도 알려줌(그래도 글은 저장됨)
    return json_({ ok: true, photos: links.length, note: photoErr });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// (선택) 브라우저로 URL을 그냥 열었을 때 동작 확인용
function doGet() {
  return json_({ ok: true, alive: true });
}
