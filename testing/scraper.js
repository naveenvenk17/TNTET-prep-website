const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeQuiz(url) {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    console.log(`Navigating to ${url}...`);
    // Wait for network to be idle to ensure dynamic content loads
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log("Waiting for a few seconds just in case...");
    await new Promise(r => setTimeout(r, 5000));
    
    console.log("Extracting HTML...");
    const html = await page.content();
    fs.writeFileSync('rendered_quiz.html', html);
    
    console.log("Done. Saved to rendered_quiz.html");
    await browser.close();
}

scrapeQuiz('https://www.zealstudy.me/2026/03/zeal-study-tntet-2026-tamil-quiz-model.html').catch(console.error);
