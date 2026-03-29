const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'close',

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

        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: false
        });

        const embed = new EmbedBuilder()
            .setDescription('Salon fermé.')
            .setColor(0x2c3e50);

        message.channel.send({ embeds: [embed] });
    }
};
