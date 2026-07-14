import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, X, Upload, AlertCircle, CheckCircle, Users, BookOpen, BarChart2 } from 'lucide-react';

// ─── Firebase キー ───────────────────────────────────────────────
const DATA_KEY = 'curriculum_v1';
const MASTER_PW_KEY = 'curriculum_master_pw_v1';
const ADMIN_PW_KEY  = 'curriculum_admin_pw_v1';

// ─── ユーティリティ ───────────────────────────────────────────────
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysSince(from, to) {
  if (!from || !to) return null;
  const d1 = new Date(from), d2 = new Date(to);
  return Math.round((d2 - d1) / 86400000);
}
function fmtDate(ds) {
  if (!ds) return '―';
  const [y, m, d] = ds.split('-');
  return `${y}/${m}/${d}`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── 初期データ ───────────────────────────────────────────────────
const INIT_DATA = {
  curricula: [],   // [{ id, name, order }]
  staff: [],       // [{ id, name, joinDate, cohort }]
  records: {},     // { staffId: { curriculumId: 'YYYY-MM-DD' } }
};

// ─── 合格日の年度カラー ──────────────────────────────────────────
// 2026/4〜2027/3 = 1年度目（緑）、2027/4〜2028/3 = 2年度目（青）...
const NENDO_COLORS = [
  { bg: '#D4EDDA', text: '#1A6B32', label: '26年度' }, // 1年度目
  { bg: '#CCE5FF', text: '#0056B3', label: '27年度' }, // 2年度目
  { bg: '#FFF3CD', text: '#856404', label: '28年度' }, // 3年度目
  { bg: '#F8D7DA', text: '#721C24', label: '29年度' }, // 4年度目
  { bg: '#E2D9F3', text: '#4A1F8C', label: '30年度' }, // 5年度目
];

function nendoIndex(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-').map(Number);
  // 4月以降が次の年度（2026/4→0、2027/4→1...）
  const nendo = m >= 4 ? y - 2026 : y - 2027;
  return Math.max(0, nendo);
}

function nendoColor(dateStr) {
  const idx = nendoIndex(dateStr);
  if (idx === null) return null;
  return NENDO_COLORS[Math.min(idx, NENDO_COLORS.length - 1)];
}
const COHORT_COLORS = [
  '#4361EE','#E63946','#2A9D8F','#F4A300',
  '#9D4EDD','#06A77D','#EF476F','#118AB2',
];
function cohortColor(cohorts, cohort) {
  const idx = cohorts.indexOf(cohort);
  return COHORT_COLORS[idx >= 0 ? idx % COHORT_COLORS.length : 0];
}

// ─── CSV → 日付正規化 ────────────────────────────────────────────
// 2024/5/10, 2024-05-10, 24/5/10 など様々な形式に対応
function normalizeDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // ○や◯は飛び級合格として扱う
  if (s === '○' || s === '◯' || s === '◎' || s === '●') return '◎';
  const normalized = s.replace(/\//g, '-');
  // YYYY-M-D or YYYY-MM-DD
  const m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // YY-M-D（2桁年）
  const m2 = normalized.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const [, y, mo, d] = m2;
    return `20${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

// ─── CSVパース ───────────────────────────────────────────────────
// フォーマット：1行目=ヘッダー（空セル, スタッフ名1, スタッフ名2...）
//               2行目以降=カリキュラム名, 合格日1, 合格日2...
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: '行数が少なすぎます（ヘッダー行＋データ行が必要です）' };

  // ヘッダー行（1行目）をパース
  const header = parseCSVRow(lines[0]);
  if (header.length < 2) return { error: '列が少なすぎます（カリキュラム列＋スタッフ列が必要です）' };

  // スタッフ名（2列目以降）
  const staffNames = header.slice(1).filter(n => n.trim());

  // データ行
  const curriculaNames = [];
  const recordMatrix = {}; // { staffName: { curriculumName: dateStr } }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const currName = row[0]?.trim();
    if (!currName) continue;
    curriculaNames.push(currName);
    staffNames.forEach((sName, si) => {
      const raw = row[si + 1];
      const date = normalizeDate(raw);
      if (date) {
        if (!recordMatrix[sName]) recordMatrix[sName] = {};
        recordMatrix[sName][currName] = date;
      }
    });
  }

  return { staffNames, curriculaNames, recordMatrix };
}

function parseCSVRow(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result.map(s => s.trim().replace(/^"|"$/g, ''));
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function CurriculumApp({ embedded = false }) {
  // ── 認証状態
  const [authLevel, setAuthLevel] = useState(null); // null=未ログイン, 'viewer', 'admin', 'master'
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [masterPw, setMasterPw] = useState('1111');
  const [adminPw, setAdminPw]   = useState('2222');
  const [loadingAuth, setLoadingAuth] = useState(true);

  // ── データ
  const [data, setData]     = useState(INIT_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // ── UI状態
  const [tab, setTab] = useState('matrix'); // 'matrix' | 'staff' | 'curriculum' | 'compare'
  const [selectedCohort, setSelectedCohort] = useState('all');
  const [selectedStaff, setSelectedStaff]   = useState(null);

  // ── パスワード設定UI
  const [showMasterPwForm, setShowMasterPwForm] = useState(false);
  const [newMasterPw, setNewMasterPw] = useState('');
  const [newAdminPw, setNewAdminPw]   = useState('');

  // ── スタッフ・カリキュラム追加UI
  const [newStaffName,    setNewStaffName]    = useState('');
  const [newStaffDate,    setNewStaffDate]    = useState('');
  const [newStaffCohort,  setNewStaffCohort]  = useState('');
  const [newCurrName,     setNewCurrName]     = useState('');

  // ── CSV読み込み
  const csvInputRef = useRef(null);
  const [csvPreview, setCsvPreview]   = useState(null);  // パース結果のプレビュー
  const [csvFileName, setCsvFileName] = useState('');
  const [csvError, setCsvError]       = useState('');
  const [csvImporting, setCsvImporting] = useState(false);

  // ────────────────────────────────────────────────────────────────
  // パスワード読み込み
  // ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (embedded) {
      setAuthLevel('master');
      setLoadingAuth(false);
      return;
    }
    async function loadPw() {
      try {
        const r1 = await window.storage.get(MASTER_PW_KEY);
        if (r1) setMasterPw(r1.value);
      } catch {}
      try {
        const r2 = await window.storage.get(ADMIN_PW_KEY);
        if (r2) setAdminPw(r2.value);
      } catch {}
      setLoadingAuth(false);
    }
    loadPw();
  }, [embedded]);

  // ────────────────────────────────────────────────────────────────
  // データ読み込み
  // ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const r = await window.storage.get(DATA_KEY);
        if (r) setData(JSON.parse(r.value));
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  // ────────────────────────────────────────────────────────────────
  // データ保存
  // ────────────────────────────────────────────────────────────────
  const persist = useCallback(async (next) => {
    setSaving(true);
    try {
      await window.storage.set(DATA_KEY, JSON.stringify(next));
    } catch (e) { console.error(e); }
    setSaving(false);
  }, []);

  function update(fn) {
    setData(prev => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }

  // ────────────────────────────────────────────────────────────────
  // 認証
  // ────────────────────────────────────────────────────────────────
  function login() {
    if (pwInput === masterPw) { setAuthLevel('master'); setPwError(''); }
    else if (pwInput === adminPw) { setAuthLevel('admin'); setPwError(''); }
    else { setPwError('パスワードが違います'); }
  }

  function loginAsViewer() { setAuthLevel('viewer'); }

  const canEdit = authLevel === 'master' || authLevel === 'admin';
  const isMaster = authLevel === 'master';

  // ────────────────────────────────────────────────────────────────
  // コホート一覧
  // ────────────────────────────────────────────────────────────────
  const cohorts = [...new Set(data.staff.map(s => s.cohort).filter(Boolean))].sort();

  // ────────────────────────────────────────────────────────────────
  // スタッフ操作
  // ────────────────────────────────────────────────────────────────
  function addStaff() {
    if (!newStaffName.trim()) return;
    const s = { id: uid(), name: newStaffName.trim(), joinDate: newStaffDate, cohort: newStaffCohort.trim() || '未設定' };
    update(d => ({ ...d, staff: [...d.staff, s] }));
    setNewStaffName(''); setNewStaffDate(''); setNewStaffCohort('');
  }
  function removeStaff(id) {
    const s = data.staff.find(s => s.id === id);
    if (!window.confirm(`「${s?.name}」を削除しますか？\nこのスタッフの合格記録も全て削除されます。`)) return;
    update(d => {
      const records = { ...d.records };
      delete records[id];
      return { ...d, staff: d.staff.filter(s => s.id !== id), records };
    });
  }

  // ────────────────────────────────────────────────────────────────
  // カリキュラム操作
  // ────────────────────────────────────────────────────────────────
  function addCurr() {
    if (!newCurrName.trim()) return;
    const c = { id: uid(), name: newCurrName.trim() };
    update(d => ({ ...d, curricula: [...d.curricula, c] }));
    setNewCurrName('');
  }
  function removeCurr(id) {
    update(d => {
      const records = {};
      Object.entries(d.records).forEach(([sid, rec]) => {
        const r = { ...rec };
        delete r[id];
        records[sid] = r;
      });
      return { ...d, curricula: d.curricula.filter(c => c.id !== id), records };
    });
  }

  // ────────────────────────────────────────────────────────────────
  // 合格記録操作
  // ────────────────────────────────────────────────────────────────
  function setRecord(staffId, currId, dateStr) {
    update(d => ({
      ...d,
      records: {
        ...d.records,
        [staffId]: { ...(d.records[staffId] || {}), [currId]: dateStr || undefined }
      }
    }));
  }

  // ────────────────────────────────────────────────────────────────
  // パスワード更新
  // ────────────────────────────────────────────────────────────────
  async function savePw() {
    if (newMasterPw.trim()) {
      setMasterPw(newMasterPw.trim());
      await window.storage.set(MASTER_PW_KEY, newMasterPw.trim());
    }
    if (newAdminPw.trim()) {
      setAdminPw(newAdminPw.trim());
      await window.storage.set(ADMIN_PW_KEY, newAdminPw.trim());
    }
    setShowMasterPwForm(false);
    setNewMasterPw(''); setNewAdminPw('');
  }

  // ────────────────────────────────────────────────────────────────
  // CSV読み込み
  // ────────────────────────────────────────────────────────────────
  function handleCSVFile(file) {
    if (!file) return;
    setCsvError('');
    setCsvPreview(null);
    setCsvFileName(file.name);

    // ファイル名から入社年度を推定（例: 2024年入社.csv → '2024年入社'）
    const cohortFromName = file.name
      .replace(/\.csv$/i, '')
      .replace(/\s+/g, '')
      || file.name.replace(/\.csv$/i, '');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const result = parseCSV(text);
      if (result.error) { setCsvError(result.error); return; }
      setCsvPreview({ ...result, cohort: cohortFromName });
    };
    reader.readAsText(file, 'UTF-8');
  }

  // CSVプレビューの内容をFirebaseにインポート
  function importCSV() {
    if (!csvPreview) return;
    setCsvImporting(true);
    const { staffNames, curriculaNames, recordMatrix, cohort } = csvPreview;

    update(d => {
      let next = { ...d, curricula: [...d.curricula], staff: [...d.staff], records: { ...d.records } };

      // カリキュラムを追加（重複スキップ）
      curriculaNames.forEach(name => {
        if (!next.curricula.find(c => c.name === name)) {
          next.curricula.push({ id: uid(), name });
        }
      });

      // スタッフを追加（名前一致でスキップ）
      staffNames.forEach(name => {
        if (!next.staff.find(s => s.name === name)) {
          next.staff.push({ id: uid(), name, joinDate: '', cohort });
        }
      });

      // 合格記録をマージ
      staffNames.forEach(sName => {
        const staff = next.staff.find(s => s.name === sName);
        if (!staff) return;
        const staffRec = recordMatrix[sName] || {};
        const existing = next.records[staff.id] || {};
        Object.entries(staffRec).forEach(([currName, date]) => {
          const curr = next.curricula.find(c => c.name === currName);
          if (curr) existing[curr.id] = date;
        });
        next.records = { ...next.records, [staff.id]: existing };
      });

      return next;
    });

    setCsvPreview(null);
    setCsvFileName('');
    setCsvImporting(false);
  }
  const displayedStaff = selectedCohort === 'all'
    ? data.staff
    : data.staff.filter(s => s.cohort === selectedCohort);

  // ────────────────────────────────────────────────────────────────
  // ローディング・認証画面
  // ────────────────────────────────────────────────────────────────
  if (loadingAuth || loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#9C9486', fontSize:'13px' }}>
        読み込み中…
      </div>
    );
  }

  if (!authLevel) {
    return (
      <div style={{ minHeight:'100vh', background:'#FAF8F4', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
        <div style={{ background:'#FFFFFF', borderRadius:'16px', padding:'32px 28px', width:'100%', maxWidth:'360px', border:'1px solid #EEE9DE', boxShadow:'0 4px 24px rgba(43,40,35,0.06)' }}>
          <div style={{ fontSize:'22px', fontWeight:800, color:'#1F1C18', marginBottom:'4px' }}>カリキュラム管理</div>
          <div style={{ fontSize:'13px', color:'#9C9486', marginBottom:'28px' }}>NORA Group</div>

          <div style={{ fontSize:'12px', color:'#8A8378', marginBottom:'6px', fontWeight:600 }}>管理者パスワード</div>
          <input
            value={pwInput} onChange={e => setPwInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            type="password" placeholder="パスワードを入力"
            style={{ width:'100%', padding:'11px 14px', borderRadius:'10px', border:'1px solid #E2DCCC', fontSize:'14px', boxSizing:'border-box', marginBottom:'8px' }}
          />
          {pwError && <div style={{ fontSize:'12px', color:'#E63946', marginBottom:'8px' }}>{pwError}</div>}
          <button onClick={login}
            style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'14px', fontWeight:700, cursor:'pointer', marginBottom:'12px' }}>
            ログイン
          </button>
          <button onClick={loginAsViewer}
            style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            閲覧のみで入る
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // メイン画面
  // ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#FAF8F4', fontFamily:"'Hiragino Sans','Noto Sans JP',system-ui,sans-serif" }}>

      {/* ヘッダー（埋め込み時は非表示） */}
      {!embedded && (
      <div style={{ background:'#FFFFFF', borderBottom:'1px solid #EEE9DE', padding:'0 16px', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ maxWidth:'900px', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:'52px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'15px', fontWeight:800, color:'#1F1C18' }}>カリキュラム管理</span>
            <span style={{ fontSize:'11px', color:'#B0A99A', background:'#F3F1EC', padding:'3px 8px', borderRadius:'999px' }}>
              {authLevel === 'master' ? '総管理者' : authLevel === 'admin' ? '管理者' : '閲覧'}
            </span>
            {saving && <span style={{ fontSize:'11px', color:'#9C9486' }}>保存中…</span>}
          </div>
          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
            {isMaster && (
              <button onClick={() => setShowMasterPwForm(v => !v)}
                style={{ fontSize:'11px', padding:'5px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', cursor:'pointer' }}>
                PW設定
              </button>
            )}
            <button onClick={() => setAuthLevel(null)}
              style={{ fontSize:'11px', padding:'5px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', cursor:'pointer' }}>
              ログアウト
            </button>
          </div>
        </div>
        {/* タブ */}
        <div style={{ maxWidth:'900px', margin:'0 auto', display:'flex', gap:'0' }}>
          {[
            { key:'matrix', label:'合格マトリクス', icon:<BookOpen size={13}/> },
            { key:'compare', label:'学年比較', icon:<BarChart2 size={13}/> },
            { key:'staff', label:'スタッフ', icon:<Users size={13}/> },
            { key:'curriculum', label:'カリキュラム', icon:<BookOpen size={13}/> },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display:'flex', alignItems:'center', gap:'5px', padding:'10px 14px', border:'none', borderBottom: tab===t.key ? '2px solid #2B2823' : '2px solid transparent', background:'transparent', fontSize:'12px', fontWeight: tab===t.key ? 700 : 500, color: tab===t.key ? '#2B2823' : '#9C9486', cursor:'pointer' }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* PW設定フォーム */}
      {showMasterPwForm && (
        <div style={{ background:'#FFFDF9', borderBottom:'1px solid #EEE9DE', padding:'14px 16px' }}>
          <div style={{ maxWidth:'900px', margin:'0 auto', display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:'11px', color:'#8A8378', marginBottom:'4px' }}>総管理者PW（新）</div>
              <input value={newMasterPw} onChange={e => setNewMasterPw(e.target.value)} type="password" placeholder="空欄=変更なし"
                style={{ padding:'8px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
            </div>
            <div>
              <div style={{ fontSize:'11px', color:'#8A8378', marginBottom:'4px' }}>管理者PW（新）</div>
              <input value={newAdminPw} onChange={e => setNewAdminPw(e.target.value)} type="password" placeholder="空欄=変更なし"
                style={{ padding:'8px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
            </div>
            <button onClick={savePw}
              style={{ padding:'8px 16px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
              保存
            </button>
            <button onClick={() => setShowMasterPwForm(false)}
              style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'12px', cursor:'pointer' }}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth:'900px', margin:'0 auto', padding:'20px 16px' }}>

        {/* 埋め込みモード時のタブ */}
        {embedded && (
          <div style={{ display:'flex', gap:'4px', background:'#EFEAE0', borderRadius:'10px', padding:'4px', marginBottom:'20px' }}>
            {[
              { key:'matrix', label:'合格マトリクス', icon:<BookOpen size={13}/> },
              { key:'compare', label:'学年比較', icon:<BarChart2 size={13}/> },
              { key:'staff', label:'スタッフ', icon:<Users size={13}/> },
              { key:'curriculum', label:'カリキュラム', icon:<BookOpen size={13}/> },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ display:'flex', alignItems:'center', gap:'5px', padding:'8px 14px', borderRadius:'8px', border:'none', background: tab===t.key ? '#FFFFFF' : 'transparent', fontSize:'12px', fontWeight: tab===t.key ? 700 : 500, color: tab===t.key ? '#2B2823' : '#9C9486', cursor:'pointer', boxShadow: tab===t.key ? '0 1px 4px rgba(43,40,35,0.08)' : 'none' }}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── 合格マトリクス ── */}
        {tab === 'matrix' && (
          <div>
            {/* コホートフィルター */}
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px' }}>
              <button onClick={() => setSelectedCohort('all')}
                style={{ fontSize:'12px', padding:'6px 14px', borderRadius:'999px', border: selectedCohort==='all' ? '1px solid #2B2823' : '1px solid #EEE9DE', background: selectedCohort==='all' ? '#2B2823' : '#FFFFFF', color: selectedCohort==='all' ? '#FAF8F4' : '#2B2823', cursor:'pointer', fontWeight:600 }}>
                全員
              </button>
              {cohorts.map(c => (
                <button key={c} onClick={() => setSelectedCohort(c)}
                  style={{ fontSize:'12px', padding:'6px 14px', borderRadius:'999px', border: selectedCohort===c ? `1px solid ${cohortColor(cohorts,c)}` : '1px solid #EEE9DE', background: selectedCohort===c ? cohortColor(cohorts,c) : '#FFFFFF', color: selectedCohort===c ? '#FFFFFF' : '#2B2823', cursor:'pointer', fontWeight:600 }}>
                  {c}
                </button>
              ))}
            </div>

            {/* 年度カラー凡例 */}
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'12px', alignItems:'center' }}>
              {NENDO_COLORS.map((nc, i) => (
                <span key={i} style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'999px', background: nc.bg, color: nc.text, fontWeight:700 }}>
                  {nc.label}
                </span>
              ))}
              <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'999px', background:'#FFF8DC', color:'#7B5800', fontWeight:800 }}>
                ◎ 飛び級合格
              </span>
            </div>
              <div style={{ textAlign:'center', padding:'60px 0', color:'#B0A99A', fontSize:'13px' }}>
                {data.curricula.length === 0 ? 'まずカリキュラムを追加してください' : 'スタッフがいません'}
              </div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', minWidth:`${180 + data.curricula.length * 120}px` }}>
                  <thead>
                    <tr style={{ background:'#F3F1EC' }}>
                      <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'12px', fontWeight:700, color:'#2B2823', borderBottom:'1px solid #EEE9DE', position:'sticky', left:0, background:'#F3F1EC', minWidth:'120px' }}>
                        スタッフ
                      </th>
                      {data.curricula.map(c => (
                        <th key={c.id} style={{ padding:'10px 12px', textAlign:'center', fontSize:'11px', fontWeight:700, color:'#2B2823', borderBottom:'1px solid #EEE9DE', minWidth:'110px', whiteSpace:'nowrap' }}>
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStaff.map((s, si) => {
                      const rec = data.records[s.id] || {};
                      const color = cohortColor(cohorts, s.cohort);
                      return (
                        <tr key={s.id} style={{ background: si%2===0 ? '#FFFFFF' : '#FAFAF8' }}>
                          <td style={{ padding:'10px 14px', borderBottom:'1px solid #F0EDE6', position:'sticky', left:0, background: si%2===0 ? '#FFFFFF' : '#FAFAF8' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                              <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:color, flexShrink:0 }} />
                              <div>
                                <div style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{s.name}</div>
                                <div style={{ fontSize:'10px', color:'#B0A99A' }}>{s.cohort} {s.joinDate ? `・入社${fmtDate(s.joinDate)}` : ''}</div>
                              </div>
                            </div>
                          </td>
                          {data.curricula.map(c => {
                            const val = rec[c.id]; // 日付文字列 or '◎' or undefined
                            const isSkip = val === '◎';
                            const nc = (!isSkip && val) ? nendoColor(val) : null;
                            return (
                              <td key={c.id} style={{ padding:'6px 8px', borderBottom:'1px solid #F0EDE6', textAlign:'center' }}>
                                {canEdit ? (
                                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                                    <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                                      <input
                                        type="date" value={(!isSkip && val) ? val : ''}
                                        onChange={e => setRecord(s.id, c.id, e.target.value || undefined)}
                                        style={{ fontSize:'11px', padding:'3px 5px', borderRadius:'6px', border: (val && !isSkip) ? `1px solid ${nc?.text}` : '1px solid #E2DCCC', background: nc ? nc.bg : '#FFFFFF', color: nc ? nc.text : '#2B2823', width:'108px', fontWeight: val ? 700 : 400 }}
                                      />
                                      <button
                                        onClick={() => setRecord(s.id, c.id, isSkip ? undefined : '◎')}
                                        title="飛び級合格（◎）"
                                        style={{ fontSize:'12px', padding:'3px 7px', borderRadius:'6px', border: isSkip ? '1px solid #B8860B' : '1px solid #E2DCCC', background: isSkip ? '#FFD700' : '#FFFFFF', color: isSkip ? '#7B5800' : '#B0A99A', cursor:'pointer', fontWeight: isSkip ? 800 : 400 }}>
                                        ◎
                                      </button>
                                    </div>
                                    {val && !isSkip && nc && (
                                      <span style={{ fontSize:'9px', padding:'1px 5px', borderRadius:'999px', background: nc.text, color:'#FFFFFF', fontWeight:700 }}>{nc.label}</span>
                                    )}
                                  </div>
                                ) : (
                                  isSkip ? (
                                    <span style={{ fontSize:'13px', padding:'3px 8px', borderRadius:'6px', background:'#FFF8DC', color:'#7B5800', fontWeight:800, display:'inline-block' }}>◎</span>
                                  ) : (val && nc) ? (
                                    <span style={{ fontSize:'11px', padding:'3px 8px', borderRadius:'6px', background: nc.bg, color: nc.text, fontWeight:700, display:'inline-block' }}>{fmtDate(val)}</span>
                                  ) : (
                                    <span style={{ fontSize:'12px', color:'#D0CCC4' }}>―</span>
                                  )
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 学年比較 ── */}
        {tab === 'compare' && (
          <div>
            <div style={{ fontSize:'12px', color:'#9C9486', marginBottom:'16px' }}>
              各スタッフの入社日から合格日までの日数で比較します。入社日が登録されていないスタッフは表示されません。
            </div>
            {data.curricula.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'#B0A99A', fontSize:'13px' }}>まずカリキュラムを追加してください</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
                {data.curricula.map(c => {
                  // 各コホートの合格日数データを収集
                  const cohortData = {};
                  data.staff.forEach(s => {
                    if (!s.joinDate) return;
                    const date = (data.records[s.id] || {})[c.id];
                    if (!date) return;
                    const days = daysSince(s.joinDate, date);
                    if (days === null) return;
                    if (!cohortData[s.cohort]) cohortData[s.cohort] = [];
                    cohortData[s.cohort].push({ name: s.name, days });
                  });

                  if (Object.keys(cohortData).length === 0) return null;

                  // 最大日数でバーの幅を計算
                  const allDays = Object.values(cohortData).flat().map(r => r.days);
                  const maxDays = Math.max(...allDays, 1);

                  return (
                    <div key={c.id} style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px 20px', border:'1px solid #EEE9DE' }}>
                      <div style={{ fontSize:'14px', fontWeight:700, color:'#1F1C18', marginBottom:'14px' }}>{c.name}</div>
                      {Object.entries(cohortData).sort((a,b) => a[0].localeCompare(b[0])).map(([cohort, entries]) => {
                        const color = cohortColor(cohorts, cohort);
                        const avg = Math.round(entries.reduce((s,e) => s+e.days,0) / entries.length);
                        return (
                          <div key={cohort} style={{ marginBottom:'14px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                              <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:color }} />
                              <span style={{ fontSize:'12px', fontWeight:700, color:'#2B2823' }}>{cohort}</span>
                              <span style={{ fontSize:'11px', color:'#9C9486' }}>平均 {avg}日</span>
                            </div>
                            {entries.sort((a,b) => a.days - b.days).map((e,i) => (
                              <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                                <span style={{ fontSize:'11px', color:'#8A8378', minWidth:'72px', textAlign:'right' }}>{e.name}</span>
                                <div style={{ flex:1, background:'#F3F1EC', borderRadius:'4px', height:'14px', position:'relative' }}>
                                  <div style={{ width:`${(e.days/maxDays)*100}%`, background:color, borderRadius:'4px', height:'14px', minWidth:'4px', transition:'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize:'11px', color:color, fontWeight:700, minWidth:'36px' }}>{e.days}日</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── スタッフ管理 ── */}
        {tab === 'staff' && (
          <div style={{ maxWidth:'560px' }}>
            {canEdit && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color:'#1F1C18' }}>スタッフを追加</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  <input value={newStaffName} onChange={e => setNewStaffName(e.target.value)} placeholder="名前（必須）"
                    style={{ padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                  <input value={newStaffCohort} onChange={e => setNewStaffCohort(e.target.value)} placeholder="入社年度（例：2024年入社）"
                    style={{ padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                  <div>
                    <div style={{ fontSize:'11px', color:'#8A8378', marginBottom:'4px' }}>入社日</div>
                    <input type="date" value={newStaffDate} onChange={e => setNewStaffDate(e.target.value)}
                      style={{ padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px', width:'100%', boxSizing:'border-box' }} />
                  </div>
                  <button onClick={addStaff}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'10px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                    <Plus size={14} /> 追加
                  </button>
                </div>
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {data.staff.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#B0A99A', fontSize:'13px' }}>スタッフがまだいません</div>
              )}
              {cohorts.map(cohort => {
                const members = data.staff.filter(s => s.cohort === cohort);
                const color = cohortColor(cohorts, cohort);
                return (
                  <div key={cohort}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:color, marginBottom:'6px', display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:color }} />{cohort}
                    </div>
                    {members.map(s => (
                      <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'#FFFFFF', borderRadius:'10px', border:'1px solid #EEE9DE', marginBottom:'6px' }}>
                        <div>
                          <div style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{s.name}</div>
                          <div style={{ fontSize:'11px', color:'#B0A99A' }}>
                            入社日：{s.joinDate ? fmtDate(s.joinDate) : '未登録'}
                          </div>
                        </div>
                        {canEdit && (
                          <button onClick={() => removeStaff(s.id)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#C2A98E', padding:'4px' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {/* コホートなし */}
              {data.staff.filter(s => !s.cohort || s.cohort === '未設定').map(s => (
                <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'#FFFFFF', borderRadius:'10px', border:'1px solid #EEE9DE', marginBottom:'6px' }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{s.name}</div>
                    <div style={{ fontSize:'11px', color:'#B0A99A' }}>
                      {s.cohort || '未設定'}・入社日：{s.joinDate ? fmtDate(s.joinDate) : '未登録'}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => removeStaff(s.id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#C2A98E', padding:'4px' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── カリキュラム管理 ── */}
        {tab === 'curriculum' && (
          <div style={{ maxWidth:'560px' }}>

            {/* CSV一括インポート */}
            {canEdit && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'4px', color:'#1F1C18' }}>CSVから一括インポート</div>
                <div style={{ fontSize:'11px', color:'#9C9486', marginBottom:'12px', lineHeight:1.6 }}>
                  Google スプレッドシート → ファイル → CSVでダウンロード → アップロード。<br/>
                  フォーマット：<b>1行目</b>に「空欄, スタッフA, スタッフB…」、<b>2行目以降</b>に「カリキュラム名, 合格日, 合格日…」<br/>
                  ファイル名が入社年度として自動で設定されます（例：<code>2024年入社.csv</code>）
                </div>

                {/* ドロップゾーン */}
                <div
                  onClick={() => csvInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleCSVFile(e.dataTransfer.files[0]); }}
                  style={{ border:'2px dashed #C9C2B2', borderRadius:'10px', padding:'20px', textAlign:'center', cursor:'pointer', background:'#FAF8F4', marginBottom:'12px' }}>
                  <Upload size={20} style={{ color:'#B0A99A', marginBottom:'6px' }} />
                  <div style={{ fontSize:'12px', color:'#8A8378', fontWeight:600 }}>
                    {csvFileName || 'CSVファイルをクリックして選択、またはドラッグ＆ドロップ'}
                  </div>
                  <input ref={csvInputRef} type="file" accept=".csv" style={{ display:'none' }}
                    onChange={e => handleCSVFile(e.target.files[0])} />
                </div>

                {csvError && (
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#E63946', marginBottom:'10px' }}>
                    <AlertCircle size={14} />{csvError}
                  </div>
                )}

                {/* プレビュー */}
                {csvPreview && (
                  <div style={{ background:'#FAF8F4', borderRadius:'8px', padding:'12px', marginBottom:'12px' }}>
                    <div style={{ fontSize:'12px', fontWeight:700, color:'#2B2823', marginBottom:'8px' }}>
                      インポート内容の確認
                    </div>
                    <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'4px' }}>
                      ✓ 入社年度：<b>{csvPreview.cohort}</b>
                    </div>
                    <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'4px' }}>
                      ✓ スタッフ：{csvPreview.staffNames.length}人（{csvPreview.staffNames.join('、')}）
                    </div>
                    <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'10px' }}>
                      ✓ カリキュラム：{csvPreview.curriculaNames.length}項目
                    </div>
                    <div style={{ fontSize:'11px', color:'#9C9486', marginBottom:'10px' }}>
                      既存のスタッフ・カリキュラムと重複する場合はスキップします。合格記録は上書きされます。入社日は別途スタッフタブで設定してください。
                    </div>
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button onClick={importCSV} disabled={csvImporting}
                        style={{ display:'flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                        <CheckCircle size={14} /> インポート実行
                      </button>
                      <button onClick={() => { setCsvPreview(null); setCsvFileName(''); }}
                        style={{ padding:'9px 14px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'13px', cursor:'pointer' }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 手動追加 */}
            {canEdit && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color:'#1F1C18' }}>カリキュラムを手動で追加</div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input value={newCurrName} onChange={e => setNewCurrName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCurr()}
                    placeholder="例：シャンプー合格、ブロー1回目合格"
                    style={{ flex:1, padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                  <button onClick={addCurr}
                    style={{ display:'flex', alignItems:'center', gap:'5px', padding:'9px 14px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                    <Plus size={14} /> 追加
                  </button>
                </div>
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {data.curricula.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#B0A99A', fontSize:'13px' }}>カリキュラムがまだありません</div>
              )}
              {data.curricula.map((c, i) => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#FFFFFF', borderRadius:'10px', border:'1px solid #EEE9DE' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{ fontSize:'11px', color:'#B0A99A', fontWeight:700, minWidth:'20px' }}>{i+1}</span>
                    <span style={{ fontSize:'13px', fontWeight:600, color:'#1F1C18' }}>{c.name}</span>
                  </div>
                  {canEdit && (
                    <button onClick={() => removeCurr(c.id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#C2A98E', padding:'4px' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
