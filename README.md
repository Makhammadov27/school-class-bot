

 `.env` Fayli Tarkibi:
```env
BOT_TOKEN=8741849192:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_IDS=73********
ATTENDANCE_POINTS=5
QUIZ_POINT_MULTIPLIER=10
```

## Serverni yangilash (SSH / PM2)

Node.js 22 yoki 24 LTS talab qilinadi. Bot faqat bitta jarayonda ishlashi kerak.

1. `pm2 list` va `pgrep -af 'node.*src/bot.js'` orqali mavjud jarayonlarni tekshiring.
2. `.env` va `prisma/dev.db` fayllarining zaxira nusxasini oling. 
3. Kodni yangilang, `npm ci`, `npm run prisma:generate` va `npm test` ni bajaring.
4. `pm2 restart ecosystem.config.cjs --update-env` orqali mavjud botni yangilang; bot hali PM2da bo'lmasa `pm2 start ecosystem.config.cjs` ishlating.
5. `pm2 logs school-class-bot --lines 50` ni tekshirib, `pm2 save` bajaring.

`TZ=Asia/Tashkent` eslatmalarni Toshkent vaqtida ishlatadi. Davomat eslatmasi 12:20, jadval eslatmasi 20:00.

Rejalashtirilgan vazifalar SQLite bazasidagi `ScheduledRun` jadvali orqali bir daqiqa uchun bir marta bajariladi. Bu bir xil bazadan foydalanuvchi ikki jarayonda takror yuborishni to'sadi. Alohida bazalarda ishlayotgan eski bot nusxalari serverda to'xtatilishi kerak. Vazifa yuborish paytida uzilsa, takroriy xabar yubormaslik uchun shu daqiqada avtomatik qayta bajarilmaydi.

Tekshirish: `npm test`. Sinovlar haqiqiy Telegram xabarlarini yubormaydi va o'quvchilar bazasini o'zgartirmaydi.
