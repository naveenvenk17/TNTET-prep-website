async function run() {
    const res = await fetch("http://localhost:3000/api/extract?url=https://www.zealstudy.me/2026/03/zeal-study-tntet-2026-tamil-quiz-model.html");
    const data = await res.json();
    console.log("Success:", data.success);
    if (data.quiz && data.quiz.length > 0) {
        console.log("Found", data.quiz.length, "questions!");
        console.log("First question:", data.quiz[0].q);
    } else {
        console.log("Data:", data);
    }
}
run();
