const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { channels } = require('../config');

module.exports = {
    name: 'panel',

    async execute(message) {
        const panelChannel = message.guild.channels.cache.get(channels.panel);

        if (!panelChannel) {
            return message.reply('Salon panel introuvable. Vérifiez la configuration.');
        }

        const messages = await panelChannel.messages.fetch({ limit: 50 });
        const alreadySent = messages.some(
            m => m.author.id === message.client.user.id && m.components.length > 0
        );

        if (alreadySent) {
            return message.reply('Le panel est déjà présent dans ce salon.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Gestion des rapports')
            .setDescription(
                'Cliquez sur le bouton ci-dessous pour ouvrir votre salon personnel.'
            )
            .setColor(0x2260da)
            .setFooter({ text: 'Un salon dédié sera créé à votre nom.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_rapports')
                .setLabel('Ouvrir mon rapport')
                .setStyle(ButtonStyle.Primary)
        );

        await panelChannel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    },
};
