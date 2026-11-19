import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Plus, Trash2, Lock, BarChart2, Users, Calendar, X, GripVertical, Store } from 'lucide-react';

// ===========================================================================
// モデル実績管理
//
// アシスタントが営業後にやったモデルを、本人が記録する。
//   ・1モデル＝1件。同じ人が2回来たら2件（延べ回数）
//   ・メニューは複数選べる。材料費はメニューごとに決まっていて自動で合算
//   ・メニューと材料費は【店舗ごと】に別の表を持つ
//   ・本人は自分のページだけ。いつでも直せる
//   ・管理者は閲覧と集計だけ。毎月のランキングは「やった人数」順
//       総管理者 … 全店のデータ。店舗の追加やパスワードの設定もできる
//       店舗管理者 … 自分の店舗だけ
//
// 最初のページは店舗選択。その中にその店舗のスタッフが並ぶ。
// 本人は名前＋自分で決めた4桁のパスワード。番号は平文では持たない。
// ===========================================================================

const STORES_KEY   = 'model_stores_v1';     // [{name, pw, sameAs}] sameAs=メンバーを借りる店舗
const MENUS_KEY    = 'model_menus_v1';      // { 店舗名: [{id,name,cost,category}] }
const MEMBERS_KEY  = 'model_members_v1';    // [{id,name,cohort,store,pin}]
const RECORDS_KEY  = 'model_records_v1';    // { recId: {...} }
const MASTER_PW_KEY = 'model_master_pw_v1';
const CURRICULUM_KEY = 'curriculum_v2';
const LOCAL_ME = 'model_app_me';

const TARGET_COHORTS = ['2025年入社', '2026年入社'];
const DEFAULT_STORES = ['本店', 'Journey', 'SHIBUYA', 'GINZA', 'GINZA U', 'KICHIJOJI', 'KAMAKURA'];
// GINZA U は GINZA と同じメンバーを使う（メニューと集計は別）
const DEFAULT_SAME_AS = { 'GINZA U': 'GINZA' };

// その店舗のスタッフを返す。sameAs があれば借りてくる
function poolOf(stores, name) {
  const s = (stores || []).find(x => x.name === name);
  return (s && s.sameAs) ? s.sameAs : name;
}
const NO_STORE = '（店舗なし）';
const DEFAULT_PW = '1111';   // 店舗パスワード・総管理パスワードの初期値

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

// パスワードはそのまま持たない。名前と混ぜた値だけ保存する
function hashPin(name, pin) {
  const s = 'nora-model|' + name + '|' + pin;
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  let g = 52711; for (let i = s.length - 1; i >= 0; i--) g = ((g << 5) + g + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '-' + g.toString(36);
}
function monthsOf(records) {
  const set = new Set(Object.values(records || {}).map(r => (r.date || '').slice(0, 7)).filter(Boolean));
  set.add(thisMonth());
  return [...set].sort().reverse();
}
const selStyle = { padding:'10px 12px', borderRadius:'9px', border:`1px solid ${C.line}`, fontSize:'13px', background:'#FFF', color:C.text, fontFamily:'inherit' };

export default function ModelApp() {
  const [stores, setStores]   = useState([]);
  const [menus, setMenus]     = useState({});
  const [members, setMembers] = useState([]);
  const [records, setRecords] = useState({});
  const [masterPw, setMasterPw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [meId, setMeId]       = useState(() => { try { return localStorage.getItem(LOCAL_ME) || ''; } catch (e) { return ''; } });
  const [workStore, setWorkStore] = useState(() => { try { return localStorage.getItem(LOCAL_ME + '_store') || ''; } catch (e) { return ''; } });
  const [view, setView]       = useState({ name:'stores' });   // stores | staff | me | admin

  useEffect(() => { (async () => {
    try { const r = await window.storage.get(RECORDS_KEY); setRecords(JSON.parse(r.value) || {}); } catch (e) {}
    let mpw = null;
    try { const r = await window.storage.get(MASTER_PW_KEY); mpw = r.value; } catch (e) {}
    if (!mpw) { mpw = DEFAULT_PW; try { await window.storage.set(MASTER_PW_KEY, mpw); } catch (e) {} }
    setMasterPw(mpw);

    let mn = null;
    try { const r = await window.storage.get(MENUS_KEY); mn = JSON.parse(r.value); } catch (e) {}
    if (Array.isArray(mn)) mn = {};          // 旧形式（全店共通の配列）は作り直す
    setMenus(mn && typeof mn === 'object' ? mn : {});

    let ms = null;
    try { const r = await window.storage.get(MEMBERS_KEY); ms = JSON.parse(r.value); } catch (e) {}
    if (!Array.isArray(ms) || ms.length === 0) {
      ms = await seedMembers();
      if (ms) { try { await window.storage.set(MEMBERS_KEY, JSON.stringify(ms)); } catch (e) {} }
    }
    ms = ms || [];
    setMembers(ms);

    let st = null;
    try { const r = await window.storage.get(STORES_KEY); st = JSON.parse(r.value); } catch (e) {}
    if (Array.isArray(st)) { let fixed = false; st = st.map(x => { if (!x.pw) { fixed = true; return { ...x, pw: DEFAULT_PW }; } return x; });
      if (fixed) { try { await window.storage.set(STORES_KEY, JSON.stringify(st)); } catch (e) {} } }
    if (!Array.isArray(st) || st.length === 0) {
      const used = [...new Set(ms.map(m => m.store).filter(Boolean))];
      const names = [...new Set([...DEFAULT_STORES, ...used])];
      st = names.map(n => ({ name: n, pw: DEFAULT_PW, sameAs: DEFAULT_SAME_AS[n] || '' }));
      try { await window.storage.set(STORES_KEY, JSON.stringify(st)); } catch (e) {}
    }
    setStores(st);
    setLoading(false);
  })(); }, []);

  async function seedMembers() {
    try {
      const r = await window.storage.get(CURRICULUM_KEY);
      const cur = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      return (cur.staff || [])
        .filter(s => !s.retired && TARGET_COHORTS.indexOf(s.cohort) >= 0)
        .map(s => ({ id: s.id, name: s.name, cohort: s.cohort, store: s.store || '', pin: null }));
    } catch (e) { setErr('カリキュラムから名簿を取り込めませんでした'); return null; }
  }

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

  // メニューは店舗ごと。その店舗の分だけを読み直して差し替えるので、他店の編集を消さない
  const saveMenusFor = useCallback(async (store, list) => {
    setSaving(true);
    try {
      let remote = {};
      try { const r = await window.storage.get(MENUS_KEY); const v = JSON.parse(r.value); if (v && !Array.isArray(v)) remote = v; } catch (e) {}
      const next = { ...remote, [store]: list };
      await window.storage.set(MENUS_KEY, JSON.stringify(next));
      setMenus(next);
    } catch (e) { setErr('メニューを保存できませんでした'); }
    setSaving(false);
  }, []);

  const saveStores = useCallback(async (next) => {
    setSaving(true);
    try { await window.storage.set(STORES_KEY, JSON.stringify(next)); setStores(next); }
    catch (e) { setErr('店舗を保存できませんでした'); }
    setSaving(false);
  }, []);

  const me = members.find(m => m.id === meId) || null;
  function signIn(id, store) {
    setMeId(id); setWorkStore(store || '');
    try { localStorage.setItem(LOCAL_ME, id); localStorage.setItem(LOCAL_ME + '_store', store || ''); } catch (e) {}
    setView({ name:'me' });
  }
  function signOut() {
    setMeId(''); setWorkStore('');
    try { localStorage.removeItem(LOCAL_ME); localStorage.removeItem(LOCAL_ME + '_store'); } catch (e) {}
    setView({ name:'stores' });
  }

  if (loading) return <Shell><div style={{ padding:'40px', textAlign:'center', color:C.mute }}>読み込み中…</div></Shell>;

  return (
    <Shell>
      {err && (
        <div style={{ marginBottom:'14px', padding:'10px 14px', borderRadius:'10px', background:C.ngBg, color:C.ng, fontSize:'12px' }}>
          {err} <button onClick={() => setErr('')} style={{ marginLeft:'8px', background:'none', border:'none', color:C.ng, cursor:'pointer', textDecoration:'underline' }}>閉じる</button>
        </div>
      )}

      {view.name === 'stores' && (
        <StorePickView stores={stores} members={members} me={me}
          onPick={s => setView({ name:'staff', store:s })}
          workStore={workStore}
          onMe={() => signIn(me.id, workStore || me.store)}
          onAdmin={() => setView({ name:'masterGate' })} />
      )}

      {view.name === 'staff' && (
        <StaffPickView store={view.store} stores={stores} members={members}
          onSignIn={signIn} onSaveMembers={saveMembers} onBack={() => setView({ name:'stores' })}
          onStoreAdmin={() => setView({ name:'storeAdminGate', store: view.store })} />
      )}

      {view.name === 'me' && me && (
        <MeView me={me} workStore={workStore || me.store || ''} menus={menus[workStore || me.store] || []} records={records} saving={saving}
          onSave={saveRecord} onRemove={removeRecord}
          onBack={() => setView({ name:'stores' })} onSignOut={signOut} />
      )}

      {view.name === 'storeAdminGate' && (
        <PwGate title={`${view.store}の店舗管理`} note="この店舗の集計・メニュー・名簿を見ます"
          expected={(stores.find(s => s.name === view.store) || {}).pw || DEFAULT_PW}
          onOk={() => setView({ name:'storeAdmin', store: view.store })}
          onBack={() => setView({ name:'staff', store: view.store })} />
      )}

      {view.name === 'storeAdmin' && (
        <StoreAdminPage store={view.store} stores={stores} members={members} menus={menus} records={records}
          saving={saving} onSaveMenusFor={saveMenusFor} onSaveMembers={saveMembers} onSaveStores={saveStores}
          onBack={() => setView({ name:'staff', store: view.store })} />
      )}

      {view.name === 'masterGate' && (
        <PwGate title="総管理" note="全店の集計とランキング、パスワードの設定"
          expected={masterPw || DEFAULT_PW}
          onOk={() => setView({ name:'master' })}
          onBack={() => setView({ name:'stores' })} />
      )}

      {view.name === 'master' && (
        <MasterPage stores={stores} members={members} menus={menus} records={records} saving={saving}
          masterPw={masterPw}
          onSaveMembers={saveMembers} onSaveStores={saveStores}
          onSaveMasterPw={async (master) => {
            try { await window.storage.set(MASTER_PW_KEY, master); setMasterPw(master); return true; }
            catch (e) { setErr('パスワードを保存できませんでした'); return false; }
          }}
          onSeed={async () => { const ms = await seedMembers(); if (!ms) return { added: 0 };
            const have = new Set(members.map(m => m.id));
            const add = ms.filter(m => !have.has(m.id));
            if (add.length) await saveMembers([...members, ...add]);
            return { added: add.length, names: add.map(a => a.name) }; }}
          onBack={() => setView({ name:'stores' })} />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight:'100vh', background:C.bg, padding:'20px 14px 60px' }}>
      <div style={{ maxWidth:'860px', margin:'0 auto' }}>{children}</div>
    </div>
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

// ─── 最初のページ：店舗を選ぶ ───────────────────────────────────
function StorePickView({ stores, members, me, workStore, onPick, onMe, onAdmin }) {
  const countOf = s => members.filter(m => (m.store || '') === poolOf(stores, s)).length;
  const noStore = members.filter(m => !m.store);
  return (
    <>
      <h1 style={{ fontSize:'21px', fontWeight:700, margin:'0 0 4px', color:C.text, letterSpacing:'0.02em' }}>モデル実績</h1>
      <div style={{ fontSize:'13px', color:C.mute, marginBottom:'22px' }}>店舗を選んでください</div>

      {me && (
        <button onClick={onMe}
          style={{ width:'100%', textAlign:'left', padding:'16px 18px', borderRadius:'14px', border:'none', background:C.text, color:'#FFF', cursor:'pointer', marginBottom:'16px' }}>
          <div style={{ fontSize:'11px', opacity:0.75, marginBottom:'3px' }}>前回のつづき</div>
          <div style={{ fontSize:'16px', fontWeight:700 }}>{me.name} さんのページを開く</div>
          {workStore && <div style={{ fontSize:'11px', opacity:0.75, marginTop:'3px' }}>{workStore}</div>}
        </button>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:'10px', marginBottom:'16px' }}>
        {stores.map(s => (
          <button key={s.name} onClick={() => onPick(s.name)}
            style={{ textAlign:'left', padding:'16px 18px', borderRadius:'14px', border:`1px solid ${C.line}`, background:C.card, cursor:'pointer' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'15px', fontWeight:700, color:C.text }}>
              <Store size={14} color={C.mute} /> {s.name}
            </div>
            <div style={{ fontSize:'11px', color:C.mute, marginTop:'5px' }}>
              {countOf(s.name)}名{s.sameAs && <span style={{ marginLeft:'6px' }}>{s.sameAs}と同じ</span>}
            </div>
          </button>
        ))}
        {noStore.length > 0 && (
          <button onClick={() => onPick('')}
            style={{ textAlign:'left', padding:'16px 18px', borderRadius:'14px', border:`1px dashed ${C.line}`, background:'transparent', cursor:'pointer' }}>
            <div style={{ fontSize:'15px', fontWeight:700, color:C.mute }}>{NO_STORE}</div>
            <div style={{ fontSize:'11px', color:C.mute, marginTop:'5px' }}>{noStore.length}名</div>
          </button>
        )}
      </div>

      <button onClick={onAdmin}
        style={{ display:'flex', alignItems:'center', gap:'6px', padding:'10px 16px', borderRadius:'10px', border:`1px solid ${C.line}`, background:C.card, color:C.mute, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
        <Lock size={13} /> 総管理（全店の集計・ランキング・パスワード設定）
      </button>
    </>
  );
}

// ─── スタッフを選ぶ → パスワード ────────────────────────────────
function StaffPickView({ store, stores, members, onSignIn, onSaveMembers, onBack, onStoreAdmin }) {
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState('');

  const pool = poolOf(stores, store);
  const list = members.filter(m => (m.store || '') === pool);
  const cohorts = [...new Set(list.map(m => m.cohort))].sort();
  const target = picked ? members.find(m => m.id === picked) : null;
  const isNew = target && !target.pin;

  function reset() { setPicked(null); setPin(''); setPin2(''); setMsg(''); }

  async function go() {
    if (!target) return;
    if (!/^\d{4}$/.test(pin)) { setMsg('パスワードは4桁の数字です'); return; }
    if (isNew) {
      if (pin !== pin2) { setMsg('2回入れたパスワードが違います'); return; }
      await onSaveMembers(members.map(m => m.id === target.id ? { ...m, pin: hashPin(m.name, pin) } : m));
      onSignIn(target.id, store);
    } else {
      if (target.pin !== hashPin(target.name, pin)) { setMsg('パスワードが違います'); return; }
      onSignIn(target.id, store);
    }
  }

  const inp = { width:'100%', padding:'12px 14px', borderRadius:'10px', border:`1px solid ${C.line}`,
    fontSize:'16px', boxSizing:'border-box', textAlign:'center', letterSpacing:'0.3em', fontFamily:'inherit' };
  const lbl = { display:'block', fontSize:'12px', fontWeight:700, color:C.text, textAlign:'left', marginBottom:'5px' };

  return (
    <>
      <button onClick={picked ? reset : onBack}
        style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, background:'none', border:'none', padding:0, cursor:'pointer', marginBottom:'4px' }}>
        <ChevronLeft size={12} /> {picked ? '名前を選び直す' : '店舗を選び直す'}
      </button>
      <h1 style={{ fontSize:'20px', fontWeight:700, margin:'0 0 18px', color:C.text }}>{store || NO_STORE}</h1>

      {!picked ? (
        list.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:C.mute, background:C.card, borderRadius:'12px', border:`1px solid ${C.line}` }}>
            この店舗にはまだスタッフが登録されていません。
          </div>
        ) : cohorts.map(c => (
          <div key={c} style={{ marginBottom:'14px' }}>
            <div style={{ fontSize:'11px', color:C.mute, fontWeight:700, marginBottom:'6px' }}>{c}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {list.filter(m => m.cohort === c).map(m => (
                <button key={m.id} onClick={() => { reset(); setPicked(m.id); }}
                  style={{ padding:'10px 15px', borderRadius:'10px', border:`1px solid ${C.line}`,
                    background:C.card, color:C.text, fontSize:'13px', cursor:'pointer', fontWeight: m.pin ? 600 : 500 }}>
                  {m.name}
                  {!m.pin && <span style={{ fontSize:'10px', color:C.mute, marginLeft:'5px' }}>未登録</span>}
                </button>
              ))}
            </div>
          </div>
        )).concat([
          <button key="__admin__" onClick={onStoreAdmin}
            style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'16px', padding:'10px 16px', borderRadius:'10px', border:`1px solid ${C.line}`, background:C.card, color:C.mute, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            <Lock size={13} /> {store}の店舗管理
          </button>
        ])
      ) : (
        <div style={{ maxWidth:'340px', margin:'0 auto' }}>
          <div style={{ fontSize:'17px', fontWeight:700, color:C.text, marginBottom:'4px', textAlign:'center' }}>{target.name} さん</div>
          <div style={{ fontSize:'12px', color:C.mute, marginBottom:'18px', lineHeight:1.8, textAlign:'center' }}>
            {isNew
              ? <>はじめてなので、<b style={{ color:C.text }}>自分で4桁のパスワード</b>を決めてください。<br />次から同じ番号で入ります。</>
              : <>パスワードを入れてください。</>}
          </div>

          <div style={{ marginBottom:'12px' }}>
            <label style={lbl}>パスワード<span style={{ fontWeight:500, color:C.mute, marginLeft:'6px' }}>4桁の数字</span></label>
            <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && !isNew && go()} style={inp} />
          </div>

          {isNew && (
            <div style={{ marginBottom:'12px' }}>
              <label style={lbl}>パスワード再入力</label>
              <input type="password" inputMode="numeric" maxLength={4} value={pin2}
                onChange={e => { setPin2(e.target.value.replace(/\D/g, '')); setMsg(''); }}
                onKeyDown={e => e.key === 'Enter' && go()} style={inp} />
            </div>
          )}

          {msg && <div style={{ fontSize:'12px', color:C.ng, marginBottom:'8px', textAlign:'center' }}>{msg}</div>}
          <button onClick={go}
            style={{ width:'100%', padding:'13px', borderRadius:'10px', border:'none', background:C.text, color:'#FFF', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
            {isNew ? '登録して始める' : '開く'}
          </button>
          {!isNew && (
            <div style={{ fontSize:'11px', color:C.mute, marginTop:'14px', lineHeight:1.7, textAlign:'center' }}>
              忘れたときは管理者に言ってください。いったん解除すれば、もう一度決め直せます。
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── 本人のページ ───────────────────────────────────────────────
function MeView({ me, workStore, menus, records, saving, onSave, onRemove, onBack, onSignOut }) {
  const [ym, setYm] = useState(thisMonth());
  const [editing, setEditing] = useState(null);

  const mine = useMemo(() => Object.values(records)
    .filter(r => r.memberId === me.id && (!workStore || (r.store || '') === workStore))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')), [records, me.id]);
  const months = monthsOf(Object.fromEntries(mine.map(r => [r.id, r])));
  const list = mine.filter(r => (r.date || '').startsWith(ym));
  const cost = list.reduce((n, r) => n + (r.cost || 0), 0);
  const menuById = Object.fromEntries((menus || []).map(m => [m.id, m]));

  function startNew() {
    setEditing({ id: uid(), memberId: me.id, store: workStore || me.store || '', date: today(), menuIds: [], cost: 0, createdAt: new Date().toISOString() });
  }

  return (
    <>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', marginBottom:'16px' }}>
        <div>
          <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, background:'none', border:'none', padding:0, cursor:'pointer', marginBottom:'4px' }}>
            <ChevronLeft size={12} /> 店舗選択に戻る
          </button>
          <h1 style={{ fontSize:'20px', fontWeight:700, margin:0, color:C.text }}>{me.name} さん</h1>
          <div style={{ fontSize:'12px', color:C.mute, marginTop:'2px' }}>
            {saving ? '保存中…' : <>記録する店舗：<b style={{ color:C.text }}>{workStore || NO_STORE}</b>
              <button onClick={onBack} style={{ marginLeft:'8px', background:'none', border:'none', color:C.mute, fontSize:'11px', cursor:'pointer', textDecoration:'underline', padding:0 }}>変える</button></>}
          </div>
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
          onDelete={editing.updatedAt ? async () => {
            if (!confirm(`${fmtDate(editing.date)}の記録を消します。よろしいですか。`)) return;
            await onRemove(editing.id); setEditing(null);
          } : null}
          onCancel={() => setEditing(null)}
          onSave={async r => { await onSave(r); setEditing(null); setYm((r.date || '').slice(0, 7)); }} />
      ) : (<>
        <select value={ym} onChange={e => setYm(e.target.value)} style={{ ...selStyle, marginBottom:'12px' }}>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>

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
                      : (r.menuIds || []).map(id => (menuById[id] || {}).name || '（消されたメニュー）').join('／')}
                  </div>
                </div>
                <div style={{ fontSize:'13px', fontWeight:700, color:C.text, whiteSpace:'nowrap' }}>{yen(r.cost)}</div>
                <button onClick={() => setEditing(r)}
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

function RecordForm({ rec, menus, saving, onCancel, onSave, onDelete }) {
  const [date, setDate] = useState(rec.date || today());
  const [picked, setPicked] = useState(rec.menuIds || []);
  const cost = picked.reduce((n, id) => n + (((menus || []).find(m => m.id === id) || {}).cost || 0), 0);
  const byCat = [];
  (menus || []).forEach(m => {
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
        {(menus || []).length === 0 ? (
          <div style={{ fontSize:'12px', color:C.ng, lineHeight:1.7 }}>
            この店舗のメニューがまだ登録されていません。管理者に登録してもらってください。
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

      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        <button onClick={onCancel}
          style={{ padding:'12px 20px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.mute, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
          やめる
        </button>
        {onDelete && (
          <button onClick={onDelete}
            style={{ padding:'12px 16px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Trash2 size={14} /> 消す
          </button>
        )}
        <button onClick={() => onSave({ ...rec, date, menuIds: picked, cost, updatedAt: new Date().toISOString() })}
          disabled={saving || picked.length === 0}
          style={{ flex:1, minWidth:'120px', padding:'12px 20px', borderRadius:'10px', border:'none',
            background: picked.length === 0 ? '#D8D2C6' : C.text, color:'#FFF', fontSize:'13px', fontWeight:700,
            cursor: picked.length === 0 ? 'default' : 'pointer' }}>
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </>
  );
}

// ─── パスワードの入口 ───────────────────────────────────────────
function PwGate({ title, note, expected, onOk, onBack }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  function go() { if (pw.trim() === expected) onOk(); else setMsg('パスワードが違います'); }
  return (
    <div style={{ maxWidth:'340px', margin:'36px auto', textAlign:'center' }}>
      <Lock size={22} color={C.mute} style={{ marginBottom:'10px' }} />
      <div style={{ fontSize:'15px', fontWeight:700, color:C.text, marginBottom:'6px' }}>{title}</div>
      {note && <div style={{ fontSize:'11px', color:C.mute, marginBottom:'16px', lineHeight:1.7 }}>{note}</div>}
      <input type="password" value={pw} autoFocus onChange={e => { setPw(e.target.value); setMsg(''); }}
        onKeyDown={e => e.key === 'Enter' && go()}
        style={{ width:'100%', padding:'12px 14px', borderRadius:'10px', border:`1px solid ${msg ? C.ng : C.line}`, fontSize:'14px', boxSizing:'border-box', textAlign:'center' }} />
      {msg && <div style={{ fontSize:'12px', color:C.ng, marginTop:'8px' }}>{msg}</div>}
      <button onClick={go}
        style={{ width:'100%', marginTop:'12px', padding:'12px', borderRadius:'10px', border:'none', background:C.text, color:'#FFF', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>開く</button>
      <button onClick={onBack} style={{ marginTop:'10px', background:'none', border:'none', color:C.mute, fontSize:'12px', cursor:'pointer', textDecoration:'underline' }}>戻る</button>
    </div>
  );
}

// 月の集計をまとめて出す
function summarize(records, members, ym, store) {
  const inMonth = Object.values(records).filter(r =>
    (r.date || '').startsWith(ym) && (!store || (r.store || '') === store));
  const by = {};
  inMonth.forEach(r => { const x = by[r.memberId] || (by[r.memberId] = { n:0, cost:0 }); x.n += 1; x.cost += (r.cost || 0); });
  const rows = members.map(m => ({ ...m, ...(by[m.id] || { n:0, cost:0 }) }))
    .sort((a, b) => b.n - a.n || b.cost - a.cost || a.name.localeCompare(b.name, 'ja'));
  return { inMonth, rows, done: rows.filter(r => r.n > 0), cost: inMonth.reduce((n, r) => n + (r.cost || 0), 0) };
}

function RankTable({ rows, showStore }) {
  const th = { padding:'8px 10px', fontSize:'11px', fontWeight:700, color:C.mute, textAlign:'left', whiteSpace:'nowrap' };
  const td = { padding:'8px 10px', fontSize:'12px', color:C.text, whiteSpace:'nowrap' };
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ background:'#FBF9F5' }}>
          <th style={th}>順位</th><th style={th}>名前</th>{showStore && <th style={th}>店舗</th>}
          <th style={{ ...th, textAlign:'right' }}>人数</th><th style={{ ...th, textAlign:'right' }}>材料費</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={showStore ? 5 : 4} style={{ ...td, textAlign:'center', color:C.mute, padding:'30px' }}>この月の記録はまだありません</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderTop:'1px solid #F2EEE5' }}>
              <td style={{ ...td, fontWeight:700, color: i < 3 ? C.gold : C.mute }}>{i + 1}</td>
              <td style={{ ...td, fontWeight:600 }}>{r.name}</td>
              {showStore && <td style={{ ...td, color:C.mute }}>{r.store || '―'}</td>}
              <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{r.n}人</td>
              <td style={{ ...td, textAlign:'right', color:C.mute }}>{yen(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MenuBreakdown({ inMonth, menus, showStore }) {
  const count = {};
  inMonth.forEach(r => (r.menuIds || []).forEach(id => {
    const st = r.store || '';
    const mm = (menus[st] || []).find(x => x.id === id);
    const key = (mm ? mm.name : '（消されたメニュー）') + '|' + st;
    const e = count[key] || (count[key] = { name: mm ? mm.name : '（消されたメニュー）', store: st, n:0, cost:0 });
    e.n += 1; e.cost += (mm ? (mm.cost || 0) : 0);
  }));
  const rows = Object.values(count).sort((a, b) => b.n - a.n);
  if (rows.length === 0) return null;
  return (
    <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginTop:'14px' }}>
      <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'10px' }}>メニュー別</div>
      {rows.map((m, i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'5px 0', borderTop: i === 0 ? 'none' : '1px solid #F7F4EE' }}>
          <span>{m.name}{showStore && <span style={{ fontSize:'10px', color:C.mute, marginLeft:'6px' }}>{m.store}</span>}</span>
          <span style={{ color:C.mute }}>{m.n}件　{yen(m.cost)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 店舗管理ページ ─────────────────────────────────────────────
function StoreAdminPage({ store, stores, members, menus, records, saving,
  onSaveMenusFor, onSaveMembers, onSaveStores, onBack }) {
  const [tab, setTab] = useState('rank');
  const [ym, setYm] = useState(thisMonth());
  const [pw, setPw] = useState(() => (stores.find(s => s.name === store) || {}).pw || '');
  const [pwMsg, setPwMsg] = useState('');

  const pool = poolOf(stores, store);
  const staff = members.filter(m => (m.store || '') === pool);
  const { inMonth, rows, done, cost } = summarize(records, staff, ym, store);
  const months = monthsOf(records);

  return (
    <>
      <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, background:'none', border:'none', padding:0, cursor:'pointer', marginBottom:'4px' }}>
        <ChevronLeft size={12} /> {store}に戻る
      </button>
      <h1 style={{ fontSize:'20px', fontWeight:700, margin:'0 0 14px', color:C.text }}>
        {store}<span style={{ fontSize:'11px', fontWeight:700, padding:'3px 9px', borderRadius:'999px', marginLeft:'10px', background:C.soft, color:C.mute }}>店舗管理</span>
      </h1>

      <div style={{ display:'flex', gap:'4px', background:C.soft, borderRadius:'10px', padding:'4px', marginBottom:'16px', width:'fit-content', flexWrap:'wrap' }}>
        {[{ k:'rank', l:'集計', i:BarChart2 }, { k:'menus', l:'メニューと材料費', i:Calendar },
          { k:'members', l:'名簿', i:Users }, { k:'pw', l:'パスワード', i:Lock }].map(({ k, l, i:Icon }) => (
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
          <Stat label="やった人" value={done.length + '／' + staff.length + '名'} />
          <Stat label="材料費の合計" value={yen(cost)} />
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
            {fmtMonth(ym)}のランキング<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>やった人数順</span>
          </div>
          <RankTable rows={done} />
          {rows.filter(r => r.n === 0).length > 0 && (
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.line}`, fontSize:'11px', color:C.mute, lineHeight:1.8 }}>
              この月に記録がない人 {rows.filter(r => r.n === 0).length}名：{rows.filter(r => r.n === 0).map(r => r.name).join('、')}
            </div>
          )}
        </div>
        <MenuBreakdown inMonth={inMonth} menus={menus} />
      </>)}

      {tab === 'menus' && (
        <MenuEditor key={store} store={store} menus={menus[store] || []} saving={saving}
          onSave={list => onSaveMenusFor(store, list)} />
      )}

      {tab === 'members' && (
        <MemberAdmin members={staff} allMembers={members} stores={stores} records={records}
          poolNote={pool !== store ? `${store} は ${pool} と同じメンバーです` : ''}
          isMaster={false} saving={saving} onSave={onSaveMembers} onSeed={null} />
      )}

      {tab === 'pw' && (
        <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'16px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'6px' }}>{store}の店舗パスワード</div>
          <div style={{ fontSize:'11px', color:C.mute, lineHeight:1.8, marginBottom:'12px' }}>
            この画面を開くためのパスワードです。変えたらこの店舗の管理者に伝えてください。
          </div>
          <input type="text" value={pw} onChange={e => { setPw(e.target.value); setPwMsg(''); }}
            style={{ ...selStyle, width:'100%', boxSizing:'border-box', marginBottom:'10px' }} />
          <button onClick={async () => {
              const v = pw.trim();
              if (!v) { setPwMsg('空にはできません'); return; }
              await onSaveStores(stores.map(s => s.name === store ? { ...s, pw: v } : s));
              setPwMsg('保存しました');
            }}
            style={{ padding:'10px 18px', borderRadius:'8px', border:'none', background:C.text, color:'#FFF', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
            保存する
          </button>
          {pwMsg && <span style={{ fontSize:'12px', color: pwMsg === '保存しました' ? C.ok : C.ng, marginLeft:'10px' }}>{pwMsg}</span>}
        </div>
      )}
    </>
  );
}

// ─── 総管理ページ ───────────────────────────────────────────────
function MasterPage({ stores, members, menus, records, saving, masterPw,
  onSaveMembers, onSaveStores, onSaveMasterPw, onSeed, onBack }) {
  const [tab, setTab] = useState('rank');
  const [ym, setYm] = useState(thisMonth());
  const months = monthsOf(records);
  const all = summarize(records, members, ym, '');

  const perStore = stores.map(s => {
    const staff = members.filter(m => (m.store || '') === poolOf(stores, s.name));
    const r = summarize(records, staff, ym, s.name);
    return { name:s.name, staff:staff.length, n:r.inMonth.length, done:r.done.length, cost:r.cost };
  });

  const th = { padding:'8px 10px', fontSize:'11px', fontWeight:700, color:C.mute, textAlign:'left', whiteSpace:'nowrap' };
  const td = { padding:'8px 10px', fontSize:'12px', color:C.text, whiteSpace:'nowrap' };

  return (
    <>
      <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, background:'none', border:'none', padding:0, cursor:'pointer', marginBottom:'4px' }}>
        <ChevronLeft size={12} /> 店舗選択に戻る
      </button>
      <h1 style={{ fontSize:'20px', fontWeight:700, margin:'0 0 14px', color:C.text }}>
        総管理<span style={{ fontSize:'11px', fontWeight:700, padding:'3px 9px', borderRadius:'999px', marginLeft:'10px', background:C.okBg, color:C.ok }}>全店</span>
      </h1>

      <div style={{ display:'flex', gap:'4px', background:C.soft, borderRadius:'10px', padding:'4px', marginBottom:'16px', width:'fit-content', flexWrap:'wrap' }}>
        {[{ k:'rank', l:'集計', i:BarChart2 }, { k:'members', l:'名簿', i:Users }, { k:'stores', l:'店舗とパスワード', i:Store }].map(({ k, l, i:Icon }) => (
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
          <Stat label="のべ人数" value={all.inMonth.length + '人'} big />
          <Stat label="やった人" value={all.done.length + '／' + members.length + '名'} />
          <Stat label="材料費の合計" value={yen(all.cost)} />
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'14px' }}>
          <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>各店の集計</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#FBF9F5' }}>
                <th style={th}>店舗</th><th style={{ ...th, textAlign:'right' }}>のべ人数</th>
                <th style={{ ...th, textAlign:'right' }}>やった人</th><th style={{ ...th, textAlign:'right' }}>材料費</th>
              </tr></thead>
              <tbody>
                {perStore.map(s => (
                  <tr key={s.name} style={{ borderTop:'1px solid #F2EEE5' }}>
                    <td style={{ ...td, fontWeight:600 }}>{s.name}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{s.n}人</td>
                    <td style={{ ...td, textAlign:'right', color:C.mute }}>{s.done}／{s.staff}名</td>
                    <td style={{ ...td, textAlign:'right', color:C.mute }}>{yen(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
            全店ランキング<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>やった人数順</span>
          </div>
          <RankTable rows={all.done} showStore />
          {all.rows.filter(r => r.n === 0).length > 0 && (
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.line}`, fontSize:'11px', color:C.mute, lineHeight:1.8 }}>
              この月に記録がない人 {all.rows.filter(r => r.n === 0).length}名：{all.rows.filter(r => r.n === 0).map(r => r.name).join('、')}
            </div>
          )}
        </div>
        <MenuBreakdown inMonth={all.inMonth} menus={menus} showStore />
      </>)}

      {tab === 'members' && (
        <MemberAdmin members={members} allMembers={members} stores={stores} records={records}
          isMaster saving={saving} onSave={onSaveMembers} onSeed={onSeed} />
      )}

      {tab === 'stores' && (
        <StoreAdmin stores={stores} members={members} saving={saving}
          onSave={onSaveStores} onSaveMembers={onSaveMembers}
          masterPw={masterPw} onSaveMasterPw={onSaveMasterPw} />
      )}
    </>
  );
}

// ─── メニューと材料費（店舗ごと）────────────────────────────────
function MenuEditor({ store, menus, onSave, saving }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(menus || [])));
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [cat, setCat] = useState('');
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(menus);

  function set(id, patch) { setDraft(d => d.map(m => m.id === id ? { ...m, ...patch } : m)); }
  function del(m) {
    if (!confirm(`「${m.name}」を消します。すでに記録に使われている分は、その記録に残った金額のままです。よろしいですか。`)) return;
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
        <b style={{ color:C.text }}>{store}</b> のメニューです。ここで登録したものが、この店舗のスタッフの記録画面に出ます。<br />
        材料費はメニューごとの固定額。並べ替えは左の <GripVertical size={12} style={{ verticalAlign:'-2px' }} /> をドラッグ。区分を入れるとまとまって表示されます。
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'14px' }}>
        <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
          {store}<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>{draft.length}件</span>
        </div>
        {draft.length === 0 && (
          <div style={{ padding:'24px 14px', textAlign:'center', fontSize:'12px', color:C.mute }}>まだ1件もありません。下から足してください。</div>
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
              style={{ flex:'0 0 88px', minWidth:0, padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'12px' }} />
            <input value={m.name} onChange={e => set(m.id, { name: e.target.value })}
              style={{ flex:'1 1 100px', minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px' }} />
            <div style={{ display:'flex', alignItems:'center', gap:'3px', flexShrink:0 }}>
              <span style={{ fontSize:'12px', color:C.mute }}>¥</span>
              <input value={m.cost} inputMode="numeric" onChange={e => set(m.id, { cost: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                style={{ width:'72px', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px', textAlign:'right' }} />
            </div>
            <button onClick={() => del(m)} title="削除"
              style={{ flexShrink:0, width:'32px', height:'32px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'11px 12px', borderTop:`1px solid ${C.line}`, background:'#FBF9F5', flexWrap:'wrap' }}>
          <input value={cat} onChange={e => setCat(e.target.value)} placeholder="区分"
            style={{ flex:'0 0 88px', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'12px' }} />
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="メニュー名"
            style={{ flex:'1 1 110px', minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px' }} />
          <input value={cost} inputMode="numeric" onChange={e => setCost(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && add()} placeholder="材料費"
            style={{ width:'82px', padding:'8px 9px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px', textAlign:'right' }} />
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

// ─── 名簿 ───────────────────────────────────────────────────────
function MemberAdmin({ members, allMembers, stores, records, isMaster, saving, onSave, onSeed, poolNote }) {
  const [impMsg, setImpMsg] = useState('');
  const used = {};
  Object.values(records || {}).forEach(r => { used[r.memberId] = (used[r.memberId] || 0) + 1; });

  function resetPin(m) {
    if (!confirm(`${m.name}さんのパスワードを解除します。本人が次に開いたとき、新しいパスワードを決め直せます。`)) return;
    onSave(allMembers.map(x => x.id === m.id ? { ...x, pin: null } : x));
  }
  function setStore(m, store) { onSave(allMembers.map(x => x.id === m.id ? { ...x, store } : x)); }
  function remove(m) {
    const n = used[m.id] || 0;
    if (!confirm(n > 0 ? `${m.name}さんを名簿から外します。記録${n}件はそのまま残ります。` : `${m.name}さんを名簿から外します。`)) return;
    onSave(allMembers.filter(x => x.id !== m.id));
  }

  const cohorts = [...new Set(members.map(m => m.cohort))].sort();

  return (
    <>
      {isMaster && onSeed && (
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', marginBottom:'12px' }}>
          <button onClick={async () => { const r = await onSeed(); setImpMsg(r.added > 0 ? `${r.added}名を追加しました：${r.names.join('、')}` : '新しく追加する人はいませんでした'); }}
            style={{ display:'flex', alignItems:'center', gap:'5px', padding:'9px 16px', borderRadius:'9px', border:`1px solid ${C.line}`, background:'#FFF', color:C.text, fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            <Plus size={13} /> カリキュラムから取り込む（2025・2026年入社）
          </button>
          {impMsg && <span style={{ fontSize:'11px', color:C.mute }}>{impMsg}</span>}
        </div>
      )}
      {!isMaster && (
        <div style={{ fontSize:'12px', color:C.mute, lineHeight:1.8, marginBottom:'12px' }}>
          この店舗のスタッフです。店舗の移動や名簿の追加は総管理者が行います。
        </div>
      )}
      {poolNote && (
        <div style={{ fontSize:'12px', color:C.text, lineHeight:1.7, marginBottom:'12px', padding:'10px 13px', borderRadius:'10px', background:C.soft }}>
          {poolNote}
        </div>
      )}

      {members.length === 0 && (
        <div style={{ padding:'30px', textAlign:'center', color:C.mute, background:C.card, borderRadius:'12px', border:`1px solid ${C.line}`, fontSize:'12px' }}>
          スタッフがいません。
        </div>
      )}

      {cohorts.map(c => (
        <div key={c} style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'12px' }}>
          <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
            {c}<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>{members.filter(m => m.cohort === c).length}名</span>
          </div>
          {members.filter(m => m.cohort === c).map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 14px', borderTop:'1px solid #F7F4EE', flexWrap:'wrap' }}>
              <span style={{ flex:'1 1 90px', minWidth:0, fontSize:'13px', fontWeight:600 }}>{m.name}</span>
              {isMaster ? (
                <select value={m.store || ''} onChange={e => setStore(m, e.target.value)} style={{ ...selStyle, flex:'0 0 128px', padding:'7px 6px', fontSize:'12px' }}>
                  <option value="">店舗なし</option>
                  {stores.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              ) : <span style={{ fontSize:'11px', color:C.mute }}>{m.store || '―'}</span>}
              <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'999px',
                background: m.pin ? C.okBg : C.soft, color: m.pin ? C.ok : C.mute }}>
                {m.pin ? '登録済' : '未登録'}
              </span>
              <span style={{ fontSize:'11px', color:C.mute, width:'44px', textAlign:'right' }}>{used[m.id] || 0}件</span>
              {m.pin && (
                <button onClick={() => resetPin(m)}
                  style={{ flexShrink:0, padding:'6px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.text, fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                  パスワード解除
                </button>
              )}
              {isMaster && (
                <button onClick={() => remove(m)} title="名簿から外す"
                  style={{ flexShrink:0, width:'30px', height:'30px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

// ─── 店舗とパスワード（総管理者のみ）────────────────────────────
function StoreAdmin({ stores, members, saving, onSave, onSaveMembers, masterPw, onSaveMasterPw }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(stores || [])));
  const [name, setName] = useState('');
  const [pw2, setPw2] = useState(masterPw || '');
  const [pwMsg, setPwMsg] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(stores);
  const countOf = n => members.filter(m => (m.store || '') === poolOf(draft, n)).length;

  function set(i, patch) { setDraft(d => d.map((s, k) => k === i ? { ...s, ...patch } : s)); }
  function rename(i, next) {
    const before = draft[i].name;
    set(i, { name: next });
    // 店舗名を変えたら、その店舗のスタッフも一緒に動かす
    if (before && next && before !== next) onSaveMembers(members.map(m => m.store === before ? { ...m, store: next } : m));
  }
  function del(i) {
    const s = draft[i];
    if (!s.sameAs && countOf(s.name) > 0) { alert(`${s.name}には${countOf(s.name)}名います。先に別の店舗へ移してください。`); return; }
    if (!confirm(`店舗「${s.name}」を消します。メニューの表も見えなくなります。よろしいですか。`)) return;
    setDraft(d => d.filter((_, k) => k !== i));
  }
  function add() {
    const n = name.trim();
    if (!n) return;
    if (draft.some(s => s.name === n)) { alert('同じ店舗があります'); return; }
    setDraft(d => [...d, { name: n, pw: DEFAULT_PW, sameAs: '' }]);
    setName('');
  }

  return (
    <>
      <div style={{ fontSize:'12px', color:C.mute, lineHeight:1.8, marginBottom:'12px' }}>
        店舗ごとのパスワードを入れておくと、その店舗の管理者は自分の店舗だけを見られます。空欄なら誰も入れません。<br />
        スタッフを共有している店舗は、右の欄で「◯◯と同じ」を選んでください。名簿は共有され、メニューと集計は別々になります。
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', overflow:'hidden', marginBottom:'14px' }}>
        <div style={{ padding:'11px 14px', background:C.soft, fontSize:'13px', fontWeight:700 }}>
          店舗<span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>{draft.length}件</span>
        </div>
        {draft.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', borderTop:'1px solid #F7F4EE', flexWrap:'wrap' }}>
            <input value={s.name} onChange={e => rename(i, e.target.value)}
              style={{ flex:'1 1 110px', minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px', fontWeight:700 }} />
            <span style={{ fontSize:'11px', color:C.mute, width:'42px', textAlign:'right' }}>{countOf(s.name)}名</span>
            <input value={s.pw || ''} onChange={e => set(i, { pw: e.target.value })} placeholder="この店舗のパスワード"
              style={{ flex:'1 1 130px', minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'12px' }} />
            <select value={s.sameAs || ''} onChange={e => set(i, { sameAs: e.target.value })}
              title="メンバーを借りる店舗"
              style={{ ...selStyle, flex:'0 0 140px', padding:'8px 6px', fontSize:'12px' }}>
              <option value="">メンバーは自分の店舗</option>
              {draft.filter((x, k) => k !== i && !x.sameAs).map(x => <option key={x.name} value={x.name}>{x.name}と同じ</option>)}
            </select>
            <button onClick={() => del(i)} title="削除"
              style={{ flexShrink:0, width:'32px', height:'32px', borderRadius:'8px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div style={{ display:'flex', gap:'8px', padding:'11px 12px', borderTop:`1px solid ${C.line}`, background:'#FBF9F5' }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="新しい店舗の名前"
            style={{ flex:1, minWidth:0, padding:'8px 10px', borderRadius:'8px', border:`1px solid ${C.line}`, fontSize:'13px' }} />
          <button onClick={add}
            style={{ flexShrink:0, display:'flex', alignItems:'center', gap:'4px', padding:'8px 14px', borderRadius:'8px', border:'none', background:C.text, color:'#FFF', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            <Plus size={13} /> 追加
          </button>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => onSave(draft)} onReset={() => setDraft(JSON.parse(JSON.stringify(stores)))} />

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginTop:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'10px' }}>
          <Lock size={13} /> 総管理のパスワード
        </div>
        <div style={{ fontSize:'11px', color:C.mute, lineHeight:1.8, marginBottom:'10px' }}>
          全店のデータを開くためのパスワードです。
        </div>
        <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:C.mute, marginBottom:'10px' }}>総管理のパスワード
          <input type="text" value={pw2} onChange={e => { setPw2(e.target.value); setPwMsg(''); }}
            style={{ ...selStyle, width:'100%', marginTop:'4px', boxSizing:'border-box' }} />
        </label>
        <button onClick={async () => {
            const v = pw2.trim();
            if (!v) { setPwMsg('空にはできません'); return; }
            const okk = await onSaveMasterPw(v); setPwMsg(okk ? '保存しました' : ''); }}
          style={{ padding:'9px 18px', borderRadius:'8px', border:'none', background:C.text, color:'#FFF', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
          パスワードを保存
        </button>
        {pwMsg && <span style={{ fontSize:'12px', color: pwMsg === '保存しました' ? C.ok : C.ng, marginLeft:'10px' }}>{pwMsg}</span>}
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
