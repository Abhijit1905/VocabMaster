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

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase init skipped or offline:", e);
}

/* ==========================================================================
   STORAGE & DATA STRUCTURES
   ========================================================================== */
const STORAGE_KEY_BANK = 'vocabmaster_word_bank';
const STORAGE_KEY_SEEN = 'vocabmaster_seen_word_ids';
const STORAGE_KEY_SAVED = 'vocabmaster_saved_words';
const STORAGE_KEY_HISTORY = 'vocabmaster_quiz_history';
const STORAGE_KEY_THEME = 'vocabmaster_theme';

let wordBank = [];            
let seenWordIds = new Set();  
let savedWords = [];          
let quizHistory = [];         

let activeQuiz = {
  mode: 'fresh',              
  questions: [],              
  currentIndex: 0,
  startTime: null,
  timerInterval: null,
  elapsedSeconds: 0
};

let selectedQuizCount = 10;
let pendingUploadData = null;
let summaryCurrentFilter = 'all';

/* ==========================================================================
   FIREBASE AUTO-SYNC LOGIC
   ========================================================================== */
function updateSyncUI(status) {
  const badge = document.getElementById('firebase-sync-badge');
  const dot = document.getElementById('firebase-sync-dot');
  const text = document.getElementById('firebase-sync-text');
  
  if(!badge) return;
  
  badge.classList.remove('hidden');
  badge.classList.add('flex');

  if (status === 'syncing') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
    text.innerText = 'Syncing...';
  } else if (status === 'synced') {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    text.innerText = 'Cloud Synced';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    text.innerText = 'Offline';
  }
}

async function persistData() {
  // 1. Save Locally
  try { localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(wordBank)); } catch(e){}
  try { localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(Array.from(seenWordIds))); } catch(e){}
  try { localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(savedWords)); } catch(e){}
  try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(quizHistory)); } catch(e){}

  // 2. Sync to Firebase
  if (db) {
    try {
      updateSyncUI('syncing');
      await setDoc(doc(db, "users", "global_profile"), {
        wordBank: wordBank,
        seenWordIds: Array.from(seenWordIds),
        savedWords: savedWords,
        quizHistory: quizHistory
      });
      updateSyncUI('synced');
    } catch (err) {
      console.error("Firestore sync error:", err);
      updateSyncUI('error');
    }
  }
}

/* ==========================================================================
   THEME CONTROLLER (Dark / Light Mode)
   ========================================================================== */
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
  const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(isDark);
}

window.toggleDarkMode = function() {
  const isCurrentlyDark = document.documentElement.classList.contains('dark');
  applyTheme(!isCurrentlyDark);
  localStorage.setItem(STORAGE_KEY_THEME, !isCurrentlyDark ? 'dark' : 'light');
};

function applyTheme(dark) {
  const icon = document.getElementById('theme-icon');
  if (dark) {
    document.documentElement.classList.add('dark');
    if (icon) icon.className = 'fa-solid fa-sun text-amber-400';
  } else {
    document.documentElement.classList.remove('dark');
    if (icon) icon.className = 'fa-solid fa-moon text-slate-300';
  }
}

/* ==========================================================================
   SAMPLE WORDS (EMPTY: BANK STARTS AT 0)
   ========================================================================== */
const DEFAULT_SAMPLE_WORDS = [];

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();

  // Load local data first for speed
  try {
    const storedBank = localStorage.getItem(STORAGE_KEY_BANK);
    if (storedBank) wordBank = JSON.parse(storedBank);
    else wordBank = [];

    const storedSeen = localStorage.getItem(STORAGE_KEY_SEEN);
    if (storedSeen) seenWordIds = new Set(JSON.parse(storedSeen));

    const storedSaved = localStorage.getItem(STORAGE_KEY_SAVED);
    if (storedSaved) savedWords = JSON.parse(storedSaved);

    const storedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (storedHistory) quizHistory = JSON.parse(storedHistory);
  } catch (e) {
    wordBank = [];
  }

  updateDashboardUI();

  // Pull from Firebase and refresh
  if (db) {
    try {
      updateSyncUI('syncing');
      const snap = await getDoc(doc(db, "users", "global_profile"));
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData.wordBank && Array.isArray(cloudData.wordBank)) {
          wordBank = cloudData.wordBank;
          seenWordIds = new Set(cloudData.seenWordIds || []);
          savedWords = cloudData.savedWords || [];
          quizHistory = cloudData.quizHistory || [];
          
          // Cache locally
          localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(wordBank));
          localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(Array.from(seenWordIds)));
          localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(savedWords));
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(quizHistory));
        }
      }
      updateSyncUI('synced');
      updateDashboardUI();
    } catch (err) {
      console.warn("Firestore read failed, fallback to local:", err);
      updateSyncUI('error');
    }
  }
});

/* ==========================================================================
   BACKUP & RESTORE / CROSS-BROWSER SYNC (JSON Engine)
   ========================================================================== */
window.openSyncModal = function() {
  document.getElementById('modal-sync').classList.remove('hidden');
};

window.closeSyncModal = function() {
  document.getElementById('modal-sync').classList.add('hidden');
};

window.downloadJsonBackup = function() {
  const backupObject = {
    app: 'VocabMaster',
    version: '2.0',
    timestamp: new Date().toISOString(),
    wordBank: wordBank,
    seenWordIds: Array.from(seenWordIds),
    savedWords: savedWords,
    quizHistory: quizHistory
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObject, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `VocabMaster_Backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast("Progress backup (.json) downloaded!", "success");
};

window.handleRestoreJson = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.wordBank || !Array.isArray(parsed.wordBank)) {
        showToast("Invalid backup file format", "error");
        return;
      }

      wordBank = parsed.wordBank;
      seenWordIds = new Set(parsed.seenWordIds || []);
      savedWords = parsed.savedWords || [];
      quizHistory = parsed.quizHistory || [];

      persistData();

      closeSyncModal();
      updateDashboardUI();
      showToast(`Restored ${wordBank.length} words and all test history!`, "success");
    } catch (err) {
      showToast("Failed to parse JSON backup file.", "error");
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

/* ==========================================================================
   UI NAVIGATION
   ========================================================================== */
window.navigateTo = function(viewName) {
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-quiz').classList.add('hidden');
  document.getElementById('view-summary').classList.add('hidden');
  document.getElementById('view-saved-vault').classList.add('hidden');

  if (viewName === 'dashboard') {
    document.getElementById('view-dashboard').classList.remove('hidden');
    updateDashboardUI();
  } else if (viewName === 'quiz') {
    document.getElementById('view-quiz').classList.remove('hidden');
  } else if (viewName === 'summary') {
    document.getElementById('view-summary').classList.remove('hidden');
  } else if (viewName === 'saved-vault') {
    document.getElementById('view-saved-vault').classList.remove('hidden');
    renderSavedVault();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function updateDashboardUI() {
  const total = wordBank.length;
  const seen = seenWordIds.size;
  const unseen = Math.max(0, total - seen);
  const saved = savedWords.length;

  document.getElementById('stat-total-words').textContent = total;
  document.getElementById('stat-unseen-words').textContent = unseen;
  document.getElementById('stat-seen-words').textContent = seen;
  document.getElementById('stat-saved-words').textContent = saved;
  document.getElementById('nav-saved-count').textContent = saved;

  const totalQuizzes = quizHistory.length;
  document.getElementById('stat-quizzes-taken').textContent = totalQuizzes;

  let avgAcc = 0;
  if (totalQuizzes > 0) {
    const sumAcc = quizHistory.reduce((acc, q) => acc + (q.accuracy || 0), 0);
    avgAcc = Math.round(sumAcc / totalQuizzes);
  }
  document.getElementById('stat-avg-accuracy').textContent = avgAcc + '%';

  // Coverage Bar
  const coveragePct = total > 0 ? Math.min(100, Math.round((seen / total) * 100)) : 0;
  document.getElementById('bank-progress-percent').textContent = coveragePct + '%';
  document.getElementById('bank-progress-bar').style.width = coveragePct + '%';

  if (unseen === 0 && total > 0) {
    document.getElementById('bank-progress-hint').innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-bold">Awesome! You have cycled through all ${total} words.</span> Click "Reset Seen Pool" below to test them again without losing your saved bank.`;
  } else {
    document.getElementById('bank-progress-hint').textContent = `${unseen} words left unseen. Once all words are tested, you can cycle again.`;
  }

  // Quiz from Saved button state
  const btnQuizSaved = document.getElementById('btn-quiz-saved');
  if (saved < 4) {
    btnQuizSaved.classList.add('opacity-50', 'cursor-not-allowed');
    btnQuizSaved.title = "Save at least 4 words to practice saved words";
  } else {
    btnQuizSaved.classList.remove('opacity-50', 'cursor-not-allowed');
    btnQuizSaved.title = "Practice from your saved words";
  }

  renderHistoryCards();
}

function renderHistoryCards() {
  const container = document.getElementById('history-container');
  if (quizHistory.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400 dark:text-slate-500">
        <i class="fa-solid fa-list-check text-3xl mb-2 opacity-50"></i>
        <p class="text-xs">No mock quizzes attempted yet. Click "Start Fresh Mock Quiz" to begin!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = quizHistory.map((item, index) => {
    const isGood = item.accuracy >= 70;
    const colorClass = isGood ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40';
    const badgeColor = isGood ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200';

    return `
      <div class="flex items-center justify-between p-3.5 rounded-xl border ${colorClass} hover:shadow-sm transition-all">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${badgeColor}">
            ${item.accuracy}%
          </div>
          <div>
            <div class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>${item.type === 'saved' ? 'Saved Words Drill' : 'Daily Mock Exam'}</span>
              <span class="text-[10px] text-slate-400 dark:text-slate-500 font-normal">${item.date}</span>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              Score: <b class="text-slate-800 dark:text-slate-200">${item.score}/${item.total}</b> &bull; Time: <b>${formatDuration(item.timeSec)}</b>
            </div>
          </div>
        </div>
        <div class="text-xs font-semibold ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}">
          ${isGood ? '<i class="fa-solid fa-circle-check"></i> Passed' : '<i class="fa-solid fa-circle-exclamation text-amber-500"></i> Review'}
        </div>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   MODALS & CONFIGURATION
   ========================================================================== */
let currentConfigMode = 'fresh';

window.openConfigModal = function(mode) {
  currentConfigMode = mode;
  const modal = document.getElementById('modal-quiz-config');
  const title = document.getElementById('config-modal-title');
  const poolDisplay = document.getElementById('config-available-pool');

  if (mode === 'saved') {
    if (savedWords.length < 4) {
      showToast("Please save at least 4 words first to quiz on saved words.", "warning");
      return;
    }
    title.innerHTML = '<i class="fa-solid fa-star text-amber-400"></i> Configure Saved Words Quiz';
    poolDisplay.textContent = `${savedWords.length} saved words`;
  } else {
    const unseenCount = Math.max(0, wordBank.length - seenWordIds.size);
    if (unseenCount === 0 && wordBank.length > 0) {
      showToast("All words have been completed! Resetting unseen pool for a fresh cycle.", "info");
      window.resetSeenWords(false);
    }
    title.innerHTML = '<i class="fa-solid fa-play text-indigo-600 dark:text-indigo-400"></i> Configure Daily Mock Quiz';
    poolDisplay.textContent = `${Math.max(0, wordBank.length - seenWordIds.size)} unseen words remaining`;
  }

  window.selectQuizSize(10);
  modal.classList.remove('hidden');
};

window.closeConfigModal = function() {
  document.getElementById('modal-quiz-config').classList.add('hidden');
};

window.selectQuizSize = function(size) {
  selectedQuizCount = size;
  document.querySelectorAll('.quiz-size-btn').forEach(btn => {
    if (parseInt(btn.dataset.size) === size) {
      btn.className = "quiz-size-btn py-2 text-xs font-bold border rounded-lg border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-center";
    } else {
      btn.className = "quiz-size-btn py-2 text-xs font-bold border rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-center";
    }
  });
};

/* ==========================================================================
   QUIZ ENGINE
   ========================================================================== */
window.startConfiguredQuiz = function() {
  window.closeConfigModal();

  let targetPool = [];
  let fullDistractorPool = [...wordBank];

  if (currentConfigMode === 'saved') {
    targetPool = [...savedWords];
  } else {
    targetPool = wordBank.filter(w => !seenWordIds.has(w.id));
    if (targetPool.length === 0) {
      seenWordIds.clear();
      persistData();
      targetPool = [...wordBank];
      showToast("Restarting cycle: all words are now fresh again!", "info");
    }
  }

  if (targetPool.length === 0) {
    showToast("No words available in the selected bank.", "error");
    return;
  }

  shuffleArray(targetPool);
  const count = Math.min(selectedQuizCount, targetPool.length);
  const selectedWords = targetPool.slice(0, count);

  if (selectedWords.length < 1) {
    showToast("Unable to start quiz: insufficient words.", "error");
    return;
  }

  const questions = selectedWords.map((item) => {
    const isMeaningPrompt = Math.random() < 0.5;
    const qType = isMeaningPrompt ? 'meaning_to_word' : 'word_to_meaning';

    let prompt = isMeaningPrompt ? item.meaning : item.word;
    let correctAns = isMeaningPrompt ? item.word : item.meaning;

    let candidateDistractors = fullDistractorPool.filter(w => w.word !== item.word);
    shuffleArray(candidateDistractors);
    let pickedDistractors = candidateDistractors.slice(0, 3).map(w => isMeaningPrompt ? w.word : w.meaning);

    while (pickedDistractors.length < 3) {
      pickedDistractors.push("None of the above option " + (pickedDistractors.length + 1));
    }

    let options = [correctAns, ...pickedDistractors];
    shuffleArray(options);

    const isAlreadySaved = savedWords.some(sw => sw.id === item.id || sw.word.toLowerCase() === item.word.toLowerCase());

    return {
      id: item.id,
      word: item.word,
      meaning: item.meaning,
      sentence: item.sentence || '',
      type: qType,
      prompt: prompt,
      correctAns: correctAns,
      options: options,
      userAns: null,
      isSaved: isAlreadySaved
    };
  });

  activeQuiz = {
    mode: currentConfigMode,
    questions: questions,
    currentIndex: 0,
    startTime: Date.now(),
    timerInterval: null,
    elapsedSeconds: 0
  };

  setupQuizUI();
  window.navigateTo('quiz');
  startQuizTimer();
};

function setupQuizUI() {
  document.getElementById('quiz-badge-type').textContent = activeQuiz.mode === 'saved' ? 'Saved Bank Mock Drill' : 'Daily Vocab Mock Exam';
  document.getElementById('quiz-total-num').textContent = activeQuiz.questions.length;
  renderQuizQuestion();
  renderPalette();
}

function renderQuizQuestion() {
  const q = activeQuiz.questions[activeQuiz.currentIndex];
  const curNum = activeQuiz.currentIndex + 1;

  document.getElementById('quiz-current-num').textContent = curNum;

  const modePill = document.getElementById('quiz-mode-pill');
  const promptLabel = document.getElementById('quiz-prompt-label');
  const promptText = document.getElementById('quiz-prompt-text');
  const sentenceBox = document.getElementById('quiz-prompt-sentence-box');
  const sentenceText = document.getElementById('quiz-prompt-sentence');

  if (q.type === 'meaning_to_word') {
    modePill.textContent = 'Question Type: Meaning → Identify Target Word';
    promptLabel.textContent = 'Select the word that corresponds to:';
    promptText.textContent = `"${q.prompt}"`;
    if (q.sentence) {
      sentenceBox.classList.remove('hidden');
      const maskedSentence = maskWordInSentence(q.sentence, q.word);
      sentenceText.textContent = maskedSentence;
    } else {
      sentenceBox.classList.add('hidden');
    }
  } else {
    modePill.textContent = 'Question Type: Word → Identify Definition';
    promptLabel.textContent = 'Select the primary meaning of:';
    promptText.textContent = q.prompt;
    sentenceBox.classList.add('hidden');
  }

  // Bookmark button state
  const btnBookmark = document.getElementById('btn-quiz-bookmark');
  if (q.isSaved) {
    btnBookmark.innerHTML = '<i class="fa-solid fa-bookmark text-amber-500"></i> <span class="text-amber-600 dark:text-amber-400">Saved</span>';
    btnBookmark.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 transition-all flex items-center gap-1.5';
  } else {
    btnBookmark.innerHTML = '<i class="fa-regular fa-bookmark"></i> <span>Save Question</span>';
    btnBookmark.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-amber-500 hover:border-amber-400 transition-all flex items-center gap-1.5';
  }

  // Render Options with SAFE Index click (prevents unclickable quote syntax errors)
  const optionsContainer = document.getElementById('quiz-options-container');
  const optionLetters = ['A', 'B', 'C', 'D'];

  optionsContainer.innerHTML = q.options.map((opt, i) => {
    const isSelected = q.userAns === opt;
    const activeStyle = isSelected 
      ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-950 dark:text-white font-semibold ring-2 ring-indigo-500/30' 
      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200';

    const badgeStyle = isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';

    return `
      <div onclick="selectQuizAnswer(${i})" class="p-3.5 sm:p-4 rounded-xl border ${activeStyle} cursor-pointer transition-all flex items-start gap-3 select-none">
        <span class="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold ${badgeStyle}">
          ${optionLetters[i]}
        </span>
        <span class="text-sm leading-relaxed">${escapeHtml(opt)}</span>
      </div>
    `;
  }).join('');

  document.getElementById('btn-quiz-prev').disabled = activeQuiz.currentIndex === 0;
  document.getElementById('btn-quiz-prev').classList.toggle('opacity-50', activeQuiz.currentIndex === 0);

  const isLast = activeQuiz.currentIndex === activeQuiz.questions.length - 1;
  const btnNext = document.getElementById('btn-quiz-next');
  if (isLast) {
    btnNext.innerHTML = 'Review / Finish <i class="fa-solid fa-check"></i>';
  } else {
    btnNext.innerHTML = 'Next <i class="fa-solid fa-chevron-right"></i>';
  }

  updatePaletteCurrent();
}

window.selectQuizAnswer = function(optIndex) {
  const currentQ = activeQuiz.questions[activeQuiz.currentIndex];
  if (currentQ && currentQ.options[optIndex] !== undefined) {
    currentQ.userAns = currentQ.options[optIndex];
    renderQuizQuestion();
    renderPalette();
  }
};

window.clearCurrentSelection = function() {
  activeQuiz.questions[activeQuiz.currentIndex].userAns = null;
  renderQuizQuestion();
  renderPalette();
};

window.navigateQuizQuestion = function(direction) {
  const newIndex = activeQuiz.currentIndex + direction;
  if (newIndex >= 0 && newIndex < activeQuiz.questions.length) {
    activeQuiz.currentIndex = newIndex;
    renderQuizQuestion();
  } else if (newIndex >= activeQuiz.questions.length) {
    window.confirmSubmitQuiz();
  }
};

window.jumpToQuestion = function(index) {
  if (index >= 0 && index < activeQuiz.questions.length) {
    activeQuiz.currentIndex = index;
    renderQuizQuestion();
  }
};

window.toggleBookmarkCurrentQuestion = function() {
  const q = activeQuiz.questions[activeQuiz.currentIndex];
  q.isSaved = !q.isSaved;

  if (q.isSaved) {
    if (!savedWords.some(w => w.id === q.id || w.word.toLowerCase() === q.word.toLowerCase())) {
      savedWords.push({
        id: q.id,
        word: q.word,
        meaning: q.meaning,
        sentence: q.sentence,
        savedAt: new Date().toLocaleDateString()
      });
      persistData();
      showToast(`"${q.word}" added to Saved Vault`, "success");
    }
  } else {
    savedWords = savedWords.filter(w => !(w.id === q.id || w.word.toLowerCase() === q.word.toLowerCase()));
    persistData();
    showToast(`"${q.word}" removed from Saved Vault`, "info");
  }

  document.getElementById('nav-saved-count').textContent = savedWords.length;
  renderQuizQuestion();
  renderPalette();
};

function renderPalette() {
  const palette = document.getElementById('quiz-palette-grid');
  let attemptedCount = 0;

  palette.innerHTML = activeQuiz.questions.map((q, idx) => {
    const isCurrent = idx === activeQuiz.currentIndex;
    const isAnswered = q.userAns !== null;
    if (isAnswered) attemptedCount++;

    let bgClass = "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700";
    if (isAnswered) {
      bgClass = "bg-emerald-600 text-white font-bold";
    }
    if (q.isSaved) {
      bgClass = isAnswered ? "bg-emerald-600 text-white ring-2 ring-amber-400" : "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold";
    }
    if (isCurrent) {
      bgClass += " ring-2 ring-indigo-600 ring-offset-1 dark:ring-offset-slate-900";
    }

    return `
      <button onclick="jumpToQuestion(${idx})" class="w-8 h-8 rounded-lg text-xs flex items-center justify-center transition-all ${bgClass}">
        ${idx + 1}
      </button>
    `;
  }).join('');

  document.getElementById('palette-attempted-counter').textContent = `${attemptedCount} / ${activeQuiz.questions.length}`;
}

function updatePaletteCurrent() {
  renderPalette();
}

function startQuizTimer() {
  if (activeQuiz.timerInterval) clearInterval(activeQuiz.timerInterval);
  activeQuiz.elapsedSeconds = 0;
  const timerElement = document.getElementById('quiz-timer');

  activeQuiz.timerInterval = setInterval(() => {
    activeQuiz.elapsedSeconds++;
    const mins = Math.floor(activeQuiz.elapsedSeconds / 60);
    const secs = activeQuiz.elapsedSeconds % 60;
    timerElement.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopQuizTimer() {
  if (activeQuiz.timerInterval) {
    clearInterval(activeQuiz.timerInterval);
    activeQuiz.timerInterval = null;
  }
}

window.confirmSubmitQuiz = function() {
  const attempted = activeQuiz.questions.filter(q => q.userAns !== null).length;
  const total = activeQuiz.questions.length;
  document.getElementById('submit-confirm-summary-text').textContent = 
    `You have answered ${attempted} of ${total} questions. Ready to view your score breakdown?`;
  document.getElementById('modal-submit-confirm').classList.remove('hidden');
};

window.closeSubmitConfirmModal = function() {
  document.getElementById('modal-submit-confirm').classList.add('hidden');
};

window.finalizeQuizSubmission = function() {
  window.closeSubmitConfirmModal();
  stopQuizTimer();

  if (activeQuiz.mode === 'fresh') {
    activeQuiz.questions.forEach(q => {
      seenWordIds.add(q.id);
    });
  }

  let correct = 0;
  activeQuiz.questions.forEach(q => {
    if (q.userAns === q.correctAns) {
      correct++;
    }
  });

  const total = activeQuiz.questions.length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  const historyEntry = {
    id: 'quiz_' + Date.now(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    type: activeQuiz.mode,
    total: total,
    score: correct,
    accuracy: accuracy,
    timeSec: activeQuiz.elapsedSeconds
  };

  quizHistory.unshift(historyEntry);
  if (quizHistory.length > 30) quizHistory.pop();
  persistData();

  renderSummaryScreen(correct, total, accuracy);
  window.navigateTo('summary');
};

/* ==========================================================================
   SUMMARY & REVIEW SYSTEM
   ========================================================================== */
function renderSummaryScreen(correct, total, accuracy) {
  document.getElementById('summary-score-text').textContent = `${correct}/${total}`;
  document.getElementById('summary-marks-net').textContent = `+${correct}.0 Marks`;
  document.getElementById('summary-accuracy-text').textContent = `${accuracy}%`;
  document.getElementById('summary-correct-count').textContent = `${correct} Correct`;
  document.getElementById('summary-wrong-count').textContent = `${total - correct} Mistakes`;
  document.getElementById('summary-time-text').textContent = formatDuration(activeQuiz.elapsedSeconds);

  const avgPerQ = total > 0 ? Math.round(activeQuiz.elapsedSeconds / total) : 0;
  document.getElementById('summary-speed-text').textContent = `Speed: ~${avgPerQ}s / question`;
  document.getElementById('summary-meta-date').textContent = `Exam completed on: ${new Date().toLocaleString()}`;

  const wrongCount = activeQuiz.questions.filter(q => q.userAns !== q.correctAns).length;
  const savedCount = activeQuiz.questions.filter(q => q.isSaved).length;

  document.getElementById('count-filter-all').textContent = total;
  document.getElementById('count-filter-wrong').textContent = wrongCount;
  document.getElementById('count-filter-saved').textContent = savedCount;

  summaryCurrentFilter = 'all';
  renderSummaryQuestionsList();
}

window.filterSummaryReview = function(filter) {
  summaryCurrentFilter = filter;
  ['all', 'wrong', 'saved'].forEach(f => {
    const btn = document.getElementById(`filter-btn-${f}`);
    if (f === filter) {
      btn.className = "px-3 py-1 font-semibold rounded bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white";
    } else {
      btn.className = "px-3 py-1 font-semibold rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white";
    }
  });
  renderSummaryQuestionsList();
};

function renderSummaryQuestionsList() {
  const container = document.getElementById('summary-review-list');
  
  let list = activeQuiz.questions.filter(q => {
    if (summaryCurrentFilter === 'wrong') return q.userAns !== q.correctAns;
    if (summaryCurrentFilter === 'saved') return q.isSaved;
    return true;
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 dark:text-slate-500">
        <i class="fa-solid fa-check-circle text-3xl mb-2 text-emerald-400"></i>
        <p class="text-xs">No questions match this filter!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((q) => {
    const isCorrect = q.userAns === q.correctAns;
    const statusBorder = isCorrect 
      ? 'border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900' 
      : 'border-red-200 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/20';

    const statusBadge = isCorrect 
      ? '<span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-check"></i> Correct</span>'
      : '<span class="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-xmark"></i> Incorrect</span>';

    const saveBtnColor = q.isSaved 
      ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700' 
      : 'text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-300';

    return `
      <div class="p-5 rounded-xl border ${statusBorder} shadow-sm space-y-4 transition-all">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Q.${activeQuiz.questions.indexOf(q) + 1}</span>
            ${statusBadge}
            <span class="text-xs text-slate-400 dark:text-slate-500 font-medium">(${q.type === 'meaning_to_word' ? 'Meaning → Word' : 'Word → Meaning'})</span>
          </div>
          <button onclick="toggleSummarySave('${q.id}')" class="px-3 py-1 text-xs font-semibold rounded-lg border ${saveBtnColor} transition-all flex items-center gap-1.5 shadow-sm">
            <i class="fa-solid fa-star ${q.isSaved ? 'text-amber-500' : 'text-slate-400'}"></i>
            <span>${q.isSaved ? 'Saved to Vault' : 'Save for Review'}</span>
          </button>
        </div>

        <!-- Prompt & Details -->
        <div class="space-y-1">
          <div class="text-sm font-bold text-slate-800 dark:text-slate-100">
            <span class="text-indigo-600 dark:text-indigo-400">${q.type === 'meaning_to_word' ? 'Meaning: ' : 'Target Word: '}</span> 
            ${escapeHtml(q.prompt)}
          </div>
          ${q.sentence ? `<p class="text-xs italic text-slate-500 dark:text-slate-400"><b class="not-italic text-slate-600 dark:text-slate-300">Sentence Context:</b> "${escapeHtml(q.sentence)}"</p>` : ''}
        </div>

        <!-- Answers Comparison -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
          <div class="p-3 rounded-lg ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-800'}">
            <div class="font-bold text-[10px] uppercase tracking-wider mb-1 opacity-75">Your Answer</div>
            <div class="font-semibold">${q.userAns ? escapeHtml(q.userAns) : '<span class="italic text-slate-400">Not Attempted</span>'}</div>
          </div>

          <div class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
            <div class="font-bold text-[10px] uppercase tracking-wider mb-1 opacity-75">Correct Solution</div>
            <div class="font-bold">${escapeHtml(q.correctAns)}</div>
          </div>
        </div>

        <!-- Dictionary Entry Reveal -->
        <div class="text-[11px] bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span><b>Word:</b> ${escapeHtml(q.word)}</span>
          <span><b>Meaning:</b> ${escapeHtml(q.meaning)}</span>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleSummarySave = function(qid) {
  const q = activeQuiz.questions.find(item => item.id === qid);
  if (!q) return;

  q.isSaved = !q.isSaved;

  if (q.isSaved) {
    if (!savedWords.some(w => w.id === q.id || w.word.toLowerCase() === q.word.toLowerCase())) {
      savedWords.push({
        id: q.id,
        word: q.word,
        meaning: q.meaning,
        sentence: q.sentence,
        savedAt: new Date().toLocaleDateString()
      });
      persistData();
      showToast(`Saved "${q.word}" to Review Bank`, "success");
    }
  } else {
    savedWords = savedWords.filter(w => !(w.id === q.id || w.word.toLowerCase() === q.word.toLowerCase()));
    persistData();
    showToast(`Removed "${q.word}" from Review Bank`, "info");
  }

  document.getElementById('nav-saved-count').textContent = savedWords.length;
  document.getElementById('count-filter-saved').textContent = activeQuiz.questions.filter(item => item.isSaved).length;
  renderSummaryQuestionsList();
};

/* ==========================================================================
   SAVED WORDS VAULT
   ========================================================================= */
window.renderSavedVault = function() {
  const search = (document.getElementById('vault-search-input').value || '').toLowerCase().trim();
  const tbody = document.getElementById('saved-vault-tbody');

  let filtered = savedWords.filter(w => {
    return w.word.toLowerCase().includes(search) || 
           w.meaning.toLowerCase().includes(search) ||
           (w.sentence && w.sentence.toLowerCase().includes(search));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-8 text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-box-open text-2xl mb-1 opacity-50"></i>
          <p>No saved words in the vault matching your criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((w, index) => {
    return `
      <tr class="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors">
        <td class="py-3 px-4 font-mono text-slate-400 dark:text-slate-500">${index + 1}</td>
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">${escapeHtml(w.word)}</td>
        <td class="py-3 px-4 leading-relaxed">${escapeHtml(w.meaning)}</td>
        <td class="py-3 px-4 italic text-slate-500 dark:text-slate-400">${w.sentence ? escapeHtml(w.sentence) : '-'}</td>
        <td class="py-3 px-4 text-center">
          <button onclick="removeSavedWord('${w.id}')" title="Delete from saved" class="text-slate-400 hover:text-red-500 transition-colors p-1">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.removeSavedWord = function(id) {
  savedWords = savedWords.filter(w => w.id !== id);
  persistData();
  document.getElementById('nav-saved-count').textContent = savedWords.length;
  window.renderSavedVault();
  showToast("Word removed from saved bank", "info");
};

window.clearSavedVault = function() {
  if (savedWords.length === 0) return;
  if (window.confirm("Are you sure you want to clear all saved questions from your vault?")) {
    savedWords = [];
    persistData();
    document.getElementById('nav-saved-count').textContent = 0;
    window.renderSavedVault();
    showToast("Saved vault cleared", "info");
  }
};

/* ==========================================================================
   EXCEL PARSER & EXPORTER
   ========================================================================== */
window.openUploadModal = function() {
  document.getElementById('modal-upload').classList.remove('hidden');
  document.getElementById('upload-status').classList.add('hidden');
  document.getElementById('btn-confirm-upload').disabled = true;
  pendingUploadData = null;
};

window.closeUploadModal = function() {
  document.getElementById('modal-upload').classList.add('hidden');
};

function setupEventListeners() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('excel-file-input');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-indigo-600', 'bg-indigo-50/50', 'dark:bg-slate-800');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-indigo-600', 'bg-indigo-50/50', 'dark:bg-slate-800');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-indigo-600', 'bg-indigo-50/50', 'dark:bg-slate-800');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFile(e.target.files[0]);
    }
  });
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (!rows || rows.length === 0) {
        showToast("Uploaded sheet appears to be empty", "error");
        return;
      }

      const parsedWords = [];
      const keys = Object.keys(rows[0]);

      const wordKey = keys.find(k => /word|vocab|term/i.test(k)) || keys[0];
      const meaningKey = keys.find(k => /meaning|definition|def|means/i.test(k)) || keys[1];
      const sentenceKey = keys.find(k => /sentence|example|usage|context/i.test(k)) || keys[2];

      rows.forEach((r, idx) => {
        const w = String(r[wordKey] || '').trim();
        const m = String(r[meaningKey] || '').trim();
        const s = sentenceKey ? String(r[sentenceKey] || '').trim() : '';

        if (w && m) {
          parsedWords.push({
            id: 'wb_' + Date.now() + '_' + idx,
            word: w,
            meaning: m,
            sentence: s
          });
        }
      });

      if (parsedWords.length === 0) {
        showToast("Could not recognize Word and Meaning columns.", "error");
        return;
      }

      pendingUploadData = parsedWords;
      const statusBox = document.getElementById('upload-status');
      statusBox.classList.remove('hidden');
      statusBox.innerHTML = `
        <i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400"></i>
        Detected <b>${parsedWords.length}</b> vocabulary entries! <br>
        <span class="text-[11px] text-slate-500 dark:text-slate-400">Columns matched: [${wordKey}] &bull; [${meaningKey}]</span>
      `;
      document.getElementById('btn-confirm-upload').disabled = false;

    } catch (err) {
      showToast("Failed to parse Excel file. Check format.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

window.processUploadedFile = function() {
  if (!pendingUploadData || pendingUploadData.length === 0) return;

  // Build a map of existing words (case-insensitive) to preserve progress
  const existingMap = new Map();
  wordBank.forEach(w => {
    existingMap.set(w.word.toLowerCase().trim(), w);
  });

  let newWordsCount = 0;
  const mergedBank = [];

  pendingUploadData.forEach((row, idx) => {
    const key = row.word.toLowerCase().trim();
    if (existingMap.has(key)) {
      // Keep existing ID so seen status remains intact
      const existing = existingMap.get(key);
      mergedBank.push({
        id: existing.id,
        word: row.word,
        meaning: row.meaning,
        sentence: row.sentence
      });
    } else {
      // Truly a new word
      newWordsCount++;
      mergedBank.push({
        id: 'wb_' + Date.now() + '_' + idx,
        word: row.word,
        meaning: row.meaning,
        sentence: row.sentence
      });
    }
  });

  wordBank = mergedBank;
  persistData();

  window.closeUploadModal();
  updateDashboardUI();
  showToast(`Updated bank: ${newWordsCount} new words added, progress preserved!`, "success");
};

window.exportSavedToExcel = function() {
  if (savedWords.length === 0) {
    showToast("No saved words to download yet. Star some words first!", "warning");
    return;
  }

  try {
    const exportData = savedWords.map((item, index) => ({
      "S.No": index + 1,
      "Word": item.word,
      "Meaning": item.meaning,
      "Example Sentence": item.sentence || '',
      "Saved On": item.savedAt || new Date().toLocaleDateString()
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Saved_Words");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Saved_Vocab_${dateStr}.xlsx`);
    showToast("Saved words downloaded as Excel!", "success");
  } catch (err) {
    showToast("Failed to generate Excel file.", "error");
  }
};

/* ==========================================================================
   RESET & HELPERS
   ========================================================================== */
window.resetSeenWords = function(notify = true) {
  seenWordIds.clear();
  persistData();
  updateDashboardUI();
  if (notify) showToast("Seen tracking reset! All words are ready for new tests.", "success");
};

window.loadSampleData = function() {
  if (window.confirm("Reload high-yield exam words into your bank?")) {
    wordBank = [
      { id: 'w1', word: 'Aberration', meaning: 'A departure from what is normal, usual, or expected, typically unwelcome', sentence: 'The sudden cold snap in late spring was an aberration for the region.' },
      { id: 'w2', word: 'Alacrity', meaning: 'Brisk and cheerful readiness to do something', sentence: 'She accepted the challenge with surprising alacrity and confidence.' },
      { id: 'w3', word: 'Anachronistic', meaning: 'Belonging to a period other than that in which it exists', sentence: 'Using a typewriter in a modern office seems entirely anachronistic.' },
      { id: 'w4', word: 'Bellicose', meaning: 'Demonstrating aggression and willingness to fight', sentence: 'His bellicose attitude made diplomatic negotiations nearly impossible.' },
      { id: 'w5', word: 'Cacophony', meaning: 'A harsh, discordant mixture of sounds', sentence: 'A cacophony of car horns and construction noise echoed through the street.' }
    ];
    seenWordIds.clear();
    persistData();
    updateDashboardUI();
    showToast("Sample vocabulary loaded!", "success");
  }
};

window.clearHistory = function() {
  if (quizHistory.length === 0) return;
  if (window.confirm("Clear all previous mock test scorecards?")) {
    quizHistory = [];
    persistData();
    updateDashboardUI();
    showToast("Test history cleared", "info");
  }
};

window.purgeAllData = function() {
  const confirmed = window.confirm(
    "⚠️ DANGER: Are you sure you want to completely erase everything?\n\nThis will permanently delete:\n- All uploaded words in your bank\n- Seen/Unseen progress\n- Saved/Mistake words\n- All test history\n\nThis cannot be undone."
  );

  if (confirmed) {
    wordBank = [];
    seenWordIds.clear();
    savedWords = [];
    quizHistory = [];

    // Clear local cache completely
    localStorage.removeItem(STORAGE_KEY_BANK);
    localStorage.removeItem(STORAGE_KEY_SEEN);
    localStorage.removeItem(STORAGE_KEY_SAVED);
    localStorage.removeItem(STORAGE_KEY_HISTORY);

    // Sync the empty state to Firebase
    persistData();

    updateDashboardUI();
    showToast("Everything has been wiped clean to 0 words!", "info");
  }
};

function maskWordInSentence(sentence, word) {
  if (!sentence || !word) return sentence;
  try {
    const regex = new RegExp(`\b${word}\b`, 'gi');
    return sentence.replace(regex, '_______');
  } catch (e) {
    return sentence;
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatDuration(sec) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  let bg = 'bg-slate-900 text-white border border-slate-700';
  let icon = 'fa-circle-info text-sky-400';
  if (type === 'success') {
    bg = 'bg-emerald-900/90 text-emerald-100 border border-emerald-600';
    icon = 'fa-circle-check text-emerald-400';
  } else if (type === 'warning') {
    bg = 'bg-amber-900/90 text-amber-100 border border-amber-600';
    icon = 'fa-triangle-exclamation text-amber-400';
  } else if (type === 'error') {
    bg = 'bg-red-900/90 text-red-100 border border-red-600';
    icon = 'fa-circle-xmark text-red-400';
  }

  toast.className = `p-3.5 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md pointer-events-auto transition-all transform translate-y-2 opacity-0 ${bg}`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
