import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Plus, Trash2, Star, Search, BarChart2, ClipboardList } from 'lucide-react';

// ─── Firebase キー ───────────────────────────────────────────────
const DATA_KEY       = 'shampoo_check_v1';
const CURRICULUM_KEY = 'curriculum_v2';            // スタッフ一覧を読むだけ
const MASTER_PW_KEY  = 'shift_manager_master_password_v1';
const WORKSPACES_KEY = 'shift_manager_workspaces_v1';      // 採点する人の候補（トレーナー）を集める

// 勉強会ページのトレーナー名は あだ名・名字だけ の表記がまざっているので本名に寄せる。
// 出典: プロジェクトの「勉強会_割り振り記録_名寄せ辞書」
const NAME_ALIASES = {
  'わたる':'砂川航', '航':'砂川航',
  'さやか':'大久保紗香', '大久保':'大久保紗香',
  'ことみ':'田村琴海', '田村':'田村琴海',
  'ななせ':'上田奈々世', '上田':'上田奈々世',
  'まや':'池田麻弥',
  'まな':'池崎真菜',
  '太陽':'成川太陽',
  '海秀':'長山海秀', '長山':'長山海秀',
  'くろうど':'梶原蔵人', '蔵人':'梶原蔵人',
  '永田':'永田竜士',
  '杉野':'杉野雄亮',
  '西岡':'西岡健太郎',
  '清水':'清水咲季',
  '荒木':'荒木大輔',
  '翔太':'池田翔太', 'いけしょー':'池田翔太',
  '喜友名':'喜友名夏海',
  '祝部':'祝部真子',
  '瀬戸岡':'瀬戸岡和哉',
  '諒':'佐藤諒',
  'まつり':'石原まつり',
  'ほのか':'鈴木帆乃花',
  'めい':'友保芽依',
  'ユキト':'齋藤弓希斗',
};
const NAME_EXCLUDE = ['テスト', 'テスト太郎'];
function normName(raw) {
  const n = String(raw || '').replace(/[（(].*$/, '').trim();   // 「諒（月他）」→「諒」
  return NAME_ALIASES[n] || n;
}

// ─── 公開前フラグ ───────────────────────────────────────────────
// true の間は「準備中」の画面だけを出す。
// 中身を確認したい時は URL の末尾に ?preview=1 を付ける。
const COMING_SOON = true;

// ─── チェック項目（2024シャンプー強化チェック表）──────────────────
// s: ⭐︎項目（3点でないと不合格） / b: 0 or 3 のみ
const ITEM_SET = '2024';
const SECTIONS = [
  { key: 'a', name: '流し', items: [
    { id:'a1', t:'大きくかき流しできてるか' },
    { id:'a2', t:'力加減は適切か' },
    { id:'a3', t:'フェイスラインのガード圧は適切か' },
    { id:'a4', t:'ネープは溜められているか' },
    { id:'a5', t:'ネープからお湯が漏れていないか' },
    { id:'a6', t:'耳ための音は消えているか' },
    { id:'a7', t:'耳ためは溜まっているか' },
    { id:'a8', t:'流しは甘くないか' },
  ]},
  { key: 'b', name: 'シャンプー', items: [
    { id:'b1',  t:'泡だては単調ではないか' },
    { id:'b2',  t:'泡だて中、泡は飛んでこないか' },
    { id:'b3',  t:'泡立ちは甘くないか', s:true },
    { id:'b4',  t:'もみあげ、ネープは泡立っているか' },
    { id:'b5',  t:'フェイスラインのかきの繊細さ' },
    { id:'b6',  t:'単調なシャンプーになっていないか', s:true },
    { id:'b7',  t:'指当たりは点になっていないか' },
    { id:'b8',  t:'大きくかけているか' },
    { id:'b9',  t:'十分な幅は洗えているか' },
    { id:'b10', t:'力加減は適切か' },
    { id:'b11', t:'頭皮をしっかりかけているか' },
    { id:'b12', t:'繋がりは滑らかか' },
    { id:'b13', t:'シャンプーマッサージのリズム、強弱は適切か' },
    { id:'b14', t:'シャンプーマッサージは気持ちよかったか', s:true },
  ]},
  { key: 'c', name: 'シャンプー流し', items: [
    { id:'c1', t:'泡取り、流しなど特に顔周りは丁寧か', s:true },
    { id:'c2', t:'大きくかき流せているか' },
    { id:'c3', t:'力加減は適切か' },
    { id:'c4', t:'耳ための音は消えているか' },
    { id:'c5', t:'耳ためは溜まっているか' },
    { id:'c6', t:'ネープのお湯は溜まっているか' },
    { id:'c7', t:'ネープは流し切れているか' },
    { id:'c8', t:'耳周りは不快ではないか', s:true },
  ]},
  { key: 'd', name: 'トリートメント', items: [
    { id:'d1', t:'ツボに入っているか', s:true },
    { id:'d2', t:'指当たりは点になっていないか' },
    { id:'d3', t:'力加減は適切か' },
    { id:'d4', t:'静かにできているか' },
    { id:'d5', t:'トリートメントマッサージは気持ち良かったか' },
  ]},
  { key: 'e', name: 'タオルドライ', items: [
    { id:'e1', t:'頭皮と髪の毛の水分をしっかり取れているか' },
    { id:'e2', t:'顔に水や髪が跳ねてこなかったから' },
    { id:'e3', t:'耳周りに泡は残っていなかったか' },
  ]},
  { key: 'f', name: '全体', items: [
    { id:'f1',  t:'タイムに入っているか（ショート10分／ロング13分）', b:true },
    { id:'f2',  t:'全体的に単調じゃなかったか', s:true },
    { id:'f3',  t:'鼻息はかかっていなかったか' },
    { id:'f4',  t:'全体的に流れはスムーズだったか' },
    { id:'f5',  t:'髪はつらなかったか' },
    { id:'f6',  t:'声かけのタイミングは適切だったか、言葉遣いは丁寧か' },
    { id:'f7',  t:'頭を持ち上げる時丁寧だったか、持ち上げた時不安定じゃなかったか' },
    { id:'f8',  t:'ホットタオルの温度、当て方は適切か' },
    { id:'f9',  t:'耳の後ろはヌルヌルしていないか' },
    { id:'f10', t:'耳周り、首周り、顔周りは気持ち悪くないか' },
    { id:'f11', t:'※1. 耳に水は入らなかったか', b:true },
    { id:'f12', t:'※2. 耳に水が入った事にすぐ気づけたか', s:true, auto:'f11' },
    { id:'f13', t:'※3. 顔に水や泡が飛んでいないか', b:true },
    { id:'f14', t:'※4. 顔に水や泡が飛んだ事にすぐ気づけたか', s:true, auto:'f13' },
    { id:'f15', t:'全体的に音はうるさくなかったか' },
    { id:'f16', t:'全体的に触り方は丁寧か', s:true },
    { id:'f17', t:'背中は濡れていないか' },
    { id:'f18', t:'タオルは濡れていないか' },
    { id:'f19', t:'雑さはなかったか', s:true },
    { id:'f20', t:'爪が当たって痛くなかったか', s:true },
    { id:'f21', t:'頭が揺れすぎていなかったか' },
    { id:'f22', t:'全体的に気持ち良かったか' },
  ]},
];
const ALL_ITEMS  = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.name, sectionKey: s.key })));
const ITEM_BY_ID = Object.fromEntries(ALL_ITEMS.map(i => [i.id, i]));
const MAX_TOTAL  = ALL_ITEMS.length * 3;   // 180
const PASS_LINE  = 165;
const SCORE_LABEL = { 0:'全くダメ', 1:'要練習！', 2:'まあまあok！', 3:'良い感じ！' };
const SECTION_MAX = Object.fromEntries(SECTIONS.map(s => [s.key, s.items.length * 3]));

// ─── 合否判定 ────────────────────────────────────────────────────
// ルール（紙のチェック表どおり）
//  ・1項目 0〜3 で評価、180点中165点以上で合格
//  ・⭐︎の所は3をもらえないと不合格
//  ・0点が1つでもあれば不合格
//  ・ただし ※1が0点で※2に点が入った場合、※3が0点で※4に点が入った場合、その0点は不合格としない
function judge(scores) {
  const reasons = [];
  let total = 0, unscored = 0;
  ALL_ITEMS.forEach(it => {
    const v = scores[it.id];
    if (v === undefined || v === null) unscored++;
    else total += v;
  });
  ALL_ITEMS.forEach(it => {
    if (scores[it.id] !== 0) return;
    if (it.id === 'f11' && scores.f12 > 0) return;  // ※1の例外
    if (it.id === 'f13' && scores.f14 > 0) return;  // ※3の例外
    reasons.push({ type:'zero', text:`0点：${it.t}` });
  });
  ALL_ITEMS.filter(i => i.s).forEach(it => {
    const v = scores[it.id];
    if (v !== undefined && v !== null && v !== 3) reasons.push({ type:'star', text:`⭐︎項目が3点でない：${it.t}（${v}点）` });
  });
  if (unscored === 0 && total < PASS_LINE) reasons.push({ type:'total', text:`合計が${PASS_LINE}点未満（${total}点）` });
  return { total, unscored, pass: unscored === 0 && reasons.length === 0, reasons };
}
function sectionTotal(scores, key) {
  return SECTIONS.find(s => s.key === key).items
    .reduce((n, i) => n + (typeof scores[i.id] === 'number' ? scores[i.id] : 0), 0);
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(ds) { if (!ds) return '―'; const [y,m,d] = ds.split('-'); return `${y}/${m}/${d}`; }

// ─── 色 ─────────────────────────────────────────────────────────
const C = {
  bg:'#F7F4EE', card:'#FFFFFF', line:'#E5DCC8', text:'#1F1C18', mute:'#9C9486',
  ok:'#2A9D8F', okBg:'#EAF1ED', ng:'#E63946', ngBg:'#FBEAEC', soft:'#EFEAE0', star:'#D98A00',
};
const SCORE_COLOR = { 0:'#E63946', 1:'#E8862A', 2:'#C9A227', 3:'#2A9D8F' };

// ─── 小物 ───────────────────────────────────────────────────────
function Badge({ pass }) {
  return (
    <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 10px', borderRadius:'999px',
      background: pass ? C.okBg : C.ngBg, color: pass ? C.ok : C.ng, whiteSpace:'nowrap' }}>
      {pass ? '合格' : '不合格'}
    </span>
  );
}
function ScoreButtons({ item, value, locked, onPick }) {
  const opts = item.b ? [0, 3] : [0, 1, 2, 3];
  return (
    <div style={{ display:'flex', gap:'4px' }}>
      {opts.map(v => {
        const on = value === v;
        return (
          <button key={v} disabled={locked} onClick={() => onPick(on ? null : v)}
            title={SCORE_LABEL[v]}
            style={{ width:'34px', height:'34px', borderRadius:'8px', cursor: locked ? 'default' : 'pointer',
              border: on ? 'none' : `1px solid ${C.line}`,
              background: on ? SCORE_COLOR[v] : (locked ? '#F3F0E9' : '#FFFFFF'),
              color: on ? '#FFFFFF' : (locked ? '#C9C2B4' : C.mute),
              fontWeight: on ? 700 : 500, fontSize:'13px', flexShrink:0 }}>
            {v}
          </button>
        );
      })}
    </div>
  );
}

// ─── 準備中の画面 ───────────────────────────────────────────────
function ComingSoon() {
  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
      <div style={{ maxWidth:'420px', width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:'40px', marginBottom:'14px' }}>🧴</div>
        <h1 style={{ fontSize:'22px', fontWeight:700, color:C.text, margin:'0 0 10px', letterSpacing:'0.04em' }}>
          Coming Soon
        </h1>
        <div style={{ fontSize:'14px', fontWeight:600, color:C.text, marginBottom:'8px' }}>
          シャンプーチェック
        </div>
        <div style={{ fontSize:'13px', color:C.mute, lineHeight:1.9, marginBottom:'26px' }}>
          ただいま準備中です。<br />
          公開まで少しお待ちください。
        </div>
        <a href="/" style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'11px 22px', borderRadius:'10px',
          border:`1px solid ${C.line}`, background:C.card, color:C.text, fontSize:'13px', fontWeight:600, textDecoration:'none' }}>
          <ChevronLeft size={14} /> シフト管理に戻る
        </a>
      </div>
    </div>
  );
}

// ─── 本体 ───────────────────────────────────────────────────────
export default function ShampooCheckApp() {
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
  if (COMING_SOON && !preview) return <ComingSoon />;
  return <ShampooCheckInner />;
}

function ShampooCheckInner() {
  const [data, setData]       = useState({ version:1, results:{} });
  const [staff, setStaff]     = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [masterPw, setMasterPw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [view, setView]       = useState({ name:'list' });   // list | form | detail
  const [err, setErr]         = useState('');

  useEffect(() => { (async () => {
    try {
      const r = await window.storage.get(DATA_KEY);
      const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      if (v && typeof v === 'object') setData({ version:1, results:{}, ...v });
    } catch (e) { /* 初回は未作成 */ }
    try {
      const r = await window.storage.get(CURRICULUM_KEY);
      const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      setStaff((v?.staff || []).filter(s => !s.retired));
    } catch (e) { setErr('スタッフ一覧の読み込みに失敗しました'); }
    try { const r = await window.storage.get(MASTER_PW_KEY); setMasterPw(r.value || ''); } catch (e) {}
    // 勉強会ページに登録されているトレーナーを全ページ分あつめる（「○○（月火）」の曜日は外す）
    try {
      const r = await window.storage.get(WORKSPACES_KEY);
      const list = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      const names = new Set();
      for (const w of (list || [])) {
        try {
          const d = await window.storage.get('shift_manager_workspace_' + w.id);
          const ws = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
          (ws?.trainers || []).forEach(t => {
            const n = normName(t.name);
            if (n && !NAME_EXCLUDE.includes(n)) names.add(n);
          });
        } catch (e) {}
      }
      setTrainers([...names].sort());   // カリキュラム在籍との重複は描画時に外す
    } catch (e) {}
    setLoading(false);
  })(); }, []);

  // 保存は results をキー単位でマージし、他端末の入力を消さない
  const persist = useCallback(async (mutate) => {
    setSaving(true);
    try {
      let remote = { version:1, results:{} };
      try {
        const r = await window.storage.get(DATA_KEY);
        const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        if (v && typeof v === 'object') remote = { version:1, results:{}, ...v };
      } catch (e) {}
      const next = mutate(remote);
      await window.storage.set(DATA_KEY, JSON.stringify(next));
      setData(next);
    } catch (e) { setErr('保存に失敗しました。通信状況を確認してもう一度お試しください'); }
    setSaving(false);
  }, []);

  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const results   = useMemo(() => Object.values(data.results || {})
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [data]);

  async function saveResult(rec) {
    await persist(remote => ({ ...remote, results: { ...remote.results, [rec.id]: rec } }));
    setView({ name:'detail', id: rec.id });
  }
  async function deleteResult(id) {
    await persist(remote => { const rs = { ...remote.results }; delete rs[id]; return { ...remote, results: rs }; });
    setView({ name:'list' });
  }

  if (loading) return <Shell><div style={{ padding:'40px', textAlign:'center', color:C.mute }}>読み込み中…</div></Shell>;

  return (
    <Shell>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', marginBottom:'18px' }}>
        <div>
          <a href="/" style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', color:C.mute, textDecoration:'none', marginBottom:'4px' }}>
            <ChevronLeft size={12} /> シフト管理に戻る
          </a>
          <h1 style={{ fontSize:'20px', fontWeight:700, margin:0, color:C.text, letterSpacing:'0.02em' }}>シャンプーチェック</h1>
          <div style={{ fontSize:'12px', color:C.mute, marginTop:'2px' }}>
            {saving ? '保存中…' : `${MAX_TOTAL}点満点／${PASS_LINE}点以上で合格`}
          </div>
        </div>
        {view.name === 'list' && (
          <button onClick={() => setView({ name:'form' })}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'10px 18px', borderRadius:'10px',
              border:'none', background:C.text, color:'#FFF', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
            <Plus size={15} /> 新しく採点する
          </button>
        )}
      </div>

      {err && (
        <div style={{ marginBottom:'14px', padding:'10px 14px', borderRadius:'10px', background:C.ngBg, color:C.ng, fontSize:'12px' }}>
          {err} <button onClick={() => setErr('')} style={{ marginLeft:'8px', background:'none', border:'none', color:C.ng, cursor:'pointer', textDecoration:'underline' }}>閉じる</button>
        </div>
      )}

      {view.name === 'list'   && <ListView results={results} staffById={staffById} onOpen={id => setView({ name:'detail', id })} />}
      {view.name === 'form'   && <FormView staff={staff} trainers={trainers} base={view.base} onCancel={() => setView({ name:'list' })} onSave={saveResult} saving={saving} />}
      {view.name === 'detail' && <DetailView rec={data.results[view.id]} results={results} staffById={staffById} masterPw={masterPw}
                                   onBack={() => setView({ name:'list' })}
                                   onEdit={rec => setView({ name:'form', base: rec })}
                                   onDelete={deleteResult} />}
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

// ─── 一覧 ───────────────────────────────────────────────────────
function ListView({ results, staffById, onOpen }) {
  const [q, setQ]         = useState('');
  const [year, setYear]   = useState('all');
  const [store, setStore] = useState('all');

  const years  = useMemo(() => [...new Set(results.map(r => (r.date || '').slice(0,4)).filter(Boolean))].sort().reverse(), [results]);
  const stores = useMemo(() => [...new Set(results.map(r => r.store).filter(Boolean))], [results]);
  const shown  = results.filter(r =>
    (year  === 'all' || (r.date || '').startsWith(year)) &&
    (store === 'all' || r.store === store) &&
    (!q || (r.staffName || '').includes(q) || (r.scorer || '').includes(q)));

  const passN = shown.filter(r => r.pass).length;

  return (
    <>
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'14px' }}>
        <div style={{ position:'relative', flex:'1 1 180px' }}>
          <Search size={14} style={{ position:'absolute', left:'10px', top:'11px', color:C.mute }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="名前で絞り込み"
            style={{ width:'100%', padding:'9px 10px 9px 30px', borderRadius:'9px', border:`1px solid ${C.line}`, fontSize:'13px', boxSizing:'border-box' }} />
        </div>
        <select value={year} onChange={e => setYear(e.target.value)} style={selStyle}>
          <option value="all">すべての年</option>
          {years.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={store} onChange={e => setStore(e.target.value)} style={selStyle}>
          <option value="all">すべての店舗</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ fontSize:'12px', color:C.mute, marginBottom:'10px' }}>
        {shown.length}件{shown.length > 0 && `（合格 ${passN}件 / 不合格 ${shown.length - passN}件）`}
      </div>

      {shown.length === 0 ? (
        <div style={{ padding:'50px 20px', textAlign:'center', color:C.mute, background:C.card, borderRadius:'12px', border:`1px solid ${C.line}` }}>
          <ClipboardList size={26} style={{ opacity:0.4, marginBottom:'8px' }} />
          <div style={{ fontSize:'13px' }}>まだ採点がありません</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {shown.map(r => (
            <button key={r.id} onClick={() => onOpen(r.id)}
              style={{ display:'flex', alignItems:'center', gap:'12px', textAlign:'left', width:'100%',
                padding:'12px 14px', borderRadius:'11px', border:`1px solid ${C.line}`, background:C.card, cursor:'pointer' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'14px', fontWeight:600, color:C.text }}>
                  {r.staffName}
                  {r.store && <span style={{ fontSize:'11px', color:C.mute, fontWeight:500, marginLeft:'8px' }}>{r.store}</span>}
                </div>
                <div style={{ fontSize:'11px', color:C.mute, marginTop:'3px' }}>
                  {fmtDate(r.date)}{r.scorer ? ` ・ 採点 ${r.scorer}` : ''}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:'15px', fontWeight:700, color: r.pass ? C.ok : C.text }}>
                  {r.total}<span style={{ fontSize:'11px', color:C.mute, fontWeight:500 }}>/{MAX_TOTAL}</span>
                </div>
                <div style={{ marginTop:'3px' }}><Badge pass={r.pass} /></div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
const selStyle = { padding:'9px 10px', borderRadius:'9px', border:`1px solid ${C.line}`, fontSize:'13px', background:'#FFF', color:C.text };

// ─── 採点フォーム ───────────────────────────────────────────────
function FormView({ staff, trainers, base, onCancel, onSave, saving }) {
  const [staffId, setStaffId] = useState(base?.staffId || '');
  const [scorer, setScorer]   = useState(base?.scorer || '');
  const [scorerOther, setScorerOther] = useState('');
  const [date, setDate]       = useState(base?.date || today());
  const [memo, setMemo]       = useState(base?.memo || '');
  const [scores, setScores]   = useState(base?.scores || {});

  const person = staff.find(s => s.id === staffId);
  const res    = judge(scores);
  const cohorts = [...new Set(staff.map(s => s.cohort))].sort();
  // カリキュラムに載っている人は学年のグループに出すので、トレーナー群からは外して重複をなくす
  const staffNames = new Set(staff.map(s => s.name));
  const outsideTrainers = (trainers || []).filter(n => !staffNames.has(n));

  function pick(item, v) {
    setScores(prev => {
      const next = { ...prev };
      if (v === null) delete next[item.id]; else next[item.id] = v;
      // ※1が3点（水が入らなかった）なら※2は自動で3点。0点なら手入力に戻す。
      if (item.id === 'f11') { if (v === 3) next.f12 = 3; else delete next.f12; }
      if (item.id === 'f13') { if (v === 3) next.f14 = 3; else delete next.f14; }
      return next;
    });
  }
  const scorerName = scorer === '__other__' ? scorerOther.trim() : scorer.trim();

  function submit() {
    if (!staffId) { alert('チェックを受ける人を選んでください'); return; }
    if (!scorerName) { alert('チェックする人を選んでください'); return; }
    if (res.unscored > 0) { alert(`未入力が${res.unscored}項目あります`); return; }
    onSave({
      id: base?.id || uid(), itemSet: ITEM_SET,
      staffId, staffName: person?.name || '', store: person?.store || '', cohort: person?.cohort || '',
      scorer: scorerName, date, memo: memo.trim(), scores,
      total: res.total, pass: res.pass,
      reasons: res.reasons.map(r => r.text),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <>
      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginBottom:'14px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'12px' }}>
          <label style={lblStyle}>
            <span style={{ fontSize:'13px', fontWeight:700, color:C.text }}>シャンプーをする人</span>
            <span style={{ display:'block', fontSize:'11px', color:C.mute, fontWeight:500, margin:'2px 0 5px' }}>チェックを受ける側</span>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} style={{ ...selStyle, width:'100%' }}>
              <option value="">選んでください</option>
              {cohorts.map(c => (
                <optgroup key={c} label={c}>
                  {staff.filter(s => s.cohort === c).map(s =>
                    <option key={s.id} value={s.id}>{s.name}{s.store ? `（${s.store}）` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label style={lblStyle}>
            <span style={{ fontSize:'13px', fontWeight:700, color:C.text }}>点数をつける人</span>
            <span style={{ display:'block', fontSize:'11px', color:C.mute, fontWeight:500, margin:'2px 0 5px' }}>シャンプーを受けて採点する側</span>
            <select value={scorer} onChange={e => setScorer(e.target.value)} style={{ ...selStyle, width:'100%' }}>
              <option value="">選んでください</option>
              {outsideTrainers.length > 0 && (
                <optgroup label="スタイリスト・トレーナー">
                  {outsideTrainers.map(n => <option key={'t-' + n} value={n}>{n}</option>)}
                </optgroup>
              )}
              {cohorts.map(c => (
                <optgroup key={c} label={c}>
                  {staff.filter(s => s.cohort === c).map(s =>
                    <option key={'s-' + s.id} value={s.name}>{s.name}{s.store ? `（${s.store}）` : ''}</option>)}
                </optgroup>
              ))}
              <option value="__other__">その他（手入力）</option>
            </select>
            {scorer === '__other__' && (
              <input value={scorerOther} onChange={e => setScorerOther(e.target.value)} placeholder="名前を入力"
                style={{ ...selStyle, width:'100%', marginTop:'6px', boxSizing:'border-box' }} />
            )}
          </label>
          <label style={lblStyle}>
            <span style={{ fontSize:'13px', fontWeight:700, color:C.text }}>実施日</span>
            <span style={{ display:'block', fontSize:'11px', color:C.mute, fontWeight:500, margin:'2px 0 5px' }}>&nbsp;</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ ...selStyle, width:'100%', boxSizing:'border-box' }} />
          </label>
        </div>
        {staffId && scorerName && (
          <div style={{ marginTop:'12px', padding:'9px 12px', borderRadius:'9px', background:C.soft, fontSize:'12px', color:C.text }}>
            <b>{person?.name}</b> さんのシャンプーを <b>{scorerName}</b> さんが採点します
          </div>
        )}
      </div>

      <div style={{ position:'sticky', top:0, zIndex:5, background:C.bg, paddingBottom:'8px', marginBottom:'6px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px',
          padding:'11px 14px', borderRadius:'11px', background: res.unscored > 0 ? C.soft : (res.pass ? C.okBg : C.ngBg),
          border:`1px solid ${res.unscored > 0 ? C.line : (res.pass ? '#C9DDD0' : '#F2C9CE')}` }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:C.text }}>
            {res.total}<span style={{ fontSize:'11px', color:C.mute, fontWeight:500 }}> / {MAX_TOTAL}点</span>
          </div>
          <div style={{ fontSize:'12px', color:C.mute }}>
            {res.unscored > 0 ? `未入力 ${res.unscored}項目` : <Badge pass={res.pass} />}
          </div>
        </div>
      </div>

      {SECTIONS.map(sec => {
        const st = sectionTotal(scores, sec.key);
        return (
          <div key={sec.key} style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', marginBottom:'12px', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:C.soft }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:C.text }}>{sec.name}</div>
              <div style={{ fontSize:'12px', color:C.mute, fontWeight:600 }}>{st} / {SECTION_MAX[sec.key]}</div>
            </div>
            {sec.items.map((it, idx) => {
              const locked = !!(it.auto && scores[it.auto] === 3);
              return (
                <div key={it.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px',
                  borderTop: idx === 0 ? 'none' : `1px solid #F2EEE5`, background: locked ? '#FAF8F4' : 'transparent' }}>
                  <div style={{ flex:1, minWidth:0, fontSize:'13px', color: locked ? C.mute : C.text, lineHeight:1.45 }}>
                    {it.s && <Star size={11} fill={C.star} color={C.star} style={{ verticalAlign:'-1px', marginRight:'4px' }} />}
                    {it.t}
                    {it.b && <span style={{ fontSize:'10px', color:C.mute, marginLeft:'6px' }}>0か3</span>}
                    {locked && <span style={{ fontSize:'10px', color:C.ok, marginLeft:'6px' }}>自動で3点</span>}
                  </div>
                  <ScoreButtons item={it} value={scores[it.id]} locked={locked} onPick={v => pick(it, v)} />
                </div>
              );
            })}
          </div>
        );
      })}

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginBottom:'14px' }}>
        <label style={lblStyle}>メモ（任意）
          <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="次までの課題など"
            style={{ ...selStyle, width:'100%', marginTop:'4px', boxSizing:'border-box', resize:'vertical', fontFamily:'inherit' }} />
        </label>
      </div>

      {res.unscored === 0 && res.reasons.length > 0 && (
        <div style={{ background:C.ngBg, border:'1px solid #F2C9CE', borderRadius:'12px', padding:'12px 14px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:C.ng, marginBottom:'6px' }}>不合格の理由</div>
          {res.reasons.map((r, i) => <div key={i} style={{ fontSize:'12px', color:C.ng, lineHeight:1.7 }}>・{r.text}</div>)}
        </div>
      )}

      <div style={{ display:'flex', gap:'8px' }}>
        <button onClick={onCancel} style={{ padding:'12px 20px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.mute, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>やめる</button>
        <button onClick={submit} disabled={saving}
          style={{ flex:1, padding:'12px 20px', borderRadius:'10px', border:'none', background:C.text, color:'#FFF', fontSize:'13px', fontWeight:700, cursor:'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </>
  );
}
const lblStyle = { display:'block', fontSize:'11px', fontWeight:600, color:C.mute };

// ─── 詳細 ───────────────────────────────────────────────────────
function DetailView({ rec, results, staffById, masterPw, onBack, onEdit, onDelete }) {
  const [pwInput, setPwInput] = useState('');
  const [asking, setAsking]   = useState(false);
  if (!rec) return <div style={{ color:C.mute }}>この採点は見つかりませんでした。<button onClick={onBack} style={linkBtn}>一覧へ</button></div>;

  const history = results.filter(r => r.staffId === rec.staffId).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const prev    = history.filter(r => (r.date||'') < (rec.date||'')).slice(-1)[0];

  function tryDelete() {
    if (masterPw && pwInput !== masterPw) { alert('パスワードが違います'); return; }
    if (!confirm(`${rec.staffName}さんの${fmtDate(rec.date)}の採点を削除します。元に戻せません。`)) return;
    onDelete(rec.id);
  }

  return (
    <>
      <button onClick={onBack} style={{ ...linkBtn, marginBottom:'12px', display:'inline-flex', alignItems:'center', gap:'4px' }}>
        <ChevronLeft size={12} /> 一覧に戻る
      </button>

      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'16px', marginBottom:'14px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'17px', fontWeight:700, color:C.text }}>{rec.staffName}</div>
            <div style={{ fontSize:'12px', color:C.mute, marginTop:'3px' }}>
              {fmtDate(rec.date)}{rec.store ? ` ・ ${rec.store}` : ''}{rec.scorer ? ` ・ 採点 ${rec.scorer}` : ''}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'26px', fontWeight:700, color: rec.pass ? C.ok : C.text, lineHeight:1 }}>
              {rec.total}<span style={{ fontSize:'12px', color:C.mute, fontWeight:500 }}>/{MAX_TOTAL}</span>
            </div>
            <div style={{ marginTop:'6px' }}><Badge pass={rec.pass} /></div>
            {prev && (
              <div style={{ fontSize:'11px', color:C.mute, marginTop:'5px' }}>
                前回{fmtDate(prev.date)} {prev.total}点
                <span style={{ color: rec.total >= prev.total ? C.ok : C.ng, fontWeight:700, marginLeft:'5px' }}>
                  {rec.total - prev.total >= 0 ? '+' : ''}{rec.total - prev.total}
                </span>
              </div>
            )}
          </div>
        </div>
        {rec.memo && <div style={{ marginTop:'12px', padding:'10px 12px', background:C.soft, borderRadius:'9px', fontSize:'12px', color:C.text, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{rec.memo}</div>}
      </div>

      {!rec.pass && (rec.reasons || []).length > 0 && (
        <div style={{ background:C.ngBg, border:'1px solid #F2C9CE', borderRadius:'12px', padding:'12px 14px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:C.ng, marginBottom:'6px' }}>不合格の理由</div>
          {rec.reasons.map((t, i) => <div key={i} style={{ fontSize:'12px', color:C.ng, lineHeight:1.7 }}>・{t}</div>)}
        </div>
      )}

      {/* セクション別 */}
      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginBottom:'14px' }}>
        <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
          <BarChart2 size={13} /> セクション別
        </div>
        {SECTIONS.map(sec => {
          const v = sectionTotal(rec.scores, sec.key), max = SECTION_MAX[sec.key];
          const pv = prev ? sectionTotal(prev.scores, sec.key) : null;
          const pct = Math.round(v / max * 100);
          return (
            <div key={sec.key} style={{ marginBottom:'9px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'3px' }}>
                <span style={{ color:C.text }}>{sec.name}</span>
                <span style={{ color:C.mute }}>
                  {v}/{max}
                  {pv !== null && <span style={{ color: v >= pv ? C.ok : C.ng, fontWeight:700, marginLeft:'6px' }}>{v - pv >= 0 ? '+' : ''}{v - pv}</span>}
                </span>
              </div>
              <div style={{ height:'6px', background:C.soft, borderRadius:'99px', overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, height:'100%', background: pct >= 92 ? C.ok : pct >= 75 ? '#C9A227' : C.ng }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 全項目 */}
      <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', marginBottom:'14px', overflow:'hidden' }}>
        {SECTIONS.map(sec => (
          <div key={sec.key}>
            <div style={{ padding:'9px 14px', background:C.soft, fontSize:'12px', fontWeight:700, color:C.text }}>{sec.name}</div>
            {sec.items.map(it => {
              const v = rec.scores[it.id];
              const pv = prev ? prev.scores[it.id] : undefined;
              return (
                <div key={it.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 14px', borderTop:'1px solid #F2EEE5' }}>
                  <div style={{ flex:1, minWidth:0, fontSize:'12px', color:C.text, lineHeight:1.45 }}>
                    {it.s && <Star size={10} fill={C.star} color={C.star} style={{ verticalAlign:'-1px', marginRight:'4px' }} />}
                    {it.t}
                  </div>
                  {pv !== undefined && pv !== v && (
                    <span style={{ fontSize:'10px', color:C.mute }}>前回 {pv}</span>
                  )}
                  <span style={{ width:'26px', height:'26px', borderRadius:'7px', flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background: SCORE_COLOR[v] || C.soft, color:'#FFF', fontSize:'12px', fontWeight:700 }}>
                    {v ?? '―'}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 推移 */}
      {history.length > 1 && (
        <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:'12px', padding:'14px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:C.text, marginBottom:'10px' }}>{rec.staffName}さんの推移</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {history.map(h => (
              <div key={h.id} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'12px' }}>
                <span style={{ width:'82px', color:C.mute, flexShrink:0 }}>{fmtDate(h.date)}</span>
                <div style={{ flex:1, height:'8px', background:C.soft, borderRadius:'99px', overflow:'hidden' }}>
                  <div style={{ width:`${Math.round(h.total / MAX_TOTAL * 100)}%`, height:'100%', background: h.pass ? C.ok : '#C9A227' }} />
                </div>
                <span style={{ width:'54px', textAlign:'right', fontWeight: h.id === rec.id ? 700 : 500, color: h.id === rec.id ? C.text : C.mute, flexShrink:0 }}>
                  {h.total}点
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        <button onClick={() => onEdit(rec)} style={{ padding:'11px 20px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.text, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
          修正する
        </button>
        {!asking ? (
          <button onClick={() => setAsking(true)} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'11px 16px', borderRadius:'10px', border:`1px solid ${C.line}`, background:'#FFF', color:C.ng, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            <Trash2 size={14} /> 削除
          </button>
        ) : (
          <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
            {masterPw && <input type="password" value={pwInput} onChange={e => setPwInput(e.target.value)} placeholder="総管理者パスワード"
              style={{ ...selStyle, width:'180px' }} />}
            <button onClick={tryDelete} style={{ padding:'11px 16px', borderRadius:'10px', border:'none', background:C.ng, color:'#FFF', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>削除する</button>
            <button onClick={() => { setAsking(false); setPwInput(''); }} style={linkBtn}>やめる</button>
          </div>
        )}
      </div>
    </>
  );
}
const linkBtn = { background:'none', border:'none', color:C.mute, fontSize:'12px', cursor:'pointer', textDecoration:'underline', padding:'4px' };
