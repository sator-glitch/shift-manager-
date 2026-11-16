import React, { useState } from 'react';

// ===========================================================================
// 出席の集計（管理者のみ）
//
// 勉強会に何日出たかを人ごとに出す。母数は「その日の割り振りに入っていた日数」で、
// そこから当日欠席を引いたものが出席日数になる。遅刻は来ているので出席に数えるが、
// 回数は別に出す（遅刻が常態化していないかを見るため）。
//
// 注意：判定機能を入れる前の日は出欠の印が付いていないため、すべて出席として数える。
// ===========================================================================

export default function AttendanceStats({ practiceDays, nameById }) {
  const [sort, setSort] = useState('days');   // days | rate | late

  const rows = {};
  let dayCount = 0;
  Object.entries(practiceDays || {}).forEach(([ds, day]) => {
    const pairings = (day && day.dayPairings) || {};
    const aids = [];
    Object.values(pairings).forEach(list => (list || []).forEach(a => { if (a) aids.push(a); }));
    if (aids.length === 0) return;
    dayCount += 1;
    const att = (day && day.attendance) || {};
    [...new Set(aids)].forEach(aid => {
      const r = rows[aid] || (rows[aid] = { assigned: 0, present: 0, late: 0, absent: 0, lastAbsent: null });
      r.assigned += 1;
      const a = att[aid];
      if (a === 'absent') { r.absent += 1; r.lastAbsent = ds; }
      else { r.present += 1; if (a === 'late') r.late += 1; }
    });
  });

  const list = Object.entries(rows)
    .map(([id, r]) => ({ id, ...r, rate: r.assigned ? r.present / r.assigned : 0 }))
    .sort((a, b) => {
      if (sort === 'late') return b.late - a.late || b.assigned - a.assigned;
      if (sort === 'rate') return a.rate - b.rate || b.assigned - a.assigned;
      return b.present - a.present || b.assigned - a.assigned;
    });

  const totalAssigned = list.reduce((n, r) => n + r.assigned, 0);
  const totalAbsent   = list.reduce((n, r) => n + r.absent, 0);
  const totalLate     = list.reduce((n, r) => n + r.late, 0);

  const th = { padding: '7px 10px', fontSize: '11px', fontWeight: 700, color: '#9C9486', textAlign: 'left', whiteSpace: 'nowrap' };
  const thR = { ...th, textAlign: 'right' };
  const td = { padding: '7px 10px', fontSize: '12px', color: '#2B2823', whiteSpace: 'nowrap' };
  const tdR = { ...td, textAlign: 'right' };

  return (
    <div className="no-print" style={{ marginTop: '16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #EEE9DE', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 700 }}>勉強会の出席</span>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#F4EAE8', color: '#B0746A' }}>管理者のみ</span>
        <select value={sort} onChange={e => setSort(e.target.value)}
          style={{ marginLeft: 'auto', fontSize: '11px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FFFFFF', color: '#2B2823', fontFamily: 'inherit' }}>
          <option value="days">出席日数が多い順</option>
          <option value="rate">出席率が低い順</option>
          <option value="late">遅刻が多い順</option>
        </select>
      </div>
      <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.7 }}>
        割り振りに入っていた日を母数にして、当日欠席を引いたものが出席日数です。遅刻は来ているので出席に数え、回数だけ別に出します。<br />
        判定機能を入れる前の日には出欠の印がないため、すべて出席として数えています。
      </div>

      {list.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#B0A99A' }}>まだ割り振りの記録がありません。</div>
      ) : (<>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {[
            { label: '勉強会の日数', value: dayCount + '日' },
            { label: 'のべ割り振り', value: totalAssigned + '人回' },
            { label: '当日欠席', value: totalAbsent + '回' },
            { label: '遅刻', value: totalLate + '回' },
          ].map(x => (
            <div key={x.label} style={{ flex: '1 1 100px', padding: '9px 12px', borderRadius: '10px', background: '#FAF8F4', border: '1px solid #EEE9DE' }}>
              <div style={{ fontSize: '10px', color: '#9C9486', fontWeight: 600 }}>{x.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>{x.value}</div>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAF8F4' }}>
                <th style={th}>アシスタント</th>
                <th style={thR}>出席日数</th>
                <th style={thR}>割り振り</th>
                <th style={thR}>出席率</th>
                <th style={thR}>遅刻</th>
                <th style={thR}>当日欠席</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F2EEE5' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{nameById ? nameById(r.id, 'assistant') : r.id}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{r.present}日</td>
                  <td style={{ ...tdR, color: '#9C9486' }}>{r.assigned}日</td>
                  <td style={{ ...tdR, fontWeight: 700, color: r.rate >= 0.9 ? '#2B4A3A' : r.rate >= 0.75 ? '#A9742A' : '#B0746A' }}>
                    {Math.round(r.rate * 100)}%
                  </td>
                  <td style={{ ...tdR, color: r.late ? '#A9742A' : '#C2BBA9', fontWeight: r.late ? 700 : 500 }}>{r.late}</td>
                  <td style={{ ...tdR, color: r.absent ? '#B0746A' : '#C2BBA9', fontWeight: r.absent ? 700 : 500 }}>{r.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}
