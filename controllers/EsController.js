'use strict';
const config = require('../config'),
    logging = config.logToConsole,
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
exports.store = function (msg) {
    const body = {
        index: 'twitch_v3',
        type: 'public_chat',
        body: msg
    };

    esClient.index(body, function (error, response) {
        if (error) {
            console.error(error);
            if (logging) console.log(response);
        }
    });

    if (logging) console.log(`[${msg.timestamp}] ${msg.user} : ${msg.message}`);
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
            if (logging) console.log('elasticsearch is ready');
            return true;
        }
    });
};


