const express = require('express');
const cors = require('cors');
const vm = require('vm');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

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

        // Extract Title from HTML
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        let title = titleMatch ? titleMatch[1].trim() : "Untitled Quiz";
        title = title.replace(/Zeal study/gi, "").replace(/TNTET 2026:/gi, "").trim();

        // The quiz questions are embedded inside the tamilQuizData array
        const match = html.match(/const\s+tamilQuizData\s*=\s*(\[[\s\S]*?\]);/);
        if (!match) {
             return res.status(404).json({ error: "Could not find 'tamilQuizData' array in the given URL." });
        }

        // Safe evaluation
        const context = {};
        vm.createContext(context);
        const scriptCode = `const data = ${match[1]}; data;`;
        const result = vm.runInContext(scriptCode, context);

        return res.json({ success: true, quiz: result, title });
    } catch (err) {
        console.error("Extraction error:", err);
        return res.status(500).json({ error: "Failed to extract data: " + err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
