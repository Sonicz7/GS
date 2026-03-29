require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, clientId, guildId } = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`[DEPLOY] Déploiement de ${commands.length} commande(s)...`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('[DEPLOY] Commandes déployées avec succès.');
    } catch (err) {
        console.error('[DEPLOY] Erreur :', err);
    }
})();
