'use strict';
const config = require('../config'),
    logging = config.logToConsole,
    botName = config.twitch_channel.bot,
    mongoose = require('mongoose');
    
let //HEIST
    isHeist = false,
    heistBets = null,
    lastBet = null;


exports.parse = function (msg) {
    // parsing methods
    if (Spin(msg)) return;
    if (HeistAmount(msg)) return;
    if (HeistStart(msg)) return;
    if (HeistFail(msg)) return;
    if (HeistSuccess(msg)) return;
};

function Spin(msg) { // !spin XXX
    let result = false;
    //Prepare regexp
    const regexp = /([\w\d]+) (won|lost) ([\d,]+)/;
    const match = regexp.exec(msg.message);
    if (match != null && msg.user === botName) {
        //Parse results
        const nick = match[1];
        let amount = parseInt(match[3].replace(',', ''));
        if (match[2] === 'lost') amount *= -1;

        //TODO: Process results
        if (logging) console.log(`SPIN: ${nick} [${amount}]`);
        result = true;
    }
    return result;
}

function HeistAmount(msg) { // !heist XXX
    let result = false;
    //Prepare regexp
    const heistReg = /(!heist)\s+(\d+).*/i;
    const heistMatch = heistReg.exec(msg.message);
    if (heistMatch != null) {
        //Parse results
        const amount = heistMatch[2];
        const nick = msg.user;
        const bet = { 'user': nick, 'amount': amount };
        if (isHeist === true) {
            // when heist acrive, add to heistBets only if username not exist
            if (heistBets.filter(h => h.user === nick).length == 0) {
                heistBets.push(bet);

                if (logging) console.log(`HEIST-BET: ${nick} [${amount}]`);
                result = true;
            }
        } else {
            // when heist not active, store last bet
            lastBet = bet;

            if (logging) console.log(`PRE-HEIST-BET: ${nick} [${amount}]`);
            result = true;
        } 
    }
    return result;
}

function HeistStart(msg) { // XXX is trying to start
    let result = false;
    //Prepare regexp
    const tryingReg = /([\w\d]+) is trying to get the squad/i;
    const tryingMatch = tryingReg.exec(msg.message);
    //Accept only from bot
    if (tryingMatch != null && msg.user === botName) {
        // insert the logged bet into heist
        heistBets = new Array();
        heistBets.push(lastBet);
        lastBet = null;

        //start the heist
        isHeist = true;
        result = true;
        if (logging) console.log('HEIST STARTED');
    }
    return result;
}

function HeistFail(msg) { // Zero told Berkley / XXX got blasted
    let result = false;
    //Prepare regexp
    const zeroReg = /(got blasted by one|Zero told Berkley about)/i;
    const zeroMatch = zeroReg.exec(msg.message);
    //Accept only from bot during heist
    if (isHeist === true && zeroMatch != null && msg.user === botName) {
        //stop heist
        isHeist = false;
        result = true;
        if (logging) console.log('HEIST FAILED');

        //process bets and delete them
        OnHeistFail(heistBets);
        heistBets = null;
    }
    return result;
}

function HeistSuccess(msg) { // Results from heist ...
    let result = false;
    //Prepare regexp
    const resultsReg = /(Results from the heist: )(.*)/i;
    const resultsMatch = resultsReg.exec(msg.message);
    //Accept only from bot during heist
    if (isHeist === true && resultsMatch != null && msg.user === botName) {
        //stop heist
        isHeist = false;
        result = true;
        if (logging) console.log('HEIST SUCCESSFUL');

        // split result into wins
        const wins = resultsMatch[2].split(' - ');
        wins.forEach(function (item) {
            const winReg = /([\w\d]+) \(([\d,]+)\)/ig;
            const winMatch = winReg.exec(item);
            // match user and amount
            if (winMatch != null) {
                const nick = winMatch[1],
                    amount = (parseInt(winMatch[2].replace(',', '')) / 2);

                // remove user from bets
                if (heistBets != null && heistBets.length > 0) {
                    heistBets = heistBets.filter(h => h.user !== nick);
                }

                // TODO: save WIN 
                if (logging) console.log(`HEIST-WON: ${nick} [${amount}]`);
            }
        });

        // process unsuccessful bets
        if (heistBets != null && heistBets.length > 0) {
            OnHeistFail(heistBets);
        }
        heistBets = null;
        result = true;
    }
    return result;
}

function OnHeistFail(bets) {
    // store fail to DB
    bets.forEach(function (item) {
        let nick = item.user,
            amount = parseInt(item.amount) * -1;
        
        //TODO: save fail
        if (logging) console.log(`HEIST-FAIL: ${nick} [${amount}]`);
    });
}