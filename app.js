'use strict';
const express = require('express'),
    app = express(),
    config = require('./config'),
    port = process.env.PORT || config.server.port,
    bot = require('./controllers/BotController');

app.listen(port);
bot.run();

console.log('jirrickBot started on: ' + port);
