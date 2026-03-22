document.addEventListener('DOMContentLoaded', () => {
    // Firebase
    const db = firebase.firestore();

    // Nav elements
    const navHome = document.getElementById('nav-home');
    const navHistory = document.getElementById('nav-history');

    // View sections
    const viewHome = document.getElementById('view-home');
    const viewHistory = document.getElementById('view-history');
    const viewQuiz = document.getElementById('quiz-result-view');
    const mainContent = document.getElementById('main-content');

    // Core actions
    const btnPrintable = document.getElementById('btn-printable');
    const btnInteractive = document.getElementById('btn-interactive');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnBackNav = document.getElementById('btn-back-to-nav');
    const btnRetake = document.getElementById('btn-retake');
    const btnScoreHome = document.getElementById('btn-score-home');
    const inputUrl = document.getElementById('quiz-url');
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');

    const loadingDiv = document.getElementById('loading');
    const errorMsg = document.getElementById('error-msg');
    const quizTitleEl = document.getElementById('current-quiz-title');
    const modeBadge = document.getElementById('quiz-mode-badge');
    const quizContainer = document.getElementById('quiz-container');

    // PDF header fields
    const pdfHeaderFields = document.getElementById('pdf-header-fields');
    const pdfStudentName = document.getElementById('pdf-student-name');
    const pdfExamDate = document.getElementById('pdf-exam-date');

    // Score elements
    const scoreBanner = document.getElementById('score-banner');
    const scoreText = document.getElementById('score-text');
    const scoreSubtitle = document.getElementById('score-subtitle');

    // Progress elements
    const progressContainer = document.getElementById('progress-bar-container');
    const progressLabel = document.getElementById('progress-label');
    const progressPct = document.getElementById('progress-pct');
    const progressFill = document.getElementById('progress-fill');

    let currentMode = '';
    let quizData = [];
    let currentQuizId = null;
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    // Score tracking
    let userAnswers = [];
    let answeredCount = 0;
    let correctCount = 0;

    // ── Auto-Save Progress (localStorage) ──
    function getProgressKey() {
        return currentQuizId ? `zealquiz_progress_${currentQuizId}` : null;
    }

    function saveProgress() {
        const key = getProgressKey();
        if (!key || currentMode !== 'interactive') return;
        localStorage.setItem(key, JSON.stringify({
            userAnswers,
            answeredCount,
            correctCount,
            timestamp: Date.now()
        }));
    }

    function loadProgress() {
        const key = getProgressKey();
        if (!key) return null;
        try {
            const saved = JSON.parse(localStorage.getItem(key));
            if (saved && saved.userAnswers && saved.userAnswers.length === quizData.length) {
                return saved;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function clearProgress() {
        const key = getProgressKey();
        if (key) localStorage.removeItem(key);
    }

    function decodeHtmlEntity(html) {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    // ── Tab Switching ──
    function showTab(tab) {
        navHome.className = "font-bold text-sm tracking-tight text-emerald-800/60 hover:text-emerald-900 px-2 transition-all";
        navHistory.className = "font-bold text-sm tracking-tight text-emerald-800/60 hover:text-emerald-900 px-2 transition-all";

        [viewHome, viewHistory, viewQuiz].forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('opacity-100');
            v.classList.add('opacity-0');
        });

        mainContent.classList.remove('hidden');

        if (tab === 'home') {
            navHome.className = "font-bold text-sm tracking-tight text-emerald-600 border-b-2 border-emerald-600 pb-1 px-2 transition-all";
            viewHome.classList.remove('hidden');
            setTimeout(() => viewHome.classList.replace('opacity-0', 'opacity-100'), 50);
        } else if (tab === 'history') {
            navHistory.className = "font-bold text-sm tracking-tight text-emerald-600 border-b-2 border-emerald-600 pb-1 px-2 transition-all";
            viewHistory.classList.remove('hidden');
            setTimeout(() => viewHistory.classList.replace('opacity-0', 'opacity-100'), 50);
            loadHistory();
        }
    }

    // ── History Search ──
    let historyCards = []; // store references for filtering

    historySearch.addEventListener('input', () => {
        const query = historySearch.value.toLowerCase().trim();
        historyCards.forEach(({ card, title }) => {
            card.style.display = title.toLowerCase().includes(query) ? '' : 'none';
        });
    });

    // ── History (Firebase) ──
    async function loadHistory() {
        historyList.innerHTML = '<div class="col-span-full py-12 text-center text-emerald-600 font-bold flex items-center justify-center gap-2"><span class="animate-spin material-symbols-outlined">progress_activity</span> Loading...</div>';

        try {
            const quizSnap = await db.collection('quizzes')
                .orderBy('createdAt', 'desc')
                .limit(20)
                .get();

            historyList.innerHTML = '';
            historyCards = [];

            if (quizSnap.empty) {
                historyList.innerHTML = '<div class="col-span-full py-12 text-center text-emerald-800/40 font-bold">No past quizzes found. Paste a link to get started!</div>';
                return;
            }

            for (const doc of quizSnap.docs) {
                const quiz = doc.data();

                // Get best attempt
                let bestAttempt = null;
                let attemptCount = 0;
                try {
                    const attemptSnap = await db.collection('attempts')
                        .where('quizId', '==', doc.id)
                        .orderBy('completedAt', 'desc')
                        .get();
                    attemptCount = attemptSnap.size;
                    if (!attemptSnap.empty) {
                        // Find best score
                        let best = null;
                        attemptSnap.forEach(a => {
                            const d = a.data();
                            if (!best || d.score > best.score) best = d;
                        });
                        bestAttempt = best;
                    }
                } catch (e) {
                    // Index might not exist yet — still show the card
                }

                const card = document.createElement('div');
                card.className = 'history-card animate-in fade-in slide-in-from-bottom-4 duration-500';

                const dateStr = quiz.createdAt
                    ? quiz.createdAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';

                let scoreHtml = '';
                if (bestAttempt) {
                    const pct = Math.round((bestAttempt.score / bestAttempt.total) * 100);
                    scoreHtml = `
                        <div class="mt-3 flex items-center gap-3">
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-bold">
                                <span class="material-symbols-outlined text-sm">trophy</span>
                                ${bestAttempt.score}/${bestAttempt.total}
                            </span>
                            <span class="text-xs text-emerald-800/40 font-medium">${pct}% best &middot; ${attemptCount} attempt${attemptCount !== 1 ? 's' : ''}</span>
                        </div>`;
                } else {
                    scoreHtml = '<div class="mt-3 text-xs text-emerald-800/40 font-medium italic">Not attempted yet</div>';
                }

                const cardTitle = quiz.title || 'Untitled Quiz';
                card.innerHTML = `
                    <div class="mb-4">
                        <div class="flex justify-between items-start">
                            <span class="text-[10px] font-black uppercase tracking-widest text-emerald-600/60 block mb-1">${dateStr}</span>
                            <button class="btn-delete-h p-1 rounded-lg text-emerald-800/30 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete quiz">
                                <span class="material-symbols-outlined text-lg">delete</span>
                            </button>
                        </div>
                        <h4 class="text-lg font-extrabold text-emerald-950 leading-tight">${cardTitle}</h4>
                        <p class="text-xs text-emerald-800/40 font-medium mt-2 truncate">${quiz.url}</p>
                        ${scoreHtml}
                    </div>
                    <div class="flex gap-2">
                        <button class="btn-retake-h flex-grow h-10 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-sm">play_arrow</span> Quiz
                        </button>
                        <button class="btn-print-h flex-grow h-10 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs hover:bg-emerald-200 transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-sm">download</span> PDF
                        </button>
                    </div>
                `;

                card.querySelector('.btn-retake-h').onclick = () => loadQuizFromFirestore(doc.id, 'interactive');
                card.querySelector('.btn-print-h').onclick = () => loadQuizFromFirestore(doc.id, 'printable');
                card.querySelector('.btn-delete-h').onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm('Delete this quiz and all its attempts?')) return;
                    try {
                        // Delete attempts for this quiz
                        const attemptsSnap = await db.collection('attempts').where('quizId', '==', doc.id).get();
                        const batch = db.batch();
                        attemptsSnap.forEach(a => batch.delete(a.ref));
                        batch.delete(doc.ref);
                        await batch.commit();
                        card.remove();
                        historyCards = historyCards.filter(hc => hc.card !== card);
                    } catch (err) {
                        console.error('Failed to delete quiz:', err);
                        alert('Failed to delete. Please try again.');
                    }
                };

                historyCards.push({ card, title: cardTitle });
                historyList.appendChild(card);
            }
        } catch (err) {
            console.error('Failed to load history:', err);
            historyList.innerHTML = '<div class="col-span-full py-12 text-center text-red-500 font-bold">Failed to load history.</div>';
        }
    }

    // ── Load quiz from Firestore (for retake / history) ──
    async function loadQuizFromFirestore(quizId, mode) {
        try {
            const docSnap = await db.collection('quizzes').doc(quizId).get();
            if (!docSnap.exists) throw new Error('Quiz not found');

            const quiz = docSnap.data();
            currentQuizId = quizId;
            currentMode = mode;
            quizData = quiz.questions;
            quizTitleEl.textContent = quiz.title || 'Quiz';
            modeBadge.textContent = mode === 'printable' ? 'Printable' : 'Interactive';
            inputUrl.value = quiz.url;

            [viewHome, viewHistory].forEach(v => v.classList.add('hidden'));
            mainContent.classList.add('hidden');
            viewQuiz.classList.remove('hidden');

            renderQuiz();
            window.scrollTo(0, 0);
        } catch (err) {
            console.error('Failed to load quiz:', err);
            alert('Failed to load quiz. Please try again.');
        }
    }

    // ── Save quiz to Firestore ──
    async function saveQuizToFirestore(url, title, questions) {
        try {
            const snapshot = await db.collection('quizzes')
                .where('url', '==', url)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                currentQuizId = snapshot.docs[0].id;
                return;
            }

            const docRef = await db.collection('quizzes').add({
                url,
                title,
                questionCount: questions.length,
                questions,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            currentQuizId = docRef.id;
        } catch (err) {
            console.error('Failed to save quiz:', err);
        }
    }

    // ── Save attempt to Firestore ──
    async function saveAttempt() {
        if (!currentQuizId) return;
        try {
            await db.collection('attempts').add({
                quizId: currentQuizId,
                title: quizTitleEl.textContent,
                score: correctCount,
                total: quizData.length,
                answers: userAnswers.slice(),
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to save attempt:', err);
        }
    }

    // ── Fetch quiz from URL (via server proxy) ──
    async function fetchQuiz(mode) {
        const url = inputUrl.value.trim();
        if (!url) {
            errorMsg.textContent = "Please paste a valid zealstudy link.";
            errorMsg.classList.remove('hidden');
            return;
        }

        currentMode = mode;
        loadingDiv.classList.remove('hidden');
        errorMsg.classList.add('hidden');

        try {
            const res = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
            const data = await res.json();

            if (!res.ok || !data.success) throw new Error(data.error);

            quizData = data.quiz;
            quizTitleEl.textContent = data.title;
            modeBadge.textContent = mode === 'printable' ? 'Printable' : 'Interactive';

            // Save to Firebase
            await saveQuizToFirestore(url, data.title, data.quiz);

            // Show quiz view
            [viewHome, viewHistory].forEach(v => v.classList.add('hidden'));
            mainContent.classList.add('hidden');
            viewQuiz.classList.remove('hidden');

            renderQuiz();
            window.scrollTo(0, 0);
        } catch (err) {
            errorMsg.textContent = err.message || "Failed to parse this link. Please check the URL.";
            errorMsg.classList.remove('hidden');
        } finally {
            loadingDiv.classList.add('hidden');
        }
    }

    // ── Render Quiz ──
    function renderQuiz() {
        quizContainer.innerHTML = '';
        quizContainer.className = `mode-${currentMode}`;

        // Reset score state
        userAnswers = new Array(quizData.length).fill(-1);
        answeredCount = 0;
        correctCount = 0;

        // Hide score banner
        scoreBanner.classList.add('hidden');

        // Show/hide mode-specific controls
        if (currentMode === 'printable') {
            btnDownloadPdf.classList.remove('hidden');
            btnDownloadPdf.style.display = 'flex';
            progressContainer.classList.add('hidden');
            pdfHeaderFields.classList.remove('hidden');
        } else {
            btnDownloadPdf.classList.add('hidden');
            pdfHeaderFields.classList.add('hidden');
            progressContainer.classList.remove('hidden');
            updateProgress();
        }

        // Check for saved progress (interactive mode)
        const savedProgress = currentMode === 'interactive' ? loadProgress() : null;
        if (savedProgress) {
            userAnswers = savedProgress.userAnswers;
            answeredCount = savedProgress.answeredCount;
            correctCount = savedProgress.correctCount;
        }

        quizData.forEach((qObj, index) => {
            const card = document.createElement('div');
            card.className = 'question-card shadow-sm shadow-emerald-900/5';
            card.id = `question-${index}`;

            // Question number + text
            const qText = document.createElement('div');
            qText.className = 'question-text';
            qText.textContent = `${index + 1}. ${decodeHtmlEntity(qObj.q)}`;
            card.appendChild(qText);

            const optionsList = document.createElement('ul');
            optionsList.className = 'options-list';

            qObj.a.forEach((optStr, optIdx) => {
                const item = document.createElement('li');
                item.className = 'option-item';
                const label = optionLabels[optIdx] || (optIdx + 1);
                item.textContent = `${label}) ${decodeHtmlEntity(optStr)}`;

                if (currentMode === 'interactive') {
                    item.onclick = () => handleAnswer(item, optIdx, qObj.c, optionsList, index);
                }
                optionsList.appendChild(item);
            });
            card.appendChild(optionsList);

            // Restore saved answer state for this question
            if (savedProgress && userAnswers[index] !== -1) {
                const siblings = optionsList.querySelectorAll('.option-item');
                siblings.forEach(s => { s.classList.add('disabled'); s.onclick = null; });
                const clickedIdx = userAnswers[index];
                if (clickedIdx === qObj.c) {
                    siblings[clickedIdx].classList.add('correct');
                } else {
                    siblings[clickedIdx].classList.add('wrong');
                    siblings[qObj.c].classList.add('correct');
                }
            }

            if (currentMode === 'printable') {
                const ans = document.createElement('div');
                ans.className = 'correct-answer-container';
                const correctLabel = optionLabels[qObj.c] || (qObj.c + 1);
                const cleanAnsText = decodeHtmlEntity(qObj.a[qObj.c]);
                ans.textContent = `Answer: ${correctLabel}) ${cleanAnsText}`;
                card.appendChild(ans);
            }

            quizContainer.appendChild(card);
        });

        // Printable mode: add PDF header and Answer Key at the end
        if (currentMode === 'printable') {
            renderPdfHeader();
            renderAnswerKey();
        }

        // Update progress if restored
        if (savedProgress) {
            updateProgress();
            if (answeredCount === quizData.length) {
                showScore();
            }
        }
    }

    // ── Render PDF Header (prepended to quiz container for PDF export) ──
    function renderPdfHeader() {
        const header = document.createElement('div');
        header.id = 'pdf-header-block';
        header.className = 'pdf-header-block';
        header.innerHTML = `
            <div style="text-align:center; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:2px solid #d1fae5;">
                <h1 style="font-size:1.75rem; font-weight:900; color:#064e3b; margin:0 0 0.5rem 0;">${quizTitleEl.textContent}</h1>
                <div style="display:flex; justify-content:space-between; font-size:0.95rem; color:#065f46;">
                    <span class="pdf-name-slot">Name: ______________________</span>
                    <span class="pdf-date-slot">Date: ______________________</span>
                </div>
            </div>
        `;
        quizContainer.insertBefore(header, quizContainer.firstChild);
    }

    // ── Render Answer Key at end of printable PDF ──
    function renderAnswerKey() {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'answer-key-block';
        keyDiv.innerHTML = `
            <div style="margin-top:3rem; padding-top:1.5rem; border-top:2px solid #d1fae5;">
                <h3 style="font-size:1.25rem; font-weight:900; color:#064e3b; margin-bottom:1rem;">Answer Key</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:0.5rem; font-size:0.9rem;">
                    ${quizData.map((qObj, i) => {
                        const label = optionLabels[qObj.c] || (qObj.c + 1);
                        return `<span style="font-weight:600; color:#065f46;"><strong>${i + 1}.</strong> ${label}</span>`;
                    }).join('')}
                </div>
            </div>
        `;
        quizContainer.appendChild(keyDiv);
    }

    // ── Handle answer click (interactive mode) ──
    function handleAnswer(clickedItem, clickedIdx, correctIdx, listContainer, questionIndex) {
        if (clickedItem.classList.contains('disabled')) return;

        const siblings = listContainer.querySelectorAll('.option-item');
        siblings.forEach(s => {
            s.classList.add('disabled');
            s.onclick = null;
        });

        userAnswers[questionIndex] = clickedIdx;
        answeredCount++;

        if (clickedIdx === correctIdx) {
            clickedItem.classList.add('correct');
            correctCount++;
        } else {
            clickedItem.classList.add('wrong');
            siblings[correctIdx].classList.add('correct');
        }

        updateProgress();
        saveProgress();

        // All questions answered?
        if (answeredCount === quizData.length) {
            clearProgress();
            showScore();
            saveAttempt();
        }
    }

    // ── Progress bar ──
    function updateProgress() {
        const total = quizData.length;
        const pct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
        progressLabel.textContent = `${answeredCount} / ${total} answered`;
        progressPct.textContent = `${pct}%`;
        progressFill.style.width = `${pct}%`;
    }

    // ── Show score ──
    function showScore() {
        const pct = Math.round((correctCount / quizData.length) * 100);

        scoreText.textContent = `${correctCount} / ${quizData.length}`;

        let message = '';
        if (pct === 100) message = 'Perfect score! Outstanding!';
        else if (pct >= 80) message = 'Excellent work! Keep it up!';
        else if (pct >= 60) message = 'Good job! Room for improvement.';
        else if (pct >= 40) message = 'Keep practicing, you\'ll get there!';
        else message = 'Don\'t give up! Review and try again.';

        scoreSubtitle.textContent = `${pct}% correct — ${message}`;

        scoreBanner.classList.remove('hidden');
        scoreBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ── Download PDF ──
    function downloadPdf() {
        // Update PDF header with user-entered name and date
        const nameSlot = quizContainer.querySelector('.pdf-name-slot');
        const dateSlot = quizContainer.querySelector('.pdf-date-slot');
        if (nameSlot) {
            const name = pdfStudentName.value.trim();
            nameSlot.textContent = name ? `Name: ${name}` : 'Name: ______________________';
        }
        if (dateSlot) {
            const date = pdfExamDate.value;
            dateSlot.textContent = date ? `Date: ${new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Date: ______________________';
        }

        const element = quizContainer;
        const opt = {
            margin: [10, 10, 10, 10],
            filename: `${quizTitleEl.textContent || 'quiz'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        btnDownloadPdf.disabled = true;
        btnDownloadPdf.innerHTML = '<span class="animate-spin material-symbols-outlined text-sm">progress_activity</span> Generating...';
        html2pdf().set(opt).from(element).save().then(() => {
            btnDownloadPdf.disabled = false;
            btnDownloadPdf.innerHTML = '<span class="material-symbols-outlined text-sm">download</span> Download PDF';
        });
    }

    // ── Event Listeners ──
    navHome.onclick = () => showTab('home');
    navHistory.onclick = () => showTab('history');
    btnBackNav.onclick = () => showTab('home');
    btnPrintable.onclick = () => fetchQuiz('printable');
    btnInteractive.onclick = () => fetchQuiz('interactive');
    btnDownloadPdf.onclick = () => downloadPdf();
    btnRetake.onclick = () => renderQuiz();
    btnScoreHome.onclick = () => showTab('home');
});
