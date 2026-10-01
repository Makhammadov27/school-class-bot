import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";

/**
 * Conversation: Broadcast announcement to all registered students
 */
export async function broadcastConversation(conversation, ctx) {
  if (!isAdmin(ctx.from.id)) return;

  await ctx.reply(
    "📢 <b>BARCHA O'QUVChILARGA E'LON YUBORISh:</b>\n\n" +
    "Yubormoqchi bo'lgan xabaringizni (matn, rasm, fayl) yozing yoki yuboring.\n\n" +
    "Bekor qilish uchun /cancel deb yozing.",
    { parse_mode: "HTML" }
  );

  const response = await conversation.wait();
  if (response.message?.text === "/cancel") {
    return ctx.reply("❌ E'lon bekor qilindi.");
  }

  const students = await conversation.external(() => prisma.student.findMany({
    where: { telegramId: { not: null } },
  }));

  if (students.length === 0) {
    return ctx.reply("❌ Botga ulangan o'quvchilar mavjud emas.");
  }

  let success = 0;
  let failed = 0;

  for (const student of students) {
    if (!student.telegramId) continue;
    try {
      await conversation.external(async () => {
        await ctx.api.copyMessage(
          student.telegramId,
          ctx.chat.id,
          response.message.message_id
        );
      });
      success++;
    } catch (e) {
      failed++;
    }
  }

  return ctx.reply(
    `✅ <b>E'lon tarqatildi!</b>\n\n` +
    `Yuborildi: <b>${success}</b> ta o'quvchiga\n` +
    (failed > 0 ? `Yuborilmadi (bloklagan): <b>${failed}</b> ta\n` : ""),
    { parse_mode: "HTML" }
  );
}