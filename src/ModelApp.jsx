import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Plus, Trash2, Lock, BarChart2, Users, Calendar, X, GripVertical } from 'lucide-react';

// ===========================================================================
// モデル実績管理
//
// アシスタントが営業後にやったモデルを、本人が記録する。
//   ・1モデル＝1件。同じ人が2回来たら2件（延べ回数）
//   ・メニューは複数選べる。材料費はメニューごとに決まっていて自動で合算
//   ・本人は自分のページだけ。いつでも直せる
//   ・管理者は閲覧と集計だけ（記録は編集しない）。毎月のランキングは「やった人数」順
//
// 入り口は名前＋自分で決めた4桁の暗証番号。URLは1本で済む。
// 暗証番号は平文では持たず、名前と混ぜたハッシュだけを保存する。
// ===========================================================================

const MENUS_KEY    = 'model_menus_v1';
const MEMBERS_KEY  = 'model_members_v1';
const RECORDS_KEY  = 'model_records_v1';
const SIGNUP_PW_KEY = 'model_signup_pw_v1';   // 登録するときの合言葉
const ADMIN_PW_KEY  = 'model_admin_pw_v1';    // 管理者
const CURRICULUM_KEY = 'curriculum_v2';
const LOCAL_ME = 'model_app_me';

const TARGET_COHORTS = ['2025年入社', '2026年入社'];

const C = {
  bg:'#F7F4EE', card:'#FFFFFF', line:'#E5DCC8', text:'#1F1C18', mute:'#9C9486',
  ok:'#2A9D8F', okBg:'#EAF1ED', ng:'#E63946', ngBg:'#FBEAEC', soft:'#EFEAE0', gold:'#C9A227',
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function pad2(n) { return String(n).padStart(2, '0'); }
function today() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function thisMonth() { return today().slice(0, 7); }
function fmtDate(ds) { if (!ds) return '―'; const [y,m,d] = ds.split('-'); return `${y}/${m}/${d}`; }
function fmtMonth(ym) { if (!ym) return '―'; const [y,m] = ym.split('-'); return `${y}年${Number(m)}月`; }
function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

// 暗証番号はそのまま持たない。名前と混ぜた値だけ保存する（総当たりには弱いので、
// 守っているのは「他人のページを覗かれない」程度。扱うのは材料費の記録だけ）
function hashPin(name, pin) {
  const s = 'nora-model|' + name + '|' + pin;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  let g = 52711;
  for (let i = s.length - 1; i >= 0; i--) g = ((g << 5) + g + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '-' + g.toString(36);
}

// 月の選択肢（記録のある月＋今月）
function monthsOf(records) {
  const set = new Set(Object.values(records || {}).map(r => (r.date || '').slice(0, 7)).filter(Boolean));
  set.add(thisMonth());
  return [...set].sort().reverse();
}

export default function ModelApp() {
  const [menus, setMenus]     = useState([]);
  const [members, setMembers] = useState([]);
  const [records, setRecords] = useState({});
  const [signupPw, setSignupPw] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [meId, setMeId]       = useState(() => { try { return localStorage.getItem(LOCAL_ME) || ''; } catch (e) { return ''; } });
  const [view, setView]       = useState('home');   // home | me | admin

  useEffect(() => { (async () => {
    try { const r = await window.storage.get(MENUS_KEY); setMenus(JSON.parse(r.value) || []); } catch (e) {}
    try { const r = await window.storage.get(RECORDS_KEY); setRecords(JSON.parse(r.value) || {}); } catch (e) {}
    try { const r = await window.storage.get(SIGNUP_PW_KEY); setSignupPw(r.value || ''); } catch (e) {}
    try { const r = await window.storage.get(ADMIN_PW_KEY);  setAdminPw(r.value || ''); } catch (e) {}
    let ms = null;
    try { const r = await window.storage.get(MEMBERS_KEY); ms = JSON.parse(r.value); } catch (e) {}
    if (!Array.isArray(ms) || ms.length === 0) {
      ms = await seedMembers();
      if (ms) { try { await window.storage.set(MEMBERS_KEY, JSON.stringify(ms)); } catch (e) {} }
    }
    setMembers(ms || []);
    setLoading(false);
  })(); }, []);

  // 名簿はカリキュラムの2025・2026年入社から作る
  async function seedMembers() {
    try {
      const r = await window.storage.get(CURRICULUM_KEY);
      const cur = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      return (cur.staff || [])
        .filter(s => !s.retired && TARGET_COHORTS.indexOf(s.cohort) >= 0)
        .map(s => ({ id: s.id, name: s.name, cohort: s.cohort, store: s.store || '', pin: null }));
    } catch (e) { setErr('カリキュラムから名簿を取り込めませんでした'); return null; }
  }

  // 記録は1件ずつマージして保存する（同時に入れても消し合わない）
  const saveRecord = useCallback(async (rec) => {
    setSaving(true);
    try {
      let remote = {};
      try { const r = await window.storage.get(RECORDS_KEY); remote = JSON.parse(r.value) || {}; } catch (e) {}
      const next = { ...remote, [rec.id]: rec };
      await window.storage.set(RECORDS_KEY, JSON.stringify(next));
      setRecords(next);
    } catch (e) { setErr('保存できませんでした。通信を確かめてもう一度お試しください'); }
    setSaving(false);
  }, []);

  const removeRecord = useCallback(async (id) => {
    setSaving(true);
    try {
      let remote = {};
      try { const r = await window.storage.get(RECORDS_KEY); remote = JSON.parse(r.value) || {}; } catch (e) {}
      const next = { ...remote }; delete next[id];
      await window.storage.set(RECORDS_KEY, JSON.stringify(next));
      setRecords(next);
    } catch (e) { setErr('削除できませんでした'); }
    setSaving(false);
  }, []);

  const saveMembers = useCallback(async (next) => {
    setSaving(true);
    try { await window.storage.set(MEMBERS_KEY, JSON.stringify(next)); setMembers(next); }
    catch (e) { setErr('名簿を保存できませんでした'); }
    setSaving(false);
  }, []);

  const saveMenus = useCallback(async (next) => {
    setSaving(true);
    try { await window.storage.set(MENUS_KEY, JSON.stringify(next)); setMenus(next); }
    catch (e) { setErr('メニューを保存できませんでした'); }
    setSaving(false);
  }, []);

  const me = members.find(m => m.id === meId) || null;
  function signIn(id) { setMeId(id); try { localStorage.setItem(LOCAL_ME, id); } catch (e) {} setView('me'); }
  function signOut() { setMeId(''); try { localStorage.removeItem(LOCAL_ME); } catch (e) {} setView('home'); }

  if (loading) return <Shell><div style={{ padding:'40px', textAlign:'center', color:C.mute }}>読み込み中…</div></Shell>;

  return (
    <Shell>
      {err && (
        <div style={{ marginBottom:'14px', padding:'10px 14px', borderRadius:'10px', background:C.ngBg, color:C.ng, fontSize:'12px' }}>
          {err} <button onClick={() => setErr('')} style={{ marginLeft:'8px', background:'none', border:'none', color:C.ng, cursor:'pointer', textDecoration:'underline' }}>閉じる</button>
        </div>
      )}

      {view === 'home' && (
        <HomeView members={members} me={me} signupPw={signupPw}
          onSignIn={signIn} onSaveMembers={saveMembers} onAdmin={() => setView('admin')} />
      )}

      {view === 'me' && me && (
        <MeView me={me} menus={menus} records={records} saving={saving}
          onSave={saveRecord} onRemove={removeRecord} onBack={() => setView('home')} onSignOut={signOut} />
      )}

      {view === 'admin' && (
        <AdminView members={members} menus={menus} records={records} adminPw={adminPw} saving={saving}
          onSaveMenus={saveMenus} onSaveMembers={saveMembers}
          onSavePasswords={async (signup, admin) => {
            try {
              await window.storage.set(SIGNUP_PW_KEY, signup);
              await window.storage.set(ADMIN_PW_KEY, admin);
              setSignupPw(signup); setAdminPw(admin);
              return true;
            } catch (e) { setErr('パスワードを保存できませんでした'); return false; }
          }}
          signupPw={signupPw}
          onSeed={async () => { const ms = await seedMembers(); if (!ms) return { added: 0 };
            const have = new Set(members.map(m => m.id));
            const add = ms.filter(m => !have.has(m.id));
            if (add.length) await saveMembers([...members, ...add]);
            return { added: add.length, names: add.map(a => a.name) }; }}
          onBack={() => setView('home')} />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight:'100vh', background:C.bg, padding:'20px 14px 60px' }}>
      <div style={{ maxWidth:'820px', margin:'0 auto' }}>{children}</div>
    </div>
  );
}

// ─── 入り口（名前を選んで暗証番号）─────────────────────────────
function HomeView({ members, me, signupPw, onSignIn, onSaveMembers, onAdmin }) {
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [word, setWord] = useState('');
  const [msg, setMsg] = useState('');

  const cohorts = [...new Set(members.map(m => m.cohort))].sort();
  const target = picked ? members.find(m => m.id === picked) : null;
  const isNew = target && !target.pin;

  function reset() { setPicked(null); setPin(''); setPin2(''); setWord(''); setMsg(''); }

  async function go() {
    if (!target) return;
    if (!/^\d{4}$/.test(pin)) { setMsg('暗証番号は4桁の数字です'); return; }
    if (isNew) {
      if (signupPw && word.trim() !== signupPw) { setMsg('合言葉が違います'); return; }
      if (pin !== pin2) { setMsg('2回入れた暗証番号が違います'); return; }
      await onSaveMembers(members.map(m => m.id === target.id ? { ...m, pin: hashPin(m.name, pin) } : m));
      onSignIn(target.id);
    } else {
      if (target.pin !== hashPin(target.name, pin)) { setMsg('暗証番号が違います'); return; }
      onSignIn(target.id);
    }
  }

  const inp = { width:'100%', padding:'12px 14px', borderRadius:'10px', border:`1px solid ${C.line}`,
    fontSize:'16px', boxSizing:'border-box', textAlign:'center', letterSpacing:'0.3em', fontFamily:'inherit' };

  return (
    <>
      <h1 style={{ fontSize:'21px', fontWeight:700, margin:'0 0 4px', color:C.text, letterSpacing:'0.02em' }}>モデル実績</h1>
      <div style={{ fontSize:'13px', color:C.mute, marginBottom:'22px' }}>営業後にやったモデルを記録します</div>

      {me && (
        <button onClick={() => onSignIn(me.id)}
          style={{ width:'100%', textAlign:'left', padding:'16px 18px', borderRadius:'14px', border:'none', background:C.text, color:'#FFF', cursor:'pointer', marginBottom:'14px' }}>
          <div style={{ fontSize:'11px', opacity:0.75, marginBottom:'3px' }}>前回のつづき</div>
          <div style={{ fontSize:'16px', fontWeight:700 }}>{me.name} さんのページを開く</div>
        </button>
      )}

      {!picked ? (
        <>
          <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'8px' }}>
            {me ? '別の人として入る' : '自分の名前を選んでください'}
          </div>
          {cohorts.map(c => (
            <div key={c} style={{ marginBottom:'14px' }}>
              <div style={{ fontSize:'11px', color:C.mute, fontWeight:700, marginBottom:'6px' }}>{c}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                {members.filter(m => m.cohort === c).map(m => (
                  <button key={m.id} onClick={() => { reset(); setPicked(m.id); }}
                    style={{ padding:'9px 14px', borderRadius:'10px', border:`1px solid ${C.line}`,
                      background:C.card, color:C.text, fontSize:'13px', cursor:'pointer',
                      fontWeight: m.pin ? 600 : 500 }}>
                    {m.name}
                    {!m.pin && <span style={{ fontSize:'10px', color:C.mute, marginLeft:'5px' }}>未登録</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={onAdmin}
            style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'10px', padding:'10px 16px', borderRadius:'10px', border:`1px solid ${C.line}`, background:C.card, color:C.mute, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            <Lock size={13} /> 管理者
          </button>
        </>
      ) : (
        <div style={{ maxWidth:'340px', margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontSize:'17px', fontWeight:700, color:C.text, marginBottom:'4px' }}>{target.name} さん</div>
          <div style={{ fontSize:'12px', color:C.mute, marginBottom:'18px', lineHeight:1.8 }}>
            {isNew
              ? <>はじめてなので、<b style={{ color:C.text }}>自分で4桁の暗証番号</b>を決めてください。<br />次から同じ番号で入ります。</>
              : <>暗証番号を入れてください。</>}
          </div>

          {isNew && signupPw && (
            <input value={word} onChange={e => { setWord(e.target.value); setMsg(''); }}
              placeholder="合言葉" style={{ ...inp, letterSpacing:'normal', marginBottom:'10px' }} />
          )}
          <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setMsg(''); }}
            onKeyDown={e => e.key === 'Enter' && !isNew && go()}
            placeholder="••••" style={inp} />
          {isNew && (
            <input type="password" inputMode="numeric" maxLength={4} value={pin2}
              onChange={e => { setPin2(e.target.value.replace(/\D/g, '')); setMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && go()}
              placeholder="もう一度" style={{ ...inp, marginTop:'10px' }} />
          )}
          {msg && <div style={{ fontSize:'12px', color:C.ng, marginTop:'8px' }}>{msg}</div>}
          <button onClick={go}
            style={{ width:'100%', marginTop:'12px', padding:'13px', borderRadius:'10px', border:'none', background:C.text, color:'#FFF', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
            {isNew ? '登録して始める' : '開く'}
          </button>
          <button onClick={reset} style={{ marginTop:'10px', background:'none', border:'none', color:C.mute, fontSize:'12px', cursor:'pointer', textDecoration:'underline' }}>
            名前を選び直す
          </button>
          {!isNew && (
            <div style={{ fontSize:'11px', color:C.mute, marginTop:'14px', lineHeight:1.7 }}>
              忘れたときは管理者に言ってください。いったん解除すれば、もう一度決め直せます。
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── 本人のページ ───────────────────────────────────────────────
function MeView({ me, menus, records, saving, onSave, onRemove, onBack, onSignOut }) {
  const [ym, setYm] = useState(thisMonth());
  const [editing, setEditing] = useState(null);   // 入力中の記録

  const mine = useMemo(() => Object.values(records)
    .filter(r => r.memberId === me.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')), [records, me.id]);
  const months = monthsOf(Object.fromEntries(mine.map(r => [r.id, r])));
  const list = mine.filter(r => (r.date || '').startsWith(ym));
  const cost = list.reduce((n, r) => n + (r.cost || 0), 0);
  const menuById = Object.fromEntries(menus.map(m => [m.id, m]));

  function startNew() { setEditing({ id: uid(), memberId: me.id, date: today(), menuIds: [], cost: 0, createdAt: new Date().toISOString() }); }

  return (
    <>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', marginBottom:'16px' }}>
        <div>
          <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, background:'none', border:'none', padding:0, cursor:'pointer', marginBottom:'4px' }}>
            <ChevronLeft size={12} /> 入り口に戻る
          </button>
          <h1 style={{ fontSize:'20px', fontWeight:700, margin:0, color:C.text }}>{me.name} さん</h1>
          <div style={{ fontSize:'12px', color:C.mute, marginTop:'2px' }}>{saving ? '保存中…' : 'モデル実績'}</div>
        </div>
        {!editing && (
          <button onClick={startNew}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'11px 18px', borderRadius:'10px', border:'none', background:C.text, color:'#FFF', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>
            <Plus size={15} /> モデルを記録する
          </button>
        )}
      </div>

      {editing ? (
        <RecordForm rec={editing} menus={menus} saving={saving}
          onCancel={() => setEditing(null)}
          onSave={async r => { await onSave(r); setEditing(null); setYm((r.date || '').slice(0, 7)); }} />
      ) : (<>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px', flexWrap:'wrap' }}>
          <select value={ym} onChange={e => setYm(e.target.value)} style={selStyle}>
            {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>

        <div style={{ display:'flex', gap:'8px', marginBottom:'14px' }}>
          <Stat label="やった人数" value={list.length + '人'} big />
          <Stat label="材料費の合計" value={yen(cost)} />
        </div>

        {list.length === 0 ? (
          <div style={{ padding:'44px 20px', textAlign:'center', color:C.mute, background:C.card, borderRadius:'12px', border:`1px solid ${C.line}` }}>
            <Calendar size={24} style={{ opacity:0.4, marginBottom:'8px' }} />
            <div style={{ fontSize:'13px' }}>{fmtMonth(ym)}の記録はまだありません</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {list.map(r => (
              <div key={r.id} style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'11px', padding:'12px 14px', display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'13px', fontWeight:700, color:C.text }}>{fmtDate(r.date)}</div>
                  <div style={{ fontSize:'12px', color:C.mute, marginTop:'4px', lineHeight:1.6 }}>
                    {(r.menuIds || []).length === 0 ? 'メニューなし'
                      : (r.menuIds || []).map(id => (menuById[id] || {}).name || '（削除されたメニュー）').join('／')}
                  </div>
                </div>
                <div style={{ fontSize:'13px', fontWeight:700, color:C.text, whiteSpace:'nowrap' }}>{yen(r.cost)}</div>
                <button onClick={() => setEditing(r)} title="直す"
                  style={{ flexShrink:0, padding:'7px 12px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.text, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                  直す
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onSignOut}
          style={{ marginTop:'26px', background:'none', border:'none', color:C.mute, fontSize:'11px', cursor:'pointer', textDecoration:'underline' }}>
          この端末から自分の情報を消す
        </button>
      </>)}
    </>
  );
}

function RecordForm({ rec, menus, saving, onCancel, onSave }) {
  const [date, setDate] = useState(rec.date || today());
  const [picked, setPicked] = useState(rec.menuIds || []);
  const cost = picked.reduce((n, id) => n + ((menus.find(m => m.id === id) || {}).cost || 0), 0);
  const byCat = [];
  menus.forEach(m => {
    const cat = m.category || 'メニュー';
    let g = byCat.find(x => x.cat === cat);
    if (!g) { g = { cat, items: [] }; byCat.push(g); }
    g.items.push(m);
  });

  function toggle(id) { setPicked(p => p.indexOf(id) >= 0 ? p.filter(x => x !== id) : [...p, id]); }

  return (
    <>
      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginBottom:'12px' }}>
        <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'6px' }}>やった日</label>
        <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}
          style={{ ...selStyle, width:'100%', boxSizing:'border-box' }} />
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginBottom:'12px' }}>
        <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'2px' }}>メニュー</div>
        <div style={{ fontSize:'11px', color:C.mute, marginBottom:'10px' }}>やったものを全部押してください。材料費は自動で足されます。</div>
        {menus.length === 0 ? (
          <div style={{ fontSize:'12px', color:C.ng, lineHeight:1.7 }}>
            メニューがまだ登録されていません。管理者に登録してもらってください。
          </div>
        ) : byCat.map(g => (
          <div key={g.cat} style={{ marginBottom:'10px' }}>
            <div style={{ fontSize:'11px', color:C.mute, fontWeight:700, marginBottom:'6px' }}>{g.cat}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {g.items.map(m => {
                const on = picked.indexOf(m.id) >= 0;
                return (
                  <button key={m.id} onClick={() => toggle(m.id)}
                    style={{ padding:'9px 13px', borderRadius:'10px', cursor:'pointer',
                      border: on ? 'none' : `1px solid ${C.line}`,
                      background: on ? C.text : '#FFF', color: on ? '#FFF' : C.text,
                      fontSize:'13px', fontWeight: on ? 700 : 500, textAlign:'left' }}>
                    {m.name}
                    <span style={{ fontSize:'10px', marginLeft:'7px', opacity:0.75 }}>{yen(m.cost)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:'11px', background:C.soft, marginBottom:'14px' }}>
        <span style={{ fontSize:'12px', color:C.mute, fontWeight:600 }}>材料費</span>
        <span style={{ fontSize:'18px', fontWeight:700, color:C.text }}>{yen(cost)}</span>
      </div>

      <div style={{ display:'flex', gap:'8px' }}>
        <button onClick={onCancel}
          style={{ padding:'12px 20px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.mute, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
          やめる
        </button>
        <button onClick={() => onSave({ ...rec, date, menuIds: picked, cost, updatedAt: new Date().toISOString() })}
          disabled={saving || picked.length === 0}
          style={{ flex:1, padding:'12px 20px', borderRadius:'10px', border:'none',
            background: picked.length === 0 ? '#D8D2C6' : C.text, color:'#FFF', fontSize:'13px', fontWeight:700,
            cursor: picked.length === 0 ? 'default' : 'pointer' }}>
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </>
  );
}

function Stat({ label, value, big }) {
  return (
    <div style={{ flex:'1 1 120px', padding:'12px 14px', borderRadius:'12px', background:C.card, border:`1px solid ${C.line}` }}>
      <div style={{ fontSize:'10px', color:C.mute, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize: big ? '22px' : '17px', fontWeight:700, color:C.text, marginTop:'3px' }}>{value}</div>
    </div>
  );
}
const selStyle = { padding:'10px 12px', borderRadius:'9px', border:`1px solid ${C.line}`, fontSize:'13px', background:'#FFF', color:C.text, fontFamily:'inherit' };

// ─── 管理者（閲覧と集計。記録は直さない）────────────────────────
function AdminView({ members, menus, records, adminPw, saving, onSaveMenus, onSaveMembers, onSavePasswords, signupPw, onSeed, onBack }) {
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem('model_admin') === '1'; } catch (e) { return false; } });
  const [pw, setPw] = useState('');
  const [tab, setTab] = useState('rank');   // rank | menus | members
  const [ym, setYm] = useState(thisMonth());

  if (!ok && adminPw) {
    return (
      <div style={{ maxWidth:'340px', margin:'36px auto', textAlign:'center' }}>
        <Lock size={22} color={C.mute} style={{ marginBottom:'10px' }} />
        <div style={{ fontSize:'15px', fontWeight:700, color:C.text, marginBottom:'16px' }}>管理者のパスワード</div>
        <input type="password" value={pw} autoFocus onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && pw === adminPw) { setOk(true); try { sessionStorage.setItem('model_admin','1'); } catch (x) {} } }}
          style={{ width:'100%', padding:'12px 14px', borderRadius:'10px', border:`1px solid ${C.line}`, fontSize:'14px', boxSizing:'border-box', textAlign:'center' }} />
        <button onClick={() => { if (pw === adminPw) { setOk(true); try { sessionStorage.setItem('model_admin','1'); } catch (x) {} } else alert('パスワードが違います'); }}
          style={{ width:'100%', marginTop:'12px', padding:'12px', borderRadius:'10px', border:'none', background:C.text, color:'#FFF', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>開く</button>
        <button onClick={onBack} style={{ marginTop:'10px', background:'none', border:'none', color:C.mute, fontSize:'12px', cursor:'pointer', textDecoration:'underline' }}>戻る</button>
      </div>
    );
  }

  const months = monthsOf(records);
  const inMonth = Object.values(records).filter(r => (r.date || '').startsWith(ym));
  const byMember = {};
  inMonth.forEach(r => {
    const x = byMember[r.memberId] || (byMember[r.memberId] = { n: 0, cost: 0 });
    x.n += 1; x.cost += (r.cost || 0);
  });
  const rank = members.map(m => ({ ...m, ...(byMember[m.id] || { n: 0, cost: 0 }) }))
    .sort((a, b) => b.n - a.n || b.cost - a.cost || a.name.localeCompare(b.name, 'ja'));
  const done = rank.filter(r => r.n > 0);
  const totalCost = inMonth.reduce((n, r) => n + (r.cost || 0), 0);

  // メニュー別
  const menuCount = {};
  inMonth.forEach(r => (r.menuIds || []).forEach(id => { menuCount[id] = (menuCount[id] || 0) + 1; }));
  const menuRows = menus.map(m => ({ ...m, n: menuCount[m.id] || 0 }))
    .sort((a, b) => b.n - a.n).filter(m => m.n > 0);

  const th = { padding:'8px 10px', fontSize:'11px', fontWeight:700, color:C.mute, textAlign:'left', whiteSpace:'nowrap' };
  const td = { padding:'8px 10px', fontSize:'12px', color:C.text, whiteSpace:'nowrap' };

  return (
    <>
      <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, background:'none', border:'none', padding:0, cursor:'pointer', marginBottom:'4px' }}>
        <ChevronLeft size={12} /> 入り口に戻る
      </button>
      <h1 style={{ fontSize:'20px', fontWeight:700, margin:'0 0 14px', color:C.text }}>管理者</h1>

      <div style={{ display:'flex', gap:'4px', background:C.soft, borderRadius:'10px', padding:'4px', marginBottom:'16px', width:'fit-content', flexWrap:'wrap' }}>
        {[{ k:'rank', l:'集計', i:BarChart2 }, { k:'menus', l:'メニューと材料費', i:Calendar }, { k:'members', l:'名簿', i:Users }].map(({ k, l, i:Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'8px', border:'none',
              background: tab === k ? '#FFF' : 'transparent', color: tab === k ? C.text : C.mute,
              fontWeight: tab === k ? 600 : 500, fontSize:'13px', cursor:'pointer' }}>
            <Icon size={14} /> {l}
          </button>
        ))}
      </div>

      {tab === 'rank' && (<>
        <select value={ym} onChange={e => setYm(e.target.value)} style={{ ...selStyle, marginBottom:'12px' }}>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>

        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'14px' }}>
          <Stat label="のべ人数" value={inMonth.length + '人'} big />
          <Stat label="やった人" value={done.length + '／' + members.length + '名'} />
          <Stat label="材料費の合計" value={yen(totalCost)} />
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'14px' }}>
          <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
            {fmtMonth(ym)}のランキング<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>やった人数順</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#FBF9F5' }}>
                <th style={th}>順位</th><th style={th}>名前</th><th style={th}>店舗</th>
                <th style={{ ...th, textAlign:'right' }}>人数</th><th style={{ ...th, textAlign:'right' }}>材料費</th>
              </tr></thead>
              <tbody>
                {done.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign:'center', color:C.mute, padding:'30px' }}>この月の記録はまだありません</td></tr>}
                {done.map((r, i) => (
                  <tr key={r.id} style={{ borderTop:'1px solid #F2EEE5' }}>
                    <td style={{ ...td, fontWeight:700, color: i < 3 ? C.gold : C.mute }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight:600 }}>{r.name}</td>
                    <td style={{ ...td, color:C.mute }}>{r.store || '―'}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{r.n}人</td>
                    <td style={{ ...td, textAlign:'right', color:C.mute }}>{yen(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rank.filter(r => r.n === 0).length > 0 && (
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.line}`, fontSize:'11px', color:C.mute, lineHeight:1.8 }}>
              この月に記録がない人 {rank.filter(r => r.n === 0).length}名：{rank.filter(r => r.n === 0).map(r => r.name).join('、')}
            </div>
          )}
        </div>

        {menuRows.length > 0 && (
          <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px' }}>
            <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'10px' }}>メニュー別</div>
            {menuRows.map(m => (
              <div key={m.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'5px 0', borderTop:'1px solid #F7F4EE' }}>
                <span>{m.name}</span>
                <span style={{ color:C.mute }}>{m.n}件　{yen(m.n * (m.cost || 0))}</span>
              </div>
            ))}
          </div>
        )}
      </>)}

      {tab === 'menus' && <MenuEditor menus={menus} onSave={onSaveMenus} saving={saving} />}

      {tab === 'members' && (
        <MemberAdmin members={members} records={records} onSave={onSaveMembers} onSeed={onSeed} saving={saving}
          signupPw={signupPw} adminPw={adminPw} onSavePasswords={onSavePasswords} />
      )}
    </>
  );
}

// ─── メニューと材料費 ───────────────────────────────────────────
function MenuEditor({ menus, onSave, saving }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(menus || [])));
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [cat, setCat] = useState('');
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(menus);

  function set(id, patch) { setDraft(d => d.map(m => m.id === id ? { ...m, ...patch } : m)); }
  function del(m) {
    if (!confirm(`「${m.name}」を消します。すでに記録に使われている分は、その記録に残った金額のままになります。よろしいですか。`)) return;
    setDraft(d => d.filter(x => x.id !== m.id));
  }
  function add() {
    const n = name.trim();
    if (!n) return;
    if (draft.some(m => m.name === n)) { alert('同じ名前のメニューがあります'); return; }
    setDraft(d => [...d, { id: uid(), name: n, cost: Number(cost) || 0, category: cat.trim() }]);
    setName(''); setCost('');
  }
  function dropOn(id) {
    if (!drag || drag === id) return;
    setDraft(d => { const a = [...d];
      const f = a.findIndex(m => m.id === drag); if (f < 0) return d;
      const [mv] = a.splice(f, 1);
      const t = a.findIndex(m => m.id === id);
      a.splice(t < 0 ? a.length : t, 0, mv); return a; });
  }
  const grip = { display:'flex', alignItems:'center', justifyContent:'center', width:'22px', flexShrink:0, color:'#C2BBA9', cursor:'grab' };

  return (
    <>
      <div style={{ fontSize:'12px', color:C.mute, lineHeight:1.8, marginBottom:'12px' }}>
        ここで登録したメニューが、本人の記録画面に出ます。材料費はメニューごとの固定額です。<br />
        並べ替えは左の <GripVertical size={12} style={{ verticalAlign:'-2px' }} /> をつかんでドラッグしてください。区分を入れるとまとまって表示されます。
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'14px' }}>
        <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
          メニュー<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>{draft.length}件</span>
        </div>
        {draft.length === 0 && (
          <div style={{ padding:'24px 14px', textAlign:'center', fontSize:'12px', color:C.mute }}>
            まだ1件もありません。下から足してください。
          </div>
        )}
        {draft.map(m => (
          <div key={m.id}
            draggable={drag === m.id}
            onDragOver={e => { e.preventDefault(); setOver(m.id); }}
            onDragLeave={() => setOver(o => o === m.id ? null : o)}
            onDrop={e => { e.preventDefault(); dropOn(m.id); setDrag(null); setOver(null); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            style={{ display:'flex', alignItems:'center', gap:'7px', padding:'7px 12px',
              borderTop: over === m.id ? `2px solid ${C.ok}` : '1px solid #F7F4EE',
              background: drag === m.id ? '#F3EFE6' : 'transparent' }}>
            <span style={grip} onMouseDown={() => setDrag(m.id)} onMouseUp={() => setDrag(null)} onDragStart={() => setDrag(m.id)}>
              <GripVertical size={15} />
            </span>
            <input value={m.category || ''} onChange={e => set(m.id, { category: e.target.value })} placeholder="区分"
              style={{ flex:'0 0 90px', minWidth:0, padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'12px' }} />
            <input value={m.name} onChange={e => set(m.id, { name: e.target.value })}
              style={{ flex:'1 1 100px', minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px' }} />
            <div style={{ display:'flex', alignItems:'center', gap:'3px', flexShrink:0 }}>
              <span style={{ fontSize:'12px', color:C.mute }}>¥</span>
              <input value={m.cost} inputMode="numeric" onChange={e => set(m.id, { cost: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                style={{ width:'74px', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px', textAlign:'right' }} />
            </div>
            <button onClick={() => del(m)} title="削除"
              style={{ flexShrink:0, width:'32px', height:'32px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'11px 12px', borderTop:`1px solid ${C.line}`, background:'#FBF9F5', flexWrap:'wrap' }}>
          <input value={cat} onChange={e => setCat(e.target.value)} placeholder="区分"
            style={{ flex:'0 0 90px', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'12px' }} />
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="メニュー名"
            style={{ flex:'1 1 110px', minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px' }} />
          <input value={cost} inputMode="numeric" onChange={e => setCost(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && add()} placeholder="材料費"
            style={{ width:'84px', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px', textAlign:'right' }} />
          <button onClick={add}
            style={{ flexShrink:0, display:'flex', alignItems:'center', gap:'4px', padding:'8px 14px', borderRadius:'8px', border:'none', background:C.text, color:'#FFF', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            <Plus size={13} /> 追加
          </button>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => onSave(draft)} onReset={() => setDraft(JSON.parse(JSON.stringify(menus)))} />
    </>
  );
}

// ─── 名簿とパスワード ───────────────────────────────────────────
function MemberAdmin({ members, records, onSave, onSeed, saving, signupPw, adminPw, onSavePasswords }) {
  const [impMsg, setImpMsg] = useState('');
  const [pw1, setPw1] = useState(signupPw || '');
  const [pw2, setPw2] = useState(adminPw || '');
  const [pwMsg, setPwMsg] = useState('');
  const used = {};
  Object.values(records || {}).forEach(r => { used[r.memberId] = (used[r.memberId] || 0) + 1; });

  function resetPin(m) {
    if (!confirm(`${m.name}さんの暗証番号を解除します。本人が次に開いたとき、新しい番号を決め直せます。`)) return;
    onSave(members.map(x => x.id === m.id ? { ...x, pin: null } : x));
  }
  function remove(m) {
    const n = used[m.id] || 0;
    if (!confirm(n > 0 ? `${m.name}さんを名簿から外します。記録${n}件はそのまま残ります。` : `${m.name}さんを名簿から外します。`)) return;
    onSave(members.filter(x => x.id !== m.id));
  }

  const cohorts = [...new Set(members.map(m => m.cohort))].sort();

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', marginBottom:'12px' }}>
        <button onClick={async () => { const r = await onSeed(); setImpMsg(r.added > 0 ? `${r.added}名を追加しました：${r.names.join('、')}` : '新しく追加する人はいませんでした'); }}
          style={{ display:'flex', alignItems:'center', gap:'5px', padding:'9px 16px', borderRadius:'9px', border:`1px solid ${C.line}`, background:'#FFF', color:C.text, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
          <Plus size={13} /> カリキュラムから取り込む（2025・2026年入社）
        </button>
        {impMsg && <span style={{ fontSize:'11px', color:C.mute }}>{impMsg}</span>}
      </div>

      {cohorts.map(c => (
        <div key={c} style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'12px' }}>
          <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
            {c}<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>{members.filter(m => m.cohort === c).length}名</span>
          </div>
          {members.filter(m => m.cohort === c).map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 14px', borderTop:'1px solid #F7F4EE' }}>
              <span style={{ flex:1, minWidth:0, fontSize:'13px', fontWeight:600 }}>{m.name}</span>
              <span style={{ fontSize:'11px', color:C.mute }}>{m.store || '―'}</span>
              <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'999px',
                background: m.pin ? C.okBg : C.soft, color: m.pin ? C.ok : C.mute }}>
                {m.pin ? '登録済' : '未登録'}
              </span>
              <span style={{ fontSize:'11px', color:C.mute, width:'46px', textAlign:'right' }}>{used[m.id] || 0}件</span>
              {m.pin && (
                <button onClick={() => resetPin(m)}
                  style={{ flexShrink:0, padding:'6px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.text, fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                  番号を解除
                </button>
              )}
              <button onClick={() => remove(m)} title="名簿から外す"
                style={{ flexShrink:0, width:'30px', height:'30px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ))}

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'10px' }}>
          <Lock size={13} /> パスワード
        </div>
        <div style={{ fontSize:'11px', color:C.mute, lineHeight:1.8, marginBottom:'10px' }}>
          合言葉は、はじめて登録するときに一度だけ聞きます。空欄にすると誰でも登録できます。<br />
          管理者のパスワードを空欄にすると、この画面が誰でも開けるようになります。
        </div>
        <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:C.mute, marginBottom:'8px' }}>登録の合言葉
          <input type="text" value={pw1} onChange={e => { setPw1(e.target.value); setPwMsg(''); }}
            style={{ ...selStyle, width:'100%', marginTop:'4px', boxSizing:'border-box' }} />
        </label>
        <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:C.mute, marginBottom:'10px' }}>管理者のパスワード
          <input type="text" value={pw2} onChange={e => { setPw2(e.target.value); setPwMsg(''); }}
            style={{ ...selStyle, width:'100%', marginTop:'4px', boxSizing:'border-box' }} />
        </label>
        <button onClick={async () => { const okk = await onSavePasswords(pw1.trim(), pw2.trim()); setPwMsg(okk ? '保存しました' : ''); }}
          style={{ padding:'9px 18px', borderRadius:'8px', border:'none', background:C.text, color:'#FFF', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
          パスワードを保存
        </button>
        {pwMsg && <span style={{ fontSize:'12px', color:C.ok, marginLeft:'10px' }}>{pwMsg}</span>}
      </div>
    </>
  );
}

function SaveBar({ dirty, saving, onSave, onReset }) {
  return (
    <div style={{ position:'sticky', bottom:'10px', display:'flex', gap:'8px', alignItems:'center' }}>
      <button onClick={onSave} disabled={!dirty || saving}
        style={{ flex:1, padding:'13px 20px', borderRadius:'10px', border:'none',
          background: dirty ? C.text : '#D8D2C6', color:'#FFF', fontSize:'13px', fontWeight:700,
          cursor: dirty ? 'pointer' : 'default' }}>
        {saving ? '保存中…' : dirty ? '変更を保存する' : '保存済み'}
      </button>
      {dirty && (
        <button onClick={onReset}
          style={{ padding:'13px 18px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.mute, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
          元に戻す
        </button>
      )}
    </div>
  );
}
