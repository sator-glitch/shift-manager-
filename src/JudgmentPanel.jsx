import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

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
// 最終ジャッジを押した時点でカリキュラムの合格マトリクスに反映される。
//   途中のカウント（大ロール人頭2など）… 不合格でも日付が入る（カウントは進む）
//   最終のカウント／カウントでない項目 … 合格のときだけ日付が入る
//   合格した場合、そのシリーズの残りには ◎（飛び級）が付く。実際にやった日ではないので
//   日付は入れない（Curriculum.jsx は ◎ を日数計算から除外している）
//   ノーカウント／モデルキャンセル … 何も書かない
// 補講は勉強会以外の日に終わるので、従来どおりカリキュラム画面で日付を入れる。
//
// 1日に2項目合格することがあるため、1人につき複数の判定を持てる（判定は配列）。
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

// 最終ジャッジのあとに、カリキュラムへ何を書いたかをそのまま出す
function writeMessage(item, info, finalCall, dateStr) {
  if (!item) return '';
  if (finalCall === 'pass') {
    if (info && info.num < info.max) {
      const base = item.name.replace(/(\d+)(\)?)$/, '');
      const rest = info.num + 1 === info.max
        ? base + info.max
        : base + (info.num + 1) + '〜' + base + info.max;
      return 'カリキュラムの ' + item.name + ' に ' + dateStr + '、' + rest + ' に ◎（飛び級）を付けました';
    }
    return 'カリキュラムの ' + item.name + ' に ' + dateStr + ' を記入しました';
  }
  if (info && !info.isFinal) {
    return 'カリキュラムの ' + item.name + ' に ' + dateStr + ' を記入しました（カウントのみ）';
  }
  return '不合格なので、カリキュラムには日付を入れていません';
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
              }}>{txt}</button>
          );
        })}
      </div>
      {locked && <span style={{ fontSize: '10.5px', color: '#B0A99A' }}>{lockMsg}</span>}
    </div>
  );
}

// 回数に数えない理由のボタン。どちらもカリキュラムには何も書かない
function StatusButton({ label, active, title, onClick }) {
  return (
    <button type="button" title={title} onClick={onClick}
      style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'inherit', padding: '3px 10px',
        borderRadius: '999px', cursor: 'pointer',
        border: active ? '1px solid #A9742A' : '1px solid #E2DCCC',
        background: active ? '#A9742A' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#8A8378' }}>{label}</button>
  );
}

// 判定は配列で持つが、古い形（1人1件のオブジェクト）が残っていても落ちないようにする。
// id が無い古いデータには、その場で仮のキーを与える。
export function asEntryList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map((e, i) => (e.id ? e : { ...e, id: 'legacy' + i }));
  if (v && typeof v === 'object') return [{ ...v, id: v.id || 'legacy0' }];
  return [];
}

export default function JudgmentPanel({ dateStr, day, curriculum, staffLink, nameById, onSet, onAdd, onRemove }) {
  const [openFor, setOpenFor] = useState({});
  const label = (id, type) => (typeof nameById === 'function' ? (nameById(id, type) || '（名前なし）') : id);

  const pairs = [];
  Object.entries((day && day.dayPairings) || {}).forEach(([tid, aids]) => {
    (aids || []).forEach(aid => pairs.push({ trainerId: tid, assistantId: aid }));
  });

  const title = <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361EE', marginBottom: '4px' }}>Step 5｜合否の判定</div>;
  if (pairs.length === 0) {
    return <div>{title}<div style={{ fontSize: '12px', color: '#B0A99A' }}>Step 4で担当を割り振ると、ここに判定欄が出ます。</div></div>;
  }

  const curricula = Array.isArray(curriculum && curriculum.curricula) ? curriculum.curricula : [];
  const records = (curriculum && curriculum.records) || {};

  // その人がいま取り組んでいるはずの項目。単に「最初の未合格項目」を返すと、前のほうに
  // 飛ばした項目が残っている人がずっと手前に引き戻されるため、最後に合格した項目より
  // 後ろで、いちばん手前の未合格項目を返す。excludeIds は同じ日に既に選んでいる項目。
  function nextItemIdFor(assistantId, excludeIds) {
    const sid = staffLink && staffLink[assistantId];
    if (!sid) return '';
    const rec = records[sid] || {};
    let last = -1;
    curricula.forEach((c, i) => { if (rec[c.id]) last = i; });
    const found = curricula.slice(last + 1).find(c => !rec[c.id] && (excludeIds || []).indexOf(c.id) < 0);
    return found ? found.id : '';
  }
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
          const entries = asEntryList(((day && day.judgments) || {})[assistantId]);
          const trainerName = label(trainerId, 'trainer');
          const assistantName = label(assistantId, 'assistant');
          const linked = !!(staffLink && staffLink[assistantId]);

          if (entries.length === 0 && !openFor[assistantId]) {
            return (
              <div key={assistantId} style={{ border: '1px solid #EEE9DE', borderRadius: '10px', padding: '10px 12px', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#8A8378' }}>{trainerName}</span>
                <span style={{ fontSize: '11px', color: '#C2BBA9' }}>→</span>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{assistantName}</span>
                <button onClick={() => { setOpenFor(p => ({ ...p, [assistantId]: true })); onAdd(dateStr, assistantId, trainerId, nextItemIdFor(assistantId, [])); }}
                  style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FAF8F4', cursor: 'pointer', color: '#2B2823' }}>
                  判定を記録する
                </button>
              </div>
            );
          }

          const used = entries.map(e => e.curriculumId).filter(Boolean);

          return (
            <div key={assistantId} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {entries.map((j, idx) => {
                const item = curricula.find(c => c.id === j.curriculumId) || null;
                const info = item ? countInfoOf(curricula, item) : null;
                const agreed = j.trainerCall && j.leaderCall && j.trainerCall === j.leaderCall;
                const split = j.trainerCall && j.leaderCall && j.trainerCall !== j.leaderCall;
                const skipped = j.status === 'nocount' || j.status === 'modelcancel';

                return (
                  <div key={j.id} style={{ border: '1px solid #E2DCCC', borderRadius: '10px', padding: '12px 13px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: '#8A8378' }}>{trainerName}</span>
                      <span style={{ fontSize: '11px', color: '#C2BBA9' }}>→</span>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{assistantName}</span>
                      {entries.length > 1 && <span style={{ fontSize: '10px', color: '#B0A99A' }}>{idx + 1}件目</span>}
                      {info && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                          background: info.isFinal ? '#F4EAE8' : '#F0F0EA', color: info.isFinal ? '#B0746A' : '#8A8378' }}>
                          {info.isFinal ? '最終 ' + info.num + '/' + info.max : 'カウント ' + info.num + '/' + info.max}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <StatusButton label="ノーカウント" active={j.status === 'nocount'} title="回数に数えない場合"
                          onClick={() => onSet(dateStr, assistantId, j.id, { status: j.status === 'nocount' ? null : 'nocount' })} />
                        <StatusButton label="モデルキャンセル" active={j.status === 'modelcancel'} title="モデルが来なかった場合"
                          onClick={() => onSet(dateStr, assistantId, j.id, { status: j.status === 'modelcancel' ? null : 'modelcancel' })} />
                        <button onClick={() => { if (entries.length === 1) setOpenFor(p => ({ ...p, [assistantId]: false })); onRemove(dateStr, assistantId, j.id); }}
                          title="この判定を取り消す"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', padding: '2px' }}>
                          <X size={14} />
                        </button>
                      </span>
                    </div>

                    <select value={j.curriculumId || ''} onChange={e => onSet(dateStr, assistantId, j.id, { curriculumId: e.target.value })}
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
                    {linked && idx === 0 && skippedCountFor(assistantId) > 0 && (
                      <div style={{ fontSize: '10.5px', color: '#8A8378' }}>
                        手前に未合格の項目が{skippedCountFor(assistantId)}件あります（飛ばして進んでいる分）
                      </div>
                    )}

                    {skipped ? (
                      <div style={{ fontSize: '11.5px', color: '#A9742A', fontWeight: 700 }}>
                        {j.status === 'nocount' ? 'ノーカウントです。' : 'モデルキャンセルです。'}
                        回数に数えず、カリキュラムにも何も書きません。
                      </div>
                    ) : (<>
                      {j.finalCall === 'fail' && info && !info.isFinal && (
                        <div style={{ fontSize: '10.5px', color: '#2B4A3A' }}>
                          途中のカウントなので、不合格でもこの日付が {item ? item.name : 'この項目'} に入ります
                        </div>
                      )}
                      <CallRow label={trainerName + 'の判定'} value={j.trainerCall}
                        onPick={v => onSet(dateStr, assistantId, j.id, { trainerCall: v })} />
                      <CallRow label="リーダーの判定" value={j.leaderCall} leader
                        locked={!j.trainerCall} lockMsg="トレーナーの判定を先に"
                        onPick={v => onSet(dateStr, assistantId, j.id, { leaderCall: v })} />
                      {(agreed || split) && (
                        <div style={{ borderTop: '1px dashed #E2DCCC', paddingTop: '9px' }}>
                          <CallRow label="最終ジャッジ" value={j.finalCall} strong
                            onPick={v => onSet(dateStr, assistantId, j.id, { finalCall: v })} />
                          {agreed && <div style={{ fontSize: '11px', color: '#2B4A3A', fontWeight: 700, marginTop: '4px' }}>二人の判定が一致しています</div>}
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

              {entries.length > 0 && (
                <button onClick={() => onAdd(dateStr, assistantId, trainerId, nextItemIdFor(assistantId, used))}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, padding: '4px 11px', borderRadius: '6px', border: '1px dashed #E2DCCC', background: 'transparent', cursor: 'pointer', color: '#8A8378' }}>
                  <Plus size={11} /> {assistantName} に項目を追加
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
