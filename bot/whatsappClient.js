const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

let qrCodeData = null; // Store QR for web display
let clientReady = false;
let clientInfo = null;

// ─── Create WhatsApp Client ──────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(), // Saves session locally (no QR scan every time)
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
    ],
  },
});

// ─── QR Code Event ──────────────────────────────────
client.on("qr", (qr) => {
  console.log("\n📱 Scan this QR code with your WhatsApp:\n");
  qrcode.generate(qr, { small: true });
  qrCodeData = qr; // Save for web route
  console.log("\n🌐 Or open http://localhost:3000/qr in your browser\n");
});

// ─── Ready Event ─────────────────────────────────────
client.on("ready", () => {
  clientReady = true;
  clientInfo = client.info;
  qrCodeData = null; // Clear QR after successful login
  console.log("════════════════════════════════════════");
  console.log("✅ WhatsApp Bot is READY!");
  console.log(`📱 Connected as: ${client.info.pushname}`);
  console.log(`📞 Number: ${client.info.wid.user}`);
  console.log("════════════════════════════════════════");
});

// ─── Authentication Events ───────────────────────────
client.on("authenticated", () => {
  console.log("🔐 Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Authentication failed:", msg);
  clientReady = false;
});

// ─── Disconnected Event ──────────────────────────────
client.on("disconnected", (reason) => {
  console.log("🔌 Client disconnected:", reason);
  clientReady = false;
  clientInfo = null;
});

// ─── Getters ─────────────────────────────────────────
const getQR = () => qrCodeData;
const isReady = () => clientReady;
const getInfo = () => clientInfo;

module.exports = {
  client,
  getQR,
  isReady,
  getInfo,
  MessageMedia,
};
