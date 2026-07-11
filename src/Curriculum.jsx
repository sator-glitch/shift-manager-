import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X, ChevronLeft, ChevronRight, Users, BookOpen, BarChart2 } from 'lucide-react';

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

// ─── カラーパレット（コホート別） ────────────────────────────────
const COHORT_COLORS = [
  '#4361EE','#E63946','#2A9D8F','#F4A300',
  '#9D4EDD','#06A77D','#EF476F','#118AB2',
];
function cohortColor(cohorts, cohort) {
  const idx = cohorts.indexOf(cohort);
  return COHORT_COLORS[idx >= 0 ? idx % COHORT_COLORS.length : 0];
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function CurriculumApp() {
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

  // ────────────────────────────────────────────────────────────────
  // パスワード読み込み
  // ────────────────────────────────────────────────────────────────
  useEffect(() => {
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
  }, []);

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
  // フィルタリング済みスタッフ
  // ────────────────────────────────────────────────────────────────
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

      {/* ヘッダー */}
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

            {data.curricula.length === 0 || displayedStaff.length === 0 ? (
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
                            const date = rec[c.id];
                            return (
                              <td key={c.id} style={{ padding:'8px 10px', borderBottom:'1px solid #F0EDE6', textAlign:'center' }}>
                                {canEdit ? (
                                  <input
                                    type="date" value={date || ''}
                                    onChange={e => setRecord(s.id, c.id, e.target.value || undefined)}
                                    style={{ fontSize:'11px', padding:'4px 6px', borderRadius:'6px', border: date ? `1px solid ${color}` : '1px solid #E2DCCC', background: date ? `${color}18` : '#FFFFFF', color:'#2B2823', width:'120px' }}
                                  />
                                ) : (
                                  date
                                    ? <span style={{ fontSize:'12px', color:color, fontWeight:700 }}>{fmtDate(date)}</span>
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
          <div style={{ maxWidth:'480px' }}>
            {canEdit && (
              <div style={{ background:'#FFFFFF', borderRadius:'12px', padding:'16px', border:'1px solid #EEE9DE', marginBottom:'20px' }}>
                <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color:'#1F1C18' }}>カリキュラムを追加</div>
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
