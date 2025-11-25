const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const axios = require('axios');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

const config = require('./config');
// Note: './lib/msg' and './lib/functions' files must exist and export the necessary functions.
const { sms, downloadMediaMessage } = require('./lib/msg'); 
const {
    getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson
} = require('./lib/functions');
const { File } = require('megajs'); // MEGA handling is kept as a fallback
const { commands, replyHandlers } = require('./command'); // Command registration logic

const app = express();
const port = process.env.PORT || 8000;

// Configuration variables
const prefix = config.PREFIX || '.'; 
const ownerNumber = [config.OWNER_ID.replace('@s.whatsapp.net', '')]; 
const authDir = path.join(__dirname, config.AUTH_STATE_DIR);
const credsPath = path.join(authDir, 'creds.json');


/**
 * session file එක තිබේදැයි පරීක්ෂා කර, නොමැති නම් SESSION_ID එක අනුව restore කරයි.
 */
async function ensureSessionFile() {
    if (!fs.existsSync(credsPath)) {
        const sessdata = config.SESSION_ID;
        if (!sessdata) {
            console.error('❌ SESSION_ID is missing in config. Cannot restore session.');
            process.exit(1);
        }

        fs.mkdirSync(authDir, { recursive: true });

        // --- 1. Base64 String Check (If user provided the raw creds.json content) ---
        // sessdata දිග Base64 string එකක්දැයි පරීක්ෂා කරයි (സാധാരണයෙන් "eyJ" වලින් ආරම්භ වේ)
        if (sessdata.length > 500 && sessdata.includes('eyJ')) {
            console.log("🔄 Session ID is a Base64 string. Decoding and restoring session...");
            try {
                // Base64 string එක Buffer එකක් බවට convert කර creds.json ලෙස Save කරයි.
                const data = Buffer.from(sessdata, 'base64').toString('utf-8');
                fs.writeFileSync(credsPath, data);
                console.log("✅ Session decoded and saved as creds.json.");
            } catch (e) {
                console.error("❌ Failed to decode Base64 session string:", e);
                process.exit(1);
            }
        }
        // --- 2. MEGA Link ID Check (Original Logic/Fallback) ---
        else if (sessdata.length < 50 && !sessdata.includes('/')) {
            console.log("🔄 Session ID appears to be a MEGA link ID. Downloading session...");
            try {
                // We assume sessdata is the file ID part of the MEGA link
                const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
                const data = await new Promise((resolve, reject) => {
                    filer.download((err, data) => {
                        if (err) return reject(err);
                        resolve(data);
                    });
                });
                fs.writeFileSync(credsPath, data);
                console.log("✅ Session downloaded and saved.");
            } catch (e) {
                console.error("❌ Failed to download session file from MEGA:", e);
                process.exit(1);
            }
        } else {
             console.error('❌ SESSION_ID format is unknown. Please provide a MEGA ID or a Base64 creds string.');
             process.exit(1);
        }
        
        // Connect after a short delay
        setTimeout(() => {
            connectToWA();
        }, 2000);

    } else {
        // If creds.json exists, just connect
        setTimeout(() => {
            connectToWA();
        }, 1000);
    }
}

async function connectToWA() {
    console.log("Connecting ZANTA-MD 🧬...");
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const zanta = makeWASocket({
        logger: P({ level: 'info' }),
        printQRInTerminal: true,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });
    
    zanta.messages = new Map(); // Antidelete සඳහා Cache Map එක

    // --- Plugin Loader (Events) ---
    zanta.on('plugins-loaded', () => {
        fs.readdirSync("./plugins/").forEach((pluginFile) => {
            if (path.extname(pluginFile).toLowerCase() === ".js") {
                const plugin = require(`./plugins/${pluginFile}`);
                // Antidelete වැනි Event Plugins සඳහා socket object එක pass කරයි
                if (typeof plugin === 'function') {
                    plugin(zanta); 
                    console.log(`✅ Event Plugin Loaded: ${pluginFile}`);
                } else {
                    // Command Plugins require කරන්නේ ඒවායේ command() function එක command.js වෙත register කිරීමටයි
                    console.log(`✅ Command Plugin Loaded: ${pluginFile}`);
                }
            }
        });
    });


    zanta.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("🛑 Logged out. Deleting auth info and exiting.");
                fs.rmSync(authDir, { recursive: true, force: true });
                process.exit(0);
            } else if (reason) {
                console.log(`Connection closed due to ${reason}. Retrying...`);
                await delay(1000); 
                connectToWA();
            }
        } else if (connection === 'open') {
            console.log('✅ ZANTA-MD connected to WhatsApp');
            zanta.emit('plugins-loaded'); 

            const up = `> ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
            await zanta.sendMessage(config.OWNER_ID, {
                image: { url: `https://raw.githubusercontent.com/Akashkavindu/ZANTA_MD/refs/heads/main/images/ChatGPT%20Image%20Nov%2021%2C%202025%2C%2001_21_32%20AM.png` },
                caption: up
            });
        }
         else if (qr) {
            qrcode.generate(qr, { small: true });
            console.log("Scan the QR code above.");
        }
    });

    zanta.ev.on('creds.update', saveCreds);

    zanta.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // Group Add/Remove Messages සඳහා Acknowledge
            if (msg.messageStubType === 68) {
                await zanta.sendMessage(msg.key.remoteJid, { delete: msg.key });
            }
        }

        const mek = messages[0];
        if (!mek || !mek.message) return;
        if (mek.key.remoteJid === 'status@broadcast') return;

        // Ephemeral Message එකක් නම්, එහි සැබෑ Message එක extract කරයි
        mek.message = getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message;
        
        // Cache message for Antidelete (Antidelete plugin එකට අවශ්‍යයි)
        if (mek.key.id) zanta.messages.set(mek.key.id, mek); 


        const m = sms(zanta, mek); // Simple message context
        const type = getContentType(mek.message);
        const from = mek.key.remoteJid;
        const body = m.text; 
        
        const isCmd = body.startsWith(prefix);
        const commandName = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');

        const sender = mek.key.fromMe ? zanta.user.id : (mek.key.participant || mek.key.remoteJid);
        const senderNumber = sender.split('@')[0];
        const isGroup = from.endsWith('@g.us');
        const botNumber = zanta.user?.id?.split(':')[0]; 
        const pushname = mek.pushName || 'Sin Nombre';
        const isMe = botNumber?.includes(senderNumber); 
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const botNumber2 = zanta.user ? await jidNormalizedUser(zanta.user.id) : null;

        const groupMetadata = isGroup ? await zanta.groupMetadata(from).catch(() => {}) : '';
        const groupName = isGroup ? groupMetadata.subject : '';
        const participants = isGroup ? groupMetadata.participants : '';
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
        const isBotAdmins = isGroup ? (botNumber2 && groupAdmins.includes(botNumber2)) : false; 
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

        const reply = (text) => zanta.sendMessage(from, { text }, { quoted: mek });


        // --- Command Execution ---
        if (isCmd) {
            const cmd = commands.find((c) => c.pattern === commandName || (c.alias && c.alias.includes(commandName)));
            if (cmd) {
                if (cmd.react) zanta.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                
                // Context Object
                const context = {
                    from, quoted: mek, body, isCmd, command: commandName, args, q,
                    isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
                    isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
                    isBotAdmins, isAdmins, reply, m, downloadMediaMessage 
                };
                
                try {
                    cmd.function(zanta, mek, m, context);
                } catch (e) {
                    console.error("[PLUGIN ERROR]", e);
                    reply(`❌ Command execution failed: ${e.message}`);
                }
            }
        }

        // --- Reply Handler Execution ---
        const replyText = body;
        for (const handler of replyHandlers) {
            if (handler.filter(replyText, { sender, message: mek })) {
                try {
                    await handler.function(zanta, mek, m, {
                        from, quoted: mek, body: replyText, sender, reply, downloadMediaMessage
                    });
                    break;
                } catch (e) {
                    console.log("Reply handler error:", e);
                }
            }
        }
    });
}

// Start sequence
ensureSessionFile();

// --- Web Server (Keep Alive) ---
app.get("/", (req, res) => {
    res.send("Hey, ZANTA-MD started✅");
});

app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
