import React, { useState, useEffect } from 'react';
import { ASK_PREFIX, ANS_PREFIX } from './Backfill.jsx';

// 到達点（最後に記録がある項目）より手前にある未記入＝「穴」
export function holesOf(data, staff) {
  const rec = data.records[staff.id] || {};
  let last = -1;
  data.curricula.forEach((c, i) => { if (rec[c.id]) last = i; });
  if (last < 0) return [];
  return data.curricula.slice(0, last).filter(c => !rec[c.id]);
}

const LINE = '#E2DCCC', INK = '#2B2823', SUB = '#8A8378';
const btn = { fontSize: '11.5px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' };
const btnDark = { ...btn, border: 'none', background: INK, color: '#FAF8F4' };
const btnPlain = { ...btn, border: '1px solid ' + LINE, background: '#FFFFFF', color: SUB };

export default function BackfillAdmin({ data, onApply }) {
  const [asked, setAsked] = useState({});     // staffId -> true（依頼済み）
  const [answers, setAnswers] = useState({}); // staffId -> { name, answers, submittedAt }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState('');

  const targets = data.staff
    .filter(s => !s.retired)
    .map(s => ({ staff: s, holes: holesOf(data, s) }))
    .filter(t => t.holes.length > 0)
    .sort((a, b) => b.holes.length - a.holes.length);

  const totalHoles = targets.reduce((a, t) => a + t.holes.length, 0);

  async function reload() {
    setBusy(true);
    const ask = {}, ans = {};
    await Promise.all(targets.map(async t => {
      try { await window.storage.get(ASK_PREFIX + t.staff.id); ask[t.staff.id] = true; } catch (e) {}
      try {
        const r = await window.storage.get(ANS_PREFIX + t.staff.id);
        ans[t.staff.id] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      } catch (e) {}
    }));
    setAsked(ask); setAnswers(ans); setBusy(false);
  }
  useEffect(() => { reload(); }, [data.staff.length, data.curricula.length]);

  async function createAsks() {
    setBusy(true); setMsg('');
    let n = 0;
    for (const t of targets) {
      try {
        await window.storage.set(ASK_PREFIX + t.staff.id, JSON.stringify({
          name: t.staff.name,
          items: t.holes.map(c => ({ id: c.id, name: c.name, category: c.category || '' })),
          createdAt: new Date().toISOString(),
        }));
        n++;
      } catch (e) {}
    }
    setMsg(n + '名分の依頼を作りました。下のリンクを本人に送ってください。');
    await reload();
  }

  function linkFor(id) { return window.location.origin + '/backfill.html?s=' + id; }
  function copy(id) {
    const url = linkFor(id);
    try { navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch (e) {}
  }

  // 1人分の回答を承認してカリキュラムに反映
  async function approve(staffId) {
    const sub = answers[staffId];
    if (!sub) return;
    const writes = [];
    const rec = data.records[staffId] || {};
    Object.keys(sub.answers || {}).forEach(currId => {
      const a = sub.answers[currId];
      if (rec[currId]) return; // この間に手で入った分は上書きしない
      if (a && a.kind === 'passed' && a.date) {
        writes.push({ currId, date: a.date, source: a.certainty === 'note' ? 'note' : 'memory' });
      }
    });
    setBusy(true);
    await onApply(staffId, writes);
    try { await window.storage.delete(ANS_PREFIX + staffId); } catch (e) {}
    try { await window.storage.delete(ASK_PREFIX + staffId); } catch (e) {}
    setMsg((data.staff.find(s => s.id === staffId) || {}).name + ' さんの回答を反映しました（' + writes.length + '件）');
    await reload();
  }

  async function discard(staffId) {
    setBusy(true);
    try { await window.storage.delete(ANS_PREFIX + staffId); } catch (e) {}
    setMsg('回答を破棄しました（依頼は残っているので、もう一度答えてもらえます）');
    await reload();
  }

  const submitted = targets.filter(t => answers[t.staff.id]);

  return (
    <div>
      <div style={{ fontSize: '12px', color: SUB, lineHeight: 1.8, marginBottom: '14px' }}>
        到達点より手前にある未記入は、現在 <strong style={{ color: INK }}>{totalHoles}件 / {targets.length}名</strong>。
        本人にリンクを送り、<strong style={{ color: INK }}>自分のノートを見ながら合格日</strong>を書いてもらって、ここで承認するとカリキュラムに入ります。
        メモに書いてあった日付はそのまま学年比較に使います。
        <strong style={{ color: INK }}>「うろ覚え」と答えられた日付だけ</strong>、学年比較の日数計算から除外されます（◎と同じ扱い）。
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={createAsks} disabled={busy} style={btnDark}>
          {busy ? '処理中…' : '依頼を作成する（' + targets.length + '名）'}
        </button>
        <button onClick={reload} disabled={busy} style={btnPlain}>回答を再読み込み</button>
        {msg && <span style={{ fontSize: '11.5px', color: '#2B4A3A', fontWeight: 700 }}>{msg}</span>}
      </div>

      {submitted.length > 0 && (
        <div style={{ marginBottom: '22px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: INK, marginBottom: '8px' }}>回答が届いています（{submitted.length}名）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {submitted.map(t => {
              const sub = answers[t.staff.id];
              const rows = t.holes.map(c => ({ c, a: (sub.answers || {})[c.id] || {} }));
              const passed = rows.filter(r => r.a.kind === 'passed' && r.a.date);
              return (
                <div key={t.staff.id} style={{ background: '#FFFDF7', border: '1px solid ' + LINE, borderRadius: '10px', padding: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: INK }}>{t.staff.name}</span>
                    <span style={{ fontSize: '10.5px', color: SUB }}>{(sub.submittedAt || '').slice(0, 10)}</span>
                    <button onClick={() => approve(t.staff.id)} disabled={busy || passed.length === 0}
                      style={{ ...btnDark, marginLeft: 'auto', opacity: passed.length === 0 ? 0.4 : 1 }}>
                      {passed.length}件を反映する
                    </button>
                    <button onClick={() => discard(t.staff.id)} disabled={busy} style={btnPlain}>破棄</button>
                  </div>
                  <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {rows.map(r => (
                      <div key={r.c.id} style={{ display: 'flex', fontSize: '12px', gap: '8px', alignItems: 'baseline' }}>
                        <span style={{ color: INK, minWidth: '0', flex: '1 1 auto' }}>{r.c.name}</span>
                        <span style={{
                          fontWeight: 700,
                          color: r.a.kind === 'passed' ? '#2B4A3A' : r.a.kind === 'notyet' ? SUB : '#A9742A',
                        }}>
                          {r.a.kind === 'passed'
                            ? (r.a.date ? r.a.date.replace(/-/g, '/') + (r.a.certainty === 'note' ? '（メモ）' : 'ごろ（うろ覚え）') : '日付未入力')
                            : r.a.kind === 'notyet' ? 'まだ受けていない'
                            : r.a.kind === 'unknown' ? '覚えていない' : '未回答'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {rows.some(r => r.a.kind === 'unknown') && (
                    <div style={{ fontSize: '10.5px', color: '#A9742A', marginTop: '7px' }}>
                      「覚えていない」は反映されません。合格マトリクスで直接入れるか、当時のトレーナーに確認してください。
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: '13px', fontWeight: 800, color: INK, marginBottom: '8px' }}>本人に送るリンク</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {targets.map(t => (
          <div key={t.staff.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', border: '1px solid ' + LINE, borderRadius: '8px', padding: '9px 11px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>{t.staff.name}</span>
            <span style={{ fontSize: '10.5px', color: SUB }}>{t.holes.length}項目</span>
            {answers[t.staff.id]
              ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#2B4A3A', background: '#E8F1EA', padding: '2px 7px', borderRadius: '999px' }}>回答済</span>
              : asked[t.staff.id]
                ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A8378', background: '#F3F1EC', padding: '2px 7px', borderRadius: '999px' }}>依頼済</span>
                : <span style={{ fontSize: '10px', color: '#B0A99A' }}>未依頼</span>}
            <button onClick={() => copy(t.staff.id)} style={{ ...btnPlain, marginLeft: 'auto' }}>
              {copied === t.staff.id ? 'コピーしました' : 'リンクをコピー'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
