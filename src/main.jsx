import React from 'react';
import { createRoot } from 'react-dom/client';
import { firebaseStorage } from './firebaseStorage.js';
import ShiftManager from './ShiftManager.jsx';

// アプリ内のコードは window.storage.get/set/delete/list を呼んでいるので、
// ここでFirebase版のストレージをグローバルにセットしておく
window.storage = firebaseStorage;

const root = createRoot(document.getElementById('root'));
root.render(<ShiftManager />);
