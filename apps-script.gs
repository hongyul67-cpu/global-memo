/**
 * 현장 기록장 · 수신용 Google Apps Script (PDF 저장 방식)
 * ------------------------------------------------------------
 * 앱의 "선생님께 제출하기" 버튼이 보내는 기록을 받아서
 *   1) 보고서 PDF를 자동 생성해 드라이브 폴더 "현장기록장 제출PDF" 에 저장
 *        (파일명: 이름_날짜_장소.pdf)
 *   2) 스프레드시트 "현장기록장 제출목록" 에 한 줄씩 인덱스 기록
 *        (제출시각 · 이름 · 날짜 · 장소 · 방문유형 · 키워드 · PDF파일명 · PDF링크)
 *
 * [처음 배포]
 * 1) script.google.com → 새 프로젝트 → 이 코드 전체 붙여넣기 → 저장
 * 2) 배포 → 새 배포 → 유형: 웹 앱
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자
 * 3) 나오는 웹 앱 URL(.../exec)을 앱의 SCRIPT_URL 에 넣기
 *
 * [코드 고친 뒤 재배포]  ★중요★
 *   배포 → 배포 관리 → (기존 배포) 연필(편집) → 버전: "새 버전" → 배포
 *   (URL 유지됨. "새 배포"를 누르면 URL이 새로 생기니 주의)
 *
 * [권한(승인)]
 *   이 버전은 문서(DocumentApp) 권한이 추가로 필요해요.
 *   저장/실행 시 뜨는 권한 요청 창에서 REVIEW PERMISSIONS →
 *   (확인되지 않은 앱 경고) Advanced → "…(으)로 이동" → Allow 까지 눌러 승인.
 *   실행 계정이 "나"이면 선생님이 한 번만 승인하면 학생은 로그인 불필요.
 */
const TOKEN = 'fieldlog-2026';
const PDF_FOLDER = '현장기록장 제출PDF';
const INDEX_SHEET = '현장기록장 제출목록';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return json_({ ok: false, error: '토큰 불일치' });

    // ── PDF 저장 폴더 ──
    var fit = DriveApp.getFoldersByName(PDF_FOLDER);
    var folder = fit.hasNext() ? fit.next() : DriveApp.createFolder(PDF_FOLDER);

    // ── 보고서 PDF 생성 후 저장 ──
    var pdfFile = makePdf_(data, folder);

    // ── 제출목록 시트에 인덱스 한 줄 ──
    var files = DriveApp.getFilesByName(INDEX_SHEET);
    var ss = files.hasNext() ? SpreadsheetApp.open(files.next())
                             : SpreadsheetApp.create(INDEX_SHEET);
    var sheet = ss.getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['제출시각', '이름', '날짜', '장소', '방문유형', '키워드', 'PDF 파일명', 'PDF 링크']);
    }
    sheet.appendRow([new Date(), data.name, data.date, data.place, data.visit,
      (data.keywords || []).join(', '), pdfFile.getName(), pdfFile.getUrl()]);

    return json_({ ok: true, file: pdfFile.getName() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// 기록 1건 → 보고서 PDF 파일(임시 구글 문서를 만들어 PDF로 변환 후 문서는 삭제)
function makePdf_(data, folder) {
  var safe = function (s) { return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').trim(); };
  var base = safe(data.name || '이름') + '_' + safe(data.date || '') +
             (data.place ? ('_' + safe(data.place)) : '');

  var doc = DocumentApp.create(base);
  var body = doc.getBody();

  body.appendParagraph((data.name || '') + ' · ' + (data.date || ''))
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  var meta = [data.place, data.visit].filter(function (x) { return !!x; }).join(' · ');
  if (data.keywords && data.keywords.length) meta += (meta ? '   ' : '') + '[' + data.keywords.join(', ') + ']';
  if (meta) body.appendParagraph(meta);
  body.appendHorizontalRule();

  section_(body, '본 것 · 사실', data.facts);
  section_(body, '인상 깊었던 점 + 이유', data.impression);
  section_(body, '한국과 다른 점', data.difference);
  section_(body, '궁금한 점 · 질문', data.question);

  var photos = data.photos || [];
  if (photos.length) {
    body.appendParagraph('사진').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    for (var i = 0; i < photos.length; i++) {
      try {
        var p = String(photos[i] || '');
        var comma = p.indexOf(',');
        var b64 = comma >= 0 ? p.substring(comma + 1) : p;
        var img = body.appendImage(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg'));
        var w = img.getWidth(), h = img.getHeight();
        if (w > 430) { img.setWidth(430); img.setHeight(Math.round(h * 430 / w)); }
      } catch (pe) {
        body.appendParagraph('[사진 ' + (i + 1) + ' 오류: ' + pe + ']');
      }
    }
  }

  doc.saveAndClose();
  var docFile = DriveApp.getFileById(doc.getId());
  var pdf = docFile.getAs('application/pdf').setName(base + '.pdf');
  var saved = folder.createFile(pdf);
  docFile.setTrashed(true); // 임시 문서 삭제
  return saved;
}

function section_(body, label, text) {
  body.appendParagraph(label).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(text && String(text).trim() ? String(text) : '—')
      .setHeading(DocumentApp.ParagraphHeading.NORMAL);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 브라우저로 URL을 열었을 때 정상 배포 확인용
// build 값이 'pdf-v2' 로 보이면 이 PDF 버전이 라이브라는 뜻
function doGet() {
  return json_({ ok: true, alive: true, build: 'pdf-v2' });
}
