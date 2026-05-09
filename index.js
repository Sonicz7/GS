require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { token, clientId, guildId } = require('./config');
const { startWeeklyTask } = require('./tasks/weeklyPing');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.commands = new Collection();

// ── Chargement des commandes ──────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    const name = command.data?.name ?? command.name;
    if (name && command.execute) {
        client.commands.set(name, command);
    }
}

// ── Chargement des handlers ───────────────────────────────────────────────────
const handlersPath = path.join(__dirname, 'handlers');
for (const file of fs.readdirSync(handlersPath).filter(f => f.endsWith('.js'))) {
    const handler = require(path.join(handlersPath, file));
    if (handler.name && handler.execute) {
        client.on(handler.name, (...args) => handler.execute(...args, client));
    }
}

// ── Auto-deploy des slash commands au démarrage ───────────────────────────────
async function deployCommands() {
    const commands = [];
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data) commands.push(command.data.toJSON());
    }
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log(`[DEPLOY] Déploiement de ${commands.length} commande(s)...`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('[DEPLOY] Commandes déployées avec succès.');
    } catch (err) {
        console.error('[DEPLOY] Erreur :', err);
    }
}

client.once('ready', async () => {
    console.log(`[BOT] Connecté en tant que ${client.user.tag}`);

    // ── Fetch unique des membres au démarrage ─────────────────────────────────
    // On pré-remplit le cache ici une seule fois, ce qui évite que toutes les
    // tâches weekly se battent pour faire guild.members.fetch() en même temps.
    try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            await guild.members.fetch();
            // Marquer le timestamp dans memberCache pour que les fonctions
            // ne refetchent pas pendant les 10 prochaines minutes
            const { markFetched } = require('./utils/memberCache');
            markFetched(guild.id);
            console.log('[BOT] Cache membres initialisé.');
        }
    } catch (err) {
        console.warn('[BOT] Impossible de pré-fetch les membres :', err.message);
    }

    await deployCommands();
    startWeeklyTask(client);
});

client.login(token);
