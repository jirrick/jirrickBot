'use strict';
exports.run = function () {
    const config = require('../config'),
        esController = require('./esController'),
        TwitchBot = require('twitch-bot'),
        Bot = new TwitchBot({
            username: config.twitch_user.name,
            oauth: config.twitch_user.oauth,
            channel: config.twitch_channel.name
        });

    Bot.on('join', () => {
        // Store all messages in ES
        Bot.on('message', chatter => {
            esController.store(chatter);
        });
    });

    Bot.on('error', err => {
        console.log('ERROR: ' + err);
    });
};