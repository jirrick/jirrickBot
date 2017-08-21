'use strict';
const config = require('../config'),
	logging = config.logToConsole,
	botName = config.twitch_channel.bot;

exports.parse = function (msg) {
	Spin(msg);
};

function Spin(msg) {
	//Prepare regexp
	const regexp = /([\w\d]+) (won|lost) ([\d,]+)/;
	const match = regexp.exec(msg.message);
	if (match != null && msg.user === botName) {
		//Parse results
		const nick = match[1];
		let amount = parseInt(match[3].replace(',', ''));
		if (match[2] == 'lost') amount *= -1;
		//TODO Process results
		if (logging) console.log(`SPIN: ${nick} [${amount}]`);
	}
}
