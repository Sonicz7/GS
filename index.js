require('dotenv').config();

process.on('uncaughtException', err => {
    console.error('[FATAL] uncaughtException:', err.message);
});
process.on('unhandledRejection', reason => {
    console.error('[FATAL] unhandledRejection:', reason?.message ?? reason);
});

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const { token, clientId, guildId } = require('./config');
const { startWeeklyTask } = require('./tasks/weeklyPing');
// ── Serveur HTTP pour Render ──────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
}).listen(PORT, '0.0.0.0', () => console.log(`[HTTP] Port ${PORT} ouvert`));

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

function createClient() {
    const c = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
        ],
    });
    c.commands = new Collection();
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        const name = command.data?.name ?? command.name;
        if (name && command.execute) c.commands.set(name, command);
    }
    return c;
}

function loadHandlers(c) {
    const handlersPath = path.join(__dirname, 'handlers');
    for (const file of fs.readdirSync(handlersPath).filter(f => f.endsWith('.js'))) {
        delete require.cache[require.resolve(path.join(handlersPath, file))];
        const handler = require(path.join(handlersPath, file));
        if (handler.name && handler.execute) {
            c.on(handler.name, (...args) => handler.execute(...args, c));
        }
    }
}

async function deployCommands() {
    const commands = [];
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data) commands.push(command.data.toJSON());
    }
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('[DEPLOY] Commandes déployées.');
    } catch (err) {
        console.error('[DEPLOY] Erreur:', err.message);
    }
}

let client = createClient();
let reconnectDelay = 5000;
let weeklyStarted = false;

async function connect() {
    try {
        loadHandlers(client);

        client.once('ready', async () => {
            reconnectDelay = 5000;
            console.log(`[BOT] Connecté en tant que ${client.user.tag}`);
            try {
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    await guild.members.fetch();
                    const { markFetched } = require('./utils/memberCache');
                    markFetched(guild.id);
                }
            } catch (err) {
                console.warn('[BOT] fetch membres:', err.message);
            }
            await deployCommands();
            if (!weeklyStarted) {
                startWeeklyTask(client);
                weeklyStarted = true;
            }
        });

        client.on('error', err => {
            console.error('[BOT] Erreur:', err.message);
        });

        client.on('shardDisconnect', () => {
            console.warn('[BOT] Déconnecté, reconnexion...');
            scheduleReconnect();
        });

        console.log('[BOT] Connexion à Discord...');
        await client.login(token);

    } catch (err) {
        console.error('[BOT] Login échoué:', err.message);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    setTimeout(async () => {
        reconnectDelay = Math.min(reconnectDelay * 2, 60000);
        console.log(`[BOT] Tentative reconnexion...`);
        try { client.destroy(); } catch {}
        client = createClient();
        await connect();
    }, reconnectDelay);
}

connect();
