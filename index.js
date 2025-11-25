const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const path = require('path');
const { sms, downloadMediaMessage } = require('./lib/msg');
const {
    getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson
} = require('./lib/functions');
const { commands, replyHandlers } = require('./command');

const config = require('./config'); // config file එක load කරයි

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';
const ownerNumber = ['94743404814', '0743404814'];
const authDir = path.join(__dirname, '/auth_info_baileys/');
const credsPath = path.join(authDir, 'creds.json');

// --- Helper: Boolean Conversion ---
function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}

// --- Session Restore Logic (Base64 Decode) ---
async function ensureSessionFile() {
    if (!fs.existsSync(credsPath)) {
        if (!config.SESSION_ID) {
            console.error('❌ SESSION_ID env variable is missing. Cannot proceed.');
            process.exit(1);
        }

        console.log("🔄 creds.json not found. Restoring session from Base64 string...");

        try {
            const sessionData = Buffer.from(config.SESSION_ID, 'base64').toString('utf-8');
            
            if (!fs.existsSync(authDir)) {
                 fs.mkdirSync(authDir, { recursive: true });
            }
            
            fs.writeFileSync(credsPath, sessionData);
            
            console.log("✅ Session restored from Base64. Connecting bot...");
            setTimeout(() => {
                connectToWA();
            }, 1000);

        } catch (e) {
            console.error("❌ Failed to decode or save session file from Base64. Check if SESSION_ID is a valid Base64 string:", e.message || e);
            process.exit(1);
        }
    } else {
        setTimeout(() => {
            connectToWA();
        }, 1000);
    }
}
// --- Session Restore Logic End ---


async function connectToWA() {
    console.log("Connecting ZANTA-MD 🧬...");
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const zanta = makeWASocket({
        logger: P({ level: 'info' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        // 👇 ALWAYS_ONLINE setting එක භාවිතා කරයි
        markOnlineOnConnect: convertToBool(config.ALWAYS_ONLINE), 
        generateHighQualityLinkPreview: true,
    });

    // 👈 1. Message Cache Map එක initialize කිරීම (Antidelete සඳහා)
    zanta.messages = new Map();

    zanta.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWA();
            } else {
                 console.log('🤖 Connection logged out. Delete session files and scan a new QR code locally, or update the SESSION_ID.');
            }
        } else if (connection === 'open') {
            console.log('✅ ZANTA-MD connected to WhatsApp');

            const up = `> ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
            await zanta.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                image: { url: `https://raw.githubusercontent.com/Akashkavindu/ZANTA_MD/refs/heads/main/images/ChatGPT%20Image%20Nov%2021%2C%202025%2C%2001_21_32%20AM.png` },
                caption: up
            });

            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() === ".js") {
                    const pluginModule = require(`./plugins/${plugin}`);
                    if (typeof pluginModule === 'function') {
                        pluginModule(zanta);
                    }
                }
            });
        }
    });

    zanta.ev.on('creds.update', saveCreds);


    // --- 👁️‍🗨️ Status Auto Read & Auto Quick Reaction Logic ---
    zanta.ev.on('chats.update', async (updates) => {
        // 👇 AUTO_READ_STATUS setting එක 'true' නම් පමණක් Status Read කරයි
        if (convertToBool(config.AUTO_READ_STATUS) === true) {
            for (const update of updates) {
                if (update.read === false && update.unreadCount > 0 && update.id === 'status@broadcast') {
                    
                    if (update.messages && update.messages.length > 0) {
                        const statusMessage = update.messages[0];
                        const statusJid = 'status@broadcast';

                        // 1. Status එක Read කළ බව සලකයි
                        await zanta.readMessages([
                            {
                                remoteJid: statusJid,
                                fromMe: false, 
                                id: statusMessage.key.id,
                                participant: statusMessage.key.participant 
                            }
                        ]);
                        
                        // 2. Chat එක "read" ලෙස සලකයි
                        await zanta.sendPresenceUpdate('available', update.id);
                        
                        // 3. ✨ Status එකට Quick Reaction එකක් යවයි (Quick Reaction Button එකක් එබුවා සේ) ✨
                        await zanta.sendMessage(statusJid, { 
                            react: { 
                                text: '❤️', // Quick Reaction Emoji එක
                                key: statusMessage.key 
                            } 
                        });

                        console.log(`👁️ Statuses marked as read and sent Quick Reaction (❤️) to ${update.unreadCount} status(es).`);
                    }
                }
            }
        }
    });
    // ----------------------------------------


    zanta.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.messageStubType === 68) {
                await zanta.sendMessageAck(msg.key);
            }
            
            // 👈 2. Message Cache එක Update කිරීම (Antidelete Logic සඳහා)
            if (msg.key.id && !msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
                 zanta.messages.set(msg.key.id, msg);
                 if (zanta.messages.size > 200) {
                     zanta.messages.delete(zanta.messages.keys().next().value);
                 }
            }
        }

        const mek = messages[0];
        if (!mek || !mek.message) return;

        mek.message = getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message;
        if (mek.key.remoteJid === 'status@broadcast') return;

        const m = sms(zanta, mek);
        const type = getContentType(mek.message);
        const from = mek.key.remoteJid;
        const body = type === 'conversation' ? mek.message.conversation : mek.message[type]?.text || mek.message[type]?.caption || '';
        const isCmd = body.startsWith(prefix);
        const commandName = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');

        const sender = mek.key.fromMe ? zanta.user.id : (mek.key.participant || mek.key.remoteJid);
        const senderNumber = sender.split('@')[0];
        const isGroup = from.endsWith('@g.us');
        const botNumber = zanta.user.id.split(':')[0];
        const pushname = mek.pushName || 'Sin Nombre';
        const isMe = botNumber.includes(senderNumber);
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const botNumber2 = await jidNormalizedUser(zanta.user.id);

        const groupMetadata = isGroup ? await zanta.groupMetadata(from).catch(() => {}) : '';
        const groupName = isGroup ? groupMetadata.subject : '';
        const participants = isGroup ? groupMetadata.participants : '';
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

        const reply = (text) => zanta.sendMessage(from, { text }, { quoted: mek });

        if (isCmd) {
            const cmd = commands.find((c) => c.pattern === commandName || (c.alias && c.alias.includes(commandName)));
            if (cmd) {
                if (cmd.react) zanta.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                try {
                    cmd.function(zanta, mek, m, {
                        from, quoted: mek, body, isCmd, command: commandName, args, q,
                        isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
                        isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply,
                    });
                } catch (e) {
                    console.error("[PLUGIN ERROR]", e);
                }
            }
        }

        const replyText = body;
        for (const handler of replyHandlers) {
            if (handler.filter(replyText, { sender, message: mek })) {
                try {
                    await handler.function(zanta, mek, m, {
                        from, quoted: mek, body: replyText, sender, reply,
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
    res.send("Hey, ZANTA-MD started✅");
});

app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
