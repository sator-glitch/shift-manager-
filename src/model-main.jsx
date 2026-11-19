import React from 'react';
import { createRoot } from 'react-dom/client';
import { firebaseStorage } from './firebaseStorage.js';
import ModelApp from './ModelApp.jsx';

window.storage = firebaseStorage;

const root = createRoot(document.getElementById('model-root'));
root.render(<ModelApp />);
