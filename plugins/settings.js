const { cmd } = require("../command");
const { updateSetting } = require("./bot_db");

// 🖼️ Dashboard Image URL
const SETTINGS_IMG = "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/settings.jpg?raw=true";

// 🎯 Reply හඳුනා ගැනීම සඳහා පාවිච්චි කරන Map එක
const lastSettingsMessage = new Map();

cmd({
    pattern: "settings",
    alias: ["set", "dashboard", "status"],
    desc: "Display and edit bot settings via reply.",
    category: "setting",
    react: "⚙️",
    filename: __filename,
}, async (zanta, mek, m, { from, reply, isOwner, prefix }) => {
    // අයිතිකරුදැයි පරීක්ෂා කිරීම
    if (!isOwner) return reply("⚠️ *මෙම Dashboard එක භාවිතා කළ හැක්කේ බොට් අයිතිකරුට පමණි!*");

    const settings = global.CURRENT_BOT_SETTINGS;
    const botName = settings.botName || "ZANTA-MD";

    // --- 📊 Dashboard Text Design ---
    let statusText = `╭━━━〔 ${botName.toUpperCase()} 〕━━━┈⊷\n`;
    statusText += `┃\n`;
    statusText += `┃ 1️⃣ *Bot Name:* ${settings.botName}\n`;
    statusText += `┃ 2️⃣ *Owner Name:* ${settings.ownerName}\n`;
    statusText += `┃ 3️⃣ *Prefix:* [  ${settings.prefix}  ]\n`;
    statusText += `┃ 4️⃣ *Auto Read msg:* ${settings.autoRead === 'true' ? '✅ ON' : '❌ OFF'}\n`;
    statusText += `┃ 5️⃣ *Auto Typing:* ${settings.autoTyping === 'true' ? '✅ ON' : '❌ OFF'}\n`;
    statusText += `┃ 6️⃣ *Status Seen:* ${settings.autoStatusSeen === 'true' ? '✅ ON' : '❌ OFF'}\n`;
    statusText += `┃ 7️⃣ *Always Online:* ${settings.alwaysOnline === 'true' ? '✅ ON' : '❌ OFF'}\n`;
    statusText += `┃ 8️⃣ *Read Commands:* ${settings.readCmd === 'true' ? '✅ ON' : '❌ OFF'}\n`;
    statusText += `┃ 9️⃣ *Auto Voice:* ${settings.autoVoice === 'true' ? '✅ ON' : '❌ OFF'}\n`;
    statusText += `┃\n`;
    statusText += `╰━━━━━━━━━━━━━━━┈⊷\n\n`;
    statusText += `*💡 සෙටින්ග්ස් වෙනස් කරන්නේ කෙසේද?*\n`;
    statusText += `අදාළ අංකය සහ අලුත් අගය මෙම පණිවිඩයට Reply කරන්න.\n\n`;
    statusText += `*E.g:* \`9 on\` හෝ \`1 MyBotName\`\n`;

    const sentMsg = await zanta.sendMessage(from, {
        image: { url: SETTINGS_IMG },
        caption: statusText
    }, { quoted: mek });

    // පසුව Reply එකක් ආ විට හඳුනා ගැනීමට මැසේජ් ID එක මතක තබා ගනී
    lastSettingsMessage.set(from, sentMsg.key.id);
});

// index.js වෙත අපනයනය කිරීම
module.exports = { lastSettingsMessage };
