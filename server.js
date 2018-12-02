'use strict';
var 	express = require('express'),
	app = express(),
	port = process.env.PORT || 3000,
	bodyParser = require('body-parser'),
	redis_db = require('./redis_db');

app.use(bodyParser.json());
redis_db.connect();

var routes = require('./routes');
routes(app);

app.use(function(err, req, res, next) {
    console.log(err);
    res.status(err.status || 500);
    res.send("!! An error has ocured");
});

app.listen(port);

console.log('twitchBot API server started on: ' + port);
