const { Client, Collection } = require('discord.js');
const { search } = require('./Utils');
const consola = require('consola');
require('dotenv').config();
const Config = require('./Config');

module.exports = class Bot extends Client {
  constructor(config) {
    super(config.botOptions);
    this.config = config;
    this.commands = new Collection();
    this.logger = consola;
  }

  async start() {
    await this.loadOperations();
    await this.login(process.env.TOKEN);

    if (this.config.guildOnly.enabled) {
      const guilds = this.config.guildOnly.guildID
        ? [this.guilds.cache.get(this.config.guildOnly.guildID)].filter(Boolean)
        : [...this.guilds.cache.values()];
      let registeredGuilds = 0;

      for (const guild of guilds) {
        try {
          await guild.commands.set(this.commands);
          registeredGuilds++;
          this.logger.info(`Commands registered in guild ${guild.name} (${guild.id}).`);
        } catch (error) {
          this.logger.error(`Failed to register commands in guild ${guild.id}\n${error}`);
        }
      }

      if (registeredGuilds > 0) {
        await this.application.commands.set([]);
        this.logger.info('Global commands cleared.');
      } else {
        this.logger.error('Commands were not registered: no eligible guilds were found.');
      }
    } else {
      await this.application.commands.set(this.commands);
      this.logger.info(`Commands registered globally.`);
    }
  }

  async loadOperations() {
    const commands = await search(`${__dirname}/../Commands/**/*.js`);
    commands.forEach(commandName => {
      const command = require(commandName);
      this.commands.set(command.name, command);
    });

    const events = await search(`${__dirname}/../Events/*.js`);
    events.forEach(eventName => {
      const event = require(eventName);
      this.on(event.event, event.run.bind(null, this));
    });
  }
};
