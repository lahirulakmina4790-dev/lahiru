const { cmd } = require("../command");
// Baileys library එකේ අවශ්‍ය tools import කරගත යුතුය.
// ZANTA_MD තුළ, 'mek' හෝ 'm' ඔස්සේ මෙයට අවශ්‍ය context එක ලැබෙනවා.

cmd(
    {
        pattern: "save",
        react: "✅",
        desc: "Resend Status or One-Time View Media (Final Fix)",
        category: "general",
        filename: __filename,
    },
    async (
        zanta,
        mek,
        m,
        {
            from,
            quoted,
            reply,
        }
    ) => {
        try {
            if (!quoted) {
                return reply("*කරුණාකර ඔබට save කර ගැනීමට අවශ්‍ය Media Message එකකට (Status, OTV, Photo/Video) reply කරන්න!* 🧐");
            }

            let mediaMessage = quoted.fakeObj;
            let saveCaption = "*💾 Saved and Resent!*";
            let recognized = false;

            // ⚠️ Crucial Step: Check if it's a Status Reply and Fetch Media if needed ⚠️
            if (quoted.isStatus) {
                // If it's a Status, the media data might not be in quoted.fakeObj initially.
                // We use the framework's internal method (usually through Baileys message key) to fetch the media content.
                
                if (m.quoted && m.quoted.key) {
                    try {
                        // Attempt to fetch the message content using the correct message key/ID
                        // The 'm.quoted' object contains the key of the replied status message.
                        const fetchedMessage = await zanta.loadMessage(from, m.quoted.key.id);

                        if (fetchedMessage) {
                            // Check if the fetched message has media content (e.g., viewOnceMessage)
                            if (fetchedMessage.message?.viewOnceMessage) {
                                mediaMessage = fetchedMessage.message.viewOnceMessage.message;
                            } else {
                                mediaMessage = fetchedMessage.message; // Assume it's regular media message structure
                            }
                            saveCaption = "*✅ Saved and Resent from Status!*";
                            recognized = true;
                        }
                    } catch (fetchError) {
                        console.error("Error fetching status message:", fetchError);
                        // If fetching failed, we fall back to the existing quoted.fakeObj if it exists
                        if (quoted.fakeObj) {
                            mediaMessage = quoted.fakeObj;
                            saveCaption = "*✅ Saved and Resent from Status!*";
                            recognized = true;
                        }
                    }
                }
            } else if (quoted.isViewOnce && mediaMessage) {
                // One-Time View (OTV) media is usually reliable via quoted.fakeObj
                saveCaption = "*📸 Saved and Resent from One-Time View!*";
                recognized = true;
            } else if (mediaMessage) {
                // Regular Media Check
                const repliedMtype = quoted.mtype || quoted.fakeObj?.mtype;
                if (repliedMtype && (
                    repliedMtype.includes('imageMessage') || 
                    repliedMtype.includes('videoMessage') || 
                    repliedMtype.includes('audioMessage') || 
                    repliedMtype.includes('documentMessage'))) {
                    recognized = true;
                }
            }

            // 3. Final Check: Proceed only if media is recognized AND we have the data
            if (!recognized || !mediaMessage) {
                return reply("*⚠️ Media Content එක හඳුනාගැනීමට නොහැකි විය. එය Text Status එකක් හෝ Media Data Fetch කිරීම අසාර්ථක විය.*");
            }
            
            // 4. Copy and Forward the media
            await zanta.copyNForward(from, mediaMessage, {
                caption: saveCaption,
                quoted: mek
            });

            return reply("*Media successfully processed and resent!* ✨");

        } catch (e) {
            console.error(e);
            reply(`*Error saving media:* ${e.message || e}`);
        }
    }
);
