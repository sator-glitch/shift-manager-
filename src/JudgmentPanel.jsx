import React, { useState } from 'react';
import { X } from 'lucide-react';

// ===========================================================================
// Step 5：合否の判定
//
// 担当トレーナーとリーダーがそれぞれ別に合否を出し、割れた場合は話し合った結果を
// 「最終ジャッジ」として記録する。一致・不一致の蓄積が、リーダー格を増やすための
// 判断材料になる。
//
// リーダーが先に「どう？」と聞き、トレーナーの答えを入れてから自分の判定を入れること。
// 逆順だとトレーナーの判定がただの追認になり、データとして意味を持たなくなる。
// リーダー側のボタンはトレーナーの判定が入るまで押せないようにしてある。
//
// カリキュラムへの書き込みはここでは行わない。補講など勉強会以外の日に終わるものが
// あり日付が自動で決まらないため、合格日は従来どおりカリキュラム画面で入れる。
// ===========================================================================

// 「デンマン人頭1」「ブリーチ人頭(リタッチ3)」のような連番項目を分解する
function splitCountName(name) {
  const m = /^(.*?)(\d+)(\)?)$/.exec(name || '');
  if (!m) return null;
  return { base: m[1] + '|' + m[3], num: Number(m[2]) };
}

// 連番項目なら「何回目 / 全何回」を返す。連番でなければ null（＝ふつうの合格項目）
function countInfoOf(curricula, item) {
  const cur = splitCountName(item && item.name);
  if (!cur) return null;
  let max = cur.num;
  (curricula || []).forEach(c => {
    const o = splitCountName(c.name);
    if (o && o.base === cur.base && o.num > max) max = o.num;
  });
  return { num: cur.num, max, isFinal: cur.num === max };
}

function CallRow({ label, value, onPick, leader, strong, locked, lockMsg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '11px', minWidth: '96px', fontWeight: (leader || strong) ? 700 : 400,
        color: leader ? '#B0746A' : (strong ? '#2B2823' : '#8A8378') }}>{label}</span>
      <div style={{ display: 'flex', gap: '5px' }}>
        {[['pass', '合格'], ['fail', '不合格']].map(([v, txt]) => {
          const on = value === v;
          return (
            <button key={v} type="button" disabled={locked} onClick={() => onPick(on ? null : v)}
              style={{
                fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                padding: '6px 15px', borderRadius: '7px',
                cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.38 : 1,
                border: on ? '1px solid #2B2823' : '1px solid #E2DCCC',
                background: on ? '#2B2823' : '#FFFFFF',
                color: on ? '#FAF8F4' : '#2B2823',
              }}>
              {txt}
            </button>
          );
        })}
      </div>
      {locked && <span style={{ fontSize: '10.5px', color: '#B0A99A' }}>{lockMsg}</span>}
    </div>
  );
}

export default function JudgmentPanel({ dateStr, day, curriculum, staffLink, nameById, onSet }) {
  const [openFor, setOpenFor] = useState({}); // 「判定を記録する」を押した人だけ開く

  const pairs = [];
  Object.entries((day && day.dayPairings) || {}).forEach(([tid, aids]) => {
    (aids || []).forEach(aid => pairs.push({ trainerId: tid, assistantId: aid }));
  });

  const title = <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361EE', marginBottom: '4px' }}>Step 5｜合否の判定</div>;

  if (pairs.length === 0) {
    return (
      <div>
        {title}
        <div style={{ fontSize: '12px', color: '#B0A99A' }}>Step 4で担当を割り振ると、ここに判定欄が出ます。</div>
      </div>
    );
  }

  const curricula = (curriculum && curriculum.curricula) || [];
  const records = (curriculum && curriculum.records) || {};

  // その人がまだ合格していない、いちばん手前の項目
  function nextItemIdFor(assistantId) {
    const sid = staffLink && staffLink[assistantId];
    if (!sid) return '';
    const rec = records[sid] || {};
    const found = curricula.find(c => !rec[c.id]);
    return found ? found.id : '';
  }
  function passedDateOf(assistantId, currId) {
    const sid = staffLink && staffLink[assistantId];
    if (!sid) return null;
    return (records[sid] || {})[currId] || null;
  }

  const byCategory = [];
  curricula.forEach(c => {
    const cat = c.category || '未分類';
    let g = byCategory.find(x => x.cat === cat);
    if (!g) { g = { cat, items: [] }; byCategory.push(g); }
    g.items.push(c);
  });

  return (
    <div>
      {title}
      <div style={{ fontSize: '11px', color: '#8A8378', marginBottom: '10px', lineHeight: 1.7 }}>
        リーダーが先に「どう？」と聞き、トレーナーの答えを入れてから自分の判定を入れてください。
        逆の順番だと、トレーナーの判定がただの追認になりデータになりません。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pairs.map(({ trainerId, assistantId }) => {
          const j = ((day && day.judgments) || {})[assistantId] || {};
          const isOpen = !!openFor[assistantId] || !!j.curriculumId || !!j.trainerCall;
          const trainerName = nameById(trainerId, 'trainer');
          const assistantName = nameById(assistantId, 'assistant');
          const linked = !!(staffLink && staffLink[assistantId]);

          if (!isOpen) {
            return (
              <div key={assistantId} style={{ border: '1px solid #EEE9DE', borderRadius: '10px', padding: '10px 12px', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#8A8378' }}>{trainerName}</span>
                <span style={{ fontSize: '11px', color: '#C2BBA9' }}>→</span>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{assistantName}</span>
                <button
                  onClick={() => {
                    setOpenFor(prev => ({ ...prev, [assistantId]: true }));
                    onSet(dateStr, assistantId, { trainerId, curriculumId: nextItemIdFor(assistantId) });
                  }}
                  style={{ marginLeft: 'auto', fontSize: '11px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FAF8F4', cursor: 'pointer', color: '#2B2823', fontWeight: 600 }}>
                  判定を記録する
                </button>
              </div>
            );
          }

          const item = curricula.find(c => c.id === j.curriculumId) || null;
          const info = item ? countInfoOf(curricula, item) : null;
          const agreed = j.trainerCall && j.leaderCall && j.trainerCall === j.leaderCall;
          const split = j.trainerCall && j.leaderCall && j.trainerCall !== j.leaderCall;

          return (
            <div key={assistantId} style={{ border: '1px solid #E2DCCC', borderRadius: '10px', padding: '12px 13px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#8A8378' }}>{trainerName}</span>
                <span style={{ fontSize: '11px', color: '#C2BBA9' }}>→</span>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{assistantName}</span>
                {info && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                    background: info.isFinal ? '#F4EAE8' : '#F0F0EA', color: info.isFinal ? '#B0746A' : '#8A8378' }}>
                    {info.isFinal ? '最終 ' + info.num + '/' + info.max : 'カウント ' + info.num + '/' + info.max}
                  </span>
                )}
                <button onClick={() => { setOpenFor(prev => ({ ...prev, [assistantId]: false })); onSet(dateStr, assistantId, { remove: true }); }}
                  title="この判定を取り消す"
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', padding: '2px' }}>
                  <X size={14} />
                </button>
              </div>

              <select value={j.curriculumId || ''} onChange={e => onSet(dateStr, assistantId, { curriculumId: e.target.value })}
                style={{ width: '100%', fontSize: '12px', padding: '7px 9px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FAF8F4', color: '#2B2823', fontFamily: 'inherit' }}>
                <option value="">項目を選ぶ</option>
                {byCategory.map(g => (
                  <optgroup key={g.cat} label={g.cat}>
                    {g.items.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{passedDateOf(assistantId, c.id) ? '　済' : ''}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {!linked && (
                <div style={{ fontSize: '10.5px', color: '#B0746A' }}>
                  この人はカリキュラム側と紐付いていないため、次の項目を自動で選べません。項目は手で選んでください。
                </div>
              )}

              <CallRow label={trainerName + 'の判定'} value={j.trainerCall}
                onPick={v => onSet(dateStr, assistantId, { trainerCall: v })} />
              <CallRow label="リーダーの判定" value={j.leaderCall} leader
                locked={!j.trainerCall} lockMsg="トレーナーの判定を先に"
                onPick={v => onSet(dateStr, assistantId, { leaderCall: v })} />

              {(agreed || split) && (
                <div style={{ borderTop: '1px dashed #E2DCCC', paddingTop: '9px' }}>
                  <CallRow label="最終ジャッジ" value={j.finalCall} strong
                    onPick={v => onSet(dateStr, assistantId, { finalCall: v })} />
                  {agreed && (
                    <div style={{ fontSize: '11px', color: '#2B4A3A', fontWeight: 700, marginTop: '4px' }}>二人の判定が一致しています</div>
                  )}
                  {split && (
                    <div style={{ fontSize: '11px', color: '#A9742A', fontWeight: 700, marginTop: '4px' }}>
                      判定が割れています。話し合った結果を最終ジャッジに入れてください。
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
