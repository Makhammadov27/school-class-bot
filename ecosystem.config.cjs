module.exports = {
  apps: [
    {
      name: "school-class-bot",
      script: "src/bot.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Tashkent",
      },
    },
  ],
};