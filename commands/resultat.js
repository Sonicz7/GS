const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
} = require('discord.js');
const { roles } = require('../config');

// ── Mentions — menu déroulant identique à =rapport ───────────────────────────
// Remplace chaque roleId par le vrai ID du rôle de mention sur ton serveur
const MENTIONS_RESULTAT = [
    { label: '⚠️ Attention',    value: 'Attention',    roleId: 'ID_ROLE_MENTION_ATTENTION',    description: 'Comportement à surveiller' },
    { label: '😐 Satisfaisant', value: 'Satisfaisant', roleId: 'ID_ROLE_MENTION_SATISFAISANT', description: 'Dans les attentes minimales' },
    { label: '👍 Bien',          value: 'Bien',          roleId: 'ID_ROLE_MENTION_BIEN',          description: 'Bonne semaine' },
    { label: '⭐ Très bien',     value: 'Très bien',    roleId: 'ID_ROLE_MENTION_TRES_BIEN',    description: 'Au-dessus des attentes' },
    { label: '🏆 Excellent',     value: 'Excellent',    roleId: 'ID_ROLE_MENTION_EXCELLENT',    description: 'Performance exceptionnelle' },
];

// Mentions pour les Vétérans (même liste que Senior)
const MENTIONS_RESULTAT_VETERAN = MENTIONS_RESULTAT;




const COLOR = 0x2260da;

// ── Sessions actives ──────────────────────────────────────────────────────────
const resultatSessions = new Map();

// ── Description de l'embed de suivi (style =rapport) ─────────────────────────
function buildDescription(rows, doneSet) {
    return rows.map(({ member }) => {
        const status = doneSet.has(member.id) ? '✅' : '❌';
        return `<@${member.id}> → ${status}`;
    }).join('\n\n');
}

// ── Génération du .txt final ──────────────────────────────────────────────────
function generateTxt(rows, doneData) {
    const seniorRows       = rows.filter(r => r.type === 'senior');
    const veteranRows      = rows.filter(r => r.type === 'veteran');
    const gestionStaffRows = rows.filter(r => r.type === 'gestionStaff');

    let out = '';

    if (veteranRows.length) {
        out += `# GS VÉTÉRAN\n`;
        for (const { member } of veteranRows) {
            const data = doneData[member.id];
            if (!data) continue;
            out += `<@${member.id}>\n`;
            out += `* *Tickets* :\n`;
            out += `* *Vocal* :\n`;
            out += `> ${data.appreciation}\n`;
            out += `**Mention** : <@&${data.mentionRoleId}>\n`;
            out += `\n`;
        }
    }

    if (seniorRows.length) {
        out += `# GS SENIOR \n`;
        for (const { member } of seniorRows) {
            const data = doneData[member.id];
            if (!data) continue;
            out += `<@${member.id}>\n`;
            out += `* *Tickets* :\n`;
            out += `* *Vocal* :\n`;
            out += `> ${data.appreciation}\n`;
            out += `**Mention** : <@&${data.mentionRoleId}>\n`;
            out += `\n`;
        }
    }

    if (gestionStaffRows.length) {
        out += `# GESTION STAFF \n`;
        for (const { member } of gestionStaffRows) {
            const data = doneData[member.id];
            if (!data) continue;
            out += `<@${member.id}>\n`;
            out += `* *Tickets* :\n`;
            out += `* *Vocal* :\n`;
            out += `> ${data.appreciation}\n`;
            out += `**Mention** : <@&${data.mentionRoleId}>\n`;
            out += `\n`;
        }
    }

    return out;
}

// ── Commande =resultat ────────────────────────────────────────────────────────
module.exports = {
    name: 'resultat',
    resultatSessions,
    buildDescription,

    async execute(message) {
        const { guild, member } = message;

        // Vérif permission
        const rolesAutorises = [roles.responsable, roles.brasDroit, roles.gerant].filter(Boolean);
        if (!rolesAutorises.some(r => member.roles.cache.has(r))) {
            const e = new EmbedBuilder()
                .setDescription('❌ Tu dois être **Responsable**, **Bras Droit** ou **Gérant** pour utiliser cette commande.')
                .setColor(0xe74c3c);
            return message.reply({ embeds: [e] });
        }

        // Récupération des membres GS Senior + Vétéran avec Gestion Staff
        await guild.members.fetch();

        if (!roles.senior || !roles.veteran || !roles.gestionStaff) {
            return message.reply('❌ `ROLE_SENIOR`, `ROLE_VETERAN` ou `ROLE_GESTION_STAFF` manquant dans le `.env`.');
        }

        // Rôles "au-dessus" du vétéran dans la hiérarchie (excluent un vétéran de la liste)
        const rolesSuperieurVeteran = [roles.responsable, roles.brasDroit, roles.gerant].filter(Boolean);

        // GS Senior : a le rôle senior + gestion staff
        const membresSenior = guild.members.cache.filter(m =>
            !m.user.bot &&
            m.roles.cache.has(roles.senior) &&
            m.roles.cache.has(roles.gestionStaff)
        );

        // GS Vétéran : a le rôle vétéran + gestion staff, sans rôle supérieur, sans senior (évite doublons)
        const membresVeteran = guild.members.cache.filter(m =>
            !m.user.bot &&
            m.roles.cache.has(roles.veteran) &&
            m.roles.cache.has(roles.gestionStaff) &&
            !m.roles.cache.has(roles.senior) &&
            !rolesSuperieurVeteran.some(r => m.roles.cache.has(r))
        );

        // Gestion Staff seul : a gestion staff, mais pas senior, pas vétéran, pas de rôle supérieur
        const membresGestionStaff = guild.members.cache.filter(m =>
            !m.user.bot &&
            m.roles.cache.has(roles.gestionStaff) &&
            !m.roles.cache.has(roles.senior) &&
            !m.roles.cache.has(roles.veteran) &&
            !rolesSuperieurVeteran.some(r => m.roles.cache.has(r))
        );

        if (!membresSenior.size && !membresVeteran.size && !membresGestionStaff.size) {
            return message.reply('❌ Aucun membre trouvé avec les rôles **GS Senior**, **Vétéran** ou **Gestion Staff**.');
        }

        const rows          = [];
        const selectOptions = [];

        membresSenior.forEach(m => {
            rows.push({ member: m, type: 'senior' });
            selectOptions.push({
                label:       m.displayName.slice(0, 25),
                description: 'GS Senior',
                value:       m.id,
            });
        });

        membresVeteran.forEach(m => {
            rows.push({ member: m, type: 'veteran' });
            selectOptions.push({
                label:       m.displayName.slice(0, 25),
                description: '⭐ Vétéran',
                value:       m.id,
            });
        });

        membresGestionStaff.forEach(m => {
            rows.push({ member: m, type: 'gestionStaff' });
            selectOptions.push({
                label:       m.displayName.slice(0, 25),
                description: '📋 Gestion Staff',
                value:       m.id,
            });
        });

        const doneSet     = new Set();
        const description = buildDescription(rows, doneSet);

        const embed = new EmbedBuilder()
            .setTitle(`Résultats GS Senior, Vétérans & Gestion Staff`)
            .setDescription(description)
            .setColor(COLOR)
            .setFooter({ text: `0/${rows.length} résultat${rows.length > 1 ? 's' : ''} complété${rows.length > 1 ? 's' : ''} · Sélectionne un membre pour rédiger son résultat` });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_resultat')
            .setPlaceholder('Choisir un membre à évaluer…')
            .addOptions(selectOptions);

        const sent = await message.channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(selectMenu)],
        });
        await message.delete().catch(() => {});

        resultatSessions.set(sent.id, {
            rows,
            doneSet,
            doneData:     {},
            totalMembers: rows.length,
            channelId:    sent.channelId,
            guildId:      guild.id,
        });
    },
};

// ── Handler interactions (appelé depuis interactionCreate.js) ─────────────────
module.exports.handleResultatInteraction = async function (interaction, client) {

    // Select du membre
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_resultat') {
        const userId     = interaction.values[0];
        const trackMsgId = interaction.message.id;

        const { roles } = require('../config');
        const rolesAutorises = [roles.responsable, roles.brasDroit, roles.gerant].filter(Boolean);
        if (!rolesAutorises.some(r => interaction.member.roles.cache.has(r))) {
            return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
        }

        // Détermine si c'est un vétéran ou un senior
        const session    = resultatSessions.get(trackMsgId);
        const memberRow  = session?.rows.find(r => r.member.id === userId);
        const memberType = memberRow?.type || 'senior';
        const mentionsList = memberType === 'veteran' ? MENTIONS_RESULTAT_VETERAN : MENTIONS_RESULTAT;

        // Menu déroulant de mention
        const mentionMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_mention_resultat_${userId}_${trackMsgId}_${memberType}`)
            .setPlaceholder('Choisir une mention…')
            .addOptions(mentionsList.map(m => ({
                label:       m.label,
                value:       m.value,
                description: m.description,
            })));

        await interaction.reply({
            content: `**Choix de la mention** pour <@${userId}> (${
                memberType === 'veteran'      ? '⭐ Vétéran'        :
                memberType === 'gestionStaff' ? '📋 Gestion Staff'  :
                                               '🔹 Senior'
            }) :`,
            components: [new ActionRowBuilder().addComponents(mentionMenu)],
            ephemeral: true,
        });
        return true;
    }

    // Select de la mention → modal appréciation
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_mention_resultat_')) {
        const withoutPrefix   = interaction.customId.replace('select_mention_resultat_', '');
        // format: userId_trackMsgId_memberType
        const parts           = withoutPrefix.split('_');
        const userId          = parts[0];
        const memberType      = parts[parts.length - 1]; // 'senior' ou 'veteran'
        const trackMsgId      = parts.slice(1, parts.length - 1).join('_');
        const mentionValue    = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`resultat_modal_${userId}_${trackMsgId}_${memberType}_${mentionValue}`)
            .setTitle(
                memberType === 'veteran'      ? 'Résultat GS Vétéran'    :
                memberType === 'gestionStaff' ? 'Résultat Gestion Staff' :
                                                'Résultat GS Senior'
            );

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('appreciation')
                    .setLabel('Appréciation de la semaine')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Ex : Très bonne semaine dans l\'ensemble, quotas atteints…')
            ),
        );

        await interaction.showModal(modal);
        return true;
    }

    // Modal submit
    if (interaction.isModalSubmit() && interaction.customId.startsWith('resultat_modal_')) {
        const withoutPrefix = interaction.customId.replace('resultat_modal_', '');
        const parts         = withoutPrefix.split('_');
        const userId        = parts[0];
        const trackMsgId    = parts[1];
        // format: userId_trackMsgId_memberType_mentionValue (mentionValue peut contenir des espaces remplacés par _)
        const memberType    = parts[2]; // 'senior' ou 'veteran'
        const mentionValue  = parts.slice(3).join(' '); // gère "Très bien"

        const appreciation  = interaction.fields.getTextInputValue('appreciation');

        const mentionsList  = memberType === 'veteran' ? MENTIONS_RESULTAT_VETERAN : MENTIONS_RESULTAT;
        const mentionObj    = mentionsList.find(m => m.value === mentionValue);
        const mentionRoleId = mentionObj?.roleId || null;

        const session = resultatSessions.get(trackMsgId);

        if (session) {
            session.doneSet.add(userId);
            session.doneData[userId] = { appreciation, mentionValue, mentionRoleId, memberType };

            const done    = session.doneSet.size;
            const total   = session.totalMembers;
            const allDone = done >= total;

            const updatedEmbed = new EmbedBuilder()
                .setTitle(`Résultats GS`)
                .setDescription(buildDescription(session.rows, session.doneSet))
                .setColor(allDone ? 0x2ecc71 : COLOR)
                .setFooter({
                    text: `${done}/${total} résultat${total > 1 ? 's' : ''} complété${total > 1 ? 's' : ''}` +
                          (allDone ? ' · Prêt à publier !' : ' · Sélectionne un membre pour rédiger son résultat'),
                });

            const selectOptions = session.rows.map(({ member, type }) => ({
                label:       member.displayName.slice(0, 25),
                description: session.doneSet.has(member.id)
                    ? '✅ Complété'
                    : type === 'veteran'
                        ? '⭐ Vétéran'
                        : type === 'gestionStaff'
                            ? '📋 Gestion Staff'
                            : 'GS Senior',
                value:       member.id,
            }));

            const components = [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_resultat')
                        .setPlaceholder('Modifier un résultat…')
                        .addOptions(selectOptions)
                ),
            ];

            if (allDone) {
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`publier_resultat_${trackMsgId}`)
                        .setLabel('📢 Publier les résultats')
                        .setStyle(ButtonStyle.Success)
                ));
            }

            try {
                const channel = interaction.guild.channels.cache.get(session.channelId);
                if (channel) {
                    const trackMsg = await channel.messages.fetch(trackMsgId);
                    await trackMsg.edit({ embeds: [updatedEmbed], components });
                }
            } catch (err) {
                console.error('[RESULTAT] Erreur update embed :', err);
            }
        }

        await interaction.reply({ content: `Résultat de <@${userId}> enregistré ✅`, ephemeral: true });
        return true;
    }

    // Bouton Publier
    if (interaction.isButton() && interaction.customId.startsWith('publier_resultat_')) {
        const trackMsgId = interaction.customId.replace('publier_resultat_', '');
        const session    = resultatSessions.get(trackMsgId);

        if (!session) {
            return interaction.reply({ content: '❌ Session introuvable ou expirée.', ephemeral: true });
        }

        const { roles } = require('../config');
        const rolesAutorises = [roles.responsable, roles.brasDroit, roles.gerant].filter(Boolean);
        if (!rolesAutorises.some(r => interaction.member.roles.cache.has(r))) {
            return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Fichier .txt
        const txtContent = generateTxt(session.rows, session.doneData);
        const attachment = new AttachmentBuilder(Buffer.from(txtContent, 'utf-8'), { name: 'resultats_gs_senior_veteran.txt' });

        // Embed récap — deux sections : Senior puis Vétérans
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const recapFields = [];

        const seniorRows       = session.rows.filter(r => r.type === 'senior');
        const veteranRows      = session.rows.filter(r => r.type === 'veteran');
        const gestionStaffRows = session.rows.filter(r => r.type === 'gestionStaff');

        if (veteranRows.length) {
            recapFields.push({ name: `⭐ Vétérans`, value: '​', inline: false });
            for (const { member } of veteranRows) {
                const data = session.doneData[member.id];
                if (!data) continue;
                let fieldValue =
                    `<@${member.id}>\n` +
                    `> ${data.appreciation}\n` +
                    `**Mention** : <@&${data.mentionRoleId}>`;
                recapFields.push({ name: '​', value: fieldValue, inline: false });
            }
        }

        if (seniorRows.length) {
            recapFields.push({ name: `🔹 GS Senior`, value: '​', inline: false });
            for (const { member } of seniorRows) {
                const data = session.doneData[member.id];
                if (!data) continue;
                let fieldValue =
                    `<@${member.id}>\n` +
                    `> ${data.appreciation}\n` +
                    `**Mention** : <@&${data.mentionRoleId}>`;
                recapFields.push({ name: '​', value: fieldValue, inline: false });
            }
        }

        if (gestionStaffRows.length) {
            recapFields.push({ name: `📋 Gestion Staff`, value: '​', inline: false });
            for (const { member } of gestionStaffRows) {
                const data = session.doneData[member.id];
                if (!data) continue;
                let fieldValue =
                    `<@${member.id}>\n` +
                    `> ${data.appreciation}\n` +
                    `**Mention** : <@&${data.mentionRoleId}>`;
                recapFields.push({ name: '​', value: fieldValue, inline: false });
            }
        }

        const recapEmbed = new EmbedBuilder()
            .setTitle(`GS Senior, Vétérans & Gestion Staff — Semaine du ${today}`)
            .setColor(0x2ecc71)
            .addFields(...recapFields)
            .setFooter({ text: `${recapFields.length} membre${recapFields.length > 1 ? 's' : ''} · Publié par ${interaction.user.displayName}` })
            .setTimestamp();

        await interaction.channel.send({ embeds: [recapEmbed], files: [attachment] });

        // Désactiver le bouton publier
        try {
            const channel = interaction.guild.channels.cache.get(session.channelId);
            if (channel) {
                const trackMsg = await channel.messages.fetch(trackMsgId);
                await trackMsg.edit({
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`publier_resultat_${trackMsgId}`)
                            .setLabel('✅ Résultats publiés')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    )],
                });
            }
        } catch (err) {
            console.error('[RESULTAT] Erreur désactivation bouton :', err);
        }

        resultatSessions.delete(trackMsgId);
        await interaction.editReply({ content: '✅ Résultats publiés avec le fichier `.txt` !' });
        return true;
    }

    return false;
};
