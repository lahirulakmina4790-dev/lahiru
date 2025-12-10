const { cmd } = require("../command");
// profilePictureUrl function එකට Baileys client object එක (zanta) අවශ්‍යයි.

cmd(
    {
        pattern: "getdp",
        react: "👤",
        desc: "Get the profile picture.",
        category: "general",
        filename: __filename,
    },
    async (
        zanta,
        mek,
        m,
        {
            from,
            q,
            quoted,
            reply,
            isGroup,
            sender,
            mentionUser,
            args,
        }
    ) => {
        try {
            let targetJid;
            
            // 1. Target JID තීරණය කිරීම
            if (mentionUser && mentionUser.length > 0) {
                // Mention කර ඇත්නම් (සාමාන්‍ය පරිදි ක්‍රියා කරයි)
                targetJid = mentionUser[0];
            } else if (m.quoted) {
                // Reply කර ඇත්නම් (සාමාන්‍ය පරිදි ක්‍රියා කරයි)
                targetJid = m.quoted.sender;
            } else if (isGroup && (q === 'group' || q === 'g')) {
                // '.getdp group' කියා ගැසුවොත්, Group DP එක
                targetJid = from;
            } else if (!isGroup && !q) {
                // 🔑 නව Logic: Personal Chat එකකදී සහ කිසිවක් සඳහන් කර නොමැති විට.
                // Chat එකේ අනෙක් පුද්ගලයා (ඔබේ සහකරු)
                // From යනු Chat JID එක වන අතර, එය Group එකක් නොවේ නම්, එය Chat Partner ගේ JID එකයි.
                targetJid = from; 
            } else if (isGroup && !q) {
                 // Group එකකදී, කිසිවක් සඳහන් කර නොමැති විට, යවන පුද්ගලයාගේ DP එක (පෙර පරිදිම)
                 targetJid = sender;
                 return reply("*Group එකක් තුළදී, `.getdp` ලෙස පමණක් යැවුවොත්, ඔබේ DP එක ලැබේ.* වෙනත් අයෙකුගේ DP එක අවශ්‍ය නම් Mention කරන්න.");
            } else if (args.length > 0 && !isNaN(args[0])) {
                // Number එකක් කෙලින්ම දී ඇත්නම්
                targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            } else {
                 return reply("*කරුණාකර: 1. කෙනෙක්ව Mention කරන්න, 2. Message එකකට Reply කරන්න, හෝ 3. Number එකක් දෙන්න (.getdp 94xxxxxxxxx)*");
            }
            
            if (!targetJid) {
                 return reply("*⚠️ Target JID එක තීරණය කිරීමට අසමත් විය.*");
            }
            
            reply(`*${targetJid.split('@')[0]} ගේ Profile Picture එක සොයමින්...* 🔍`);

            // 2. Profile Picture URL එක ලබා ගැනීම
            const profilePictureUrl = await zanta.profilePictureUrl(targetJid, 'image');

            if (!profilePictureUrl) {
                return reply(`*❌ ${targetJid.split('@')[0]} ගේ DP එකක් සොයාගත නොහැක.*`);
            }
            
            // 3. Image එක Resend කිරීම
            await zanta.sendMessage(from, {
                image: { url: profilePictureUrl },
                caption: `*✅ ${targetJid.includes('@g.us') ? 'Group' : targetJid.split('@')[0]} ගේ Profile Picture එක.*`
            }, { quoted: mek });

        } catch (e) {
            console.error("--- GETDP ERROR ---", e);
            reply(`*🚨 Error:* ${e.message || e}. DP ලබා ගැනීමට අසමත් විය.`);
        }
    }
);
