import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";
import { InlineKeyboard } from "grammy";

/**
 * Show list of students to admin
 * @param {import("grammy").Context} ctx
 */
export async function showStudentsList(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const students = await prisma.student.findMany({
    orderBy: { fullName: "asc" },
  });

  if (students.length === 0) {
    const keyboard = new InlineKeyboard().text(
      "➕ O'quvchi qo'shish",
      "admin_add_student"
    );
    return ctx.reply(
      "👥 <b>Sinf o'quvchilari ro'yxati bo'sh.</b>\n\nQuyidagi tugma orqali yangi o'quvchilarni qo'shishingiz mumkin:",
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  }

  let text = `👥 <b>Sinf o'quvchilari ro'yxati (Jami: ${students.length} ta):</b>\n\n`;
  students.forEach((st, idx) => {
    const statusIcon = st.telegramId ? "📱 (Ulangan)" : "👤 (Ulanmagan)";
    const pin = st.pinCode || "1234";
    text += `<b>${idx + 1}. ${st.fullName}</b> ${statusIcon}\n` +
      `   └ 🔐 PIN-kod: <code>${pin}</code> | Ball: <b>${st.points + st.bonusPoints}</b> (ID: ${st.id})\n`;
  });

  text += `\n💡 <i>O'quvchi botga kirib o'z ismini tanlaganda yuqoridagi 4 xonali PIN-kodni kiritishi kerak bo'ladi.</i>`;

  const keyboard = new InlineKeyboard()
    .text("➕ Yangi o'quvchi qo'shish", "admin_add_student")
    .row()
    .text("🗑 O'quvchini o'chirish", "admin_delete_student_list")
    .row()
    .text("⚠️ Barcha ballarni 0 qilish & uzish", "admin_reset_all_confirm");

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Confirm resetting all students and points
 */
export async function confirmResetAllStudents(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text("✅ Ha, barchasini tozalash", "admin_reset_all_execute")
    .text("❌ Bekor qilish", "admin_reset_all_cancel");

  const msg =
    "⚠️ <b>DIQQAT! HAMMA FOYDALANUVChI VA BALLARNI TOZALASH:</b>\n\n" +
    "Ushbu amal bajarilsa:\n" +
    "• Barcha o'quvchilarning to'plagan ballari <b>0</b> qilinadi;\n" +
    "• Barcha Telegram akkauntlar <b>uziladi</b> (o'quvchilar /start bosib PIN bilan qaytadan ulanishadi);\n" +
    "• Test topshirish natijalari tarixi tozalanadi;\n" +
    "• O'quvchilarning ismlari va PIN-kodlari saqlab qolinadi.\n\n" +
    "<b>Rostdan ham barchasini tozalashni tasdiqlaysizmi?</b>";

  if (ctx.callbackQuery) {
    return ctx.reply(msg, { parse_mode: "HTML", reply_markup: keyboard });
  }
  return ctx.reply(msg, { parse_mode: "HTML", reply_markup: keyboard });
}

/**
 * Execute resetting all students
 */
export async function executeResetAllStudents(ctx) {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCallbackQuery();

  const updated = await prisma.student.updateMany({
    data: {
      points: 0,
      bonusPoints: 0,
      telegramId: null,
      username: null,
    },
  });

  await prisma.quizSubmission.deleteMany();

  return ctx.editMessageText(
    `🎉 <b>Muvaffaqiyatli tozalandi!</b>\n\n` +
    `• Jami <b>${updated.count} ta</b> o'quvchi qayta tiklandi;\n` +
    `• Barcha test va bonus ballar <b>0</b> qilindi;\n` +
    `• Barcha Telegram hisoblari uzildi.\n\n` +
    `Ertaga ota-onalar va o'quvchilar botga kirib /start bosganda o'z PIN-kodlari bilan noldan ulanishadi! 🚀`,
    { parse_mode: "HTML" }
  );
}

/**
 * Cancel reset
 */
export async function cancelResetAllStudents(ctx) {
  await ctx.answerCallbackQuery({ text: "Tozalash bekor qilindi" });
  return ctx.editMessageText("❌ Tozalash amali bekor qilindi.");
}

/**
 * Helper to parse student name and PIN
 */
function parseStudentLine(line) {
  const trimmed = line.trim();
  // Check for formats like: "Ali Valiyev (1234)" or "Ali Valiyev - 1234" or "Ali Valiyev 1234"
  const pinMatch = trimmed.match(/^(.*?)(?:[\(\[\-\:\,\s]+(\d{3,6})[\)\]]*)?$/);

  if (pinMatch && pinMatch[2]) {
    const name = pinMatch[1].trim();
    const pin = pinMatch[2].trim();
    if (name.length >= 2) {
      return { fullName: name, pinCode: pin };
    }
  }

  // If only name provided, generate 4-digit random pin
  const randomPin = String(Math.floor(1000 + Math.random() * 9000));
  return { fullName: trimmed, pinCode: randomPin };
}

/**
 * Conversation: Add new student
 */
export async function addStudentConversation(conversation, ctx) {
  if (!isAdmin(ctx.from?.id)) return;
  await ctx.reply(
    "✏️ <b>YANGI O'QUVChI(LAR)NI QO'SHISH:</b>\n\n" +
    "O'quvchining Ism Familiyasini va ixtiyoriy PIN-kodini yozib yuboring.\n\n" +
    "<b>Misollar:</b>\n" +
    "• <code>Ali Valiyev (1234)</code>\n" +
    "• <code>Rustam Karimov (5544)</code>\n" +
    "• <code>Sobir Baxtiyorov</code> (agar PIN yozmasangiz, bot o'zi avtomatik 4 xonali PIN beradi)\n\n" +
    "<i>Bir nechta o'quvchini qo'shish uchun har birini yangi qatordan yozishingiz mumkin.</i>\n\n" +
    "Bekor qilish uchun /cancel deb yozing.",
    { parse_mode: "HTML" }
  );

  const response = await conversation.wait();
  if (response.message?.text === "/cancel") {
    return ctx.reply("❌ Amal bekor qilindi.");
  }

  const text = response.message?.text;
  if (!text) {
    return ctx.reply("❌ Matn kiritilmadi. Amal bekor qilindi.");
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let addedList = [];
  for (const line of lines) {
    const parsed = parseStudentLine(line);
    if (parsed.fullName.length >= 2) {
      const created = await conversation.external(() => prisma.student.create({
        data: {
          fullName: parsed.fullName,
          pinCode: parsed.pinCode,
        },
      }));
      addedList.push(created);
    }
  }

  let resultMsg = `✅ <b>${addedList.length} ta o'quvchi muvaffaqiyatli saqlandi!</b>\n\n`;
  addedList.forEach((st, idx) => {
    resultMsg += `<b>${idx + 1}. ${st.fullName}</b> ➡️ PIN: <code>${st.pinCode}</code>\n`;
  });
  resultMsg += `\n<i>PIN-kodlarni o'quvchilarga bering. Ular botga kirganda shu PIN orqali hisobini faollashtiradi.</i>`;

  return ctx.reply(resultMsg, { parse_mode: "HTML" });
}

/**
 * Delete student list selection
 */
export async function showDeleteStudentMenu(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const students = await prisma.student.findMany({
    orderBy: { fullName: "asc" },
  });

  const keyboard = new InlineKeyboard();
  students.forEach((st, idx) => {
    keyboard.text(`❌ ${st.fullName}`, `del_student:${st.id}`);
    if ((idx + 1) % 2 === 0) keyboard.row();
  });

  return ctx.reply("🗑 <b>O'chirmoqchi bo'lgan o'quvchini tanlang:</b>", {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

/**
 * Callback to delete student
 */
export async function deleteStudentCallback(ctx) {
  if (!isAdmin(ctx.from?.id)) return;
  const studentId = parseInt(ctx.callbackQuery.data.split(":")[1], 10);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) {
    return ctx.answerCallbackQuery({ text: "O'quvchi topilmadi!" });
  }

  await prisma.student.delete({
    where: { id: studentId },
  });

  await ctx.answerCallbackQuery({ text: "O'quvchi o'chirildi!" });
  return ctx.editMessageText(
    `🗑 <b>${student.fullName}</b> ro'yxatdan o'chirildi.`,
    { parse_mode: "HTML" }
  );
}

/**
 * Conversation: Give bonus/offline points to a student
 */
export async function giveBonusConversation(conversation, ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const students = await conversation.external(() => prisma.student.findMany({
    orderBy: { fullName: "asc" },
  }));

  if (students.length === 0) {
    return ctx.reply("Sinfda o'quvchilar mavjud emas.");
  }

  let listText = "➕ <b>Ball berish uchun o'quvchi ID raqamini kiriting:</b>\n\n";
  students.forEach((st) => {
    listText += `ID: <b>${st.id}</b> - ${st.fullName} (Joriy ball: ${st.points + st.bonusPoints})\n`;
  });
  listText += "\nBekor qilish uchun /cancel deb yozing.";

  await ctx.reply(listText, { parse_mode: "HTML" });

  const idMsg = await conversation.wait();
  if (idMsg.message?.text === "/cancel") return ctx.reply("❌ Bekor qilindi.");

  const studentId = parseInt(idMsg.message?.text, 10);
  const student = await conversation.external(() => prisma.student.findUnique({ where: { id: studentId } }));

  if (!student) {
    return ctx.reply("❌ Bunday ID ga ega o'quvchi topilmadi.");
  }

  await ctx.reply(
    `👤 <b>${student.fullName}</b> uchun qancha ball qo'shmoqchisiz?\n<i>(Masalan: 10, 20 yoki manfiy -5)</i>:`,
    { parse_mode: "HTML" }
  );

  const pointsMsg = await conversation.wait();
  if (pointsMsg.message?.text === "/cancel") return ctx.reply("❌ Bekor qilindi.");

  const points = parseInt(pointsMsg.message?.text, 10);
  if (isNaN(points)) {
    return ctx.reply("❌ Noto'g'ri son kiritildi. Amal bekor qilindi.");
  }

  const updated = await conversation.external(() => prisma.student.update({
    where: { id: studentId },
    data: { bonusPoints: { increment: points } },
  }));

  return ctx.reply(
    `✅ <b>${student.fullName}</b> ga <b>${points > 0 ? "+" : ""}${points} ball</b> qo'shildi!\n` +
    `Yangi umumiy ball: <b>${updated.points + updated.bonusPoints} ball</b>.`,
    { parse_mode: "HTML" }
  );
}