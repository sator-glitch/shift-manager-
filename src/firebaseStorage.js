import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, remove } from 'firebase/database';

// ここにFirebaseコンソールで取得した接続情報を入れています
const firebaseConfig = {
  apiKey: "AIzaSyD7tKI0K7tiNiB5kUMJS2lr3k0bRfjUXvE",
  authDomain: "aaaa-716d7.firebaseapp.com",
  databaseURL: "https://aaaa-716d7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "aaaa-716d7",
  storageBucket: "aaaa-716d7.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Firebaseのキーには . $ # [ ] / が使えないため、安全な文字に変換する
function encodeKey(key) {
  return key.replace(/[.$#\[\]/]/g, (c) => '_' + c.charCodeAt(0) + '_');
}

// window.storage と同じ形のインターフェースを提供する
// アプリ側のコードは window.storage.get/set/delete/list をそのまま呼べる
export const firebaseStorage = {
  async get(key) {
    const safeKey = encodeKey(key);
    const snapshot = await get(ref(db, 'data/' + safeKey));
    if (!snapshot.exists()) {
      throw new Error('not found');
    }
    return { key, value: snapshot.val() };
  },

  async set(key, value) {
    const safeKey = encodeKey(key);
    await set(ref(db, 'data/' + safeKey), value);
    return { key, value };
  },

  async delete(key) {
    const safeKey = encodeKey(key);
    await remove(ref(db, 'data/' + safeKey));
    return { key, deleted: true };
  },

  async list(prefix) {
    const snapshot = await get(ref(db, 'data'));
    if (!snapshot.exists()) return { keys: [] };
    const all = snapshot.val();
    const keys = Object.keys(all);
    return { keys: prefix ? keys.filter(k => k.startsWith(encodeKey(prefix))) : keys };
  },
};
