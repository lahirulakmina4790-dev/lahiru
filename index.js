const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    Browsers,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const P = require("pino");
const express = require("express");
const axios = require("axios");
const path = require("path");
const qrcode = require("qrcode-terminal");

const config = require("./config");
const { sms, downloadMediaMessage } = require("./lib/msg");
const {
    getBuffer,
    getGroupAdmins,
    getRandom,
    h2k,
    isUrl,
    Json,
    runtime,
    sleep,
    fetchJson,
} = require("./lib/functions");
const { File } = require("megajs");
const { commands, replyHandlers } = require("./command");

// 🚨 Menu Reply Logic සඳහා Import කිරීම
const { lastMenuMessage } = require("./plugins/menu"); 

const app = express();
const port = process.env.PORT || 8000; // 8000 Port එක භාවිතා කරයි
const prefix = ".";
const ownerNumber = ["94743404814"];
const credsPath = path.join(__dirname, "/auth_info_baileys/creds.json");

// 🚨 FIX 1: UNCAUGHT EXCEPTION HANDLING (Crash වීම වැළැක්වීමට)
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception detected! The process will NOT exit. Error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
// --------------------------------------------------------------------------

// 💾 Memory-Based Message Store (Anti-Delete සඳහා)
const messagesStore = {}; 

async function ensureSessionFile() {
    if (!fs.existsSync(credsPath)) {
        if (!config.SESSION_ID) {
            console.error(
                "❌ SESSION_ID env variable is missing. Cannot restore session.",
            );
            process.exit(1);
        }

        console.log(
            "🔄 creds.json not found. Downloading session from MEGA...",
        );

        const sessdata = config.SESSION_ID;
        const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);

        filer.download((err, data) => {
            if (err) {
                console.error(
                    "❌ Failed to download session file from MEGA:",
                    err,
                );
                process.exit(1);
            }

            fs.mkdirSync(path.join(__dirname, "/auth_info_baileys/"), {
                recursive: true,
            });
            fs.writeFileSync(credsPath, data);
            console.log("✅ Session downloaded and saved. Restarting bot...");
            setTimeout(() => {
                connectToWA();
            }, 2000);
        });
    } else {
        setTimeout(() => {
            connectToWA();
        }, 1000);
    }
}

async function connectToWA() {
    console.log("Connecting ZANTA-MD 🧬...");
    const { state, saveCreds } = await useMultiFileAuthState(
        path.join(__dirname, "/auth_info_baileys/"),
    );
    const { version } = await fetchLatestBaileysVersion();

    const danuwa = makeWASocket({
        logger: P({ level: "silent" }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        messages: new Map(),
    });

    danuwa.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            if (
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut
            ) {
                connectToWA();
            }
        } else if (connection === "open") {
            console.log("✅ ZANTA-MD connected to WhatsApp");

            const up = `ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
            await danuwa.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                image: {
                    url: `https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/ChatGPT%20Image%20Nov%2021,%202025,%2001_21_32%20AM.png?raw=true`,
                },
                caption: up,
            });

            // ✅ PLUGIN LOADER
            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() === ".js") {
                    try {
                        const pluginModule = require(`./plugins/${plugin}`);
                        if (typeof pluginModule === "function") {
                            pluginModule(danuwa);
                            console.log(
                                `[Plugin Loader] Successfully injected client into: ${plugin}`,
                            );
                        } else {
                            console.log(
                                `[Plugin Loader] Loaded command plugin: ${plugin}`,
                            );
                        }
                    } catch (e) {
                        console.error(
                            `[Plugin Loader] Error loading ${plugin}:`,
                            e,
                        );
                    }
                }
            });
        }
    });

    danuwa.ev.on("creds.update", saveCreds);

    // ----------------------------------------------------------------------
    // 🗑️ ANTI-DELETE DETECTION EVENT 
    // ----------------------------------------------------------------------
    danuwa.ev.on("messages.delete", async (deletedMessage) => {

        // ... (Anti-Delete Logic) ...
        // සම්පූර්ණ කේතයේ ඇති Anti-Delete Logic එක මෙහි එලෙසම තිබිය යුතුය.

        const { remoteJid, fromMe } = deletedMessage.key;
        if (fromMe) return;
        const storedMessage = messagesStore[deletedMessage.key.id];

        if (storedMessage && storedMessage.message) {
            let messageType = getContentType(storedMessage.message);
            let deletedContent = 'මෙහි අන්තර්ගතය සොයාගත නොහැක (Media/Sticker).'; 
            if (messageType === 'conversation') {
                deletedContent = storedMessage.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                deletedContent = storedMessage.message.extendedTextMessage.text;
            } else if (messageType === 'imageMessage') {
                deletedContent = storedMessage.message.imageMessage.caption || "Image Message";
            } else if (messageType === 'videoMessage') {
                 deletedContent = storedMessage.message.videoMessage.caption || "Video Message";
            }
            const senderName = storedMessage.pushName || remoteJid;

            const replyText = 
                `🗑️ **MESSAGE DELETED (Anti-Delete)**\n` +
                `*යවන්නා:* ${senderName}\n` +
                `*වර්ගය:* ${messageType}\n` +
                `*අන්තර්ගතය:* \n\`\`\`${deletedContent}\`\`\``;

            await danuwa.sendMessage(
                remoteJid, 
                { text: replyText }, 
                { quoted: storedMessage }
            );
            delete messagesStore[deletedMessage.key.id];
        }
    });


    // ----------------------------------------------------------------------
    // 📥 INCOMING MESSAGE EVENT (DEBUG LOG එක සමඟ)
    // ----------------------------------------------------------------------
    danuwa.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
            if (msg.messageStubType === 68) {
                await danuwa.sendMessageAck(msg.key);
            }
        }

        const mek = messages[0];
        
        // 🚨 FIX 2: INCOMING MESSAGE DEBUG LOG
        // Render Logs හි පණිවිඩයක් ලැබෙනවාදැයි පරීක්ෂා කිරීමට.
        console.log("-----------------------------------------");
        console.log(`📥 Incoming Message from: ${mek.key.remoteJid}`);
        console.log(`Message Body: ${mek.message?.conversation || mek.message?.extendedTextMessage?.text || 'Non-Text Message'}`);
        console.log("-----------------------------------------");
        
        if (!mek || !mek.message) return;

        // 💡 1. Incoming Messages Store: Memory එකේ ගබඩා කිරීම
        if (mek.key.id && !mek.key.fromMe) {
            messagesStore[mek.key.id] = mek;
        }

        mek.message =
            getContentType(mek.message) === "ephemeralMessage"
                ? mek.message.ephemeralMessage.message
                : mek.message;
        if (mek.key.remoteJid === "status@broadcast") return;

        // (ඉතිරි Bot Logic එක මෙහි ඇත...)
        
        const m = sms(danuwa, mek);
        const type = getContentType(mek.message);
        const from = mek.key.remoteJid;
        const body =
            type === "conversation"
                ? mek.message.conversation
                : mek.message[type]?.text || mek.message[type]?.caption || "";
        const isCmd = body.startsWith(prefix);
        const commandName = isCmd
            ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
            : "";
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(" ");

        // ✅ SENDER හඳුනාගැනීමේ Logic
        const sender = mek.key.fromMe
            ? danuwa.user.id
            : mek.key.participant
            ? mek.key.participant
            : mek.key.remoteJid;
        const senderNumber = sender.split("@")[0];
        const isGroup = from.endsWith("@g.us");
        const botNumber = danuwa.user.id.split(":")[0];
        const pushname = mek.pushName || "Sin Nombre";
        const isMe = botNumber.includes(senderNumber);
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const botNumber2 = await jidNormalizedUser(danuwa.user.id);

        const groupMetadata = isGroup
            ? await danuwa.groupMetadata(from).catch(() => ({}))
            : {};
        const groupName = isGroup ? groupMetadata.subject : "";
        const participants = isGroup ? groupMetadata.participants : "";
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : "";
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

        const reply = (text) =>
            danuwa.sendMessage(from, { text }, { quoted: mek });

        // ------------------------------------------------------------------
        // 🚨 FIX 3: REPLY-BASED COMMAND EXECUTION LOGIC එක (Menu Reply Handling)
        // ------------------------------------------------------------------
        const isMenuReply = (m.quoted && lastMenuMessage && lastMenuMessage.get(from) === m.quoted.id);
        let shouldExecuteMenu = false;
        let replySelection = null;
        
        if (isMenuReply && body && !body.startsWith(prefix)) {
            replySelection = body.trim().toLowerCase();
            shouldExecuteMenu = true;
        }

        if (isCmd || shouldExecuteMenu) { 
            const executionCommandName = shouldExecuteMenu ? 'menu' : commandName;
            const executionArgs = shouldExecuteMenu ? [replySelection] : args;
            const executionBody = shouldExecuteMenu ? replySelection : body;
            const executionQ = shouldExecuteMenu ? replySelection : q;

            const cmd = commands.find(
                (c) =>
                    c.pattern === executionCommandName || 
                    (c.alias && c.alias.includes(executionCommandName)),
            );
            
            if (cmd) {
                if (cmd.react)
                    danuwa.sendMessage(from, {
                        react: { text: cmd.react, key: mek.key },
                    });
                try {
                    cmd.function(danuwa, mek, m, {
                        from,
                        quoted: mek,
                        body: executionBody, 
                        isCmd,
                        command: executionCommandName,
                        args: executionArgs,
                        q: executionQ,
                        isGroup,
                        sender,
                        senderNumber,
                        botNumber2,
                        botNumber,
                        pushname,
                        isMe,
                        isOwner,
                        groupMetadata,
                        groupName,
                        participants,
                        groupAdmins,
                        isBotAdmins,
                        isAdmins,
                        reply,
                    });
                } catch (e) {
                    console.error("[PLUGIN EXECUTION ERROR]", e);
                    reply("❌ An internal error occurred while running the command.");
                }
            }
        }

        const replyText = body;
        for (const handler of replyHandlers) {
            if (handler.filter(replyText, { sender, message: mek })) {
                try {
                    await handler.function(danuwa, mek, m, {
                        from,
                        quoted: mek,
                        body: replyText,
                        sender,
                        reply,
                    });
                    break;
                } catch (e) {
                    console.log("Reply handler error:", e);
                }
            }
        }
    });
}

ensureSessionFile();

app.get("/", (req, res) => {
    res.send("Hey, ZANTA-MD started ✅");
});

app.listen(port, () =>
    console.log(`Server listening on http://localhost:${port}`),
);
