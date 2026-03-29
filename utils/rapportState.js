// Stockage en mémoire des sessions =rapport en cours
// Clé : messageId de l'embed de suivi
// Valeur : { rows, doneSet, doneMentions, totalMembers, channelId, guildId }

const rapportSessions = new Map();

module.exports = { rapportSessions };
