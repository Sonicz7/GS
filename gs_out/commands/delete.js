const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'delete',

    async execute(message) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('Permissions insuffisantes.')
                        .setColor(0xe74c3c)
                ]
            });
        }

        const embed = new EmbedBuilder()
            .setDescription('Suppression du salon...')
            .setColor(0x2c3e50);

        await message.channel.send({ embeds: [embed] });

        setTimeout(() => {
            message.channel.delete().catch(() => {});
        }, 1500);
    }
};
