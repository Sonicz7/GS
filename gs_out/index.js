require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
var http = require('http');

let started = false;

function start() {
  if (started) return;
  started = true;
  http.createServer(function (req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.write("Gs est en ligne!");
    res.end();
  }).listen(process.env.PORT || 8080);
}

module.exports = start;
const fs   = require('fs');
const path = require('path');
const { token } = require('./config');
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

// Chargement des commandes
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (command.name && command.execute) {
        client.commands.set(command.name, command);
    }
}

// Chargement des handlers
const handlersPath = path.join(__dirname, 'handlers');
for (const file of fs.readdirSync(handlersPath).filter(f => f.endsWith('.js'))) {
    const handler = require(path.join(handlersPath, file));
    if (handler.name && handler.execute) {
        client.on(handler.name, (...args) => handler.execute(...args, client));
    }
}

client.once('ready', () => {
    console.log(`[BOT] Connecté en tant que ${client.user.tag}`);
    startWeeklyTask(client);
});

client.login(token);
