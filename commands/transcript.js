const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'transcript',

    async execute(message) {
        const channel = message.channel;
        const logChannelId = '1487777677023776878';
        const logChannel = message.guild.channels.cache.get(logChannelId);

        if (!logChannel) {
            return message.reply('Salon de logs introuvable.');
        }

        let allMessages = [];
        let lastId;

        // Fetch complet des messages
        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            allMessages.push(...messages.values());
            lastId = messages.last().id;
        }

        const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        // Construction du HTML avec le style "Modern Dark"
        let html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcript - ${channel.name}</title>
    <style>
        :root {
            --bg: #0e1117;
            --surface: #161b22;
            --surface2: #21262d;
            --border: #30363d;
            --accent: #2260da;
            --text: #e6edf3;
            --text-muted: #8b949e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: var(--bg);
            color: var(--text);
            font-family: 'Segoe UI', system-ui, sans-serif;
            line-height: 1.5;
            padding-bottom: 50px;
        }
        header {
            background: linear-gradient(135deg, var(--accent) 0%, #1a3a7a 100%);
            padding: 30px 40px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 30px;
        }
        header h1 { font-size: 22px; font-weight: 700; }
        header p { color: rgba(255,255,255,0.7); font-size: 13px; margin-top: 5px; }
        
        .container { max-width: 1000px; margin: 0 auto; padding: 0 20px; }
        
        .message-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            display: flex;
            gap: 15px;
            transition: border-color 0.2s;
        }
        .message-card:hover { border-color: var(--accent); }
        
        .avatar {
            width: 42px; height: 42px;
            border-radius: 50%;
            border: 1px solid var(--border);
            flex-shrink: 0;
        }
        .msg-content { flex: 1; }
        .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .author { font-weight: 600; color: #fff; font-size: 14px; }
        .timestamp { font-size: 11px; color: var(--text-muted); }
        .bot-badge {
            background: var(--accent);
            color: white;
            font-size: 9px;
            padding: 1px 5px;
            border-radius: 3px;
            font-weight: 800;
        }
        .text {
            font-size: 14px;
            white-space: pre-wrap;
            word-break: break-word;
            color: #d1d9e0;
        }
        .embed-container {
            margin-top: 10px;
            padding: 12px;
            border-left: 4px solid var(--accent);
            background: var(--surface2);
            border-radius: 4px;
            font-size: 13px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            color: var(--text-muted);
            font-size: 12px;
        }
    </style>
</head>
<body>
<header>
    <h1>📄 Transcript : ${channel.name}</h1>
    <p>Généré le ${new Date().toLocaleString('fr-FR')} • ${sorted.length} messages au total</p>
</header>
<div class="container">`;

        for (const msg of sorted) {
            const isBot = msg.author.bot ? '<span class="bot-badge">BOT</span>' : '';
            
            html += `
    <div class="message-card">
        <img class="avatar" src="${msg.author.displayAvatarURL({ extension: 'png' })}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div class="msg-content">
            <div class="msg-header">
                <span class="author">${msg.author.tag}</span>
                ${isBot}
                <span class="timestamp">${new Date(msg.createdTimestamp).toLocaleString('fr-FR')}</span>
            </div>
            <div class="text">${msg.content || ''}</div>`;

            // Gestion basique des embeds s'ils existent
            if (msg.embeds.length > 0) {
                msg.embeds.forEach(embed => {
                    html += `
            <div class="embed-container">
                ${embed.title ? `<div style="font-weight:bold; margin-bottom:5px;">${embed.title}</div>` : ''}
                ${embed.description ? `<div>${embed.description}</div>` : ''}
            </div>`;
                });
            }

            html += `
        </div>
    </div>`;
        }

        html += `
    <footer>Fin du transcript — Archives de la Gestion Staff</footer>
</div>
</body>
</html>`;

        const fileName = `transcript-${channel.id}.html`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, html);

        const attachment = new AttachmentBuilder(filePath);

        const embedLog = new EmbedBuilder()
            .setTitle('📁 Nouveau Transcript Archivé')
            .addFields(
                { name: 'Salon', value: `\`${channel.name}\``, inline: true },
                { name: 'Généré par', value: `${message.author}`, inline: true },
                { name: 'Messages', value: `\`${sorted.length}\``, inline: true }
            )
            .setColor(0x2260da)
            .setTimestamp();

        await logChannel.send({
            embeds: [embedLog],
            files: [attachment]
        });

        await message.reply('✅ Le transcript a été généré et archivé avec succès.');

        // Suppression sécurisée du fichier temporaire
        setTimeout(() => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, 5000);
    }
};
