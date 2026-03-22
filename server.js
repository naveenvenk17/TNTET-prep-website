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
    // Strategy: find any const/let/var that assigns an array of objects containing quiz questions.
    // Multiple variable naming conventions exist across quiz sites:
    //   tamilQuizData, psychologyData, quizData, ecoData, aliceData, englishData,
    //   socialQuestions, psychologyQuestions, tamilQuestions, questions, etc.

    // Look for separate answer arrays that may need to be merged
    const correctAnswersMatch = html.match(/(?:const|let|var)\s+correctAnswers\s*=\s*(\[[\s\S]*?\]);/);
    const correctIndicesMatch = html.match(/(?:const|let|var)\s+correctIndices\s*=\s*(\[[\s\S]*?\]);/);

    // Collect all variable candidates that look like quiz arrays
    const candidates = [];
    const varRegex = /(?:const|let|var)\s+(\w+)\s*=\s*\[/g;
    let varMatch;
    while ((varMatch = varRegex.exec(html)) !== null) {
        const name = varMatch[1];
        // Skip non-quiz variables (correctAnswers, correctIndices, known non-quiz vars)
        if (/^(correctAnswers|correctIndices|labels|colors|categories|months|days|options)$/i.test(name)) continue;
        candidates.push({ name, index: varMatch.index });
    }

    // Try each candidate, prioritizing ones with quiz-like names
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
            // Extract the array for this variable
            const fromVar = html.substring(candidate.index);
            const arrayMatch = fromVar.match(/(?:const|let|var)\s+\w+\s*=\s*(\[[\s\S]*?\]);/);
            if (!arrayMatch) continue;

            const context = {};
            vm.createContext(context);
            const questions = vm.runInContext(`const d = ${arrayMatch[1]}; d;`, context);

            if (!Array.isArray(questions) || questions.length === 0) continue;
            if (!questions[0].q) continue; // Must have a question field

            // Format A: standard { q, a: [...], c } — may need correctIndices merged
            if (Array.isArray(questions[0].a)) {
                if (correctIndicesMatch) {
                    const indices = vm.runInContext(`const d = ${correctIndicesMatch[1]}; d;`, vm.createContext({}));
                    questions.forEach((q, i) => {
                        if (q.c === undefined && indices[i] !== undefined) q.c = indices[i];
                    });
                }
                if (questions[0].q && questions[0].a) return questions;
            }

            // Format B: { q, a: "A. opt", b: "B. opt", c: "C. opt", d: "D. opt" } with correctAnswers
            if (typeof questions[0].a === 'string') {
                let answerKeys = null;
                if (correctAnswersMatch) {
                    answerKeys = vm.runInContext(`const d = ${correctAnswersMatch[1]}; d;`, vm.createContext({}));
                }
                const letterToIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

                const converted = questions.map((q, i) => {
                    // Strip leading "A. ", "B. " etc. from options
                    const opts = ['a', 'b', 'c', 'd']
                        .map(key => q[key])
                        .filter(Boolean)
                        .map(opt => typeof opt === 'string' ? opt.replace(/^[A-Da-d][\.\)]\s*/, '') : opt);

                    let correctIdx = 0;
                    if (answerKeys && answerKeys[i]) {
                        correctIdx = letterToIndex[answerKeys[i].toUpperCase()] ?? 0;
                    }

                    return { q: q.q, a: opts, c: correctIdx };
                });

                if (converted.length > 0 && converted[0].a.length >= 2) return converted;
            }
        } catch (e) {
            // This candidate failed to parse, try next
            continue;
        }
    }

    return null;
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

// Local dev: listen on port. Vercel: export the app.
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}
