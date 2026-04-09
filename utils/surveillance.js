const { categories } = require('../config');

/**
 * Retourne le timestamp du lundi de la semaine courante à 00h00:00 (heure locale).
 */
function getStartOfWeek() {
    const now = new Date();
    const day = now.getDay(); // 0 = dimanche, 1 = lundi, ...
    const diffToMonday = (day === 0 ? -6 : 1 - day); // décalage vers lundi
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
}

async function getSurveillanceCounts(guild) {

    const counts = {};

    const channels = guild.channels.cache.filter(
        c => c.parentId === categories.surveillances && c.isTextBased()
    );

    const weekStart = getStartOfWeek();

    for (const channel of channels.values()) {

        let count = 0;
        let lastId = null;
        let keepFetching = true;

        // Pagination pour ne rater aucun message de la semaine
        while (keepFetching) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            for (const msg of messages.values()) {
                // Si le message est antérieur au début de la semaine, on arrête la pagination
                if (msg.createdTimestamp < weekStart) {
                    keepFetching = false;
                    break;
                }

                if (msg.attachments.size > 0) {
                    const hasMedia = [...msg.attachments.values()].some(att =>
                        att.contentType?.startsWith('image') ||
                        att.contentType?.startsWith('video')
                    );
                    if (hasMedia) count++;
                }
            }

            // Préparer la prochaine page (message le plus ancien de ce batch)
            lastId = messages.last()?.id;
            if (messages.size < 100) keepFetching = false;
        }

        const match = channel.topic?.match(/ID:\s*(\d+)/);

        if (match) {
            counts[match[1]] = count;
        }
    }

    return counts;
}

module.exports = { getSurveillanceCounts };
