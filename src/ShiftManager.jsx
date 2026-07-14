import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Calendar, Users, Shuffle, X, ChevronLeft, ChevronRight, Download, Tag, Upload, Save, CalendarOff, BookOpen } from 'lucide-react';
import CurriculumApp from './Curriculum.jsx';

const WORKSPACE_LIST_KEY = 'shift_manager_workspaces_v1';
const workspaceDataKey = (id) => `shift_manager_workspace_${id}`;
const SNAPSHOT_KEY = 'shift_manager_snapshots_v1';
const MAX_SNAPSHOTS = 10;
const MASTER_PASSWORD_KEY = 'shift_manager_master_password_v1';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// その日が定休日かどうかを判定する。個別日の例外設定（closedDateOverrides）が
// 毎週の定休日設定（closedWeekdays）より優先される。
function isClosedOn(ws, dateStr, dayOfWeek) {
  if (!ws) return false;
  const overrides = ws.closedDateOverrides || {};
  if (Object.prototype.hasOwnProperty.call(overrides, dateStr)) {
    return !!overrides[dateStr];
  }
  return (ws.closedWeekdays || []).includes(dayOfWeek);
}

const DEFAULT_CATEGORIES = ['シャンプー', 'カラー', 'ブロー', 'カット'];
const DEFAULT_ASSISTANT_TYPES = ['モデル', 'ウィッグ'];

// 練習項目ごとの色は、登録順（categories配列のインデックス）でこのパレットを巡回して自動的に割り当てる
const CATEGORY_COLOR_PALETTE = [
  '#E63946', // 赤
  '#4361EE', // 青
  '#2A9D8F', // 緑（ティール）
  '#F4A300', // 黄土・オレンジ
  '#9D4EDD', // 紫
  '#06A77D', // エメラルドグリーン
  '#EF476F', // ピンク・マゼンタ
  '#118AB2', // シアン
];

function categoryColor(categories, categoryName) {
  const idx = (categories || []).indexOf(categoryName);
  if (idx < 0) return '#9C9486';
  return CATEGORY_COLOR_PALETTE[idx % CATEGORY_COLOR_PALETTE.length];
}

const ASSISTANT_TYPE_COLOR_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF',
  '#FF8B94', '#B8B8FF', '#FFDAC1', '#C7CEEA',
];

function assistantTypeColor(assistantTypes, typeName) {
  const idx = (assistantTypes || []).indexOf(typeName);
  if (idx < 0) return '#9C9486';
  return ASSISTANT_TYPE_COLOR_PALETTE[idx % ASSISTANT_TYPE_COLOR_PALETTE.length];
}

function getMonthDates(year, month) {
  const dates = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) dates.push(new Date(year, month, d));
  return dates;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMonthLabel(year, month) {
  return `${year}年${month + 1}月`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTE_OPTIONS = ['00', '15', '30', '45'];

function splitTime(t) {
  const [h, m] = (t || '10:00').split(':');
  return { h, m };
}
function joinTime(h, m) {
  return `${h}:${m}`;
}

function icsDate(d, timeStr) {
  const [h, m] = (timeStr || '10:00').split(':').map(Number);
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

function buildIcs(practiceDays, year, month, trainers, assistants, personId, personType) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ShiftManager//JP'];
  Object.entries(practiceDays).forEach(([ds, day]) => {
    const [y, m, dd] = ds.split('-').map(Number);
    if (y !== year || m !== month + 1) return;
    const d = new Date(y, m - 1, dd);
    (day.sessions || []).forEach((session, idx) => {
      const list = personType === 'trainer' ? session.assigned?.trainers : session.assigned?.assistants;
      if (personId && !(list || []).includes(personId)) return;
      const tIds = [...(session.assigned?.trainers || [])].sort((a, b) => trainers.findIndex(t => t.id === a) - trainers.findIndex(t => t.id === b));
      const aIds = [...(session.assigned?.assistants || [])].sort((a, b) => assistants.findIndex(t => t.id === a) - assistants.findIndex(t => t.id === b));
      const tNames = tIds.map(id => trainers.find(t => t.id === id)?.name).filter(Boolean).join('、');
      const aNames = aIds.map(id => assistants.find(a => a.id === id)?.name).filter(Boolean).join('、');
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ds}-session${idx}@shiftmanager`);
      lines.push(`DTSTART:${icsDate(d, session.startTime)}`);
      lines.push(`DTEND:${icsDate(d, session.endTime)}`);
      lines.push(`SUMMARY:${session.category || '練習会'}`);
      lines.push(`DESCRIPTION:トレーナー: ${tNames || 'なし'}\\nアシスタント: ${aNames || 'なし'}`);
      lines.push('END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadIcs(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function newSession(category) {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    category: category || 'シャンプー',
    startTime: '10:00',
    endTime: '10:45',
    trainerAvail: [],
    assistantAvail: [],
    assigned: { trainers: [], assistants: [] }
  };
}

export default function ShiftManager() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tab, setTab] = useState('shift');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [workspaces, setWorkspaces] = useState([]); // [{id, name, password}]
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState(false);
  const [workspaceNameInput, setWorkspaceNameInput] = useState('');

  const [unlockedWorkspaces, setUnlockedWorkspaces] = useState({}); // { [workspaceId]: true }
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const [snapshotList, setSnapshotList] = useState([]);
  const [draggedWorkspaceId, setDraggedWorkspaceId] = useState(null);
  const [draggedTrainerId, setDraggedTrainerId] = useState(null);

  const [masterPassword, setMasterPassword] = useState('');
  const [masterPasswordLoaded, setMasterPasswordLoaded] = useState(false);
  const [isMasterUnlocked, setIsMasterUnlocked] = useState(false);
  const [showMasterPrompt, setShowMasterPrompt] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [masterPasswordError, setMasterPasswordError] = useState('');
  const [showSetMasterPassword, setShowSetMasterPassword] = useState(false);
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState('');

  const [trainers, setTrainers] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [assistantTypes, setAssistantTypes] = useState(DEFAULT_ASSISTANT_TYPES);
  const [newAssistantType, setNewAssistantType] = useState('');
  const [practiceDays, setPracticeDays] = useState({}); // dateStr -> { sessions: [ {id, category, startTime, endTime, trainerAvail, assistantAvail, assigned} ] }
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('trainer');
  const [newCategory, setNewCategory] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedOffPersonId, setSelectedOffPersonId] = useState(null);
  const [selectedOffPersonType, setSelectedOffPersonType] = useState('trainer');
  const [bulkOffWeekdays, setBulkOffWeekdays] = useState([]);
  const [balanceFilterCategory, setBalanceFilterCategory] = useState(null);
  const [showCountsOnCalendar, setShowCountsOnCalendar] = useState(true);
  const [expandedVisitStatsId, setExpandedVisitStatsId] = useState(null);
  const [manualPairingTrainerId, setManualPairingTrainerId] = useState(null);

  // Load workspace list (and migrate legacy single-workspace data if present)
  useEffect(() => {
    async function loadWorkspaces() {
      let list = [];
      try {
        const res = await window.storage.get(WORKSPACE_LIST_KEY);
        if (res && res.value) list = JSON.parse(res.value);
      } catch (e) { /* none yet */ }

      if (list.length === 0) {
        // try migrating legacy v2 single-workspace data into Workspace A
        let migratedData = null;
        try {
          const legacy = await window.storage.get('shift_manager_data_v2');
          if (legacy && legacy.value) migratedData = JSON.parse(legacy.value);
        } catch (e) { /* nothing */ }

        const firstId = 'ws_' + Date.now().toString();
        list = [{ id: firstId, name: 'A' }];
        try {
          await window.storage.set(WORKSPACE_LIST_KEY, JSON.stringify(list));
          if (migratedData) {
            await window.storage.set(workspaceDataKey(firstId), JSON.stringify(migratedData));
          }
        } catch (e) { /* ignore */ }
      }

      setWorkspaces(list);
      setWorkspacesLoaded(true);
    }
    loadWorkspaces();

    async function loadMasterPassword() {
      try {
        const res = await window.storage.get(MASTER_PASSWORD_KEY);
        if (res && res.value) {
          setMasterPassword(res.value);
        } else {
          // res.value が空の場合のみここに来る（通常は起きないが念のため残す）
          const defaultPw = '1111';
          await window.storage.set(MASTER_PASSWORD_KEY, defaultPw);
          setMasterPassword(defaultPw);
        }
      } catch (e) {
        // window.storage.get はキーが未保存の場合に値を返さず例外を投げる仕様。
        // ここに来るのは「まだ一度も管理者パスワードが保存されていない」ケースなので、
        // デフォルトパスワードを生成してFirebaseに保存し、ローカル状態にも反映する。
        try {
          const defaultPw = '1111';
          await window.storage.set(MASTER_PASSWORD_KEY, defaultPw);
          setMasterPassword(defaultPw);
        } catch (e2) {
          // ここに来るのはFirebaseへの書き込み自体が失敗した本当の異常系のみ
          console.error('管理者パスワードの初期化に失敗しました', e2);
          setMasterPassword('');
        }
      }
      setMasterPasswordLoaded(true);
    }
    loadMasterPassword();
  }, []);

  // Load data for the active workspace whenever it changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setLoaded(false);
    setSelectedDate(null);
    async function load() {
      try {
        const res = await window.storage.get(workspaceDataKey(activeWorkspaceId));
        if (res && res.value) {
          const data = JSON.parse(res.value);
          setTrainers(data.trainers || []);
          setAssistants(data.assistants || []);
          setCategories(data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES);
          setAssistantTypes(data.assistantTypes && data.assistantTypes.length ? data.assistantTypes : DEFAULT_ASSISTANT_TYPES);
          setPracticeDays(data.practiceDays || {});
        } else {
          setTrainers([]);
          setAssistants([]);
          setCategories(DEFAULT_CATEGORIES);
          setAssistantTypes(DEFAULT_ASSISTANT_TYPES);
          setPracticeDays({});
        }
      } catch (e) {
        setTrainers([]);
        setAssistants([]);
        setCategories(DEFAULT_CATEGORIES);
        setAssistantTypes(DEFAULT_ASSISTANT_TYPES);
        setPracticeDays({});
      }
      setLoaded(true);
    }
    load();
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const todayStr = fmtDate(new Date());
    const ws = workspaces.find(w => w.id === activeWorkspaceId);
    if (!ws) return;
    const stats = ws.visitStats || { total: 0, daily: {} };
    const newStats = {
      total: (stats.total || 0) + 1,
      daily: { ...(stats.daily || {}), [todayStr]: ((stats.daily || {})[todayStr] || 0) + 1 }
    };
    const next = workspaces.map(w => w.id === activeWorkspaceId ? { ...w, visitStats: newStats } : w);
    setWorkspaces(next);
    window.storage.set(WORKSPACE_LIST_KEY, JSON.stringify(next)).catch(e => console.error('訪問カウントの保存に失敗しました', e));
  }, [activeWorkspaceId]);

  const persist = useCallback(async (workspaceId, next) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await window.storage.set(workspaceDataKey(workspaceId), JSON.stringify(next));
    } catch (e) {
      console.error('保存に失敗しました', e);
    }
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!loaded || !activeWorkspaceId) return;
    persist(activeWorkspaceId, { trainers, assistants, categories, assistantTypes, practiceDays });
  }, [trainers, assistants, categories, assistantTypes, practiceDays, loaded, activeWorkspaceId, persist]);

  // 自動スナップショット：全ワークスペースの状態を定期的にブラウザ内へ複数世代保存する
  const takeSnapshot = useCallback(async () => {
    try {
      const listRes = await window.storage.get(WORKSPACE_LIST_KEY);
      const wsList = listRes && listRes.value ? JSON.parse(listRes.value) : [];
      if (wsList.length === 0) return;

      const data = {};
      for (const w of wsList) {
        try {
          const res = await window.storage.get(workspaceDataKey(w.id));
          data[w.id] = res && res.value ? JSON.parse(res.value) : null;
        } catch (e) { data[w.id] = null; }
      }

      let snapshots = [];
      try {
        const snapRes = await window.storage.get(SNAPSHOT_KEY);
        if (snapRes && snapRes.value) snapshots = JSON.parse(snapRes.value);
      } catch (e) { /* none yet */ }

      const snapshotStr = JSON.stringify({ workspaces: wsList, data });
      const lastStr = snapshots.length > 0 ? JSON.stringify({ workspaces: snapshots[snapshots.length - 1].workspaces, data: snapshots[snapshots.length - 1].data }) : null;
      if (snapshotStr === lastStr) return; // 変化がなければ世代を増やさない

      snapshots.push({ takenAt: new Date().toISOString(), workspaces: wsList, data });
      if (snapshots.length > MAX_SNAPSHOTS) snapshots = snapshots.slice(snapshots.length - MAX_SNAPSHOTS);

      await window.storage.set(SNAPSHOT_KEY, JSON.stringify(snapshots));
    } catch (e) {
      console.error('自動バックアップに失敗しました', e);
    }
  }, []);

  useEffect(() => {
    takeSnapshot();
    const interval = setInterval(takeSnapshot, 60000);
    return () => clearInterval(interval);
  }, [takeSnapshot]);

  function persistWorkspaceList(next) {
    // Firebaseへの保存が成功した場合のみローカル状態(画面表示)を更新する。
    // 失敗した場合は画面はそれまでの状態のままにし、アラートで知らせる。
    return window.storage.set(WORKSPACE_LIST_KEY, JSON.stringify(next))
      .then(() => {
        setWorkspaces(next);
        return true;
      })
      .catch(e => {
        console.error('店舗データの保存に失敗しました', e);
        alert('店舗データの保存に失敗しました。通信状態を確認して、もう一度お試しください。');
        return false;
      });
  }

  async function openSnapshots() {
    try {
      const res = await window.storage.get(SNAPSHOT_KEY);
      const snapshots = res && res.value ? JSON.parse(res.value) : [];
      setSnapshotList([...snapshots].reverse());
      setShowSnapshots(true);
    } catch (e) {
      setSnapshotList([]);
      setShowSnapshots(true);
    }
  }

  function handleWorkspaceDragStart(id) {
    setDraggedWorkspaceId(id);
  }

  function handleWorkspaceDragOver(e, overId) {
    e.preventDefault();
    if (!draggedWorkspaceId || draggedWorkspaceId === overId) return;
    const fromIdx = workspaces.findIndex(w => w.id === draggedWorkspaceId);
    const toIdx = workspaces.findIndex(w => w.id === overId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...workspaces];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setWorkspaces(next);
  }

  function handleWorkspaceDragEnd() {
    if (draggedWorkspaceId) {
      persistWorkspaceList(workspaces);
    }
    setDraggedWorkspaceId(null);
  }

  async function restoreFromSnapshot(snapshot) {
    for (const w of snapshot.workspaces) {
      const wsData = snapshot.data[w.id];
      if (wsData) {
        await window.storage.set(workspaceDataKey(w.id), JSON.stringify(wsData));
      }
    }
    await window.storage.set(WORKSPACE_LIST_KEY, JSON.stringify(snapshot.workspaces));
    setWorkspaces(snapshot.workspaces);
    setActiveWorkspaceId(null);
    setShowSnapshots(false);
    setRestoreMessage(`${new Date(snapshot.takenAt).toLocaleString('ja-JP')}の状態に復元しました。`);
  }

  async function exportAllData() {
    const allData = { workspaces, data: {} };
    for (const w of workspaces) {
      try {
        const res = await window.storage.get(workspaceDataKey(w.id));
        allData.data[w.id] = res && res.value ? JSON.parse(res.value) : null;
      } catch (e) {
        allData.data[w.id] = null;
      }
    }
    downloadJson(allData, `シフト管理バックアップ_${fmtDate(new Date())}.json`);
  }

  async function importAllData(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.workspaces || !parsed.data) {
        alert('このファイルの形式が正しくありません。');
        return;
      }
      for (const w of parsed.workspaces) {
        const wsData = parsed.data[w.id];
        if (wsData) {
          await window.storage.set(workspaceDataKey(w.id), JSON.stringify(wsData));
        }
      }
      await window.storage.set(WORKSPACE_LIST_KEY, JSON.stringify(parsed.workspaces));
      setWorkspaces(parsed.workspaces);
      setActiveWorkspaceId(parsed.workspaces[0]?.id || null);
      alert('復元が完了しました。');
    } catch (e) {
      console.error(e);
      alert('復元に失敗しました。ファイルを確認してください。');
    }
  }

  async function addWorkspace() {
    const usedLetters = workspaces.map(w => w.name);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const nextLetter = letters.find(l => !usedLetters.includes(l)) || `グループ${workspaces.length + 1}`;
    const id = 'ws_' + Date.now().toString();
    const next = [...workspaces, { id, name: nextLetter, password: '' }];
    const ok = await persistWorkspaceList(next);
    if (!ok) return;
    setActiveWorkspaceId(id);
    // 自分が今作ったワークスペースはそのまま編集可能にする
    setUnlockedWorkspaces(prev => ({ ...prev, [id]: true }));
  }

  async function removeWorkspace(id) {
    if (workspaces.length <= 1) return;
    const next = workspaces.filter(w => w.id !== id);
    const ok = await persistWorkspaceList(next);
    if (!ok) return;
    if (activeWorkspaceId === id) setActiveWorkspaceId(null);
    window.storage.delete(workspaceDataKey(id)).catch(() => {});
  }

  function startRenameWorkspace() {
    const current = workspaces.find(w => w.id === activeWorkspaceId);
    setWorkspaceNameInput(current?.name || '');
    setEditingWorkspaceName(true);
  }

  async function confirmRenameWorkspace() {
    if (!workspaceNameInput.trim()) { setEditingWorkspaceName(false); return; }
    const next = workspaces.map(w => w.id === activeWorkspaceId ? { ...w, name: workspaceNameInput.trim() } : w);
    const ok = await persistWorkspaceList(next);
    if (!ok) return;
    setEditingWorkspaceName(false);
  }

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
  const hasPassword = !!activeWorkspace?.password;
  const hasMasterAccess = masterPasswordLoaded && (!masterPassword || isMasterUnlocked);
  const isUnlocked = hasMasterAccess || !hasPassword || !!unlockedWorkspaces[activeWorkspaceId];

  function attemptUnlock() {
    if (passwordInput === activeWorkspace?.password) {
      setUnlockedWorkspaces(prev => ({ ...prev, [activeWorkspaceId]: true }));
      setShowPasswordPrompt(false);
      setPasswordInput('');
      setPasswordError('');
    } else {
      setPasswordError('パスワードが正しくありません');
    }
  }

  function lockWorkspace() {
    setUnlockedWorkspaces(prev => {
      const next = { ...prev };
      delete next[activeWorkspaceId];
      return next;
    });
  }

  async function setWorkspacePassword() {
    const next = workspaces.map(w => w.id === activeWorkspaceId ? { ...w, password: newPasswordInput } : w);
    const ok = await persistWorkspaceList(next);
    if (!ok) return;
    setShowSetPassword(false);
    setNewPasswordInput('');
    // 設定した本人はそのまま編集可能のままにしておく
    setUnlockedWorkspaces(prev => ({ ...prev, [activeWorkspaceId]: true }));
  }

  function attemptMasterUnlock() {
    if (masterPasswordInput === masterPassword) {
      setIsMasterUnlocked(true);
      setShowMasterPrompt(false);
      setMasterPasswordInput('');
      setMasterPasswordError('');
    } else {
      setMasterPasswordError('パスワードが正しくありません');
    }
  }

  function logoutMaster() {
    setIsMasterUnlocked(false);
  }

  function saveMasterPassword() {
    window.storage.set(MASTER_PASSWORD_KEY, newMasterPasswordInput)
      .then(() => {
        // Firebaseへの保存が成功した場合のみローカル状態を更新する
        setMasterPassword(newMasterPasswordInput);
        setShowSetMasterPassword(false);
        setNewMasterPasswordInput('');
        setIsMasterUnlocked(true);
      })
      .catch(e => {
        console.error('管理者パスワードの保存に失敗しました', e);
        alert('管理者パスワードの保存に失敗しました。通信状態を確認して、もう一度お試しください。');
      });
  }

  const dates = getMonthDates(year, month);

  function changeMonth(delta) {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  }

  function addPerson() {
    if (!newName.trim()) return;
    const person = { id: Date.now().toString(), name: newName.trim() };
    if (newType === 'trainer') setTrainers(prev => [...prev, person]);
    else setAssistants(prev => [...prev, person]);
    setNewName('');
  }

  // 「曜日で一括設定」用：選択中の曜日をトグルする（保存はせず、適用ボタンを押すまで一時的な選択状態）
  function toggleBulkOffWeekday(dayOfWeek) {
    setBulkOffWeekdays(prev => prev.includes(dayOfWeek) ? prev.filter(d => d !== dayOfWeek) : [...prev, dayOfWeek]);
  }

  // 選択した曜日に該当する「表示中の月」の日付を、まとめてその人の休みに設定する
  function applyBulkOffWeekdays(personId, type) {
    if (bulkOffWeekdays.length === 0) return;
    const matchDates = dates.filter(d => bulkOffWeekdays.includes(d.getDay())).map(d => fmtDate(d));
    const updater = (prev) => prev.map(p => {
      if (p.id !== personId) return p;
      const current = p.offDates || [];
      const merged = Array.from(new Set([...current, ...matchDates]));
      return { ...p, offDates: merged };
    });
    if (type === 'trainer') setTrainers(updater);
    else setAssistants(updater);
  }

  // 先月、その人が休みだった曜日（固定パターンとみなす）を検出し、今月の同じ曜日へまとめて適用する
  function copyLastMonthOffWeekdays(personId, type) {
    const list = type === 'trainer' ? trainers : assistants;
    const person = list.find(p => p.id === personId);
    if (!person) return;

    let prevMonth = month - 1, prevYear = year;
    if (prevMonth < 0) { prevMonth = 11; prevYear -= 1; }
    const prevMonthDates = getMonthDates(prevYear, prevMonth);
    const prevMonthDateStrs = new Set(prevMonthDates.map(d => fmtDate(d)));

    const detectedWeekdays = new Set();
    (person.offDates || []).forEach(ds => {
      if (prevMonthDateStrs.has(ds)) {
        const [yy, mm, dd] = ds.split('-').map(Number);
        detectedWeekdays.add(new Date(yy, mm - 1, dd).getDay());
      }
    });

    if (detectedWeekdays.size === 0) {
      alert('先月の休みのデータが見つかりませんでした。');
      return;
    }

    const weekdaysArr = Array.from(detectedWeekdays);
    setBulkOffWeekdays(weekdaysArr);

    const matchDates = dates.filter(d => weekdaysArr.includes(d.getDay())).map(d => fmtDate(d));
    const updater = (prev) => prev.map(p => {
      if (p.id !== personId) return p;
      const current = p.offDates || [];
      const merged = Array.from(new Set([...current, ...matchDates]));
      return { ...p, offDates: merged };
    });
    if (type === 'trainer') setTrainers(updater);
    else setAssistants(updater);
  }

  // トレーナー/アシスタント個人の「休みの日付」をトグルする（曜日の繰り返しではなく、その日だけの個別設定）
  function toggleOffDate(personId, type, dateStr) {
    const updater = (prev) => prev.map(p => {
      if (p.id !== personId) return p;
      const offDates = p.offDates || [];
      const next = offDates.includes(dateStr) ? offDates.filter(d => d !== dateStr) : [...offDates, dateStr];
      return { ...p, offDates: next };
    });
    if (type === 'trainer') setTrainers(updater);
    else setAssistants(updater);
  }

  // 店舗の「毎週の定休日」をトグルする（総管理者・店舗管理者どちらも操作可）
  async function toggleClosedWeekday(dayOfWeek) {
    if (!activeWorkspace) return;
    const current = activeWorkspace.closedWeekdays || [];
    const next = current.includes(dayOfWeek) ? current.filter(d => d !== dayOfWeek) : [...current, dayOfWeek];
    const nextList = workspaces.map(w => w.id === activeWorkspaceId ? { ...w, closedWeekdays: next } : w);
    await persistWorkspaceList(nextList);
  }

  // 特定の日だけ定休日設定を上書きする（value: true=その日だけ休み, false=その日だけ営業, null=例外を解除）
  async function setDateOverride(dateStr, value) {
    if (!activeWorkspace) return;
    const overrides = { ...(activeWorkspace.closedDateOverrides || {}) };
    if (value === null) {
      delete overrides[dateStr];
    } else {
      overrides[dateStr] = value;
    }
    const nextList = workspaces.map(w => w.id === activeWorkspaceId ? { ...w, closedDateOverrides: overrides } : w);
    await persistWorkspaceList(nextList);
  }

  function removePerson(id, type) {
    if (type === 'trainer') setTrainers(prev => prev.filter(p => p.id !== id));
    else setAssistants(prev => prev.filter(p => p.id !== id));
  }

  function handleTrainerDragStart(id) {
    setDraggedTrainerId(id);
  }

  function handleTrainerDragOver(e, overId) {
    e.preventDefault();
    if (!draggedTrainerId || draggedTrainerId === overId) return;
    const fromIdx = trainers.findIndex(t => t.id === draggedTrainerId);
    const toIdx = trainers.findIndex(t => t.id === overId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...trainers];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setTrainers(next);
  }

  function handleTrainerDragEnd() {
    setDraggedTrainerId(null);
  }

  function addCategory() {
    if (!newCategory.trim() || categories.includes(newCategory.trim())) { setNewCategory(''); return; }
    setCategories(prev => [...prev, newCategory.trim()]);
    setNewCategory('');
  }

  function removeCategory(cat) {
    setCategories(prev => prev.filter(c => c !== cat));
  }

  function addAssistantType() {
    if (!newAssistantType.trim() || assistantTypes.includes(newAssistantType.trim())) { setNewAssistantType(''); return; }
    setAssistantTypes(prev => [...prev, newAssistantType.trim()]);
    setNewAssistantType('');
  }

  function removeAssistantType(t) {
    setAssistantTypes(prev => prev.filter(x => x !== t));
  }

  // その日のアシスタントのタイプを設定する。practiceDaysのdayTypeMapに保存。
  // dayTypeMap: { [assistantId]: typeName }（日ごとに全セッション共通）
  function setAssistantDayType(dateStr, assistantId, typeName) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const dayTypeMap = { ...(day.dayTypeMap || {}), [assistantId]: typeName };
      return { ...prev, [dateStr]: { ...day, dayTypeMap } };
    });
  }

  function selectDate(dateStr) {
    setSelectedDate(dateStr);
  }

  function deletePracticeDay(dateStr) {
    setPracticeDays(prev => {
      const next = { ...prev };
      delete next[dateStr];
      return next;
    });
    setSelectedDate(null);
  }

  function addSession(dateStr) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) {
        return { ...prev, [dateStr]: { sessions: [newSession(categories[0])] } };
      }
      return { ...prev, [dateStr]: { ...day, sessions: [...day.sessions, newSession(categories[0])] } };
    });
  }

  function removeSession(dateStr, sessionId) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const sessions = day.sessions.filter(s => s.id !== sessionId);
      if (sessions.length === 0) {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      }
      return { ...prev, [dateStr]: { ...day, sessions } };
    });
    setSelectedDate(prevSel => {
      const day = practiceDays[dateStr];
      if (day && day.sessions.length === 1) return null;
      return prevSel;
    });
  }

  function updateSession(dateStr, sessionId, patch) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const sessions = day.sessions.map(s => s.id === sessionId ? { ...s, ...patch } : s);
      return { ...prev, [dateStr]: { ...day, sessions } };
    });
  }

  function toggleAvail(dateStr, sessionId, personId, type) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const key = type === 'trainer' ? 'trainerAvail' : 'assistantAvail';
      const sessions = day.sessions.map(s => {
        if (s.id !== sessionId) return s;
        const list = s[key] || [];
        const next = list.includes(personId) ? list.filter(id => id !== personId) : [...list, personId];
        return { ...s, [key]: next };
      });
      return { ...prev, [dateStr]: { ...day, sessions } };
    });
  }

  function toggleAssigned(dateStr, sessionId, personId, type) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const key = type === 'trainer' ? 'trainers' : 'assistants';
      const sessions = day.sessions.map(s => {
        if (s.id !== sessionId) return s;
        const list = s.assigned?.[key] || [];
        const next = list.includes(personId) ? list.filter(id => id !== personId) : [...list, personId];
        return { ...s, assigned: { ...s.assigned, [key]: next } };
      });
      return { ...prev, [dateStr]: { ...day, sessions } };
    });
  }

  // トレーナーだけを自動で割り当てる。アシスタントは手動配置済みの前提で、
  // そのセッションのアシスタント数に応じた帯ルール（固定）でトレーナー人数を決める。
  // 休みで対応可能なトレーナーが少ない場合は、目安より少ない人数になる（休み優先）。
  // 公平性（出勤回数バランス）は練習項目ごとに別物として判定する。
  function autoAssign() {
    const practiceDateStrs = Object.keys(practiceDays).filter(ds => {
      const [y, m] = ds.split('-').map(Number);
      return y === year && m === month + 1;
    }).sort();

    // trainerCounts[trainerId][category] = この処理中に割り当てた回数
    const trainerCounts = {};
    trainers.forEach(t => { trainerCounts[t.id] = {}; });
    const getCount = (id, cat) => trainerCounts[id]?.[cat] || 0;
    const incCount = (id, cat) => {
      if (!trainerCounts[id]) trainerCounts[id] = {};
      trainerCounts[id][cat] = (trainerCounts[id][cat] || 0) + 1;
    };

    const next = { ...practiceDays };

    practiceDateStrs.forEach(ds => {
      const [yy, mm, dd] = ds.split('-').map(Number);
      const dow = new Date(yy, mm - 1, dd).getDay();
      const day = next[ds];

      // 定休日は自動割り当ての対象から外す（既存のデータはそのまま変更しない）
      if (isClosedOn(activeWorkspace, ds, dow)) {
        return;
      }

      // その日に休みでないトレーナーだけが対象
      const availableTrainerIds = trainers.filter(t => !(t.offDates || []).includes(ds)).map(t => t.id);

      const sessions = day.sessions.map(session => {
        const cat = session.category || '未分類';
        const assistantCount = (session.assigned?.assistants || []).length;
        // アシスタント数 × 比率を目安にする（最低1人）
        // 帯ルール（固定）：アシスタント1〜3人→トレーナー最大2人、4〜6人→最大3人、
        // 7〜9人→最大4人、以降も3人ごとに+1人。常に帯の最大値を目標にする。
        const target = Math.ceil(assistantCount / 3) + 1;

        const sortedTrainers = [...availableTrainerIds].sort((a, b) => getCount(a, cat) - getCount(b, cat));
        const assignedTrainers = sortedTrainers.slice(0, Math.min(target, sortedTrainers.length));
        assignedTrainers.forEach(id => incCount(id, cat));

        return { ...session, assigned: { trainers: assignedTrainers, assistants: session.assigned?.assistants || [] } };
      });
      next[ds] = { ...day, sessions };
    });

    setPracticeDays(next);
  }

  // アシスタントをタイプ別・トレーナー別に均等に自動割り当てする。
  // 各セッションでそのセッションに割り当てられたトレーナーに対して、
  // タイプ別（モデル・ウィッグ等）に均等になるようアシスタントを振り分ける。
  // 指定した日のアシスタントをトレーナーにペアリングする。
  // 参加アシスタント・リーダートレーナーは事前に設定済みであること。
  // 手動割り振り済みのアシスタントはそのまま残し、未割り振りのアシスタントだけを自動で振り分ける。
  // 結果はdayPairings: { [trainerId]: assistantId[] } として保存し、全セッションに適用。
  function autoAssignAssistants(dateStr) {
    const day = practiceDays[dateStr];
    if (!day) return;
    const dayTypeMap = day.dayTypeMap || {};
    const dayParticipants = day.dayParticipants || [];
    const dayLeader = day.dayLeader || null;
    const existingPairings = day.dayPairings || {};
    const trainerIdSet = new Set();
    (day.sessions || []).forEach(s => { (s.assigned?.trainers || []).forEach(id => trainerIdSet.add(id)); });
    const activeTrainerIds = Array.from(trainerIdSet).filter(id => id !== dayLeader);
    if (activeTrainerIds.length === 0 || dayParticipants.length === 0) {
      alert('参加アシスタントとリーダー以外のトレーナーが必要です。');
      return;
    }
    const manuallyAssigned = new Set();
    activeTrainerIds.forEach(tid => {
      (existingPairings[tid] || []).forEach(aid => { if (dayParticipants.includes(aid)) manuallyAssigned.add(aid); });
    });
    const unassigned = dayParticipants.filter(id => !manuallyAssigned.has(id));
    const pairings = {};
    activeTrainerIds.forEach(id => {
      pairings[id] = (existingPairings[id] || []).filter(aid => dayParticipants.includes(aid));
    });
    const byType = {};
    assistantTypes.forEach(t => { byType[t] = []; });
    unassigned.forEach(id => {
      const t = dayTypeMap[id] || assistantTypes[0] || 'その他';
      if (!byType[t]) byType[t] = [];
      byType[t].push(id);
    });
    Object.values(byType).forEach(ids => {
      ids.forEach(aId => {
        const tid2 = activeTrainerIds.slice().sort((a, b) => (pairings[a]?.length || 0) - (pairings[b]?.length || 0))[0];
        pairings[tid2].push(aId);
      });
    });
    setPracticeDays(prev => {
      const d = prev[dateStr];
      const sessions = (d.sessions || []).map(session => {
        const sessionTrainers = session.assigned?.trainers || [];
        const sessionAssistants = [];
        sessionTrainers.forEach(tid => {
          if (tid === dayLeader) return;
          (pairings[tid] || []).forEach(aid => { if (!sessionAssistants.includes(aid)) sessionAssistants.push(aid); });
        });
        return { ...session, assigned: { trainers: sessionTrainers, assistants: sessionAssistants } };
      });
      return { ...prev, [dateStr]: { ...d, dayPairings: pairings, dayLeader, sessions } };
    });
  }

  // その日の参加アシスタントを追加/解除する
  function toggleDayParticipant(dateStr, assistantId) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const current = day.dayParticipants || [];
      const isRemoving = current.includes(assistantId);
      const next = isRemoving ? current.filter(id => id !== assistantId) : [...current, assistantId];
      if (isRemoving && day.dayPairings) {
        const pairings = {};
        Object.entries(day.dayPairings).forEach(([tid, aids]) => {
          pairings[tid] = aids.filter(aid => aid !== assistantId);
        });
        const sessions = (day.sessions || []).map(session => ({
          ...session,
          assigned: {
            trainers: session.assigned?.trainers || [],
            assistants: (session.assigned?.assistants || []).filter(aid => aid !== assistantId)
          }
        }));
        return { ...prev, [dateStr]: { ...day, dayParticipants: next, dayPairings: pairings, sessions } };
      }
      return { ...prev, [dateStr]: { ...day, dayParticipants: next } };
    });
  }

  // その日のリーダートレーナーを設定/解除する
  function setDayLeader(dateStr, trainerId) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const current = day.dayLeader;
      return { ...prev, [dateStr]: { ...day, dayLeader: current === trainerId ? null : trainerId } };
    });
  }

  function toggleManualPairing(dateStr, trainerId, assistantId) {
    setPracticeDays(prev => {
      const day = prev[dateStr];
      if (!day) return prev;
      const pairings = { ...(day.dayPairings || {}) };
      Object.keys(pairings).forEach(tid => {
        pairings[tid] = (pairings[tid] || []).filter(aid => aid !== assistantId);
      });
      const currentInTrainer = (day.dayPairings?.[trainerId] || []).includes(assistantId);
      if (!currentInTrainer) {
        pairings[trainerId] = [...(pairings[trainerId] || []), assistantId];
      }
      const sessions = (day.sessions || []).map(session => {
        const sessionTrainers = session.assigned?.trainers || [];
        const sessionAssistants = [];
        sessionTrainers.forEach(tid => {
          if (tid === day.dayLeader) return;
          (pairings[tid] || []).forEach(aid => {
            if (!sessionAssistants.includes(aid)) sessionAssistants.push(aid);
          });
        });
        return { ...session, assigned: { trainers: sessionTrainers, assistants: sessionAssistants } };
      });
      return { ...prev, [dateStr]: { ...day, dayPairings: pairings, sessions } };
    });
  }

  function nameById(id, type) {
    const list = type === 'trainer' ? trainers : assistants;
    return list.find(p => p.id === id)?.name || '?';
  }

  // 選択した順番ではなく、トレーナー・アシスタント一覧の並び順（ランク順）で表示するための並べ替え
  function sortIdsByRank(ids, type) {
    const list = type === 'trainer' ? trainers : assistants;
    return [...(ids || [])].sort((a, b) => list.findIndex(p => p.id === a) - list.findIndex(p => p.id === b));
  }

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;

  const trainerMonthCounts = trainers.map(t => {
    let count = 0; const byCategory = {};
    let prevCount = 0; const prevByCategory = {};
    Object.entries(practiceDays).forEach(([ds, day]) => {
      const [y, m] = ds.split('-').map(Number);
      if (y === year && m === month + 1) {
        (day.sessions || []).forEach(s => {
          if (s.assigned?.trainers?.includes(t.id)) { count++; const cat = s.category || '未分類'; byCategory[cat] = (byCategory[cat] || 0) + 1; }
        });
      } else if (y === prevYear && m === prevMonth + 1) {
        (day.sessions || []).forEach(s => {
          if (s.assigned?.trainers?.includes(t.id)) { prevCount++; const cat = s.category || '未分類'; prevByCategory[cat] = (prevByCategory[cat] || 0) + 1; }
        });
      }
    });
    return { ...t, count, byCategory, prevCount, prevByCategory };
  });

  const assistantMonthCounts = assistants.map(a => {
    let count = 0;
    const byCategory = {};
    Object.entries(practiceDays).forEach(([ds, day]) => {
      const [y, m] = ds.split('-').map(Number);
      if (y !== year || m !== month + 1) return;
      (day.sessions || []).forEach(s => {
        if (s.assigned?.assistants?.includes(a.id)) {
          count++;
          const cat = s.category || '未分類';
          byCategory[cat] = (byCategory[cat] || 0) + 1;
        }
      });
    });
    return { ...a, count, byCategory };
  });

  if (!workspacesLoaded || (activeWorkspaceId && !loaded)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#8a8378', fontFamily: 'system-ui' }}>
        読み込み中…
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
      background: '#FAF8F4',
      minHeight: '600px',
      color: '#2B2823',
      padding: '24px',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: #D8D2C4; border-radius: 4px; }
        button { font-family: inherit; }
        input, select { font-family: inherit; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-only { display: flex !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="print-only" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>
        練習会シフト　{workspaces.find(w => w.id === activeWorkspaceId)?.name || ''}　{fmtMonthLabel(year, month)}
      </div>

      {!activeWorkspaceId ? (
        <div style={{ maxWidth: '480px', margin: '40px auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            {masterPasswordLoaded && !hasMasterAccess && (
              <button onClick={() => { setShowMasterPrompt(true); setMasterPasswordError(''); setMasterPasswordInput(''); }} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', color: '#2B2823', fontWeight: 600, cursor: 'pointer' }}>
                総管理者ログイン
              </button>
            )}
            {hasMasterAccess && masterPassword && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', background: '#EAF1ED', color: '#2B4A3A', fontWeight: 700 }}>
                  総管理者モード
                </span>
                <button onClick={logoutMaster} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', color: '#8A8378', fontWeight: 600, cursor: 'pointer' }}>
                  ログアウト
                </button>
              </div>
            )}
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '0.02em', color: '#1F1C18', textAlign: 'center' }}>
            練習会シフト管理
          </h1>
          <div style={{ fontSize: '13px', color: '#9C9486', marginBottom: '24px', textAlign: 'center' }}>
            店舗（シフト）を選んでください
          </div>

          {restoreMessage && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', background: '#EAF1ED', border: '1px solid #C9DDD0', fontSize: '12px', color: '#2B4A3A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span>{restoreMessage}</span>
              <button onClick={() => setRestoreMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2B4A3A' }}>
                <X size={14} />
              </button>
            </div>
          )}

          {!hasMasterAccess && (
            <div style={{ marginBottom: '20px' }}>
              <select
                value=""
                onChange={e => { if (e.target.value) setActiveWorkspaceId(e.target.value); }}
                style={{
                  width: '100%', padding: '16px 18px', borderRadius: '12px',
                  border: '1px solid #E2DCCC', background: '#FFFFFF',
                  color: '#1F1C18', fontSize: '15px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                <option value="" disabled>店舗選択</option>
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>{w.name}{w.password ? '（編集に制限あり）' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {hasMasterAccess && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {workspaces.map(w => {
              const visitStats = w.visitStats || { total: 0, daily: {} };
              const isExpanded = expandedVisitStatsId === w.id;
              const dailyEntries = Object.entries(visitStats.daily || {}).sort((a, b) => b[0].localeCompare(a[0]));
              return (
                <div key={w.id} style={{ display: 'flex', flexDirection: 'column', borderRadius: '12px', border: '1px solid #E2DCCC', background: '#FFFFFF', opacity: draggedWorkspaceId === w.id ? 0.5 : 1 }}>
                  <div
                    draggable={hasMasterAccess}
                    onDragStart={() => hasMasterAccess && handleWorkspaceDragStart(w.id)}
                    onDragOver={(e) => hasMasterAccess && handleWorkspaceDragOver(e, w.id)}
                    onDragEnd={() => hasMasterAccess && handleWorkspaceDragEnd()}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <div style={{ padding: '0 4px 0 12px', cursor: 'grab', color: '#C9C2B2', fontSize: '16px', lineHeight: 1, userSelect: 'none' }}>⠿</div>
                    <button onClick={() => setActiveWorkspaceId(w.id)}
                      style={{ flex: 1, padding: '16px 18px', borderRadius: '12px', border: 'none', background: 'transparent', color: '#1F1C18', fontSize: '15px', fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {w.name}
                      <span style={{ fontSize: '12px', color: '#B0A99A', fontWeight: 500 }}>{w.password ? '編集に制限あり' : ''}</span>
                    </button>
                    <button onClick={() => setExpandedVisitStatsId(isExpanded ? null : w.id)}
                      style={{ fontSize: '11px', padding: '6px 10px', marginRight: '8px', borderRadius: '8px', border: '1px solid #EEE9DE', background: isExpanded ? '#FAF8F4' : '#FFFFFF', color: '#8A8378', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                      訪問{visitStats.total}回
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #EEE9DE', padding: '12px 18px', maxHeight: '220px', overflowY: 'auto' }}>
                      <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '8px' }}>累計{visitStats.total}回（日別）</div>
                      {dailyEntries.length === 0
                        ? <div style={{ fontSize: '12px', color: '#B0A99A' }}>まだ訪問記録がありません</div>
                        : dailyEntries.map(([ds, c]) => (
                          <div key={ds} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                            <span>{ds}</span><span style={{ fontWeight: 700, color: '#4A6B5A' }}>{c}回</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
            {hasMasterAccess && (
              <button onClick={addWorkspace} style={{ padding: '14px 18px', borderRadius: '12px', border: '1px dashed #C9C2B2', background: 'transparent', color: '#8A8378', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={16} /> 新しい店舗（シフト）を追加
              </button>
            )}
          </div>
          )}

          {hasMasterAccess && (
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <button onClick={() => { setShowSetMasterPassword(true); setNewMasterPasswordInput(masterPassword); }} style={{ fontSize: '11px', color: '#9C9486', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                {masterPassword ? '管理者パスワードを変更' : '管理者パスワードを設定する'}
              </button>
            </div>
          )}

          {hasMasterAccess && (
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: '#FFF8EC', border: '1px solid #F0E0BE', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#8A7A52' }}>定期的にバックアップの保存をおすすめします</span>
            <button onClick={exportAllData} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer', color: '#2B2823' }}>
              <Save size={13} /> バックアップを保存
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer', color: '#2B2823' }}>
              <Upload size={13} /> バックアップから復元
              <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) importAllData(e.target.files[0]); e.target.value = ''; }} />
            </label>
            <button onClick={openSnapshots} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer', color: '#2B2823' }}>
              自動保存された履歴を見る
            </button>
          </div>
          )}
        </div>
      ) : (
      <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <button onClick={() => setActiveWorkspaceId(null)} className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9C9486', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '4px', padding: 0 }}>
            <ChevronLeft size={12} /> 店舗選択に戻る
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '0.02em', color: '#1F1C18' }}>
            {workspaces.find(w => w.id === activeWorkspaceId)?.name}　練習会シフト管理
          </h1>
          <div style={{ fontSize: '12px', color: '#9C9486', marginTop: '2px' }}>
            {saving ? '保存中…' : '自動保存済み'}
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '4px', background: '#EFEAE0', borderRadius: '10px', padding: '4px' }}>
          {[
            { key: 'shift', label: 'シフト', icon: Calendar },
            { key: 'people', label: '人員登録', icon: Users },
            { key: 'categories', label: '練習項目', icon: Tag },
            { key: 'offdays', label: '休み設定', icon: CalendarOff },
            { key: 'curriculum', label: 'カリキュラム', icon: BookOpen },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', border: 'none',
                background: tab === key ? '#FFFFFF' : 'transparent',
                color: tab === key ? '#1F1C18' : '#8A8378',
                fontWeight: tab === key ? 600 : 500,
                fontSize: '13px', cursor: 'pointer',
                boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Permission bar */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', padding: '10px 14px', borderRadius: '10px', background: isUnlocked ? '#EAF1ED' : '#F3EFE6', border: isUnlocked ? '1px solid #C9DDD0' : '1px solid #E5DCC8' }}>
        {isUnlocked ? (
          <>
            <span style={{ fontSize: '12px', color: '#2B4A3A', fontWeight: 600 }}>
              {hasMasterAccess && masterPassword ? '総管理者モード（編集できます）' : '店舗管理者モード（編集できます）'}
            </span>
            {hasPassword && !(hasMasterAccess && masterPassword) && (
              <button onClick={lockWorkspace} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #C9DDD0', background: '#FFFFFF', color: '#2B4A3A', cursor: 'pointer' }}>
                店舗管理者ログアウト
              </button>
            )}
            {hasMasterAccess && masterPassword && (
              <button onClick={logoutMaster} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #C9DDD0', background: '#FFFFFF', color: '#2B4A3A', cursor: 'pointer' }}>
                総管理者ログアウト
              </button>
            )}
            {hasMasterAccess && (
              <button onClick={() => { setShowSetPassword(true); setNewPasswordInput(activeWorkspace?.password || ''); }} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #C9DDD0', background: '#FFFFFF', color: '#2B4A3A', cursor: 'pointer' }}>
                {hasPassword ? '編集パスワードを変更' : '編集パスワードを設定する'}
              </button>
            )}
            {hasMasterAccess && activeWorkspaceId && !editingWorkspaceName && (
              <button onClick={startRenameWorkspace} style={{ fontSize: '12px', color: '#5A6E62', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                名前を変更
              </button>
            )}
            {editingWorkspaceName && (
              <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  autoFocus
                  value={workspaceNameInput}
                  onChange={e => setWorkspaceNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmRenameWorkspace()}
                  style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2DCCC', width: '100px' }}
                />
                <button onClick={confirmRenameWorkspace} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#2B2823', color: '#FAF8F4', cursor: 'pointer' }}>保存</button>
              </span>
            )}
            {hasMasterAccess && workspaces.length > 1 && activeWorkspaceId && (
              <button onClick={() => removeWorkspace(activeWorkspaceId)} title="このシフトを削除" style={{ fontSize: '12px', color: '#B0746A', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Trash2 size={12} /> このシフトを削除
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: '12px', color: '#8A7A52', fontWeight: 600 }}>閲覧モード（編集には店舗管理者ログインが必要です）</span>
            <button onClick={() => { setShowPasswordPrompt(true); setPasswordError(''); setPasswordInput(''); }} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: 'pointer' }}>
              店舗管理者ログイン
            </button>
          </>
        )}
      </div>

      {showPasswordPrompt && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', width: '320px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>編集パスワードを入力</div>
            <input
              type="text"
              autoFocus
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && attemptUnlock()}
              placeholder="パスワード"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px', marginBottom: '8px' }}
            />
            {passwordError && <div style={{ fontSize: '12px', color: '#C0594F', marginBottom: '8px' }}>{passwordError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPasswordPrompt(false)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={attemptUnlock} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: 'pointer' }}>
                解除する
              </button>
            </div>
          </div>
        </div>
      )}

      {showSetPassword && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', width: '340px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>編集パスワードを設定</div>
            <div style={{ fontSize: '12px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.6 }}>
              このパスワードを知っている人だけが「{activeWorkspace?.name}」を編集できます。他の管理者にはこのパスワードを直接伝えてください。空欄にすると誰でも編集できる状態に戻ります。
            </div>
            <input
              autoFocus
              value={newPasswordInput}
              onChange={e => setNewPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setWorkspacePassword()}
              placeholder="新しいパスワード（空欄で解除）"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSetPassword(false)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={setWorkspacePassword} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: 'pointer' }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'offdays' && (() => {
        const selectedPerson = (selectedOffPersonType === 'trainer' || selectedOffPersonType === 'assistant')
          ? (selectedOffPersonType === 'trainer' ? trainers.find(t => t.id === selectedOffPersonId) : assistants.find(a => a.id === selectedOffPersonId))
          : null;
        return (
          <div>
            <div style={{ fontSize: '12px', color: '#9C9486', marginBottom: '16px', lineHeight: 1.6 }}>
              スタッフの名前を選ぶと、その人だけの休みをカレンダーで個別に設定できます（曜日固定の人は「曜日で一括設定」も使えます）。店舗全体の定休日・特別営業日はその下のボタンから設定できます。
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              <button onClick={() => { setSelectedOffPersonType('store_weekly'); setSelectedOffPersonId(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px', borderRadius: '8px', border: selectedOffPersonType === 'store_weekly' ? '1px solid #B0746A' : '1px solid #EEE9DE', background: selectedOffPersonType === 'store_weekly' ? '#B0746A' : '#FFFFFF', color: selectedOffPersonType === 'store_weekly' ? '#FFFFFF' : '#2B2823', cursor: 'pointer', fontWeight: 600 }}>
                <CalendarOff size={14} /> 定休日設定
              </button>
              <button onClick={() => { setSelectedOffPersonType('store_override'); setSelectedOffPersonId(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px', borderRadius: '8px', border: selectedOffPersonType === 'store_override' ? '1px solid #4A6B5A' : '1px solid #EEE9DE', background: selectedOffPersonType === 'store_override' ? '#4A6B5A' : '#FFFFFF', color: selectedOffPersonType === 'store_override' ? '#FFFFFF' : '#2B2823', cursor: 'pointer', fontWeight: 600 }}>
                <Calendar size={14} /> 特別営業日設定
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px', color: '#1F1C18' }}>トレーナー</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {trainers.length === 0 && <span style={{ fontSize: '12px', color: '#B0A99A' }}>まだ登録されていません</span>}
                  {trainers.map(t => {
                    const isSel = selectedOffPersonType === 'trainer' && selectedOffPersonId === t.id;
                    return (
                      <button key={t.id} onClick={() => { setSelectedOffPersonId(t.id); setSelectedOffPersonType('trainer'); setBulkOffWeekdays([]); }}
                        style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: isSel ? '1px solid #2B2823' : '1px solid #EEE9DE', background: isSel ? '#2B2823' : '#FFFFFF', color: isSel ? '#FAF8F4' : '#2B2823', cursor: 'pointer', fontWeight: isSel ? 700 : 500 }}>
                        {t.name}{(t.offDates && t.offDates.length > 0) ? `（${t.offDates.length}）` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px', color: '#1F1C18' }}>アシスタント</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {assistants.length === 0 && <span style={{ fontSize: '12px', color: '#B0A99A' }}>まだ登録されていません</span>}
                  {assistants.map(a => {
                    const isSel = selectedOffPersonType === 'assistant' && selectedOffPersonId === a.id;
                    return (
                      <button key={a.id} onClick={() => { setSelectedOffPersonId(a.id); setSelectedOffPersonType('assistant'); setBulkOffWeekdays([]); }}
                        style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: isSel ? '1px solid #2B2823' : '1px solid #EEE9DE', background: isSel ? '#2B2823' : '#FFFFFF', color: isSel ? '#FAF8F4' : '#2B2823', cursor: 'pointer', fontWeight: isSel ? 700 : 500 }}>
                        {a.name}{(a.offDates && a.offDates.length > 0) ? `（${a.offDates.length}）` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {selectedOffPersonType === 'store_weekly' && (
              <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #EEE9DE', padding: '20px', maxWidth: '480px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px', color: '#1F1C18' }}>店舗の定休日（毎週）</h3>
                <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.5 }}>
                  選んだ曜日はカレンダー上で定休日になり、その日は全員のシフト割り当てができなくなります。特定の日だけ例外にしたい場合は「特別営業日設定」で個別に設定できます。
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {DAY_LABELS.map((label, idx) => {
                    const isClosedDay = (activeWorkspace?.closedWeekdays || []).includes(idx);
                    return isUnlocked ? (
                      <button key={idx} onClick={() => toggleClosedWeekday(idx)}
                        style={{ fontSize: '12px', width: '36px', height: '36px', borderRadius: '8px', border: isClosedDay ? '1px solid #B0746A' : '1px solid #EEE9DE', background: isClosedDay ? '#B0746A' : '#FFFFFF', color: isClosedDay ? '#FFFFFF' : '#2B2823', cursor: 'pointer', fontWeight: 700 }}>
                        {label}
                      </button>
                    ) : (
                      <span key={idx} style={{ fontSize: '12px', width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #EEE9DE', background: isClosedDay ? '#B0746A' : '#FFFFFF', color: isClosedDay ? '#FFFFFF' : '#B0A99A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedOffPersonType === 'store_override' && (
              <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #EEE9DE', padding: '20px', maxWidth: '480px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1F1C18' }}>特別営業日・特別休業日設定</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => changeMonth(-1)} style={{ background: '#FAF8F4', border: '1px solid #EEE9DE', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '90px', textAlign: 'center' }}>{fmtMonthLabel(year, month)}</span>
                    <button onClick={() => changeMonth(1)} style={{ background: '#FAF8F4', border: '1px solid #EEE9DE', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.5 }}>
                  通常は定休日（毎週）の設定通りになります。特定の日だけ例外にしたい場合は、その日をクリックして上書きしてください（もう一度押すと元に戻ります）。
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {DAY_LABELS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#B0A99A', fontWeight: 600, padding: '4px' }}>{d}</div>
                  ))}
                  {Array(dates[0].getDay()).fill(null).map((_, i) => <div key={'pad' + i} />)}
                  {dates.map(d => {
                    const ds = fmtDate(d);
                    const dow = d.getDay();
                    const closed = isClosedOn(activeWorkspace, ds, dow);
                    const hasOverride = !!(activeWorkspace?.closedDateOverrides && Object.prototype.hasOwnProperty.call(activeWorkspace.closedDateOverrides, ds));
                    return (
                      <button key={ds}
                        onClick={() => isUnlocked && setDateOverride(ds, !closed)}
                        disabled={!isUnlocked}
                        title={hasOverride ? '例外設定中（クリックでもう一度切り替え、または個別に解除）' : undefined}
                        style={{
                          aspectRatio: '1', borderRadius: '10px',
                          border: closed ? (hasOverride ? '1.5px solid #B0746A' : '1px solid #EEE9DE') : (hasOverride ? '1.5px solid #4A6B5A' : '1px solid #EEE9DE'),
                          background: closed ? '#F8EDEA' : (hasOverride ? '#EAF1ED' : '#FFFFFF'),
                          cursor: isUnlocked ? 'pointer' : 'default',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px'
                        }}>
                        <span style={{ fontSize: '13px', fontWeight: closed ? 700 : 500, color: closed ? '#B0746A' : '#2B2823' }}>{d.getDate()}</span>
                        <span style={{ fontSize: '8px', color: closed ? '#B0746A' : '#4A6B5A', marginTop: '2px' }}>
                          {closed ? '休業' : '営業'}{hasOverride ? '・例外' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedPerson && (
              <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #EEE9DE', padding: '20px', maxWidth: '480px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1F1C18' }}>{selectedPerson.name} の休み設定</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => changeMonth(-1)} style={{ background: '#FAF8F4', border: '1px solid #EEE9DE', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '90px', textAlign: 'center' }}>{fmtMonthLabel(year, month)}</span>
                    <button onClick={() => changeMonth(1)} style={{ background: '#FAF8F4', border: '1px solid #EEE9DE', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                {!isUnlocked && (
                  <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '10px' }}>閲覧モードのため、休みの変更はできません。</div>
                )}

                {isUnlocked && (
                  <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '10px', background: '#FAF8F4', border: '1px solid #EEE9DE' }}>
                    <div style={{ fontSize: '11px', color: '#8A8378', marginBottom: '8px', fontWeight: 600 }}>
                      曜日固定の人向け：曜日で一括設定（{fmtMonthLabel(year, month)}に反映）
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      {DAY_LABELS.map((label, idx) => {
                        const isSelDay = bulkOffWeekdays.includes(idx);
                        return (
                          <button key={idx} onClick={() => toggleBulkOffWeekday(idx)}
                            style={{ fontSize: '11px', width: '28px', height: '28px', borderRadius: '6px', border: isSelDay ? '1px solid #B0746A' : '1px solid #E2DCCC', background: isSelDay ? '#B0746A' : '#FFFFFF', color: isSelDay ? '#FFFFFF' : '#2B2823', cursor: 'pointer', fontWeight: 700 }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => applyBulkOffWeekdays(selectedPerson.id, selectedOffPersonType)}
                        disabled={bulkOffWeekdays.length === 0}
                        style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: bulkOffWeekdays.length === 0 ? '#E2DCCC' : '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: bulkOffWeekdays.length === 0 ? 'default' : 'pointer' }}>
                        この曜日を{fmtMonthLabel(year, month)}の休みに一括設定
                      </button>
                      <button
                        onClick={() => copyLastMonthOffWeekdays(selectedPerson.id, selectedOffPersonType)}
                        style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', color: '#2B2823', fontWeight: 600, cursor: 'pointer' }}>
                        先月の休みの曜日をコピーして設定
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {DAY_LABELS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#B0A99A', fontWeight: 600, padding: '4px' }}>{d}</div>
                  ))}
                  {Array(dates[0].getDay()).fill(null).map((_, i) => <div key={'pad' + i} />)}
                  {dates.map(d => {
                    const ds = fmtDate(d);
                    const isOff = (selectedPerson.offDates || []).includes(ds);
                    return (
                      <button key={ds}
                        onClick={() => isUnlocked && toggleOffDate(selectedPerson.id, selectedOffPersonType, ds)}
                        disabled={!isUnlocked}
                        style={{
                          aspectRatio: '1', borderRadius: '10px',
                          border: isOff ? '1.5px solid #B0746A' : '1px solid #EEE9DE',
                          background: isOff ? '#F8EDEA' : '#FFFFFF',
                          cursor: isUnlocked ? 'pointer' : 'default',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px'
                        }}>
                        <span style={{ fontSize: '13px', fontWeight: isOff ? 700 : 500, color: isOff ? '#B0746A' : '#2B2823' }}>{d.getDate()}</span>
                        {isOff && <span style={{ fontSize: '9px', color: '#B0746A', marginTop: '2px' }}>休み</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!selectedPerson && selectedOffPersonType !== 'store_weekly' && selectedOffPersonType !== 'store_override' && (
              <div style={{ fontSize: '13px', color: '#B0A99A', textAlign: 'center', padding: '40px 0' }}>
                上の名前またはボタンを選んでください
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'curriculum' && (
        <div style={{ margin: '0 -16px' }}>
          <CurriculumApp embedded={true} embeddedCanEdit={isUnlocked} />
        </div>
      )}

      {tab === 'categories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #EEE9DE' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px', color: '#1F1C18' }}>練習項目一覧</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {categories.map(c => (
              <span key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: '#FAF8F4', border: '1px solid #EEE9DE' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: categoryColor(categories, c), flexShrink: 0 }} />
                {c}
                {isUnlocked && (
                  <button onClick={() => removeCategory(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', display: 'flex' }}>
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {categories.length === 0 && <span style={{ fontSize: '13px', color: '#B0A99A' }}>まだ登録されていません</span>}
          </div>
          {isUnlocked && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                placeholder="例：パーマ、トリートメント"
                style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px' }}
              />
              <button onClick={addCategory} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={14} /> 追加
              </button>
            </div>
          )}
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #EEE9DE' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px', color: '#1F1C18' }}>アシスタント実習タイプ</h3>
            <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.5 }}>
              モデル実習・ウィッグ実習など、負担の種類を登録します。シフト画面の日別設定で各アシスタントにタイプを設定すると、自動割り当て時にトレーナーごとにバランスよく振り分けます。
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {assistantTypes.map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: '#FAF8F4', border: '1px solid #EEE9DE' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: assistantTypeColor(assistantTypes, t), flexShrink: 0 }} />
                  {t}
                  {isUnlocked && assistantTypes.length > 1 && (
                    <button onClick={() => removeAssistantType(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', display: 'flex' }}>
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {isUnlocked && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={newAssistantType}
                  onChange={e => setNewAssistantType(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAssistantType()}
                  placeholder="例：モデル、ウィッグ"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px' }}
                />
                <button onClick={addAssistantType} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={14} /> 追加
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #EEE9DE' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px', color: '#1F1C18' }}>トレーナー一覧</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', maxHeight: '320px', overflowY: 'auto' }}>
              {trainers.length === 0 && <div style={{ fontSize: '13px', color: '#B0A99A' }}>まだ登録されていません</div>}
              {trainers.map(t => (
                <div
                  key={t.id}
                  draggable={isUnlocked}
                  onDragStart={() => isUnlocked && handleTrainerDragStart(t.id)}
                  onDragOver={(e) => isUnlocked && handleTrainerDragOver(e, t.id)}
                  onDragEnd={() => isUnlocked && handleTrainerDragEnd()}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#FAF8F4', borderRadius: '8px', opacity: draggedTrainerId === t.id ? 0.5 : 1, gap: '8px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    {isUnlocked && (
                      <span style={{ cursor: 'grab', color: '#C9C2B2', fontSize: '14px', lineHeight: 1, userSelect: 'none', flexShrink: 0 }} title="ドラッグして並べ替え">⠿</span>
                    )}
                    <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => downloadIcs(buildIcs(practiceDays, year, month, trainers, assistants, t.id, 'trainer'), `${t.name}_シフト_${year}年${month + 1}月.ics`)} title="この人の予定をカレンダーファイルで書き出す" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8378', padding: '4px' }}>
                      <Download size={14} />
                    </button>
                    {isUnlocked && (
                      <button onClick={() => removePerson(t.id, 'trainer')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', padding: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #EEE9DE' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px', color: '#1F1C18' }}>アシスタント一覧</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', maxHeight: '320px', overflowY: 'auto' }}>
              {assistants.length === 0 && <div style={{ fontSize: '13px', color: '#B0A99A' }}>まだ登録されていません</div>}
              {assistants.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#FAF8F4', borderRadius: '8px', gap: '8px' }}>
                  <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{a.name}</span>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => downloadIcs(buildIcs(practiceDays, year, month, trainers, assistants, a.id, 'assistant'), `${a.name}_シフト_${year}年${month + 1}月.ics`)} title="この人の予定をカレンダーファイルで書き出す" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8378', padding: '4px' }}>
                      <Download size={14} />
                    </button>
                    {isUnlocked && (
                      <button onClick={() => removePerson(a.id, 'assistant')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', padding: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isUnlocked && (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #EEE9DE', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select value={newType} onChange={e => setNewType(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px', background: '#FAF8F4', width: '100%' }}>
                <option value="trainer">トレーナー</option>
                <option value="assistant">アシスタント</option>
              </select>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPerson()}
                placeholder="名前を入力"
                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px', width: '100%' }}
              />
              <button onClick={addPerson} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                <Plus size={14} /> 追加
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'shift' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => changeMonth(-1)} className="no-print" style={{ background: '#FFFFFF', border: '1px solid #EEE9DE', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '15px', fontWeight: 700, minWidth: '110px', textAlign: 'center' }}>{fmtMonthLabel(year, month)}</span>
              <button onClick={() => changeMonth(1)} className="no-print" style={{ background: '#FFFFFF', border: '1px solid #EEE9DE', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setShowCountsOnCalendar(v => !v)} className="no-print"
                style={{ fontSize: '11px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #EEE9DE', background: showCountsOnCalendar ? '#EAF1ED' : '#FFFFFF', color: showCountsOnCalendar ? '#4A6B5A' : '#8A8378', cursor: 'pointer', fontWeight: 600 }}>
                T/A人数表示：{showCountsOnCalendar ? 'ON' : 'OFF'}
              </button>
            </div>
            {isUnlocked && (
              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={autoAssign} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '8px', border: 'none', background: '#4A6B5A', color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  <Shuffle size={14} /> トレーナーを自動で割り当て
                </button>
              </div>
            )}
          </div>

          <div className="no-print" style={{ fontSize: '12px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.6 }}>
            日付をクリックすると下に詳細が表示されます → 「時間帯を追加」で項目を作成 → トレーナー・アシスタントの名前をクリックすると即担当になります（もう一度押すと解除）→ アシスタントを先に手動で配置すると、トレーナーの自動割り当てが「アシスタント1〜3人→トレーナー2人、4〜6人→3人」のように人数を決めます（休みで人数が足りない場合は少なくなります）
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '24px' }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#B0A99A', fontWeight: 600, padding: '4px' }}>{d}</div>
            ))}
            {Array(dates[0].getDay()).fill(null).map((_, i) => <div key={'pad' + i} />)}
            {dates.map(d => {
              const ds = fmtDate(d);
              const day = practiceDays[ds];
              const isPractice = !!day;
              const isSelected = ds === selectedDate;
              const closedDay = isClosedOn(activeWorkspace, ds, d.getDay());
              const trainerSet = new Set();
              const assistantSet = new Set();
              const categorySet = new Set();
              (day?.sessions || []).forEach(s => {
                (s.assigned?.trainers || []).forEach(id => trainerSet.add(id));
                (s.assigned?.assistants || []).forEach(id => assistantSet.add(id));
                if (s.category) categorySet.add(s.category);
              });
              const dayCategoryColors = Array.from(categorySet).map(c => categoryColor(categories, c));
              return (
                <button
                  key={ds}
                  onClick={() => selectDate(ds)}
                  style={{
                    aspectRatio: '1', borderRadius: '10px',
                    border: isSelected ? '2px solid #2B2823' : (closedDay ? '1.5px solid #B0746A' : (isPractice ? '1.5px solid #4A6B5A' : '1px solid #EEE9DE')),
                    background: isSelected ? '#FFF6E8' : (closedDay ? '#F8EDEA' : (isPractice ? '#EAF1ED' : '#FFFFFF')),
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '4px', position: 'relative', overflow: 'hidden'
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: (isPractice || closedDay) ? 700 : 500, color: closedDay ? '#B0746A' : (isPractice ? '#2B4A3A' : '#2B2823') }}>{d.getDate()}</span>
                  {closedDay && (
                    <span style={{ fontSize: '9px', color: '#B0746A', marginTop: '2px' }}>定休日</span>
                  )}
                  {!closedDay && isPractice && showCountsOnCalendar && (
                    <span style={{ fontSize: '9px', color: '#4A6B5A', marginTop: '2px' }}>
                      T{trainerSet.size}/A{assistantSet.size}
                    </span>
                  )}
                  {!closedDay && dayCategoryColors.length > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', height: '4px' }}>
                      {dayCategoryColors.map((color, i) => (
                        <div key={i} style={{ flex: 1, background: color }} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 画面表示用：選択中の1日だけ表示 */}
          <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedDate && (() => {
              const ds = selectedDate;
              const day = practiceDays[ds];
              const [yy, mm, dd] = ds.split('-').map(Number);
              const d = new Date(yy, mm - 1, dd);
              const dow = d.getDay();
              const closedToday = isClosedOn(activeWorkspace, ds, dow);
              const hasOverride = !!(activeWorkspace?.closedDateOverrides && Object.prototype.hasOwnProperty.call(activeWorkspace.closedDateOverrides, ds));
              return (
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #EEE9DE', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: closedToday ? '#B0746A' : '#1F1C18' }}>
                      {d.getMonth() + 1}月{d.getDate()}日（{DAY_LABELS[dow]}）{closedToday && '（定休日）'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {isUnlocked && (
                        <button onClick={() => setDateOverride(ds, !closedToday)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #E2DCCC', background: closedToday ? '#FAF8F4' : '#FFF8F6', cursor: 'pointer', color: closedToday ? '#2B2823' : '#B0746A' }}>
                          {closedToday ? 'この日は特別に営業する' : 'この日を定休日にする'}
                        </button>
                      )}
                      {isUnlocked && hasOverride && (
                        <button onClick={() => setDateOverride(ds, null)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FAF8F4', cursor: 'pointer', color: '#8A8378' }}>
                          例外を解除
                        </button>
                      )}
                      {isUnlocked && (
                        <button onClick={() => addSession(ds)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FAF8F4', cursor: 'pointer', color: '#2B2823' }}>
                          <Plus size={11} /> 時間帯を追加
                        </button>
                      )}
                      {day && isUnlocked && (
                        <button onClick={() => deletePracticeDay(ds)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #EEDCDC', background: '#FFF8F6', cursor: 'pointer', color: '#B0746A' }}>
                          <Trash2 size={11} /> この日を削除
                        </button>
                      )}
                    </div>
                  </div>

                  {!day && (
                    <div style={{ fontSize: '12px', color: '#B0A99A', padding: '16px 0', textAlign: 'center' }}>
                      {closedToday ? '定休日です。' : (isUnlocked ? 'この日にはまだ練習会がありません。「時間帯を追加」で作成してください。' : 'この日には練習会がありません。')}
                    </div>
                  )}

                  {!closedToday && day && (
                    <div style={{ background: '#FAF8F4', borderRadius: '10px', padding: '14px', marginBottom: '14px', border: '1px solid #EEE9DE', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                      {/* Step 1: 参加アシスタント選択 + タイプ設定 */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361EE', marginBottom: '8px' }}>Step 1｜割り振り設定</div>
                        {isUnlocked && (() => {
                         const _ts = new Set();
                         (day.sessions || []).forEach(s => (s.assigned?.trainers || []).forEach(id => _ts.add(id)));
                         const _at = Array.from(_ts).filter(id => id !== day.dayLeader);
                         const _pt = day.dayParticipants || [];
                         if (_at.length === 0 || _pt.length === 0) return null;
                         return (
                           <div style={{ marginBottom: '12px' }}>
                             <div style={{ fontSize: '11px', color: '#8A8378', marginBottom: '8px' }}>トレーナーを選択してから、担当アシスタントをタップして手動で割り振れます。未割り振りの残りは自動で均等配置できます。</div>
                             <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                               {_at.map(tid => {
                                 const isSel = manualPairingTrainerId === tid;
                                 const ac = (day.dayPairings?.[tid] || []).length;
                                 return (
                                   <button key={tid} onClick={() => setManualPairingTrainerId(isSel ? null : tid)}
                                     style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: isSel ? '2px solid #4361EE' : '1px solid #E2DCCC', background: isSel ? '#EEF2FF' : '#FFFFFF', color: isSel ? '#4361EE' : '#2B2823', cursor: 'pointer', fontWeight: isSel ? 700 : 500 }}>
                                     {nameById(tid, 'trainer')}
                                     {ac > 0 && <span style={{ fontSize: '10px', marginLeft: '4px', color: '#4A6B5A' }}>{ac}人</span>}
                                   </button>
                                 );
                               })}
                             </div>
                             {manualPairingTrainerId && (
                               <div style={{ padding: '10px', background: '#F0F4FF', borderRadius: '8px', marginBottom: '10px' }}>
                                 <div style={{ fontSize: '11px', color: '#4361EE', fontWeight: 700, marginBottom: '8px' }}>{nameById(manualPairingTrainerId, 'trainer')} の担当アシスタントを選択</div>
                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                   {_pt.map(aid => {
                                     const _ia = (day.dayPairings?.[manualPairingTrainerId] || []).includes(aid);
                                     const _at2 = (day.dayTypeMap || {})[aid];
                                     const _ao = _at.some(tid => tid !== manualPairingTrainerId && (day.dayPairings?.[tid] || []).includes(aid));
                                     return (
                                       <button key={aid} onClick={() => toggleManualPairing(ds, manualPairingTrainerId, aid)}
                                         style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '8px', border: _ia ? '1px solid #4361EE' : '1px solid #E2DCCC', background: _ia ? '#4361EE' : (_ao ? '#F5F5F5' : '#FFFFFF'), color: _ia ? '#FFFFFF' : (_ao ? '#B0A99A' : '#2B2823'), cursor: 'pointer', fontWeight: _ia ? 700 : 500 }}>
                                         {nameById(aid, 'assistant')}
                                         {_at2 && <span style={{ fontSize: '9px', marginLeft: '4px', padding: '1px 5px', borderRadius: '999px', background: assistantTypeColor(assistantTypes, _at2), color: '#FFFFFF', fontWeight: 700 }}>{_at2}</span>}
                                         {_ao && !_ia && <span style={{ fontSize: '9px', marginLeft: '4px', color: '#B0A99A' }}>他に割済</span>}
                                       </button>
                                     );
                                   })}
                                 </div>
                               </div>
                             )}
                             <button onClick={() => autoAssignAssistants(ds)}
                               style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#4361EE', color: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>
                               <Shuffle size={13} /> 残りを自動でバランスよく割り振る
                             </button>
                           </div>
                         );
                        })()}
                        {day.dayPairings && Object.keys(day.dayPairings).length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {Object.entries(day.dayPairings).map(([tid, aids]) => (
                              <div key={tid}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#2B2823', marginBottom: '4px' }}>{nameById(tid, 'trainer')}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                                  {aids.length > 0 ? aids.map(aid => {
                                    const _r = (day.dayTypeMap || {})[aid];
                                    const _c = _r ? assistantTypeColor(assistantTypes, _r) : null;
                                    return (
                                      <div key={aid} style={{ fontSize: '12px', color: '#2B2823', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {nameById(aid, 'assistant')}
                                        {_r && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: _c, color: '#FFFFFF', fontWeight: 700 }}>{_r}</span>}
                                      </div>
                                    );
                                  }) : (
                                    <div style={{ fontSize: '12px', color: '#B0A99A' }}>（担当なし）</div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {day.dayLeader && (
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#B0746A', marginBottom: '4px' }}>{nameById(day.dayLeader, 'trainer')}</div>
                                <div style={{ paddingLeft: '8px' }}><div style={{ fontSize: '12px', color: '#B0746A' }}>全体監督（リーダー）</div></div>
                              </div>
                            )}
                          </div>
                        )}
                        {(!day.dayPairings || Object.keys(day.dayPairings).length === 0) && !isUnlocked && (
                          <div style={{ fontSize: '12px', color: '#B0A99A' }}>まだ割り振りが行われていません</div>
                        )}
                      </div>
                    </div>
                  )}
                      {/* Step 2: リーダートレーナーの選択 */}
                      {(() => {
                        const trainerIdSet = new Set();
                        (day.sessions || []).forEach(s => (s.assigned?.trainers || []).forEach(id => trainerIdSet.add(id)));
                        const dayTrainerIds = Array.from(trainerIdSet);
                        if (dayTrainerIds.length === 0) return null;
                        return (
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: isUnlocked ? '#4361EE' : '#8A8378', marginBottom: '8px' }}>
                              {isUnlocked ? 'Step 2｜リーダートレーナーを選択（アシスタントを持たず全体監督）' : 'リーダートレーナー'}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {dayTrainerIds.map(tid => {
                                const isLeader = day.dayLeader === tid;
                                const name = nameById(tid, 'trainer');
                                return isUnlocked ? (
                                  <button key={tid} onClick={() => setDayLeader(ds, tid)}
                                    style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: isLeader ? '1px solid #B0746A' : '1px solid #E2DCCC', background: isLeader ? '#B0746A' : '#FFFFFF', color: isLeader ? '#FFFFFF' : '#8A8378', cursor: 'pointer', fontWeight: isLeader ? 700 : 500 }}>
                                    {name}{isLeader ? '（リーダー）' : ''}
                                  </button>
                                ) : isLeader ? (
                                  <span key={tid} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #B0746A', background: '#B0746A', color: '#FFFFFF', fontWeight: 700 }}>
                                    {name}（リーダー）
                                  </span>
                                ) : null;
                              })}
                              {!isUnlocked && !day.dayLeader && <span style={{ fontSize: '12px', color: '#B0A99A' }}>未設定</span>}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Step 3: 割り振り設定（手動+自動） */}
                      {/* Step 3: 割り振り設定（手動+自動） */}
                      {isUnlocked ? (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361EE', marginBottom: '8px' }}>Step 3｜参加アシスタントを選んでタイプを設定</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {assistants.filter(a => !(a.offDates || []).includes(ds)).map(a => {
                              const isParticipant = (day.dayParticipants || []).includes(a.id);
                              const currentType = (day.dayTypeMap || {})[a.id] || null;
                              return (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <button onClick={() => toggleDayParticipant(ds, a.id)}
                                    style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: isParticipant ? '1px solid #2B2823' : '1px solid #E2DCCC', background: isParticipant ? '#2B2823' : '#FFFFFF', color: isParticipant ? '#FAF8F4' : '#8A8378', cursor: 'pointer', fontWeight: isParticipant ? 700 : 500 }}>
                                    {a.name}
                                  </button>
                                  {isParticipant && assistantTypes.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                      {assistantTypes.map(t => {
                                        const isSel = currentType === t;
                                        const tColor = assistantTypeColor(assistantTypes, t);
                                        return (
                                          <button key={t} onClick={() => setAssistantDayType(ds, a.id, isSel ? null : t)}
                                            style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '999px', border: isSel ? `1px solid ${tColor}` : '1px solid #E2DCCC', background: isSel ? tColor : '#FFFFFF', color: isSel ? '#FFFFFF' : '#8A8378', cursor: 'pointer', fontWeight: isSel ? 700 : 500 }}>
                                            {t}
                                          </button>
                                        );
                                      })}
                                      {!currentType && <span style={{ fontSize: '10px', color: '#B0A99A' }}>タイプ未設定</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {assistants.length === 0 && <span style={{ fontSize: '12px', color: '#B0A99A' }}>人員登録タブでアシスタントを追加してください</span>}
                          </div>
                        </div>
                      ) : (day.dayParticipants && day.dayParticipants.length > 0) && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#8A8378', marginBottom: '8px' }}>この日の参加アシスタント</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {(day.dayParticipants || []).map(aid => {
                              const aType = (day.dayTypeMap || {})[aid];
                              const tColor = aType ? assistantTypeColor(assistantTypes, aType) : null;
                              return (
                                <span key={aid} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '8px', background: '#2B2823', color: '#FAF8F4', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  {nameById(aid, 'assistant')}
                                  {aType && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: tColor, color: '#FFFFFF', fontWeight: 700 }}>{aType}</span>}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}


                  {day && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {day.sessions.map(session => (
                      <div key={session.id} style={{ border: '1px solid #EEE9DE', borderRadius: '10px', padding: '12px', background: '#FCFBF8' }}>
                        {isUnlocked ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: categoryColor(categories, session.category), flexShrink: 0 }} />
                            <select value={session.category} onChange={e => updateSession(ds, session.id, { category: e.target.value })}
                              style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2DCCC', background: '#FFFFFF', fontWeight: 600, color: '#2B4A3A' }}>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={splitTime(session.startTime).h} onChange={e => updateSession(ds, session.id, { startTime: joinTime(e.target.value, splitTime(session.startTime).m) })}
                              style={{ fontSize: '12px', padding: '6px 6px', borderRadius: '6px', border: '1px solid #E2DCCC' }}>
                              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span style={{ fontSize: '12px', color: '#9C9486' }}>:</span>
                            <select value={splitTime(session.startTime).m} onChange={e => updateSession(ds, session.id, { startTime: joinTime(splitTime(session.startTime).h, e.target.value) })}
                              style={{ fontSize: '12px', padding: '6px 6px', borderRadius: '6px', border: '1px solid #E2DCCC' }}>
                              {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <span style={{ fontSize: '12px', color: '#9C9486' }}>〜</span>
                            <select value={splitTime(session.endTime).h} onChange={e => updateSession(ds, session.id, { endTime: joinTime(e.target.value, splitTime(session.endTime).m) })}
                              style={{ fontSize: '12px', padding: '6px 6px', borderRadius: '6px', border: '1px solid #E2DCCC' }}>
                              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span style={{ fontSize: '12px', color: '#9C9486' }}>:</span>
                            <select value={splitTime(session.endTime).m} onChange={e => updateSession(ds, session.id, { endTime: joinTime(splitTime(session.endTime).h, e.target.value) })}
                              style={{ fontSize: '12px', padding: '6px 6px', borderRadius: '6px', border: '1px solid #E2DCCC' }}>
                              {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            {day.sessions.length > 1 && (
                              <button onClick={() => removeSession(ds, session.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C2A98E', marginLeft: 'auto' }}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#2B4A3A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: categoryColor(categories, session.category), flexShrink: 0 }} />
                            {session.category}　{session.startTime}〜{session.endTime}
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '6px', fontWeight: 600 }}>{isUnlocked ? 'トレーナー（クリックで担当に設定）' : 'トレーナー'}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {isUnlocked ? trainers.map(t => {
                                const on = session.assigned?.trainers?.includes(t.id);
                                const count = trainerMonthCounts.find(tc => tc.id === t.id)?.byCategory?.[session.category] ?? 0;
                                const personOff = (t.offDates || []).includes(ds);
                                const blocked = closedToday || personOff;
                                return (
                                  <button key={t.id} onClick={() => !blocked && toggleAssigned(ds, session.id, t.id, 'trainer')}
                                    disabled={blocked}
                                    title={blocked ? (closedToday ? '定休日のため割り当てできません' : `${t.name}さんの休みのため割り当てできません`) : undefined}
                                    style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', border: blocked ? '1px solid #EEE9DE' : (on ? '1px solid #2B2823' : '1px solid #EEE9DE'), background: blocked ? '#F3F1EC' : (on ? '#2B2823' : '#FAF8F4'), color: blocked ? '#C9C2B2' : (on ? '#FAF8F4' : '#9C9486'), cursor: blocked ? 'not-allowed' : 'pointer', fontWeight: on ? 700 : 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {t.name}
                                    <span style={{ fontSize: '10px', opacity: 0.7 }}>
                                      {`(${count})`}{blocked ? (closedToday ? ' 定休日' : ' 休み') : ''}
                                    </span>
                                  </button>
                                );
                              }) : (
                                (session.assigned?.trainers || []).length > 0
                                  ? sortIdsByRank(session.assigned.trainers, 'trainer').map(id => (
                                      <span key={id} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: '#2B2823', color: '#FAF8F4', fontWeight: 700 }}>{nameById(id, 'trainer')}</span>
                                    ))
                                  : <span style={{ fontSize: '12px', color: '#C2BBA9' }}>未割り当て</span>
                              )}
                              {isUnlocked && trainers.length === 0 && <span style={{ fontSize: '12px', color: '#C2BBA9' }}>人員登録タブでトレーナーを追加してください</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '6px', fontWeight: 600 }}>{isUnlocked ? 'アシスタント（クリックで参加に設定）' : 'アシスタント'}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                              {isUnlocked ? assistants.map(a => {
                                const on = session.assigned?.assistants?.includes(a.id);
                                const personOff = (a.offDates || []).includes(ds);
                                const blocked = closedToday || personOff;
                                const aType = (day?.dayTypeMap || {})[a.id] || null;
                                return (
                                  <button key={a.id} onClick={() => !blocked && toggleAssigned(ds, session.id, a.id, 'assistant')}
                                    disabled={blocked}
                                    title={blocked ? (closedToday ? '定休日のため割り当てできません' : `${a.name}さんの休みのため割り当てできません`) : undefined}
                                    style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', border: blocked ? '1px solid #EEE9DE' : (on ? '1px solid #2B2823' : '1px solid #EEE9DE'), background: blocked ? '#F3F1EC' : (on ? '#2B2823' : '#FAF8F4'), color: blocked ? '#C9C2B2' : (on ? '#FAF8F4' : '#9C9486'), cursor: blocked ? 'not-allowed' : 'pointer', fontWeight: on ? 700 : 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {a.name}
                                    {aType && !blocked && (
                                      <span style={{ fontSize: '9px', padding: '2px 5px', borderRadius: '999px', background: assistantTypeColor(assistantTypes, aType), color: '#FFFFFF', fontWeight: 700 }}>{aType}</span>
                                    )}
                                    {blocked && (
                                      <span style={{ fontSize: '10px', opacity: 0.7 }}>{closedToday ? '定休日' : '休み'}</span>
                                    )}
                                  </button>
                                );
                              }) : (
                                (session.assigned?.assistants || []).length > 0
                                  ? sortIdsByRank(session.assigned.assistants, 'assistant').map(id => (
                                      <span key={id} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: '#2B2823', color: '#FAF8F4', fontWeight: 700 }}>{nameById(id, 'assistant')}</span>
                                    ))
                                  : <span style={{ fontSize: '12px', color: '#C2BBA9' }}>未割り当て</span>
                              )}
                              {isUnlocked && assistants.length === 0 && <span style={{ fontSize: '12px', color: '#C2BBA9' }}>人員登録タブでアシスタントを追加してください</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
            })()}
            {!selectedDate && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#B0A99A', fontSize: '13px', background: '#FFFFFF', borderRadius: '12px', border: '1px dashed #EEE9DE' }}>
                上のカレンダーで日付をクリックしてください
              </div>
            )}
          </div>

          {/* 印刷用：月内のすべての練習会日を表示 */}
          <div className="print-only" style={{ flexDirection: 'column', gap: '10px' }}>
            {dates.filter(d => practiceDays[fmtDate(d)]).map(d => {
              const ds = fmtDate(d);
              const day = practiceDays[ds];
              return (
                <div key={ds} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                    {d.getMonth() + 1}月{d.getDate()}日（{DAY_LABELS[d.getDay()]}）
                  </div>
                  {day.sessions.map(session => (
                    <div key={session.id} style={{ marginBottom: '10px', paddingLeft: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#2B4A3A', marginBottom: '4px' }}>
                        {session.category}　{session.startTime}〜{session.endTime}
                      </div>
                      <div style={{ fontSize: '12px', marginBottom: '2px' }}>
                        トレーナー：{sortIdsByRank(session.assigned?.trainers, 'trainer').map(id => nameById(id, 'trainer')).join('、') || '未割り当て'}
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        アシスタント：{sortIdsByRank(session.assigned?.assistants, 'assistant').map(id => nameById(id, 'assistant')).join('、') || '未割り当て'}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {isUnlocked && (trainers.length > 0 || assistants.length > 0) && (
            <div className="no-print" style={{ marginTop: '24px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #EEE9DE', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>今月の勉強会回数バランス</div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                <button onClick={() => setBalanceFilterCategory(null)}
                  style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '999px', border: balanceFilterCategory === null ? '1px solid #2B2823' : '1px solid #EEE9DE', background: balanceFilterCategory === null ? '#2B2823' : '#FFFFFF', color: balanceFilterCategory === null ? '#FAF8F4' : '#2B2823', cursor: 'pointer', fontWeight: 600 }}>
                  合計
                </button>
                {categories.map(cat => {
                  const isSel = balanceFilterCategory === cat;
                  const color = categoryColor(categories, cat);
                  return (
                    <button key={cat} onClick={() => setBalanceFilterCategory(cat)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '6px 12px', borderRadius: '999px', border: isSel ? `1px solid ${color}` : '1px solid #EEE9DE', background: isSel ? color : '#FFFFFF', color: isSel ? '#FFFFFF' : '#2B2823', cursor: 'pointer', fontWeight: 600 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isSel ? '#FFFFFF' : color, flexShrink: 0 }} />
                      {cat}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '6px' }}>
                    トレーナー<span style={{ marginLeft: '6px', color: '#C9C2B2' }}>（今月 / 前月）</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {trainerMonthCounts.map(t => {
                      const thisCount = balanceFilterCategory === null ? t.count : (t.byCategory[balanceFilterCategory] || 0);
                      const pCount = balanceFilterCategory === null ? t.prevCount : (t.prevByCategory[balanceFilterCategory] || 0);
                      return (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', alignItems: 'center' }}>
                          <span>{t.name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 700, color: '#2B2823' }}>{thisCount}回</span>
                            <span style={{ fontSize: '10px', color: '#B0A99A' }}>/ {pCount}回</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#9C9486', marginBottom: '6px' }}>アシスタント</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
                    {assistantMonthCounts.map(a => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{a.name}</span>
                        <span style={{ fontWeight: 700, color: '#2B2823' }}>
                          {balanceFilterCategory === null ? a.count : (a.byCategory[balanceFilterCategory] || 0)}回
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {showSnapshots && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', width: '420px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>自動保存された履歴</div>
            <div style={{ fontSize: '12px', color: '#9C9486', marginBottom: '14px', lineHeight: 1.6 }}>
              このブラウザ内で自動的に保存された過去の状態です。直近{MAX_SNAPSHOTS}件まで保持されます。選んだ時点の状態に戻すと、現在のデータは上書きされます。
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {snapshotList.length === 0 && <div style={{ fontSize: '13px', color: '#B0A99A' }}>まだ履歴がありません</div>}
              {snapshotList.map((snap, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#FAF8F4', borderRadius: '8px' }}>
                  <span style={{ fontSize: '13px' }}>{new Date(snap.takenAt).toLocaleString('ja-JP')}</span>
                  <button onClick={() => restoreFromSnapshot(snap)} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: 'pointer' }}>
                    この状態に戻す
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSnapshots(false)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer' }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {showMasterPrompt && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', width: '320px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>管理者パスワードを入力</div>
            <input
              type="text"
              autoFocus
              value={masterPasswordInput}
              onChange={e => setMasterPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && attemptMasterUnlock()}
              placeholder="パスワード"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px', marginBottom: '8px' }}
            />
            {masterPasswordError && <div style={{ fontSize: '12px', color: '#C0594F', marginBottom: '8px' }}>{masterPasswordError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMasterPrompt(false)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={attemptMasterUnlock} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: 'pointer' }}>
                ログイン
              </button>
            </div>
          </div>
        </div>
      )}

      {showSetMasterPassword && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', width: '340px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>管理者パスワードを設定</div>
            <div style={{ fontSize: '12px', color: '#9C9486', marginBottom: '12px', lineHeight: 1.6 }}>
              このパスワードを知っている人だけが、店舗の並べ替え・追加・削除ができます。他の管理者にはこのパスワードを直接伝えてください。
            </div>
            <input
              autoFocus
              value={newMasterPasswordInput}
              onChange={e => setNewMasterPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveMasterPassword()}
              placeholder="新しい管理者パスワード"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2DCCC', fontSize: '13px', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSetMasterPassword(false)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2DCCC', background: '#FFFFFF', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={saveMasterPassword} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2B2823', color: '#FAF8F4', fontWeight: 600, cursor: 'pointer' }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
