import React from 'react';
import { createRoot } from 'react-dom/client';
import { firebaseStorage } from './firebaseStorage.js';
import CurriculumApp from './Curriculum.jsx';

window.storage = firebaseStorage;

const root = createRoot(document.getElementById('curriculum-root'));
root.render(<CurriculumApp />);
