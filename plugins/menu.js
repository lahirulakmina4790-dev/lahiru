const { cmd, commands } = require("../command");
const os = require('os');

// 🖼️ MENU Image URL
const MENU_IMAGE_URL = "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/menu-new.jpg?raw=true";

// 🎯 Memory Map for Reply Logic
const lastMenuMessage = new Map();

cmd({
    pattern: "menu",
    react: "📜",
    desc: "Displays the main menu or a category list.",
    category: "main",
    filename: __filename,
},
async (zanta, mek, m, { from, reply, args }) => {
    try {
        // 🚨 DATABASE SETTINGS (Global)
        const botSettings = global.CURRENT_BOT_SETTINGS || {};
        const finalPrefix = botSettings.prefix || '.'; 
        const botName = botSettings.botName || "ZANTA-MD"; 
        const ownerName = botSettings.ownerName || 'Akash Kavindu';
        const mode = process.env.WORK_TYPE || "Public";

        const totalCommands = commands.filter(c => c.pattern).length;

        // 1. Grouping Commands by Category
        const groupedCommands = {};

        // --- 📂 CUSTOM CATEGORY ORDER ---
        const customOrder = ["main", "setting", "download", "media", "group", "convert", "fun", "search", "game"];

        commands.filter(c => c.pattern && c.pattern !== "menu").forEach(cmdData => {
            let cat = cmdData.category?.toLowerCase() || "other";
            if (cat === "genaral") cat = "other"; 

            if (!groupedCommands[cat]) {
                groupedCommands[cat] = [];
            }
            groupedCommands[cat].push(cmdData);
        });

        // අයිතම පිළිවෙළට සකසා ගැනීම
        const categoryKeys = Object.keys(groupedCommands).sort((a, b) => {
            let indexA = customOrder.indexOf(a);
            let indexB = customOrder.indexOf(b);
            if (indexA === -1) indexA = 99; // custom list එකේ නැති ඒවා අන්තිමට
            if (indexB === -1) indexB = 99;
            return indexA - indexB;
        });

        const categoryMap = {}; 
        categoryKeys.forEach((cat, index) => {
            categoryMap[index + 1] = cat;
        });

        // ------------------------------------------------------------------
        // A. SELECTION LOGIC (Arguments OR Reply)
        // ------------------------------------------------------------------
        let selectedCategory;
        let selectionText = args[0]?.toLowerCase() || m.body?.toLowerCase(); 

        if (selectionText) {
            if (selectionText.startsWith(finalPrefix + 'menu')) {
                selectionText = selectionText.replace(finalPrefix + 'menu', '').trim();
            } else if (selectionText.startsWith('menu')) {
                selectionText = selectionText.replace('menu', '').trim();
            }

            const num = parseInt(selectionText);
            if (!isNaN(num) && categoryMap[num]) {
                selectedCategory = categoryMap[num];
            } else {
                selectedCategory = categoryKeys.find(cat => cat === selectionText);
            }
        }

        if (selectedCategory && groupedCommands[selectedCategory]) {
            // 📄 SHOW COMMANDS IN SELECTED CATEGORY
            let displayTitle = selectedCategory.toUpperCase() === 'OTHER' ? 'GENERAL' : selectedCategory.toUpperCase();

            let commandList = `*Hello.. ${m.pushName || 'User'}🖐*\n`;
            commandList += `╭━─━─━─━─━─━─━─━╮\n┃🎡 ${displayTitle} Commands\n╰━─━─━─━─━─━─━─━╯\n`;

            groupedCommands[selectedCategory].forEach((c) => {
                const descLine = c.desc ? c.desc.split('\n')[0].trim() : 'No description.';
                commandList += `\n╭──────────●●►\n│⛩ Command ☛ ${finalPrefix}${c.pattern}\n│🌟 Desc ☛ ${descLine}\n╰──────────●●►\n`;
            });

            commandList += `\n> *© ${botName}*`;
            return reply(commandList); 

        }

        // ------------------------------------------------------------------
        // B. MAIN MENU MODE
        // ------------------------------------------------------------------
        let menuText = `╭━〔 ${botName} WA BOT 〕━··๏\n`;
        menuText += `┃★╭──────────────\n`;
        menuText += `┃★│ 👑 Owner : ${ownerName}\n`; 
        menuText += `┃★│ ⚙ Mode : [${mode}]\n`;
        menuText += `┃★│ 🔣 Prefix : [${finalPrefix}]\n`;
        menuText += `┃★│ 📚 Commands : ${totalCommands}\n`;
        menuText += `┃★╰──────────────\n`;
        menuText += `╰━━━━━━━━━━━━━━┈⊷\n`;

        menuText += `╭━━〔 📜 MENU LIST 〕━━┈⊷\n`;

        categoryKeys.forEach((catKey, index) => {
            const count = groupedCommands[catKey].length;
            let title = catKey.toUpperCase() === 'OTHER' ? 'GENERAL' : catKey.toUpperCase();

            let emoji = { 
                main: '🏠', setting: '⚙️', download: '📥', media: '📸', group: '👥',
                convert: '🔄', fun: '🙃', search: '🔍', game: '😎'
            }[catKey] || '📌';

            menuText += `┃◈╭─────────────·๏\n`;
            menuText += `┃◈│ ${index + 1}. ${emoji} ${title} (${count})\n`; 
            menuText += `┃◈╰───────────┈⊷\n`;
        });

        menuText += `╰──────────────┈⊷\n\n`;
        menuText += `_💡 Commands බැලීමට:_\n`;
        menuText += `_1. *${finalPrefix}menu <අංකය>* ලෙස යවන්න._\n`;
        menuText += `_2. *මෙම Menu එකට Reply කර අංකය යවන්න.*_`;

        const sentMessage = await zanta.sendMessage(from, {
            image: { url: MENU_IMAGE_URL },
            caption: menuText.trim()
        }, { quoted: mek });

        lastMenuMessage.set(from, sentMessage.key.id);

    } catch (err) {
        console.error("Menu Error:", err);
        reply("❌ Error generating menu.");
    }
});

module.exports = { lastMenuMessage };
