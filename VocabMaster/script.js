// Import Firebase SDK modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8OP5802S28BiIYMJgm-TqcI5WGzdIz9g",
  authDomain: "vocab-master-c3004.firebaseapp.com",
  projectId: "vocab-master-c3004",
  storageBucket: "vocab-master-c3004.firebasestorage.app",
  messagingSenderId: "365692723805",
  appId: "1:365692723805:web:9279a5478304b45991a3b4",
  measurementId: "G-QW764LDDNB"
};

// Initialize Firebase & Firestore
let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase init skipped or offline:", e);
}

// Application State
let appData = {
  words: [],
  seenWords: [],
  savedWords: [],
  testHistory: [],
  theme: 'light'
};

let currentQuiz = {
  questions: [],
  userAnswers: {},
  currentIndex: 0,
  timerInterval: null,
  secondsElapsed: 0,
  quizType: 'fresh'
};

let selectedQuizSize = 10;

// Update UI Sync Indicator
function setSyncStatus(status, text) {
  const badge = document.getElementById('syncBadge');
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncText');
  badge.classList.remove('hidden');
  badge.classList.add('flex');

  if (status === 'syncing') {
    dot.className = 'w-2 h-2 rounded-full mr-1.5 bg-amber-400 animate-pulse';
    label.innerText = text || 'Syncing...';
  } else if (status === 'synced') {
    dot.className = 'w-2 h-2 rounded-full mr-1.5 bg-emerald-500';
    label.innerText = text || 'Cloud Synced';
  } else {
    dot.className = 'w-2 h-2 rounded-full mr-1.5 bg-rose-500';
    label.innerText = text || 'Offline';
  }
}

// Save to LocalStorage and Firestore
async function persistData() {
  localStorage.setItem('vocab_master_data', JSON.stringify(appData));
  if (db) {
    try {
      setSyncStatus('syncing', 'Saving...');
      await setDoc(doc(db, "users", "global_profile"), appData);
      setSyncStatus('synced', 'Cloud Synced');
    } catch (err) {
      console.error("Firestore sync error:", err);
      setSyncStatus('error', 'Saved Locally');
    }
  }
}

// Load from Firestore first, fallback to LocalStorage
async function loadData() {
  const local = localStorage.getItem('vocab_master_data');
  if (local) {
    try { Object.assign(appData, JSON.parse(local)); } catch (e) {}
  }

  if (db) {
    try {
      setSyncStatus('syncing', 'Connecting...');
      const snap = await getDoc(doc(db, "users", "global_profile"));
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData.words && cloudData.words.length > 0) {
          appData = cloudData;
          localStorage.setItem('vocab_master_data', JSON.stringify(appData));
        }
      }
      setSyncStatus('synced', 'Cloud Synced');
    } catch (err) {
      console.warn("Firestore read failed, fallback to local:", err);
      setSyncStatus('error', 'Using Local');
    }
  }

  applyTheme(appData.theme || 'light');
  renderDashboard();
}

// Theme Handlers
window.toggleTheme = function() {
  const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(nextTheme);
  appData.theme = nextTheme;
  persistData();
};

function applyTheme(theme) {
  const icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    icon.className = 'fa-solid fa-sun text-amber-400';
  } else {
    document.documentElement.classList.remove('dark');
    icon.className = 'fa-solid fa-moon text-slate-600';
  }
}

// View Switching
window.showView = function(viewId) {
  document.getElementById('viewDashboard').classList.add('hidden');
  document.getElementById('viewQuiz').classList.add('hidden');
  document.getElementById('viewSummary').classList.add('hidden');

  if (viewId === 'dashboard') {
    document.getElementById('viewDashboard').classList.remove('hidden');
    renderDashboard();
  } else if (viewId === 'quiz') {
    document.getElementById('viewQuiz').classList.remove('hidden');
  } else if (viewId === 'summary') {
    document.getElementById('viewSummary').classList.remove('hidden');
  }
};

// Render Dashboard View
function renderDashboard() {
  const unseenCount = appData.words.filter(w => !appData.seenWords.includes(w.word.toLowerCase())).length;
  document.getElementById('statTotalWords').innerText = appData.words.length;
  document.getElementById('statUnseenWords').innerText = unseenCount;
  document.getElementById('statSavedWords').innerText = appData.savedWords.length;
  document.getElementById('savedCountBtn').innerText = appData.savedWords.length;
  document.getElementById('statTestsTaken').innerText = appData.testHistory.length;

  const btnSaved = document.getElementById('btnStartSavedQuiz');
  btnSaved.disabled = (appData.savedWords.length < 4);

  const tbody = document.getElementById('historyTableBody');
  if (appData.testHistory.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-xs text-slate-400">No quizzes completed yet. Launch your first mock test above!</td></tr>';
  } else {
    tbody.innerHTML = appData.testHistory.slice(-5).reverse().map(h => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-750">
        <td class="px-4 py-3 text-slate-600 dark:text-slate-300 font-medium">${h.date}</td>
        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold ${h.type === 'Saved Words' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}">${h.type}</span></td>
        <td class="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">${h.score}/${h.total}</td>
        <td class="px-4 py-3 font-semibold text-emerald-600">${h.accuracy}%</td>
        <td class="px-4 py-3 text-rose-500 font-medium">${h.mistakes}</td>
      </tr>
    `).join('');
  }
}

window.setQuizSize = function(size) {
  selectedQuizSize = size;
  document.querySelectorAll('.quiz-size-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.includes(size + ' '));
  });
};

// Excel File Upload
window.handleExcelUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

      if (rawRows.length === 0) {
        alert("The uploaded Excel sheet contains no rows.");
        return;
      }

      const sample = rawRows[0];
      const wordKey = Object.keys(sample).find(k => /word/i.test(k)) || Object.keys(sample)[0];
      const meaningKey = Object.keys(sample).find(k => /meaning|definition/i.test(k)) || Object.keys(sample)[1];
      const sentenceKey = Object.keys(sample).find(k => /sentence|example/i.test(k)) || Object.keys(sample)[2];

      const parsedWords = [];
      rawRows.forEach(r => {
        const w = (r[wordKey] || "").toString().trim();
        const m = (r[meaningKey] || "").toString().trim();
        const s = sentenceKey ? (r[sentenceKey] || "").toString().trim() : "";
        if (w && m) {
          parsedWords.push({ word: w, meaning: m, sentence: s });
        }
      });

      if (parsedWords.length < 4) {
        alert("Please upload an Excel sheet with at least 4 word rows to create multiple choice questions.");
        return;
      }

      appData.words = parsedWords;
      persistData();
      renderDashboard();
      alert(`Successfully loaded ${parsedWords.length} vocabulary words!`);
    } catch (err) {
      alert("Error parsing Excel file. Please ensure it is a valid .xlsx or .csv file.");
    }
  };
  reader.readAsArrayBuffer(file);
};

window.resetWordProgress = function() {
  if (confirm("Reset seen word progress? All words will be marked as unseen for upcoming quizzes.")) {
    appData.seenWords = [];
    persistData();
    renderDashboard();
  }
};

window.clearEntireBank = function() {
  if (confirm("Are you sure you want to clear your entire uploaded word bank and history?")) {
    appData = { words: [], seenWords: [], savedWords: [], testHistory: [], theme: appData.theme };
    persistData();
    renderDashboard();
  }
};

// Quiz Engine
window.startQuiz = function(mode) {
  let sourcePool = [];

  if (mode === 'fresh') {
    if (appData.words.length < 4) {
      alert("Please upload an Excel file with words before starting a test.");
      return;
    }
    sourcePool = appData.words.filter(w => !appData.seenWords.includes(w.word.toLowerCase()));
    if (sourcePool.length === 0) {
      alert("You have seen every word in your pool! Resetting unseen status so you can cycle through again.");
      appData.seenWords = [];
      sourcePool = [...appData.words];
    }
  } else {
    if (appData.savedWords.length < 4) {
      alert("You need at least 4 saved words to generate a quiz.");
      return;
    }
    sourcePool = [...appData.savedWords];
  }

  // Shuffle source pool
  sourcePool = sourcePool.sort(() => 0.5 - Math.random());
  const quizLength = Math.min(selectedQuizSize, sourcePool.length);
  const targetWords = sourcePool.slice(0, quizLength);

  const fullWordUniverse = appData.words.length >= 4 ? appData.words : appData.savedWords;

  currentQuiz.questions = targetWords.map((item, idx) => {
    const isWordToMeaning = Math.random() > 0.5;
    const distractors = fullWordUniverse
      .filter(w => w.word.toLowerCase() !== item.word.toLowerCase())
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    const options = [
      { text: isWordToMeaning ? item.meaning : item.word, isCorrect: true, wordObj: item },
      ...distractors.map(d => ({ text: isWordToMeaning ? d.meaning : d.word, isCorrect: false, wordObj: d }))
    ].sort(() => 0.5 - Math.random());

    return {
      index: idx,
      type: isWordToMeaning ? 'word-to-meaning' : 'meaning-to-word',
      target: item,
      options: options
    };
  });

  currentQuiz.userAnswers = {};
  currentQuiz.currentIndex = 0;
  currentQuiz.secondsElapsed = 0;
  currentQuiz.quizType = mode === 'fresh' ? 'Standard Exam' : 'Saved Words';

  clearInterval(currentQuiz.timerInterval);
  currentQuiz.timerInterval = setInterval(() => {
    currentQuiz.secondsElapsed++;
    const mins = String(Math.floor(currentQuiz.secondsElapsed / 60)).padStart(2, '0');
    const secs = String(currentQuiz.secondsElapsed % 60).padStart(2, '0');
    document.getElementById('quizTimer').innerText = `${mins}:${secs}`;
  }, 1000);

  showView('quiz');
  renderPalette();
  renderQuestion(0);
};

function renderPalette() {
  const container = document.getElementById('paletteContainer');
  container.innerHTML = currentQuiz.questions.map((q, idx) => {
    const isAnswered = currentQuiz.userAnswers[idx] !== undefined;
    const isActive = currentQuiz.currentIndex === idx;
    return `
      <button onclick="navigateQuestionDirect(${idx})" class="palette-btn ${isAnswered ? 'answered' : 'unanswered'} ${isActive ? 'active' : ''}">
        ${idx + 1}
      </button>
    `;
  }).join('');
}

function renderQuestion(idx) {
  currentQuiz.currentIndex = idx;
  const q = currentQuiz.questions[idx];

  document.getElementById('questionCounterBadge').innerText = `Question ${idx + 1} of ${currentQuiz.questions.length}`;
  document.getElementById('questionTypeBadge').innerText = q.type === 'word-to-meaning' ? 'Word → Pick Meaning' : 'Meaning → Pick Word';

  const promptEl = document.getElementById('questionPrompt');
  const hintEl = document.getElementById('sentenceHintBox');

  if (q.type === 'word-to-meaning') {
    promptEl.innerHTML = `<span class="text-xs uppercase text-slate-400 block mb-1">Select the correct definition for:</span>"${q.target.word}"`;
    if (q.target.sentence) {
      hintEl.innerHTML = `<strong>Context Hint:</strong> "${q.target.sentence}"`;
      hintEl.classList.remove('hidden');
    } else {
      hintEl.classList.add('hidden');
    }
  } else {
    promptEl.innerHTML = `<span class="text-xs uppercase text-slate-400 block mb-1">Select the word matching this definition:</span>"${q.target.meaning}"`;
    if (q.target.sentence) {
      const maskedSentence = q.target.sentence.replace(new RegExp(q.target.word, 'gi'), '______');
      hintEl.innerHTML = `<strong>Context Hint:</strong> "${maskedSentence}"`;
      hintEl.classList.remove('hidden');
    } else {
      hintEl.classList.add('hidden');
    }
  }

  const optContainer = document.getElementById('optionsContainer');
  const selectedOpt = currentQuiz.userAnswers[idx];

  optContainer.innerHTML = q.options.map((opt, oIdx) => {
    const isSel = selectedOpt === oIdx;
    return `
      <div onclick="selectOption(${idx}, ${oIdx})" class="option-card ${isSel ? 'selected' : ''}">
        <div class="w-6 h-6 rounded-full border flex items-center justify-center mr-3 text-xs font-bold ${isSel ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-500'}">
          ${String.fromCharCode(65 + oIdx)}
        </div>
        <div class="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">${opt.text}</div>
      </div>
    `;
  }).join('');

  document.getElementById('btnPrev').disabled = (idx === 0);
  document.getElementById('btnNext').innerText = (idx === currentQuiz.questions.length - 1) ? 'Review & Submit' : 'Save & Next';

  renderPalette();
}

window.selectOption = function(qIdx, optIdx) {
  currentQuiz.userAnswers[qIdx] = optIdx;
  renderQuestion(qIdx);
};

window.clearCurrentSelection = function() {
  delete currentQuiz.userAnswers[currentQuiz.currentIndex];
  renderQuestion(currentQuiz.currentIndex);
};

window.navigateQuestion = function(delta) {
  const nextIdx = currentQuiz.currentIndex + delta;
  if (nextIdx >= 0 && nextIdx < currentQuiz.questions.length) {
    renderQuestion(nextIdx);
  } else if (nextIdx >= currentQuiz.questions.length) {
    confirmSubmitQuiz();
  }
};

window.navigateQuestionDirect = function(idx) {
  renderQuestion(idx);
};

window.confirmSubmitQuiz = function() {
  const answeredCount = Object.keys(currentQuiz.userAnswers).length;
  const total = currentQuiz.questions.length;
  if (confirm(`You have answered ${answeredCount} of ${total} questions. Are you sure you want to finish and submit?`)) {
    finishQuiz();
  }
};

// Evaluate & Summary
function finishQuiz() {
  clearInterval(currentQuiz.timerInterval);

  let correctCount = 0;
  let mistakeCount = 0;

  currentQuiz.questions.forEach((q, idx) => {
    const userChoiceIdx = currentQuiz.userAnswers[idx];
    const isCorrect = userChoiceIdx !== undefined && q.options[userChoiceIdx].isCorrect;

    if (isCorrect) {
      correctCount++;
    } else {
      mistakeCount++;
      const exists = appData.savedWords.some(s => s.word.toLowerCase() === q.target.word.toLowerCase());
      if (!exists) {
        appData.savedWords.push(q.target);
      }
    }

    if (!appData.seenWords.includes(q.target.word.toLowerCase())) {
      appData.seenWords.push(q.target.word.toLowerCase());
    }
  });

  const accuracy = Math.round((correctCount / currentQuiz.questions.length) * 100);
  const now = new Date();
  const dateStr = `${now.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  appData.testHistory.push({
    date: dateStr,
    type: currentQuiz.quizType,
    score: correctCount,
    total: currentQuiz.questions.length,
    accuracy: accuracy,
    mistakes: mistakeCount
  });

  persistData();

  // Render Summary
  document.getElementById('summaryScore').innerText = `${correctCount}/${currentQuiz.questions.length}`;
  document.getElementById('summaryAccuracy').innerText = `${accuracy}%`;
  const mins = String(Math.floor(currentQuiz.secondsElapsed / 60)).padStart(2, '0');
  const secs = String(currentQuiz.secondsElapsed % 60).padStart(2, '0');
  document.getElementById('summaryTime').innerText = `${mins}:${secs}`;

  const container = document.getElementById('summaryCardsContainer');
  container.innerHTML = currentQuiz.questions.map((q, idx) => {
    const userChoiceIdx = currentQuiz.userAnswers[idx];
    const isAnswered = userChoiceIdx !== undefined;
    const isCorrect = isAnswered && q.options[userChoiceIdx].isCorrect;
    const correctOpt = q.options.find(o => o.isCorrect);
    const isSaved = appData.savedWords.some(s => s.word.toLowerCase() === q.target.word.toLowerCase());

    return `
      <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border ${isCorrect ? 'border-emerald-200 dark:border-emerald-900' : 'border-rose-200 dark:border-rose-900'} shadow-sm">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <div class="flex items-center space-x-2">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
              ${idx + 1}
            </span>
            <span class="text-xs font-bold uppercase ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}">
              ${isCorrect ? 'Correct' : isAnswered ? 'Incorrect' : 'Unanswered'}
            </span>
          </div>

          <button onclick="toggleSaveWord('${encodeURIComponent(q.target.word)}', this)" class="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${isSaved ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300' : 'border-slate-300 dark:border-slate-600 text-slate-500'}">
            <i class="fa-solid fa-bookmark mr-1.5 ${isSaved ? 'text-amber-500' : ''}"></i>
            <span>${isSaved ? 'Saved' : 'Save for Review'}</span>
          </button>
        </div>

        <div class="mt-3">
          <div class="text-base font-bold text-slate-900 dark:text-white">
            ${q.target.word} <span class="text-xs font-normal text-slate-400">(${q.type === 'word-to-meaning' ? 'Word to Definition' : 'Definition to Word'})</span>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <strong>Meaning:</strong> ${q.target.meaning}
          </div>
          ${q.target.sentence ? `<div class="text-xs text-slate-500 dark:text-slate-400 italic mt-0.5"><strong>Example:</strong> "${q.target.sentence}"</div>` : ''}
        </div>

        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div class="p-2.5 rounded-lg ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'}">
            <span class="font-bold">Your Response:</span> ${isAnswered ? q.options[userChoiceIdx].text : '<em>Skipped</em>'}
          </div>
          <div class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
            <span class="font-bold">Correct Answer:</span> ${correctOpt.text}
          </div>
        </div>
      </div>
    `;
  }).join('');

  showView('summary');
}

window.toggleSaveWord = function(encodedWord, btn) {
  const wordStr = decodeURIComponent(encodedWord).toLowerCase();
  const existingIdx = appData.savedWords.findIndex(w => w.word.toLowerCase() === wordStr);

  if (existingIdx >= 0) {
    appData.savedWords.splice(existingIdx, 1);
    btn.className = "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 transition";
    btn.innerHTML = `<i class="fa-solid fa-bookmark mr-1.5"></i><span>Save for Review</span>`;
  } else {
    const match = appData.words.find(w => w.word.toLowerCase() === wordStr);
    if (match) {
      appData.savedWords.push(match);
      btn.className = "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300 transition";
      btn.innerHTML = `<i class="fa-solid fa-bookmark mr-1.5 text-amber-500"></i><span>Saved</span>`;
    }
  }
  persistData();
  renderDashboard();
};

// Export Saved.xlsx
window.downloadSavedExcel = function() {
  if (appData.savedWords.length === 0) {
    alert("You have no saved words to export yet. Take a quiz and bookmark or miss words to populate this list.");
    return;
  }

  const exportData = appData.savedWords.map(w => ({
    "Word": w.word,
    "Meaning": w.meaning,
    "Sentence": w.sentence || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Saved Words");
  XLSX.writeFile(workbook, "Saved_Words.xlsx");
};

// Initialize Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  loadData();
});