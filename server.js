const express = require('express');
const cors = require('cors');
const vm = require('vm');
require('dotenv').config();
const OpenAI = require('openai');
const app = express();
const port = 3000;

const openai = new OpenAI({ apiKey: process.env.openai_api });

app.use(cors());
app.use(express.static('public'));
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
    const match = html.match(/const\s+tamilQuizData\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return null;

    const context = {};
    vm.createContext(context);
    const result = vm.runInContext(`const data = ${match[1]}; data;`, context);
    return result;
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
