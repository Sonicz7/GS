const { Events, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { roles, categories } = require('../config');
const { getCompletion } = require('../tasks/weeklyPing');
const { getSurveillanceCounts } = require('../utils/surveillance');

const MODELE_RAPPORT_SURVEILLANCE =
`📋 **Rapport de surveillance**await interaction.reply({
    embeds: [...],
    ephemeral: true,
});
Date : \`JJ/MM/AAAA\`
Heure : \`HH:MM\`

━━━━━━━━━━━━━━━━━━━━━━━

**Comportements observés :**
> 

**Preuves (screens / vidéos) :**
> Oui / Non
-# il suffit juste d'envoyer la preuve (photo) avec le message

📝 **Conclusion :**
> 

━━━━━━━━━━━━━━━━━━━━━━━`;

// ── Questions rapport hebdomadaire ───────────────────────────────────────────
const QUESTIONS_NOTES = [
    "Note de 1 à 5 — l'ambiance de la Gestion Staff.",
    "Note de 1 à 5 — comment te sens-tu intégré dans la Gestion ?",
    "Note de 1 à 5 — tes relations avec les Gérants. Es-tu à l'aise avec eux ?",
    "Note de 1 à 5 — l'organisation de la Gestion. Penses-tu qu'on est suffisamment organisé ?",
    "Note de 1 à 5 — le niveau de pression et de sévérité des gérants (BD, Gérants, Responsable).",
    "Note de 1 à 5 — les annonces que font les gérants.",
    "Note de 1 à 5 — est-ce que tu te sens écouté par les hauts gradés de la GS ?",
    "Note de 1 à 5 — les résultats GS.",
];
const QUESTIONS_ECRITES = [
    "Penses-tu qu'on devrait changer le système de la GS ?",
    "Que reproches-tu chez les gérants ?",
    "As-tu des idées à proposer ?",
];
const ALL_QUESTIONS_RAPPORT = [...QUESTIONS_NOTES, ...QUESTIONS_ECRITES];

const sessions = new Map();

// ── Création salon rapport personnel ─────────────────────────────────────────
async function createRapportPersonnel(interaction) {
    const { guild, member } = interaction;
    const category = guild.channels.cache.get(categories.rapportsPersonnels);
    if (!category) throw new Error('Catégorie introuvable. Contactez un administrateur.');

    const channelName = `rp-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const existing = guild.channels.cache.find(c => c.name === channelName && c.parentId === category.id);
    if (existing) return existing;

    const channel = await guild.channels.create({
        name: channelName,
        parent: category.id,
        permissionOverwrites: [
            { id: guild.id,         deny:  [PermissionFlagsBits.ViewChannel] },
            { id: member.id,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: roles.veterans,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ...(roles.senior ? [{ id: roles.senior, deny: [PermissionFlagsBits.ViewChannel] }] : []),
            ...roles.hautsGrades
    .filter(id => id !== roles.senior) // ⬅️ AJOUT ICI
    .map(id => ({
        id,
        allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages
        ],
    })),
        ],
        topic: `Rapport personnel de ${member.user.username} | ID: ${member.id}`,
    });

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle('Rapport personnel')
                .setDescription(
                    `Bienvenue <@${member.id}>.\n\n` +
                    'Ce salon vous est réservé pour vos rapports hebdomadaires. ' +
                    'Vous serez pingé chaque **samedi à 10h** avec un bouton pour remplir votre.'
                )
                .setColor(0x2260da)
                .setFooter({ text: `Salon créé le ${new Date().toLocaleDateString('fr-FR')}` }),
        ],
    });
    return channel;
}

// ── Création salon surveillance ───────────────────────────────────────────────
async function createRapportSurveillance(interaction) {
    const { guild, member } = interaction;
    const category = guild.channels.cache.get(categories.surveillances);
    if (!category) throw new Error('Catégorie introuvable. Contactez un administrateur.');

    const channelName = `surv-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const existing = guild.channels.cache.find(c => c.name === channelName && c.parentId === category.id);
    if (existing) return existing;

    const channel = await guild.channels.create({
        name: channelName,
        parent: category.id,
        permissionOverwrites: [
            { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
            { id: roles.veterans, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ...(roles.senior ? [{ id: roles.senior, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
            ...roles.hautsGrades.map(id => ({
                id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
            })),
        ],
        topic: `Rapports de surveillance de ${member.user.username} | ID: ${member.id}`,
    });

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle('Rapport de surveillance')
                .setDescription(
                    `Salon de surveillance de <@${member.id}>.\n\n` +
                    'Ce salon est réservé aux hauts gradés et vétérans. ' +
                    "La personne concernée n'y a pas accès.\n\n" +
                    "Joignez vos captures d'écran directement dans ce salon. " +
                    'Elles seront automatiquement archivées dans les logs.\n\n' +
                    'Copiez et remplissez le modèle suivant pour chaque surveillance :'
                )
                .setColor(0x2260da)
                .setFooter({ text: `Salon créé le ${new Date().toLocaleDateString('fr-FR')}` }),
        ],
    });

    const modelMsg = await channel.send(MODELE_RAPPORT_SURVEILLANCE);
    await modelMsg.pin().catch(() => {});
    return channel;
}

// ── Questionnaire ─────────────────────────────────────────────────────────────
function getQuestions() {
    return ALL_QUESTIONS_RAPPORT;
}

async function startQuestionnaire(interaction) {
    const questions = getQuestions();

    sessions.set(interaction.user.id, {
        type: 'rapport',
        step: 0,
        answers: [],
        channelId:  interaction.channelId,
        messageId:  interaction.message.id,
        guildId:    interaction.guild.id,
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(`Question 1/${questions.length}`)
                .setDescription(questions[0] + '\n-# Réponds avec un chiffre de 1 à 5.')
                .setColor(0x2260da)
                .setFooter({ text: 'Rapport hebdomadaire' }),
        ],
    });
}

async function handleQuestionnaireReply(message, client) {
    const userId = message.author.id;
    if (!sessions.has(userId)) return false;

    const session  = sessions.get(userId);
    const { step } = session;
    const answer   = message.content.trim();
    const questions = getQuestions();

    // Validation note (rapport)
    if (session.type === 'rapport' && step < QUESTIONS_NOTES.length) {
        const n = parseInt(answer);
        if (isNaN(n) || n < 1 || n > 5) {
            await message.reply({ embeds: [new EmbedBuilder().setDescription('Réponds avec un chiffre entre **1** et **5**.').setColor(0xe74c3c)] }).catch(() => {});
            await message.delete().catch(() => {});
            return true;
        }
    }

    session.answers.push(answer);
    session.step++;
    await message.delete().catch(() => {});

    if (session.step < questions.length) {
        const isNote = session.step < QUESTIONS_NOTES.length;
        const hint   = isNote ? '\n-# Réponds avec un chiffre de 1 à 5.' : '';

        const embed = new EmbedBuilder()
            .setTitle(`Question ${session.step + 1}/${questions.length}`)
            .setDescription(questions[session.step] + hint)
            .setColor(0x2260da)
            .setFooter({ text: session.type === 'rapport' ? 'Rapport hebdomadaire' : 'Stats & Heures de voc' });

        const guild         = client.guilds.cache.get(session.guildId);
const ticketChannel = guild?.channels.cache.get(session.channelId);
await (ticketChannel ?? message.channel).send({ embeds: [embed] });
        return true;
    }

    sessions.delete(userId);
    await finaliserQuestionnaire(session, message, client);
    return true;
}

async function finaliserQuestionnaire(session, message, client) {
    const guild   = client.guilds.cache.get(session.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(session.channelId);
    if (!channel) return;

    let embed;

    const noteFields  = QUESTIONS_NOTES.map((q, i) => ({ name: q, value: `**${session.answers[i]}/5**`, inline: true }));
    const ecritFields = QUESTIONS_ECRITES.map((q, i) => ({ name: q, value: session.answers[QUESTIONS_NOTES.length + i], inline: false }));

    embed = new EmbedBuilder()
        .setTitle('Rapport hebdomadaire complété')
        .setColor(0x2260da)
        .addFields(...noteFields, ...ecritFields)
        .setFooter({ text: `Complété le ${new Date().toLocaleDateString('fr-FR')}` });

    await channel.send({ embeds: [embed] });

    // Marquer le bouton en vert
    try {
        const pingMsg = await channel.messages.fetch(session.messageId);
        const oldRow  = pingMsg.components[0];
        if (!oldRow) return;

        const newButtons = oldRow.components.map(btn => {
            const b  = ButtonBuilder.from(btn);
            const id = btn.customId || '';
            if (id.startsWith('rapport_')) {
                b.setStyle(ButtonStyle.Success).setDisabled(true);
            }
            return b;
        });
        await pingMsg.edit({ components: [new ActionRowBuilder().addComponents(newButtons)] });
    } catch (err) {
        console.error('[SESSION] Erreur mise à jour bouton :', err);
    }
}

module.exports = {
    name: Events.InteractionCreate,
    handleQuestionnaireReply,
    QUESTIONS_NOTES,
    QUESTIONS_ECRITES,

    async execute(interaction, client) {
        // ── Slash commands ────────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error(`[COMMAND] Erreur sur /${interaction.commandName} :`, err);
                const errEmbed = new EmbedBuilder().setDescription('Une erreur est survenue.').setColor(0xe74c3c);
                interaction.replied || interaction.deferred
                    ? await interaction.followUp({ embeds: [errEmbed], ephemeral: true })
                    : await interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }
            return;
        }

        // ── Select menu — choix du membre à rapporter ────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_rapport') {
            const userId     = interaction.values[0];
            const trackMsgId = interaction.message.id;

            // Afficher un select de mention (éphémère) avant le modal
            const mentionMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_mention_${userId}_${trackMsgId}`)
                .setPlaceholder('Choisir une mention…')
                .addOptions([
                    { label: '⚠️ Attention',     value: 'Attention',     description: 'Comportement à surveiller' },
                    { label: '😐 Satisfaisant',  value: 'Satisfaisant',  description: 'Dans les attentes minimales' },
                    { label: '👍 Bien',           value: 'Bien',          description: 'Bonne semaine' },
                    { label: '⭐ Très bien',      value: 'Très bien',     description: 'Au-dessus des attentes' },
                    { label: '🏆 Excellent',      value: 'Excellent',     description: 'Performance exceptionnelle' },
                ]);

            await interaction.reply({
                content: `**Choix de la mention** pour <@${userId}> :`,
                components: [new ActionRowBuilder().addComponents(mentionMenu)],
                ephemeral: true,
            });
            return;
        }

        // ── Select menu — choix de la mention ────────────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_mention_')) {
            const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
            // format: select_mention_{userId}_{trackMsgId}
            const withoutPrefix  = interaction.customId.replace('select_mention_', '');
            const firstUnderscore = withoutPrefix.indexOf('_');
            const userId     = withoutPrefix.substring(0, firstUnderscore);
            const trackMsgId = withoutPrefix.substring(firstUnderscore + 1);
            const mention    = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`rapport_user_${userId}_${trackMsgId}_${mention}`)
                .setTitle('Rapport vétéran');

            const avisInput = new TextInputBuilder()
                .setCustomId('avis')
                .setLabel('Avis général')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const surveillanceInput = new TextInputBuilder()
                .setCustomId('surveillance')
                .setLabel('Surveillance (résumé)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setPlaceholder('Optionnel — résumé des surveillances de la semaine');

            modal.addComponents(
                new ActionRowBuilder().addComponents(avisInput),
                new ActionRowBuilder().addComponents(surveillanceInput),
            );

            await interaction.showModal(modal);
            return;
        }

        // ── Modal submit — rapport vétéran ────────────────────────────────────
        if (interaction.isModalSubmit() && interaction.customId.startsWith('rapport_user_')) {
            // customId format: rapport_user_{userId}_{trackingMessageId}_{mention}
            const withoutPrefix  = interaction.customId.replace('rapport_user_', '');
            const parts          = withoutPrefix.split('_');
            const userId         = parts[0];
            // trackMsgId = parts[1], mention = last part(s) (mention peut contenir des espaces encodés)
            // On split: userId _ trackMsgId _ ...mention
            const trackMsgId = parts[1];
            const mention    = parts.slice(2).join(' '); // "Très bien" → split en ["Très","bien"]

            const avis         = interaction.fields.getTextInputValue('avis');
            const surveillance = interaction.fields.getTextInputValue('surveillance') || null;

            // ── Mettre à jour l'état de la session ──────────────────────────
            const { rapportSessions } = require('../utils/rapportState');
            const session = rapportSessions.get(trackMsgId);

            if (session) {
                session.doneSet.add(userId);
                session.doneMentions[userId] = { mention, avis, surveillance, veteranId: interaction.user.id };

                const { buildDescription } = require('../commands/rapport');
                const done  = session.doneSet.size;
                const total = session.totalMembers;
                const allDone = done >= total;

                const newDescription = buildDescription(session.rows, session.doneSet);

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('📋 Rapports vétérans')
                    .setDescription(newDescription)
                    .setColor(allDone ? 0x2ecc71 : 0x2260da)
                    .setFooter({ text: `${done}/${total} rapport${total > 1 ? 's' : ''} complété${total > 1 ? 's' : ''}${allDone ? ' · Prêt à publier !' : ' · Sélectionne une personne pour rédiger son rapport'}` });

                // Reconstruire les composants
                const selectOptions = session.rows.map(({ member, rang, nb }) => ({
                    label:       member.displayName.slice(0, 25),
                    description: `${rang} — ${nb} surveillance${nb !== 1 ? 's' : ''} cette semaine`,
                    value:       member.id,
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_rapport')
                    .setPlaceholder('Modifier un rapport…')
                    .addOptions(selectOptions);

                const components = [new ActionRowBuilder().addComponents(selectMenu)];

                // Ajouter le bouton Publier si tout le monde est ✅
                if (allDone) {
                    const publishBtn = new ButtonBuilder()
                        .setCustomId(`publier_rapport_${trackMsgId}`)
                        .setLabel('📢 Publier les rapports')
                        .setStyle(ButtonStyle.Success);
                    components.push(new ActionRowBuilder().addComponents(publishBtn));
                }

                // Mettre à jour le message de suivi
                try {
                    const guild   = interaction.guild;
                    const channel = guild.channels.cache.get(session.channelId);
                    if (channel) {
                        const trackMsg = await channel.messages.fetch(trackMsgId);
                        await trackMsg.edit({ embeds: [updatedEmbed], components });
                    }
                } catch (err) {
                    console.error('[RAPPORT] Erreur mise à jour embed :', err);
                }
            }

            await interaction.reply({ content: `Rapport de <@${userId}> enregistré ✅`, ephemeral: true });
            return;
        }

        if (!interaction.isButton()) return;

        const { customId } = interaction;

        // ── Bouton : ouvrir rapport ───────────────────────────────────────────
        if (customId === 'open_rapports') {
            await interaction.deferReply({ ephemeral: true });

            let description = '';

            try {
                const ch = await createRapportPersonnel(interaction);
                description += `Rapport personnel : <#${ch.id}>`;
            } catch (err) {
                console.error('[INTERACTION] Rapport personnel :', err);
                description += `Rapport personnel : ${err.message}`;
            }

            try {
                await createRapportSurveillance(interaction);
            } catch (err) {
                console.error('[INTERACTION] Rapport surveillance :', err);
            }

            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(description).setColor(0x2260da)] });
            return;
        }

        // ── Bouton : rapport hebdomadaire ─────────────────────────────────────
        if (customId.startsWith('rapport_')) {
            const targetId = customId.split('_')[1];
            if (interaction.user.id !== targetId) {
                return interaction.reply({ embeds: [new EmbedBuilder().setDescription('Ce bouton ne te concerne pas.').setColor(0xe74c3c)], ephemeral: true });
            }
            await startQuestionnaire(interaction);
            return;
        }

        // ── Bouton : publier les rapports vétérans ────────────────────────────
        if (customId.startsWith('publier_rapport_')) {
            const trackMsgId = customId.replace('publier_rapport_', '');
            const { rapportSessions } = require('../utils/rapportState');
            const session = rapportSessions.get(trackMsgId);

            if (!session) {
                return interaction.reply({ content: 'Session introuvable ou expirée.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const { channels } = require('../config');
            const rapportChannel = interaction.guild.channels.cache.get(channels.rapports);
            if (!rapportChannel) {
                return interaction.editReply({ content: 'Salon rapports introuvable.' });
            }

            const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const rankOrder = session.rows.map(r => r.rang);

            // ── Construire les champs pour l'embed de publication ────────────
            const fields = [];
            for (const { member, rang, nb } of session.rows) {
                const data = session.doneMentions[member.id];
                if (!data) continue;

                const mentionEmoji =
                    data.mention === 'Excellent'   ? '🏆' :
                    data.mention === 'Très bien'   ? '⭐' :
                    data.mention === 'Bien'         ? '👍' :
                    data.mention === 'Satisfaisant' ? '😐' :
                    data.mention === 'Attention'    ? '⚠️' : '❔';

                // Le ping est dans la value pour qu'il s'affiche en bleu cliquable
                let fieldValue =
                    `<@${member.id}> · *${rang}*
` +
                    `${data.avis}
` +
                    `${mentionEmoji} **${data.mention}** · ${nb} surveillance${nb !== 1 ? 's' : ''}`;

                if (data.surveillance) {
                    fieldValue += `
${data.surveillance}`;
                }

                fieldValue += `
-# Rédigé par <@${data.veteranId}>`;

                fields.push({
                    name: '​',  // champ sans titre visible
                    value: fieldValue,
                    inline: false,
                });
            }

            const publishEmbed = new EmbedBuilder()
                .setTitle('📋 Rapport vétérans — Semaine du ' + today)
                .setColor(0x2260da)
                .addFields(...fields)
                .setFooter({ text: `${fields.length} membre${fields.length > 1 ? 's' : ''} · Publié par ${interaction.user.displayName}` })
                .setTimestamp();

            await rapportChannel.send({ embeds: [publishEmbed] });

            // Désactiver le bouton Publier et mettre le select en grisé
            try {
                const guild   = interaction.guild;
                const channel = guild.channels.cache.get(session.channelId);
                if (channel) {
                    const trackMsg = await channel.messages.fetch(trackMsgId);
                    const disabledBtn = new ButtonBuilder()
                        .setCustomId(`publier_rapport_${trackMsgId}`)
                        .setLabel('✅ Rapports publiés')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);
                    await trackMsg.edit({ components: [new ActionRowBuilder().addComponents(disabledBtn)] });
                }
            } catch (err) {
                console.error('[RAPPORT] Erreur désactivation bouton :', err);
            }

            rapportSessions.delete(trackMsgId);
            await interaction.editReply({ content: `Rapports publiés dans <#${rapportChannel.id}> ✅` });
            return;
        }
    },
};
