import { Keyboard } from "grammy";
import { askAiTutor } from "../../services/ai.service.js";
import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";
import { getAdminMainMenu } from "../../keyboards/admin.menu.js";
import { getStudentMainMenu } from "../../keyboards/student.menu.js";

/**
 * Return main menu according to role
 */
export function getMainReplyMarkup(userId) {
  return isAdmin(userId) ? getAdminMainMenu() : getStudentMainMenu();
}

/**
 * Split long message if it exceeds Telegram's 4000 character limit
 */
function splitMessage(text, maxLength = 3900) {
  if (text.length <= maxLength) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1) splitIndex = maxLength;
    parts.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

/**
 * Conversation for AI Tutor interactive chat
 * @param {import("@grammyjs/conversations").Conversation} conversation
 * @param {import("grammy").Context} ctx
 */
export async function aiTutorConversation(conversation, ctx) {
  const userId = ctx.from.id;
  const isUserAdmin = isAdmin(userId);

  // Student name if registered
  let studentName = isUserAdmin ? "Ustoz" : (ctx.from.first_name || "O'quvchi");
  try {
    const student = await conversation.external(() =>
      prisma.student.findUnique({
        where: { telegramId: String(userId) },
        select: { fullName: true },
      })
    );
    if (student?.fullName) {
      studentName = student.fullName;
    }
  } catch (e) {}

  const exitKeyboard = new Keyboard().text("🔙 Asosiy menyu").resized();

  await ctx.reply(
    `🤖 <b>AI Repetitor (Virtual Ustoz)ga xush kelibsiz!</b>\n\n` +
    `Salom, <b>${studentName}</b>! Maktab fanlari (Matematika, Ona tili, Adabiyot, Fizika, Ingliz tili, Tarix va boshqalar) bo'yicha tushunmagan mavzuingiz yoki yecholmagan misol/savolingiz bo'lsa, bemalol so'rashingiz mumkin.\n\n` +
    `💡 <i>Misollar:</i>\n` +
    `• "Oddiy va o'nli kasrlarni ko'paytirish qoidasini tushuntirib ber"\n` +
    `• "Ona tilidan ergashgan qo'shma gaplarga misollar keltir"\n` +
    `• "3x + 12 = 39 tenglamaning yechilishini bosqichma-bosqich ko'rsat"\n` +
    `• "Ingliz tilida Past Simple qanday yasaladi?"\n\n` +
    `✍️ <b>Savolingizni matn sifatida yuboring:</b>\n` +
    `(Chiqish uchun quyidagi <b>🔙 Asosiy menyu</b> tugmasini bosing)`,
    {
      parse_mode: "HTML",
      reply_markup: exitKeyboard,
    }
  );

  // Conversation loop: user can ask multiple questions consecutively
  while (true) {
    const userMsgCtx = await conversation.wait();
    const text = userMsgCtx.message?.text?.trim();

    // Check exit triggers
    if (
      !text ||
      text === "🔙 Asosiy menyu" ||
      text === "/cancel" ||
      text === "/start" ||
      text.startsWith("📋 Davomat") ||
      text.startsWith("👥 O'quvchilar") ||
      text.startsWith("📝 ") ||
      text.startsWith("📅 Dars") ||
      text.startsWith("📊 Statistika") ||
      text.startsWith("📢 E'lon") ||
      text.startsWith("➕ Qo'shimcha") ||
      text.startsWith("🏆 Reyting") ||
      text.startsWith("👤 Profilim")
    ) {
      await userMsgCtx.reply("🔙 Asosiy menyuga qaytdingiz.", {
        reply_markup: getMainReplyMarkup(userId),
      });
      return;
    }

    // Inform user and trigger typing action
    await userMsgCtx.replyWithChatAction("typing");
    const waitMsg = await userMsgCtx.reply("⏳ <i>AI Repetitor javob tayyorlamoqda...</i>", {
      parse_mode: "HTML",
    });

    try {
      const answer = await conversation.external(() =>
        askAiTutor(text, studentName)
      );

      // Delete the waiting indicator
      try {
        await ctx.api.deleteMessage(userMsgCtx.chat.id, waitMsg.message_id);
      } catch (e) {}

      // Split into safe chunks if answer is long
      const chunks = splitMessage(answer);
      for (const chunk of chunks) {
        await userMsgCtx.reply(chunk);
      }

      await userMsgCtx.reply(
        `💡 <b>Yana biror savol yoki misolingiz bormi?</b>\n` +
        `Bemalol yozing yoki chiqish uchun <b>🔙 Asosiy menyu</b> tugmasini bosing.`,
        {
          parse_mode: "HTML",
          reply_markup: exitKeyboard,
        }
      );
    } catch (err) {
      console.error("AI Repetitor handler xatosi:", err);
      try {
        await ctx.api.deleteMessage(userMsgCtx.chat.id, waitMsg.message_id);
      } catch (e) {}

      await userMsgCtx.reply(
        `⚠️ <i>Kechirasiz, hozirda sun'iy intellekt serverida yuklama yuqori bo'lgani sababli javob olib bo'lmadi.</i>\n\n` +
        `Iltimos, birozdan so'ng qayta urinib ko'ring yoki boshqa savol berib ko'ring.`,
        {
          parse_mode: "HTML",
          reply_markup: exitKeyboard,
        }
      );
    }
  }
}
