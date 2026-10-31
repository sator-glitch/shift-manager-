import React, { useState, useEffect } from 'react';

export const ASK_PREFIX = 'curriculum_backfill_ask_v1_';
export const ANS_PREFIX = 'curriculum_backfill_v1_';

const BG = '#FAF8F4', LINE = '#E2DCCC', INK = '#2B2823', SUB = '#8A8378';

function Box({ children }) {
  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function Pick({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: '12.5px', fontWeight: active ? 800 : 500, padding: '8px 12px', borderRadius: '8px',
      border: active ? '1px solid ' + INK : '1px solid ' + LINE,
      background: active ? INK : '#FFFFFF', color: active ? '#FAF8F4' : INK,
      cursor: 'pointer', fontFamily: 'inherit', flex: '1 1 auto',
    }}>{label}</button>
  );
}

const NOW = new Date();
const NOW_Y = NOW.getFullYear(), NOW_M = NOW.getMonth() + 1, NOW_D = NOW.getDate();
const FIRST_YEAR = 2023;
const pad2 = n => String(n).padStart(2, '0');
const daysIn = (y, m) => (y && m ? new Date(y, m, 0).getDate() : 31);

// 今日より後は選べないようにする
function yearOpts() {
  const out = [];
  for (let y = FIRST_YEAR; y <= NOW_Y; y++) out.push(y);
  return out;
}
function monthOpts(y) {
  const max = (Number(y) === NOW_Y) ? NOW_M : 12;
  const out = [];
  for (let m = 1; m <= max; m++) out.push(m);
  return out;
}
function dayOpts(y, m) {
  const max = (Number(y) === NOW_Y && Number(m) === NOW_M) ? NOW_D : daysIn(Number(y), Number(m));
  const out = [];
  for (let d = 1; d <= max; d++) out.push(d);
  return out;
}

const selStyle = {
  flex: '1 1 0', minWidth: 0, fontSize: '16px', padding: '11px 8px', borderRadius: '8px',
  border: '1px solid #E2DCCC', background: '#FAF8F4', fontFamily: 'inherit', color: '#2B2823',
};

export default function BackfillApp() {
  const [staffId, setStaffId] = useState('');
  const [ask, setAsk] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('s') || '';
    setStaffId(sid);
    (async () => {
      if (!sid) { setError('リンクが正しくありません。送られてきたリンクをもう一度開いてください。'); setLoading(false); return; }
      try {
        const r = await window.storage.get(ASK_PREFIX + sid);
        const a = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        setAsk(a);
      } catch (e) {
        setError('この確認は見つかりませんでした。リンクが古い可能性があります。');
        setLoading(false);
        return;
      }
      try {
        const r2 = await window.storage.get(ANS_PREFIX + sid);
        const prev = typeof r2.value === 'string' ? JSON.parse(r2.value) : r2.value;
        if (prev && prev.answers) { setAnswers(prev.answers); setDone(true); }
      } catch (e) { /* 未回答 */ }
      setLoading(false);
    })();
  }, []);

  function setPart(id, part, raw) {
    const v = raw ? Number(raw) : null;
    setAnswers(prev => {
      const cur = { ...(prev[id] || {}) };
      delete cur.date;
      cur.kind = 'passed';
      cur[part] = v;
      if (part === 'y' || part === 'm') {
        // 月末や今日を超えた日が残らないようにする
        const max = dayOpts(cur.y, cur.m).length;
        if (cur.d && cur.d > max) cur.d = null;
        if (part === 'y' && cur.m && monthOpts(cur.y).indexOf(cur.m) < 0) { cur.m = null; cur.d = null; }
      }
      if (cur.y && cur.m && cur.d) cur.date = cur.y + '-' + pad2(cur.m) + '-' + pad2(cur.d);
      return { ...prev, [id]: cur };
    });
    setDone(false);
  }
  function toggleNotYet(id) {
    setAnswers(prev => {
      const cur = prev[id] || {};
      return { ...prev, [id]: cur.kind === 'notyet' ? {} : { kind: 'notyet' } };
    });
    setDone(false);
  }

  const items = (ask && ask.items) || [];
  const holes = items.filter(it => !it.date);
  const remaining = holes.filter(it => {
    const a = answers[it.id];
    return !a || (a.kind !== 'notyet' && !a.date);
  });

  // 未記入の行に、前後で記録がある項目を添える（ノートを探す手がかり）
  function neighbour(idx, dir) {
    for (let i = idx + dir; i >= 0 && i < items.length; i += dir) {
      const v = items[i];
      if (v.date && v.date !== '\u25CE') return v;
    }
    return null;
  }
  const holeRows = items.map((it, i) => ({ it, i })).filter(r => !r.it.date)
    .map(r => ({ it: r.it, prev: neighbour(r.i, -1), next: neighbour(r.i, 1) }));

  // カテゴリごとにまとめる（並びはカリキュラムのまま）
  const groups = [];
  items.forEach(it => {
    const cat = it.category || 'その他';
    let g = groups.find(x => x.cat === cat);
    if (!g) { g = { cat, rows: [] }; groups.push(g); }
    g.rows.push(it);
  });

  async function submit() {
    setSending(true);
    try {
      await window.storage.set(ANS_PREFIX + staffId, JSON.stringify({
        name: ask.name, answers, submittedAt: new Date().toISOString(),
      }));
      setDone(true);
    } catch (e) {
      setError('送信できませんでした。通信状況を確かめて、もう一度試してください。');
    }
    setSending(false);
  }

  if (loading) return <Box><div style={{ color: SUB, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>読み込み中…</div></Box>;

  if (error) return (
    <Box>
      <div style={{ background: '#FFFFFF', border: '1px solid ' + LINE, borderRadius: '12px', padding: '20px' }}>
        <div style={{ fontSize: '13px', color: '#B0746A', fontWeight: 700 }}>{error}</div>
      </div>
    </Box>
  );

  return (
    <Box>
      <div style={{ fontSize: '19px', fontWeight: 800, color: '#1F1C18' }}>合格した時期の確認</div>
      <div style={{ fontSize: '13px', color: SUB, marginTop: '6px', lineHeight: 1.7 }}>
        {ask.name} さん<br />
        カリキュラムの記録が抜けている項目が<strong style={{ color: INK }}>{holes.length}件</strong>あります。
        下の{holes.length}件について、<strong style={{ color: INK }}>合格した日</strong>を入れてください。
      </div>
      <div style={{ fontSize: '12px', color: SUB, marginTop: '10px', background: '#FFFDF7', border: '1px solid ' + LINE, borderRadius: '8px', padding: '10px 12px', lineHeight: 1.7 }}>
        <strong style={{ color: INK }}>自分のノートやメモを見ながら書いてください。</strong>
        前後の記録を一緒に出してあるので、その間のページを探せば見つかります。
        まだ受けていない項目は、下のボタンを押してください。
      </div>

      {/* 未記入だけを先頭に出す */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
        {holeRows.map(({ it, prev, next }) => {
          const a = answers[it.id] || {};
          const notYet = a.kind === 'notyet';
          const answered = notYet || !!a.date;
          return (
            <div key={it.id} style={{ background: '#FFFFFF', border: '2px solid ' + (answered ? '#BFD3C4' : '#D8C9A8'), borderRadius: '12px', padding: '13px 14px' }}>
              <div style={{ fontSize: '10.5px', color: '#B0A99A', fontWeight: 700 }}>{it.category || ''}</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: INK, marginTop: '2px' }}>{it.name}</div>

              {(prev || next) && (
                <div style={{ fontSize: '11px', color: '#9C9486', marginTop: '8px', background: '#F7F5EF', borderRadius: '7px', padding: '7px 9px', lineHeight: 1.65 }}>
                  <div style={{ fontWeight: 700, color: '#8A8378', marginBottom: '2px' }}>前後の項目の記録</div>
                  {prev && <div>{prev.name}　{prev.date.replace(/-/g, '/')}</div>}
                  {next && <div>{next.name}　{next.date.replace(/-/g, '/')}</div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', marginTop: '11px' }}>
                <select value={a.y || ''} disabled={notYet} onChange={e => setPart(it.id, 'y', e.target.value)}
                  style={{ ...selStyle, background: notYet ? '#F0EDE6' : BG, color: notYet ? '#C2BBA9' : INK }}>
                  <option value="">年</option>
                  {yearOpts().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={a.m || ''} disabled={notYet} onChange={e => setPart(it.id, 'm', e.target.value)}
                  style={{ ...selStyle, background: notYet ? '#F0EDE6' : BG, color: notYet ? '#C2BBA9' : INK }}>
                  <option value="">月</option>
                  {monthOpts(a.y).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={a.d || ''} disabled={notYet || !a.y || !a.m} onChange={e => setPart(it.id, 'd', e.target.value)}
                  style={{ ...selStyle, background: (notYet || !a.y || !a.m) ? '#F0EDE6' : BG, color: (notYet || !a.y || !a.m) ? '#C2BBA9' : INK }}>
                  <option value="">日</option>
                  {dayOpts(a.y, a.m).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <button onClick={() => toggleNotYet(it.id)}
                style={{ marginTop: '8px', fontSize: '12px', fontWeight: notYet ? 800 : 500,
                  padding: '8px 12px', borderRadius: '8px', width: '100%',
                  border: notYet ? '1px solid ' + INK : '1px solid ' + LINE,
                  background: notYet ? INK : '#FFFFFF', color: notYet ? '#FAF8F4' : SUB,
                  cursor: 'pointer', fontFamily: 'inherit' }}>
                まだ受けていない
              </button>
            </div>
          );
        })}
      </div>

      {/* これまでの記録（読み取り専用） */}
      <div style={{ marginTop: '22px' }}>
        <button onClick={() => setShowAll(v => !v)}
          style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid ' + LINE, background: '#FFFFFF', color: SUB, fontSize: '12.5px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {showAll ? 'これまでの記録を閉じる' : 'これまでの記録を見る（' + (items.length - holeRows.length) + '件）'}
        </button>
        {showAll && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
            {groups.map(g => (
              <div key={g.cat}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#B0A99A', letterSpacing: '0.04em', marginBottom: '6px' }}>{g.cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {g.rows.map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 11px', borderRadius: '8px', background: it.date ? '#F5F2EB' : '#FBF2DF', border: '1px solid ' + (it.date ? '#EDE8DC' : '#E8D9B4') }}>
                      <span style={{ fontSize: '12.5px', color: it.date ? '#9C9486' : '#8A6B2F', flex: '1 1 auto', fontWeight: it.date ? 400 : 700 }}>{it.name}</span>
                      <span style={{ fontSize: '12px', color: it.date ? '#9C9486' : '#8A6B2F', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {it.date === '\u25CE' ? '\u25CE 飛び級' : it.date ? it.date.replace(/-/g, '/') : '未記入'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', position: 'sticky', bottom: '12px' }}>
        <button onClick={submit} disabled={sending || remaining.length > 0}
          style={{
            width: '100%', padding: '15px', borderRadius: '12px', border: 'none',
            background: remaining.length > 0 ? '#D8D2C4' : INK,
            color: remaining.length > 0 ? '#8A8378' : '#FAF8F4',
            fontSize: '14.5px', fontWeight: 800, fontFamily: 'inherit',
            cursor: remaining.length > 0 ? 'default' : 'pointer',
          }}>
          {sending ? '送信中…' : done ? '送信しました（もう一度送れます）' : remaining.length > 0 ? '残り' + remaining.length + '項目' : '送信する'}
        </button>
        {done && (
          <div style={{ fontSize: '12px', color: '#2B4A3A', fontWeight: 700, marginTop: '10px', textAlign: 'center' }}>
            ありがとうございました。内容を確認してカリキュラムに反映します。
          </div>
        )}
      </div>
    </Box>
  );
}
