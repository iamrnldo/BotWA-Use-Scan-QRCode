const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const { client, getQR, isReady, getInfo } = require("../bot/whatsappClient");

/**
 * GET /qr — Show QR code in browser
 */
router.get("/qr", async (req, res) => {
  const qr = getQR();

  if (isReady()) {
    return res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;
                     height:100vh;font-family:Arial;background:#1a1a2e;color:#00ff88;">
          <div style="text-align:center;">
            <h1>✅ Bot is Already Connected!</h1>
            <p>Connected as: <strong>${getInfo()?.pushname}</strong></p>
            <p>Number: <strong>${getInfo()?.wid?.user}</strong></p>
            <br><a href="/status" style="color:#00aaff;">View Status →</a>
          </div>
        </body>
      </html>
    `);
  }

  if (!qr) {
    return res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;
                     height:100vh;font-family:Arial;background:#1a1a2e;color:#ffaa00;">
          <div style="text-align:center;">
            <h1>⏳ Waiting for QR Code...</h1>
            <p>Please wait, the QR code is being generated.</p>
            <p>This page will auto-refresh.</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const qrImage = await QRCode.toDataURL(qr);
    res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;
                     height:100vh;font-family:Arial;background:#1a1a2e;color:white;">
          <div style="text-align:center;">
            <h1>📱 Scan QR Code</h1>
            <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
            <br>
            <img src="${qrImage}" style="width:300px;height:300px;border-radius:10px;">
            <p style="color:#ffaa00;margin-top:20px;">
              ⏳ Waiting for scan... (auto-refreshes)
            </p>
            <script>setTimeout(() => location.reload(), 20000);</script>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Error generating QR code");
  }
});

/**
 * GET /status — Bot status
 */
router.get("/status", (req, res) => {
  res.json({
    status: isReady() ? "connected" : "disconnected",
    bot: isReady()
      ? {
          name: getInfo()?.pushname,
          number: getInfo()?.wid?.user,
          platform: getInfo()?.platform,
        }
      : null,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /send — Send a message via API
 *
 * Body: { "number": "1234567890", "message": "Hello!" }
 */
router.post("/send", async (req, res) => {
  try {
    if (!isReady()) {
      return res.status(503).json({
        success: false,
        error: "Bot is not connected. Scan QR first.",
      });
    }

    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: "Both 'number' and 'message' are required.",
        example: {
          number: "1234567890",
          message: "Hello from the bot!",
        },
      });
    }

    // Format number: remove +, spaces, dashes → add @c.us
    const formattedNumber = number.replace(/[\s\-\+]/g, "");
    const chatId = `${formattedNumber}@c.us`;

    // Check if number exists on WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(404).json({
        success: false,
        error: `Number ${number} is not registered on WhatsApp.`,
      });
    }

    // Send message
    const response = await client.sendMessage(chatId, message);

    res.json({
      success: true,
      message: "Message sent successfully!",
      data: {
        to: number,
        body: message,
        timestamp: response.timestamp,
        messageId: response.id.id,
      },
    });
  } catch (error) {
    console.error("❌ Send error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /send-image — Send an image via URL
 *
 * Body: { "number": "1234567890", "imageUrl": "https://...", "caption": "Hi" }
 */
router.post("/send-image", async (req, res) => {
  try {
    if (!isReady()) {
      return res
        .status(503)
        .json({ success: false, error: "Bot not connected" });
    }

    const { number, imageUrl, caption } = req.body;
    const { MessageMedia } = require("../bot/whatsappClient");

    const formattedNumber = number.replace(/[\s\-\+]/g, "");
    const chatId = `${formattedNumber}@c.us`;

    const media = await MessageMedia.fromUrl(imageUrl);
    await client.sendMessage(chatId, media, { caption: caption || "" });

    res.json({ success: true, message: "Image sent!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /chats — Get recent chats
 */
router.get("/chats", async (req, res) => {
  try {
    if (!isReady()) {
      return res
        .status(503)
        .json({ success: false, error: "Bot not connected" });
    }

    const chats = await client.getChats();
    const chatList = chats.slice(0, 20).map((chat) => ({
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body?.slice(0, 50),
      timestamp: chat.timestamp,
    }));

    res.json({ success: true, chats: chatList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
