import { Keyboard } from "grammy";
import { askAiTutor } from "../../services/ai.service.js";
import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";
import { getAdminMainMenu } from "../../keyboards/admin.menu.js";
import { getStudentMainMenu } from "../../keyboards/student.menu.js";

export const DAILY_AI_LIMIT = 3;

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
 * Check user's 24-hour AI usage limit
 * @param {string|number} userId
 * @returns {Promise<{ allowed: boolean, remaining: number, usedCount: number, resetInFormatted: string | null }>}
 */
export async function getAiLimitStatus(userId) {
  if (isAdmin(userId)) {
    return { allowed: true, remaining: 999, usedCount: 0, resetInFormatted: null };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const records = await prisma.aiUsage.findMany({
    where: {
      userId: String(userId),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
  });

  const usedCount = records.length;
  if (usedCount < DAILY_AI_LIMIT) {
    return {
      allowed: true,
      remaining: DAILY_AI_LIMIT - usedCount,
      usedCount,
      resetInFormatted: null,
    };
  }

  const oldest = records[0];
  const resetAt = new Date(oldest.createdAt.getTime() + 24 * 60 * 60 * 1000);
  const diffMs = Math.max(0, resetAt.getTime() - Date.now());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let resetInFormatted = "";
  if (hours > 0) resetInFormatted += `${hours} soat `;
  resetInFormatted += `${minutes} daqiqa`;

  return {
    allowed: false,
    remaining: 0,
    usedCount,
    resetInFormatted,
  };
}

/**
 * Conversation for AI Tutor interactive chat
 * @param {import("@grammyjs/conversations").Conversation} conversation
 * @param {import("grammy").Context} ctx
 */
export async function aiTutorConversation(conversation, ctx) {
  const userId = ctx.from.id;
  const isUserAdmin = isAdmin(userId);

  // Check 24-hour limit before entering
  const initialLimit = await conversation.external(() => getAiLimitStatus(userId));
  if (!initialLimit.allowed) {
    return ctx.reply(
      `⛔ <b>AI Repetitor kunlik limitingiz tugagan!</b>\n\n` +
      `Siz 24 soat ichida beriladigan <b>${DAILY_AI_LIMIT} ta savol</b> limitingizdan to'liq foydalangansiz (${DAILY_AI_LIMIT}/${DAILY_AI_LIMIT}).\n\n` +
      `⏳ Yangi savol berish imkoniyati: <b>${initialLimit.resetInFormatted}</b> dan so'ng ochiladi.\n` +
      `<i>Bu qoida barcha o'quvchilarga teng taqsimlanishi uchun o'rnatilgan.</i>`,
      {
        parse_mode: "HTML",
        reply_markup: getMainReplyMarkup(userId),
      }
    );
  }

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

  const limitBadge = isUserAdmin
    ? "<i>(Admin cheklovsiz)</i>"
    : `🎯 Sizning 24 soatlik limitingiz: <b>${initialLimit.remaining}/${DAILY_AI_LIMIT} ta savol</b> qoldi`;

  await ctx.reply(
    `🤖 <b>AI Repetitor (Virtual Ustoz)ga xush kelibsiz!</b>\n\n` +
    `Salom, <b>${studentName}</b>! Maktab fanlari (Matematika, Ona tili, Adabiyot, Fizika, Ingliz tili, Tarix va boshqalar) bo'yicha tushunmagan mavzuingiz yoki yecholmagan misol/savolingiz bo'lsa, bemalol so'rashingiz mumkin.\n\n` +
    `${limitBadge}\n\n` +
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

  // Conversation loop: user can ask questions up to remaining limit
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

    // Check limit dynamically before processing question
    const currentLimit = await conversation.external(() => getAiLimitStatus(userId));
    if (!currentLimit.allowed) {
      await userMsgCtx.reply(
        `⛔ <b>Sizning 24 soatlik limitingiz tugadi!</b>\n\n` +
        `Siz bugungi <b>${DAILY_AI_LIMIT} ta savol</b> limitingizdan to'liq foydalandingiz.\n\n` +
        `⏳ Keyingi savol berish imkoniyati: <b>${currentLimit.resetInFormatted}</b> dan so'ng ochiladi.`,
        {
          parse_mode: "HTML",
          reply_markup: getMainReplyMarkup(userId),
        }
      );
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

      // Record successful usage in database
      if (!isUserAdmin) {
        await conversation.external(() =>
          prisma.aiUsage.create({
            data: { userId: String(userId) },
          })
        );
      }

      // Calculate remaining questions
      const updatedLimit = await conversation.external(() => getAiLimitStatus(userId));

      // Delete the waiting indicator
      try {
        await ctx.api.deleteMessage(userMsgCtx.chat.id, waitMsg.message_id);
      } catch (e) {}

      // Split into safe chunks if answer is long
      const chunks = splitMessage(answer);
      for (const chunk of chunks) {
        await userMsgCtx.reply(chunk);
      }

      // Check if user has more questions left
      if (!isUserAdmin && !updatedLimit.allowed) {
        await userMsgCtx.reply(
          `✅ <b>Javob berildi!</b>\n\n` +
          `🔒 Siz bugungi <b>${DAILY_AI_LIMIT} ta savol</b> limitingizni to'liq yakunladingiz (${DAILY_AI_LIMIT}/${DAILY_AI_LIMIT}).\n` +
          `⏳ Keyingi savol berish imkoniyati: <b>${updatedLimit.resetInFormatted}</b> dan so'ng ochiladi.\n\n` +
          `<i>Darslaringizga omad tilaymiz!</i> 🌟`,
          {
            parse_mode: "HTML",
            reply_markup: getMainReplyMarkup(userId),
          }
        );
        return; // Exit conversation since limit reached
      }

      const remainingNote = isUserAdmin
        ? ""
        : `\n🎯 <i>Sizda yana <b>${updatedLimit.remaining} ta savol</b> berish imkoniyati qoldi.</i>`;

      await userMsgCtx.reply(
        `💡 <b>Yana biror savol yoki misolingiz bormi?</b>${remainingNote}\n\n` +
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
        `⚠️ <i>Kechirasiz, sun'iy intellekt javob berishida xatolik yuz berdi.</i>\n\n` +
        `Iltimos, qayta urinib ko'ring yoki boshqa savol berib ko'ring. (Bu urinish uchun limit sarflanmadi)`,
        {
          parse_mode: "HTML",
          reply_markup: exitKeyboard,
        }
      );
    }
  }
}
