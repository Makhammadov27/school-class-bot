# 🏫 Maktab Sinf Boshqaruvi Telegram Boti

Maktab sinfi uchun to'liq avtomatlashgan, qulay va keng qamrovli boshqaruv tizimi (Google Gemini AI testlar generatori bilan).

---

## 🌟 Asosiy Imkoniyatlar

 **👥 Gibrid O'quvchilar Boshqaruvi:**
   - Admin o'quvchilarni ism-familiyasi bilan kiritadi.
   - Telefoni bor o'quvchilar bot orqali o'z ismini tanlab, bir tugma bilan ulanadi.
   - Telefoni yo'q o'quvchilar uchun admin qo'lda test va bonus ballar qo'shishi mumkin.



 **🤖 Google Gemini AI Testlari:**
   - **Dushanba 12:00:**  Darsligi bo'yicha 15 talik yangi test yuklanadi ➡️ **Chorshanba 12:00 da** yopiladi.
   - **Payshanba 12:00:** Keyingi fandan 15 talik yangi test yuklanadi ➡️ **Shanba 12:00 da** yopiladi.


 **🏆 "Oy O'quvchisi" & Reyting:**
   - Ballar formulasi: `(Davomat kunlari × 5) + (To'g'ri test javoblari × 10) + Bonus ballar`.
   - Oylik liderlar reytingi va bir bosishda chiroyli `.xlsx` (Excel) hisobotini yuklab olish.

**📅 Dars Jadvali & Eslatmalar:**
   - Haftalik dars jadvalini kiritish, tahrirlash va tozalash.
   - Har kuni soat **20:00** da ertangi darslar jadvalini bot o'quvchilarga avtomatik yuboradi.
   - Dushanba-Shanba kunlari soat **12:20** da adminga davomat eslatmasi.

---

 `.env` Fayli Tarkibi:
```env
BOT_TOKEN=8741849192:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_IDS=7317240558
ATTENDANCE_POINTS=5
QUIZ_POINT_MULTIPLIER=10
```

## Serverni yangilash (SSH / PM2)

Node.js 22 yoki 24 LTS talab qilinadi. Bot faqat bitta jarayonda ishlashi kerak.

1. `pm2 list` va `pgrep -af 'node.*src/bot.js'` orqali mavjud jarayonlarni tekshiring.
2. `.env` va `prisma/dev.db` fayllarining zaxira nusxasini oling. Ularni GitHubga yubormang.
3. Kodni yangilang, `npm ci`, `npm run prisma:generate` va `npm test` ni bajaring.
4. `pm2 restart ecosystem.config.cjs --update-env` orqali mavjud botni yangilang; bot hali PM2da bo'lmasa `pm2 start ecosystem.config.cjs` ishlating.
5. `pm2 logs school-class-bot --lines 50` ni tekshirib, `pm2 save` bajaring.

`TZ=Asia/Tashkent` eslatmalarni Toshkent vaqtida ishlatadi. Davomat eslatmasi 12:20, jadval eslatmasi 20:00.

Rejalashtirilgan vazifalar SQLite bazasidagi `ScheduledRun` jadvali orqali bir daqiqa uchun bir marta bajariladi. Bu bir xil bazadan foydalanuvchi ikki jarayonda takror yuborishni to'sadi. Alohida bazalarda ishlayotgan eski bot nusxalari serverda to'xtatilishi kerak. Vazifa yuborish paytida uzilsa, takroriy xabar yubormaslik uchun shu daqiqada avtomatik qayta bajarilmaydi.

Tekshirish: `npm test`. Sinovlar haqiqiy Telegram xabarlarini yubormaydi va o'quvchilar bazasini o'zgartirmaydi.
