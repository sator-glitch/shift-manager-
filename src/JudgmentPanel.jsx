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
// 最終ジャッジを押した時点でカリキュラムの合格マトリクスに日付が入る。
//   途中のカウント（大ロール人頭2など）… 不合格でも日付が入る（カウントは進む）
//   最終のカウント／カウントでない項目 … 合格のときだけ日付が入る
//   合格した場合、そのシリーズの残り（大ロール人頭1で合格なら2〜4）にも日付が入る＝飛び級
//   ノーカウント（モデルの都合などで回数に数えない）… 何も書かない
// 補講は勉強会以外の日に終わるので、従来どおりカリキュラム画面で日付を入れる。
// ===========================================================================

// 「デンマン人頭1」「ブリーチ人頭(リタッチ3)」のような連番項目を分解する
export function splitCountName(name) {
  const m = /^(.*?)(\d+)(\)?)$/.exec(name || '');
  if (!m) return null;
  return { base: m[1] + '|' + m[3], num: Number(m[2]) };
}

// 連番項目なら「何回目 / 全何回」を返す。連番でなければ null（＝ふつうの合格項目）
export function countInfoOf(curricula, item) {
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

  // その人がいま取り組んでいるはずの項目。
  // 単に「最初の未合格項目」を返すと、前のほうに飛ばした項目が残っている人が
  // ずっと手前に引き戻されてしまう（例：人頭まで進んでいるのにマニキュア流しが出る）。
  // そのため「最後に合格した項目より後ろで、いちばん手前の未合格項目」を返す。
  function nextItemIdFor(assistantId) {
    const sid = staffLink && staffLink[assistantId];
    if (!sid) return '';
    const rec = records[sid] || {};
    let last = -1;
    curricula.forEach((c, i) => { if (rec[c.id]) last = i; });
    const found = curricula.slice(last + 1).find(c => !rec[c.id]);
    return found ? found.id : '';
  }

  // 最後に合格した項目より手前で、まだ合格していない項目（飛ばしているもの）
  function skippedCountFor(assistantId) {
    const sid = staffLink && staffLink[assistantId];
    if (!sid) return 0;
    const rec = records[sid] || {};
    let last = -1;
    curricula.forEach((c, i) => { if (rec[c.id]) last = i; });
    if (last < 0) return 0;
    return curricula.slice(0, last).filter(c => !rec[c.id]).length;
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
                <button type="button" onClick={() => onSet(dateStr, assistantId, { noCount: !j.noCount })}
                  title="モデルの都合などで回数に数えない場合"
                  style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', cursor: 'pointer',
                    border: j.noCount ? '1px solid #A9742A' : '1px solid #E2DCCC',
                    background: j.noCount ? '#A9742A' : '#FFFFFF',
                    color: j.noCount ? '#FFFFFF' : '#8A8378' }}>
                  ノーカウント
                </button>
                <button onClick={() => { setOpenFor(prev => ({ ...prev, [assistantId]: false })); onSet(dateStr, assistantId, { remove: true }); }}
                  title="この判定を取り消す"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', padding: '2px' }}>
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
              {linked && skippedCountFor(assistantId) > 0 && (
                <div style={{ fontSize: '10.5px', color: '#8A8378' }}>
                  手前に未合格の項目が{skippedCountFor(assistantId)}件あります（飛ばして進んでいる分）
                </div>
              )}

              {j.noCount ? (
                <div style={{ fontSize: '11.5px', color: '#A9742A', fontWeight: 700 }}>
                  ノーカウントです。回数に数えず、カリキュラムにも何も書きません。
                </div>
              ) : (<>
              <CallRow label={trainerName + 'の判定'} value={j.trainerCall}
                onPick={v => onSet(dateStr, assistantId, { trainerCall: v })} />
              <CallRow label="リーダーの判定" value={j.leaderCall} leader
                locked={!j.trainerCall} lockMsg="トレーナーの判定を先に"
                onPick={v => onSet(dateStr, assistantId, { leaderCall: v })} />

              {j.finalCall === 'fail' && info && !info.isFinal && (
                <div style={{ fontSize: '10.5px', color: '#2B4A3A' }}>
                  途中のカウントなので、不合格でもこの日付が {item.name} に入ります
                </div>
              )}
              {(agreed || split) && (
                <div style={{ borderTop: '1px dashed #E2DCCC', paddingTop: '9px' }}>
                  <CallRow label="最終ジャッジ" value={j.finalCall} strong
                    onPick={v => onSet(dateStr, assistantId, { finalCall: v })} />
                  {agreed && (
                    <div style={{ fontSize: '11px', color: '#2B4A3A', fontWeight: 700, marginTop: '4px' }}>二人の判定が一致しています</div>
                  )}
                  {split && !j.finalCall && (
                    <div style={{ fontSize: '11px', color: '#A9742A', fontWeight: 700, marginTop: '4px' }}>
                      判定が割れています。話し合った結果を最終ジャッジに入れてください。
                    </div>
                  )}
                  {j.finalCall && (
                    <div style={{ fontSize: '11px', color: '#8A8378', marginTop: '4px' }}>
                      {writeMessage(item, info, j.finalCall, dateStr)}
                    </div>
                  )}
                </div>
              )}
              </>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 最終ジャッジのあとに、カリキュラムへ何を書いたかをそのまま出す
function writeMessage(item, info, finalCall, dateStr) {
  if (!item) return '';
  if (finalCall === 'pass') {
    if (info && info.num < info.max) {
      // 飛び級。残りのカウントにも同じ日付が入る
      const base = item.name.replace(/(\d+)(\)?)$/, '');
      return 'カリキュラムの ' + item.name + ' から ' + base + info.max + ' まで、' + dateStr + ' を記入しました（飛び級）';
    }
    return 'カリキュラムの ' + item.name + ' に ' + dateStr + ' を記入しました';
  }
  if (info && !info.isFinal) {
    return 'カリキュラムの ' + item.name + ' に ' + dateStr + ' を記入しました（カウントのみ）';
  }
  return '不合格なので、カリキュラムには日付を入れていません';
}
