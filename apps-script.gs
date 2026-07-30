/**
 * 현장 기록장 · 수신용 Google Apps Script (학생 활동 보고서 PDF 양식)
 * ------------------------------------------------------------
 * 앱의 "선생님께 제출하기" 버튼이 보내는 기록을 받아서
 *   1) '학생 활동 보고서' 양식의 PDF를 자동 생성해
 *        드라이브 폴더 "현장기록장 제출PDF" 에 저장 (이름_날짜_장소.pdf)
 *   2) 스프레드시트 "현장기록장 제출목록" 에 인덱스 한 줄 기록
 *
 * [처음 배포]  script.google.com → 새 프로젝트 → 이 코드 붙여넣기 → 저장
 *   → 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → URL을 앱 SCRIPT_URL 에
 * [코드 고친 뒤]  배포 → 배포 관리 → (기존 배포) 연필 → 버전 "새 버전" → 배포  (URL 유지)
 * [확인]  URL을 브라우저로 열어 build 값이 "form-v4" 이면 이 버전(사진 제출 포함)이 라이브
 */
const TOKEN = 'fieldlog-2026';
const PDF_FOLDER = '현장기록장 제출PDF';
const INDEX_SHEET = '현장기록장 제출목록';
const SCHOOL_NAME = '';                    // 예: '○○고등학교' (비우면 표시 안 함)
const PROGRAM_NAME = '호주 글로벌 현장학습';   // 보고서 '프로그램명' 칸

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return json_({ ok: false, error: '토큰 불일치' });

    var fit = DriveApp.getFoldersByName(PDF_FOLDER);
    var folder = fit.hasNext() ? fit.next() : DriveApp.createFolder(PDF_FOLDER);

    // type 'photos' 이면 사진만 모은 PDF, 아니면 기존 '학생 활동 보고서' 양식
    var pdfFile = (data.type === 'photos') ? makePhotoPdf_(data, folder) : makePdf_(data, folder);

    var files = DriveApp.getFilesByName(INDEX_SHEET);
    var ss = files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create(INDEX_SHEET);
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

// 기록 1건 → '학생 활동 보고서' 양식 PDF (임시 문서 생성 후 PDF 변환, 문서는 삭제)
function makePdf_(data, folder) {
  var safe = function (s) { return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').trim(); };
  var base = safe(data.name || '이름') + '_' + safe(data.date || '') +
             (data.place ? ('_' + safe(data.place)) : '');
  var BLUE = '#DCE6F1';

  var doc = DocumentApp.create(base);
  var body = doc.getBody();
  body.setPageWidth(595).setPageHeight(842);
  body.setMarginTop(30).setMarginBottom(30).setMarginLeft(40).setMarginRight(40);

  // 상단 안내줄(첫 빈 문단 재사용)
  var top = body.getChild(0).asParagraph();
  top.setText('학생 활동 보고서 (국제교류형 · 현장실습형 실습 외 활동)');
  top.editAsText().setBold(false).setFontSize(9).setForegroundColor('#5C6B7A');
  top.setSpacingAfter(4);

  // 제목
  var title = body.appendParagraph('학생 활동 보고서');
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.editAsText().setBold(true).setFontSize(20).setForegroundColor('#1B2733');
  title.setSpacingAfter(2);

  // 학교명(오른쪽)
  if (SCHOOL_NAME) {
    var sc = body.appendParagraph(SCHOOL_NAME);
    sc.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    sc.editAsText().setBold(true).setFontSize(11);
    sc.setSpacingAfter(6);
  } else {
    body.appendParagraph('').setSpacingAfter(2);
  }

  // 정보표 (2행 × 4열)
  var t1 = body.appendTable([
    ['일시', data.date || '', '성명', data.name || ''],
    ['프로그램명', PROGRAM_NAME || '', '활동 장소', data.place || ''],
  ]);
  styleTable_(t1);
  t1.setColumnWidth(0, 70); t1.setColumnWidth(2, 70);
  [[0, 0], [0, 2], [1, 0], [1, 2]].forEach(function (rc) { labelCell_(t1.getRow(rc[0]).getCell(rc[1]), BLUE); });
  [[0, 1], [0, 3], [1, 1], [1, 3]].forEach(function (rc) { valueCell_(t1.getRow(rc[0]).getCell(rc[1])); });

  // 주제표 (1행 × 2열)
  var subj = (data.keywords && data.keywords.length) ? data.keywords.join(', ') : (data.visit || '—');
  var t2 = body.appendTable([['주제', subj]]);
  styleTable_(t2);
  t2.setColumnWidth(0, 70);
  labelCell_(t2.getRow(0).getCell(0), BLUE);
  valueCell_(t2.getRow(0).getCell(1));

  // 활동 내용 헤더 + 본문
  var h1 = body.appendTable([['활동 내용']]);
  styleTable_(h1); headerCell_(h1.getRow(0).getCell(0), BLUE);
  var tc = body.appendTable([['']]);
  styleTable_(tc);
  tc.getRow(0).setMinimumHeight(190);
  fillContent_(tc.getRow(0).getCell(0), data);

  // 활동 사진 헤더 + 그리드(3열)
  var h2 = body.appendTable([['활동 사진']]);
  styleTable_(h2); headerCell_(h2.getRow(0).getCell(0), BLUE);

  var photos = data.photos || [];
  if (photos.length) {
    var per = 3, rows = Math.ceil(photos.length / per), grid = [];
    for (var r = 0; r < rows; r++) grid.push(['', '', '']);
    var pt = body.appendTable(grid);
    styleTable_(pt);
    var idx = 0;
    for (var r2 = 0; r2 < rows; r2++) {
      pt.getRow(r2).setMinimumHeight(120);
      for (var c = 0; c < per; c++) {
        var cell = pt.getRow(r2).getCell(c);
        cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(4).setPaddingRight(4);
        if (idx < photos.length) {
          try {
            var p = String(photos[idx] || '');
            var comma = p.indexOf(',');
            var b64 = comma >= 0 ? p.substring(comma + 1) : p;
            var im = cell.appendImage(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg'));
            var w = im.getWidth(), h = im.getHeight(), maxW = 150;
            if (w > maxW) { im.setWidth(maxW); im.setHeight(Math.round(h * maxW / w)); }
            var f = cell.getChild(0);
            if (cell.getNumChildren() > 1 && f.getType() == DocumentApp.ElementType.PARAGRAPH && f.asParagraph().getText() === '') f.removeFromParent();
          } catch (pe) {
            cell.setText('[사진 오류]');
          }
        }
        idx++;
      }
    }
  } else {
    var np = body.appendTable([['(사진 없음)']]);
    styleTable_(np);
    np.getRow(0).getCell(0).editAsText().setFontSize(10).setForegroundColor('#7E92A4');
  }

  doc.saveAndClose();
  var docFile = DriveApp.getFileById(doc.getId());
  var pdf = docFile.getAs('application/pdf').setName(base + '.pdf');
  var saved = folder.createFile(pdf);
  docFile.setTrashed(true);
  return saved;
}

// 사진만 모은 PDF 한 개 (photos.html 에서 type:'photos' 로 보낸 제출)
function makePhotoPdf_(data, folder) {
  var safe = function (s) { return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').trim(); };
  var base = safe(data.name || '이름') + '_' + safe(data.date || '') + '_사진';
  var BLUE = '#DCE6F1';

  var doc = DocumentApp.create(base);
  var body = doc.getBody();
  body.setPageWidth(595).setPageHeight(842);
  body.setMarginTop(30).setMarginBottom(30).setMarginLeft(40).setMarginRight(40);

  // 상단 안내줄(첫 빈 문단 재사용)
  var top = body.getChild(0).asParagraph();
  top.setText('호주 글로벌 현장학습 · 사진 제출');
  top.editAsText().setBold(false).setFontSize(9).setForegroundColor('#5C6B7A');
  top.setSpacingAfter(4);

  // 제목
  var title = body.appendParagraph('활동 사진');
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.editAsText().setBold(true).setFontSize(20).setForegroundColor('#1B2733');
  title.setSpacingAfter(6);

  // 정보표 (성명 / 제출일)
  var t1 = body.appendTable([['성명', data.name || '', '제출일', data.date || '']]);
  styleTable_(t1);
  t1.setColumnWidth(0, 70); t1.setColumnWidth(2, 70);
  labelCell_(t1.getRow(0).getCell(0), BLUE); valueCell_(t1.getRow(0).getCell(1));
  labelCell_(t1.getRow(0).getCell(2), BLUE); valueCell_(t1.getRow(0).getCell(3));

  // 사진 그리드 (2열, 큼직하게)
  var photos = data.photos || [];
  if (photos.length) {
    var per = 2, rows = Math.ceil(photos.length / per), grid = [];
    for (var r = 0; r < rows; r++) grid.push(['', '']);
    var pt = body.appendTable(grid);
    styleTable_(pt);
    var idx = 0;
    for (var r2 = 0; r2 < rows; r2++) {
      pt.getRow(r2).setMinimumHeight(200);
      for (var c = 0; c < per; c++) {
        var cell = pt.getRow(r2).getCell(c);
        cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(4).setPaddingRight(4);
        if (idx < photos.length) {
          try {
            var p = String(photos[idx] || '');
            var comma = p.indexOf(',');
            var b64 = comma >= 0 ? p.substring(comma + 1) : p;
            var im = cell.appendImage(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg'));
            var w = im.getWidth(), h = im.getHeight(), maxW = 235;
            if (w > maxW) { im.setWidth(maxW); im.setHeight(Math.round(h * maxW / w)); }
            var f = cell.getChild(0);
            if (cell.getNumChildren() > 1 && f.getType() == DocumentApp.ElementType.PARAGRAPH && f.asParagraph().getText() === '') f.removeFromParent();
          } catch (pe) {
            cell.setText('[사진 오류]');
          }
        }
        idx++;
      }
    }
  } else {
    var np = body.appendTable([['(사진 없음)']]);
    styleTable_(np);
    np.getRow(0).getCell(0).editAsText().setFontSize(10).setForegroundColor('#7E92A4');
  }

  doc.saveAndClose();
  var docFile = DriveApp.getFileById(doc.getId());
  var pdf = docFile.getAs('application/pdf').setName(base + '.pdf');
  var saved = folder.createFile(pdf);
  docFile.setTrashed(true);
  return saved;
}

function styleTable_(t) {
  t.setBorderColor('#9DB7D5');
  t.setBorderWidth(0.75);
}
function labelCell_(cell, bg) {
  cell.setBackgroundColor(bg);
  cell.editAsText().setBold(true).setFontSize(10).setForegroundColor('#1B2733');
}
function valueCell_(cell) {
  cell.editAsText().setBold(false).setFontSize(10).setForegroundColor('#1B2733');
}
function headerCell_(cell, bg) {
  cell.setBackgroundColor(bg);
  cell.editAsText().setBold(true).setFontSize(10.5).setForegroundColor('#1B2733');
}
function fillContent_(cell, data) {
  var secs = [
    ['본 것 · 사실', data.facts, '#1E5FA8'],
    ['인상 깊었던 점 + 이유', data.impression, '#C97A0A'],
    ['한국과 다른 점', data.difference, '#C97A0A'],
    ['궁금한 점 · 질문', data.question, '#C97A0A'],
  ];
  var first = cell.getChild(0).asParagraph();
  for (var i = 0; i < secs.length; i++) {
    var label = secs[i][0];
    var val = (secs[i][1] && String(secs[i][1]).trim()) ? String(secs[i][1]).trim() : '—';
    var lp = (i === 0) ? first : cell.appendParagraph('');
    lp.setText(label);
    lp.editAsText().setBold(true).setFontSize(10).setForegroundColor(secs[i][2]);
    lp.setSpacingBefore(i === 0 ? 0 : 6).setSpacingAfter(1);
    var vp = cell.appendParagraph(val);
    vp.editAsText().setBold(false).setFontSize(10).setForegroundColor('#1B2733');
    vp.setSpacingAfter(2);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 브라우저로 URL 열면 확인 가능. build "form-v4" 이면 사진 제출(type:'photos')까지 지원.
function doGet() {
  return json_({ ok: true, alive: true, build: 'form-v4' });
}
