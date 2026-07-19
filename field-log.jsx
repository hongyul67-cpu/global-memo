import React, { useState, useRef, useEffect } from "react";

/* 호주 글로벌 현장학습 · 현장 기록장 (시제품)
   - 기록 전용. 안전·통솔은 기성 앱(구글 지도·카톡)에 맡김.
   - 핵심 장치: '본 것(사실)' = 파랑 / '내 생각·질문' = 호박색.
   - 사진 1기록당 2~5장. PDF는 '인쇄 → PDF로 저장' 방식.
   - 시제품이라 새로고침 시 기록이 사라짐(영구 저장 미연결). */

const C = {
  bg: "#F4F6F9", ink: "#1B2733", sub: "#5C6B7A",
  blue: "#1E5FA8", blueSoft: "#E9F1F9", blueLine: "#B6CFE8",
  amber: "#C97A0A", amberSoft: "#FBF2E0", amberLine: "#EAD3A0",
  line: "#D7DEE6", card: "#FFFFFF", steel: "#7E92A4",
};

const KEYWORDS = ["안전", "기술·용접", "교육·제도", "문화", "음식", "기타"];
const VISITS = ["학교(TAFE)", "회사", "기타"];
const FORM_URL = "https://forms.gle/X42oD6U71bcfTSydA";

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function prettyDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${y}. ${m}. ${d}.`;
}
function downscale(file, max = 1024, quality = 0.72) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
        else if (h >= w && h > max) { w = Math.round((w * max) / h); h = max; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- 자동 저장 (이 기기에 보관) ----
const STORE_KEY = "fieldlog_v1";
function loadStore() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 미리보기 환경 등에서는 저장소 접근이 막힐 수 있음 */ }
  return null;
}

function Chip({ active, children, onClick }) {
  return (
    <button type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2"
      style={{
        background: active ? C.blue : C.card,
        color: active ? "#fff" : C.ink,
        border: `1px solid ${active ? C.blue : C.line}`,
      }}
    >
      {children}
    </button>
  );
}

function Eyebrow({ children }) {
  return (
    <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: C.steel }}>
      {children}
    </div>
  );
}

export default function App() {
  const persisted = loadStore();
  const [screen, setScreen] = useState(persisted && persisted.name ? "list" : "start"); // start | list | form | export | backup
  const [name, setName] = useState(persisted?.name || "");
  const [nameDraft, setNameDraft] = useState("");
  const [records, setRecords] = useState(persisted?.records || []);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [selected, setSelected] = useState({}); // id -> bool, for export
  const [editingName, setEditingName] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [storeWarn, setStoreWarn] = useState(false);
  const [importPending, setImportPending] = useState(null); // 불러온 백업 데이터(확인 대기)
  const [backupMsg, setBackupMsg] = useState("");
  const fileRef = useRef(null);
  const backupRef = useRef(null);

  // 기록·이름이 바뀔 때마다 이 기기에 자동 저장
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ name, records }));
      setStoreWarn(false);
    } catch (e) {
      setStoreWarn(true);
    }
  }, [name, records]);

  // form state
  const blankForm = {
    date: todayStr(), place: "", visit: "", keywords: [],
    facts: "", impression: "", difference: "", question: "", photos: [],
  };
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setForm(blankForm); setEditingId(null); setError(""); setScreen("form");
  }
  function openEdit(r) {
    setForm({ ...blankForm, ...r }); setEditingId(r.id); setError(""); setScreen("form");
  }
  function toggleKeyword(k) {
    setF("keywords", form.keywords.includes(k)
      ? form.keywords.filter((x) => x !== k)
      : [...form.keywords, k]);
  }
  async function addPhotos(files) {
    const list = Array.from(files);
    const room = 5 - form.photos.length;
    if (room <= 0) return;
    const next = [];
    for (const f of list.slice(0, room)) next.push(await downscale(f));
    setForm((f) => ({ ...f, photos: [...f.photos, ...next] }));
  }
  function removePhoto(i) {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }));
  }
  function save() {
    if (!form.place.trim()) return setError("장소를 적어 주세요.");
    if (!form.facts.trim()) return setError("본 것을 한 줄이라도 적어 주세요.");
    if (form.photos.length < 2) return setError(`사진을 2장 이상 넣어 주세요. (현재 ${form.photos.length}장)`);
    if (editingId) {
      setRecords((rs) => rs.map((r) => (r.id === editingId ? { ...form, id: editingId } : r)));
    } else {
      setRecords((rs) => [...rs, { ...form, id: Date.now() }]);
    }
    setScreen("list");
  }
  function doDelete(id) {
    setRecords((rs) => rs.filter((r) => r.id !== id));
    setConfirmId(null);
  }
  function openExport() {
    const sel = {};
    records.forEach((r) => (sel[r.id] = true));
    setSelected(sel);
    setScreen("export");
  }
  function openBackup() {
    setBackupMsg(""); setImportPending(null); setScreen("backup");
  }
  // ---- 백업(전체 내보내기 / 불러오기) ----
  function exportBackup() {
    try {
      const data = { app: "fieldlog", version: 1, exportedAt: new Date().toISOString(), name, records };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `기록백업-${(name || "이름").trim()}-${todayStr().replace(/-/g, "")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setBackupMsg(`백업 파일을 저장했어요. (기록 ${records.length}개) 다운로드 폴더나 파일 앱에서 확인하세요.`);
    } catch (e) {
      setBackupMsg("백업 파일을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }
  function readBackup(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.records)) throw new Error("bad");
        setBackupMsg("");
        setImportPending(data);
      } catch (err) {
        setBackupMsg("백업 파일을 읽을 수 없어요. 올바른 백업 파일(.json)인지 확인해 주세요.");
      }
    };
    reader.onerror = () => setBackupMsg("파일을 여는 중 문제가 생겼어요.");
    reader.readAsText(file);
  }
  function applyImport(mode) {
    const data = importPending;
    if (!data) return;
    if (mode === "replace") {
      setRecords(data.records);
      if (data.name) setName(data.name);
      setBackupMsg(`백업으로 전부 바꿨어요. (기록 ${data.records.length}개)`);
    } else {
      const existing = new Set(records.map((r) => r.id));
      const added = data.records.filter((r) => !existing.has(r.id));
      setRecords((rs) => [...rs, ...added]);
      if (!name && data.name) setName(data.name);
      setBackupMsg(`백업을 합쳤어요. 새로 추가된 기록 ${added.length}개 (중복 ${data.records.length - added.length}개는 건너뜀).`);
    }
    setImportPending(null);
  }

  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
  const chosen = sorted.filter((r) => selected[r.id]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink, fontFamily: "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',system-ui,sans-serif" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        textarea, input { font-family: inherit; }
        @media (prefers-reduced-motion: reduce){ *{ transition:none!important; animation:none!important; } }
        @media print {
          .no-print { display:none !important; }
          .print-area { box-shadow:none !important; }
          .rec-block { break-inside: avoid; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body, html { background:#fff !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-md px-4 pb-28">
        {/* ---------------- START ---------------- */}
        {screen === "start" && (
          <div className="pt-20">
            <Eyebrow>Field Log</Eyebrow>
            <h1 className="mt-2 text-3xl font-bold leading-tight">호주 현장학습<br/>기록장</h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: C.sub }}>
              하루에 한 번, 오늘 <b style={{color:C.blue}}>본 것</b>과 <b style={{color:C.amber}}>든 생각</b>을 나눠 적어요.
              사진도 함께 남기고, 돌아와서 보고서로 정리합니다.
            </p>
            <div className="mt-8 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <label className="text-sm font-semibold">이름</label>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nameDraft.trim()) { setName(nameDraft.trim()); setScreen("list"); } }}
                placeholder="예: 김현장"
                className="mt-2 w-full rounded-xl px-3 py-3 text-base focus:outline-none focus-visible:ring-2"
                style={{ border: `1px solid ${C.line}`, background: C.bg }}
              />
              <button type="button"
                disabled={!nameDraft.trim()}
                onClick={() => { setName(nameDraft.trim()); setScreen("list"); }}
                className="mt-4 w-full rounded-xl py-3 text-base font-semibold transition-opacity"
                style={{ background: C.blue, color: "#fff", opacity: nameDraft.trim() ? 1 : 0.4 }}
              >
                기록장 열기
              </button>
            </div>
            <p className="mt-6 text-xs leading-relaxed" style={{ color: C.steel }}>
              기록은 사용하는 이 기기에 자동으로 저장돼요. 이름은 나중에 언제든 바꿀 수 있어요.
            </p>
          </div>
        )}

        {/* ---------------- LIST ---------------- */}
        {screen === "list" && (
          <div className="pt-8">
            <div className="flex items-end justify-between">
              <div>
                <Eyebrow>Field Log</Eyebrow>
                <div className="mt-1 flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{name}의 기록장</h1>
                  <button type="button" onClick={() => { setRenameDraft(name); setEditingName(true); }}
                    className="text-xs font-medium rounded-full px-2 py-1" style={{ color: C.blue, background: C.blueSoft, border: `1px solid ${C.blueLine}` }}>
                    이름 수정
                  </button>
                </div>
              </div>
              <span className="text-sm font-semibold" style={{ color: C.steel }}>기록 {records.length}개</span>
            </div>

            <div className="mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed no-print" style={{ background: C.blueSoft, color: C.blue, border: `1px solid ${C.blueLine}` }}>
              기록은 이 기기에 자동으로 저장돼요. 앱을 껐다 켜도 남아 있어요.
            </div>

            {storeWarn && (
              <div className="mt-2 rounded-xl px-3 py-2 text-xs leading-relaxed no-print" style={{ background: C.amberSoft, color: C.amber, border: `1px solid ${C.amberLine}` }}>
                저장 공간이 부족해요. 오래된 날짜를 PDF로 내보낸 뒤 지우면 공간이 생겨요. (미리보기 화면에서는 저장이 안 될 수 있어요.)
              </div>
            )}

            <a href={FORM_URL} target="_blank" rel="noopener noreferrer"
              className="mt-3 flex items-center justify-between rounded-xl px-4 py-3 no-print"
              style={{ background: C.amber, color: "#fff" }}>
              <span className="text-sm font-semibold">저녁에 · 오늘 기록 구글 폼으로 제출하기</span>
              <span className="text-lg leading-none">→</span>
            </a>

            <button type="button" onClick={openBackup}
              className="mt-2 w-full flex items-center justify-between rounded-xl px-4 py-2.5 no-print"
              style={{ background: C.card, color: C.ink, border: `1px solid ${C.line}` }}>
              <span className="text-sm font-semibold">기록 백업 · 복원</span>
              <span className="text-xs" style={{ color: C.steel }}>폰 분실 대비 →</span>
            </button>

            {records.length === 0 ? (
              <div className="mt-10 rounded-2xl p-8 text-center" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
                <div className="text-base font-semibold">아직 기록이 없어요</div>
                <p className="mt-1 text-sm" style={{ color: C.sub }}>오늘 본 것부터 적어볼까요?</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {sorted.map((r) => (
                  <button type="button" key={r.id} onClick={() => openEdit(r)} className="block w-full text-left rounded-2xl p-4 transition-shadow"
                    style={{ background: C.card, border: `1px solid ${C.line}` }}>
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-bold">{prettyDate(r.date)}</div>
                      <div className="text-xs" style={{ color: C.steel }}>{r.photos.length}장</div>
                    </div>
                    <div className="mt-0.5 text-sm" style={{ color: C.sub }}>
                      {r.place}{r.visit ? ` · ${r.visit}` : ""}
                    </div>
                    {r.keywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.keywords.map((k) => (
                          <span key={k} className="px-2 py-0.5 rounded-full text-xs" style={{ background: C.blueSoft, color: C.blue }}>{k}</span>
                        ))}
                      </div>
                    )}
                    {r.photos.length > 0 && (
                      <div className="mt-3 flex gap-1.5 overflow-hidden">
                        {r.photos.slice(0, 4).map((p, i) => (
                          <img key={i} src={p} alt="" className="h-14 w-14 rounded-lg object-cover" style={{ border: `1px solid ${C.line}` }} />
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-sm line-clamp-2" style={{ color: C.ink }}>
                      <span style={{ color: C.blue, fontWeight: 600 }}>본 것 </span>{r.facts}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------- FORM ---------------- */}
        {screen === "form" && (
          <div className="pt-6">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setScreen("list")} className="text-sm font-medium" style={{ color: C.steel }}>‹ 목록</button>
              <div className="text-sm font-semibold">{editingId ? "기록 수정" : "오늘 기록"}</div>
              <div className="w-10" />
            </div>

            {/* meta */}
            <div className="mt-4 rounded-2xl p-4 space-y-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold" style={{ color: C.sub }}>날짜</label>
                  <input type="date" value={form.date} onChange={(e) => setF("date", e.target.value)}
                    className="mt-1 w-full rounded-lg px-2 py-2 text-sm focus:outline-none focus-visible:ring-2"
                    style={{ border: `1px solid ${C.line}` }} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold" style={{ color: C.sub }}>장소</label>
                  <input value={form.place} onChange={(e) => setF("place", e.target.value)} placeholder="예: 시드니 TAFE"
                    className="mt-1 w-full rounded-lg px-2 py-2 text-sm focus:outline-none focus-visible:ring-2"
                    style={{ border: `1px solid ${C.line}` }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: C.sub }}>방문 유형</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {VISITS.map((v) => <Chip key={v} active={form.visit === v} onClick={() => setF("visit", form.visit === v ? "" : v)}>{v}</Chip>)}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: C.sub }}>키워드 <span style={{color:C.steel}}>· 여러 개 선택</span></label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {KEYWORDS.map((k) => <Chip key={k} active={form.keywords.includes(k)} onClick={() => toggleKeyword(k)}>{k}</Chip>)}
                </div>
              </div>
            </div>

            {/* FACT section (blue) */}
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.blueSoft, borderBottom: `1px solid ${C.blueLine}` }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.blue }} />
                <span className="text-sm font-bold" style={{ color: C.blue }}>본 것 · 사실</span>
                <span className="text-xs" style={{ color: C.steel }}>직접 보고 들은 것만</span>
              </div>
              <div className="p-4" style={{ borderLeft: `4px solid ${C.blue}` }}>
                <textarea value={form.facts} onChange={(e) => setF("facts", e.target.value)} rows={3}
                  placeholder="예: 실습실에 용접기가 1인당 1대씩 있었고, 모두 보안면을 쓰고 있었다."
                  className="w-full resize-none text-sm leading-relaxed focus:outline-none" style={{ color: C.ink }} />
              </div>
            </div>

            {/* THOUGHT section (amber) */}
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.amberSoft, borderBottom: `1px solid ${C.amberLine}` }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.amber }} />
                <span className="text-sm font-bold" style={{ color: C.amber }}>내 생각 · 질문</span>
                <span className="text-xs" style={{ color: C.steel }}>사실을 보고 든 생각</span>
              </div>
              <div className="p-4 space-y-4" style={{ borderLeft: `4px solid ${C.amber}` }}>
                <div>
                  <label className="text-xs font-semibold" style={{ color: C.sub }}>인상 깊었던 점 + 이유</label>
                  <textarea value={form.impression} onChange={(e) => setF("impression", e.target.value)} rows={2}
                    className="mt-1 w-full resize-none text-sm leading-relaxed focus:outline-none" style={{ color: C.ink }} />
                </div>
                <div className="h-px" style={{ background: C.line }} />
                <div>
                  <label className="text-xs font-semibold" style={{ color: C.sub }}>한국과 다른 점</label>
                  <textarea value={form.difference} onChange={(e) => setF("difference", e.target.value)} rows={2}
                    className="mt-1 w-full resize-none text-sm leading-relaxed focus:outline-none" style={{ color: C.ink }} />
                </div>
                <div className="h-px" style={{ background: C.line }} />
                <div>
                  <label className="text-xs font-semibold" style={{ color: C.sub }}>궁금한 점 · 질문</label>
                  <textarea value={form.question} onChange={(e) => setF("question", e.target.value)} rows={2}
                    className="mt-1 w-full resize-none text-sm leading-relaxed focus:outline-none" style={{ color: C.ink }} />
                </div>
              </div>
            </div>

            {/* PHOTOS */}
            <div className="mt-4 rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">사진</span>
                <span className="text-xs" style={{ color: form.photos.length < 2 ? C.amber : C.steel }}>
                  현재 {form.photos.length}장 · 최소 2, 최대 5
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {form.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt="" className="h-24 w-full rounded-lg object-cover" style={{ border: `1px solid ${C.line}` }} />
                    <button type="button" onClick={() => removePhoto(i)}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center"
                      style={{ background: C.ink, color: "#fff" }}>×</button>
                  </div>
                ))}
                {form.photos.length < 5 && (
                  <button type="button" onClick={() => fileRef.current && fileRef.current.click()}
                    className="h-24 w-full rounded-lg flex flex-col items-center justify-center"
                    style={{ border: `1.5px dashed ${C.blueLine}`, color: C.blue, background: C.blueSoft }}>
                    <span className="text-2xl leading-none">+</span>
                    <span className="text-xs mt-1">사진 추가</span>
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
              />
            </div>

            {error && (
              <div className="mt-4 rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: C.amberSoft, color: C.amber, border: `1px solid ${C.amberLine}` }}>
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              {editingId && (
                <button type="button" onClick={() => setConfirmId(editingId)} className="rounded-xl px-4 py-3 text-sm font-semibold"
                  style={{ border: `1px solid ${C.line}`, color: C.sub }}>삭제</button>
              )}
              <button type="button" onClick={save} className="flex-1 rounded-xl py-3 text-base font-semibold" style={{ background: C.blue, color: "#fff" }}>
                {editingId ? "수정 저장" : "기록 저장"}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- EXPORT (print preview) ---------------- */}
        {screen === "export" && (
          <div className="pt-6">
            <div className="no-print">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setScreen("list")} className="text-sm font-medium" style={{ color: C.steel }}>‹ 목록</button>
                <div className="text-sm font-semibold">PDF로 내보내기</div>
                <div className="w-10" />
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: C.sub }}>
                포함할 날짜를 고르고 <b>PDF로 저장</b>을 누르면 인쇄 화면이 열려요. 거기서 ‘대상’을 <b>PDF로 저장</b>으로 바꾸면 됩니다.
              </p>
              <div className="mt-3 space-y-2">
                {sorted.map((r) => (
                  <label key={r.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                    <input type="checkbox" checked={!!selected[r.id]} onChange={() => setSelected((s) => ({ ...s, [r.id]: !s[r.id] }))} />
                    <span className="text-sm font-semibold">{prettyDate(r.date)}</span>
                    <span className="text-sm" style={{ color: C.sub }}>{r.place}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => window.print()} disabled={chosen.length === 0}
                className="mt-4 w-full rounded-xl py-3 text-base font-semibold"
                style={{ background: C.blue, color: "#fff", opacity: chosen.length ? 1 : 0.4 }}>
                PDF로 저장 ({chosen.length}개)
              </button>
              <div className="mt-6 text-xs font-semibold tracking-widest uppercase" style={{ color: C.steel }}>미리보기</div>
            </div>

            {/* print area */}
            <div className="print-area mt-3 rounded-2xl p-5" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
              <div className="pb-3 mb-4" style={{ borderBottom: `2px solid ${C.blue}` }}>
                <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: C.steel }}>호주 글로벌 현장학습 · 현장 기록</div>
                <div className="mt-1 text-xl font-bold">{name}</div>
              </div>
              {chosen.length === 0 && <div className="text-sm" style={{ color: C.steel }}>선택된 기록이 없어요.</div>}
              {chosen.map((r) => (
                <div key={r.id} className="rec-block mb-7">
                  <div className="flex items-baseline justify-between">
                    <div className="text-lg font-bold">{prettyDate(r.date)}</div>
                    <div className="text-sm" style={{ color: C.sub }}>{r.place}{r.visit ? ` · ${r.visit}` : ""}</div>
                  </div>
                  {r.keywords.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.keywords.map((k) => <span key={k} className="px-2 py-0.5 rounded-full text-xs" style={{ background: C.blueSoft, color: C.blue }}>{k}</span>)}
                    </div>
                  )}
                  <div className="mt-3 flex gap-0">
                    <div className="flex-1 pr-3">
                      <div className="text-xs font-bold mb-1" style={{ color: C.blue }}>본 것 · 사실</div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.facts || "—"}</p>
                    </div>
                    <div style={{ width: 0, borderLeft: `2px dashed ${C.blueLine}` }} />
                    <div className="flex-1 pl-3">
                      <div className="text-xs font-bold mb-1" style={{ color: C.amber }}>내 생각 · 질문</div>
                      {r.impression && <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.impression}</p>}
                      {r.difference && <p className="text-sm leading-relaxed whitespace-pre-wrap mt-1.5"><b style={{color:C.sub}}>다른 점 </b>{r.difference}</p>}
                      {r.question && <p className="text-sm leading-relaxed whitespace-pre-wrap mt-1.5"><b style={{color:C.sub}}>질문 </b>{r.question}</p>}
                      {!r.impression && !r.difference && !r.question && <p className="text-sm" style={{ color: C.steel }}>—</p>}
                    </div>
                  </div>
                  {r.photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {r.photos.map((p, i) => <img key={i} src={p} alt="" className="w-full rounded-lg object-cover" style={{ height: 110, border: `1px solid ${C.line}` }} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- BACKUP (export / import) ---------------- */}
        {screen === "backup" && (
          <div className="pt-6">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setScreen("list")} className="text-sm font-medium" style={{ color: C.steel }}>‹ 목록</button>
              <div className="text-sm font-semibold">백업 · 복원</div>
              <div className="w-10" />
            </div>

            <div className="mt-4 rounded-2xl p-4" style={{ background: C.blueSoft, border: `1px solid ${C.blueLine}` }}>
              <p className="text-sm leading-relaxed" style={{ color: C.blue }}>
                기록은 이 폰에만 저장돼요. <b>폰을 잃어버리거나 앱(브라우저 기록)을 지우면 사라집니다.</b> 가끔 <b>백업 파일</b>을 저장해 두면, 새 폰에서 <b>불러오기</b>로 되살릴 수 있어요.
              </p>
            </div>

            {/* 내보내기 */}
            <div className="mt-4 rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-sm font-bold">1. 백업 파일 저장 (내보내기)</div>
              <p className="mt-1 text-sm" style={{ color: C.sub }}>지금까지의 기록 {records.length}개와 사진을 파일 하나로 저장해요.</p>
              <button type="button" onClick={exportBackup} disabled={records.length === 0}
                className="mt-3 w-full rounded-xl py-3 text-base font-semibold"
                style={{ background: C.blue, color: "#fff", opacity: records.length ? 1 : 0.4 }}>
                백업 파일 저장하기
              </button>
            </div>

            {/* 불러오기 */}
            <div className="mt-4 rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-sm font-bold">2. 백업 파일 불러오기 (복원)</div>
              <p className="mt-1 text-sm" style={{ color: C.sub }}>전에 저장한 백업 파일(.json)을 골라 기록을 되살려요.</p>
              <button type="button" onClick={() => backupRef.current && backupRef.current.click()}
                className="mt-3 w-full rounded-xl py-3 text-base font-semibold"
                style={{ border: `1px solid ${C.blueLine}`, color: C.blue, background: C.blueSoft }}>
                백업 파일 고르기
              </button>
              <input ref={backupRef} type="file" accept="application/json,.json"
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
                onChange={(e) => { if (e.target.files[0]) readBackup(e.target.files[0]); e.target.value = ""; }} />
            </div>

            {backupMsg && (
              <div className="mt-4 rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: C.blueSoft, color: C.blue, border: `1px solid ${C.blueLine}` }}>
                {backupMsg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* bottom bar */}
      {(screen === "list") && (
        <div className="fixed bottom-0 left-0 right-0 no-print" style={{ background: "linear-gradient(to top, rgba(244,246,249,1) 60%, rgba(244,246,249,0))" }}>
          <div className="mx-auto w-full max-w-md px-4 pb-5 pt-3 flex gap-3">
            <button type="button" onClick={openExport} disabled={records.length === 0}
              className="rounded-xl px-4 py-3.5 text-sm font-semibold"
              style={{ background: C.card, color: C.blue, border: `1px solid ${C.blueLine}`, opacity: records.length ? 1 : 0.4 }}>
              PDF
            </button>
            <button type="button" onClick={openNew} className="flex-1 rounded-xl py-3.5 text-base font-semibold" style={{ background: C.blue, color: "#fff" }}>
              + 오늘 기록 쓰기
            </button>
          </div>
        </div>
      )}

      {/* rename */}
      {editingName && (
        <div className="fixed inset-0 flex items-end justify-center no-print" style={{ background: "rgba(27,39,51,0.4)" }} onClick={() => setEditingName(false)}>
          <div className="w-full max-w-md m-4 rounded-2xl p-5" style={{ background: C.card }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold">이름 바꾸기</div>
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && renameDraft.trim()) { setName(renameDraft.trim()); setEditingName(false); } }}
              className="mt-3 w-full rounded-xl px-3 py-3 text-base focus:outline-none focus-visible:ring-2"
              style={{ border: `1px solid ${C.line}`, background: C.bg }}
            />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setEditingName(false)} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ border: `1px solid ${C.line}`, color: C.sub }}>취소</button>
              <button type="button" disabled={!renameDraft.trim()} onClick={() => { setName(renameDraft.trim()); setEditingName(false); }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: C.blue, color: "#fff", opacity: renameDraft.trim() ? 1 : 0.4 }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {confirmId !== null && (
        <div className="fixed inset-0 flex items-end justify-center no-print" style={{ background: "rgba(27,39,51,0.4)" }} onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-md m-4 rounded-2xl p-5" style={{ background: C.card }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold">이 기록을 지울까요?</div>
            <p className="mt-1 text-sm" style={{ color: C.sub }}>지운 기록은 되돌릴 수 없어요.</p>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setConfirmId(null)} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ border: `1px solid ${C.line}`, color: C.sub }}>그대로 두기</button>
              <button type="button" onClick={() => { doDelete(confirmId); setScreen("list"); }} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: "#B23B3B", color: "#fff" }}>지우기</button>
            </div>
          </div>
        </div>
      )}

      {/* import confirm */}
      {importPending && (
        <div className="fixed inset-0 flex items-end justify-center no-print" style={{ background: "rgba(27,39,51,0.4)" }} onClick={() => setImportPending(null)}>
          <div className="w-full max-w-md m-4 rounded-2xl p-5" style={{ background: C.card }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold">백업을 불러올까요?</div>
            <p className="mt-1 text-sm" style={{ color: C.sub }}>
              파일에 기록 {importPending.records.length}개가 들어 있어요{importPending.name ? ` (이름: ${importPending.name})` : ""}. 지금 이 폰에는 {records.length}개가 있어요.
            </p>
            <button type="button" onClick={() => applyImport("merge")}
              className="mt-4 w-full rounded-xl py-3 text-sm font-semibold" style={{ background: C.blue, color: "#fff" }}>
              지금 기록에 합치기 (추천)
            </button>
            <button type="button" onClick={() => applyImport("replace")}
              className="mt-2 w-full rounded-xl py-3 text-sm font-semibold" style={{ border: `1px solid ${C.line}`, color: C.sub }}>
              이 파일로 전부 바꾸기
            </button>
            <button type="button" onClick={() => setImportPending(null)}
              className="mt-2 w-full rounded-xl py-2.5 text-sm font-medium" style={{ color: C.steel }}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
