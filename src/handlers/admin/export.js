import { generateMonthlyReportExcel } from "../../services/excel.service.js";
import { getStudentLeaderboard } from "../../services/ranking.service.js";
import { isAdmin } from "../../config/config.js";
import { InputFile } from "grammy";

/**
 * Handle "📊 Statistika & Excel" admin action
 * @param {import("grammy").Context} ctx
 */
export async function exportMonthlyStatsHandler(ctx, requestedMonth = ctx.match?.trim()) {
  if (!isAdmin(ctx.from.id)) return;

  const waitMsg = await ctx.reply("⏳ Hisobot va Excel jadvali tayyorlanmoqda...");

  try {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const yearMonth = requestedMonth || currentYM;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      return ctx.reply("❌ Oy noto‘g‘ri. Masalan: <code>/statistika 2026-09</code>", { parse_mode: "HTML" });
    }

    const { rankings, studentOfTheMonth } = await getStudentLeaderboard(yearMonth);

    let summaryText = `📊 <b>${yearMonth} OYI STATISTIKASI VA OY O'QUVCHISI:</b>\n\n`;

    if (studentOfTheMonth && studentOfTheMonth.totalPoints > 0) {
      summaryText +=
        `👑 <b>OY O'QUVCHISI:</b> 🥇 <b>${studentOfTheMonth.fullName}</b>\n` +
        `⭐️ Jami to'plagan bali: <b>${studentOfTheMonth.totalPoints} ball</b>\n` +
        `   └ Davomat: +${studentOfTheMonth.attendancePoints} ball (${studentOfTheMonth.presentDays} kun)\n` +
        `   └ Testlar: +${studentOfTheMonth.quizPoints} ball\n` +
        `   └ Qo'shimcha/Bonus: +${studentOfTheMonth.bonusPoints} ball\n\n`;
    }

    summaryText += `🏆 <b>Top-5 o'quvchilar:</b>\n`;
    rankings.slice(0, 5).forEach((st, idx) => {
      const icon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🔹";
      summaryText += `${icon} <b>${idx + 1}. ${st.fullName}</b> — ${st.totalPoints} ball\n`;
    });

    summaryText += `\n📥 <i>Batafsil ma'lumotlar va kunma-kun davomat jurnali quyidagi Excel faylda:</i>`;

    await ctx.reply(summaryText, { parse_mode: "HTML" });

    // Generate Excel Buffer
    const excelBuffer = await generateMonthlyReportExcel(yearMonth);
    const fileName = `Davomat_va_Reyting_${yearMonth}.xlsx`;

    await ctx.replyWithDocument(new InputFile(excelBuffer, fileName), {
      caption: `📑 <b>${yearMonth} oylik davomat va reyting hisoboti</b>`,
      parse_mode: "HTML",
    });

    try {
      await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    } catch (e) {}
  } catch (error) {
    console.error("Excel generatsiyasida xatolik:", error);
    await ctx.reply("❌ Hisobotni yaratishda xatolik yuz berdi: " + error.message);
  }
}