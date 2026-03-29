require('dotenv').config();

module.exports = {
    token:    process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId:  process.env.GUILD_ID,

    roles: {
        veterans:     process.env.ROLE_VETERANS,
        hautsGrades:  process.env.ROLE_HAUTS_GRADES
            ? process.env.ROLE_HAUTS_GRADES.split(',').map(id => id.trim())
            : [],
        gestionStaff: process.env.ROLE_GESTION_STAFF,
        senior:       process.env.ROLE_SENIOR,
        veteran:      process.env.ROLE_VETERAN,
        responsable:  process.env.ROLE_RESPONSABLE,
        brasDroit:    process.env.ROLE_BRAS_DROIT,
        gerant:       process.env.ROLE_GERANT,
    },

    gsHierarchy: [
        { key: 'gerant',       label: '👑 Gérant'       },
        { key: 'brasDroit',    label: '🤝 Bras Droit'   },
        { key: 'responsable',  label: '🛡️ Responsable'  },
        { key: 'veteran',      label: '⭐ Vétéran'       },
        { key: 'senior',       label: '🔹 Senior'        },
        { key: 'gestionStaff', label: '📋 Gestion Staff' },
    ],

    categories: {
        rapportsPersonnels: process.env.CATEGORY_RAPPORTS_PERSONNELS?.trim(),
        surveillances:      process.env.CATEGORY_SURVEILLANCES?.trim(),
    },

    channels: {
        panel:    process.env.CHANNEL_PANEL,
        logs:     process.env.CHANNEL_LOGS,
        recap:    process.env.CHANNEL_RECAP,
        listeGs:  process.env.CHANNEL_LISTE_GS,
        // Brouillons & rapports vétérans (hardcodés comme dans ton code original)
        brouillons: '1487762243448868945',
        rapports:   '1487762325271351326',
    },
};
