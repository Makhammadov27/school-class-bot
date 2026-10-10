import { GoogleGenAI } from "@google/genai";
import { config } from "../config/config.js";
import { prisma } from "../database/prisma.js";
import { QUESTION_BANK_GRADE_6 } from "./questionBank.js";

export const GRADE_6_SUBJECTS = [
  "Ona tili",
  "Adabiyot",
  "Matematika",
  "Tarix",
  "Ingliz tili",
  "Rus tili",
  "Informatika",
  "Geografiya",
  "Botanika",
  "Fizika",
  "Texnologiya",
];

/**
 * Initialize Gemini client
 */
function getAiClient() {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY .env faylida ko'rsatilmagan!");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Fisher-Yates shuffle options of a question and recalculate correctIndex
 * Ensures A, B, C, D have equal 25% distribution across all questions
 * @param {{ text: string, options: string[] | string, correctIndex: number }} q
 */
export function shuffleQuestion(q) {
  const options = Array.isArray(q.options) ? [...q.options] : JSON.parse(q.options);
  const correctOption = options[q.correctIndex !== undefined ? q.correctIndex : 0];

  // Fisher-Yates shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const newCorrectIndex = options.indexOf(correctOption);

  return {
    ...q,
    options: options,
    correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0,
  };
}

/**
 * Generate 15 multiple-choice questions for 6th grade using Gemini AI
 * @param {string} subject
 * @returns {Promise<{ subject: string, title: string, questions: Array<{ text: string, options: string[], correctIndex: number }> }>}
 */
export async function generateQuizByAI(subject) {
  const ai = getAiClient();

  const prompt = `
Siz O'zbekiston umumta'lim maktablarining 6-sinf darsliklari bo'yicha yetakchi metodist va o'qituvchisiz.
Sizning vazifangiz: 6-sinf "${subject}" fani darsligi asosida o'quvchilar uchun aynan 15 ta sifatli, aniq va darslik mazmuniga mos test savollarini tuzish.

TALABLAR:
1. Savollar faqat va faqat O'zbekiston 6-sinf "${subject}" darsligi mavzulariga oid bo'lishi shart!
2. Jami SAVOLLAR SONI: aynan 15 ta bo'lsin.
3. Har bir savolda 4 ta variant (A, B, C, D) bo'lsin.
4. JUDA MUHIM: To'g'ri javob (correctIndex) 15 ta savol bo'ylab A (0), B (1), C (2) va D (3) variantlarga TENG va TASODIFIY taqsimlansin! Barcha yoki ko'pchilik savollarning to'g'ri javobi faqat bitta variant (A) bo'lib qolmasin.
5. Javobni FAQAT quyidagi JSON formatida qaytaring, hech qanday qo'shimcha so'z yoki markdown belgilarisiz:

{
  "subject": "${subject}",
  "title": "6-sinf ${subject} fani bo'yicha haftalik test",
  "questions": [
    {
      "text": "Savol matni?",
      "options": ["Variant 1", "Variant 2", "Variant 3", "Variant 4"],
      "correctIndex": 2
    }
  ]
}
`;

  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
  ];

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text.trim();
      const quizData = JSON.parse(responseText);

      if (quizData.questions && quizData.questions.length > 0) {
        quizData.questions = quizData.questions.map(shuffleQuestion);
        return quizData;
      }
    } catch (err) {
      console.warn(`Model ${modelName} bilan xatolik yuz berdi: ${err.message}. Keyingi model sinab ko'rilmoqda...`);
      lastError = err;
    }
  }

  // Fallback if AI provider is blocked by location (e.g. Uzbekistan datacenter IP) or temporarily down
  console.log(`⚠️ AI server cheklovi (User location / 503) sababli 6-sinf "${subject}" darslik testlar bazasidan 15 ta savol olindi.`);
  const rawFallback = QUESTION_BANK_GRADE_6[subject] || QUESTION_BANK_GRADE_6["Matematika"];
  const fallbackQuestions = rawFallback.map(shuffleQuestion);
  return {
    subject,
    title: `6-sinf ${subject} fani bo'yicha haftalik test`,
    questions: fallbackQuestions,
  };
}

/**
 * Get next subject in rotation based on recent quizzes in database
 */
export async function getNextSubjectInRotation() {
  const lastQuiz = await prisma.quiz.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!lastQuiz) {
    return GRADE_6_SUBJECTS[0]; // Start with Ona tili
  }

  const lastIndex = GRADE_6_SUBJECTS.indexOf(lastQuiz.subject);
  if (lastIndex === -1 || lastIndex === GRADE_6_SUBJECTS.length - 1) {
    return GRADE_6_SUBJECTS[0]; // Loop back to start
  }

  return GRADE_6_SUBJECTS[lastIndex + 1];
}

/**
 * Generate, save to DB, and broadcast an AI Quiz
 * @param {string} subject - Specific subject or null for next rotation
 * @param {number} durationHours - Duration until deadline (e.g. 48 for 2 days)
 * @param {import("grammy").Bot} bot - Telegram bot instance
 */
export async function createAndPublishAiQuiz(subject = null, durationHours = 48, bot = null) {
  const chosenSubject = subject || (await getNextSubjectInRotation());
  console.log(`🤖 AI 6-sinf "${chosenSubject}" fani uchun 15 talik test tuzmoqda...`);

  const quizData = await generateQuizByAI(chosenSubject);

  const deadline = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  // Format questions for Prisma with guaranteed random option distribution
  const questionsData = quizData.questions.map(shuffleQuestion).map((q) => ({
    text: q.text,
    options: JSON.stringify(q.options),
    correctIndex: q.correctIndex,
  }));

  // Save Quiz into Database
  const createdQuiz = await prisma.quiz.create({
    data: {
      subject: quizData.subject,
      title: quizData.title,
      durationMinutes: 0,
      deadline: deadline,
      isActive: true,
      questions: {
        create: questionsData,
      },
    },
  });

  console.log(`✅ Yangi AI test saqlandi: [${createdQuiz.subject}] ${createdQuiz.title} (ID: ${createdQuiz.id})`);

  // Broadcast to students if bot instance provided
  if (bot) {
    const students = await prisma.student.findMany({
      where: { telegramId: { not: null } },
    });

    const notifyText =
      `🤖 <b>YANGI HAFTALIK TEST YUKLANDI!</b>\n\n` +
      `📚 Fan: <b>${createdQuiz.subject}</b> (6-sinf darsligi)\n` +
      `📌 Mavzu: <b>${createdQuiz.title}</b>\n` +
      `❓ Savollar soni: <b>15 ta</b>\n` +
      `⏳ Topshirish muddati: <b>${deadline.toLocaleString("uz-UZ")}</b> gacha\n\n` +
      `<i>Testni yechish uchun botdagi "📝 Mavjud Testlar" tugmasini bosing! Har bir to'g'ri javob uchun +10 ball beriladi.</i>`;

    for (const st of students) {
      if (st.telegramId) {
        try {
          await bot.api.sendMessage(st.telegramId, notifyText, {
            parse_mode: "HTML",
          });
        } catch (e) {}
      }
    }

    // Notify admins
    for (const adminId of config.adminIds) {
      try {
        await bot.api.sendMessage(
          adminId,
          `🤖 <b>AI tomonidan yangi test e'lon qilindi:</b>\n\n` +
          `📚 Fan: <b>${createdQuiz.subject}</b>\n` +
          `📌 Nomi: <b>${createdQuiz.title}</b>\n` +
          `❓ Savollar: <b>15 ta</b>\n` +
          `⏳ Yopilish vaqti: <b>${deadline.toLocaleString("uz-UZ")}</b>`,
          { parse_mode: "HTML" }
        );
      } catch (e) {}
    }
  }

  return createdQuiz;
}

/**
 * AI Repetitor / Savol-javob yordamchisi (Gemini Chat)
 * Maktab o'quvchilari (xususan 6-sinf) uchun savollarga aniq, tushunarli va do'stona javob beradi.
 * @param {string} question - O'quvchi yoki admin yozgan savol
 * @param {string} [userName] - Foydalanuvchi ismi
 * @returns {Promise<string>}
 */
export async function askAiTutor(question, userName = "O'quvchi") {
  const ai = getAiClient();

  const systemInstruction = `
Siz O'zbekiston maktablarining 6-sinf o'quvchilari uchun mo'ljallangan samimiy, dono va sabrli "AI Repetitor" — virtual ustozsiz.
Sizning vazifangiz: o'quvchining har qanday maktab fani (Matematika, Ona tili, Adabiyot, Fizika, Informatika, Tarix, Ingliz tili, Geografiya, Biologiya va boshqalar) bo'yicha bergan savoliga tushunarli, aniq va bosqichma-bosqich qilib javob berish.

TALABLAR:
1. Til: Sof va chiroyli o'zbek tilida (lotin alifbosida).
2. Uslub: Mehribon ustoz kabi do'stona, rag'batlantiruvchi va 6-sinf bolasi tushunadigan sodda tilda tushuntiring.
3. Agar misol yoki masala bo'lsa: darhol faqat javobni aytib qo'ymang, balki qadamma-qadam (1-qadam, 2-qadam...) yechilish usulini va qoidasini ko'rsating.
4. Xabarni Telegram uchun qulay, o'qilishi oson formatda yozing (emojilar, qalin matnlar, punktlar).
5. O'quvchining ismi: ${userName}.
`;

  // Tezkor va yuklamasi kam bo'lgan modellar birinchi navbatda
  const modelsToTry = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
  ];

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      // 12 soniyalik timeout - bitta modelda qotib qolmasligi uchun
      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: [
          { role: "user", parts: [{ text: `${systemInstruction}\n\nO'quvchi savoli:\n"${question}"` }] },
        ],
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout (12s)")), 12000)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const text = response?.text?.trim();
      if (text) {
        return text;
      }
    } catch (err) {
      console.warn(`AI Repetitor [${modelName}] tezkor o'tish: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(
    lastError ? lastError.message : "AI Repetitor javob bera olmadi. Iltimos, keyinroq qayta urinib ko'ring."
  );
}