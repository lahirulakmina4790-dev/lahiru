const { cmd } = require("../command");
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const { getBuffer, getRandom, sleep } = require("../lib/functions"); // sleep ද එකතු කරන්න
const fs = require('fs'); // fs library එක අනිවාර්යයෙන්ම අවශ්‍යයි

// --- Core Helper Function for Download ---
async function downloadYoutube(url, format, zanta, from, mek, reply) {
    if (!ytdl.validateURL(url)) {
        return reply("*Invalid YouTube URL provided.* 🔗");
    }

    try {
        // --- 1. Custom Headers අර්ථ දැක්වීම (Bot Detection මඟහැරීමට) ---
        const customHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.youtube.com/',
        };

        const info = await ytdl.getInfo(url, { requestOptions: { headers: customHeaders } });
        const title = info.videoDetails.title;
        
        reply(`*Starting download:* ${title} 📥`);
        await sleep(1000); // පොඩි Delay එකක් දීම හොඳයි

        const stream = ytdl(url, {
            filter: format === 'mp4' ? 'audioandvideo' : 'audioonly',
            quality: format === 'mp4' ? 'highestvideo' : 'highestaudio',
            dlChunkSize: 0, 
            requestOptions: { headers: customHeaders }, // 👈 මෙහිද Custom Headers එකතු කරයි
        });

        const tempFilePath = `${getRandom('.mp4')}`;
        let finalMp3Path; // Global scope එකට ගන්නා ලදී
        
        // --- 2. වීඩියෝව/ශ්‍රව්‍යය මුලින්ම Local File එකක් ලෙස Save කරයි ---
        await new Promise((resolve, reject) => {
            stream.pipe(fs.createWriteStream(tempFilePath))
                .on('finish', resolve)
                .on('error', reject);
        });

        if (format === 'mp3') {
            finalMp3Path = `${getRandom('.mp3')}`;
            
            await new Promise((resolve, reject) => {
                ffmpeg(tempFilePath)
                    .audioBitrate(128)
                    .save(finalMp3Path)
                    .on('end', () => {
                        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); // Temp File එක මකයි
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('FFmpeg Error:', err.message);
                        reject(new Error("FFmpeg conversion failed."));
                    });
            });
            
            // --- 3. MP3 එක යවයි ---
            const mp3Buffer = fs.readFileSync(finalMp3Path);
            await zanta.sendMessage(from, { audio: mp3Buffer, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: mek });
            if (fs.existsSync(finalMp3Path)) fs.unlinkSync(finalMp3Path); // Final File එක මකයි
            reply(`*Download Complete (MP3)!* 🎵✅`);

        } else if (format === 'mp4') {
            // --- 3. MP4 එක යවයි ---
            const videoBuffer = fs.readFileSync(tempFilePath);
            await zanta.sendMessage(from, { video: videoBuffer, caption: `*Download Complete (MP4)!* \n\nTitle: ${title}` }, { quoted: mek });
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); // Temp File එක මකයි
        }

    } catch (e) {
        console.error("YouTube Download Error:", e);
        
        // Error messages සාරාංශ කිරීම
        let errorMessage = e.message.includes('403') ? 'Access Denied (Possibly Age-Restricted/Copyright)' : 
                           e.message.includes('410') ? 'Video Permanently Deleted' :
                           'Unknown Error Occurred.';

        reply(`*❌ Download Failed!* \n\n*Reason:* ${errorMessage} \n\nIf the issue persists, YouTube may be blocking the bot's requests (Sign in Required).`);

        // Clean up files if they exist
        if (typeof tempFilePath !== 'undefined' && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (typeof finalMp3Path !== 'undefined' && fs.existsSync(finalMp3Path)) fs.unlinkSync(finalMp3Path);
    }
}

// --- $ytmp4 Command (Video Download) ---
cmd(
    {
        pattern: "ytmp4",
        alias: ["vid", "ytvideo"],
        react: "🎞️",
        desc: "Downloads a YouTube video as MP4.",
        category: "download",
        filename: __filename,
    },
    async (zanta, mek, m, { from, reply, q }) => {
        if (!q) return reply("*Please provide a YouTube link.* 🔗");
        await downloadYoutube(q, 'mp4', zanta, from, mek, reply);
    }
);

// --- $ytmp3 Command (Audio Download) ---
cmd(
    {
        pattern: "ytmp3",
        alias: ["audio", "ytaudio"],
        react: "🎶",
        desc: "Downloads a YouTube video as MP3 audio.",
        category: "download",
        filename: __filename,
    },
    async (zanta, mek, m, { from, reply, q }) => {
        if (!q) return reply("*Please provide a YouTube link.* 🔗");
        await downloadYoutube(q, 'mp3', zanta, from, mek, reply);
    }
);
