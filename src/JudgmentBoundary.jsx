import React from 'react';

// ===========================================================================
// Step 5 の囲い
//
// 判定まわりで例外が出ても、アプリ全体が白画面にならないようにする。
// シフトとカリキュラムは使えるまま、この枠の中だけがエラー表示に変わる。
//
// エラーの内容を画面にそのまま出すのは、原因を調べるため。
// 白画面だと何が起きたか分からず、コンソールを開いてもらうしかなかった。
// ===========================================================================

export default class JudgmentBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[Step 5] 判定パネルでエラー', error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const detail = [
      (error && error.name) ? error.name + ': ' + error.message : String(error),
      (info && info.componentStack) ? info.componentStack.trim().split('\n').slice(0, 6).join('\n') : '',
    ].filter(Boolean).join('\n');

    return (
      <div style={{ border: '1px solid #E9C3BC', background: '#FDF6F4', borderRadius: '10px', padding: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#B0746A', marginBottom: '6px' }}>
          合否の判定を表示できませんでした
        </div>
        <div style={{ fontSize: '11.5px', color: '#8A6058', lineHeight: 1.75, marginBottom: '10px' }}>
          この枠の中だけの問題です。シフトとカリキュラムはそのまま使えます。<br />
          下の文をそのまま伝えてもらえれば原因が分かります。
        </div>
        <pre style={{
          margin: 0, padding: '10px 12px', background: '#FFFFFF', border: '1px solid #EEE9DE',
          borderRadius: '7px', fontSize: '10.5px', lineHeight: 1.6, color: '#2B2823',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflowY: 'auto',
        }}>{detail}</pre>
        <button type="button" onClick={() => this.setState({ error: null, info: null })}
          style={{ marginTop: '10px', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit', padding: '5px 12px',
            borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer', color: '#2B2823' }}>
          もう一度表示してみる
        </button>
      </div>
    );
  }
}
