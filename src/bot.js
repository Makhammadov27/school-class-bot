import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { config, isAdmin } from "./config/config.js";
import { initScheduler } from "./cron/scheduler.js";

// Handlers
import { startHandler } from "./handlers/common/start.js";
import {
  linkStudentCallback,
  verifyStudentPinConversation,
} from "./handlers/student/register.js";
import {
  showStudentsList,
  addStudentConversation,
  showDeleteStudentMenu,
  deleteStudentCallback,
  giveBonusConversation,
  confirmResetAllStudents,
  executeResetAllStudents,
  cancelResetAllStudents,
} from "./handlers/admin/students.js";
import {
  startAttendanceHandler,
  attendanceCallbackHandler,
} from "./handlers/admin/attendance.js";
import {
  showAdminScheduleMenu,
  editScheduleConversation,
  showClearSchedulePrompt,
  clearAllSchedule,
  showClearDaysMenu,
  clearSpecificDay,
  cancelClearSchedule,
} from "./handlers/admin/schedule.js";
import {
  showAdminQuizzes,
  showAiSubjectMenu,
  triggerAiQuizCallback,
  showCloseQuizMenu,
  closeQuizCallback,
  shuffleActiveQuizzesHandler,
  confirmClearQuizzesHandler,
  executeClearQuizzesHandler,
  cancelClearQuizzesHandler,
} from "./handlers/admin/quizzes.js";
import {
  showAvailableQuizzes,
  startQuizCallback,
  answerQuestionCallback,
} from "./handlers/student/quiz.js";
import {
  showStudentSchedule,
  studentScheduleCallback,
} from "./handlers/student/schedule.js";
import {
  showStudentLeaderboard,
  showStudentProfile,
} from "./handlers/student/stats.js";
import { exportMonthlyStatsHandler } from "./handlers/admin/export.js";
import { broadcastConversation } from "./handlers/admin/broadcast.js";

if (!config.botToken) {
  console.error("❌ Xatolik: .env faylida BOT_TOKEN ko'rsatilmagan!");
  console.log("Iltimos, .env faylini ochib BOT_TOKEN, GEMINI_API_KEY va ADMIN_IDS ni kiriting.");
  process.exit(1);
}

const bot = new Bot(config.botToken);

// Middlewares
bot.use(
  session({
    initial: () => ({}),
  })
);
bot.use(conversations());

// Reject protected callbacks before they can enter conversations.
bot.use(async (ctx, next) => {
  const data = ctx.callbackQuery?.data || '';
  if (/^(admin_|att_|del_student:|ai_gen_subj:)/.test(data) && !isAdmin(ctx.from?.id)) {
    return ctx.answerCallbackQuery({ text: 'Bu amal faqat admin uchun!', show_alert: true });
  }
  return next();
});

// Register Conversations
bot.use(createConversation(addStudentConversation));
bot.use(createConversation(editScheduleConversation));
bot.use(createConversation(giveBonusConversation));
bot.use(createConversation(broadcastConversation));
bot.use(createConversation(verifyStudentPinConversation));

// -------------------------------------------------------------
// Commands
// -------------------------------------------------------------
bot.command("start", startHandler);
bot.command("cancel", async (ctx) => {
  await ctx.conversation.exit();
  return ctx.reply("❌ Joriy amal bekor qilindi.");
});
bot.command("davomat", startAttendanceHandler);
bot.command("clear_all", confirmResetAllStudents);
bot.command("reset_students", confirmResetAllStudents);
bot.command("clear_quizzes", confirmClearQuizzesHandler);
bot.command("shuffle_quiz", shuffleActiveQuizzesHandler);
bot.command("statistika", async (ctx) => {
  if (isAdmin(ctx.from.id)) {
    return exportMonthlyStatsHandler(ctx);
  }
  return showStudentLeaderboard(ctx);
});

// -------------------------------------------------------------
// Admin Menu Actions
// -------------------------------------------------------------
bot.hears("📋 Davomat olish", startAttendanceHandler);
bot.hears("👥 O'quvchilar", showStudentsList);
bot.hears(/^(📝 Testlar|📝 Yangi Test)/, showAdminQuizzes);
bot.hears("📅 Dars Jadvali", (ctx) => {
  if (isAdmin(ctx.from.id)) {
    return showAdminScheduleMenu(ctx);
  }
  return showStudentSchedule(ctx);
});
bot.hears("📊 Statistika & Excel", exportMonthlyStatsHandler);
bot.hears("📢 E'lon yuborish", async (ctx) => {
  if (isAdmin(ctx.from.id)) {
    return ctx.conversation.enter("broadcastConversation");
  }
});
bot.hears("➕ Qo'shimcha ball berish", async (ctx) => {
  if (isAdmin(ctx.from.id)) {
    return ctx.conversation.enter("giveBonusConversation");
  }
});

// -------------------------------------------------------------
// Student Menu Actions
// -------------------------------------------------------------
bot.hears("📝 Mavjud Testlar", showAvailableQuizzes);
bot.hears("🏆 Reyting & Ballarim", showStudentLeaderboard);
bot.hears("👤 Profilim", showStudentProfile);

// -------------------------------------------------------------
// Callbacks
// -------------------------------------------------------------
bot.callbackQuery(/^link_student:/, linkStudentCallback);
bot.callbackQuery(/^att_/, attendanceCallbackHandler);

// Admin callbacks
bot.callbackQuery("admin_add_student", async (ctx) => {
  await ctx.answerCallbackQuery();
  return ctx.conversation.enter("addStudentConversation");
});
bot.callbackQuery("admin_delete_student_list", showDeleteStudentMenu);
bot.callbackQuery(/^del_student:/, deleteStudentCallback);
bot.callbackQuery("admin_reset_all_confirm", confirmResetAllStudents);
bot.callbackQuery("admin_reset_all_execute", executeResetAllStudents);
bot.callbackQuery("admin_reset_all_cancel", cancelResetAllStudents);
bot.callbackQuery("admin_edit_schedule", async (ctx) => {
  await ctx.answerCallbackQuery();
  return ctx.conversation.enter("editScheduleConversation");
});
bot.callbackQuery("admin_clear_schedule_prompt", showClearSchedulePrompt);
bot.callbackQuery("admin_clear_schedule_all", clearAllSchedule);
bot.callbackQuery("admin_clear_schedule_by_day", showClearDaysMenu);
bot.callbackQuery(/^admin_clear_day:/, clearSpecificDay);
bot.callbackQuery("admin_cancel_clear", cancelClearSchedule);
bot.callbackQuery("admin_ai_generate_menu", showAiSubjectMenu);
bot.callbackQuery(/^ai_gen_subj:/, triggerAiQuizCallback);
bot.callbackQuery("admin_shuffle_quizzes", shuffleActiveQuizzesHandler);
bot.callbackQuery("admin_close_quiz_list", showCloseQuizMenu);
bot.callbackQuery(/^admin_close_q:/, closeQuizCallback);
bot.callbackQuery("admin_clear_quizzes_confirm", confirmClearQuizzesHandler);
bot.callbackQuery("admin_clear_quizzes_execute", executeClearQuizzesHandler);
bot.callbackQuery("admin_clear_quizzes_cancel", cancelClearQuizzesHandler);

// Student callbacks
bot.callbackQuery(/^student_sched_/, studentScheduleCallback);
bot.callbackQuery(/^start_test:/, startQuizCallback);
bot.callbackQuery(/^ans_q:/, answerQuestionCallback);

// Error Handling
bot.catch((err) => {
  const e = err.error;
  if (
    e?.description?.includes("message is not modified") ||
    e?.message?.includes("message is not modified")
  ) {
    // Normal Telegram API behavior when content is unchanged
    return;
  }
  console.error("Botda xatolik yuz berdi:", err);
});

// Start scheduler and bot
initScheduler(bot);

console.log("🚀 Maktab Sinf Boshqaruv Boti (AI Testlar bilan) muvaffaqiyatli ishga tushdi!");
bot.start();