const { cmd, commands } = require("../command");

cmd(
  {
    pattern: "menu",
    desc: "Displays all available commands",
    category: "main",
    filename: __filename,
  },
  async (
    zanta,
    mek,
    m,
    {
      from,
      reply
    }
  ) => {
    try {
      const categories = {};

      for (let cmdName in commands) {
        const cmdData = commands[cmdName];
        const cat = cmdData.category?.toLowerCase() || "other";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({
          pattern: cmdData.pattern,
          desc: cmdData.desc || "No description"
        });
      }

      // MENU TEXT BUILD
      let menuText = "📋 *Available Commands:*\n";
      for (const [cat, cmds] of Object.entries(categories)) {
        menuText += `\n📂 *${cat.toUpperCase()}*\n`;
        cmds.forEach(c => {
          menuText += `*◻ .${c.pattern} :* ${c.desc}\n`;
        });
      }

      // SEND IMAGE + MENU TEXT IN ONE MESSAGE
      await zanta.sendMessage(
        from,
        {
          image: {
            url: "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/ChatGPT%20Image%20Nov%2021,%202025,%2001_49_53%20AM.png?raw=true"
          },
          caption: menuText.trim(),
        },
        { quoted: mek }
      );

    } catch (err) {
      console.error(err);
      reply("❌ Error generating menu.");
    }
  }
);

