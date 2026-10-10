import { Keyboard } from "grammy";

/**
 * Student reply keyboard menu
 */
export function getStudentMainMenu() {
  return new Keyboard()
    .text("📝 Mavjud Testlar").text("📅 Dars Jadvali")
    .row()
    .text("🏆 Reyting & Ballarim").text("👤 Profilim")
    .row()
    .text("🤖 AI Repetitor")
    .resized();
}