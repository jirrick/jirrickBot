'use strict';
module.exports = function(app) {
var ctrl = require('./controller');

app.route('/command/:cmd/:id')
	.get(ctrl.command);

app.route('/parse')
	.post(ctrl.parse);
};

