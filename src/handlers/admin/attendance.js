import { prisma } from "../../database/prisma.js";
import { isAdmin } from "../../config/config.js";
import { InlineKeyboard } from "grammy";

/**
 * Get formatted current date (YYYY-MM-DD)
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Shorten name for compact button display (e.g. "Aliyev Jasur" -> "Aliyev J.")
 */
function formatShortName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1][0]}.`;
  }
  return fullName;
}

/**
 * Build attendance view message and buttons for admin
 */
async function buildAttendancePanel(dateStr) {
  const students = await prisma.student.findMany({
    orderBy: { fullName: "asc" },
    include: {
      attendances: {
        where: { date: dateStr },
      },
    },
  });

  if (students.length === 0) {
    return {
      text: "👥 <b>Sinfda o'quvchilar yo'q.</b>\nAvval <b>'👥 O'quvchilar'</b> bo'limidan o'quvchilarni qo'shing.",
      keyboard: null,
    };
  }

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let unmarkedCount = 0;

  const keyboard = new InlineKeyboard();

  // 1. Quick Action: Mark all as present
  keyboard.text("⚡️ Barchasini «Keldi» qilish", `att_all_present:${dateStr}`).row();

  let text = `📋 <b>SINF DAVOMATI</b>\n📅 Sana: <b>${dateStr}</b>\n\n`;

  students.forEach((st, idx) => {
    const att = st.attendances[0];
    let icon = "⚪️";
    let statusText = "Belgilanmagan";

    if (att) {
      if (att.status === "PRESENT") {
        icon = "✅";
        statusText = "Keldi";
        presentCount++;
      } else if (att.status === "ABSENT") {
        icon = "❌";
        statusText = "Kelmadi";
        absentCount++;
      } else if (att.status === "LATE") {
        icon = "⏱";
        statusText = "Kechikdi";
        lateCount++;
      }
    } else {
      unmarkedCount++;
    }

    text += `${icon} <b>${idx + 1}. ${st.fullName}</b> — ${statusText}\n`;

    // Compact button with name + icon
    const shortName = formatShortName(st.fullName);
    keyboard.text(`${icon} ${idx + 1}. ${shortName}`, `att_toggle:${st.id}:${dateStr}`);

    // 2 buttons per row for great readability
    if ((idx + 1) % 2 === 0 && idx + 1 < students.length) {
      keyboard.row();
    }
  });

  keyboard.row();

  text += `\n📊 <b>Xulosa:</b>\n` +
    `✅ Kelgan: <b>${presentCount}</b> ta | ❌ Kelmagan: <b>${absentCount}</b> ta\n` +
    `⏱ Kechikkan: <b>${lateCount}</b> ta | ⚪️ Belgilanmagan: <b>${unmarkedCount}</b> ta\n\n` +
    `💡 <i>O'quvchi tugmasini bosib holatini o'zgartiring:\n(✅ Keldi ➡️ ❌ Kelmadi ➡️ ⏱ Kechikdi)</i>`;

  keyboard
    .text("💾 Saqlash va Yakunlash", `att_finish:${dateStr}`)
    .text("🔄 Yangilash", `att_refresh:${dateStr}`);

  return { text, keyboard };
}

/**
 * Handle "📋 Davomat olish" command/button
 * @param {import("grammy").Context} ctx
 */
export async function startAttendanceHandler(ctx) {
  if (!isAdmin(ctx.from.id)) return;

  const today = getTodayDateString();
  const { text, keyboard } = await buildAttendancePanel(today);

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard || undefined,
  });
}

/**
 * Callback handler for attendance toggles
 * @param {import("grammy").Context} ctx
 */
export async function attendanceCallbackHandler(ctx) {
  if (!isAdmin(ctx.from?.id)) return;
  const data = ctx.callbackQuery.data;

  // 1. Refresh
  if (data.startsWith("att_refresh:")) {
    const dateStr = data.split(":")[1];
    const { text, keyboard } = await buildAttendancePanel(dateStr);
    await ctx.answerCallbackQuery({ text: "Yangilandi!" });
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (e) {}
    return;
  }

  // 2. Mark All Present
  if (data.startsWith("att_all_present:")) {
    const dateStr = data.split(":")[1];
    const students = await prisma.student.findMany();

    for (const st of students) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: {
            studentId: st.id,
            date: dateStr,
          },
        },
        update: { status: "PRESENT" },
        create: {
          studentId: st.id,
          date: dateStr,
          status: "PRESENT",
        },
      });
    }

    await ctx.answerCallbackQuery({ text: "⚡️ Barcha o'quvchilar «Keldi» qilindi!" });
    const { text, keyboard } = await buildAttendancePanel(dateStr);
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (e) {}
    return;
  }

  // 3. Toggle single student (Cycle: PRESENT -> ABSENT -> LATE -> PRESENT)
  if (data.startsWith("att_toggle:")) {
    const [, studentIdStr, dateStr] = data.split(":");
    const studentId = parseInt(studentIdStr, 10);

    const current = await prisma.attendance.findUnique({
      where: {
        studentId_date: {
          studentId,
          date: dateStr,
        },
      },
    });

    let nextStatus = "PRESENT";
    if (current) {
      if (current.status === "PRESENT") nextStatus = "ABSENT";
      else if (current.status === "ABSENT") nextStatus = "LATE";
      else if (current.status === "LATE") nextStatus = "PRESENT";
    }

    await prisma.attendance.upsert({
      where: {
        studentId_date: {
          studentId,
          date: dateStr,
        },
      },
      update: { status: nextStatus },
      create: {
        studentId,
        date: dateStr,
        status: nextStatus,
      },
    });

    const statusMsg =
      nextStatus === "PRESENT"
        ? "✅ Keldi"
        : nextStatus === "ABSENT"
        ? "❌ Kelmadi"
        : "⏱ Kechikdi";

    await ctx.answerCallbackQuery({ text: `${statusMsg} belgilandi` });

    const { text, keyboard } = await buildAttendancePanel(dateStr);
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (e) {}
    return;
  }

  // 4. Finish / Save
  if (data.startsWith("att_finish:")) {
    const dateStr = data.split(":")[1];
    await ctx.answerCallbackQuery({
      text: "✅ Davomat muvaffaqiyatli saqlandi!",
      show_alert: true,
    });
    return;
  }
}