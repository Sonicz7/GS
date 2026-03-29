const { EmbedBuilder } = require('discord.js');
const { gsHierarchy, roles, channels } = require('../config');

/**
 * Retourne le rang GS le plus élevé détenu par un membre.
 * Retourne null si le membre n'a pas le rôle Gestion Staff de base.
 */
function getRangGs(member) {
    // Doit au minimum avoir le rôle Gestion Staff
    if (!member.roles.cache.has(roles.gestionStaff)) return null;

    for (const rang of gsHierarchy) {
        const roleId = roles[rang.key];
        if (roleId && member.roles.cache.has(roleId)) {
            return rang;
        }
    }
    return null;
}

/**
 * Construit et envoie (ou met à jour) l'embed de la liste GS dans le salon configuré.
 */
async function updateListeGs(guild) {
    const channel = guild.channels.cache.get(channels.listeGs);
    if (!channel) {
        console.warn('[LISTE GS] Salon introuvable. Vérifie CHANNEL_LISTE_GS dans .env');
        return;
    }

    // Récupère tous les membres du serveur (cache à jour)
    await guild.members.fetch();

    // Regroupe les membres par catégorie
    const groupes = {};
    for (const rang of gsHierarchy) {
        groupes[rang.key] = [];
    }

    for (const [, member] of guild.members.cache) {
        if (member.user.bot) continue;
        const rang = getRangGs(member);
        if (!rang) continue;
        groupes[rang.key].push(member);
    }

    // Compte l'effectif total
    const totalMembers = Object.values(groupes).reduce((sum, arr) => sum + arr.length, 0);

    // Construit les fields de l'embed
    const fields = [];
    for (const rang of gsHierarchy) {
        const membres = groupes[rang.key];
        if (membres.length === 0) continue;

        const liste = membres
            .sort((a, b) => a.user.username.localeCompare(b.user.username))
            .map(m => `• <@${m.id}>`)
            .join('\n');

        fields.push({
            name: `${rang.label} — ${membres.length} membre${membres.length > 1 ? 's' : ''}`,
            value: liste,
            inline: false,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Liste de la Gestion Staff')
        .setDescription(`**Effectif total : ${totalMembers} membre${totalMembers > 1 ? 's' : ''}**`)
        .setColor(0x2260da)
        .setFooter({ text: `Dernière mise à jour : ${new Date().toLocaleString('fr-FR')}` });

    if (fields.length > 0) {
        embed.addFields(fields);
    } else {
        embed.addFields({ name: 'Aucun membre', value: 'La Gestion Staff est vide.', inline: false });
    }

    // Cherche un message existant du bot dans le salon
    const messages = await channel.messages.fetch({ limit: 20 });
    const existing = messages.find(
        m => m.author.id === guild.client.user.id && m.embeds.length > 0
    );

    if (existing) {
        await existing.edit({ embeds: [embed] });
    } else {
        await channel.send({ embeds: [embed] });
    }
}

module.exports = { getRangGs, updateListeGs };
