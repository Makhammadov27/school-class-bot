import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";
import { InlineKeyboard } from "grammy";
import { GRADE_6_SUBJECTS, createAndPublishAiQuiz } from "../../services/ai.service.js";

/**
 * Show list of active/past quizzes to admin
 */
export async function showAdminQuizzes(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const activeQuizzes = await prisma.quiz.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      questions: true,
      submissions: {
        include: { student: true },
      },
    },
  });

  const totalClosedCount = await prisma.quiz.count({
    where: { isActive: false },
  });

  let text = "🤖 <b>6-SINF AI TESTLARI BOSHQARUVI:</b>\n\n" +
    "⏰ <b>Haftalik avtomatik jadval:</b>\n" +
    "🔹 <b>Dushanba 12:00:</b> Yangi 15 talik test yuklanadi ➡️ <b>Chorshanba 12:00 da</b> yopiladi.\n" +
    "🔹 <b>Payshanba 12:00:</b> Keyingi fan testi yuklanadi ➡️ <b>Shanba 12:00 da</b> yopiladi.\n\n";

  if (activeQuizzes.length === 0) {
    text += "🟢 <b>Faol testlar:</b> Hozirda faol test mavjud emas.\n";
  } else {
    text += `🟢 <b>Joriy faol testlar (${activeQuizzes.length} ta):</b>\n\n`;
    activeQuizzes.forEach((q, idx) => {
      const deadlineText = q.deadline
        ? `⏳ Muddat: ${new Date(q.deadline).toLocaleString("uz-UZ")}`
        : "⏳ Muddat: Cheklanmagan";

      text += `<b>${idx + 1}. [${q.subject}] ${q.title}</b>\n` +
        `   └ Savollar: <b>${q.questions.length} ta</b> | Topshirganlar: <b>${q.submissions.length} ta</b>\n` +
        `   └ ${deadlineText}\n\n`;
    });
  }

  if (totalClosedCount > 0) {
    text += `\n📦 <i>Eski yopilgan testlar: <b>${totalClosedCount} ta</b></i>\n`;
  }

  const keyboard = new InlineKeyboard()
    .text("⚡️ AI Test yaratish (Hozir)", "admin_ai_generate_menu")
    .row()
    .text("🔀 Variantlarni aralashtirish (A,B,C,D)", "admin_shuffle_quizzes")
    .row()
    .text("🔒 Testni muddatidan oldin yopish", "admin_close_quiz_list")
    .row()
    .text("🗑 Testlar tarixini tozalash (Clear)", "admin_clear_quizzes_confirm");

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Confirm clearing all quizzes
 */
export async function confirmClearQuizzesHandler(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const totalCount = await prisma.quiz.count();
  if (totalCount === 0) {
    return ctx.reply("ℹ️ Bazada o'chirish uchun testlar mavjud emas.");
  }

  const keyboard = new InlineKeyboard()
    .text("✅ Ha, barchasini tozalash", "admin_clear_quizzes_execute")
    .text("❌ Bekor qilish", "admin_clear_quizzes_cancel");

  const msg =
    `⚠️ <b>DIQQAT! TESTLAR TARIXINI TOZALASH:</b>\n\n` +
    `Bazada jami <b>${totalCount} ta</b> test (va ularning savollari) mavjud.\n\n` +
    `Ushbu amal bajarilsa, barcha eski va faol testlar bazadan butunlay o'chiriladi va testlar ro'yxati toza bo'ladi.\n\n` +
    `<b>Barcha testlarni tozalashni tasdiqlaysizmi?</b>`;

  return ctx.reply(msg, { parse_mode: "HTML", reply_markup: keyboard });
}

/**
 * Execute clearing all quizzes
 */
export async function executeClearQuizzesHandler(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCallbackQuery();

  const deleted = await prisma.quiz.deleteMany();

  return ctx.editMessageText(
    `🎉 <b>Testlar tarixi muvaffaqiyatli tozalandi!</b>\n\n` +
    `• Jami <b>${deleted.count} ta</b> test va ularning savollari o'chirildi.\n` +
    `• "Testlar & AI" bo'limi toza holatga keltirildi. ✨`,
    { parse_mode: "HTML" }
  );
}

/**
 * Cancel clearing quizzes
 */
export async function cancelClearQuizzesHandler(ctx) {
  await ctx.answerCallbackQuery({ text: "Tozalash bekor qilindi" });
  return ctx.editMessageText("❌ Testlarni tozalash bekor qilindi.");
}

/**
 * Re-shuffle options for all questions so answers are distributed evenly across A, B, C, D
 */
export async function shuffleActiveQuizzesHandler(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "Variantlar aralashtirilmoqda..." });

  const questions = await prisma.question.findMany({
    where: {
      quiz: { isActive: true },
    },
  });

  if (questions.length === 0) {
    return ctx.reply("ℹ️ Hozirda faol testlar va savollar topilmadi.");
  }

  const { shuffleQuestion } = await import("../../services/ai.service.js");
  const letters = ["A", "B", "C", "D"];
  const stats = { A: 0, B: 0, C: 0, D: 0 };

  for (const q of questions) {
    const shuffled = shuffleQuestion({
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
    });

    const letter = letters[shuffled.correctIndex] || "A";
    stats[letter] = (stats[letter] || 0) + 1;

    await prisma.question.update({
      where: { id: q.id },
      data: {
        options: JSON.stringify(shuffled.options),
        correctIndex: shuffled.correctIndex,
      },
    });
  }

  return ctx.reply(
    `🔀 <b>Variantlar muvaffaqiyatli aralashtirildi!</b>\n\n` +
    `Jami <b>${questions.length} ta</b> savolning javob variantlari tasodifiy joylashtirildi.\n\n` +
    `📊 <b>Yangi to'g'ri javoblar taqsimoti:</b>\n` +
    `• <b>A:</b> ${stats.A || 0} ta\n` +
    `• <b>B:</b> ${stats.B || 0} ta\n` +
    `• <b>C:</b> ${stats.C || 0} ta\n` +
    `• <b>D:</b> ${stats.D || 0} ta\n\n` +
    `Endi o'quvchilar test yechganda to'g'ri javoblar barcha variantlarga (A, B, C, D) teng taqsimlanadi! 🎯`,
    { parse_mode: "HTML" }
  );
}

/**
 * Show subject selection for on-demand AI quiz generation
 */
export async function showAiSubjectMenu(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const keyboard = new InlineKeyboard();

  keyboard.text("🎲 Navbatdagi fandan (Avtomatik)", "ai_gen_subj:AUTO").row();

  GRADE_6_SUBJECTS.forEach((subj, idx) => {
    keyboard.text(`📚 ${subj}`, `ai_gen_subj:${subj}`);
    if ((idx + 1) % 2 === 0) keyboard.row();
  });

  await ctx.answerCallbackQuery();
  return ctx.reply(
    "🤖 <b>Qaysi fan bo'yicha 15 talik AI testini yaratmoqchisiz?</b>\n\n" +
    "<i>6-sinf darsligi asosida tuziladi:</i>",
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
}

/**
 * Handle AI quiz generation callback
 */
export async function triggerAiQuizCallback(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const subjParam = ctx.callbackQuery.data.split(":")[1];
  const subject = subjParam === "AUTO" ? null : subjParam;

  await ctx.answerCallbackQuery({ text: "AI test tuzmoqda, 5-10 soniya kuting..." });
  const waitMsg = await ctx.reply("🤖 <b>Google Gemini AI 6-sinf darsligi bo'yicha 15 talik test tuzmoqda...</b>\n\nIltimos kuting...", {
    parse_mode: "HTML",
  });

  try {
    const createdQuiz = await createAndPublishAiQuiz(subject, 48, { api: ctx.api });

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);

    return ctx.reply(
      `🎉 <b>AI Test muvaffaqiyatli yaratildi va o'quvchilarga e'lon qilindi!</b>\n\n` +
      `📚 Fan: <b>${createdQuiz.subject}</b> (6-sinf darsligi)\n` +
      `📌 Nomi: <b>${createdQuiz.title}</b>\n` +
      `❓ Savollar soni: <b>15 ta</b>\n` +
      `⏳ Yopilish vaqti: <b>${new Date(createdQuiz.deadline).toLocaleString("uz-UZ")}</b>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("AI test generatsiyasida xatolik:", error);
    try {
      await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    } catch (e) {}
    return ctx.reply("❌ Test yaratishda xatolik yuz berdi: " + error.message);
  }
}

/**
 * Show list of quizzes to close
 */
export async function showCloseQuizMenu(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const activeQuizzes = await prisma.quiz.findMany({
    where: { isActive: true },
  });

  if (activeQuizzes.length === 0) {
    return ctx.reply("Hozirda faol testlar mavjud emas.");
  }

  const keyboard = new InlineKeyboard();
  activeQuizzes.forEach((q) => {
    keyboard.text(`🔒 [${q.subject}] ${q.title}`, `admin_close_q:${q.id}`).row();
  });

  await ctx.answerCallbackQuery();
  return ctx.reply("🔒 <b>Muddatidan oldin yopmoqchi bo'lgan testni tanlang:</b>", {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Close quiz callback
 */
export async function closeQuizCallback(ctx) {
  if (!isAdmin(ctx.from?.id)) return;
  const quizId = parseInt(ctx.callbackQuery.data.split(":")[1], 10);
  await prisma.quiz.update({
    where: { id: quizId },
    data: { isActive: false },
  });

  await ctx.answerCallbackQuery({ text: "Test yopildi!" });
  return ctx.editMessageText("🔒 <b>Test muvaffaqiyatli yopildi.</b>", {
    parse_mode: "HTML",
  });
}