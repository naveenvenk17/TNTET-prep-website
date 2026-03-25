const express = require('express');
const cors = require('cors');
const vm = require('vm');
require('dotenv').config();
const OpenAI = require('openai');
const app = express();
const port = 3000;

const openai = new OpenAI({ apiKey: process.env.openai_api });

const path = require('path');

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Extract title from HTML ──
function extractTitle(html) {
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const h3Match = html.match(/<h3[^>]*class=['"]post-title[^'"]*['"][^>]*>([\s\S]*?)<\/h3>/i);
    const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
    let title = (h3Match ? h3Match[1] : ogMatch ? ogMatch[1] : titleMatch ? titleMatch[1] : "Untitled Quiz").trim();
    title = title.replace(/<[^>]+>/g, '').trim();
    title = title.replace(/Zeal\s*study\s*/gi, "").replace(/TNTET\s*2026\s*:\s*/gi, "").trim();
    return title || "Untitled Quiz";
}

// ── Regex-based extraction (primary) ──
function extractViaRegex(html) {
    // Try multiple strategies in order of specificity

    // Strategy 1: JS array variables ({ q, a:[], c } or { q, options:[], a } or { q, a:"str", b, c, d })
    const result = extractFromJsArrays(html);
    if (result) return result;

    // Strategy 2: 3schools.in obfuscated quiz ({question:..., options:[...], answer:N})
    const obfuscated = extractFromObfuscated(html);
    if (obfuscated) return obfuscated;

    // Strategy 3: HTML radio-button form + answer object (const answers = {q1:"a",...})
    const formBased = extractFromHtmlForm(html);
    if (formBased) return formBased;

    return null;
}

// Strategy 1: JS array variables
function extractFromJsArrays(html) {
    const correctAnswersMatch = html.match(/(?:const|let|var)\s+correctAnswers\s*=\s*(\[[\s\S]*?\]);/);
    const correctIndicesMatch = html.match(/(?:const|let|var)\s+correctIndices\s*=\s*(\[[\s\S]*?\]);/);

    const candidates = [];
    const varRegex = /(?:const|let|var)\s+(\w+)\s*=\s*\[/g;
    let varMatch;
    while ((varMatch = varRegex.exec(html)) !== null) {
        const name = varMatch[1];
        if (/^(correctAnswers|correctIndices|labels|colors|categories|months|monthFormat|days|options|M|p)$/i.test(name)) continue;
        candidates.push({ name, index: varMatch.index });
    }

    const quizNameScore = (name) => {
        const n = name.toLowerCase();
        if (n === 'tamilquizdata') return 10;
        if (n.includes('quiz')) return 8;
        if (n.includes('question')) return 7;
        if (n.endsWith('data')) return 6;
        return 1;
    };
    candidates.sort((a, b) => quizNameScore(b.name) - quizNameScore(a.name));

    for (const candidate of candidates) {
        try {
            const fromVar = html.substring(candidate.index);
            const arrayMatch = fromVar.match(/(?:const|let|var)\s+\w+\s*=\s*(\[[\s\S]*?\]);/);
            if (!arrayMatch) continue;

            const context = {};
            vm.createContext(context);
            const questions = vm.runInContext(`const d = ${arrayMatch[1]}; d;`, context);

            if (!Array.isArray(questions) || questions.length === 0) continue;

            const first = questions[0];

            // Format A: { q, a: [...], c }
            if (first.q && Array.isArray(first.a)) {
                if (correctIndicesMatch) {
                    const indices = vm.runInContext(`const d = ${correctIndicesMatch[1]}; d;`, vm.createContext({}));
                    questions.forEach((q, i) => { if (q.c === undefined && indices[i] !== undefined) q.c = indices[i]; });
                }
                return questions;
            }

            // Format B: { q, options: [...], a: N } (e.g. biturls.net quizzes)
            if (first.q && Array.isArray(first.options) && typeof first.a === 'number') {
                return questions.map(q => ({ q: q.q, a: q.options, c: q.a }));
            }

            // Format B1: { q, o: [...], a: N } (e.g. biturls.net advanced psychology)
            if (first.q && Array.isArray(first.o) && typeof first.a === 'number') {
                return questions.map(q => ({ q: q.q, a: q.o, c: q.a }));
            }

            // Format B2: { q, options: [...], correct: N } (e.g. zealstudy tamilQuiz, psychologyData)
            if (first.q && Array.isArray(first.options) && typeof first.correct === 'number') {
                return questions.map(q => ({ q: q.q, a: q.options, c: q.correct }));
            }

            // Format B3: { q_en, q_ta, opts_en: [...], opts_ta: [...], correct: N } (bilingual)
            if (first.q_en && first.q_ta && Array.isArray(first.opts_en) && Array.isArray(first.opts_ta)) {
                return questions.map(q => ({
                    q: q.q_ta + ' / ' + q.q_en,
                    a: q.opts_ta.map((t, i) => t + ' / ' + (q.opts_en[i] || '')),
                    c: typeof q.correct === 'number' ? q.correct : 0
                }));
            }

            // Format C: { q, a: "str", b: "str", c: "str", d: "str" } with correctAnswers
            if (first.q && typeof first.a === 'string') {
                let answerKeys = null;
                if (correctAnswersMatch) {
                    answerKeys = vm.runInContext(`const d = ${correctAnswersMatch[1]}; d;`, vm.createContext({}));
                }
                const letterToIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
                const converted = questions.map((q, i) => {
                    const opts = ['a', 'b', 'c', 'd'].map(key => q[key]).filter(Boolean)
                        .map(opt => typeof opt === 'string' ? opt.replace(/^[A-Da-d][\.\)]\s*/, '') : opt);
                    let correctIdx = 0;
                    if (answerKeys && answerKeys[i]) correctIdx = letterToIndex[answerKeys[i].toUpperCase()] ?? 0;
                    return { q: q.q, a: opts, c: correctIdx };
                });
                if (converted.length > 0 && converted[0].a.length >= 2) return converted;
            }

            // Format D: { question, options: [...], answer: N } (clean non-obfuscated)
            if (first.question && Array.isArray(first.options) && typeof first.answer === 'number') {
                return questions.map(q => ({
                    q: q.question,
                    a: q.options.map(o => typeof o === 'string' ? o.replace(/^[A-Da-d][\)\.\]]\s*/, '') : o),
                    c: q.answer
                }));
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

// Strategy 2: 3schools.in / template-literal quiz engine
function extractFromObfuscated(html) {
    // These sites embed quiz data as [{question:`...`, options:[`A)...`,...], answer:N}]
    // using backtick template literals (or sometimes quotes).
    const matches = [];
    // Match {question: `...` or "..." or '...',  options: [...], answer: N}
    const regex = /\{\s*question\s*:\s*[`'"]([\s\S]*?)[`'"]\s*,\s*options\s*:\s*\[([\s\S]*?)\]\s*,\s*answer\s*:\s*(\d+)\s*\}/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
        try {
            const qText = m[1].trim().replace(/^\.\s*/, '');
            const optsRaw = m[2];
            // Parse options from any quote style: `A) foo`, "B) bar", 'C) baz'
            const opts = [];
            const optRegex = /[`'"]([\s\S]*?)[`'"]/g;
            let optM;
            while ((optM = optRegex.exec(optsRaw)) !== null) {
                const cleaned = optM[1].trim().replace(/^\(?[A-Da-d]\)[\s.]*/, '');
                if (cleaned) opts.push(cleaned);
            }
            if (opts.length >= 2) {
                matches.push({ q: qText, a: opts, c: parseInt(m[3]) });
            }
        } catch (e) { continue; }
    }
    return matches.length > 0 ? matches : null;
}

// Strategy 3: HTML form with radio buttons + answer object
function extractFromHtmlForm(html) {
    // Find the answer key object: const answers = { q1: "a", q2: "b", ... }
    const answersMatch = html.match(/(?:const|let|var)\s+answers\s*=\s*\{([\s\S]*?)\};/);
    if (!answersMatch) return null;

    // Parse the answers object
    const answerMap = {};
    const pairRegex = /(\w+)\s*:\s*"(\w)"/g;
    let pm;
    while ((pm = pairRegex.exec(answersMatch[1])) !== null) {
        answerMap[pm[1]] = pm[2]; // e.g. { q1: "a", q2: "b", p3q1: "a" }
    }
    if (Object.keys(answerMap).length === 0) return null;

    // Extract questions from HTML — look for q-text divs or labels with question text
    // Pattern 1: <div class="q-text">1. question?</div> followed by radio labels
    const questions = [];
    // Find all question blocks — they use <div class="q-text"> or <p class="q-text">
    const qTextRegex = /<(?:div|p)[^>]*class=["'][^"']*q-text[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/gi;
    const qBlocks = [];
    let qm;
    while ((qm = qTextRegex.exec(html)) !== null) {
        qBlocks.push({ text: qm[1], index: qm.index });
    }

    if (qBlocks.length === 0) return null;

    // For each question, find the radio button options that follow it
    const sortedKeys = Object.keys(answerMap).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''));
        const numB = parseInt(b.replace(/\D/g, ''));
        return numA - numB;
    });

    for (let i = 0; i < qBlocks.length; i++) {
        const qHtml = qBlocks[i].text.replace(/<[^>]+>/g, '').trim();
        // Clean question number prefix
        const qText = qHtml.replace(/^\d+[\.\)\]]\s*/, '');
        if (!qText) continue;

        // Find radio options between this question and the next
        const startIdx = qBlocks[i].index;
        const endIdx = i + 1 < qBlocks.length ? qBlocks[i + 1].index : startIdx + 5000;
        const section = html.substring(startIdx, endIdx);

        // Extract radio button labels
        const opts = [];
        const labelRegex = /<label[^>]*>([\s\S]*?)<\/label>/gi;
        let lm;
        while ((lm = labelRegex.exec(section)) !== null) {
            const labelText = lm[1].replace(/<[^>]+>/g, '').trim();
            if (labelText) opts.push(labelText.replace(/^[A-Da-d][\)\.\]]\s*/, ''));
        }

        if (opts.length < 2) continue;

        // Get correct answer from answer map
        const ansKey = sortedKeys[i];
        const letterToIndex = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
        const correctIdx = ansKey ? (letterToIndex[answerMap[ansKey]] ?? 0) : 0;

        questions.push({ q: qText, a: opts, c: correctIdx });
    }

    return questions.length > 0 ? questions : null;
}

// ── GPT-5 fallback extraction ──
async function extractViaGPT(html) {
    console.log('[GPT-5 Fallback] Regex failed, using GPT-5 to extract quiz data...');

    // Strip non-essential HTML to reduce tokens — keep only script tags and body content
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    // Send script blocks (where quiz data usually lives) + trimmed body
    let contentForGPT = scriptBlocks.join('\n\n');
    if (bodyMatch) {
        // Strip large irrelevant parts, keep text content
        const bodyText = bodyMatch[1]
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 8000);
        contentForGPT += '\n\nPage text content:\n' + bodyText;
    }

    // Limit to ~30k chars to stay within token limits
    contentForGPT = contentForGPT.substring(0, 30000);

    const response = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
            {
                role: 'system',
                content: `You are a quiz data extractor. Extract all quiz questions from the given HTML page content.
Return ONLY a valid JSON array with this exact format, no other text:
[{"q": "question text", "a": ["option A", "option B", "option C", "option D"], "c": 0}]
Where "c" is the 0-based index of the correct answer.
Extract ALL questions. Preserve the original language (may be Tamil or English).`
            },
            {
                role: 'user',
                content: contentForGPT
            }
        ],
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Handle both {questions: [...]} and direct array formats
    const quizArray = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.quiz || parsed.data);

    if (!Array.isArray(quizArray) || quizArray.length === 0) {
        throw new Error('GPT-5 could not extract quiz questions from this page');
    }

    // Validate structure
    const validated = quizArray.filter(q => q.q && Array.isArray(q.a) && typeof q.c === 'number');
    if (validated.length === 0) {
        throw new Error('GPT-5 returned invalid quiz format');
    }

    console.log(`[GPT-5 Fallback] Successfully extracted ${validated.length} questions`);
    return validated;
}

app.get('/api/extract', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No URL provided" });

    try {
        const fetchRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            }
        });
        const html = await fetchRes.text();
        const title = extractTitle(html);

        // Try regex first (fast, free)
        let result = extractViaRegex(html);
        let method = 'regex';

        // Fallback to GPT-5 if regex fails
        if (!result) {
            result = await extractViaGPT(html);
            method = 'gpt5';
        }

        console.log(`[Extract] "${title}" — ${result.length} questions via ${method}`);
        return res.json({ success: true, quiz: result, title, method });
    } catch (err) {
        console.error("Extraction error:", err);
        return res.status(500).json({ error: "Failed to extract data: " + err.message });
    }
});

// ── Batch extract endpoint ──
app.post('/api/batch-extract', async (req, res) => {
    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "No URLs provided" });
    }

    const results = [];
    for (const targetUrl of urls) {
        try {
            const fetchRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            const html = await fetchRes.text();
            const title = extractTitle(html);
            let quiz = extractViaRegex(html);
            let method = 'regex';

            if (!quiz) {
                try {
                    quiz = await extractViaGPT(html);
                    method = 'gpt5';
                } catch (gptErr) {
                    results.push({ url: targetUrl, success: false, error: gptErr.message });
                    continue;
                }
            }

            console.log(`[Batch] "${title}" — ${quiz.length} questions via ${method}`);
            results.push({ url: targetUrl, success: true, quiz, title, method });
        } catch (err) {
            console.error(`[Batch] Failed: ${targetUrl}`, err.message);
            results.push({ url: targetUrl, success: false, error: err.message });
        }
    }

    return res.json({ results });
});

// SPA catch-all: serve index.html for all non-API, non-static routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Local dev: listen on port. Vercel: export the app.
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}
