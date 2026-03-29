const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { categories, gsHierarchy, roles } = require('../config');
const { getSurveillanceCounts } = require('../utils/surveillance');

// ── Construit la description de l'embed avec les statuts ✅/❌ ─────────────────
function buildDescription(rows, doneSet) {
    return rows.map(({ member, rang, nb }) => {
        const status = doneSet.has(member.id) ? '✅' : '❌';
        return `<@${member.id}> → ${status}\n┗ ${rang} — ${nb} surveillance${nb !== 1 ? 's' : ''}`;
    }).join('\n\n');
}

module.exports = {
    name: 'rapport',
    buildDescription,
    async execute(message) {
        const { guild } = message;

        await guild.members.fetch();

        const surveillancesCategory = guild.channels.cache.get(categories.surveillances);
        if (!surveillancesCategory) return message.reply('Catégorie de surveillance introuvable.');

        const survChannels = guild.channels.cache.filter(c => c.parentId === surveillancesCategory.id);
        if (!survChannels.size) return message.reply('Aucun salon de surveillance trouvé.');

        const counts = await getSurveillanceCounts(guild);
        const rows = [];
        const selectOptions = [];

        survChannels.forEach(c => {
            const match = c.topic?.match(/ID:\s*(\d+)/);
            if (!match) return;
            const memberId = match[1];
            const member = guild.members.cache.get(memberId);
            if (!member) return;

            // Rang GS
            let rang = 'Gestion Staff';
            for (const r of gsHierarchy) {
                const roleId = roles[r.key];
                if (roleId && member.roles.cache.has(roleId)) { rang = r.label; break; }
            }

            const nb = counts[memberId] || 0;
            rows.push({ member, rang, nb });
            selectOptions.push({
                label:       member.displayName.slice(0, 25),
                description: `${rang} — ${nb} surveillance${nb !== 1 ? 's' : ''} cette semaine`,
                value:       member.id,
            });
        });

        if (!selectOptions.length) return message.reply('Aucun membre trouvé dans les salons de surveillance.');

        // Trier par rang
        const rankOrder = gsHierarchy.map(r => r.label);
        rows.sort((a, b) => rankOrder.indexOf(a.rang) - rankOrder.indexOf(b.rang));

        const doneSet = new Set();
        const description = buildDescription(rows, doneSet);

        const embed = new EmbedBuilder()
            .setTitle('📋 Rapports vétérans')
            .setDescription(description)
            .setColor(0x2260da)
            .setFooter({ text: `0/${rows.length} rapport${rows.length > 1 ? 's' : ''} complété${rows.length > 1 ? 's' : ''} · Sélectionne une personne pour rédiger son rapport` });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_rapport')
            .setPlaceholder('Choisir un membre à rapporter…')
            .addOptions(selectOptions);

        const sent = await message.channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(selectMenu)],
        });
        await message.delete().catch(() => {});

        // Stocker l'état dans le Map global
        const { rapportSessions } = require('../utils/rapportState');
        rapportSessions.set(sent.id, {
            rows,
            doneSet,
            doneMentions:  {},  // userId -> { mention, avis }
            totalMembers:  rows.length,
            channelId:     sent.channelId,
            guildId:       guild.id,
        });
    },
};
