const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
} = require('discord.js');

// ── IDs des rôles hiérarchiques ───────────────────────────────────────────────
const ROLE_GESTION_STAFF = '1487759613649617057'; // rôle de base — tout le monde l'a
const ROLES_HIERARCHY = [
    { id: '1487761085082898463', label: '👑 Gérant',       key: 'gerant'      },
    { id: '1487760981021950107', label: '🤝 Bras Droit',   key: 'brasDroit'   },
    { id: '1487760800222412880', label: '🛡️ Responsable',  key: 'responsable' },
    { id: '1487760690507808850', label: '⭐ Vétéran',       key: 'veteran'     },
    { id: '1487760587818664179', label: '🔹 Senior',        key: 'senior'      },
    // Gestion Staff = rôle de base uniquement (pas de rôle supplémentaire)
    { id: ROLE_GESTION_STAFF,   label: '📋 Gestion Staff', key: 'gestionStaff'},
];

// Sessions actives : trackingMessageId → session
const dmallSessions = new Map();

// ── Utilitaire : rôle affiché d'un membre ────────────────────────────────────
function getRoleLabel(member) {
    for (const role of ROLES_HIERARCHY) {
        if (role.key === 'gestionStaff') continue; // géré en dernier
        if (member.roles.cache.has(role.id)) return role.label;
    }
    // A le rôle de base mais aucun autre → Gestion Staff normal
    if (member.roles.cache.has(ROLE_GESTION_STAFF)) return '📋 Gestion Staff';
    return null;
}

// ── Détermine les membres à DM selon les rôles sélectionnés ──────────────────
function getMembersForRoles(guild, selectedRoleIds) {
    const members = [];
    const seen = new Set();

    for (const [, member] of guild.members.cache) {
        if (member.user.bot) continue;
        if (!member.roles.cache.has(ROLE_GESTION_STAFF)) continue;

        const hasExtraRole = member.roles.cache.some(
            r => r.id !== ROLE_GESTION_STAFF && ROLES_HIERARCHY.some(h => h.id === r.id)
        );

        let include = false;

        for (const roleId of selectedRoleIds) {
            if (roleId === ROLE_GESTION_STAFF) {
                // Sélection "Gestion Staff" = ceux qui n'ont QUE le rôle de base
                if (!hasExtraRole) { include = true; break; }
            } else {
                if (member.roles.cache.has(roleId)) { include = true; break; }
            }
        }

        if (include && !seen.has(member.id)) {
            seen.add(member.id);
            members.push(member);
        }
    }

    return members;
}

// ── Construit l'embed de suivi ────────────────────────────────────────────────
function buildTrackingEmbed(session) {
    const { type, message, targets } = session;
    const typeLabel = type === 'demande' ? '📩 Demande' : '📢 Prévention';
    const typeColor = type === 'demande' ? 0x2260da : 0xe67e22;

    const lines = targets.map(t => {
        if (t.replied) {
            if (type === 'demande') {
                return `<@${t.id}> ✅ **Répondu** — *${t.response}*`;
            } else {
                return `<@${t.id}> ✅ **Lu**`;
            }
        }
        if (t.dmFailed) return `<@${t.id}> ❌ DM impossible`;
        return `<@${t.id}> ⏳ En attente`;
    });

    const replied  = targets.filter(t => t.replied).length;
    const total    = targets.length;
    const failed   = targets.filter(t => t.dmFailed).length;

    return new EmbedBuilder()
        .setTitle(`${typeLabel} — Suivi des DMs`)
        .setDescription(
            `**Message envoyé :**\n> ${message}\n\n` +
            `**Destinataires (${replied}/${total - failed} répondu${replied > 1 ? 's' : ''}) :**\n` +
            lines.join('\n')
        )
        .setColor(typeColor)
        .setFooter({ text: `${total} destinataire${total > 1 ? 's' : ''} · ${failed > 0 ? `${failed} DM échoué(s)` : 'Tous les DMs ont été envoyés'}` })
        .setTimestamp();
}

// ── Construit l'embed dans le DM ─────────────────────────────────────────────
function buildDmEmbed(sender, type, message) {
    const typeLabel = type === 'demande' ? '📩 Demande' : '📢 Prévention';
    const typeColor = type === 'demande' ? 0x2260da : 0xe67e22;

    return new EmbedBuilder()
        .setTitle(`${typeLabel} de ${sender.displayName}`)
        .setDescription(message)
        .setColor(typeColor)
        .setFooter({ text: type === 'demande' ? 'Réponds en cliquant sur le bouton ci-dessous.' : 'Clique sur "Lu" pour confirmer la lecture.' })
        .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDE
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('dmall')
        .setDescription('Envoyer un message en DM à un ou plusieurs groupes de la GS'),

    // ── Exécution de la commande ──────────────────────────────────────────────
    async execute(interaction) {
        // Seuls Bras Droit et Gérant peuvent utiliser cette commande
        const ROLES_AUTORISES = [
            '1487760981021950107', // Bras Droit
            '1487761085082898463', // Gérant
        ];
        const aAcces = ROLES_AUTORISES.some(id => interaction.member.roles.cache.has(id));
        if (!aAcces) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ Tu n\'as pas la permission d\'utiliser cette commande.')
                        .setColor(0xe74c3c),
                ],
                ephemeral: true,
            });
        }
        // Étape 1 : sélection des rôles
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('dmall_select_roles')
            .setPlaceholder('Choisir les groupes à DM…')
            .setMinValues(1)
            .setMaxValues(6)
            .addOptions([
                { label: '📋 Gestion Staff',  description: 'Membres sans rôle supplémentaire', value: ROLE_GESTION_STAFF },
                { label: '🔹 Senior',          description: 'Membres avec le rôle Senior',       value: '1487760587818664179' },
                { label: '⭐ Vétéran',          description: 'Membres avec le rôle Vétéran',      value: '1487760690507808850' },
                { label: '🛡️ Responsable',     description: 'Membres avec le rôle Responsable',  value: '1487760800222412880' },
                { label: '🤝 Bras Droit',      description: 'Membres avec le rôle Bras Droit',   value: '1487760981021950107' },
                { label: '👑 Gérant',           description: 'Membres avec le rôle Gérant',       value: '1487761085082898463' },
            ]);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('📨 Nouveau DM groupé')
                    .setDescription('**Étape 1/3** — Sélectionne les groupes à qui envoyer le message.')
                    .setColor(0x2260da),
            ],
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true,
        });
    },

    // ── Gestion des interactions liées à /dmall ───────────────────────────────
    // À appeler depuis interactionCreate.js
    async handleInteraction(interaction) {

        // ── Étape 1 → 2 : rôles sélectionnés, demander le message via modal ──
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === 'dmall_select_roles'
        ) {
            const selectedRoles = interaction.values;

            const modal = new ModalBuilder()
                .setCustomId(`dmall_modal_${selectedRoles.join(',')}`)
                .setTitle('Contenu du message');

            const messageInput = new TextInputBuilder()
                .setCustomId('dmall_message')
                .setLabel('Message à envoyer')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Saisissez votre message ici…')
                .setRequired(true)
                .setMaxLength(1800);

            modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
            await interaction.showModal(modal);
            return;
        }

        // ── Étape 2 → 3 : modal soumis, demander demande ou prévention ───────
        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith('dmall_modal_')
        ) {
            const rolesPart   = interaction.customId.replace('dmall_modal_', '');
            const selectedRoles = rolesPart.split(',');
            const message     = interaction.fields.getTextInputValue('dmall_message');

            const btnDemande = new ButtonBuilder()
                .setCustomId(`dmall_type_demande_${rolesPart}`)
                .setLabel('📩 Demande')
                .setStyle(ButtonStyle.Primary);

            const btnPrevention = new ButtonBuilder()
                .setCustomId(`dmall_type_prevention_${rolesPart}`)
                .setLabel('📢 Prévention')
                .setStyle(ButtonStyle.Secondary);

            // Stocker le message temporairement (associé à l'utilisateur)
            dmallSessions.set(`pending_${interaction.user.id}`, {
                message,
                selectedRoles,
            });

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📨 Nouveau DM groupé')
                        .setDescription(
                            `**Étape 3/3** — Type de message\n\n` +
                            `**Message :** *${message}*\n\n` +
                            `Est-ce une **demande** (les destinataires doivent répondre) ` +
                            `ou une **prévention** (ils doivent juste confirmer la lecture) ?`
                        )
                        .setColor(0x2260da),
                ],
                components: [new ActionRowBuilder().addComponents(btnDemande, btnPrevention)],
                ephemeral: true,
            });
            return;
        }

        // ── Étape 3 : type choisi → envoi des DMs ─────────────────────────────
        if (
            interaction.isButton() &&
            (interaction.customId.startsWith('dmall_type_demande_') ||
             interaction.customId.startsWith('dmall_type_prevention_'))
        ) {
            const type = interaction.customId.startsWith('dmall_type_demande_')
                ? 'demande'
                : 'prevention';

            const rolesPart = interaction.customId
                .replace('dmall_type_demande_', '')
                .replace('dmall_type_prevention_', '');

            const pending = dmallSessions.get(`pending_${interaction.user.id}`);
            if (!pending) {
                return interaction.reply({ content: 'Session expirée. Relance `/dmall`.', ephemeral: true });
            }
            dmallSessions.delete(`pending_${interaction.user.id}`);

            const { message, selectedRoles } = pending;

            await interaction.deferUpdate();
            await interaction.guild.members.fetch();

            const targets = getMembersForRoles(interaction.guild, selectedRoles)
                .map(m => ({
                    id:       m.id,
                    tag:      m.user.tag,
                    rang:     getRoleLabel(m),
                    replied:  false,
                    dmFailed: false,
                    response: null,
                }));

            if (targets.length === 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription('Aucun membre trouvé pour ces rôles.').setColor(0xe74c3c)],
                    components: [],
                });
            }

            // Construire l'ID de session unique
            const sessionId = `${interaction.user.id}_${Date.now()}`;

            // Envoyer l'embed de suivi dans le salon
            const trackingEmbed = buildTrackingEmbed({ type, message, targets });
            const trackingMsg   = await interaction.channel.send({ embeds: [trackingEmbed] });

            // Sauvegarder la session
            const session = {
                type,
                message,
                targets,
                senderId:        interaction.user.id,
                senderName:      interaction.member.displayName,
                trackingMsgId:   trackingMsg.id,
                trackingChannel: trackingMsg.channelId,
                guildId:         interaction.guild.id,
            };
            dmallSessions.set(trackingMsg.id, session);

            // Confirmer à l'auteur
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`✅ Envoi en cours à **${targets.length}** membre${targets.length > 1 ? 's' : ''}…`)
                        .setColor(0x2ecc71),
                ],
                components: [],
            });

            // ── Envoyer les DMs ──────────────────────────────────────────────
            for (const target of targets) {
                try {
                    const member  = interaction.guild.members.cache.get(target.id);
                    const dmEmbed = buildDmEmbed(interaction.member, type, message);

                    let actionRow;
                    if (type === 'demande') {
                        actionRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`dmall_reply_${trackingMsg.id}_${target.id}`)
                                .setLabel('💬 Répondre')
                                .setStyle(ButtonStyle.Primary)
                        );
                    } else {
                        actionRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`dmall_read_${trackingMsg.id}_${target.id}`)
                                .setLabel('👁️ Lu')
                                .setStyle(ButtonStyle.Secondary)
                        );
                    }

                    const dmMsg = await member.send({
                        embeds: [dmEmbed],
                        components: [actionRow],
                    });

                    target.dmMsgId = dmMsg.id;
                } catch {
                    target.dmFailed = true;
                }
            }

            // Mettre à jour l'embed de suivi après envois
            await trackingMsg.edit({ embeds: [buildTrackingEmbed(session)] });
            return;
        }

        // ── Bouton "Répondre" dans le DM (demande) ────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('dmall_reply_')) {
            const parts        = interaction.customId.split('_');
            // format : dmall_reply_{trackingMsgId}_{userId}
            const userId       = parts[parts.length - 1];
            const trackMsgId   = parts.slice(2, parts.length - 1).join('_');

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: 'Ce bouton ne te concerne pas.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`dmall_replymodal_${trackMsgId}_${userId}`)
                .setTitle('Ta réponse');

            const responseInput = new TextInputBuilder()
                .setCustomId('dmall_response')
                .setLabel('Ta réponse')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(responseInput));
            await interaction.showModal(modal);
            return;
        }

        // ── Modal réponse soumis ──────────────────────────────────────────────
        if (interaction.isModalSubmit() && interaction.customId.startsWith('dmall_replymodal_')) {
            const withoutPrefix = interaction.customId.replace('dmall_replymodal_', '');
            const lastUnderscore = withoutPrefix.lastIndexOf('_');
            const trackMsgId    = withoutPrefix.substring(0, lastUnderscore);
            const userId        = withoutPrefix.substring(lastUnderscore + 1);

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: 'Ce modal ne te concerne pas.', ephemeral: true });
            }

            const response = interaction.fields.getTextInputValue('dmall_response');
            const session  = dmallSessions.get(trackMsgId);

            if (!session) {
                return interaction.reply({ content: 'Session introuvable ou expirée.', ephemeral: true });
            }

            const target = session.targets.find(t => t.id === userId);
            if (!target) return;
            if (target.replied) {
                return interaction.reply({ content: 'Tu as déjà répondu.', ephemeral: true });
            }

            target.replied  = true;
            target.response = response;

            // Désactiver le bouton dans le DM
            await interaction.update({
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`dmall_reply_${trackMsgId}_${userId}`)
                            .setLabel('✅ Répondu')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true)
                    ),
                ],
            });

            // Mettre à jour l'embed de suivi
            try {
                const guild   = await interaction.client.guilds.fetch(session.guildId);
                const channel = guild.channels.cache.get(session.trackingChannel);
                if (channel) {
                    const trackMsg = await channel.messages.fetch(trackMsgId);
                    await trackMsg.edit({ embeds: [buildTrackingEmbed(session)] });
                }
            } catch (err) {
                console.error('[DMALL] Erreur mise à jour embed suivi :', err);
            }

            return;
        }

        // ── Bouton "Lu" dans le DM (prévention) ──────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('dmall_read_')) {
            const parts      = interaction.customId.split('_');
            const userId     = parts[parts.length - 1];
            const trackMsgId = parts.slice(2, parts.length - 1).join('_');

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: 'Ce bouton ne te concerne pas.', ephemeral: true });
            }

            const session = dmallSessions.get(trackMsgId);
            if (!session) {
                return interaction.reply({ content: 'Session introuvable ou expirée.', ephemeral: true });
            }

            const target = session.targets.find(t => t.id === userId);
            if (!target) return;
            if (target.replied) {
                return interaction.reply({ content: 'Tu as déjà confirmé la lecture.', ephemeral: true });
            }

            target.replied  = true;
            target.response = 'Lu ✅';

            // Bouton devient vert et inactif
            await interaction.update({
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`dmall_read_${trackMsgId}_${userId}`)
                            .setLabel('✅ Lu')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true)
                    ),
                ],
            });

            // Mettre à jour l'embed de suivi
            try {
                const guild   = await interaction.client.guilds.fetch(session.guildId);
                const channel = guild.channels.cache.get(session.trackingChannel);
                if (channel) {
                    const trackMsg = await channel.messages.fetch(trackMsgId);
                    await trackMsg.edit({ embeds: [buildTrackingEmbed(session)] });
                }
            } catch (err) {
                console.error('[DMALL] Erreur mise à jour embed suivi :', err);
            }

            return;
        }
    },

    dmallSessions,
};
