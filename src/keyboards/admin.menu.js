import { Keyboard, InlineKeyboard } from "grammy";

/**
 * Admin reply keyboard menu
 */
export function getAdminMainMenu() {
  return new Keyboard()
    .text("📋 Davomat olish").text("👥 O'quvchilar")
    .row()
    .text("📝 Testlar & AI").text("📅 Dars Jadvali")
    .row()
    .text("📊 Statistika & Excel").text("📢 E'lon yuborish")
    .row()
    .text("➕ Qo'shimcha ball berish").text("🤖 AI Repetitor")
    .resized();
}

/**
 * Attendance status inline buttons for single student
 */
export function getAttendanceButtons(studentId, currentDate, status = "PRESENT") {
  const keyboard = new InlineKeyboard();

  keyboard
    .text(status === "PRESENT" ? "✅ Keldi" : "Keldi", `att:${studentId}:${currentDate}:PRESENT`)
    .text(status === "ABSENT" ? "❌ Kelmadi" : "Kelmadi", `att:${studentId}:${currentDate}:ABSENT`)
    .text(status === "LATE" ? "⏱ Kechikdi" : "Kechikdi", `att:${studentId}:${currentDate}:LATE`);

  return keyboard;
}