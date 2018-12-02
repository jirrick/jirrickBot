'use strict';
var redis_db = require('./redis_db'),
    emotes = require('./emotes'),
    //FLOOD
    score = 0,
    treshold = 555,
    penalty = 200,
    lastAct = new Date(),
    //HEIST
    isHeist = false,
    heistBets = null,
    lastHeist = null;

exports.parse = function(req, res) {
    var result = "Not supported";
        
    //Apply SPIN regexp
    var regexp = /([\w\d]+) (won|lost) ([\d,]+)/;
    //console.log(req.body.content);
    var match = regexp.exec(req.body.content);
    if (match != null && req.body.user == 'hugo__bot') {
	//Parse results
	var nick = match[1].toLowerCase();
	var amount = parseInt(match[3].replace(",",""));
	if (match[2] == "lost") amount = amount * -1
	
	//Store to redis
	var red = redis_db.get();
	red.rpush([nick + ":last", amount], function(err, reply) {
	    if (err) console.log(err);
	});
	red.incr([nick + ":spins"], function(err, reply) {
	    if (err) console.log(err);
	});

	//store spinking
	if (amount > 0){
		red.zincrby(["!spinking", 1, nick], function (err, reply) {
		if (err) console.log(err);
		});
	}
	
	//Send reply
	result = "Spin nick:" + nick + " amount:" + amount;
	//console.log(msg);
	res.send(result);
	return;
    }

    //check !heist xx
    var heistReg = /(!heist)\s+(\d+).*/i;
    var heistMatch = heistReg.exec(req.body.content);
    if (heistMatch != null) {
	var amount = heistMatch[2];
	var user = req.body.user.toLowerCase();
	if (amount > 0 && amount <= 1000){ //process bets only between 1 and 1000
	    if (isHeist === true) {
		// add to heistBets only if username not exist
		if (heistBets.filter(h => h.user === user).length == 0){
		    var bet = { "user" : user, "amount" : amount};
		    heistBets.push(bet);
		    result = "Bet added - " + user;
		}
	    } else {
		//write to lastHeist
		lastHeist = { "user" : user, "amount" : amount};
		result = "Bet logged - " + user;
	    }
	}
	res.send(result);
	return;
    }
    
    //check xx is trying to
    var tryingReg = /([\w\d]+) is trying to get the squad/i;
    var tryingMatch = tryingReg.exec(req.body.content);
    if (tryingMatch != null && req.body.user == 'hugo__bot') {
	var user = tryingMatch[1].toLowerCase();
	// insert the first bet
	heistBets = new Array(); 
	heistBets.push(lastHeist);
	lastHeist = null;
	//start the heist
	isHeist = true;
	result = "Heist started by " + user;
	res.send(result);
	return;
    }
    
    //check zero/blasted
    var zeroReg = /(got blasted by one|Zero told Berkley about)/i;
    var zeroMatch = zeroReg.exec(req.body.content);
    if (isHeist === true && zeroMatch != null && req.body.user == 'hugo__bot') {
	//stop heist
	isHeist = false;
	result = "Heist failed";
	//process bets and delete them
	heistFail(heistBets);
	heistBets = null;
	res.send(result);
	return;
    }
    
    //check results
    var resultsReg = /(Results from the heist: )(.*)/i;
    var resultsMatch = resultsReg.exec(req.body.content);
    if (isHeist === true && resultsMatch != null && req.body.user == 'hugo__bot') {
	//stop heist
	isHeist = false;
	result = "Heist passed";
	// split wins
	var red = redis_db.get();    
	var wins = resultsMatch[2].split(",");
	wins.forEach(function(item) {
	    //parse win
	    var winReg = /([\w\d]+) \(([\d,]+)\)/ig;
	    var winMatch = winReg.exec(item);
	    if (winMatch != null) {
	    	var user = winMatch[1].toLowerCase(),
		    amount = (parseInt(winMatch[2].replace(",",""))) / 2;
		//remove user from bets
		if (heistBets != null && heistBets.length > 0) {
		    heistBets = heistBets.filter(h => h.user !== user)
		}
		//save win to redis
		red.rpush([user + ":heists", amount], function(err, reply) {
		    if (err) console.log(err);
		});
		}
	});
	if (heistBets != null && heistBets.length > 0) {
	    //save rest of bets as fails
	    heistFail(heistBets);    
	}
	heistBets = null;
	res.send(result);
	return;	
    }
    
res.send(result);
};

function heistFail(bets){
    //Store to redis
    var red = redis_db.get();
    
    bets.forEach(function(item) {
	var nick = item.user,
	    amount = parseInt(item.amount) * -1;
	red.rpush([nick + ":heists", amount], function(err, reply) {
	    if (err) console.log(err);
	});
    });
}

exports.command = function(req, res) {
    var nick = req.params.id.toLowerCase(),
	cmd = req.params.cmd.toLowerCase();
    
    // clean not supported garbage (already lowercase)
    nick = nick.replace(/[^a-z0-9_]/g, '');
    
    // set score (min 0)
    score -= (new Date() - lastAct) * 0.1;
    score = (score < 0) ? 0 : score;
    // add penalty
    score += penalty
    //console.log("cmd score: " + score);
    	    
    // check score
    var timeout = 1;
    if (parseInt(score) > treshold) {
	// if bad score increase timeout
	timeout = treshold + score;
    }
    
    delay(timeout).then(() => {
	// set last run and execute command
	lastAct = new Date();
	if (cmd == "!last10") {
	    getLast(nick, res);
	    return;
	} 
	if (cmd == "!oceans10") {
	    getOceans(nick, res);
	    return;
	}
	if (cmd == "!spinking") {
		getSpinking(res);
		return;
	}
	res.send("!! Unsupported command");
    });
    	    
};
    
function delay (ms) {
    return new Promise(function (resolve, reject) {
	setTimeout(resolve, ms);
    });
}
    
function getLast(nick, res) {    
    var red = redis_db.get();
    
    red.lrange([nick + ":last", 0, -1], function(err, reply) {
    var result
    if (err) {
	result = "!! Error accessing cache";
    	console.log(err);
    } else {
    if (reply.length > 0) {
	var total_spins = 0,
	total_wins = 0,
	last_sum = 0,
	total_sum = 0,
	index ;
	result = "!! " + nick + " - ";

	//last 10
	var last = reply.slice(-10);
	for (index = 0; index < last.length; ++index) {
	    var value = parseInt(last[index]);
	    last_sum += value;
	}
	
	result += "Last " + index + " spins: ";
	if (last_sum < 0) result += "-";
	result += "$" + Math.abs(last_sum) + " [";
	result += last.join(", ");

	//lifetime stats
	for (index = 0; index < reply.length; ++index) {
	var value = parseInt(reply[index]);
	    total_sum += value;
	    total_spins++;
	    if (value > 0) total_wins++;
	}
	var succ = 0;
	if (total_spins > 0 ){
	    succ = (total_wins / total_spins) * 100;
	}
	
	result += "] " + emotes.getRnd() + " History: "
	if (total_sum < 0) result += "-";
	result += "$" + Math.abs(total_sum) + ", ";
	result += total_spins + " spins, ";
	result += succ.toFixed(1) + "% luck";
    } else {
	result = "!! No spins recorded for " + nick;
    } 
    } // end if err
    //console.log(result);
    res.send(result);
    }); //end lrange
 
};

function getOceans(nick, res) {    
    var red = redis_db.get();
    
    red.lrange([nick + ":heists", 0, -1], function(err, reply) {
    var result
    if (err) {
	result = "!! Error accessing cache";
    	console.log(err);
    } else {
    if (reply.length > 0) {
	var total_heists = 0,
	total_wins = 0,
	total_bets = 0,
	last_sum = 0,
	total_sum = 0,
	index ;
	result = "!! " + nick + " - ";

	//oceans 10
	var last = reply.slice(-10);
	for (index = 0; index < last.length; ++index) {
	    var value = parseInt(last[index]);
	    last_sum += value;
	}
	
	result += "Last " + index + " heists: ";
	if (last_sum < 0) result += "-";
	result += "$" + Math.abs(last_sum) + " [";
	result += last.join(", ");

	//lifetime stats
	for (index = 0; index < reply.length; ++index) {
	var value = parseInt(reply[index]);
	    total_sum += value;
	    total_heists++;
	    if (value > 0) total_wins++;
	    total_bets += Math.abs(value);
	}
	var succ = 0,
	    avg = 0;
	if (total_heists > 0 ){
	    succ = (total_wins / total_heists) * 100;
	    avg = (total_bets / total_heists);
	}
	
	result += "] " + emotes.getRnd() + " History: "
	if (total_sum < 0) result += "-";
	result += "$" + Math.abs(total_sum) + ", ";
	result += total_heists + " heists, $";
	result += avg.toFixed(1) + " avg. bet, ";
	result += succ.toFixed(1) + "% luck";
	
	} else {
	result = "!! No heists recorded for " + nick;
    } 
    } // end if err
    //console.log(result);
    res.send(result);
    }); //end lrange
 
};

function getSpinking(res) {
	var red = redis_db.get();

	red.zrevrangebyscore(["!spinking", 100000, 0, "WITHSCORES", "LIMIT", 0, 5], function (err, reply) {
		var result = '';
		if (err) {
			result = "!! Error accessing cache";
			console.log(err);
		} else {
			if (reply.length > 0) {
				
				result = '!! Most successful spins: ';
				let index = 0;
				let position = 1;
				let item = '';

				for (index = 0; index < reply.length; ++index) {
					if (item === '') {
						item = '#' + (position++).toString() + ' ' + reply[index] + ' (';
					}
					else {
						item += reply[index] + ') - ';
						result += item;
						item = '';
					}
				}
				
			} else {
				result = "!! ERROR";
			}
		} // end if err
		//console.log(result);
		result = result.substring(0, result.length - 2);
		res.send(result);
	}); //end zrevrange

};

