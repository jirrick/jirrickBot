'use strict';
const config = require('../config'),
	botName = config.twitch_channel.bot;

exports.parse = function (msg) {
	//TODO do the actual work 
	const spin = Spin(msg);
	if (spin != null)
		console.log(spin);
};

function Spin(msg) {
	const regexp = /([\w\d]+) (won|lost) ([\d,]+)/;
	const match = regexp.exec(msg.message);
	if (match != null && msg.user === botName) {
		//Parse results
		const nick = match[1];
		let amount = parseInt(match[3].replace(',', ''));
		if (match[2] == 'lost') amount *= -1;
		//Send reply
		return `SPIN: ${nick} [${amount}]`;
	}
}
