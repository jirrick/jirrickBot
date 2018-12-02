'use strict';
var	redis = require('redis'),
	redisClient = null;

module.exports = {
	connect: function connect() {
		if (redisClient) {
			return null;
		}
		var client = redis.createClient({
			host: '192.168.1.2',
			port: '6379',
			retry_strategy: function retry(options) {
				console.log(options);
				if (options.total_retry_time > 1000 * 60 * 60) {
					return new Error('Retry time exhausted');
				}
				return Math.max(options.attempt * 100, 2000);
			}
		});
		client.on('error', function error(err) {
			console.log('Redis error:');
			console.log(err);
		});
		client.on('reconnecting', function reconnecting() {
			console.log('Redis: Connection reestablished');
		});
		client.on('connect', function connect() {
			console.log('Redis: Connecting');
		});
		client.on('ready', function ready() {
			redisClient = client;
			console.log('Redis: Ready');
		});
	},
	get: function get() {
		return redisClient;
	},
	close: function close() {
		if (redisClient) {
			state.db.quit();
			return null;
		}
	}
}
