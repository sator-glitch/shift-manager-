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

const TODAY = new Date().toISOString().slice(0, 10);

export default function BackfillApp() {
  const [staffId, setStaffId] = useState('');
  const [ask, setAsk] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

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

  function setKind(id, kind) {
    setAnswers(prev => {
      const cur = prev[id] || {};
      return { ...prev, [id]: { ...cur, kind } };
    });
    setDone(false);
  }
  function setField(id, field, v) {
    setAnswers(prev => ({ ...prev, [id]: { ...(prev[id] || {}), kind: 'passed', [field]: v || null } }));
    setDone(false);
  }

  const items = (ask && ask.items) || [];
  const remaining = items.filter(it => {
    const a = answers[it.id];
    if (!a || !a.kind) return true;
    if (a.kind === 'passed') return !a.date || !a.certainty;
    return false;
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
        カリキュラムの記録が抜けている項目があります。下の{items.length}項目について、
        <strong style={{ color: INK }}>合格した日</strong>を教えてください。
      </div>
      <div style={{ fontSize: '12px', color: SUB, marginTop: '10px', background: '#FFFDF7', border: '1px solid ' + LINE, borderRadius: '8px', padding: '10px 12px', lineHeight: 1.7 }}>
        <strong style={{ color: INK }}>自分のノートやメモを見ながら書いてください。</strong>
        記録が見つからないものは「覚えていない」で構いません。うろ覚えの日付を無理に書くより、そのほうが助かります。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px' }}>
        {items.map(it => {
          const a = answers[it.id] || {};
          return (
            <div key={it.id} style={{ background: '#FFFFFF', border: '1px solid ' + LINE, borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '10.5px', color: '#B0A99A', fontWeight: 700 }}>{it.category || ''}</div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: INK, marginTop: '2px' }}>{it.name}</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '11px' }}>
                <Pick label="合格した" active={a.kind === 'passed'} onClick={() => setKind(it.id, 'passed')} />
                <Pick label="まだ受けていない" active={a.kind === 'notyet'} onClick={() => setKind(it.id, 'notyet')} />
                <Pick label="覚えていない" active={a.kind === 'unknown'} onClick={() => setKind(it.id, 'unknown')} />
              </div>
              {a.kind === 'passed' && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11.5px', color: SUB, marginBottom: '6px' }}>合格した日</div>
                  <input type="date" value={a.date || ''} max={TODAY} min="2022-01-01"
                    onChange={e => setField(it.id, 'date', e.target.value)}
                    style={{ width: '100%', fontSize: '15px', padding: '10px', borderRadius: '8px', border: '1px solid ' + LINE, background: BG, fontFamily: 'inherit', color: INK, boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '11.5px', color: SUB, margin: '10px 0 6px' }}>この日付はどこから？</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Pick label="メモに書いてある" active={a.certainty === 'note'} onClick={() => setField(it.id, 'certainty', 'note')} />
                    <Pick label="うろ覚え" active={a.certainty === 'memory'} onClick={() => setField(it.id, 'certainty', 'memory')} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
