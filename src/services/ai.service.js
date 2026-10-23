import { GoogleGenAI } from "@google/genai";
import { config } from "../config/config.js";
import { prisma } from "../database/prisma.js";

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

const QUIZ_STYLES = [
  "hayotiy vaziyatga asoslangan masalalar",
  "mantiqiy fikrlash va sabab-oqibatni topish",
  "xatoni aniqlash va to'g'ri qoida bilan tuzatish",
  "tushuncha va misollarni farqlash",
  "qisqa matn yoki berilgan ma'lumotni tahlil qilish",
  "osondan murakkabga qarab aralash savollar",
];

const QUESTION_STOP_WORDS = new Set([
  "bu", "va", "yoki", "ham", "bilan", "uchun", "qaysi", "qanday", "necha", "nima",
  "toping", "aniqlang", "hisoblang", "bo'ladi", "bo'lsa", "haqida", "ekan", "eng",
]);

function normalizeQuestion(text) {
  return String(text)
    .toLocaleLowerCase("uz-UZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function questionTerms(text) {
  return new Set(
    normalizeQuestion(text)
      .split(" ")
      .filter((term) => term.length > 2 && !QUESTION_STOP_WORDS.has(term)),
  );
}

function isTooSimilar(question, previousQuestions) {
  const terms = questionTerms(question);
  if (!terms.size) return false;

  return previousQuestions.some((previous) => {
    const previousNormalized = normalizeQuestion(previous);
    if (normalizeQuestion(question) === previousNormalized) return true;

    const previousTerms = questionTerms(previous);
    if (!previousTerms.size) return false;
    const intersection = [...terms].filter((term) => previousTerms.has(term)).length;
    const union = new Set([...terms, ...previousTerms]).size;
    return union > 4 && intersection / union >= 0.8;
  });
}

export function validateGeneratedQuiz(quizData, subject, previousQuestions = []) {
  if (!quizData || quizData.subject !== subject || typeof quizData.title !== "string" || !quizData.title.trim()) {
    throw new Error("Test sarlavhasi yoki fan nomi noto'g'ri.");
  }
  if (!Array.isArray(quizData.questions) || quizData.questions.length !== 15) {
    throw new Error("AI aynan 15 ta savol yaratmadi.");
  }

  const seenQuestions = [];
  for (const [index, question] of quizData.questions.entries()) {
    if (
      !question ||
      typeof question.text !== "string" ||
      !question.text.trim() ||
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      question.options.some((option) => typeof option !== "string" || !option.trim()) ||
      new Set(question.options.map((option) => normalizeQuestion(option))).size !== 4 ||
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex > 3
    ) {
      throw new Error(`${index + 1}-savol formati noto'g'ri.`);
    }

    if (isTooSimilar(question.text, [...seenQuestions, ...previousQuestions])) {
      throw new Error(`${index + 1}-savol oldingi testdagi savolga juda o'xshash.`);
    }
    seenQuestions.push(question.text);
  }
  return quizData;
}

function buildQuizPrompt(subject, recentQuizzes, style) {
  const recentQuestionTexts = recentQuizzes
    .flatMap((quiz) => quiz.questions.map((question) => question.text))
    .filter(Boolean)
    .slice(0, 60)
    .map((question) => question.slice(0, 250));

  return `
Siz O'zbekiston umumta'lim maktablarining 6-sinf darsliklari bo'yicha yetakchi metodist va o'qituvchisiz.
6-sinf "${subject}" fani bo'yicha o'quvchilarga aynan 15 ta yangi va sifatli test savoli tuzing.

BU HAFTANING USLUBI: ${style}.

TALABLAR:
1. Faqat O'zbekiston 6-sinf "${subject}" darsligi doirasidagi tushunchalardan foydalaning. Mavzudan tashqari faktlarni o'ylab topmang.
2. Savollar faqat yodlashga emas, tushunish, qo'llash va fikrlashga ham yo'naltirilsin.
3. Oldingi savollarni aynan takrorlamang va boshqa so'zlar bilan qayta yozmang. Imkon qadar boshqa mavzu, ko'nikma va vaziyatlardan foydalaning.
4. Savollar oldingi testdagilarga o'xshamasin. Oldingi savollar:
${JSON.stringify(recentQuestionTexts)}
5. Aynan 15 ta savol, har birida mazmunan farqli 4 ta javob varianti bo'lsin; to'g'ri javob indeksi 0 dan 3 gacha butun son bo'lsin.
6. To'g'ri javoblar indeksini test bo'ylab muvozanatli taqsimlang.
7. Har hafta uslub va savol shakllarini o'zgartiring; savollar aniq, yoshga mos va bir ma'noli bo'lsin.
8. Javobni faqat quyidagi JSON shaklida qaytaring:
{
  "subject": "${subject}",
  "title": "6-sinf ${subject} haftalik testi — ${style}",
  "questions": [
    { "text": "Savol?", "options": ["A", "B", "C", "D"], "correctIndex": 0 }
  ]
}
`;
}

async function getRecentQuizHistory(subject) {
  const quizzes = await prisma.quiz.findMany({
    where: { subject },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: {
      title: true,
      questions: { select: { text: true } },
    },
  });
  return quizzes;
}

/**
 * Generate 15 multiple-choice questions for 6th grade using Gemini AI
 * @param {string} subject
 * @returns {Promise<{ subject: string, title: string, questions: Array<{ text: string, options: string[], correctIndex: number }> }>}
 */
export async function generateQuizByAI(subject) {
  const ai = getAiClient();
  const recentQuizzes = await getRecentQuizHistory(subject);
  const previousQuestions = recentQuizzes.flatMap((quiz) => quiz.questions.map((question) => question.text));
  const unusedStyles = QUIZ_STYLES.filter((candidate) =>
    !recentQuizzes.some((quiz) => quiz.title?.includes(candidate)),
  );
  const availableStyles = unusedStyles.length ? unusedStyles : QUIZ_STYLES;
  const style = availableStyles[Math.floor(Math.random() * availableStyles.length)];
  const prompt = buildQuizPrompt(subject, recentQuizzes, style);

  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
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

      return validateGeneratedQuiz(quizData, subject, previousQuestions);
    } catch (err) {
      console.warn(`Model ${modelName} bilan xatolik yuz berdi: ${err.message}. Keyingi model sinab ko'rilmoqda...`);
      lastError = err;
    }
  }

  throw new Error(
    `Yangi test yaratilmadi: AI javobi oldingi testlarga o'xshadi yoki yaroqsiz bo'ldi. ${lastError?.message || "AI xizmatiga ulanishni tekshiring."}`,
  );
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
