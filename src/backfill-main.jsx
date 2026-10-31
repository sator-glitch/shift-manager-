import React from 'react';
import { createRoot } from 'react-dom/client';
import { firebaseStorage } from './firebaseStorage.js';
import BackfillApp from './Backfill.jsx';

window.storage = firebaseStorage;

const root = createRoot(document.getElementById('backfill-root'));
root.render(<BackfillApp />);
