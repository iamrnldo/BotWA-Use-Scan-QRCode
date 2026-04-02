const { client, MessageMedia } = require("../bot/whatsappClient");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
//  CONFIGURATION MANAGER
// ═══════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, "..", "bot_config.json");

let botConfig = {
  owner: "6287719010818@c.us",
  admins: [],
  bannedUsers: [],
  customCommands: {},
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      botConfig = JSON.parse(data);
      console.log("📂 Config loaded.");
    } else {
      saveConfig();
      console.log("📂 Config created.");
    }
  } catch (e) {
    console.error("Error loading config:", e);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
  } catch (e) {
    console.error("Error saving config:", e);
  }
}

loadConfig();

// ═══════════════════════════════════════════════════════
//  ROLE CHECK HELPERS
// ═══════════════════════════════════════════════════════

function isOwner(userId) {
  return userId === botConfig.owner;
}

function isAdminUser(userId) {
  return botConfig.admins.includes(userId);
}

function isBanned(userId) {
  return botConfig.bannedUsers.includes(userId);
}

function getUserRole(userId) {
  if (isOwner(userId)) return "👑 OWNER";
  if (isAdminUser(userId)) return "🛡️ ADMIN";
  return "👤 USER";
}

// ═══════════════════════════════════════════════════════
//  STATE MANAGEMENT
// ═══════════════════════════════════════════════════════

const userState = new Map();

function getState(message) {
  const key = `${message.from}_${message.author || message.from}`;
  return userState.get(key) || null;
}

function setState(message, menu) {
  const key = `${message.from}_${message.author || message.from}`;
  userState.set(key, { menu, lastActivity: Date.now() });
}

function clearState(message) {
  const key = `${message.from}_${message.author || message.from}`;
  userState.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of userState.entries()) {
    if (now - val.lastActivity > 10 * 60 * 1000) {
      userState.delete(key);
    }
  }
}, 60000);

// ═══════════════════════════════════════════════════════
//  SETUP MESSAGE HANDLER
// ═══════════════════════════════════════════════════════

function setupMessageHandler() {
  client.on("message_create", async (message) => {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();

      if (message.from === "status@broadcast") return;

      const userId = contact.id._serialized;

      if (isBanned(userId)) return;

      console.log(
        `📩 [${chat.isGroup ? chat.name : "Private"}] ` +
          `${contact.pushname || contact.number}: ${message.body} ` +
          `(Role: ${getUserRole(userId)})`,
      );

      await handleMessage(message, contact, chat);
    } catch (error) {
      console.error("❌ Error:", error);
    }
  });

  console.log("📨 Message handler with RBAC ready!");
}

// ═══════════════════════════════════════════════════════
//  SETUP WELCOME MESSAGE
// ═══════════════════════════════════════════════════════

function setupWelcomeMessage() {
  client.on("group_join", async (notification) => {
    try {
      const chat = await notification.getChat();
      const contact = await notification.getContact();
      const name = contact.pushname || contact.number;

      const text =
        `╔══════════════════════╗\n` +
        `║   👋 *WELCOME!*       ║\n` +
        `╚══════════════════════╝\n\n` +
        `Halo @${contact.id.user}! 🎉\n\n` +
        `Selamat datang di *${chat.name}*!\n\n` +
        `📋 Ketik *.menu* untuk melihat menu\n\n` +
        `Selamat bergabung! 🤖`;

      await chat.sendMessage(text, { mentions: [contact] });
      console.log(`👋 Welcomed ${name} to ${chat.name}`);
    } catch (e) {
      console.error("Welcome error:", e);
    }
  });

  client.on("group_leave", async (notification) => {
    try {
      const chat = await notification.getChat();
      const contact = await notification.getContact();
      const name = contact.pushname || contact.number;
      await chat.sendMessage(`👋 *${name}* keluar dari group. Sampai jumpa!`);
    } catch (e) {
      console.error("Leave error:", e);
    }
  });

  console.log("👋 Welcome/Leave handler ready!");
}

// ═══════════════════════════════════════════════════════
//  MAIN MESSAGE HANDLER
// ═══════════════════════════════════════════════════════

async function handleMessage(message, contact, chat) {
  const text = message.body.trim();
  const textLower = text.toLowerCase();
  const name = contact.pushname || contact.number || "Friend";
  const isGroup = chat.isGroup;
  const userId = contact.id._serialized;
  const role = getUserRole(userId);

  // ─── PREFIX COMMANDS (.menu, .ping, etc.) ───
  const prefixMatch = text.match(/^[.!/](\w+)\s*([\s\S]*)/);

  if (prefixMatch) {
    const command = prefixMatch[1].toLowerCase();
    const args = prefixMatch[2]?.trim() || "";

    await chat.sendStateTyping();
    await delay(500);

    // ══════════════════════════════════
    //  OWNER ONLY COMMANDS
    // ══════════════════════════════════

    if (command === "owner") {
      if (!isOwner(userId)) {
        return message.reply(
          "🚫 *Akses Ditolak!*\n\nHanya Owner yang bisa membuka menu ini.",
        );
      }
      return await showOwnerMenu(message);
    }

    if (command === "addcommand") {
      if (!isOwner(userId)) {
        return message.reply(
          "🚫 *Akses Ditolak!*\nHanya Owner yang bisa menambah command.",
        );
      }
      return await cmdAddCommand(message, args);
    }

    if (command === "delcommand") {
      if (!isOwner(userId)) {
        return message.reply(
          "🚫 *Akses Ditolak!*\nHanya Owner yang bisa menghapus command.",
        );
      }
      return await cmdDelCommand(message, args);
    }

    if (command === "listcommand" || command === "listcmd") {
      if (!isOwner(userId)) {
        return message.reply("🚫 *Akses Ditolak!*");
      }
      return await cmdListCommand(message);
    }

    if (command === "addadmin") {
      if (!isOwner(userId)) {
        return message.reply(
          "🚫 *Akses Ditolak!*\nHanya Owner yang bisa menambah admin.",
        );
      }
      return await cmdAddAdmin(message, chat, args);
    }

    // ══════════════════════════════════
    //  OWNER + ADMIN COMMANDS
    // ══════════════════════════════════

    if (command === "adminmenu") {
      if (!isOwner(userId) && !isAdminUser(userId)) {
        return message.reply(
          "🚫 *Akses Ditolak!*\nHanya Admin/Owner yang bisa membuka menu ini.",
        );
      }
      return await showAdminRoleMenu(message);
    }

    if (command === "deladmin") {
      if (!isOwner(userId) && !isAdminUser(userId)) {
        return message.reply("🚫 *Akses Ditolak!*");
      }
      return await cmdDelAdmin(message, chat, args, userId);
    }

    if (command === "banuser") {
      if (!isOwner(userId) && !isAdminUser(userId)) {
        return message.reply("🚫 *Akses Ditolak!*");
      }
      return await cmdBanUser(message, chat, args, userId);
    }

    if (command === "unban") {
      if (!isOwner(userId) && !isAdminUser(userId)) {
        return message.reply("🚫 *Akses Ditolak!*");
      }
      return await cmdUnbanUser(message, args);
    }

    if (command === "listadmin") {
      if (!isOwner(userId) && !isAdminUser(userId)) {
        return message.reply("🚫 *Akses Ditolak!*");
      }
      return await cmdListAdmin(message);
    }

    if (command === "listban") {
      if (!isOwner(userId) && !isAdminUser(userId)) {
        return message.reply("🚫 *Akses Ditolak!*");
      }
      return await cmdListBan(message);
    }

    // ══════════════════════════════════
    //  PUBLIC COMMANDS
    // ══════════════════════════════════

    if (command === "menu" || command === "start" || command === "help") {
      return await showMainMenu(message, name, isGroup, userId);
    }
    if (command === "ping") return await cmdPing(message);
    if (command === "sticker" || command === "s")
      return await cmdSticker(message, chat);
    if (command === "tagall" || command === "everyone") {
      if (!isGroup) return message.reply("❌ Group only.");
      return await cmdTagAll(message, chat, contact);
    }

    // ── BUAT WEB ──
    if (
      command === "buatweb" ||
      command === "jasaweb" ||
      command === "website"
    ) {
      return await showBuatWebMenu(message);
    }

    // ── GAMES ──
    if (command === "games") return await showGamesMenu(message);
    if (command === "roll" || command === "dice") return await cmdDice(message);
    if (command === "flip" || command === "coin")
      return await cmdCoinFlip(message);
    if (command === "joke") return await cmdJoke(message);
    if (command === "quote") return await cmdQuote(message);

    // ── TOOLS ──
    if (command === "tools") return await showToolsMenu(message);
    if (command === "calc") return await cmdCalc(message, args);
    if (command === "uppercase" && args)
      return await message.reply(`🔤 ${args.toUpperCase()}`);
    if (command === "lowercase" && args)
      return await message.reply(`🔡 ${args.toLowerCase()}`);
    if (command === "reverse" && args)
      return await message.reply(`🔄 ${args.split("").reverse().join("")}`);

    // ── Check Custom Commands ──
    if (botConfig.customCommands[command]) {
      return await message.reply(botConfig.customCommands[command]);
    }

    return message.reply(
      `❌ Command tidak dikenal: *${command}*\n\nKetik *.menu* untuk bantuan.`,
    );
  }

  // ─── NUMBER REPLIES ───
  const state = getState(message);

  if (state && /^[0-9]+$/.test(textLower)) {
    const choice = parseInt(textLower);
    await chat.sendStateTyping();
    await delay(500);
    await handleNumberReply(
      message,
      contact,
      chat,
      state.menu,
      choice,
      name,
      isGroup,
      userId,
    );
    return;
  }

  if (state && ["0", "back", "kembali", "batal"].includes(textLower)) {
    return await showMainMenu(message, name, isGroup, userId);
  }

  // ─── TEXT INPUT FOR TOOLS ───
  if (state) {
    await chat.sendStateTyping();
    await delay(300);
    await handleTextInput(message, state.menu, name, isGroup);
  }
}

// ═══════════════════════════════════════════════════════
//  TEXT INPUT HANDLER (for calc, uppercase, etc.)
// ═══════════════════════════════════════════════════════

async function handleTextInput(message, menu, name, isGroup) {
  const text = message.body.trim();

  switch (menu) {
    case "calc":
      await cmdCalc(message, text);
      setState(message, "tools");
      break;

    case "uppercase":
      await message.reply(`🔤 *Hasil:*\n${text.toUpperCase()}`);
      setState(message, "tools");
      break;

    case "lowercase":
      await message.reply(`🔡 *Hasil:*\n${text.toLowerCase()}`);
      setState(message, "tools");
      break;

    case "reverse":
      await message.reply(`🔄 *Hasil:*\n${text.split("").reverse().join("")}`);
      setState(message, "tools");
      break;

    case "count":
      await message.reply(
        `📏 *Statistik Teks:*\n\n` +
          `Karakter: *${text.length}*\n` +
          `Kata: *${text.split(/\s+/).filter(Boolean).length}*`,
      );
      setState(message, "tools");
      break;

    case "8ball":
      await cmd8Ball(message, text);
      setState(message, "games");
      break;

    case "rate":
      const rating = Math.floor(Math.random() * 10) + 1;
      const stars =
        "⭐".repeat(Math.ceil(rating / 2)) +
        "☆".repeat(5 - Math.ceil(rating / 2));
      await message.reply(
        `⭐ *Rating:*\n\n"${text}"\n${stars}\nSkor: *${rating}/10*`,
      );
      setState(message, "games");
      break;

    default:
      break;
  }
}

// ═══════════════════════════════════════════════════════
//  NUMBER REPLY ROUTER
// ═══════════════════════════════════════════════════════

async function handleNumberReply(
  message,
  contact,
  chat,
  menu,
  choice,
  name,
  isGroup,
  userId,
) {
  switch (menu) {
    // ── MAIN MENU ──
    case "main":
      switch (choice) {
        case 1:
          await showBuatWebMenu(message);
          break;
        case 2:
          await showGamesMenu(message);
          break;
        case 3:
          await showToolsMenu(message);
          break;
        case 4:
          if (isOwner(userId)) await showOwnerMenu(message);
          else if (isAdminUser(userId)) await showAdminRoleMenu(message);
          else
            await message.reply(
              "🚫 *Akses Ditolak!*\nMenu ini hanya untuk Admin/Owner.",
            );
          break;
        case 5:
          await showInfo(message, contact, chat, userId);
          break;
        default:
          await message.reply(
            "❌ Pilihan tidak valid.\nBalas *back* untuk kembali.",
          );
      }
      break;

    // ── OWNER MENU ──
    case "owner":
      switch (choice) {
        case 1: // Add Command
          setState(message, "addcmd_prompt");
          await client.sendMessage(
            message.from,
            `➕ *TAMBAH COMMAND*\n\n` +
              `Kirim dalam format:\n` +
              `*keyword|respon bot*\n\n` +
              `Contoh:\n` +
              `_salam|Assalamualaikum! 👋_\n` +
              `_jadwal|Senin-Jumat: 08:00-17:00_\n\n` +
              `Balas *cancel* untuk batal`,
          );
          break;
        case 2: // Del Command
          await cmdListCommand(message);
          setState(message, "delcmd_prompt");
          await delay(1000);
          await client.sendMessage(
            message.from,
            `🗑️ Ketik nama command yang mau dihapus\n` +
              `(tanpa titik/prefix)\n\n` +
              `Balas *cancel* untuk batal`,
          );
          break;
        case 3: // List Commands
          await cmdListCommand(message);
          setState(message, "owner");
          break;
        case 4: // Add Admin
          setState(message, "addadmin_prompt");
          await client.sendMessage(
            message.from,
            `➕ *TAMBAH ADMIN*\n\n` +
              `Kirim nomor WhatsApp:\n` +
              `Contoh: _6281234567890_\n\n` +
              `Balas *cancel* untuk batal`,
          );
          break;
        case 5: // Del Admin
          await cmdListAdmin(message);
          setState(message, "deladmin_prompt");
          await delay(1000);
          await client.sendMessage(
            message.from,
            `🗑️ Kirim nomor admin yang mau dihapus:\n` +
              `Contoh: _6281234567890_\n\n` +
              `Balas *cancel* untuk batal`,
          );
          break;
        case 6: // Ban User
          setState(message, "ban_prompt");
          await client.sendMessage(
            message.from,
            `🚫 *BAN USER*\n\n` +
              `Kirim nomor WhatsApp:\n` +
              `Contoh: _6281234567890_\n\n` +
              `Balas *cancel* untuk batal`,
          );
          break;
        case 7: // Unban
          await cmdListBan(message);
          setState(message, "unban_prompt");
          await delay(1000);
          await client.sendMessage(
            message.from,
            `✅ Kirim nomor yang mau di-unban:\n` +
              `Contoh: _6281234567890_\n\n` +
              `Balas *cancel* untuk batal`,
          );
          break;
        case 8: // List Admin
          await cmdListAdmin(message);
          setState(message, "owner");
          break;
        case 9: // List Ban
          await cmdListBan(message);
          setState(message, "owner");
          break;
        case 0:
          await showMainMenu(message, name, isGroup, userId);
          break;
        default:
          await message.reply("❌ Pilihan tidak valid.");
      }
      break;

    // ── ADMIN MENU ──
    case "admin_role":
      switch (choice) {
        case 1: // Del Admin
          await cmdListAdmin(message);
          setState(message, "deladmin_prompt");
          await delay(1000);
          await client.sendMessage(
            message.from,
            `🗑️ Kirim nomor admin yang mau dihapus:\nBalas *cancel* untuk batal`,
          );
          break;
        case 2: // Ban User
          setState(message, "ban_prompt");
          await client.sendMessage(
            message.from,
            `🚫 *BAN USER*\n\nKirim nomor WhatsApp:\nBalas *cancel* untuk batal`,
          );
          break;
        case 3: // Unban
          await cmdListBan(message);
          setState(message, "unban_prompt");
          await delay(1000);
          await client.sendMessage(
            message.from,
            `✅ Kirim nomor yang mau di-unban:\nBalas *cancel* untuk batal`,
          );
          break;
        case 4:
          await cmdListAdmin(message);
          setState(message, "admin_role");
          break;
        case 5:
          await cmdListBan(message);
          setState(message, "admin_role");
          break;
        case 0:
          await showMainMenu(message, name, isGroup, userId);
          break;
        default:
          await message.reply("❌ Pilihan tidak valid.");
      }
      break;

    // ── PROMPTS (text input after number selection) ──
    case "addcmd_prompt":
      await handleAddCmdInput(
        message,
        message.body.trim(),
        name,
        isGroup,
        userId,
      );
      break;

    case "delcmd_prompt":
      await handleDelCmdInput(
        message,
        message.body.trim(),
        name,
        isGroup,
        userId,
      );
      break;

    case "addadmin_prompt":
      await handleAddAdminInput(
        message,
        message.body.trim(),
        name,
        isGroup,
        userId,
      );
      break;

    case "deladmin_prompt":
      await handleDelAdminInput(
        message,
        message.body.trim(),
        name,
        isGroup,
        userId,
      );
      break;

    case "ban_prompt":
      await handleBanInput(message, message.body.trim(), name, isGroup, userId);
      break;

    case "unban_prompt":
      await handleUnbanInput(
        message,
        message.body.trim(),
        name,
        isGroup,
        userId,
      );
      break;

    // ── BUAT WEB ──
    case "buatweb":
      switch (choice) {
        case 1:
          await showPaket1(message);
          break;
        case 2:
          await showPaket2(message);
          break;
        case 3:
          await showPaket3(message);
          break;
        case 0:
          await showMainMenu(message, name, isGroup, userId);
          break;
        default:
          await message.reply(
            "❌ Balas *1*, *2*, atau *3*\nBalas *back* untuk kembali.",
          );
      }
      break;

    case "paket1":
    case "paket2":
    case "paket3":
      switch (choice) {
        case 1:
          await showOrderForm(message, contact, menu.replace("paket", ""));
          break;
        case 0:
          await showBuatWebMenu(message);
          break;
        default:
          await message.reply("❌ Balas *1* untuk order\nBalas *back* untuk kembali.");
      }
      break;

    case "order":
      switch (choice) {
        case 1:
          await message.reply(
            `✅ *Terima kasih!*\n\n` +
              `Silakan kirim data:\n\n` +
              `Nama: [nama]\nJenis: [jenis web]\nReferensi: [link]\nDeadline: [tanggal]\n\n` +
              `📞 wa.me/6287719010818`,
          );
          clearState(message);
          break;
        case 0:
          await showBuatWebMenu(message);
          break;
        default:
          await message.reply("❌ Balas *1* konfirmasi\nBalas *back* untuk kembali.");
      }
      break;

    // ── GAMES ──
    case "games":
      switch (choice) {
        case 1:
          await cmdDice(message);
          setState(message, "games");
          break;
        case 2:
          await cmdCoinFlip(message);
          setState(message, "games");
          break;
        case 3:
          await showRPSMenu(message);
          break;
        case 4:
          setState(message, "8ball");
          await client.sendMessage(
            message.from,
            `🎱 *MAGIC 8-BALL*\n\nKetik pertanyaanmu...\nBalas *back* untuk kembali`,
          );
          break;
        case 5:
          await cmdJoke(message);
          setState(message, "games");
          break;
        case 6:
          await cmdQuote(message);
          setState(message, "games");
          break;
        case 7:
          setState(message, "rate");
          await client.sendMessage(
            message.from,
            `⭐ *RATE*\n\nKetik apa yang mau di-rate...\nBalas *back* untuk kembali`,
          );
          break;
        case 0:
          await showMainMenu(message, name, isGroup, userId);
          break;
        default:
          await message.reply("❌ Pilihan tidak valid.\nBalas *back* untuk kembali.");
      }
      break;

    case "rps":
      switch (choice) {
        case 1:
          await cmdRPS(message, "rock");
          setState(message, "games");
          break;
        case 2:
          await cmdRPS(message, "paper");
          setState(message, "games");
          break;
        case 3:
          await cmdRPS(message, "scissors");
          setState(message, "games");
          break;
        case 0:
          await showGamesMenu(message);
          break;
        default:
          await message.reply("❌ Balas *1*, *2*, atau *3*");
      }
      break;

    // ── TOOLS ──
    case "tools":
      switch (choice) {
        case 1:
          setState(message, "calc");
          await client.sendMessage(
            message.from,
            `📊 *CALCULATOR*\n\nKetik perhitungan:\nContoh: _25 + 30_\n\nBalas *back* untuk kembali`,
          );
          break;
        case 2:
          setState(message, "uppercase");
          await client.sendMessage(
            message.from,
            `🔤 *UPPERCASE*\n\nKetik teks...\nBalas *back* untuk kembali`,
          );
          break;
        case 3:
          setState(message, "lowercase");
          await client.sendMessage(
            message.from,
            `🔡 *lowercase*\n\nKetik teks...\nBalas *back* untuk kembali`,
          );
          break;
        case 4:
          setState(message, "reverse");
          await client.sendMessage(
            message.from,
            `🔄 *REVERSE*\n\nKetik teks...\nBalas *back* untuk kembali`,
          );
          break;
        case 5:
          setState(message, "count");
          await client.sendMessage(
            message.from,
            `📏 *COUNT*\n\nKetik teks...\nBalas *back* untuk kembali`,
          );
          break;
        case 6:
          await message.reply(
            `🖼️ Kirim gambar + caption *.sticker*\natau reply gambar dengan *.sticker*`,
          );
          setState(message, "tools");
          break;
        case 0:
          await showMainMenu(message, name, isGroup, userId);
          break;
        default:
          await message.reply("❌ Pilihan tidak valid.\nBalas *back* untuk kembali.");
      }
      break;

    default:
      await showMainMenu(message, name, isGroup, userId);
  }
}

// ═══════════════════════════════════════════════════════
//  PROMPT INPUT HANDLERS
// ═══════════════════════════════════════════════════════

async function handleAddCmdInput(message, input, name, isGroup, userId) {
  const sep = input.indexOf("|");
  if (sep === -1) {
    return message.reply(
      "❌ Format salah!\nGunakan: *keyword|respon*\n\nBalas *cancel* untuk batal",
    );
  }

  const keyword = input.substring(0, sep).trim().toLowerCase();
  const response = input.substring(sep + 1).trim();

  if (!keyword || !response) {
    return message.reply(
      "❌ Keyword dan respon tidak boleh kosong.\nBalas *cancel* untuk batal",
    );
  }

  botConfig.customCommands[keyword] = response;
  saveConfig();

  await message.reply(
    `✅ *Command Ditambahkan!*\n\n` +
      `🔑 Command: *.${keyword}*\n` +
      `💬 Respon: ${response}\n\n` +
      `Test: ketik *.${keyword}*`,
  );
  await showOwnerMenu(message);
}

async function handleDelCmdInput(message, input, name, isGroup, userId) {
  const keyword = input.toLowerCase().replace(/^[.!/]/, "");

  if (!botConfig.customCommands[keyword]) {
    return message.reply(
      `❌ Command *.${keyword}* tidak ditemukan.\nBalas *cancel* untuk batal`,
    );
  }

  delete botConfig.customCommands[keyword];
  saveConfig();

  await message.reply(`✅ Command *.${keyword}* berhasil dihapus!`);
  await showOwnerMenu(message);
}

async function handleAddAdminInput(message, input, name, isGroup, userId) {
  const num = input.replace(/[\s\-\+@c.us]/g, "");
  if (!/^\d{10,15}$/.test(num)) {
    return message.reply(
      "❌ Format nomor salah.\nContoh: _6281234567890_\nBalas *0* batal",
    );
  }

  const targetId = `${num}@c.us`;

  if (isOwner(targetId))
    return message.reply("❌ Owner tidak perlu dijadikan admin.");
  if (isAdminUser(targetId)) return message.reply("❌ Sudah menjadi admin.");

  botConfig.admins.push(targetId);
  saveConfig();

  await message.reply(
    `✅ *Admin Ditambahkan!*\n\n` +
      `📞 Nomor: ${num}\n` +
      `🛡️ Total Admin: ${botConfig.admins.length}`,
  );
  await showOwnerMenu(message);
}

async function handleDelAdminInput(message, input, name, isGroup, userId) {
  const num = input.replace(/[\s\-\+@c.us]/g, "");
  const targetId = `${num}@c.us`;

  if (!isAdminUser(targetId))
    return message.reply("❌ Nomor ini bukan admin.\nBalas *0* batal");
  if (isOwner(targetId)) return message.reply("❌ Tidak bisa menghapus Owner.");

  botConfig.admins = botConfig.admins.filter((id) => id !== targetId);
  saveConfig();

  await message.reply(`✅ Admin *${num}* dihapus.`);

  const currentUserId = (await message.getContact()).id._serialized;
  if (isOwner(currentUserId)) await showOwnerMenu(message);
  else await showAdminRoleMenu(message);
}

async function handleBanInput(message, input, name, isGroup, userId) {
  const num = input.replace(/[\s\-\+@c.us]/g, "");
  if (!/^\d{10,15}$/.test(num)) {
    return message.reply(
      "❌ Format nomor salah.\nContoh: _6281234567890_\nBalas *0* batal",
    );
  }

  const targetId = `${num}@c.us`;

  if (isOwner(targetId)) return message.reply("❌ Tidak bisa ban Owner.");
  if (isBanned(targetId)) return message.reply("❌ User sudah di-ban.");

  botConfig.bannedUsers.push(targetId);
  saveConfig();

  await message.reply(
    `🚫 *User Di-Ban!*\n\n📞 Nomor: ${num}\nUser tidak bisa menggunakan bot.`,
  );

  const currentUserId = (await message.getContact()).id._serialized;
  if (isOwner(currentUserId)) await showOwnerMenu(message);
  else await showAdminRoleMenu(message);
}

async function handleUnbanInput(message, input, name, isGroup, userId) {
  const num = input.replace(/[\s\-\+@c.us]/g, "");
  const targetId = `${num}@c.us`;

  if (!isBanned(targetId))
    return message.reply("❌ User tidak dalam daftar ban.\nBalas *0* batal");

  botConfig.bannedUsers = botConfig.bannedUsers.filter((id) => id !== targetId);
  saveConfig();

  await message.reply(`✅ User *${num}* di-unban.`);

  const currentUserId = (await message.getContact()).id._serialized;
  if (isOwner(currentUserId)) await showOwnerMenu(message);
  else await showAdminRoleMenu(message);
}

// ═══════════════════════════════════════════════════════
//  MENU DISPLAYS
// ═══════════════════════════════════════════════════════

async function showMainMenu(message, name, isGroup, userId) {
  setState(message, "main");
  const role = getUserRole(userId);

  await client.sendMessage(
    message.from,
    `╔══════════════════════╗\n` +
      `║   🤖 *BOT MENU*      ║\n` +
      `╚══════════════════════╝\n\n` +
      `👋 Hai *${name}*!\n` +
      `🏷️ Role: ${role}\n\n` +
      `Pilih menu:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*1.* 🌐 Jasa Pembuatan Website\n` +
      `*2.* 🎮 Games & Fun\n` +
      `*3.* 🛠️ Tools\n` +
      `*4.* 👑 Panel Admin/Owner\n` +
      `*5.* ℹ️ Info\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ *Quick:*\n` +
      `*.ping* *.sticker* *.everyone*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Balas angka untuk memilih_`,
  );
}

async function showOwnerMenu(message) {
  setState(message, "owner");

  await client.sendMessage(
    message.from,
    `╔══════════════════════╗\n` +
      `║  👑 *OWNER PANEL*     ║\n` +
      `╚══════════════════════╝\n\n` +
      `━━━ 📝 *COMMAND* ━━━\n\n` +
      `*1.* ➕ Tambah Command\n` +
      `*2.* 🗑️ Hapus Command\n` +
      `*3.* 📋 List Command\n\n` +
      `━━━ 🛡️ *ADMIN* ━━━\n\n` +
      `*4.* ➕ Tambah Admin\n` +
      `*5.* 🗑️ Hapus Admin\n\n` +
      `━━━ 🚫 *BAN* ━━━\n\n` +
      `*6.* 🚫 Ban User\n` +
      `*7.* ✅ Unban User\n\n` +
      `━━━ 📊 *INFO* ━━━\n\n` +
      `*8.* 📋 List Admin\n` +
      `*9.* 📋 List Banned\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Balas angka | *0* kembali_`,
  );
}

async function showAdminRoleMenu(message) {
  setState(message, "admin_role");

  await client.sendMessage(
    message.from,
    `╔══════════════════════╗\n` +
      `║  🛡️ *ADMIN PANEL*     ║\n` +
      `╚══════════════════════╝\n\n` +
      `*1.* 🗑️ Hapus Admin\n` +
      `*2.* 🚫 Ban User\n` +
      `*3.* ✅ Unban User\n` +
      `*4.* 📋 List Admin\n` +
      `*5.* 📋 List Banned\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Balas angka | *0* kembali_`,
  );
}

async function showInfo(message, contact, chat, userId) {
  setState(message, "main");
  const role = getUserRole(userId);

  await message.reply(
    `ℹ️ *Info:*\n\n` +
      `👤 Nama: *${contact.pushname || "N/A"}*\n` +
      `📞 Nomor: *${contact.number}*\n` +
      `🏷️ Role: *${role}*\n` +
      `💬 Chat: *${chat.name || "Private"}*\n` +
      `👥 Group: *${chat.isGroup}*\n\n` +
      `Balas *back* untuk kembali`,
  );
}

// ═══════════════════════════════════════════════════════
//  OWNER/ADMIN DIRECT COMMANDS
// ═══════════════════════════════════════════════════════

async function cmdAddCommand(message, args) {
  if (!args) return message.reply("❌ Format: *.addcommand keyword|respon*");
  const sep = args.indexOf("|");
  if (sep === -1) return message.reply("❌ Gunakan format: *keyword|respon*");

  const keyword = args.substring(0, sep).trim().toLowerCase();
  const response = args.substring(sep + 1).trim();

  if (!keyword || !response)
    return message.reply("❌ Keyword dan respon tidak boleh kosong.");

  botConfig.customCommands[keyword] = response;
  saveConfig();

  await message.reply(
    `✅ *Command Ditambahkan!*\n` + `🔑 *.${keyword}*\n` + `💬 ${response}`,
  );
}

async function cmdDelCommand(message, args) {
  if (!args) return message.reply("❌ Format: *.delcommand keyword*");
  const keyword = args.toLowerCase();

  if (!botConfig.customCommands[keyword])
    return message.reply(`❌ *.${keyword}* tidak ditemukan.`);

  delete botConfig.customCommands[keyword];
  saveConfig();
  await message.reply(`✅ *.${keyword}* dihapus.`);
}

async function cmdListCommand(message) {
  const cmds = Object.keys(botConfig.customCommands);
  if (cmds.length === 0) {
    return await client.sendMessage(
      message.from,
      "📋 Belum ada custom command.\n\nTambah dengan pilih menu *1* di Owner Panel.",
    );
  }

  let text = `📋 *CUSTOM COMMANDS (${cmds.length})*\n\n`;
  cmds.forEach((cmd, i) => {
    text += `${i + 1}. *.${cmd}* → ${botConfig.customCommands[cmd].substring(0, 50)}${botConfig.customCommands[cmd].length > 50 ? "..." : ""}\n`;
  });
  await client.sendMessage(message.from, text);
}

async function cmdAddAdmin(message, chat, args) {
  if (!args) return message.reply("❌ Format: *.addadmin 628xxxx*");
  const num = args.replace(/[\s\-\+@c.us]/g, "");
  if (!/^\d{10,15}$/.test(num)) return message.reply("❌ Format nomor salah.");
  const targetId = `${num}@c.us`;

  if (isOwner(targetId))
    return message.reply("❌ Owner tidak perlu jadi admin.");
  if (isAdminUser(targetId)) return message.reply("❌ Sudah admin.");

  botConfig.admins.push(targetId);
  saveConfig();
  await message.reply(`✅ Admin ditambahkan: ${num}`);
}

async function cmdDelAdmin(message, chat, args, requesterId) {
  if (!args) return message.reply("❌ Format: *.deladmin 628xxxx*");
  const num = args.replace(/[\s\-\+@c.us]/g, "");
  const targetId = `${num}@c.us`;

  if (!isAdminUser(targetId)) return message.reply("❌ Bukan admin.");
  if (isOwner(targetId)) return message.reply("❌ Tidak bisa hapus Owner.");

  botConfig.admins = botConfig.admins.filter((id) => id !== targetId);
  saveConfig();
  await message.reply(`✅ Admin dihapus: ${num}`);
}

async function cmdBanUser(message, chat, args, requesterId) {
  if (!args) return message.reply("❌ Format: *.banuser 628xxxx*");
  const num = args.replace(/[\s\-\+@c.us]/g, "");
  const targetId = `${num}@c.us`;

  if (isOwner(targetId)) return message.reply("❌ Tidak bisa ban Owner.");
  if (isBanned(targetId)) return message.reply("❌ Sudah di-ban.");

  // Admin tidak bisa ban admin lain (kecuali owner)
  if (isAdminUser(targetId) && !isOwner(requesterId)) {
    return message.reply(
      "❌ Admin tidak bisa ban admin lain.\nHanya Owner yang bisa.",
    );
  }

  botConfig.bannedUsers.push(targetId);
  saveConfig();
  await message.reply(`🚫 User di-ban: ${num}`);
}

async function cmdUnbanUser(message, args) {
  if (!args) return message.reply("❌ Format: *.unban 628xxxx*");
  const num = args.replace(/[\s\-\+@c.us]/g, "");
  const targetId = `${num}@c.us`;

  if (!isBanned(targetId)) return message.reply("❌ User tidak di-ban.");

  botConfig.bannedUsers = botConfig.bannedUsers.filter((id) => id !== targetId);
  saveConfig();
  await message.reply(`✅ User di-unban: ${num}`);
}

async function cmdListAdmin(message) {
  if (botConfig.admins.length === 0) {
    return await client.sendMessage(
      message.from,
      "📋 Belum ada admin.\n\n👑 Owner: " +
        botConfig.owner.replace("@c.us", ""),
    );
  }

  let text = `📋 *DAFTAR ADMIN (${botConfig.admins.length})*\n\n`;
  text += `👑 Owner: ${botConfig.owner.replace("@c.us", "")}\n\n`;
  botConfig.admins.forEach((id, i) => {
    text += `${i + 1}. 🛡️ ${id.replace("@c.us", "")}\n`;
  });
  await client.sendMessage(message.from, text);
}

async function cmdListBan(message) {
  if (botConfig.bannedUsers.length === 0) {
    return await client.sendMessage(
      message.from,
      "📋 Tidak ada user yang di-ban.",
    );
  }

  let text = `📋 *DAFTAR BANNED (${botConfig.bannedUsers.length})*\n\n`;
  botConfig.bannedUsers.forEach((id, i) => {
    text += `${i + 1}. 🚫 ${id.replace("@c.us", "")}\n`;
  });
  await client.sendMessage(message.from, text);
}

// ═══════════════════════════════════════════════════════
//  BUAT WEB MENUS
// ═══════════════════════════════════════════════════════

async function showBuatWebMenu(message) {
  setState(message, "buatweb");

  await client.sendMessage(
    message.from,
    `╔═══════════════════════════════╗\n` +
      `║  🌐 *JASA PEMBUATAN WEBSITE*  ║\n` +
      `╚═══════════════════════════════╝\n\n` +
      `*1.* 📄 *Landing Page Starter* — Rp1.4jt\n` +
      `   ⏰ 2 hari | 🔄 Revisi tak terbatas\n\n` +
      `*2.* 💻 *Custom Dynamic Web* — Rp2.5jt\n` +
      `   ⏰ 20 hari | 🔄 7x revisi\n\n` +
      `*3.* 🚀 *Full-Service Premium* — Rp3.5jt\n` +
      `   ⏰ 30 hari | 🔄 20x revisi\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Balas *1*, *2*, *3* detail | *0* kembali_`,
  );
}

async function showPaket1(message) {
  setState(message, "paket1");
  await client.sendMessage(
    message.from,
    `📄 *LANDING PAGE STARTER*\n\n` +
      `💰 *Rp1.400.000* | ⏰ 2 hari | 🔄 Unlimited\n\n` +
      `✅ 1 Halaman Landing Page\n` +
      `✅ Desain Responsif\n` +
      `✅ Integrasi Social Media\n` +
      `✅ HTML/Tailwind CSS/JS/API\n` +
      `✅ Source Code\n\n` +
      `*1.* 🛒 ORDER | *0.* 🔙 Kembali`,
  );
}

async function showPaket2(message) {
  setState(message, "paket2");
  await client.sendMessage(
    message.from,
    `💻 *CUSTOM DYNAMIC WEB*\n\n` +
      `💰 *Rp2.500.000* | ⏰ 20 hari | 🔄 7x\n\n` +
      `✅ Hingga 5 Halaman\n` +
      `✅ Dashboard Admin & Login\n` +
      `✅ Database MySQL & API\n` +
      `✅ Framework Laravel\n` +
      `✅ CRUD Management\n\n` +
      `*1.* 🛒 ORDER | *0.* 🔙 Kembali`,
  );
}

async function showPaket3(message) {
  setState(message, "paket3");
  await client.sendMessage(
    message.from,
    `🚀 *FULL-SERVICE PREMIUM WEB*\n\n` +
      `💰 *Rp3.500.000* | ⏰ 30 hari | 🔄 20x\n\n` +
      `✅ UI/UX Kustom (Figma)\n` +
      `✅ Fitur Kompleks (QRCode, Maps)\n` +
      `✅ Keamanan & Validasi\n` +
      `✅ Dokumentasi Sistem\n` +
      `✅ Support 1 Bulan\n\n` +
      `*1.* 🛒 ORDER | *0.* 🔙 Kembali`,
  );
}

async function showOrderForm(message, contact, paketNum) {
  setState(message, "order");
  const names = {
    1: "Landing Page — Rp1.4jt",
    2: "Dynamic Web — Rp2.5jt",
    3: "Premium Web — Rp3.5jt",
  };

  await client.sendMessage(
    message.from,
    `🛒 *FORM PEMESANAN*\n\n` +
      `📦 ${names[paketNum]}\n` +
      `👤 ${contact.pushname || contact.number}\n` +
      `📅 ${new Date().toLocaleDateString("id-ID")}\n\n` +
      `💳 DP 50% di awal\n` +
      `💳 Bank / E-Wallet\n\n` +
      `*1.* ✅ KONFIRMASI ORDER\n` +
      `*0.* 🔙 Kembali`,
  );
}

// ═══════════════════════════════════════════════════════
//  GAMES & TOOLS
// ═══════════════════════════════════════════════════════

async function showGamesMenu(message) {
  setState(message, "games");
  await client.sendMessage(
    message.from,
    `🎮 *GAMES MENU*\n\n` +
      `*1.* 🎲 Roll Dice\n*2.* 🪙 Flip Coin\n*3.* ✊ RPS\n` +
      `*4.* 🎱 Magic 8-Ball\n*5.* 😂 Joke\n*6.* 📝 Quote\n*7.* ⭐ Rate\n\n` +
      `_Balas angka | *0* kembali_`,
  );
}

async function showRPSMenu(message) {
  setState(message, "rps");
  await client.sendMessage(
    message.from,
    `✊ *ROCK PAPER SCISSORS*\n\n*1.* 🪨 Rock\n*2.* 📄 Paper\n*3.* ✂️ Scissors\n\n_Balas *1-3* | *0* kembali_`,
  );
}

async function showToolsMenu(message) {
  setState(message, "tools");
  await client.sendMessage(
    message.from,
    `🛠️ *TOOLS MENU*\n\n` +
      `*1.* 📊 Calculator\n*2.* 🔤 UPPERCASE\n*3.* 🔡 lowercase\n` +
      `*4.* 🔄 Reverse\n*5.* 📏 Count\n*6.* 🖼️ Sticker\n\n` +
      `_Balas angka | *0* kembali_`,
  );
}

// ── Game Functions ──

async function cmdPing(message) {
  const start = Date.now();
  const reply = await message.reply("🏓 Pong!");
  try {
    await reply.edit(`🏓 *Pong!* — _${Date.now() - start}ms_`);
  } catch {}
}

async function cmdDice(message) {
  const n = Math.floor(Math.random() * 6) + 1;
  const f = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  await message.reply(`🎲 Hasil: *${n}* ${f[n]}`);
}

async function cmdCoinFlip(message) {
  await message.reply(`🪙 Hasil: *${Math.random() < 0.5 ? "HEADS" : "TAILS"}*`);
}

async function cmdRPS(message, choice) {
  const c = ["rock", "paper", "scissors"];
  const e = { rock: "🪨", paper: "📄", scissors: "✂️" };
  const bot = c[Math.floor(Math.random() * 3)];
  let r =
    choice === bot
      ? "🤝 SERI!"
      : (choice === "rock" && bot === "scissors") ||
          (choice === "paper" && bot === "rock") ||
          (choice === "scissors" && bot === "paper")
        ? "🎉 MENANG!"
        : "😈 KALAH!";
  await message.reply(`Kamu: ${e[choice]} vs Bot: ${e[bot]}\n${r}`);
}

async function cmd8Ball(message, q) {
  const a = [
    "🟢 Ya!",
    "🟢 Pasti!",
    "🟡 Mungkin",
    "🟡 Coba lagi",
    "🔴 Tidak",
    "🔴 Jangan harap",
  ];
  await message.reply(
    `🎱 "${q}"\n\n${a[Math.floor(Math.random() * a.length)]}`,
  );
}

async function cmdJoke(message) {
  const j = [
    "Programmer suka dark mode karena light attracts bugs! 🐛",
    "JS developer sedih, gak bisa Express perasaannya 😂",
    "SQL masuk bar: 'Boleh JOIN?' 🍺",
  ];
  await message.reply(`😂 ${j[Math.floor(Math.random() * j.length)]}`);
}

async function cmdQuote(message) {
  const q = [
    `"Talk is cheap. Show me the code." — Linus Torvalds`,
    `"Stay hungry, stay foolish." — Steve Jobs`,
    `"Make it work, make it right, make it fast." — Kent Beck`,
  ];
  await message.reply(`📝 ${q[Math.floor(Math.random() * q.length)]}`);
}

async function cmdCalc(message, expr) {
  try {
    const s = expr.replace(/[^0-9+\-*/().%\s]/g, "");
    if (!s) throw new Error();
    const r = Function(`"use strict"; return (${s})`)();
    await message.reply(`📊 ${expr} = *${r}*`);
  } catch {
    await message.reply("❌ Ekspresi tidak valid.");
  }
}

async function cmdSticker(message, chat) {
  let m = message;
  if (message.hasQuotedMsg) m = await message.getQuotedMessage();
  if (!m.hasMedia) return message.reply("🖼️ Kirim/reply gambar + *.sticker*");
  try {
    const media = await m.downloadMedia();
    await chat.sendMessage(media, {
      sendMediaAsSticker: true,
      stickerAuthor: "Bot",
      stickerName: "Sticker",
    });
  } catch (e) {
    await message.reply(`❌ Gagal: ${e.message}`);
  }
}

async function cmdTagAll(message, chat, contact) {
  if (!chat.isGroup) return message.reply("❌ Group only.");
  let text = `📢 *Attention!*\n\n`;
  const mentions = [];
  for (const p of chat.participants) {
    const c = await client.getContactById(p.id._serialized);
    mentions.push(c);
    text += `@${p.id.user} `;
  }
  await chat.sendMessage(text, { mentions });
}

// ── Helper ──
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  setupMessageHandler,
  setupWelcomeMessage,
  botConfig,
};
