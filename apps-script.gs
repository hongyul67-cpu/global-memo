/**
 * 현장 기록장 · 수신용 Google Apps Script
 * ------------------------------------------------------------
 * 앱의 "선생님께 제출하기" 버튼이 보내는 기록을 받아
 *   - 스프레드시트 "현장기록장 응답" 에 한 줄씩 저장
 *   - 사진은 드라이브 폴더 "현장기록장 사진" 에 저장하고 링크 연결
 *
 * [배포 방법]
 * 1) script.google.com → 새 프로젝트 → 이 코드 전체 붙여넣기 → 저장
 * 2) 배포 → 새 배포 → 유형: 웹 앱
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자
 * 3) 배포 후 나오는 웹 앱 URL(.../exec)을 앱의 SCRIPT_URL 에 넣기
 *      (index.html / field-log.jsx 상단 상수)
 * 4) 코드를 바꾸면 반드시 "배포 관리 → 편집(연필) → 새 버전 → 배포" 로 갱신
 *
 * TOKEN 은 앱(SUBMIT_TOKEN)과 값이 같아야 합니다.
 */
const TOKEN = 'fieldlog-2026';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) throw new Error('토큰 불일치');

    // 시트 준비 (없으면 자동 생성)
    const it = DriveApp.getFilesByName('현장기록장 응답');
    const ss = it.hasNext() ? SpreadsheetApp.open(it.next())
                            : SpreadsheetApp.create('현장기록장 응답');
    const sheet = ss.getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['제출시각', '이름', '날짜', '장소', '방문유형', '키워드',
                       '본 것(사실)', '인상 깊었던 점', '한국과 다른 점', '궁금한 점', '사진']);
    }

    // 사진 저장 폴더 (없으면 자동 생성)
    const fit = DriveApp.getFoldersByName('현장기록장 사진');
    const folder = fit.hasNext() ? fit.next() : DriveApp.createFolder('현장기록장 사진');

    const links = (data.photos || []).map(function (p, i) {
      const b64 = p.indexOf(',') >= 0 ? p.split(',')[1] : p;
      const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg',
        data.name + '_' + data.date + '_' + (i + 1) + '.jpg');
      return folder.createFile(blob).getUrl();
    });

    sheet.appendRow([new Date(), data.name, data.date, data.place, data.visit,
      (data.keywords || []).join(', '), data.facts, data.impression,
      data.difference, data.question, links.join('\n')]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
