import { generateQuizByAI } from "../src/services/ai.service.js";

async function run() {
  console.log("Gemini 3.8 orqali 6-sinf Matematika testini sinash...");
  const quiz = await generateQuizByAI("Matematika");
  console.log(`✅ ${quiz.subject} fani uchun ${quiz.questions.length} ta savol muvaffaqiyatli tuzildi!`);
  console.log("1-savol:", quiz.questions[0].text);
}

run();