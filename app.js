'use strict';
const express = require('express'),
    app = express(),
    config = require('./config'),
    port = process.env.PORT || config.server.port,
    mongoose = require('mongoose'),
    bot = require('./controllers/BotController');

mongoose.Promise = global.Promise;
mongoose.connect(config.mongodb);

app.listen(port);
bot.run();

console.log('jirrickBot started on: ' + port);
