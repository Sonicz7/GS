const { EmbedBuilder } = require('discord.js');
const { getSurveillanceCounts } = require('../utils/surveillance');
const { channels } = require('../config');

module.exports = {
    name: 'surveillance',
    async execute(message) {
        const counts = await getSurveillanceCounts(message.guild);
        let desc = '';

        for (const userId in counts) {
            desc += `<@${userId}> -> surveillance (${counts[userId]})\n`;
        }

        if (!desc) desc = 'Aucune surveillance trouvée.';

        const embed = new EmbedBuilder()
            .setTitle('Surveillances de la semaine')
            .setDescription(desc)
            .setColor(0x2c3e50)
            .setTimestamp();

        const brouillonsChannel = message.guild.channels.cache.get(channels.brouillons);
        if (!brouillonsChannel) return message.reply('Salon brouillons introuvable.');

        await brouillonsChannel.send({ embeds: [embed] });
        await message.reply('Les surveillances ont été envoyées dans les brouillons ✅');
    }
};
