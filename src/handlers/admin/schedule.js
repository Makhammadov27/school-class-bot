import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";
import { InlineKeyboard } from "grammy";

const dayNames = {
  1: "Dushanba",
  2: "Seshanba",
  3: "Chorshanba",
  4: "Payshanba",
  5: "Juma",
  6: "Shanba",
};

/**
 * Show schedule management for Admin
 */
export async function showAdminScheduleMenu(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const schedules = await prisma.schedule.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { lessonOrder: "asc" }],
  });

  let text = "📅 <b>HAFTALIK DARS JADVALI:</b>\n\n";

  for (let day = 1; day <= 6; day++) {
    text += `🔹 <b>${dayNames[day]}:</b>\n`;
    const dayLessons = schedules.filter((s) => s.dayOfWeek === day);
    if (dayLessons.length === 0) {
      text += "   <i>Darslar kiritilmagan</i>\n";
    } else {
      dayLessons.forEach((l) => {
        text += `   <b>${l.lessonOrder}-dars:</b> ${l.subject}`;
        if (l.room) text += ` (${l.room})`;
        if (l.teacher) text += ` - ${l.teacher}`;
        text += "\n";
      });
    }
    text += "\n";
  }

  const keyboard = new InlineKeyboard()
    .text("➕ Dars qo'shish / tahrirlash", "admin_edit_schedule")
    .row()
    .text("🗑 Jadvalni tozalash", "admin_clear_schedule_prompt");

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Show clear schedule options
 */
export async function showClearSchedulePrompt(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const keyboard = new InlineKeyboard()
    .text("🗑 To'liq haftani tozalash", "admin_clear_schedule_all")
    .row()
    .text("📅 Faqat bitta kunni tozalash", "admin_clear_schedule_by_day")
    .row()
    .text("❌ Bekor qilish", "admin_cancel_clear");

  await ctx.answerCallbackQuery();
  return ctx.reply(
    "🗑 <b>Dars jadvalini tozalash:</b>\n\n" +
    "Qanday tozalashni xohlaysiz?",
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
}

/**
 * Clear all schedule records
 */
export async function clearAllSchedule(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  await prisma.schedule.deleteMany();

  await ctx.answerCallbackQuery({ text: "Jadval tozalandi!" });
  return ctx.editMessageText("✅ <b>Haftalik dars jadvali to'liq tozalandi!</b>", {
    parse_mode: "HTML",
  });
}

/**
 * Show days to clear a specific day
 */
export async function showClearDaysMenu(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const keyboard = new InlineKeyboard();
  for (let day = 1; day <= 6; day++) {
    keyboard.text(`🗑 ${dayNames[day]}`, `admin_clear_day:${day}`);
    if (day % 2 === 0) keyboard.row();
  }
  keyboard.row().text("❌ Bekor qilish", "admin_cancel_clear");

  await ctx.answerCallbackQuery();
  return ctx.editMessageText(
    "📅 <b>Qaysi kunning dars jadvalini tozalamoqchisiz?</b>",
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
}

/**
 * Clear specific day
 */
export async function clearSpecificDay(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const dayOfWeek = parseInt(ctx.callbackQuery.data.split(":")[1], 10);
  await prisma.schedule.deleteMany({
    where: { dayOfWeek },
  });

  await ctx.answerCallbackQuery({ text: `${dayNames[dayOfWeek]} tozalandi!` });
  return ctx.editMessageText(
    `✅ <b>${dayNames[dayOfWeek]} kunining dars jadvali tozalandi!</b>`,
    { parse_mode: "HTML" }
  );
}

/**
 * Cancel clear action
 */
export async function cancelClearSchedule(ctx) {
  await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
  try {
    await ctx.deleteMessage();
  } catch (e) {}
}

/**
 * Conversation: Edit / Add a lesson to schedule
 */
export async function editScheduleConversation(conversation, ctx) {
  if (!isAdmin(ctx.from.id)) return;

  let daysText = "📅 <b>Qaysi kun uchun dars kiritmoqchisiz? Raqamini yuboring:</b>\n\n";
  daysText += "1 - Dushanba\n2 - Seshanba\n3 - Chorshanba\n4 - Payshanba\n5 - Juma\n6 - Shanba\n\nBekor qilish uchun /cancel deb yozing.";

  await ctx.reply(daysText, { parse_mode: "HTML" });

  const dayMsg = await conversation.wait();
  if (dayMsg.message?.text === "/cancel") return ctx.reply("❌ Bekor qilindi.");

  const dayOfWeek = parseInt(dayMsg.message?.text, 10);
  if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6) {
    return ctx.reply("❌ Noto'g'ri kun raqami. 1 dan 6 gacha son kiriting.");
  }

  await ctx.reply(
    `📌 <b>${dayNames[dayOfWeek]}</b> kuni uchun nechanchi dars? (1 dan 7 gacha raqam kiriting):`,
    { parse_mode: "HTML" }
  );

  const orderMsg = await conversation.wait();
  if (orderMsg.message?.text === "/cancel") return ctx.reply("❌ Bekor qilindi.");

  const lessonOrder = parseInt(orderMsg.message?.text, 10);
  if (isNaN(lessonOrder) || lessonOrder < 1 || lessonOrder > 7) {
    return ctx.reply("❌ Noto'g'ri dars tartibi. 1 dan 7 gacha son kiriting.");
  }

  await ctx.reply(
    `📚 Dars/Fan nomini kiriting:\n<i>(Masalan: Matematika yoki Ona tili)</i>:`,
    { parse_mode: "HTML" }
  );

  const subjectMsg = await conversation.wait();
  if (subjectMsg.message?.text === "/cancel") return ctx.reply("❌ Bekor qilindi.");
  const subject = subjectMsg.message?.text;

  if (!subject) return ctx.reply("❌ Fan nomi bo'sh bo'lishi mumkin emas.");

  await ctx.reply(
    `🚪 Xona raqami yoki O'qituvchi ismini kiriting (Ixtiyoriy, o'tkazib yuborish uchun - deb yozing):`,
    { parse_mode: "HTML" }
  );

  const extraMsg = await conversation.wait();
  if (extraMsg.message?.text === "/cancel") return ctx.reply("❌ Bekor qilindi.");
  let extra = extraMsg.message?.text;
  let room = null;
  let teacher = null;

  if (extra && extra !== "-" && extra !== "/cancel") {
    teacher = extra;
  }

  // Upsert schedule record
  await conversation.external(() => prisma.schedule.upsert({
    where: {
      dayOfWeek_lessonOrder: {
        dayOfWeek,
        lessonOrder,
      },
    },
    update: {
      subject,
      teacher,
    },
    create: {
      dayOfWeek,
      lessonOrder,
      subject,
      teacher,
    },
  }));

  return ctx.reply(
    `✅ <b>Jadval saqlandi!</b>\n\n` +
    `📅 Kun: <b>${dayNames[dayOfWeek]}</b>\n` +
    `🔢 Dars: <b>${lessonOrder}-dars</b>\n` +
    `📚 Fan: <b>${subject}</b>` +
    (teacher ? `\n👨‍🏫 Qo'shimcha: ${teacher}` : ""),
    { parse_mode: "HTML" }
  );
}