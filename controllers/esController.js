'use strict';
const config = require('../config'),
    dateFormat = require('dateformat'),
    elasticsearch = require('elasticsearch'),
    esClient = new elasticsearch.Client({
        host: [
            {
                host: config.elasticsearch.host,
                auth: `${config.elasticsearch.user}:${config.elasticsearch.pass}`,
                protocol: 'http',
                port: config.elasticsearch.port
            }
        ]
    });

exports.store = function (chatter) {
    const details = parseChatter(chatter);

    //TODO store to ES
    console.log(`[${details.timestamp}] ${details.user} : ${details.message}`);
};

// Checks that ES is ready
exports.ping = function () {
    esClient.ping({
        requestTimeout: 3000,
    }, function (error) {
        if (error) {
            console.error('elasticsearch cluster is down!');
            return false;
        } else {
            console.log('elasticsearch is ready');
            return true;
        }
    });
};

// Parse info from chatter object
function parseChatter(chatter) {
    const result = {
        'channel': chatter.channel.substring(1),
        'user': chatter.display_name,
        'message': chatter.message,
        'timestamp': dateFormat(new Date(chatter.tmi_sent_ts), 'UTC:yyyy-mm-dd HH:MM:ss.l')
    };
    return result;
}
