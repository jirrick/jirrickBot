// customize values and save as 'config.js'
const config = {
    //console logging
    logToConsole: true,
    
    //twitch account settings
    twitch_user: {
        name: 'user',
        oauth: 'oauth:'
    },

    //twitch account settings
    twitch_channel:
    {
        name: 'channel',
        bot: 'botName'
    },

    //server details
    server: {
        host: '127.0.0.1',
        port: '3000'
    },
    
    //elasticsearch details
    elasticsearch: {
        host: '127.0.0.1',
        port: '9200',
        user: 'elastic',
        pass: 'changeme'
    },

    //mongodb connectionstring
    mongodb: 'mongodb://'
};
module.exports = config;