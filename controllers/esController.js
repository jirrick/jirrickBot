'use strict';
const config = require('../config'),
    dateFormat = require('dateformat');

exports.store = function (chatter) {
    const details = parseChatter(chatter);
    console.log(`[${details.timestamp}] ${details.user} : ${details.message}`);
};

function parseChatter (chatter) {
    const result = {
        'channel' : chatter.channel.substring(1),
        'user' : chatter.display_name,
        'message' : chatter.message,
        'timestamp' : dateFormat(new Date(chatter.tmi_sent_ts), 'UTC:yyyy-mm-dd HH:MM:ss.l')
    };
    return result;
}
