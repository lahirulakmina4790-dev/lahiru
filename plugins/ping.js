const { cmd } = require("../command");
const os = require('os');
const { runtime, sleep } = require('../lib/functions'); 

// ඔබ ලබා දුන් Image URL එක
const STATUS_IMAGE_URL = "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/ChatGPT%20Image%20Nov%2021,%202025,%2001_21_32%20AM.png?raw=true";

// Helper function to format bytes to a readable string
function bytesToSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

cmd(
    {
        pattern: "ping",
        react: "⏱️",
        desc: "Check the bot's response time and display system information with an image.",
        category: "main",
        filename: __filename,
    },
    async (
        zanta,
        mek,
        m,
        {
            from,
            reply,
        }
    ) => {
        try {
            // 1. Response Time (Latency) Calculation - Start Time
            const startTime = Date.now();
            // මෙහිදී, අපට image එක යැවිය යුතු බැවින්, මෙය තාවකාලික reply එකක් ලෙස යවමු.
            await reply("*⏱️ Latency ගණනය කරමින්...*"); 
            
            // 2. System and Bot Data Collection
            const memoryUsage = process.memoryUsage(); 
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            
            let pm2_details = "";
            
            // PM2 runtime තොරතුරු එකතු කිරීම
            if (process.env.NODE_APP_INSTANCE !== undefined) {
                 pm2_details = `
**⚙️ Process Details (PM2)**
- *Mode:* Fork (Assumed)
- *PID:* ${process.pid}
- *Uptime:* ${runtime(process.uptime())}
- *Status:* Online (Assumed)
`;
            } else {
                 pm2_details = `
**⚙️ Process Details**
- *PID:* ${process.pid}
- *Uptime:* ${runtime(process.uptime())}
`;
            }

            // 3. Latency calculation - End Time
            const endTime = Date.now();
            const latency = endTime - startTime;

            // 4. Constructing the formatted Reply Message (Caption)
            const pingMessage = `
*╭━━━*「 *ZANTA-MD STATUS* 」*━━━╮*
*┃ ⏱️ Latency:* ${latency} ms
*┃ 🌐 Platform:* ${os.platform()}
*┃ 💻 Node Version:* ${process.version}
*╰━━━━━━━━━━━━━━━━━━╯*

*╭━━━*「 *System Resources* 」*━━━╮*
*┃ 🧠 Process RAM:* ${bytesToSize(memoryUsage.rss)}
*┃ 📊 Total System RAM:* ${bytesToSize(totalMemory)}
*┃ 📊 Free System RAM:* ${bytesToSize(freeMemory)}
*╰━━━━━━━━━━━━━━━━━━╯*
`;
            
            // 5. Send the final formatted message WITH IMAGE (නිවැරදි කරන ලද නම)
            await zanta.sendMessage(from, {
                image: { url: STATUS_IMAGE_URL },
                caption: pingMessage
            }, { quoted: mek });

        } catch (e) {
            console.error("[PING ERROR]", e);
            reply("*🚨 Error:* Bot තොරතුරු ලබා ගැනීමට අසමත් විය.");
        }
    }
);
