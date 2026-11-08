import React from 'react';
import { createRoot } from 'react-dom/client';
import { firebaseStorage } from './firebaseStorage.js';
import ShampooCheckApp from './ShampooCheck.jsx';

window.storage = firebaseStorage;

const root = createRoot(document.getElementById('shampoo-root'));
root.render(<ShampooCheckApp />);
