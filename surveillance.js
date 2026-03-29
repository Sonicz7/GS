const { channels } = require('../config');

module.exports = {
    name: 'publier',
    async execute(message) {
        const brouillonsChannel = message.guild.channels.cache.get(channels.brouillons);
        const rapportsChannel = message.guild.channels.cache.get(channels.rapports);

        if (!brouillonsChannel || !rapportsChannel) return message.reply('Vérifiez les salons Brouillons et Rapports.');

        const messages = await brouillonsChannel.messages.fetch({ limit: 50 });
        if (!messages.size) return message.reply('Aucun brouillon à publier.');

        for (const msg of messages.values()) {
            if (msg.embeds.length > 0) {
                await rapportsChannel.send({ embeds: [msg.embeds[0]] });
                await msg.delete();
            }
        }

        await message.reply('Tous les brouillons ont été publiés dans le salon Rapports ✅');
    }
};
