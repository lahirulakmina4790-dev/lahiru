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
const axios = require('axios');
const path = require('path');
const qrcode = require('qrcode-terminal');

const config = require('./config');
const { sms, downloadMediaMessage } = require('./lib/msg');
const {
    getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson
} = require('./lib/functions');
const { File } = require('megajs');
const { commands, replyHandlers } = require('./command');

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';
const ownerNumber = ['94743404814' , '0743404814'];
const credsPath = path.join(__dirname, '/auth_info_baileys/creds.json');

// Session ID එක වෙනස් නොකරන ලෙස ඔබ කළ ඉල්ලීම පරිදි, MEGA Logic එක මෙහි තබනවා.
async function ensureSessionFile() {
    if (!fs.existsSync(credsPath)) {
        if (!config.SESSION_ID) {
            console.error('❌ SESSION_ID env variable is missing. Cannot restore session.');
            process.exit(1);
        }

        console.log("🔄 creds.json not found. Downloading session from MEGA...");

        const sessdata = config.SESSION_ID;
        const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);

        filer.download((err, data) => {
            if (err) {
                console.error("❌ Failed to download session file from MEGA:", err);
                process.exit(1);
            }

            fs.mkdirSync(path.join(__dirname, '/auth_info_baileys/'), { recursive: true });
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
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '/auth_info_baileys/'));
    const { version } = await fetchLatestBaileysVersion();

    const zanta = makeWASocket({
        logger: P({ level: 'info' }),
        printQRInTerminal: false, // Session Restore කරන නිසා QR Code පෙන්වන්නේ නැහැ.
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });

    // 👈 1. Message Cache Map එක initialize කිරීම (Antidelete සඳහා අත්‍යවශ්‍යයි)
    zanta.messages = new Map();

    zanta.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update; // qr ද ලබා ගන්න
        
        // QR Code Logic (Session නැතිනම්)
        if (qr) {
             qrcode.generate(qr, { small: true });
             console.log("SCAN THE QR CODE ABOVE TO CONNECT!");
        }

        if (connection === 'close') {
            // DisconnectReason.loggedOut වූ විට නැවත සම්බන්ධ නොවිය යුතුයි.
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWA();
            } else {
                 console.log('🤖 Connection logged out. Delete session files and restart the bot to scan a new QR code.');
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
                    
                    // Antidelete වැනි Event Listeners සඳහා Module Export කර ඇත්නම් එය ක්‍රියාත්මක කිරීම
                    if (typeof pluginModule === 'function') {
                        pluginModule(zanta);
                    }
                }
            });
        }
    });

    zanta.ev.on('creds.update', saveCreds);
    
    // 👈 2. Messages Delete Event Listener එක Load කිරීම
    // Antidelete.js file එකෙන් event listener එක load කිරීමට, එහි module.exports = zanta => {...} ලෙස තිබිය යුතුයි. 
    // නැතහොත්, ඔබගේ antidelete.js file එකේ logic එක මෙහිදී සෘජුවම ඇතුළත් කළ යුතුයි. (දැනට plugin loader එක මත රඳා පවතී.)

    zanta.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.messageStubType === 68) {
                await zanta.sendMessageAck(msg.key);
            }
            
            // 👈 3. Message Cache එක Update කිරීම (Antidelete Logic සඳහා)
            if (msg.key.id && !msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
                 zanta.messages.set(msg.key.id, msg);
                 // Cache එකේ ප්‍රමාණය පාලනය කිරීම (අවශ්‍ය නම්)
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
