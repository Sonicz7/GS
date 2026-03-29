const { categories } = require('../config');

async function getSurveillanceCounts(guild) {

    const counts = {};

    const channels = guild.channels.cache.filter(
        c => c.parentId === categories.surveillances && c.isTextBased()
    );

    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    for (const channel of channels.values()) {

        let count = 0;

        const messages = await channel.messages.fetch({ limit: 100 });

        messages.forEach(msg => {

            if (msg.createdTimestamp < oneWeekAgo) return;

            if (msg.attachments.size > 0) {

                const hasMedia = [...msg.attachments.values()].some(att =>
                    att.contentType?.startsWith('image') ||
                    att.contentType?.startsWith('video')
                );

                if (hasMedia) count++;
            }
        });

        const match = channel.topic?.match(/ID:\s*(\d+)/);

        if (match) {
            counts[match[1]] = count;
        }
    }

    return counts;
}

module.exports = { getSurveillanceCounts };
