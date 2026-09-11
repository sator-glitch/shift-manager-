import React from 'react';

// ===========================================================================
// 判定の一致率（管理者のみ）
//
// 担当トレーナーとリーダーが別々に出した判定を突き合わせ、どれだけ一致しているかを
// 集計する。一致率が高い人はすでにリーダーと同じ基準を持っているということなので、
// リーダー格を増やすときの材料になる。ずれる向きも出す。
//
// リーダーや一般のトレーナーには見せない。自分の一致率が見えていると、
// リーダーの判定に寄せて答えるようになり、データとして成立しなくなるため。
// ===========================================================================

export default function JudgmentStats({ practiceDays, nameById }) {
  const rows = {};
  Object.values(practiceDays || {}).forEach(day => {
    Object.values((day && day.judgments) || {}).forEach(list => {
      (Array.isArray(list) ? list : [list]).forEach(j => {
      // ノーカウントとモデルキャンセルは、モデルの都合であって判断ではないので数えない
      if (!j || j.status || !j.trainerId || !j.trainerCall || !j.leaderCall) return;
      const r = rows[j.trainerId] || (rows[j.trainerId] = { total: 0, agree: 0, lenient: 0, strict: 0 });
      r.total += 1;
      if (j.trainerCall === j.leaderCall) r.agree += 1;
      else if (j.trainerCall === 'pass') r.lenient += 1; // トレーナーが合格・リーダーが不合格
      else r.strict += 1;                                 // トレーナーが不合格・リーダーが合格
      });
    });
  });

  const list = Object.entries(rows)
    .map(([id, r]) => ({ id, ...r, rate: r.total ? r.agree / r.total : 0 }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total);

  return (
    <div className="no-print" style={{ marginTop: '16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #EEE9DE', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 700 }}>判定の一致率</span>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#F4EAE8', color: '#B0746A' }}>管理者のみ</span>
      </div>
      <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '14px', lineHeight: 1.7 }}>
        担当トレーナーとリーダーが別々に出した判定の一致率です。トレーナー本人には見せないでください。
        自分の数字が見えていると、リーダーの判定に寄せるようになりデータになりません。
      </div>

      {list.length === 0 && (
        <div style={{ fontSize: '12px', color: '#B0A99A' }}>
          まだ判定の記録がありません。日別設定の Step 5 で記録すると、ここに溜まっていきます。
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {list.map(r => {
          const pct = Math.round(r.rate * 100);
          return (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', fontSize: '12px' }}>
                <span style={{ fontWeight: 700 }}>{nameById(r.id, 'trainer')}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#B0A99A' }}>{r.total}件</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                </span>
              </div>
              <div style={{ height: '5px', borderRadius: '3px', background: '#EEE9DE', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: '#2B4A3A' }} />
              </div>
              {(r.lenient > 0 || r.strict > 0) && (
                <div style={{ fontSize: '11px', color: '#A9742A' }}>
                  {r.lenient > 0 && <span>甘い方に{r.lenient}件</span>}
                  {r.lenient > 0 && r.strict > 0 && <span style={{ color: '#C9C2B2' }}>　/　</span>}
                  {r.strict > 0 && <span>厳しい方に{r.strict}件</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {list.length > 0 && (
        <div style={{ fontSize: '11px', color: '#9C9486', marginTop: '14px', lineHeight: 1.7, borderTop: '1px solid #EEE9DE', paddingTop: '10px' }}>
          件数が20件を超えるまでは差を読まないでください。10件程度では、実力が同じでも20〜30%の開きが普通に出ます。
        </div>
      )}
    </div>
  );
}
