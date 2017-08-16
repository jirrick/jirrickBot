'use strict';
exports.run = function (app) {
    var config = require('../config');
        
    const TwitchBot = require('twitch-bot');
    const Bot = new TwitchBot({
        username: config.twitch_user.name,
        oauth: config.twitch_user.oauth,
        channel: config.twitch_channel.name
    });

    Bot.on('join', () => {
        Bot.on('message', chatter => {
            if (chatter.message === '!spin') {
                console.log(chatter.username + ' ' + chatter.message);
                //Bot.say('Command executed! PogChamp')
            }
        });
    });

};