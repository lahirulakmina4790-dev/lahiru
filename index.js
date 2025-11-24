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
const ownerNumber = ['94743404814'];
const credsPath = path.join(__dirname, '/auth_info_baileys/creds.json');


// ╔═════════ CORE CONNECTION FUNCTIONS (Missing Definitions) ═════════╗

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
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });

    zanta.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWA();
            }
        } else if (connection === 'open') {
            console.log('✅ ZANTA-MD connected to WhatsApp');

            const up = `> ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
            // Welcome Message - Text Only (Image Error Fix)
            await zanta.sendMessage(ownerNumber[0] + "@s.whatsapp.net", { text: up });

            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() === ".js") {
                    require(`./plugins/${plugin}`);
                }
            });
        }
    });

    zanta.ev.on('creds.update', saveCreds);

    zanta.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.messageStubType === 68) {
                await zanta.sendMessageAck(msg.key);
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

        // ╔═════════ ADDED BUTTONS MENU CHECK ═════════╗
        let isButtonReply = false;
        let buttonCommand = null;
        let selectedId = null;

        // 🚨 NEW LOGIC: Check if the message is a Button Response
        if (type === 'buttonsResponseMessage') {
            isButtonReply = true;
            buttonCommand = 'menu'; // We execute the 'menu' command
            selectedId = mek.message.buttonsResponseMessage.selectedButtonId; 
        }
        // ╚═══════════════════════════════════════════╝


        // --------------------------------------------------------------------------------
        // COMMAND EXECUTION BLOCK
        // --------------------------------------------------------------------------------
        if (isCmd || isButtonReply) {
            
            let commandToExecute;
            let queryArguments;
            
            if (isCmd) {
                commandToExecute = commandName;
                queryArguments = q;
            } else if (isButtonReply) {
                commandToExecute = buttonCommand; // 'menu'
                queryArguments = selectedId;     // The Button ID
                
                // 🚨 CRITICAL FIX: Pass the Button ID as m.q for the plugin (menu.js) to read
                m.q = queryArguments; 
            }
            
            const cmd = commands.find((c) => c.pattern === commandToExecute || (c.alias && c.alias.includes(commandToExecute)));
            
            if (cmd) {
                if (cmd.react) zanta.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                try {
                    cmd.function(zanta, mek, m, {
                        from, quoted: mek, body, isCmd, command: commandToExecute, args: queryArguments ? [queryArguments] : args, q: queryArguments,
                        isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
                        isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply,
                    });
                } catch (e) {
                    console.error("[PLUGIN ERROR]", e);
                }
            }
        }

        // --------------------------------------------------------------------------------
        // REPLY HANDLER BLOCK
        // --------------------------------------------------------------------------------
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
// ╚═══════════════════════════════════════════════════════════════════╝

// 🚨 START BOT EXECUTION 🚨
ensureSessionFile();

app.get("/", (req, res) => {
    res.send("Hey, ZANTA-MD started✅");
});

app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
