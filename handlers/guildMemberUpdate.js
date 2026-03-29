const { Events } = require('discord.js');
const { roles } = require('../config');
const { updateListeGs } = require('../utils/listeGs');

// Tous les IDs de rôles GS surveillés
function getGsRoleIds() {
    return [
        roles.gestionStaff,
        roles.senior,
        roles.veteran,
        roles.responsable,
        roles.brasDroit,
        roles.gerant,
    ].filter(Boolean);
}

module.exports = {
    name: Events.GuildMemberUpdate,

    async execute(oldMember, newMember, client) {
        const gsRoles = getGsRoleIds();

        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());

        // Vérifie si un rôle GS a été ajouté ou retiré
        const changed = gsRoles.some(
            id => oldRoles.has(id) !== newRoles.has(id)
        );

        if (!changed) return;

        try {
            await updateListeGs(newMember.guild);
        } catch (err) {
            console.error('[LISTE GS] Erreur mise à jour :', err);
        }
    },
};
