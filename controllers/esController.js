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

// Store message in ES    
exports.store = function (chatter) {
    const msg = new MessageDetails(chatter);
    const body = {
        index: 'twitch_v3',
        type: 'public_chat',
        body: msg         
    };

    esClient.index(body, function (error, response) {
        if (error){
            console.error(error);
            console.log(response);
        }
    });

    //console.log(`[${msg.timestamp}] ${msg.user} : ${msg.message}`);
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
function MessageDetails(chatter) {
    this.channel = chatter.channel.substring(1),
    this.user = chatter.display_name,
    this.message = chatter.message,
    this.timestamp = dateFormat(new Date(chatter.tmi_sent_ts), 'UTC:yyyy-mm-dd HH:MM:ss.l')
}
