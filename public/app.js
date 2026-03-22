document.addEventListener('DOMContentLoaded', () => {
    // Firebase
    const db = firebase.firestore();
    const auth = firebase.auth();
    const googleProvider = new firebase.auth.GoogleAuthProvider();

    // Nav elements
    const navHome = document.getElementById('nav-home');
    const navHistory = document.getElementById('nav-history');
    const navDashboard = document.getElementById('nav-dashboard');

    // Auth elements
    const viewAuth = document.getElementById('view-auth');
    const authTabLogin = document.getElementById('auth-tab-login');
    const authTabSignup = document.getElementById('auth-tab-signup');
    const authNameField = document.getElementById('auth-name-field');
    const authName = document.getElementById('auth-name');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const btnGoogleSignin = document.getElementById('btn-google-signin');
    const authError = document.getElementById('auth-error');

    // User profile nav
    const userProfileNav = document.getElementById('user-profile-nav');
    const userAvatar = document.getElementById('user-avatar');
    const userDisplayName = document.getElementById('user-display-name');
    const btnLogout = document.getElementById('btn-logout');
    const btnProfileMenu = document.getElementById('btn-profile-menu');
    const profileDropdown = document.getElementById('profile-dropdown');
    const dropdownUserName = document.getElementById('dropdown-user-name');
    const dropdownUserEmail = document.getElementById('dropdown-user-email');

    // View sections
    const viewHome = document.getElementById('view-home');
    const viewHistory = document.getElementById('view-history');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewQuiz = document.getElementById('quiz-result-view');
    const mainContent = document.getElementById('main-content');

    // Core actions
    const btnPrintable = document.getElementById('btn-printable');
    const btnInteractive = document.getElementById('btn-interactive');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnShareQuiz = document.getElementById('btn-share-quiz');
    const btnWhatsappShare = document.getElementById('btn-whatsapp-share');
    const btnBackNav = document.getElementById('btn-back-to-nav');
    const btnRetake = document.getElementById('btn-retake');
    const btnScoreHome = document.getElementById('btn-score-home');
    const inputUrl = document.getElementById('quiz-url');
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');
    const btnEndQuiz = document.getElementById('btn-end-quiz');
    const btnGoLibrary = document.getElementById('btn-go-library');
    const btnResetQuiz = document.getElementById('btn-reset-quiz');

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

    // Live stats elements
    const liveStatsBar = document.getElementById('live-stats-bar');
    const statUnanswered = document.getElementById('stat-unanswered');
    const statAttempted = document.getElementById('stat-attempted');
    const statCorrect = document.getElementById('stat-correct');
    const statWrong = document.getElementById('stat-wrong');
    const progressFill = document.getElementById('progress-fill');

    let currentMode = '';
    let quizData = [];
    let currentQuizId = null;
    let currentUser = null;
    let isSignUp = false;
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

    // ── Generate quiz title from URL if server returns empty/untitled ──
    function generateTitleFromUrl(url) {
        try {
            const path = new URL(url).pathname;
            // Extract slug like "zeal-study-tntet-2026-tamil-quiz-model_16"
            const slug = path.split('/').pop().replace(/\.html?$/i, '');
            // Clean up: replace hyphens/underscores, remove common prefixes
            let title = slug
                .replace(/[-_]+/g, ' ')
                .replace(/zeal\s*study\s*/gi, '')
                .replace(/tntet\s*2026\s*/gi, '')
                .trim();
            // Title case
            title = title.replace(/\b\w/g, c => c.toUpperCase());
            return title || 'Quiz';
        } catch (e) {
            return 'Quiz';
        }
    }

    function ensureTitle(title, url) {
        if (title && title !== 'Untitled Quiz' && title.trim()) return title.trim();
        return generateTitleFromUrl(url);
    }

    // ── Local Cache Layer ──
    const CACHE_PREFIX = 'tntetace_';
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    function cacheSet(key, data) {
        try {
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
        } catch (e) { /* storage full — ignore */ }
    }

    function cacheGet(key, maxAge = CACHE_TTL) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (maxAge && Date.now() - ts > maxAge) return null;
            return data;
        } catch (e) { return null; }
    }

    function cacheClear(key) {
        localStorage.removeItem(CACHE_PREFIX + key);
    }

    function decodeHtmlEntity(html) {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    // ── Auth State Listener ──
    auth.onAuthStateChanged(async user => {
        currentUser = user;
        if (user) {
            // User is signed in — show app
            viewAuth.classList.add('hidden');
            mainContent.classList.remove('hidden');

            // Update nav profile
            userProfileNav.classList.remove('hidden');
            userProfileNav.style.display = 'flex';
            const displayName = user.displayName || user.email.split('@')[0];
            userDisplayName.textContent = displayName;
            userAvatar.src = user.photoURL || generateAvatar(user.displayName || user.email);
            dropdownUserName.textContent = displayName;
            dropdownUserEmail.textContent = user.email || '';

            // Pre-fill PDF student name
            if (pdfStudentName) pdfStudentName.value = user.displayName || '';

            // Check if arriving via shared link
            const loaded = await checkSharedQuiz();
            if (!loaded) showTab('home');
        } else {
            // Not signed in — show auth
            mainContent.classList.add('hidden');
            viewQuiz.classList.add('hidden');
            viewAuth.classList.remove('hidden');

            userProfileNav.classList.add('hidden');
            userProfileNav.style.display = 'none';
        }
    });

    // Generate a simple avatar from initials
    function generateAvatar(name) {
        const initials = (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#14422d';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#bceecf';
        ctx.font = 'bold 24px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, 32, 32);
        return canvas.toDataURL();
    }

    // ── Auth Tab Toggle ──
    authTabLogin.onclick = () => {
        isSignUp = false;
        authTabLogin.className = 'flex-1 py-2.5 rounded-lg text-sm font-headline font-bold transition-all bg-surface-container-lowest text-primary shadow-sm';
        authTabSignup.className = 'flex-1 py-2.5 rounded-lg text-sm font-headline font-bold transition-all text-on-surface-variant hover:text-primary';
        authNameField.classList.add('hidden');
        btnAuthSubmit.textContent = 'Sign In';
        authError.classList.add('hidden');
    };

    authTabSignup.onclick = () => {
        isSignUp = true;
        authTabSignup.className = 'flex-1 py-2.5 rounded-lg text-sm font-headline font-bold transition-all bg-surface-container-lowest text-primary shadow-sm';
        authTabLogin.className = 'flex-1 py-2.5 rounded-lg text-sm font-headline font-bold transition-all text-on-surface-variant hover:text-primary';
        authNameField.classList.remove('hidden');
        btnAuthSubmit.textContent = 'Create Account';
        authError.classList.add('hidden');
    };

    function showAuthError(msg) {
        authError.textContent = msg;
        authError.classList.remove('hidden');
    }

    // ── Email/Password Auth ──
    btnAuthSubmit.onclick = async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value.trim();
        if (!email || !password) return showAuthError('Please enter email and password.');

        btnAuthSubmit.disabled = true;
        btnAuthSubmit.innerHTML = '<span class="animate-spin material-symbols-outlined text-sm">progress_activity</span>';
        authError.classList.add('hidden');

        try {
            if (isSignUp) {
                const name = authName.value.trim();
                const cred = await auth.createUserWithEmailAndPassword(email, password);
                if (name) {
                    await cred.user.updateProfile({ displayName: name });
                }
                await db.collection('users').doc(cred.user.uid).set({
                    name: name || email.split('@')[0],
                    email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } else {
                await auth.signInWithEmailAndPassword(email, password);
            }
        } catch (err) {
            const messages = {
                'auth/email-already-in-use': 'This email is already registered. Try signing in.',
                'auth/weak-password': 'Password should be at least 6 characters.',
                'auth/user-not-found': 'No account found with this email.',
                'auth/wrong-password': 'Incorrect password. Please try again.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/invalid-credential': 'Invalid email or password. Please try again.',
            };
            showAuthError(messages[err.code] || err.message);
        } finally {
            btnAuthSubmit.disabled = false;
            btnAuthSubmit.textContent = isSignUp ? 'Create Account' : 'Sign In';
        }
    };

    // ── Google Sign-In ──
    btnGoogleSignin.onclick = async () => {
        try {
            const result = await auth.signInWithPopup(googleProvider);
            const user = result.user;
            await db.collection('users').doc(user.uid).set({
                name: user.displayName || '',
                email: user.email,
                photoURL: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                showAuthError(err.message);
            }
        }
    };

    // ── Logout ──
    btnLogout.onclick = () => auth.signOut();

    // Allow Enter key on auth fields
    [authEmail, authPassword, authName].forEach(el => {
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') btnAuthSubmit.click();
        });
    });

    // ── Tab Switching ──
    const allNavTabs = [navHome, navHistory, navDashboard];
    const inactiveTabClass = "nav-link font-headline tracking-tight font-bold text-on-surface-variant hover:text-primary transition-colors";
    const activeTabClass = "nav-link active font-headline tracking-tight font-bold text-primary transition-colors";

    function showTab(tab) {
        allNavTabs.forEach(t => t.className = inactiveTabClass);

        [viewHome, viewHistory, viewDashboard, viewQuiz].forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('opacity-100');
            v.classList.add('opacity-0');
        });

        mainContent.classList.remove('hidden');

        if (tab === 'home') {
            navHome.className = activeTabClass;
            viewHome.classList.remove('hidden');
            setTimeout(() => viewHome.classList.replace('opacity-0', 'opacity-100'), 50);
        } else if (tab === 'history') {
            navHistory.className = activeTabClass;
            viewHistory.classList.remove('hidden');
            setTimeout(() => viewHistory.classList.replace('opacity-0', 'opacity-100'), 50);
            loadHistory();
        } else if (tab === 'dashboard') {
            navDashboard.className = activeTabClass;
            viewDashboard.classList.remove('hidden');
            setTimeout(() => viewDashboard.classList.replace('opacity-0', 'opacity-100'), 50);
            loadDashboard();
        }
    }

    // ── History Search ──
    let historyCards = [];

    historySearch.addEventListener('input', () => {
        const query = historySearch.value.toLowerCase().trim();
        historyCards.forEach(({ card, title }) => {
            card.style.display = title.toLowerCase().includes(query) ? '' : 'none';
        });
    });

    // ── Render history cards from data array ──
    function renderHistoryCards(quizzes) {
        historyList.innerHTML = '';
        historyCards = [];

        if (quizzes.length === 0) {
            historyList.innerHTML = '<div class="col-span-full text-center py-24 px-6 border-dashed border-2 border-outline-variant rounded-2xl"><span class="material-symbols-outlined text-4xl text-outline mb-4">quiz</span><p class="font-headline font-bold text-xl text-on-surface">Your library is empty.</p><p class="font-body text-on-surface-variant text-lg mt-2">Paste a ZealStudy URL on the home page to get started.</p></div>';
            return;
        }

        quizzes.forEach(q => {
            const card = document.createElement('div');
            card.className = 'history-card animate-in fade-in slide-in-from-bottom-4 duration-500';

            const cardTitle = ensureTitle(q.title, q.url);

            let scoreHtml;
            if (q.bestScore !== undefined) {
                const pct = Math.round((q.bestScore / q.bestTotal) * 100);
                scoreHtml = `<div class="flex flex-wrap gap-4">
                    <div class="flex items-center gap-1.5 text-xs font-headline font-bold text-on-surface-variant">
                        <span class="material-symbols-outlined text-sm">trophy</span>
                        ${q.bestScore}/${q.bestTotal} (${pct}%)
                    </div>
                    <div class="flex items-center gap-1.5 text-xs font-headline font-bold text-on-surface-variant">
                        <span class="material-symbols-outlined text-sm">repeat</span>
                        ${q.attemptCount} attempt${q.attemptCount !== 1 ? 's' : ''}
                    </div>
                </div>`;
            } else {
                scoreHtml = '<span class="text-on-surface-variant/50">Not attempted yet</span>';
            }

            card.innerHTML = `
                <div class="space-y-2 mb-4">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="font-headline font-bold text-[10px] tracking-widest text-primary uppercase">${q.dateStr || ''}</span>
                            ${q.timeStr ? `<span class="font-headline font-bold text-[10px] text-on-surface-variant/50">${q.timeStr}</span>` : ''}
                        </div>
                        <button class="btn-delete-h p-1 rounded-lg text-on-surface-variant/30 hover:text-error hover:bg-error-container/50 transition-all" title="Delete quiz">
                            <span class="material-symbols-outlined text-lg">delete</span>
                        </button>
                    </div>
                    <h4 class="font-headline font-bold text-xl leading-tight text-on-surface">${cardTitle}</h4>
                    <div class="pt-2 mt-auto text-xs font-headline font-bold">${scoreHtml}</div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button class="btn-retake-h flex-grow h-10 bg-gradient-primary text-white rounded-xl font-headline font-bold text-xs hover:shadow-lg hover:shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-sm">play_arrow</span> Quiz
                    </button>
                    <button class="btn-print-h flex-grow h-10 bg-surface-container-high text-on-surface rounded-xl font-headline font-bold text-xs hover:bg-surface-container-highest active:scale-95 transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-sm">download</span> PDF
                    </button>
                    <div class="relative">
                        <button class="btn-share-h h-10 px-3 bg-surface-container-high text-on-surface rounded-xl font-headline font-bold text-xs hover:bg-surface-container-highest active:scale-95 transition-all flex items-center justify-center gap-1" title="Share quiz">
                            <span class="material-symbols-outlined text-sm">share</span>
                        </button>
                        <div class="share-dropdown hidden absolute right-0 bottom-full mb-2 w-44 bg-white rounded-xl shadow-xl shadow-black/10 border border-surface-variant overflow-hidden z-50">
                            <button class="btn-copy-link-h w-full px-4 py-2.5 text-left text-xs font-headline font-bold text-on-surface hover:bg-surface-container-low transition-all flex items-center gap-2">
                                <span class="material-symbols-outlined text-sm">link</span> Copy Link
                            </button>
                            <button class="btn-wa-share-h w-full px-4 py-2.5 text-left text-xs font-headline font-bold text-on-surface hover:bg-surface-container-low transition-all flex items-center gap-2">
                                <svg class="w-3.5 h-3.5 fill-[#25D366]" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            `;

            card.querySelector('.btn-retake-h').onclick = () => loadQuizFromFirestore(q.id, 'interactive');
            card.querySelector('.btn-print-h').onclick = () => loadQuizFromFirestore(q.id, 'printable');
            const dropdown = card.querySelector('.share-dropdown');
            card.querySelector('.btn-share-h').onclick = (e) => {
                e.stopPropagation();
                // Close any other open dropdowns
                document.querySelectorAll('.share-dropdown').forEach(d => { if (d !== dropdown) d.classList.add('hidden'); });
                dropdown.classList.toggle('hidden');
            };
            card.querySelector('.btn-copy-link-h').onclick = async (e) => {
                e.stopPropagation();
                currentQuizId = q.id;
                // Use in-memory data for share
                quizTitleEl.textContent = cardTitle;
                inputUrl.value = q.url || '';
                quizData = []; // getShareUrl uses quizData from cache
                const cached = cacheGet(`quiz_${q.id}`, Infinity);
                if (cached) quizData = cached.questions;
                const shareUrl = await getShareUrl();
                if (shareUrl) {
                    await navigator.clipboard.writeText(shareUrl);
                    const btn = card.querySelector('.btn-share-h');
                    btn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span>';
                    setTimeout(() => { btn.innerHTML = '<span class="material-symbols-outlined text-sm">share</span>'; }, 2000);
                }
                dropdown.classList.add('hidden');
            };
            card.querySelector('.btn-wa-share-h').onclick = async (e) => {
                e.stopPropagation();
                currentQuizId = q.id;
                quizTitleEl.textContent = cardTitle;
                inputUrl.value = q.url || '';
                const cached = cacheGet(`quiz_${q.id}`, Infinity);
                if (cached) quizData = cached.questions;
                const shareUrl = await getShareUrl();
                if (shareUrl) {
                    const text = `Try this quiz: *${cardTitle}*\n${shareUrl}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }
                dropdown.classList.add('hidden');
            };
            card.querySelector('.btn-delete-h').onclick = async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this quiz and all its attempts?')) return;
                try {
                    await db.collection('quizzes').doc(q.id).delete();
                    const attemptsSnap = await db.collection('attempts').where('quizId', '==', q.id).get();
                    const batch = db.batch();
                    attemptsSnap.forEach(a => batch.delete(a.ref));
                    await batch.commit();
                    card.remove();
                    historyCards = historyCards.filter(hc => hc.card !== card);
                    // Update cache
                    const cached = cacheGet(`history_${currentUser.uid}`, Infinity);
                    if (cached) {
                        cacheSet(`history_${currentUser.uid}`, cached.filter(c => c.id !== q.id));
                    }
                    cacheClear(`quiz_${q.id}`);
                } catch (err) {
                    console.error('Failed to delete quiz:', err);
                    alert('Failed to delete. Please try again.');
                }
            };

            historyCards.push({ card, title: cardTitle });
            historyList.appendChild(card);
        });
    }

    // ── History (cached + Firebase) ──
    async function loadHistory() {
        if (!currentUser) return;

        const cacheKey = `history_${currentUser.uid}`;

        // 1. Show cached data instantly
        const cached = cacheGet(cacheKey);
        if (cached) {
            renderHistoryCards(cached);
        } else {
            historyList.innerHTML = '<div class="col-span-full py-12 text-center text-on-surface-variant font-headline flex items-center justify-center gap-3"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Loading your quizzes...</div>';
        }

        // 2. Fetch fresh data from Firestore in background
        try {
            const quizSnap = await db.collection('quizzes')
                .where('userId', '==', currentUser.uid)
                .get();

            const sortedDocs = quizSnap.docs.sort((a, b) => {
                const aTime = a.data().createdAt?.toMillis() || 0;
                const bTime = b.data().createdAt?.toMillis() || 0;
                return bTime - aTime;
            }).slice(0, 20);

            // Build serializable quiz list (for cache + rendering)
            const quizzes = sortedDocs.map(doc => {
                const quiz = doc.data();
                let dateStr = '';
                let timeStr = '';
                if (quiz.createdAt) {
                    const d = quiz.createdAt.toDate();
                    dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                }

                // Cache each quiz document for fast loading
                const resolvedTitle = ensureTitle(quiz.title, quiz.url);
                cacheSet(`quiz_${doc.id}`, {
                    title: resolvedTitle,
                    url: quiz.url || '',
                    questions: quiz.questions
                });

                return {
                    id: doc.id,
                    title: resolvedTitle,
                    url: quiz.url || '',
                    dateStr,
                    timeStr
                };
            });

            // Render cards immediately (without scores)
            renderHistoryCards(quizzes);

            // Cache the list
            cacheSet(cacheKey, quizzes);

            // 3. Fetch attempt scores in parallel, update cards + cache
            const scoreResults = await Promise.all(quizzes.map(async (q) => {
                try {
                    const attemptSnap = await db.collection('attempts')
                        .where('quizId', '==', q.id)
                        .where('userId', '==', currentUser.uid)
                        .get();

                    if (attemptSnap.empty) return { id: q.id };

                    let best = null;
                    attemptSnap.forEach(a => {
                        const d = a.data();
                        if (!best || d.score > best.score) best = d;
                    });

                    return {
                        id: q.id,
                        bestScore: best.score,
                        bestTotal: best.total,
                        attemptCount: attemptSnap.size
                    };
                } catch (e) { return { id: q.id }; }
            }));

            // Merge scores into quizzes and re-render + cache
            scoreResults.forEach(s => {
                const q = quizzes.find(quiz => quiz.id === s.id);
                if (q && s.bestScore !== undefined) {
                    q.bestScore = s.bestScore;
                    q.bestTotal = s.bestTotal;
                    q.attemptCount = s.attemptCount;
                }
            });

            renderHistoryCards(quizzes);
            cacheSet(cacheKey, quizzes);
        } catch (err) {
            console.error('Failed to load history:', err);
            if (!cached) {
                historyList.innerHTML = '<div class="col-span-full py-12 text-center text-error font-headline font-bold">Failed to load history.</div>';
            }
        }
    }

    // ── Dashboard ──
    async function loadDashboard() {
        if (!currentUser) return;

        try {
            const quizSnap = await db.collection('quizzes')
                .where('userId', '==', currentUser.uid)
                .get();

            document.getElementById('stat-total-quizzes').textContent = quizSnap.size;

            const attemptSnap = await db.collection('attempts')
                .where('userId', '==', currentUser.uid)
                .get();

            // Sort client-side
            const sortedAttempts = attemptSnap.docs
                .map(d => d.data())
                .sort((a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0));

            document.getElementById('stat-total-attempts').textContent = sortedAttempts.length;

            if (sortedAttempts.length > 0) {
                let totalPct = 0;
                let bestPct = 0;

                sortedAttempts.forEach(d => {
                    const pct = Math.round((d.score / d.total) * 100);
                    totalPct += pct;
                    if (pct > bestPct) bestPct = pct;
                });

                const avgPct = Math.round(totalPct / sortedAttempts.length);
                document.getElementById('stat-avg-score').textContent = avgPct + '%';
                document.getElementById('stat-best-score').textContent = bestPct + '%';

                const listEl = document.getElementById('dashboard-attempts-list');
                listEl.innerHTML = '';

                sortedAttempts.slice(0, 10).forEach(attempt => {
                    const pct = Math.round((attempt.score / attempt.total) * 100);
                    const dateStr = attempt.completedAt
                        ? attempt.completedAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '';

                    let badgeColor = 'bg-error-container text-on-error-container';
                    if (pct >= 80) badgeColor = 'bg-primary-fixed text-on-primary-fixed';
                    else if (pct >= 60) badgeColor = 'bg-secondary-container text-on-secondary-container';
                    else if (pct >= 40) badgeColor = 'bg-tertiary-fixed text-tertiary';

                    const row = document.createElement('div');
                    row.className = 'px-6 py-4 flex items-center justify-between';
                    row.innerHTML = `
                        <div class="min-w-0 flex-1">
                            <div class="font-headline font-bold text-on-surface text-sm truncate">${attempt.title || 'Quiz'}</div>
                            <div class="flex items-center gap-1.5 text-xs font-headline font-bold text-on-surface-variant mt-1">
                                <span class="material-symbols-outlined text-sm">calendar_today</span>
                                ${dateStr}
                            </div>
                        </div>
                        <span class="shrink-0 ml-4 px-3 py-1.5 rounded-lg text-sm font-headline font-bold ${badgeColor}">
                            ${attempt.score}/${attempt.total} (${pct}%)
                        </span>
                    `;
                    listEl.appendChild(row);
                });
            } else {
                document.getElementById('stat-avg-score').textContent = '—';
                document.getElementById('stat-best-score').textContent = '—';
                document.getElementById('dashboard-attempts-list').innerHTML =
                    '<div class="px-6 py-8 text-center text-on-surface-variant font-body text-lg">No attempts yet. Take a quiz to see your progress!</div>';
            }
        } catch (err) {
            console.error('Failed to load dashboard:', err);
        }
    }

    // ── Load quiz from Firestore (for retake / history) ──
    function showQuizView(quizId, mode, title, url, questions) {
        currentQuizId = quizId;
        currentMode = mode;
        quizData = questions;
        quizTitleEl.textContent = title;
        modeBadge.textContent = mode === 'printable' ? 'Printable' : 'Interactive';
        inputUrl.value = url;

        [viewHome, viewHistory, viewDashboard].forEach(v => v.classList.add('hidden'));
        mainContent.classList.add('hidden');
        viewQuiz.classList.remove('hidden');
        viewQuiz.classList.remove('opacity-0');
        viewQuiz.classList.add('opacity-100');

        renderQuiz();
        window.scrollTo(0, 0);
    }

    async function loadQuizFromFirestore(quizId, mode) {
        // Try cache first — instant load
        const cached = cacheGet(`quiz_${quizId}`, Infinity);
        if (cached && cached.questions) {
            showQuizView(quizId, mode, cached.title, cached.url, cached.questions);
            return;
        }

        // Fallback to Firestore
        try {
            const docSnap = await db.collection('quizzes').doc(quizId).get();
            if (!docSnap.exists) throw new Error('Quiz not found');

            const quiz = docSnap.data();

            // Cache for next time
            const resolvedTitle = ensureTitle(quiz.title, quiz.url);
            cacheSet(`quiz_${quizId}`, {
                title: resolvedTitle,
                url: quiz.url || '',
                questions: quiz.questions
            });

            showQuizView(quizId, mode, resolvedTitle, quiz.url, quiz.questions);
        } catch (err) {
            console.error('Failed to load quiz:', err);
            alert('Failed to load quiz. Please try again.');
        }
    }

    // ── Save quiz to Firestore (user-scoped) ──
    function generateQuizDocId(url) {
        if (!currentUser) return null;
        return `${currentUser.uid}_${btoa(url).substring(0, 40)}`;
    }

    async function saveQuizToFirestore(url, title, questions) {
        if (!currentUser) return;

        // Set ID immediately so share works even if Firestore is slow/blocked
        const docId = generateQuizDocId(url);
        currentQuizId = docId;

        try {
            const existingDoc = await db.collection('quizzes').doc(docId).get();

            if (existingDoc.exists) {
                cacheSet(`quiz_${docId}`, { title: existingDoc.data().title, url: url || '', questions });
                return;
            }

            const resolvedTitle = ensureTitle(title, url);
            await db.collection('quizzes').doc(docId).set({
                url: url || '',
                title: resolvedTitle,
                questionCount: questions.length,
                questions,
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email || 'Anonymous',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            currentQuizId = docId;

            // Cache quiz and update history cache
            cacheSet(`quiz_${docId}`, { title: resolvedTitle, url: url || '', questions });
            if (currentUser) {
                const cacheKey = `history_${currentUser.uid}`;
                const cached = cacheGet(cacheKey, Infinity) || [];
                const idx = cached.findIndex(c => c.url === url);
                if (idx !== -1) {
                    cached[idx].id = docId;
                    cacheSet(cacheKey, cached);
                }
            }
        } catch (err) {
            console.error('Failed to save quiz:', err);
        }
    }

    // ── Save attempt to Firestore (user-scoped) ──
    async function saveAttempt() {
        if (!currentQuizId || !currentUser) return;
        try {
            await db.collection('attempts').add({
                quizId: currentQuizId,
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email || 'Anonymous',
                title: quizTitleEl.textContent || 'Quiz',
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
        errorMsg.classList.add('hidden');

        // Show spinner on the clicked button
        const activeBtn = mode === 'printable' ? btnPrintable : btnInteractive;
        const originalHtml = activeBtn.innerHTML;
        activeBtn.disabled = true;
        btnPrintable.disabled = true;
        btnInteractive.disabled = true;
        activeBtn.innerHTML = '<span class="animate-spin material-symbols-outlined">progress_activity</span> Extracting...';

        try {
            const res = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
            const data = await res.json();

            if (!res.ok || !data.success) throw new Error(data.error);

            quizData = data.quiz;
            const resolvedTitle = ensureTitle(data.title, url);
            quizTitleEl.textContent = resolvedTitle;
            modeBadge.textContent = mode === 'printable' ? 'Printable' : 'Interactive';

            // Show quiz view immediately (don't let Firebase block rendering)
            [viewHome, viewHistory, viewDashboard].forEach(v => v.classList.add('hidden'));
            mainContent.classList.add('hidden');
            viewQuiz.classList.remove('hidden');
            viewQuiz.classList.remove('opacity-0');
            viewQuiz.classList.add('opacity-100');

            renderQuiz();
            window.scrollTo(0, 0);

            // Cache quiz data immediately so it appears in My Quizzes
            const tempId = 'temp_' + Date.now();
            cacheSet(`quiz_${tempId}`, { title: resolvedTitle, url, questions: data.quiz });

            if (currentUser) {
                const cacheKey = `history_${currentUser.uid}`;
                const cached = cacheGet(cacheKey, Infinity) || [];
                const now = new Date();
                // Add to top of history cache if not already there by URL
                if (!cached.some(c => c.url === url)) {
                    cached.unshift({
                        id: tempId,
                        title: resolvedTitle,
                        url,
                        dateStr: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                        timeStr: now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    });
                    cacheSet(cacheKey, cached);
                }
            }

            // Save to Firebase in background — share buttons will wait for it
            saveQuizToFirestore(url, resolvedTitle, data.quiz);
        } catch (err) {
            errorMsg.textContent = err.message || "Failed to parse this link. Please check the URL.";
            errorMsg.classList.remove('hidden');
        } finally {
            loadingDiv.classList.add('hidden');
            activeBtn.innerHTML = originalHtml;
            activeBtn.disabled = false;
            btnPrintable.disabled = false;
            btnInteractive.disabled = false;
        }
    }

    // ── Build a single question card ──
    function buildQuestionCard(qObj, index, savedProgress) {
        const card = document.createElement('div');
        card.className = 'question-card';
        card.id = `question-${index}`;

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

        // Restore saved answer state
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

        return card;
    }

    // ── Render Quiz (chunked for speed) ──
    let renderAbortController = null;

    function renderQuiz() {
        // Cancel any in-progress chunked render
        if (renderAbortController) renderAbortController.abort();
        renderAbortController = new AbortController();
        const signal = renderAbortController.signal;

        quizContainer.innerHTML = '';
        quizContainer.className = `mode-${currentMode}`;

        // Reset score state
        userAnswers = new Array(quizData.length).fill(-1);
        answeredCount = 0;
        correctCount = 0;

        // Hide score banner
        scoreBanner.classList.add('hidden');

        // Show/hide mode-specific controls — PDF button always visible
        btnDownloadPdf.classList.remove('hidden');
        btnDownloadPdf.style.display = 'flex';
        btnShareQuiz.classList.remove('hidden');
        btnShareQuiz.style.display = 'flex';
        btnWhatsappShare.classList.remove('hidden');
        btnWhatsappShare.style.display = 'flex';

        if (currentMode === 'printable') {
            liveStatsBar.classList.add('hidden');
            pdfHeaderFields.classList.remove('hidden');
            btnResetQuiz.classList.add('hidden');
        } else {
            pdfHeaderFields.classList.add('hidden');
            liveStatsBar.classList.remove('hidden');
            btnResetQuiz.classList.remove('hidden');
            btnResetQuiz.style.display = 'inline-flex';
            updateProgress();
        }

        // Check for saved progress (interactive mode)
        const savedProgress = currentMode === 'interactive' ? loadProgress() : null;
        if (savedProgress) {
            userAnswers = savedProgress.userAnswers;
            answeredCount = savedProgress.answeredCount;
            correctCount = savedProgress.correctCount;
        }

        // Render first batch immediately for instant feedback
        const FIRST_BATCH = 10;
        const CHUNK_SIZE = 15;
        const fragment = document.createDocumentFragment();

        const firstBatchEnd = Math.min(FIRST_BATCH, quizData.length);
        for (let i = 0; i < firstBatchEnd; i++) {
            fragment.appendChild(buildQuestionCard(quizData[i], i, savedProgress));
        }

        // Printable mode: prepend PDF header
        if (currentMode === 'printable') {
            renderPdfHeader();
        }

        quizContainer.appendChild(fragment);

        // Render remaining questions in chunks via requestAnimationFrame
        if (firstBatchEnd < quizData.length) {
            let cursor = firstBatchEnd;

            function renderNextChunk() {
                if (signal.aborted || cursor >= quizData.length) {
                    // All done — add answer key if printable
                    if (!signal.aborted && currentMode === 'printable') {
                        renderAnswerKey();
                    }
                    return;
                }

                const chunkEnd = Math.min(cursor + CHUNK_SIZE, quizData.length);
                const chunk = document.createDocumentFragment();
                for (let i = cursor; i < chunkEnd; i++) {
                    chunk.appendChild(buildQuestionCard(quizData[i], i, savedProgress));
                }
                quizContainer.appendChild(chunk);
                cursor = chunkEnd;
                requestAnimationFrame(renderNextChunk);
            }

            requestAnimationFrame(renderNextChunk);
        } else if (currentMode === 'printable') {
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

    // ── Render PDF Header ──
    function renderPdfHeader() {
        const header = document.createElement('div');
        header.id = 'pdf-header-block';
        header.className = 'pdf-header-block';
        header.innerHTML = `
            <div style="text-align:center; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:2px solid #c0c9c1;">
                <h1 style="font-family:Manrope,sans-serif; font-size:1.75rem; font-weight:900; color:#14422d; margin:0 0 0.5rem 0;">${quizTitleEl.textContent}</h1>
                <div style="display:flex; justify-content:space-between; font-family:Manrope,sans-serif; font-size:0.95rem; color:#414943;">
                    <span class="pdf-name-slot">Name: ______________________</span>
                    <span class="pdf-date-slot">Date: ______________________</span>
                </div>
            </div>
        `;
        quizContainer.insertBefore(header, quizContainer.firstChild);
    }

    // ── Render Answer Key ──
    function renderAnswerKey() {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'answer-key-block';
        keyDiv.innerHTML = `
            <div style="margin-top:3rem; padding-top:1.5rem; border-top:2px solid #c0c9c1;">
                <h3 style="font-family:Manrope,sans-serif; font-size:1.25rem; font-weight:900; color:#14422d; margin-bottom:1rem;">Answer Key</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:0.5rem; font-family:Manrope,sans-serif; font-size:0.9rem;">
                    ${quizData.map((qObj, i) => {
                        const label = optionLabels[qObj.c] || (qObj.c + 1);
                        return `<span style="font-weight:600; color:#14422d;"><strong>${i + 1}.</strong> ${label}</span>`;
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

    // ── Live Stats ──
    function updateProgress() {
        const total = quizData.length;
        const wrongCount = answeredCount - correctCount;
        const remaining = total - answeredCount;
        const pct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

        statUnanswered.textContent = remaining;
        statAttempted.textContent = answeredCount;
        statCorrect.textContent = correctCount;
        statWrong.textContent = wrongCount;
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

    // ── Share Quiz ──
    // Returns the share URL (creates shared entry if needed)
    async function getShareUrl() {
        if (!currentQuizId || !currentUser) return null;

        // Generate a deterministic share ID from quiz ID
        const shareId = currentQuizId.substring(0, 12);
        const shareUrl = `${window.location.origin}?shared=${shareId}`;

        // Create shared entry in Firestore (fire-and-forget — don't block the UI)
        // Uses in-memory quizData + title instead of fetching from Firestore
        db.collection('shared').doc(shareId).set({
            quizId: currentQuizId,
            title: quizTitleEl.textContent || 'Quiz',
            url: inputUrl.value || '',
            questionCount: quizData.length,
            questions: quizData,
            sharedBy: currentUser.displayName || currentUser.email.split('@')[0],
            sharedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error('Share save failed:', err));

        return shareUrl;
    }

    async function shareQuiz() {
        try {
            const shareUrl = await getShareUrl();
            if (!shareUrl) return;

            await navigator.clipboard.writeText(shareUrl);

            const original = btnShareQuiz.innerHTML;
            btnShareQuiz.innerHTML = '<span class="material-symbols-outlined text-[14px]">check</span> Copied!';
            setTimeout(() => { btnShareQuiz.innerHTML = original; }, 2000);
        } catch (err) {
            console.error('Failed to share quiz:', err);
            alert('Failed to share. Please try again.');
        }
    }

    // ── Load Shared Quiz (from URL param) ──
    async function checkSharedQuiz() {
        const params = new URLSearchParams(window.location.search);
        const shareId = params.get('shared');
        if (!shareId) return false;

        try {
            const sharedDoc = await db.collection('shared').doc(shareId).get();
            if (!sharedDoc.exists) {
                alert('This shared quiz link is invalid or expired.');
                window.history.replaceState({}, '', window.location.pathname);
                return false;
            }

            const shared = sharedDoc.data();

            // If user is logged in, add to their quizzes
            if (currentUser) {
                // Check if they already have it
                const existing = await db.collection('quizzes')
                    .where('url', '==', shared.url)
                    .where('userId', '==', currentUser.uid)
                    .limit(1)
                    .get();

                if (existing.empty) {
                    const docRef = await db.collection('quizzes').add({
                        url: shared.url,
                        title: shared.title,
                        questionCount: shared.questionCount,
                        questions: shared.questions,
                        userId: currentUser.uid,
                        userName: currentUser.displayName || currentUser.email,
                        shareId: shareId,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    currentQuizId = docRef.id;
                } else {
                    currentQuizId = existing.docs[0].id;
                }
            }

            // Load quiz into interactive mode
            currentMode = 'interactive';
            quizData = shared.questions;
            quizTitleEl.textContent = shared.title || 'Shared Quiz';
            modeBadge.textContent = `Shared by ${shared.sharedBy || 'someone'}`;

            [viewHome, viewHistory, viewDashboard].forEach(v => v.classList.add('hidden'));
            mainContent.classList.add('hidden');
            viewQuiz.classList.remove('hidden');

            renderQuiz();
            window.scrollTo(0, 0);

            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            return true;
        } catch (err) {
            console.error('Failed to load shared quiz:', err);
            return false;
        }
    }

    // ── Event Listeners ──
    navHome.onclick = () => showTab('home');
    navHistory.onclick = () => showTab('history');
    navDashboard.onclick = () => showTab('dashboard');
    btnBackNav.onclick = () => showTab('home');
    btnPrintable.onclick = () => fetchQuiz('printable');
    btnInteractive.onclick = () => fetchQuiz('interactive');
    btnDownloadPdf.onclick = () => downloadPdf();
    btnShareQuiz.onclick = () => shareQuiz();
    btnWhatsappShare.onclick = async () => {
        try {
            const shareUrl = await getShareUrl();
            if (!shareUrl) return;
            const title = quizTitleEl.textContent || 'Quiz';
            const text = `Try this quiz: *${title}*\n${shareUrl}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        } catch (err) {
            console.error('WhatsApp share failed:', err);
        }
    };
    btnRetake.onclick = () => { clearProgress(); renderQuiz(); };
    btnScoreHome.onclick = () => showTab('home');
    btnEndQuiz.onclick = () => showTab('home');
    btnGoLibrary.onclick = () => showTab('history');
    btnResetQuiz.onclick = () => { clearProgress(); renderQuiz(); window.scrollTo(0, 0); };

    // ── Profile Dropdown ──
    btnProfileMenu.onclick = (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
    };

    // Mobile nav links in dropdown
    const navHomeMobile = document.getElementById('nav-home-mobile');
    const navHistoryMobile = document.getElementById('nav-history-mobile');
    const navDashboardMobile = document.getElementById('nav-dashboard-mobile');
    if (navHomeMobile) navHomeMobile.onclick = () => { profileDropdown.classList.add('hidden'); showTab('home'); };
    if (navHistoryMobile) navHistoryMobile.onclick = () => { profileDropdown.classList.add('hidden'); showTab('history'); };
    if (navDashboardMobile) navDashboardMobile.onclick = () => { profileDropdown.classList.add('hidden'); showTab('dashboard'); };

    // Close all dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-profile-nav')) profileDropdown.classList.add('hidden');
        document.querySelectorAll('.share-dropdown').forEach(d => d.classList.add('hidden'));
    });
});
