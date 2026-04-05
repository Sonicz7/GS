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

// Rôle de promotion — remplace par le vrai ID
const ROLE_PROMOTION_GS = 'ID_ROLE_PROMOTION_GS';

// Emojis custom du serveur
const E_POLAROID = '<:002_polaroid:1352990626664419328>';
const E_PSTAR    = '<:0001_pstar:1375780054872883271>';
const E_ARROW    = '<a:B_arrow:1477153945070866592>';

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
    let out = `# GS SENIOR ${E_POLAROID}\n`;

    for (const { member } of rows) {
        const data = doneData[member.id];
        if (!data) continue;

        out += `<@${member.id}>\n`;
        out += `* *Tickets* :\n`;
        out += `* *Vocal* :\n`;
        out += `> ${data.appreciation}\n`;
        out += `${E_PSTAR} **Mention** : <@&${data.mentionRoleId}>\n`;

        if (data.promo) {
            out += `${E_ARROW} Bravo tu passes <@&${ROLE_PROMOTION_GS}>\n`;
        }

        out += `\n`;
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

        // Récupération des membres GS Senior + Gestion Staff
        await guild.members.fetch();

        if (!roles.senior || !roles.gestionStaff) {
            return message.reply('❌ `ROLE_SENIOR` ou `ROLE_GESTION_STAFF` manquant dans le `.env`.');
        }

        const membres = guild.members.cache.filter(m =>
            !m.user.bot &&
            m.roles.cache.has(roles.senior) &&
            m.roles.cache.has(roles.gestionStaff)
        );

        if (!membres.size) {
            return message.reply('❌ Aucun membre trouvé avec les rôles **GS Senior** et **Gestion Staff**.');
        }

        const rows          = [];
        const selectOptions = [];

        membres.forEach(m => {
            rows.push({ member: m });
            selectOptions.push({
                label:       m.displayName.slice(0, 25),
                description: 'GS Senior',
                value:       m.id,
            });
        });

        const doneSet     = new Set();
        const description = buildDescription(rows, doneSet);

        const embed = new EmbedBuilder()
            .setTitle(`${E_POLAROID}  Résultats GS Senior`)
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

        // Menu déroulant de mention
        const mentionMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_mention_resultat_${userId}_${trackMsgId}`)
            .setPlaceholder('Choisir une mention…')
            .addOptions(MENTIONS_RESULTAT.map(m => ({
                label:       m.label,
                value:       m.value,
                description: m.description,
            })));

        await interaction.reply({
            content: `**Choix de la mention** pour <@${userId}> :`,
            components: [new ActionRowBuilder().addComponents(mentionMenu)],
            ephemeral: true,
        });
        return true;
    }

    // Select de la mention → modal appréciation
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_mention_resultat_')) {
        const withoutPrefix   = interaction.customId.replace('select_mention_resultat_', '');
        const firstUnderscore = withoutPrefix.indexOf('_');
        const userId          = withoutPrefix.substring(0, firstUnderscore);
        const trackMsgId      = withoutPrefix.substring(firstUnderscore + 1);
        const mentionValue    = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`resultat_modal_${userId}_${trackMsgId}_${mentionValue}`)
            .setTitle('Résultat GS Senior');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('appreciation')
                    .setLabel('Appréciation de la semaine')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Ex : Très bonne semaine dans l\'ensemble, quotas atteints…')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('promo')
                    .setLabel('Promotion ? (oui / non)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder('Laisse vide ou écris "oui" pour une promotion')
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
        const mentionValue  = parts.slice(2).join(' '); // gère "Très bien"

        const appreciation  = interaction.fields.getTextInputValue('appreciation');
        const promoRaw      = interaction.fields.getTextInputValue('promo') || '';
        const promo         = promoRaw.trim().toLowerCase() === 'oui';

        const mentionObj    = MENTIONS_RESULTAT.find(m => m.value === mentionValue);
        const mentionRoleId = mentionObj?.roleId || null;

        const session = resultatSessions.get(trackMsgId);

        if (session) {
            session.doneSet.add(userId);
            session.doneData[userId] = { appreciation, mentionValue, mentionRoleId, promo };

            const done    = session.doneSet.size;
            const total   = session.totalMembers;
            const allDone = done >= total;

            const updatedEmbed = new EmbedBuilder()
                .setTitle(`${E_POLAROID}  Résultats GS Senior`)
                .setDescription(buildDescription(session.rows, session.doneSet))
                .setColor(allDone ? 0x2ecc71 : COLOR)
                .setFooter({
                    text: `${done}/${total} résultat${total > 1 ? 's' : ''} complété${total > 1 ? 's' : ''}` +
                          (allDone ? ' · Prêt à publier !' : ' · Sélectionne un membre pour rédiger son résultat'),
                });

            const selectOptions = session.rows.map(({ member }) => ({
                label:       member.displayName.slice(0, 25),
                description: session.doneSet.has(member.id) ? '✅ Complété' : 'GS Senior',
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
        const attachment = new AttachmentBuilder(Buffer.from(txtContent, 'utf-8'), { name: 'resultats_gs_senior.txt' });

        // Embed récap
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const recapFields = [];
        for (const { member } of session.rows) {
            const data = session.doneData[member.id];
            if (!data) continue;

            let fieldValue =
                `<@${member.id}>\n` +
                `> ${data.appreciation}\n` +
                `${E_PSTAR} **Mention** : <@&${data.mentionRoleId}>`;

            if (data.promo) {
                fieldValue += `\n${E_ARROW} Bravo tu passes <@&${ROLE_PROMOTION_GS}>`;
            }

            recapFields.push({ name: '​', value: fieldValue, inline: false });
        }

        const recapEmbed = new EmbedBuilder()
            .setTitle(`${E_POLAROID}  GS Senior — Semaine du ${today}`)
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
