const express = require("express");
const { client } = require("./bot/whatsappClient");
const {
  setupMessageHandler,
  setupWelcomeMessage,
  botConfig,
} = require("./handlers/messageHandler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial;background:#0d1117;color:#c9d1d9;
                   display:flex;justify-content:center;align-items:center;height:100vh;">
        <div style="text-align:center;">
          <h1>🤖 WhatsApp Bot</h1>
          <p>Bot is running!</p>
          <a href="/qr" style="color:#58a6ff;font-size:18px;">📱 Scan QR</a><br><br>
          <a href="/status" style="color:#58a6ff;font-size:18px;">📊 Status</a>
        </div>
      </body>
    </html>
  `);
});

app.get("/status", (req, res) => {
  res.json({
    owner: botConfig.owner,
    admins: botConfig.admins,
    bannedUsers: botConfig.bannedUsers,
    customCommands: Object.keys(botConfig.customCommands),
    uptime: process.uptime(),
  });
});

setupMessageHandler();
setupWelcomeMessage();

console.log("🔄 Initializing WhatsApp client...");
client.initialize();

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
