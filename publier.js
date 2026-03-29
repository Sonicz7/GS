const { updateListeGs } = require('../utils/listeGs');

module.exports = {
    name: 'listags',

    async execute(message) {
        try {
            await updateListeGs(message.guild);
            await message.reply('✅ Liste GS mise à jour.');
        } catch (err) {
            console.error('[LISTAGS] Erreur :', err);
            await message.reply('❌ Une erreur est survenue lors de la mise à jour.');
        }

        await message.delete().catch(() => {});
    },
};
