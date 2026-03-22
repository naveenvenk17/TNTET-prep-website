const fs = require('fs');
const text = fs.readFileSync('target_script.js', 'utf8');
const match = text.match(/const\s+tamilQuizData\s*=\s*(\[[\s\S]*?\]);/);
if (match) {
    fs.writeFileSync('tamilQuizData.json', match[1]);
    console.log("Extracted to tamilQuizData.json");
} else {
    console.log("Could not find tamilQuizData");
}
