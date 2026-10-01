import { prisma } from "../../database/prisma.js";
import { config } from "../../config/config.js";
import { InlineKeyboard } from "grammy";

// In-memory active quiz sessions for students: Map<`studentId_quizId`, { currentQuestionIndex, answers: [] }>
const activeStudentSessions = new Map();

/**
 * Show available quizzes for the student
 * @param {import("grammy").Context} ctx
 */
export async function showAvailableQuizzes(ctx) {
  const userId = String(ctx.from.id);
  const student = await prisma.student.findUnique({
    where: { telegramId: userId },
    include: { quizSubmissions: true },
  });

  if (!student) {
    return ctx.reply("❌ Siz o'quvchi sifatida ro'yxatdan o'tmagansiz.");
  }

  const now = new Date();
  const submittedQuizIds = student.quizSubmissions.map((s) => s.quizId);

  // Find active quizzes not submitted yet
  const availableQuizzes = await prisma.quiz.findMany({
    where: {
      isActive: true,
      id: { notIn: submittedQuizIds },
      OR: [
        { deadline: null },
        { deadline: { gt: now } },
      ],
    },
    include: { questions: true },
    orderBy: { createdAt: "desc" },
  });

  if (availableQuizzes.length === 0) {
    return ctx.reply(
      "📝 <b>Hozirda topshirilishi kerak bo'lgan yangi testlar mavjud emas.</b>\n\n" +
      "Barcha mavjud testlarni ishlab bo'lgansiz yoki yangi testlar yuklanmagan.",
      { parse_mode: "HTML" }
    );
  }

  let text = "📝 <b>TOPShIRISh UChUN MAVJUD TESTLAR:</b>\n\n";
  const keyboard = new InlineKeyboard();

  availableQuizzes.forEach((quiz, idx) => {
    const deadlineText = quiz.deadline
      ? `⏳ Muddat: ${new Date(quiz.deadline).toLocaleString("uz-UZ")} gacha`
      : "⏳ Muddat: Cheklanmagan";

    text += `<b>${idx + 1}. [${quiz.subject}] ${quiz.title}</b>\n` +
      `   └ Savollar: ${quiz.questions.length} ta\n` +
      `   └ ${deadlineText}\n\n`;

    keyboard.text(`▶️ ${quiz.title} (${quiz.subject})`, `start_test:${quiz.id}`).row();
  });

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Start taking a quiz
 * @param {import("grammy").Context} ctx
 */
export async function startQuizCallback(ctx) {
  const quizId = parseInt(ctx.callbackQuery.data.split(":")[1], 10);
  const userId = String(ctx.from.id);

  const student = await prisma.student.findUnique({
    where: { telegramId: userId },
  });

  if (!student) {
    return ctx.answerCallbackQuery({ text: "O'quvchi topilmadi!", show_alert: true });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: true },
  });

  if (!quiz || !quiz.isActive || (quiz.deadline && quiz.deadline <= new Date())) {
    return ctx.answerCallbackQuery({ text: "Bu test yopilgan yoki mavjud emas!", show_alert: true });
  }

  if (!quiz.questions.length) return ctx.answerCallbackQuery({ text: "Testda savollar mavjud emas!", show_alert: true });

  // Check if already submitted
  const existingSub = await prisma.quizSubmission.findUnique({
    where: {
      quizId_studentId: {
        quizId,
        studentId: student.id,
      },
    },
  });

  if (existingSub) {
    return ctx.answerCallbackQuery({ text: "Siz bu testni allaqachon topshirgansiz!", show_alert: true });
  }

  // Initialize session with dynamically randomized options for this student
  const sessionKey = `${student.id}_${quiz.id}`;
  const randomizedQuestions = quiz.questions.map((q) => {
    let opts;
    try {
      opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    } catch {
      opts = q.options;
    }
    const correctVal = opts[q.correctIndex !== undefined ? q.correctIndex : 0];
    const shuffledOpts = [...opts];
    for (let i = shuffledOpts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOpts[i], shuffledOpts[j]] = [shuffledOpts[j], shuffledOpts[i]];
    }
    const newCorrectIdx = shuffledOpts.indexOf(correctVal);

    return {
      ...q,
      options: JSON.stringify(shuffledOpts),
      correctIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
    };
  });

  activeStudentSessions.set(sessionKey, {
    quizId,
    studentId: student.id,
    userId,
    messageId: ctx.callbackQuery.message?.message_id,
    token: crypto.randomUUID().slice(0, 8),
    questionIndex: 0,
    answers: [],
    questions: randomizedQuestions,
  });

  await ctx.answerCallbackQuery();
  return renderQuestion(ctx, sessionKey);
}

/**
 * Render current question for active quiz session
 */
async function renderQuestion(ctx, sessionKey) {
  const session = activeStudentSessions.get(sessionKey);
  if (!session) {
    return ctx.editMessageText("❌ Test sessiyasi muddati tugagan.");
  }

  const currentQ = session.questions[session.questionIndex];
  const total = session.questions.length;
  const options = JSON.parse(currentQ.options);

  const letters = ["A", "B", "C", "D"];
  let text = `📝 <b>Savol ${session.questionIndex + 1}/${total}:</b>\n\n` +
    `<b>${currentQ.text}</b>\n\n`;

  options.forEach((opt, idx) => {
    text += `<b>${letters[idx]})</b> ${opt}\n`;
  });

  const keyboard = new InlineKeyboard();
  options.forEach((_, idx) => {
    keyboard.text(`${letters[idx]}`, `ans_q:${sessionKey}:${idx}:${session.questionIndex}:${session.token}`);
  });

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    return ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}

/**
 * Handle student answering a question
 */
export async function answerQuestionCallback(ctx) {
  const parts = ctx.callbackQuery.data.split(":");
  const sessionKey = parts[1];
  const choiceIndex = parseInt(parts[2], 10);

  const session = activeStudentSessions.get(sessionKey);
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Sessiya topilmadi!", show_alert: true });
    return;
  }

  if (session.userId !== String(ctx.from.id) || session.messageId !== ctx.callbackQuery.message?.message_id ||
      parts[4] !== session.token || Number(parts[3]) !== session.questionIndex ||
      !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= JSON.parse(session.questions[session.questionIndex].options).length) {
    return ctx.answerCallbackQuery({ text: "Bu javob tugmasi eskirgan yoki sizga tegishli emas!", show_alert: true });
  }
  const quiz = await prisma.quiz.findUnique({ where: { id: session.quizId } });
  if (!quiz || !quiz.isActive || (quiz.deadline && quiz.deadline <= new Date())) {
    activeStudentSessions.delete(sessionKey);
    return ctx.answerCallbackQuery({ text: "Test muddati tugagan yoki yopilgan!", show_alert: true });
  }
  // Recheck after the database await to reject concurrent duplicate callbacks.
  if (Number(parts[3]) !== session.questionIndex) return ctx.answerCallbackQuery({ text: "Javob allaqachon qabul qilingan." });
  session.answers.push(choiceIndex);
  session.questionIndex++;

  await ctx.answerCallbackQuery({ text: "Javobingiz qabul qilindi!" });

  if (session.questionIndex < session.questions.length) {
    return renderQuestion(ctx, sessionKey);
  }

  // Quiz Finished -> calculate score
  let score = 0;
  session.questions.forEach((q, idx) => {
    if (session.answers[idx] === q.correctIndex) {
      score++;
    }
  });

  const totalQuestions = session.questions.length;
  const earnedPoints = score * config.quizPointMultiplier;

  // Save submission to DB
  await prisma.$transaction(async (tx) => {
    await tx.quizSubmission.create({
      data: {
        quizId: session.quizId,
        studentId: session.studentId,
        score,
        totalQuestions,
      },
    });

    // Update student total points
    await tx.student.update({
      where: { id: session.studentId },
      data: {
        points: {
          increment: earnedPoints,
        },
      },
    });

  });
  activeStudentSessions.delete(sessionKey);

  const resultText =
    `🎉 <b>TEST YAKUNLANDI!</b>\n\n` +
    `📊 To'g'ri javoblar: <b>${score} / ${totalQuestions}</b>\n` +
    `⭐️ To'plangan ball: <b>+${earnedPoints} ball</b>\n\n` +
    `<i>Natijangiz umumiy oylik reytingga qo'shildi!</i>`;

  return ctx.editMessageText(resultText, { parse_mode: "HTML" });
}