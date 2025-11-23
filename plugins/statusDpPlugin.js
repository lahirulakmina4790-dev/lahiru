const fs = require('fs');

module.exports = async (sock, m, config) => {
    try {
        const from = m.key.remoteJid;
        const text = m.message.conversation || m.message.extendedTextMessage?.text;
        if (!text) return;

        if (!text.startsWith(config.prefix)) return;

        const command = text.slice(config.prefix.length).trim().split(' ')[0].toLowerCase();

        // Get replied message (if any)
        const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;

        const contactId = m.key.participant || from;

        // --------------------------
        // .save command
        // --------------------------
        if (command === 'save') {
            let mediaMessage = null;

            // 1️⃣ If the command is a reply to a photo/video
            if (quoted?.imageMessage || quoted?.videoMessage) {
                mediaMessage = quoted.imageMessage || quoted.videoMessage;
            } else {
                // 2️⃣ Otherwise, fetch contact status
                try {
                    const statuses = await sock.fetchStatus([contactId]);
                    if (statuses.length > 0) {
                        mediaMessage = statuses[0].videoMessage || statuses[0].imageMessage;
                    }
                } catch {
                    mediaMessage = null;
                }
            }

            if (mediaMessage) {
                const buffer = await sock.downloadMediaMessage({ message: mediaMessage });

                // Save locally
                if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
                const ext = mediaMessage.videoMessage ? '.mp4' : '.jpg';
                const fileName = `./downloads/${contactId}${ext}`;
                fs.writeFileSync(fileName, buffer);

                // Send back to WhatsApp chat
                if (mediaMessage.videoMessage) {
                    await sock.sendMessage(from, { video: buffer, caption: `Saved video as ${fileName}` });
                } else {
                    await sock.sendMessage(from, { image: buffer, caption: `Saved image as ${fileName}` });
                }
            } else {
                await sock.sendMessage(from, { text: 'No media found to save!' });
            }
        }

        // --------------------------
        // .getdp command
        // --------------------------
        if (command === 'getdp') {
            try {
                const url = await sock.profilePictureUrl(contactId, 'image');
                await sock.sendMessage(from, { image: { url }, caption: 'Here is the profile picture.' });
            } catch {
                await sock.sendMessage(from, { text: 'Could not fetch profile picture.' });
            }
        }
    } catch (err) {
        console.error('Plugin error:', err);
    }
};
