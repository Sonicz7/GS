const { Events, EmbedBuilder } = require('discord.js');
const { categories, channels } = require('../config');
const { handleQuestionnaireReply } = require('./interactionCreate');

const PREFIX = '=';
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

function containsMedia(message) {
    if (message.attachments.size > 0) {
        return [...message.attachments.values()].some(att => {
            if (att.contentType) {
                if (att.contentType.startsWith('image/')) return true;
                if (att.contentType.startsWith('video/')) return true;
            }
            const ext = att.name ? att.name.split('.').pop().toLowerCase() : '';
            return IMAGE_EXTENSIONS.includes(`.${ext}`) || VIDEO_EXTENSIONS.includes(`.${ext}`);
        });
    }

    if (message.embeds.length > 0) {
        return message.embeds.some(e => e.image || e.thumbnail || e.video);
    }

    return false;
}

module.exports = {
    name: Events.MessageCreate,

    async execute(message, client) {
        if (message.author.bot) return;
        if (!message.guild) return;

        const handled = await handleQuestionnaireReply(message, client);
        if (handled) return;

        if (message.content.startsWith(PREFIX)) {
            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const command = client.commands.get(commandName);
            if (!command) return;

            // Commandes accessibles aux vétérans, responsables, bras droits et gérants
            const COMMANDES_HAUTS_GRADES = ['surveillance', 'rapport', 'resultat'];

            if (COMMANDES_HAUTS_GRADES.includes(commandName)) {
                const { roles } = require('../config');

                // =resultat : réservé responsable, bras droit, gérant
                if (commandName === 'resultat') {
                    const rolesResultat = [roles.responsable, roles.brasDroit, roles.gerant].filter(Boolean);
                    if (!rolesResultat.some(r => message.member.roles.cache.has(r))) {
                        const e = new EmbedBuilder()
                            .setDescription('❌ Tu dois être **Responsable**, **Bras Droit** ou **Gérant** pour utiliser cette commande.')
                            .setColor(0xe74c3c);
                        return message.reply({ embeds: [e] });
                    }
                } else {
                    const rolesAutorises = [
                        roles.veteran,
                        roles.responsable,
                        roles.brasDroit,
                        roles.gerant,
                    ].filter(Boolean);

                    const aLeDroit = rolesAutorises.some(roleId => message.member.roles.cache.has(roleId));

                    if (!aLeDroit) {
                        const e = new EmbedBuilder()
                            .setDescription('❌ Tu dois être **Vétéran**, **Responsable**, **Bras Droit** ou **Gérant** pour utiliser cette commande.')
                            .setColor(0xe74c3c);
                        return message.reply({ embeds: [e] });
                    }
                }
            } else if (message.author.id !== '744346198785130507') {
                const e = new EmbedBuilder().setDescription('Permissions insuffisantes.').setColor(0xe74c3c);
                return message.reply({ embeds: [e] });
            }

            try {
                await command.execute(message, args, client);
            } catch (err) {
                console.error(`[COMMAND] Erreur sur =${commandName} :`, err);
                const e = new EmbedBuilder().setDescription('Une erreur est survenue.').setColor(0xe74c3c);
                message.reply({ embeds: [e] });
            }
            return;
        }

        const surveillanceCategory = message.guild.channels.cache.get(categories.surveillances);
        if (!surveillanceCategory) return;
        if (message.channel.parentId !== surveillanceCategory.id) return;
        if (!containsMedia(message)) return;

        const logsChannel = message.guild.channels.cache.get(channels.logs);
        if (!logsChannel) {
            console.warn('[LOGS] Salon de logs introuvable.');
            return;
        }

        const imageAttachments = [...message.attachments.values()].filter(att => {
    if (att.contentType && att.contentType.startsWith('image/')) return true;
    const ext = att.name ? att.name.split('.').pop().toLowerCase() : '';
    return IMAGE_EXTENSIONS.includes(`.${ext}`);
});

const videoAttachments = [...message.attachments.values()].filter(att => {
    if (att.contentType && att.contentType.startsWith('video/')) return true;
    const ext = att.name ? att.name.split('.').pop().toLowerCase() : '';
    return VIDEO_EXTENSIONS.includes(`.${ext}`);
});

// Déclaration de l'embed
const embed = new EmbedBuilder()
    .setTitle('Surveillance — Capture archivée')
    .setColor(0x2260da)
    .addFields(
        { name: 'Auteur', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: 'Salon', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Date', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: `ID message : ${message.id}` });

// Contenu textuel
if (message.content && message.content.trim() !== '') {
    embed.addFields({ name: 'Contenu', value: message.content.slice(0, 1024) });
}

// Ajouter la première image dans l'embed
if (imageAttachments.length > 0) {
    embed.setImage(imageAttachments[0].url);

    if (imageAttachments.length > 1) {
        embed.addFields({
            name: `Captures (${imageAttachments.length})`,
            value: imageAttachments.map((a, i) => `[Image ${i + 1}](${a.url})`).join('\n')
        });
    }
}

// Ajouter les vidéos en tant que liens dans l'embed
if (videoAttachments.length > 0) {
    embed.addFields({
        name: `Vidéo${videoAttachments.length > 1 ? 's' : ''} (${videoAttachments.length})`,
        value: videoAttachments.map((v, i) => `[Vidéo ${i + 1}](${v.url})`).join('\n')
    });
}

// Envoi uniquement de l'embed
await logsChannel.send({ embeds: [embed] });
    },
};
