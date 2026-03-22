// Native fetch used in Node 18+

async function testLink(url) {
    console.log(`Testing: ${url}`);
    try {
        const res = await fetch(`http://localhost:3000/api/extract?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data.success) {
            console.log(`✅ Success: Found ${data.quiz.length} questions for "${data.title}"`);
        } else {
            console.log(`❌ Failed: ${data.error}`);
        }
    } catch (err) {
        console.log(`❌ Error: ${err.message}`);
    }
}

const links = [
    "https://www.zealstudy.me/2026/03/zeal-study-tntet-2026-tamil-quiz-model.html",
    "https://www.zealstudy.me/2026/02/tntet-2026-50-online-full-test-1.html",
    "https://www.zealstudy.me/2026/03/zeal-study-tntet-2026-3-1-3-50-online.html"
];

async function run() {
    for (const link of links) {
        await testLink(link);
    }
}

run();
