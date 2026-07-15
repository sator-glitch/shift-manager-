import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Upload, AlertCircle, CheckCircle, Users, BookOpen, BarChart2, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Firebase キー ───────────────────────────────────────────────
const DATA_KEY     = 'curriculum_v2';
const MASTER_PW_KEY   = 'curriculum_master_pw_v1';
const SCHEDULE_PW_KEY = 'curriculum_schedule_pw_v1';
const ADMIN_PW_KEY    = 'curriculum_admin_pw_v1';

// ─── 権限レベル ──────────────────────────────────────────────────
// master   : 全機能（総管理者）
// schedule : 合格日編集+平均閲覧（日程管理者）
// admin    : 合格日編集不可・平均閲覧可・スタッフ管理可（管理者）
// viewer   : 合格日閲覧のみ・平均非表示

// ─── ユーティリティ ───────────────────────────────────────────────
function daysSince(from, to) {
  if (!from || !to) return null;
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}
function fmtDate(ds) {
  if (!ds || ds === '◎') return ds || '―';
  const [y, m, d] = ds.split('-');
  return `${y}/${m}/${d}`;
}
function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── 初期データ ───────────────────────────────────────────────────
const INIT_DATA = { curricula: [], staff: [], records: {} };

const SEED_STAFF = [{"id": "3i1140i6", "name": "池崎", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "e676athv", "name": "池田", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "kdssnvdm", "name": "岡本", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "iutcqc7q", "name": "梶原", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "46ly3qtp", "name": "鎌田", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "vyrvmev7", "name": "喜友名", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "o62rnwuv", "name": "久我", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "spdmy4qa", "name": "田村", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "rsh090vr", "name": "長山", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "xkq69r38", "name": "中原", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "qwwly7h1", "name": "祝部", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "8itq4hxo", "name": "中島(2023／8入社)", "cohort": "2023年入社", "joinDate": "2023-04-01"}, {"id": "4ur09s6s", "name": "石橋梨花", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "l2u6drha", "name": "石原まつり", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "wde1zo1q", "name": "扇本武", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "1t57hnt0", "name": "児島萌泉", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "2f54ihbg", "name": "齋藤弓希斗", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "a0vv53p3", "name": "佐藤美心", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "ofl0bgwj", "name": "須佐美悠二", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "puqcsa1q", "name": "鈴木帆乃花", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "z9lbrls8", "name": "中尾もも", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "87w1xonx", "name": "中村龍志", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "47jgrt8z", "name": "森田琴心", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "d4n5nhez", "name": "塩盛要人", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "y5biyyz4", "name": "穐山音乃", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "g02rtjgx", "name": "浅井理子", "cohort": "2024年入社", "joinDate": "2024-04-01"}, {"id": "0l27oe02", "name": "友保芽依", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "vbbo8qsx", "name": "伊木栞乃", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "49ro4h0j", "name": "三枝千尋", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "ognyqjbv", "name": "竹村まゆか", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "gebzd5kr", "name": "北村美羽", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "zwtte8om", "name": "横尾梨花", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "71i7nyuv", "name": "久部菜々子", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "mlv55ggr", "name": "大沼蘭", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "bkyy06oa", "name": "野崎結芽", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "4evbhiyl", "name": "井上詩央", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "4xfm719a", "name": "生田結愛", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "84idhdvi", "name": "森下陽菜多", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "w8dqzqoz", "name": "木村那奈", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "wokdqu62", "name": "山本彩陽", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "tg8ofq0g", "name": "黒田恵", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "ncy4alhf", "name": "西平光大", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "fe5u8utd", "name": "鵜澤想来", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "qgs7o87g", "name": "津屋さくら", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "ms1z4cur", "name": "新倉あかね", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "wifnvb2c", "name": "德元芙友", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "whbxbjeb", "name": "椎木優斗", "cohort": "2025年入社", "joinDate": "2025-04-01"}, {"id": "grfd8p82", "name": "アキヤマ ダイゴ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "tjzbd1c9", "name": "アベ ユウセイ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "jzhghgts", "name": "イデ マリコ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "ll0eo6r1", "name": "イナミ コウヘイ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "37ogl8bb", "name": "ウエキ ソラ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "8h0jmlnh", "name": "ウラタ マモル", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "a7ca8cw4", "name": "オオバヤシ リリカ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "p557nu9n", "name": "オクノ アオイ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "s7z75ldk", "name": "カトウ クルミ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "rk5bw52l", "name": "カネヤマ ショウノスケ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "r2cpqqgl", "name": "カミジョウ ミウ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "k8bd4hxq", "name": "キムラ リョウスケ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "xevozjt2", "name": "ケミ ナギサ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "8i8lwxdm", "name": "サカイ カナタ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "x5hs2e7k", "name": "サワダ コハナ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "1qyci982", "name": "ススギ リノ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "lh77xn2v", "name": "スズキ ユイナ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "xiw4pv2n", "name": "スズキ アイネ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "x29j9mid", "name": "タカベ マナカ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "7exramxk", "name": "トウドウ リコ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "0nflj2hk", "name": "トヨオカ サキ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "fgcixgfi", "name": "ナカニシ ユナ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "f5sj7j56", "name": "モリ リュウキ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "fyv86w0z", "name": "ヤマダ ルナ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "ibqgva05", "name": "ヨネモト コトネ", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "u7m9qo8w", "name": "イシハラ ミコト", "cohort": "2026年入社", "joinDate": "2026-04-01"}, {"id": "gtloc8gl", "name": "カゴヤ ライム", "cohort": "2026年入社", "joinDate": "2026-04-01"}];

// ─── 年度カラー（2023年度起点） ──────────────────────────────────
const NENDO_COLORS = [
  { bg: '#D4EDDA', text: '#1A6B32', label: '23年度' },
  { bg: '#CCE5FF', text: '#0056B3', label: '24年度' },
  { bg: '#FFF3CD', text: '#856404', label: '25年度' },
  { bg: '#F8D7DA', text: '#721C24', label: '26年度' },
  { bg: '#E2D9F3', text: '#4A1F8C', label: '27年度' },
  { bg: '#FFDDC1', text: '#7B3000', label: '28年度' },
];
function nendoIndex(ds) {
  if (!ds || ds === '◎') return null;
  const [y, m] = ds.split('-').map(Number);
  const n = m >= 4 ? y - 2023 : y - 2024;
  return Math.max(0, n);
}
function nendoColor(ds) {
  const idx = nendoIndex(ds);
  if (idx === null) return null;
  return NENDO_COLORS[Math.min(idx, NENDO_COLORS.length - 1)];
}

// ─── コホートカラー ───────────────────────────────────────────────
const COHORT_COLORS = ['#4361EE','#E63946','#2A9D8F','#F4A300','#9D4EDD','#06A77D','#EF476F','#118AB2'];
function cohortColor(cohorts, cohort) {
  const idx = cohorts.indexOf(cohort);
  return COHORT_COLORS[idx >= 0 ? idx % COHORT_COLORS.length : 0];
}

// ─── CSV パース ──────────────────────────────────────────────────
function normalizeDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (s === '○' || s === '◯' || s === '◎' || s === '●' || s === '〇') return '◎';
  const n = s.replace(/\//g, '-');
  const m = n.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const m2 = n.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m2) return `20${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
  return null;
}
function parseCSVRow(line) {
  const result = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result.map(s => s.trim().replace(/^"|"$/g, ''));
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: '行数が少なすぎます' };
  const header = parseCSVRow(lines[0]);
  if (header.length < 2) return { error: '列が少なすぎます' };
  const staffNames = header.slice(1).filter(n => n.trim());
  let joinDateFromCSV = '';
  const curriculaNames = [], recordMatrix = {};
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const first = row[0]?.trim();
    if (!first) continue;
    if (first === '__joinDate__') {
      const d = normalizeDate(row[1]);
      if (d && d !== '◎') joinDateFromCSV = d;
      continue;
    }
    curriculaNames.push(first);
    staffNames.forEach((sName, si) => {
      const date = normalizeDate(row[si + 1]);
      if (date) {
        if (!recordMatrix[sName]) recordMatrix[sName] = {};
        recordMatrix[sName][first] = date;
      }
    });
  }
  return { staffNames, curriculaNames, recordMatrix, joinDateFromCSV };
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function CurriculumApp({ embedded = false, embeddedCanEdit = true, embeddedCanViewAvg = false, embeddedIsMaster = false }) {
  // 認証
  const [authLevel, setAuthLevel] = useState(null);
  const [pwInput, setPwInput]     = useState('');
  const [pwError, setPwError]     = useState('');
  const [masterPw,   setMasterPw]   = useState('1111');
  const [schedulePw, setSchedulePw] = useState('3333');
  const [adminPw,    setAdminPw]    = useState('2222');
  const [loadingAuth, setLoadingAuth] = useState(true);

  // データ
  const [data, setData]       = useState(INIT_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // UI
  const [tab, setTab]                   = useState('matrix');
  const [selectedCohort, setSelectedCohort] = useState('all');
  const [openCurrId, setOpenCurrId] = useState(null); // 学年比較で開いている項目（1つのみ）
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editStaffName, setEditStaffName]   = useState('');
  const [editStaffDate, setEditStaffDate]   = useState('');
  const [editStaffCohort, setEditStaffCohort] = useState('');
  const [showPwForm, setShowPwForm]     = useState(false);
  const [newMasterPw, setNewMasterPw]   = useState('');
  const [newSchedulePw, setNewSchedulePw] = useState('');
  const [newAdminPw, setNewAdminPw]     = useState('');
  const [newStaffName, setNewStaffName]   = useState('');
  const [newStaffDate, setNewStaffDate]   = useState('');
  const [newStaffCohort, setNewStaffCohort] = useState('');
  const [newCurrName, setNewCurrName]   = useState('');
  const [showScheduleLogin, setShowScheduleLogin] = useState(false);
  const [schedulePwInput, setSchedulePwInput]     = useState('');
  const [schedulePwError, setSchedulePwError]     = useState('');
  const [csvPreview, setCsvPreview]     = useState(null);
  const [csvFileName, setCsvFileName]   = useState('');
  const [csvError, setCsvError]         = useState('');
  const csvInputRef = useRef(null);

  // 権限フラグ
  const canEdit    = (authLevel === 'master' || authLevel === 'schedule') || (embedded && embeddedCanEdit);
  const canManage  = (authLevel === 'master' || authLevel === 'admin')   || (embedded && embeddedIsMaster);
  const canViewAvg = (authLevel === 'master' || authLevel === 'schedule' || authLevel === 'admin') || (embedded && (embeddedCanViewAvg || embeddedCanEdit));
  const isMaster   = authLevel === 'master' || (embedded && embeddedIsMaster && !authLevel);

  // ── PW読み込み
  const CURR_AUTH_KEY = 'curriculum_auth_session';

  useEffect(() => {
    (async () => {
      // embedded時もFirebaseからPWを読み込む
      try { const r = await window.storage.get(MASTER_PW_KEY);   if (r) setMasterPw(r.value); } catch {}
      try { const r = await window.storage.get(SCHEDULE_PW_KEY); if (r) setSchedulePw(r.value); } catch {}
      try { const r = await window.storage.get(ADMIN_PW_KEY);    if (r) setAdminPw(r.value); } catch {}
      if (embedded) {
        const saved = sessionStorage.getItem(CURR_AUTH_KEY);
        if (saved) setAuthLevel(saved);
      }
      setLoadingAuth(false);
    })();
  }, [embedded]);

  // ── データ読み込み
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(DATA_KEY);
        if (r) {
          const parsed = JSON.parse(r.value);
          if (!parsed.staff || parsed.staff.length === 0) {
            const seeded = { ...parsed, staff: SEED_STAFF };
            await window.storage.set(DATA_KEY, JSON.stringify(seeded));
            setData(seeded);
          } else { setData(parsed); }
        } else {
          const init = { ...INIT_DATA, staff: SEED_STAFF };
          await window.storage.set(DATA_KEY, JSON.stringify(init));
          setData(init);
        }
      } catch { setData({ ...INIT_DATA, staff: SEED_STAFF }); }
      setLoading(false);
    })();
  }, []);

  // ── 保存
  const persist = useCallback(async (next) => {
    setSaving(true);
    try { await window.storage.set(DATA_KEY, JSON.stringify(next)); } catch {}
    setSaving(false);
  }, []);
  function update(fn) {
    setData(prev => { const next = fn(prev); persist(next); return next; });
  }

  // ── 認証
  function login() {
    let level = null;
    if (pwInput === masterPw)        level = 'master';
    else if (pwInput === schedulePw) level = 'schedule';
    else if (pwInput === adminPw)    level = 'admin';
    if (level) {
      setAuthLevel(level);
      if (embedded) sessionStorage.setItem(CURR_AUTH_KEY, level);
      setPwError('');
    } else {
      setPwError('パスワードが違います');
    }
  }

  function logout() {
    setAuthLevel(null);
    if (embedded) sessionStorage.removeItem(CURR_AUTH_KEY);
  }

  // ── PW更新
  async function savePw() {
    if (newMasterPw.trim())   { setMasterPw(newMasterPw.trim());   await window.storage.set(MASTER_PW_KEY,   newMasterPw.trim()); }
    if (newSchedulePw.trim()) { setSchedulePw(newSchedulePw.trim()); await window.storage.set(SCHEDULE_PW_KEY, newSchedulePw.trim()); }
    if (newAdminPw.trim())    { setAdminPw(newAdminPw.trim());    await window.storage.set(ADMIN_PW_KEY,    newAdminPw.trim()); }
    setShowPwForm(false); setNewMasterPw(''); setNewSchedulePw(''); setNewAdminPw('');
  }

  // ── コホート一覧
  const cohorts = [...new Set(data.staff.map(s => s.cohort).filter(Boolean))].sort();
  const displayedStaff = selectedCohort === 'all' ? data.staff : data.staff.filter(s => s.cohort === selectedCohort);

  // ── スタッフ操作
  function addStaff() {
    if (!newStaffName.trim()) return;
    update(d => ({ ...d, staff: [...d.staff, { id: uid(), name: newStaffName.trim(), joinDate: newStaffDate, cohort: newStaffCohort.trim() || '未設定' }] }));
    setNewStaffName(''); setNewStaffDate(''); setNewStaffCohort('');
  }
  function removeStaff(id) {
    const s = data.staff.find(s => s.id === id);
    if (!window.confirm(`「${s?.name}」を削除しますか？\nこのスタッフの合格記録も全て削除されます。`)) return;
    update(d => { const records = { ...d.records }; delete records[id]; return { ...d, staff: d.staff.filter(s => s.id !== id), records }; });
  }
  function startEditStaff(s) { setEditingStaffId(s.id); setEditStaffName(s.name); setEditStaffDate(s.joinDate || ''); setEditStaffCohort(s.cohort || ''); }
  function saveEditStaff() {
    if (!editStaffName.trim()) return;
    update(d => ({ ...d, staff: d.staff.map(s => s.id === editingStaffId ? { ...s, name: editStaffName.trim(), joinDate: editStaffDate, cohort: editStaffCohort.trim() || '未設定' } : s) }));
    setEditingStaffId(null);
  }

  // ── カリキュラム操作
  function addCurr() {
    if (!newCurrName.trim()) return;
    update(d => ({ ...d, curricula: [...d.curricula, { id: uid(), name: newCurrName.trim() }] }));
    setNewCurrName('');
  }
  function removeCurr(id) {
    if (!window.confirm('このカリキュラムを削除しますか？全スタッフの合格記録も削除されます。')) return;
    update(d => {
      const records = {};
      Object.entries(d.records).forEach(([sid, rec]) => { const r = { ...rec }; delete r[id]; records[sid] = r; });
      return { ...d, curricula: d.curricula.filter(c => c.id !== id), records };
    });
  }
  function moveCurr(id, dir) {
    update(d => {
      const arr = [...d.curricula];
      const idx = arr.findIndex(c => c.id === id);
      if (idx < 0) return d;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return d;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return { ...d, curricula: arr };
    });
  }

  // ── 合格記録
  function setRecord(staffId, currId, val) {
    update(d => ({ ...d, records: { ...d.records, [staffId]: { ...(d.records[staffId] || {}), [currId]: val || undefined } } }));
  }

  // ── CSV
  function handleCSVFile(file) {
    if (!file) return;
    setCsvError(''); setCsvPreview(null); setCsvFileName(file.name);
    const cohort = file.name.replace(/\.csv$/i, '').replace(/\s+/g, '') || file.name.replace(/\.csv$/i, '');
    const reader = new FileReader();
    reader.onload = e => {
      const result = parseCSV(e.target.result);
      if (result.error) { setCsvError(result.error); return; }
      setCsvPreview({ ...result, cohort });
    };
    reader.readAsText(file, 'UTF-8');
  }
  function importCSV() {
    if (!csvPreview) return;
    const { staffNames, curriculaNames, recordMatrix, cohort, joinDateFromCSV } = csvPreview;
    update(d => {
      let next = { ...d, curricula: [...d.curricula], staff: [...d.staff], records: { ...d.records } };
      curriculaNames.forEach(name => { if (!next.curricula.find(c => c.name === name)) next.curricula.push({ id: uid(), name }); });
      staffNames.forEach(name => { if (!next.staff.find(s => s.name === name)) next.staff.push({ id: uid(), name, joinDate: joinDateFromCSV || '', cohort }); });
      staffNames.forEach(sName => {
        const staff = next.staff.find(s => s.name === sName); if (!staff) return;
        const existing = { ...(next.records[staff.id] || {}) };
        Object.entries(recordMatrix[sName] || {}).forEach(([currName, date]) => {
          const curr = next.curricula.find(c => c.name === currName);
          if (curr) existing[curr.id] = date;
        });
        next.records = { ...next.records, [staff.id]: existing };
      });
      return next;
    });
    setCsvPreview(null); setCsvFileName('');
  }

  // ── 学年比較：入社日から合格日までの日数（入社日がある場合はそれを基準）
  function calcDays(staff, dateStr) {
    if (!dateStr || dateStr === '◎') return null;
    const base = staff.joinDate || null;
    if (!base) return null;
    return daysSince(base, dateStr);
  }

  // 学年比較の開閉（1つだけ開く）
  function toggleCurr(id) {
    setOpenCurrId(prev => prev === id ? null : id);
  }

  // 大項目グループ化：「中ロール人頭1」→ prefix「中ロール人頭」、suffix 1
  function parseCurrName(name) {
    const m = name.match(/^(.+?)(\d+)$/);
    if (m) return { prefix: m[1].trim(), num: parseInt(m[2]) };
    return { prefix: name, num: null };
  }

  // カリキュラムを大項目でグループ化
  function buildCurrGroups(curricula) {
    const groups = {}; // prefix → [{ id, name, num }]
    const order = [];
    curricula.forEach(c => {
      const { prefix, num } = parseCurrName(c.name);
      if (num !== null) {
        if (!groups[prefix]) { groups[prefix] = []; order.push({ type: 'group', prefix }); }
        groups[prefix].push({ ...c, num });
      } else {
        order.push({ type: 'single', curr: c });
      }
    });
    return { groups, order };
  }

  // ─── ローディング
  if (loadingAuth || loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height: embedded ? '200px' : '100vh', color:'#9C9486', fontSize:'13px' }}>読み込み中…</div>;

  // ─── ログイン画面（embeddedの場合はスキップ）
  if (!authLevel && !embedded) return (
    <div style={{ background:'#FAF8F4', minHeight: embedded ? 'auto' : '100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
      <div style={{ background:'#FFFFFF', borderRadius:'16px', padding:'28px 24px', width:'100%', maxWidth:'360px', border:'1px solid #EEE9DE' }}>
        <div style={{ fontSize: embedded ? '15px' : '22px', fontWeight:800, color:'#1F1C18', marginBottom:'4px' }}>カリキュラム管理</div>
        <div style={{ fontSize:'13px', color:'#9C9486', marginBottom:'16px' }}>
          {embedded ? '総管理者・日程管理者・管理者でログインできます。' : 'NORA Group'}
        </div>
        <div style={{ fontSize:'12px', color:'#8A8378', marginBottom:'6px', fontWeight:600 }}>パスワード</div>
        <input value={pwInput} onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()}
          type="password" placeholder="パスワードを入力"
          style={{ width:'100%', padding:'11px 14px', borderRadius:'10px', border:'1px solid #E2DCCC', fontSize:'14px', boxSizing:'border-box', marginBottom:'8px' }} />
        {pwError && <div style={{ fontSize:'12px', color:'#E63946', marginBottom:'8px' }}>{pwError}</div>}
        <button onClick={login} style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'14px', fontWeight:700, cursor:'pointer', marginBottom:'12px' }}>ログイン</button>
        <button onClick={() => { setAuthLevel('viewer'); if (embedded) sessionStorage.setItem(CURR_AUTH_KEY, 'viewer'); }} style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>閲覧のみで入る</button>
      </div>
    </div>
  );

  const authLabel = { master:'総管理者', schedule:'日程管理者', admin:'管理者', viewer:'閲覧' }[authLevel] || '';

  // ─── メイン画面
  return (
    <div style={{ minHeight:'100vh', background:'#FAF8F4' }}>
      {!embedded && (
        <div style={{ background:'#FFFFFF', borderBottom:'1px solid #EEE9DE', padding:'0 16px', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ maxWidth:'900px', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:'52px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'15px', fontWeight:800, color:'#1F1C18' }}>カリキュラム管理</span>
              <span style={{ fontSize:'11px', color:'#B0A99A', background:'#F3F1EC', padding:'3px 8px', borderRadius:'999px' }}>{authLabel}</span>
              {saving && <span style={{ fontSize:'11px', color:'#9C9486' }}>保存中…</span>}
            </div>
            <div style={{ display:'flex', gap:'6px' }}>
              {isMaster && <button onClick={() => setShowPwForm(v => !v)} style={{ fontSize:'11px', padding:'5px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', cursor:'pointer' }}>PW設定</button>}
              <button onClick={logout} style={{ fontSize:'11px', padding:'5px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', cursor:'pointer' }}>ログアウト</button>
            </div>
          </div>
          <div style={{ maxWidth:'900px', margin:'0 auto', display:'flex' }}>
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

      {/* PW設定 */}
      {showPwForm && (
        <div style={{ background:'#FFFDF9', borderBottom:'1px solid #EEE9DE', padding:'14px 16px' }}>
          <div style={{ maxWidth:'900px', margin:'0 auto', display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end' }}>
            {[['総管理者PW', newMasterPw, setNewMasterPw], ['日程管理者PW', newSchedulePw, setNewSchedulePw], ['管理者PW', newAdminPw, setNewAdminPw]].map(([label, val, setter]) => (
              <div key={label}>
                <div style={{ fontSize:'11px', color:'#8A8378', marginBottom:'4px' }}>{label}（新）</div>
                <input value={val} onChange={e => setter(e.target.value)} type="password" placeholder="空欄=変更なし"
                  style={{ padding:'8px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
              </div>
            ))}
            <button onClick={savePw} style={{ padding:'8px 16px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>保存</button>
            <button onClick={() => setShowPwForm(false)} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'12px', cursor:'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      <div style={{ maxWidth:'900px', margin:'0 auto', padding:'20px 16px' }}>
        {/* 埋め込み時タブ */}
        {embedded && (
          <div style={{ marginBottom:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
              <span style={{ fontSize:'11px', color:'#B0A99A', background:'#F3F1EC', padding:'3px 8px', borderRadius:'999px' }}>{authLabel || '閲覧'}</span>
              <div style={{ display:'flex', gap:'6px' }}>
                {isMaster && <button onClick={() => setShowPwForm(v => !v)} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', cursor:'pointer' }}>PW設定</button>}
                <button onClick={logout} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', cursor:'pointer' }}>ログアウト</button>
              </div>
            </div>
            <div style={{ display:'flex', gap:'4px', background:'#EFEAE0', borderRadius:'10px', padding:'4px' }}>
              {[
                { key:'matrix', label:'合格マトリクス' },
                { key:'compare', label:'学年比較' },
                { key:'staff', label:'スタッフ' },
                { key:'curriculum', label:'カリキュラム' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ padding:'8px 14px', borderRadius:'8px', border:'none', background: tab===t.key ? '#FFFFFF' : 'transparent', fontSize:'12px', fontWeight: tab===t.key ? 700 : 500, color: tab===t.key ? '#2B2823' : '#9C9486', cursor:'pointer', boxShadow: tab===t.key ? '0 1px 4px rgba(43,40,35,0.08)' : 'none' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 合格マトリクス */}
        {tab === 'matrix' && (
          <div>
            {/* 日程管理者ログインバー（管理者・閲覧者のみ表示） */}
            {!canEdit && (
              <div style={{ background:'#FFFDF9', border:'1px solid #EEE9DE', borderRadius:'10px', padding:'10px 14px', marginBottom:'14px', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                {showScheduleLogin ? (
                  <>
                    <span style={{ fontSize:'12px', color:'#8A8378' }}>日程管理者PW：</span>
                    <input type="password" value={schedulePwInput} onChange={e => setSchedulePwInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (schedulePwInput === schedulePw) { setAuthLevel('schedule'); setShowScheduleLogin(false); setSchedulePwInput(''); setSchedulePwError(''); }
                          else { setSchedulePwError('パスワードが違います'); }
                        }
                      }}
                      placeholder="パスワードを入力"
                      style={{ padding:'6px 10px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px', width:'160px' }} />
                    <button onClick={() => {
                      if (schedulePwInput === schedulePw) { setAuthLevel('schedule'); setShowScheduleLogin(false); setSchedulePwInput(''); setSchedulePwError(''); }
                      else { setSchedulePwError('パスワードが違います'); }
                    }} style={{ padding:'6px 14px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                      ログイン
                    </button>
                    <button onClick={() => { setShowScheduleLogin(false); setSchedulePwInput(''); setSchedulePwError(''); }}
                      style={{ padding:'6px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'12px', cursor:'pointer' }}>
                      キャンセル
                    </button>
                    {schedulePwError && <span style={{ fontSize:'12px', color:'#E63946' }}>{schedulePwError}</span>}
                  </>
                ) : (
                  <>
                    <span style={{ fontSize:'12px', color:'#9C9486' }}>合格日を編集するには日程管理者でログインしてください</span>
                    <button onClick={() => setShowScheduleLogin(true)}
                      style={{ padding:'6px 14px', borderRadius:'8px', border:'1px solid #4361EE', background:'#FFFFFF', color:'#4361EE', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                      日程管理者でログイン
                    </button>
                  </>
                )}
              </div>
            )}
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'8px' }}>
              {['all', ...cohorts].map(c => (
                <button key={c} onClick={() => setSelectedCohort(c)}
                  style={{ fontSize:'12px', padding:'6px 14px', borderRadius:'999px', border: selectedCohort===c ? (c==='all' ? '1px solid #2B2823' : `1px solid ${cohortColor(cohorts,c)}`) : '1px solid #EEE9DE', background: selectedCohort===c ? (c==='all' ? '#2B2823' : cohortColor(cohorts,c)) : '#FFFFFF', color: selectedCohort===c ? '#FAF8F4' : '#2B2823', cursor:'pointer', fontWeight:600 }}>
                  {c === 'all' ? '全員' : c}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'14px', alignItems:'center' }}>
              {NENDO_COLORS.map((nc, i) => (
                <span key={i} style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'999px', background: nc.bg, color: nc.text, fontWeight:700 }}>{nc.label}</span>
              ))}
              <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'999px', background:'#FFF8DC', color:'#7B5800', fontWeight:800 }}>◎ 飛び級</span>
            </div>
            {data.curricula.length === 0 || displayedStaff.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'#B0A99A', fontSize:'13px' }}>
                {data.curricula.length === 0 ? 'まずカリキュラムを追加してください' : 'スタッフがいません'}
              </div>
            ) : (
              <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'70vh' }}>
                <table style={{ borderCollapse:'collapse', minWidth:`${180 + data.curricula.length * 120}px` }}>
                  <thead style={{ position:'sticky', top:0, zIndex:3 }}>
                    <tr style={{ background:'#F3F1EC' }}>
                      <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'12px', fontWeight:700, color:'#2B2823', borderBottom:'1px solid #EEE9DE', position:'sticky', left:0, top:0, zIndex:4, background:'#F3F1EC', minWidth:'120px' }}>スタッフ</th>
                      {data.curricula.map(c => (
                        <th key={c.id} style={{ padding:'10px 12px', textAlign:'center', fontSize:'11px', fontWeight:700, color:'#2B2823', borderBottom:'1px solid #EEE9DE', minWidth:'110px', whiteSpace:'nowrap', position:'sticky', top:0, background:'#F3F1EC', zIndex:3 }}>{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStaff.map((s, si) => {
                      const rec = data.records[s.id] || {};
                      const color = cohortColor(cohorts, s.cohort);
                      return (
                        <tr key={s.id} style={{ background: si%2===0 ? '#FFFFFF' : '#FAFAF8' }}>
                          <td style={{ padding:'10px 14px', borderBottom:'1px solid #F0EDE6', position:'sticky', left:0, background: si%2===0 ? '#FFFFFF' : '#FAFAF8', zIndex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                              <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:color, flexShrink:0 }} />
                              <div>
                                <div style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{s.name}</div>
                                <div style={{ fontSize:'10px', color:'#B0A99A' }}>{s.cohort}</div>
                              </div>
                            </div>
                          </td>
                          {data.curricula.map(c => {
                            const val = rec[c.id];
                            const isSkip = val === '◎';
                            const nc = (!isSkip && val) ? nendoColor(val) : null;
                            return (
                              <td key={c.id} style={{ padding:'6px 8px', borderBottom:'1px solid #F0EDE6', textAlign:'center' }}>
                                {canEdit ? (
                                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                                    <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                                      <input type="date" value={(!isSkip && val) ? val : ''}
                                        onChange={e => setRecord(s.id, c.id, e.target.value || undefined)}
                                        style={{ fontSize:'11px', padding:'3px 5px', borderRadius:'6px', border: (val && !isSkip) ? `1px solid ${nc?.text}` : '1px solid #E2DCCC', background: nc ? nc.bg : '#FFFFFF', color: nc ? nc.text : '#2B2823', width:'108px', fontWeight: val ? 700 : 400 }} />
                                      <button onClick={() => setRecord(s.id, c.id, isSkip ? undefined : '◎')} title="飛び級合格"
                                        style={{ fontSize:'12px', padding:'3px 7px', borderRadius:'6px', border: isSkip ? '1px solid #B8860B' : '1px solid #E2DCCC', background: isSkip ? '#FFD700' : '#FFFFFF', color: isSkip ? '#7B5800' : '#B0A99A', cursor:'pointer', fontWeight: isSkip ? 800 : 400 }}>◎</button>
                                    </div>
                                    {val && !isSkip && nc && <span style={{ fontSize:'9px', padding:'1px 5px', borderRadius:'999px', background: nc.text, color:'#FFFFFF', fontWeight:700 }}>{nc.label}</span>}
                                  </div>
                                ) : (
                                  isSkip ? <span style={{ fontSize:'13px', padding:'3px 8px', borderRadius:'6px', background:'#FFF8DC', color:'#7B5800', fontWeight:800 }}>◎</span>
                                  : (val && nc) ? <span style={{ fontSize:'11px', padding:'3px 8px', borderRadius:'6px', background: nc.bg, color: nc.text, fontWeight:700 }}>{fmtDate(val)}</span>
                                  : <span style={{ fontSize:'12px', color:'#D0CCC4' }}>―</span>
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

        {/* ── 学年比較 */}
        {tab === 'compare' && (
          <div>
            {!canViewAvg ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'#B0A99A', fontSize:'13px' }}>この機能は管理者以上のみ閲覧できます</div>
            ) : (() => {
              const { groups, order } = buildCurrGroups(data.curricula);

              // 大項目の合格日を計算：グループ内の最大番号の小項目の合格日
              function getGroupDate(staffId, prefix) {
                const items = groups[prefix] || [];
                const sorted = [...items].sort((a,b) => b.num - a.num);
                for (const item of sorted) {
                  const val = (data.records[staffId] || {})[item.id];
                  if (val && val !== '◎') return val;
                  if (val === '◎') return '◎';
                }
                return undefined;
              }

              // 項目ごとのコホートデータを計算
              function getCohortData(key, isGroup) {
                const result = {};
                data.staff.forEach(s => {
                  if (!s.joinDate) return;
                  const val = isGroup
                    ? getGroupDate(s.id, key)
                    : (data.records[s.id] || {})[key];
                  const days = calcDays(s, val);
                  if (days === null) return;
                  if (!result[s.cohort]) result[s.cohort] = [];
                  result[s.cohort].push({ name: s.name, days });
                });
                return result;
              }

              // 表示アイテムを構築（大項目はグループとして、単品はそのまま）
              const items = [];
              const seenPrefixes = new Set();
              order.forEach(o => {
                if (o.type === 'group' && !seenPrefixes.has(o.prefix)) {
                  seenPrefixes.add(o.prefix);
                  const cohortData = getCohortData(o.prefix, true);
                  if (Object.keys(cohortData).length > 0) {
                    items.push({ key: `group:${o.prefix}`, label: o.prefix, isGroup: true, cohortData, subItems: groups[o.prefix].sort((a,b) => a.num - b.num) });
                  }
                } else if (o.type === 'single') {
                  const cohortData = getCohortData(o.curr.id, false);
                  if (Object.keys(cohortData).length > 0) {
                    items.push({ key: o.curr.id, label: o.curr.name, isGroup: false, cohortData });
                  }
                }
              });

              return (
                <>
                  <div style={{ fontSize:'12px', color:'#9C9486', marginBottom:'12px' }}>
                    入社日から合格日までの日数で比較。入社日未登録・未合格のスタッフは除外。数字サフィックスのある項目（デンマン人頭1〜4など）は大項目として最終合格日で集計。
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {items.map(item => {
                      const isOpen = openCurrId === item.key;
                      const allDays = Object.values(item.cohortData).flat().map(r => r.days);
                      const maxDays = Math.max(...allDays, 1);
                      return (
                        <div key={item.key} style={{ background:'#FFFFFF', borderRadius:'12px', border: isOpen ? '1px solid #4361EE' : '1px solid #EEE9DE', overflow:'hidden' }}>
                          <button onClick={() => toggleCurr(item.key)}
                            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', border:'none', background: isOpen ? '#F5F8FF' : 'transparent', cursor:'pointer', textAlign:'left' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                              {item.isGroup && <span style={{ fontSize:'9px', padding:'1px 6px', borderRadius:'999px', background:'#EEF2FF', color:'#4361EE', fontWeight:700 }}>大項目</span>}
                              <span style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{item.label}</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
                              {Object.entries(item.cohortData).sort((a,b) => a[0].localeCompare(b[0])).map(([cohort, entries]) => {
                                const avg = Math.round(entries.reduce((s,e) => s+e.days,0) / entries.length);
                                const col = cohortColor(cohorts, cohort);
                                return <span key={cohort} style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'999px', background: col, color:'#FFFFFF', fontWeight:700 }}>{cohort.replace('年入社','')}: {avg}日</span>;
                              })}
                              {isOpen ? <ChevronDown size={14} color="#4361EE"/> : <ChevronRight size={14} color="#9C9486"/>}
                            </div>
                          </button>
                          {isOpen && (
                            <div style={{ padding:'0 16px 14px', borderTop:'1px solid #EEF2FF' }}>
                              {Object.entries(item.cohortData).sort((a,b) => a[0].localeCompare(b[0])).map(([cohort, entries]) => {
                                const color = cohortColor(cohorts, cohort);
                                const avg = Math.round(entries.reduce((s,e) => s+e.days,0) / entries.length);
                                return (
                                  <div key={cohort} style={{ marginTop:'10px' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
                                      <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:color }} />
                                      <span style={{ fontSize:'11px', fontWeight:700, color:'#2B2823' }}>{cohort}</span>
                                      <span style={{ fontSize:'10px', color:'#9C9486' }}>平均 {avg}日</span>
                                    </div>
                                    {entries.sort((a,b) => a.days - b.days).map((e,i) => (
                                      <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
                                        <span style={{ fontSize:'10px', color:'#8A8378', minWidth:'72px', textAlign:'right' }}>{e.name}</span>
                                        <div style={{ flex:1, background:'#F3F1EC', borderRadius:'3px', height:'10px' }}>
                                          <div style={{ width:`${(e.days/maxDays)*100}%`, background:color, borderRadius:'3px', height:'10px', minWidth:'3px' }} />
                                        </div>
                                        <span style={{ fontSize:'10px', color, fontWeight:700, minWidth:'36px' }}>{e.days}日</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── スタッフ管理 */}
        {tab === 'staff' && (
          <div style={{ maxWidth:'560px' }}>
            {canManage && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color:'#1F1C18' }}>スタッフを追加</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  <input value={newStaffName} onChange={e => setNewStaffName(e.target.value)} placeholder="名前（必須）" style={{ padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                  <input value={newStaffCohort} onChange={e => setNewStaffCohort(e.target.value)} placeholder="入社年度（例：2024年入社）" style={{ padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                  <div>
                    <div style={{ fontSize:'11px', color:'#8A8378', marginBottom:'4px' }}>入社日</div>
                    <input type="date" value={newStaffDate} onChange={e => setNewStaffDate(e.target.value)} style={{ padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px', width:'100%', boxSizing:'border-box' }} />
                  </div>
                  <button onClick={addStaff} style={{ padding:'10px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>追加</button>
                </div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {data.staff.length === 0 && <div style={{ textAlign:'center', padding:'40px 0', color:'#B0A99A', fontSize:'13px' }}>スタッフがまだいません</div>}
              {cohorts.map(cohort => {
                const members = data.staff.filter(s => s.cohort === cohort);
                const color = cohortColor(cohorts, cohort);
                return (
                  <div key={cohort}>
                    <div style={{ fontSize:'11px', fontWeight:700, color, marginBottom:'6px', display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:color }} />{cohort}
                    </div>
                    {members.map(s => (
                      <div key={s.id} style={{ background:'#FFFFFF', borderRadius:'10px', border: editingStaffId===s.id ? '1px solid #4361EE' : '1px solid #EEE9DE', marginBottom:'6px', overflow:'hidden' }}>
                        {editingStaffId === s.id ? (
                          <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:'8px' }}>
                            <input value={editStaffName} onChange={e => setEditStaffName(e.target.value)} placeholder="名前" style={{ padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                            <input value={editStaffCohort} onChange={e => setEditStaffCohort(e.target.value)} placeholder="入社年度" style={{ padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                            <input type="date" value={editStaffDate} onChange={e => setEditStaffDate(e.target.value)} style={{ padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2DCCC', fontSize:'13px', width:'100%', boxSizing:'border-box' }} />
                            <div style={{ display:'flex', gap:'8px' }}>
                              <button onClick={saveEditStaff} style={{ flex:1, padding:'8px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>保存</button>
                              <button onClick={() => setEditingStaffId(null)} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'13px', cursor:'pointer' }}>キャンセル</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px' }}>
                            <div style={{ flex:1, cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && startEditStaff(s)}>
                              <div style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{s.name}</div>
                              <div style={{ fontSize:'11px', color:'#B0A99A' }}>
                                入社日：{s.joinDate ? fmtDate(s.joinDate) : '未登録'}
                                {canManage && <span style={{ marginLeft:'6px', color:'#C9C2B2', fontSize:'10px' }}>タップで編集</span>}
                              </div>
                            </div>
                            {canManage && <button onClick={() => removeStaff(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#C2A98E', padding:'4px' }}><Trash2 size={14} /></button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {data.staff.filter(s => !s.cohort || s.cohort === '未設定').map(s => (
                <div key={s.id} style={{ background:'#FFFFFF', borderRadius:'10px', border: editingStaffId===s.id ? '1px solid #4361EE' : '1px solid #EEE9DE', marginBottom:'6px', overflow:'hidden' }}>
                  {editingStaffId === s.id ? (
                    <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:'8px' }}>
                      <input value={editStaffName} onChange={e => setEditStaffName(e.target.value)} placeholder="名前" style={{ padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                      <input value={editStaffCohort} onChange={e => setEditStaffCohort(e.target.value)} placeholder="入社年度" style={{ padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                      <input type="date" value={editStaffDate} onChange={e => setEditStaffDate(e.target.value)} style={{ padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2DCCC', fontSize:'13px', width:'100%', boxSizing:'border-box' }} />
                      <div style={{ display:'flex', gap:'8px' }}>
                        <button onClick={saveEditStaff} style={{ flex:1, padding:'8px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>保存</button>
                        <button onClick={() => setEditingStaffId(null)} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'13px', cursor:'pointer' }}>キャンセル</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px' }}>
                      <div style={{ flex:1, cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && startEditStaff(s)}>
                        <div style={{ fontSize:'13px', fontWeight:700, color:'#1F1C18' }}>{s.name}</div>
                        <div style={{ fontSize:'11px', color:'#B0A99A' }}>
                          {s.cohort || '未設定'}・入社日：{s.joinDate ? fmtDate(s.joinDate) : '未登録'}
                          {canManage && <span style={{ marginLeft:'6px', color:'#C9C2B2', fontSize:'10px' }}>タップで編集</span>}
                        </div>
                      </div>
                      {canManage && <button onClick={() => removeStaff(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#C2A98E', padding:'4px' }}><Trash2 size={14} /></button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── カリキュラム管理 */}
        {tab === 'curriculum' && (
          <div style={{ maxWidth:'560px' }}>
            {canManage && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'4px', color:'#1F1C18' }}>CSVから一括インポート</div>
                <div style={{ fontSize:'11px', color:'#9C9486', marginBottom:'12px', lineHeight:1.6 }}>
                  ファイル名が入社年度として設定されます（例：2024年入社.csv）<br/>
                  フォーマット：1行目に「空欄,スタッフA,スタッフB…」、2行目以降に「カリキュラム名,合格日…」
                </div>
                <div onClick={() => csvInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleCSVFile(e.dataTransfer.files[0]); }}
                  style={{ border:'2px dashed #C9C2B2', borderRadius:'10px', padding:'20px', textAlign:'center', cursor:'pointer', background:'#FAF8F4', marginBottom:'12px' }}>
                  <Upload size={20} style={{ color:'#B0A99A', marginBottom:'6px' }} />
                  <div style={{ fontSize:'12px', color:'#8A8378', fontWeight:600 }}>{csvFileName || 'CSVファイルをクリックまたはドラッグ＆ドロップ'}</div>
                  <input ref={csvInputRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => handleCSVFile(e.target.files[0])} />
                </div>
                {csvError && <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#E63946', marginBottom:'10px' }}><AlertCircle size={14}/>{csvError}</div>}
                {csvPreview && (
                  <div style={{ background:'#FAF8F4', borderRadius:'8px', padding:'12px', marginBottom:'12px' }}>
                    <div style={{ fontSize:'12px', fontWeight:700, color:'#2B2823', marginBottom:'8px' }}>インポート内容の確認</div>
                    <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'4px' }}>✓ 入社年度：<b>{csvPreview.cohort}</b></div>
                    {csvPreview.joinDateFromCSV && <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'4px' }}>✓ 入社日：<b>{fmtDate(csvPreview.joinDateFromCSV)}</b>（全員）</div>}
                    <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'4px' }}>✓ スタッフ：{csvPreview.staffNames.length}人</div>
                    <div style={{ fontSize:'12px', color:'#4A6B5A', marginBottom:'10px' }}>✓ カリキュラム：{csvPreview.curriculaNames.length}項目</div>
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button onClick={importCSV} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}><CheckCircle size={14}/>インポート実行</button>
                      <button onClick={() => { setCsvPreview(null); setCsvFileName(''); }} style={{ padding:'9px 14px', borderRadius:'8px', border:'1px solid #E2DCCC', background:'#FFFFFF', color:'#8A8378', fontSize:'13px', cursor:'pointer' }}>キャンセル</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {canManage && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color:'#1F1C18' }}>カリキュラムを手動追加</div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input value={newCurrName} onChange={e => setNewCurrName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCurr()}
                    placeholder="例：シャンプー合格" style={{ flex:1, padding:'9px 12px', borderRadius:'8px', border:'1px solid #E2DCCC', fontSize:'13px' }} />
                  <button onClick={addCurr} style={{ padding:'9px 14px', borderRadius:'8px', border:'none', background:'#2B2823', color:'#FAF8F4', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>追加</button>
                </div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {data.curricula.length === 0 && <div style={{ textAlign:'center', padding:'40px 0', color:'#B0A99A', fontSize:'13px' }}>カリキュラムがまだありません</div>}
              {data.curricula.map((c, i) => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#FFFFFF', borderRadius:'10px', border:'1px solid #EEE9DE' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', flex:1 }}>
                    <span style={{ fontSize:'11px', color:'#B0A99A', fontWeight:700, minWidth:'22px' }}>{i+1}</span>
                    <span style={{ fontSize:'13px', fontWeight:600, color:'#1F1C18' }}>{c.name}</span>
                  </div>
                  {canManage && (
                    <div style={{ display:'flex', gap:'2px', alignItems:'center' }}>
                      <button onClick={() => moveCurr(c.id, -1)} disabled={i === 0}
                        style={{ fontSize:'13px', padding:'2px 7px', borderRadius:'6px', border:'1px solid #E2DCCC', background: i===0 ? '#F5F5F5' : '#FFFFFF', color: i===0 ? '#D0CCC4' : '#8A8378', cursor: i===0 ? 'default' : 'pointer' }}>↑</button>
                      <button onClick={() => moveCurr(c.id, 1)} disabled={i === data.curricula.length-1}
                        style={{ fontSize:'13px', padding:'2px 7px', borderRadius:'6px', border:'1px solid #E2DCCC', background: i===data.curricula.length-1 ? '#F5F5F5' : '#FFFFFF', color: i===data.curricula.length-1 ? '#D0CCC4' : '#8A8378', cursor: i===data.curricula.length-1 ? 'default' : 'pointer' }}>↓</button>
                      <button onClick={() => removeCurr(c.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#C2A98E', padding:'4px', marginLeft:'4px' }}><Trash2 size={14}/></button>
                    </div>
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
// redeploy
