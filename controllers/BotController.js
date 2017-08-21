'use strict';
const config = require('../config'),
    esController = require('./EsController'),
    dateFormat = require('dateformat'),
    TwitchBot = require('twitch-bot');

exports.run = function () {
    const Bot = new TwitchBot({
        username: config.twitch_user.name,
        oauth: config.twitch_user.oauth,
        channel: config.twitch_channel.name
    });

    Bot.on('join', () => {
        // Check ES cluster availability
        esController.ping();
    });

    Bot.on('message', chatter => {
        const msg = new MessageDetails(chatter);
        // Log all messages to ES
        esController.store(msg);
    });

    Bot.on('error', err => {
        console.error(err);
    });
};

// Converts from chatter object to message
function MessageDetails (chatter) {
    this.channel = chatter.channel.substring(1),
    this.user = chatter.display_name,
    this.message = chatter.message,
    this.timestamp = dateFormat(new Date(chatter.tmi_sent_ts), 'UTC:yyyy-mm-dd HH:MM:ss.l');
}