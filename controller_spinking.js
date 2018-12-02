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

exports.parse = function (req, res) {
	var result = "Not supported";

	//Apply SPIN regexp
	var regexp = /([\w\d]+) (won|lost) ([\d,]+)/;
	//console.log(req.body.content);
	var match = regexp.exec(req.body.content);
	if (match != null && req.body.user == 'hugo__bot') {
		//Parse results
		var nick = match[1].toLowerCase();
		var amount = parseInt(match[3].replace(",", ""));
		if (match[2] == "lost") amount = amount * -1

		//Store to redis
		var red = redis_db.get();
		red.rpush([nick + ":last", amount], function (err, reply) {
			if (err) console.log(err);
		});
		red.incr([nick + ":spins"], function (err, reply) {
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
		if (isHeist === true) {
			// add to heistBets only if username not exist
			if (heistBets.filter(h => h.user === user).length == 0) {
				var bet = { "user": user, "amount": amount };
				heistBets.push(bet);
				result = "Bet added - " + user;
			}
		} else {
			//write to lastHeist
			lastHeist = { "user": user, "amount": amount };
			result = "Bet logged - " + user;
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
		var wins = resultsMatch[2].split(" - ");
		wins.forEach(function(itme) {
			//parse win
			var winReg = /([\w\d]+) \(([\d,]+)\)/ig;
			var winMatch = winReg.exec(item);
			if (winMatch != null) {
				var user = winMatch[1].toLowerCase(),
					amount = (parseInt(winMatch[2].replace(",", ""))) / 2;
				//remove user from bets
				if (heistBets != null && heistBets.length > 0) {
					heistBets = heistBets.filter(h => h.user !== user)
				}
				//save win to redis
				red.rpush([user + ":heists", amount], function (err, reply) {
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

function heistFail(bets) {
	//Store to redis
	var red = redis_db.get();

	bets.forEach(function (item) {
		var nick = item.user,
			amount = parseInt(item.amount) * -1;
		red.rpush([nick + ":heists", amount], function (err, reply) {
			if (err) console.log(err);
		});
	});
}

exports.command = function (req, res) {
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

function delay(ms) {
	return new Promise(function (resolve, reject) {
		setTimeout(resolve, ms);
	});
}

function getLast(nick, res) {
	var red = redis_db.get();

	red.lrange([nick + ":last", 0, -1], function (err, reply) {
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
					index;
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
				if (total_spins > 0) {
					succ = (total_wins / total_spins) * 100;
				}

				result += "] " + emotes.getRnd() + " Lifetime: "
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

	red.lrange([nick + ":heists", 0, -1], function (err, reply) {
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
					index;
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
				if (total_heists > 0) {
					succ = (total_wins / total_heists) * 100;
					avg = (total_bets / total_heists);
				}

				result += "] " + emotes.getRnd() + " Lifetime: "
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
	}); //end lrange

};

exports.spinking = function (req, res) {
	var red = redis_db.get();

	//list of known nicks to recalculate spinking score
	var arr =  ['tobbisan','tanur5','kristis124','eaglepancake','dj1298rotik1','jeff1375','immesai','armyz99','major4eto','genonimu','diederen1','julioks','definetlynotcriss','avengetor','hikarimusha','farmerotv','yaaleg','pinskill3r','stayhighbefly','dans4777','drunkshrinemaiden','sthefany_ge','adrenalin_md','dynamik99999','agreeed','mjordangaming1','exigent_chaos','dinnercore','bloo9372','robbiegerrard','unknown_griffin','bv3r','brkl_','kukoorooza','diviinez','johnmrtn101','mertstar3','shiiet123','euronisko','t0xic_skyz','mr50split','chapusobiwan','fatcj','juanpablo209','virrozamora2017','fu210cwwwr','colbyseaman','n0tevenc1ose','cj_ryder_bigsmoke_sweet','vispooh','theromanian_','silverdono','scarecrow1220','lyn1cal','tontonlaio','kalixay','justkill43','erikson1990','otomedori12','dohujawafla','leonardo_one_oscaro','bam_xdd','kfcandwatermeloon','flesh333','pablogg12','dribblinq','onezee_blitz','pandastica1','gd_deathg','jorddnnn','medoalgana9','nejodyly','fedecrash02','saksikas','ajmurphyy','cyberfrost15','nanistyles','dipztv','toiletpaper5050','itsbighank','jurkometak','phvntom','akidecandy','baronvonb0t','okramono','niko_bellic107','4lan_overw','xneoskill','sitarumachina','bossybetty','vini_one__','epickyyy','c03a5','autigia','rok_24','2cool4u27','pigu_','torqq_','p1tcobra','chamber36','fredy_1024','bun_tail','inexactchapo12','smurry111','katerine06','norris8bit','ganjo_og','wertsam12','theofficialandrei27','putinhuyy','diamondzblacks','keepo2k17','broyal','atavazzazin','nekkolover18','capacitive','begix','xiledx','illuminati7778','reed_deez','venturasmtg','r0fl1337','xxnazzalamxx','leykin_deykin','jendrek100','brett5101hall','diamondplbe','lilzpowage','andre_joubert','minerdigger1995','patriot_guy123','freydude1999','tronix5000','lenny_kibbutz','barthiz','darkhammer125','pleurocco','malima42','obstbanane','donald_j_trump_ftw','go_outside_and_game','dominechris','busta_carl','axlavellan69','maxthexing','linoxbestyt','couptock','pai_do_smeb','judas73','hypnoticburper','sharim_one','doctorbom','baz9000','moriella90','cj_morton','emildaugaard','macijauskas32','tuschetb','knelsjee','sir__shanks','yamcha17','amaher547','iniroyt','fallingintogalaxies','organigramm','katanos69','jacob_satoriboss','usmanaga0','nikolachnikov','memes4lyfe69','destroyerdxd','stremer_4_life','amateurarlie','coolname8','belrusguy','krisi003','crazypraetorian','octo7','navnfugl','hugotwo','p_e_c_ik_il_ii','kaan1335','xumukrc','lukasbelavy','elitemaf1a','christopher_fire','dodogproductions','iamalwayswatchingyouonyt','sceptile67','viizion_misty','mopsi___','assassin24gamer','sgetti5','crowizzard98','bphilnmybody','swat0202','dragonviolado','allscrap','velniothe','dgzeek616','brendan570','tsunami20000','lisabotcat','thisisjayjaysufc','ninjahmos','fettydos','iandmass','based_mugi','margo98','mr_daem0n','zpawz','pruitt_86','jonis221','hev702','thombo1','derek31037','dj_battery','teh_concrete','noobster7771','evohhd','plushak00','geri405','blinkcrink','robinplz','hotkappa69','sicneses77','sneakfail','heldojin','ethanthenegro','smoothbunz123','callmememelord','czciscocort3zcz','snowxxblackeyes','deadrising4fun','vampireplaysgames','ericslein','gus_ser','antisocialsocialboy','notorious_djas','grimnirrrrrrrrrr','ateamu1998','charlieviper16','1whisky','mythicplayer1','kndy55','kirakiddo','emperor_of_frankerz','naclshackle','goldenmeemer','elior7321','chris55566','beatman690','asaajqb','stexxhd1337','blizzardbot','gustrbspeedrun','lamarrmahbro','joiutp','seek4y','alphaaiming','linhilens','ipivapan15','thedaveva','amaluna_','bustalluminati','mcpeaceyt','bata0071','dat_king_24','vincentvalmont','nobrakralj','jawdonx','jordess','ism4r','teh_badge','boodreamer0','borisman_elite','videga123','goooosie','turtlestewgaming','zmey25','darkwing_duck12','logan22431','alucard2k12','hugoisplayingonps2','ardakndr','moehlemg','yung2pactheory','endiplays','bloxorz51','therpgtactian','elgrandosmokio420','krickl','girlgirlforever2','flafy123654789','zdrxzt','death_rivor','officialdeku','shino775','juhc13','xmxgoxbluex','buffalobills27','criscamilo272','aquiles16','zarowitsch','johny5588','screezoxfr','cashman2091','xdalejandrodx4000','charaky_','brooklyn_babe','tkbignuts','mahagoni911','thedarkgauna','yoi_ishiya','j0ltl0rd','dennis_n2o','neunbear','preachdoe','finraamattu','realfreaky_','rafalo57','slicer71','oryx_cs','vonzankyou','locutorok','morgoth_worshipper','mainmaster2','hydaypanda','aimsterx','thisisluckyofficial','ericmatterhorn','criken77','paradroxy','tishtashpoe','koinhok104','herculiz07','mashiroshiina_v2','derpabird','the_expert22','gamezplayer','robindahood210','tajger13','graballs','thinned_','dirtyjerzey30','unkn0wn_gt','patiamin','reeceday117','stukov_wolfwood','kydws','osmorseo','eusouapick1','tribalstar8','seekmeyour','hauptmannss','elgatocaotico','kingsword552','rally_ranger','highmars','llducksll','pendlemo','iclippersi','mikos2408','montyoz','cr3ez','alphonsebc','choppergrubz','rakim_0203','trombonasaur','justpatrickkappa','fledratv','typicalmiku46','g04tyx','zentrosr','janowak1','wat153','sublimemonkey92','shadow_dog','thebestsof','sfinksss','krisforlifez','ariasmendoza23','mast3rzzz','mr_mayhem_1312','santaissick','shufflej_est','epiccole1','hex_temp','vertigo_v2','wussgouch','thehockeykid1221','dultimat3','werby8','fortehdrop','neron237','mikzzzn','zirkovmmo','lightlessnova','brabitss','hood61','crazyplaymaker','sefo8791','baotrung1610','originalmcrib','catdestroyer696969','dj_phatzo','juzanov','raggabombxd','farenhait74','appleboycz','dierer','bobchernofff','larry138','thenemesis777','krzysiopanda','angrybeev','boban250','theblackscarface666','bigsmokeisatraitor','nrdhnx','fabulousfather','jwhee75169','ermoonde','popeyez_','jackt_e','kingkung221','mrkb3006','lutharoian','theracer50','suad_sutko','mtoms127','livecookie136','christera_','defdef332','linkrise','mohdfahd_','gameout_yt','kelhsy','passionate_sloth','mtux_ng','zachirr','tomdelonge_','myles_l','loki027','mrjulius13','zanethebest','celoklaken','p1katsu','tuxedor','mantuxx77','gmsmart','domgfx','jeb8ed','daniellus201995','thefloridamango','l4u14','thesnajper','rlx_nxth','owl_capwn','shizzo_eriik','roboticghost86','jacooob_','0921lonewolf','justanormalswede','farad213','tokyocloud','f_ranx','pixelateddonkey','sundae99','slimeblue1','cynic_00','mirek_snd','seadevilfromrus','newzealandbeast','blu_laguna','the_gamer900','xxfunkykong420xx','irmaonaogemeodofelps','luquetein','altan2298','jayjay1401','derpspy','carnagexoxo','growking2000','pepekekov','sisoypablo','thejmaster06','powe67','voodoo2400','ogpizgar','tyrionthebest','check088','janolof','bars2199','v1new00d','vijay2021','dnmgaming1988_backup','the_irish_prince','flukkee','phobosvt','lilglassballafool','volcaniic','xirysly','lifezor_','seenchrome','sinanovicanel','kidacqrceva','krooked_kop','andrewqwerty2','mkfreeman','martin123123123123123123','egorsalad','jujuxenoblade','manis12','530dx','walzu88','rio_arg','jmix_10_','happypenguin8','andydorian','inktonica','bia107','idf31','cameron_steel19','zebruh_gaming','malachi124','bigsmokest','rawneil','sgtdawwgee','kapacu4','spectrobian','fekinpeysy','miracleinc_','tacticalfinsoldier','greasy___','orangesya','marcus4565448447573657653','wapren','lumpo34','xrmdc','xquicksilverpm','kuskucukazim','klougmann','jidf_is_my_squad','creeetz','conan31','hardcorepowner','mashide','michas_ohio','shreyanshfux','william420blazeit','jirrick','chosendarklord','kriskong3213','elgrandosmokie','hirosam','jersy_envy','z33ndy','xxgodsunxx','edsheeran654','godspotgarden','andruysha_tikhiy','derpmaster209','xzdemo','manfromsouth','jesushentaichri','syndat0r','emilyl94','difficult98vp','bundol','oyuncugorunumluadam','xkristix','fulloftime','sneeakymcbear','violencerayo','david_9191','yandere_maiden','donkili','dreongg','xmrlordraffx','bradok123','bananabrains22','vcmpmav','viderino','thetruescuba','coelacanthm5','bendover169','eahuj','thelexusmaster','zachdacheetah','razzajwilkie','havenfrostfield','genyzz','freelance_donkeypunch','shadowboss10','thereaking','zane12345698','swill976','srcebatutinha','cl0ckw0rx','emeralda_demonic_officer','azartex56','cjcj101','thepeestain69','xsanxdiegox','chewdiggy','ladieswashroom123','kash_lba','sk1mone','rmc_aries','teddymilf','tophersnags','gamrsyt','khm9192','karegy','gatojazz69','m8kedav','bestnever1','kazemegaman1','plzdonateme005','megapovar','yishur','lakio74','ajdo260','curlyshrub','apegzz','d4rk1997','ssamurraisoul','jooda213','abhortwitch','ailisqq','hardstucked','lukasvincour','royal2stronk','wooitsyin','officialr3x','vntblck','mat_644','breadfong15','helmutczsk','koshakhitmana','coacoa_frets','tabledude','shffl_dair','darq_q','vondemic','freeloada_','hashbrown_selfiestick','danilao155','semiskilledgamr','alternix2','vladsinlaw','mveriick','tygazafonso99','pqechopq','bramskee','godamongtwitch','foxontheinternet','danielguapohermoso','kovach00','turtleriven','theallenq','juicheb','dmaniac206','mploiro1997','kiskis123','meapzor','demetrius_tv','deadzonedulpo213','heelnick','flynmaniac','majordoof','missedhonor','sparkelsrawesome','drosmoker123','hulmy','supergaming914','yanderedev','sphere_remix','rapt0r4','milosrakas','rubenn_not_castro','desman432','xxpjeroxx','zepr01','santaclyde','adam_deme','industrialwolf','brainn47','falkaas','knuddellufff','fredozen','rawwestyasuoalive','trickstereric','benjaminjaja','madmen234l','ronizzleshizzle','takodaaa','rab_thingy','boring_schultz','arcticc13','krossi92','redline0075','shaadynasty','jamzow33d','garrry_____12','ostik16','kirisa1337','lordisgaben','keeperravager_','vip0417','dubstepc4tz','gugole_','pandasftw420','datjimmy13','kabanossimakkara','shantimar','riihards','arthurcoleman','asdfasdgag','kaazzooh','d3liriumtrigger','benobram','vulgarusername','jholl111','teddygangsta','thagamechanger','tikkarikari','1234exec1234','louisacshs1','lexuslexus47','macaronidongerini','protis_','chimbro12341234','mksh0w14','mikepotter6','florek1509','jaaimelm','panda__070','saymynamehaisenburg','st4va','iamsweden',
	'chekin12345678','josemanoel123','gk1gk','un_forastero','laurenzo3420','rodgex','mrmistermoist','pawelchis','kelvynnjs','ryderlittlecum','yx10a','petty_lexi','thevomitbucket','roomy21','kaitri','mrknightsmen','ash_kuki','dani320ce','itsayomati','jackhenne','livelikearockstar','hjortshoej_','lueroi69','kaderimon','al_kapwn','nikkigames92','tranto_','zoxigen','oghextick','flumineapb','eusuntmoon','bustacarl','mohamedjohnson340','liquidsunfall','hey_just_call_me_w','gab_ster','kaazjez','grantedmeat5','blantas_','deepthroattv','heathysaurusrex','gjokewww','athiils','gladhomer','b181','axettomi','shadow_spear','theweezytv','nilloc6969','jetusa','sebi121','princethegod92','dankmemethief14','jacobn923','thebottlecracker','skameyka1','pamplome','browniefox','mrmathijs95','zzigata','blitzkrieg_351','rednass','mrsn99','gangxxter','daspr07','717135','schniefy','ebony_baronyt','awakebooger82','thegoldenpro123','maezzinho','tyqrys','robin541x','golden_raccoon','lazarusxd12','dragonmaximus','sushi_unit01','wasda838','thederplanator','fresh25xd','djas63','even_though_i_dont_care','kaijufan2002','teapot_xd','kleptomaniia_','bloodshank','sirk0bra','the_radioactive_man','tsuzuriko','yourboialec','magicalpilot','humma8','unoriginalnamel','dallas_dm','aleks15m','thesupergamer222','platycast1','f4cebr3aker','miumiu_x','uni69','tetsurose','usskatana','gutobauer','mrbarbuq17','saspedo','leackls','skythekidcod','mopsi_speedruns','atletak','therainbowcogwheel','sponge756','gamertv16','darkporro','original_slav','latvianhazy','bill_noman','allothersweretaken','mczolly','weezyfin','mrkatze008','koteriko','em1lic0','yerboiexcal','the_blak_irish21','heiarism','whodafukisrotem','3ddd_production','unoseth','milkyg11','nicogassman','joaoapg','touchmypooter95','backmadejay','autolinjatoy','heel_engineer','seasickleader','alka_mm','diowsa','van_of_ham','masacrualexx','raptor___95','librek37','batuhangk328','xxfalc0n188xx','lakebytheroad','corpsegrindermcz','look_at_them_go','azombierabbit','shanlock22','newby468','r3dy0sh1','tapetentoni','santosnowar','ceceil10','thebroadster','albertstrife','iantonio3','hamsterat','sutapurachina','dechristianizer','gta_dbz_prophet_','x_stream22487','waluigi_wario_10000','efedusu1','villejh','razordestroyer22','colderlize','justasibra','noticemeace','aequitastheaeon','skitscapesk','lo0kah','sword250','san_andreascj','ihennu','mondaystress','algubi','chronicbubonic','jayeshrsg','4xmekox2','dinouanno21','sds_midas','crazyshadow69','tanaypandey123','lordkami69','succmyweftnut','sneakybeakylikes','sprzedam_opla___','hater_salad','hoboballsacks','ctrgeo44','imp3rial_yt','verydarksoul','wieldyskate19','baldevil69','szczepan7345','sylveon15','graveyardcuck','soup_gg','domotherussian','witlon','gablin33km','gamingwithnolt','amane_misah','zachmunzter','djgame05','brett102795','jt_monochrome','lonewolf995','alegz2106','kiezer21','zinsolentiv','critikalhd','bonus1001','thecavillus','mokkori_hunter77','corvelini','gardenintool','adamcalmo','goodluckreadingthis','dean_amatsuka','frosch1994','sevenevenvenenn','jupstejuho','heywood_jablo','skteampsychopath','jairpalacios935','japaniiz69','dogeawott','tost1337','fartripotrip','kezanu','tobys12345','sake0022','colored_lonely','exfon','monstumo','malario123','luk3_luca','sadboy420lv','tacothunder87','doublemint22','skyminer123','havel_the_donk','anakingabriel','prodigy262','jamtage47','eriel222','logamomlkzuero','broughtmyknife','bulabila','thesportsatellite','vaultdweller19','telepathicseduction','sup32o80','princerakeem252','gl3ba1337','mkheretodowork','aligato2','randomgamer144','alecownzu','acg_k1ll3r','sarahx7','47fame','sp0kyrez','bosonicfermion','gonabro','cesargonzalez7','simkec','13none13','maurito_96','georaga','lbasem','ivan_kotovski','itsnwz','blinko_pm','jjquicksilver','31mars','elementalthief','kamilkz56','smiler1255','blackburn103','dolmenator','itsdiesl','petrofskie','mussi123azzeddin','cranialpulverization','killerdropbears','fawklet','tommy232003','halvyyy','as1c3','slaughtercarrot','kendrickthadamngoat','cerebral02','campanello1','patricktpeacock','duty22334','stano45','therealvudogaming','filips9961','maxnoisa','nockahomer','engrpen2x','djdog90','g0llbert','tomvr1','warialz','planedriver36','marcinnowsky','ballakilla','bananatruffleheadass','whitesox31','senrosee','akustaka','vikvinegar','ninuiub','yahiabarahim','mrsleepallday','omega_ltu','letsplayjuergen','homicidalraven','firekip','iamswellis','rickyisawesom','im_pxtc','majiklte','getlucky0','desmond123567','bawn88','the_ghost____','xsebke','darthdemolitionman','deluxeftw','cutiriarte','sicills_2','vvundead','xxxdnx','momper','leejunfan777','therealchriddy','semblanceoform','try_amm','gangsta_pusheen','gracham_','daniellapa','znotsoordinary','ojt6627','miguelsworld','lagger452','anicepenguin','jimmerz95','globeros','brandonrox42','smokingaxe','butter_of_toast','gaben38','miixdj','dolfaninnyc','suhovasusenka','victor12montgat','ceresjmm','straight_outta_koprusa','geeorgtx','skrabicka','sholuco','riskn_','captainchronicles','diddimao','itsthekappaguzma','redyah','svenikip','manipulatedx','chelsea8410','ruchalbymhugo','hungarianborderpatrol','leshrakbessy','krsta1234','dairuzz','cazpersky','blackjesuscs','asrieldreemurr65403','theodor199','robemeister','gtavic95','abrupttv','kister450','trindadecrvg','itsabsent','ellaluxe','jacobsnakob345','potatomaster1337','rodrich182','theclubmaster','gospelraptor','gemael665','mosk_uwu','luxster_','deadpool27likewoowwtf','comnuma','flyingscorpion458','gusalg_','damien2987','xdragon95','crazygamer921921','oglongbowsynthesis','4urkazavseki','vod_crack','lowkeychronic','manchulas','gymember','philmedick','barishoxworth','lspounl','superpastamann','rumpakaaji','bstn_savage_420','arnasdaim','minecraft_king_j','imbatman110','diewott1','w33dtr00p3r','reinforceone','gman1080p','dawka1105','ncproductions','anzipane','rojakee','s1xfold','spacewes','greedypol','1337gr1g','sickspiderzz','nerubj','heavenmeltdown','syndiiicate_','xirodgeix','theyona','zeydowbg','steve_with_a_v','asiylum_','hudsbr2','pablodiablosrb48','jdmfoelife','tiagoac19','sofak1ngg','not_from_brazil','quiltie','marcus1234567890123456789','muksmukss','the_onixpected','magnetechh','oussamathekicker','13none','cptlemonaide','supershadow642jz','wtoimi','craikzz','andersgaming32','ace_kaleel','pikatchuking','dragonrider1918','hshsdota2','elo_jaxson','pedersveder','tonytheliz','th3mir','bignutts16','vamox1','ixorizon','thenaxel','jb_mel','echodeletion','t3mp0ralflux','zeprobr_','maxcrime','biometrix54','ptrk1234','bob_belcher','webstone','darren20500','jasonjokes','pashaport','johnk10000','cbrown1299','by_dess','imsouls','mayroskinezos','aleceeee','jumma_rekt','dannegames','smg5284','blackice116','nikobellicone','endlessoul','dorianrpg','4sidedtrivngles','nefzee','sootch_tv','mystiika_','littlegirlrs','durael321','clustersofstars','a_hooliger','lijah1999','jimlovgren','mellamoalan','bloodytrident','hans0730','sdevmanny','hroom228','localacct','shadowsparkyfoxwastaken','batata13cm','bandit0cat','nanoclone','mr_tuttifrutti','patrykx4729','lauranrsm2k','solidsnake6930','robotronusss','basiapap97','effluvedecouscous','reignpheonix','ryantheplayer','fdiskx64','tcanevali8','airamsote','coconutzi','renaser90','13zeeus37','ligegyldigt69','nicolas55550','curls13','rafaeeru','alex_says_','motobilek','push_w4ter','lkiaro','spoonty','kekee12344','followthatdamntraincj','heyo7777','sims777190','bawnmeister','remainingapollo','thefoxymasterfan1','big_smoke4','zprava','frosthun04','beaner_boi420','nobodyinteresting2','gamator_','xf1r3xic3x','elhunteros','laudable52','ferro_anguis','blondmurzyn','kaidoupedro','puyu99','00zee','dave555966','dopeassnuts','pacnation','h40ker','itsthedailyk','lampis26','sasaletsplay','sad_torso','zeiaiemon','splashelights1337','theeckoo','juan_cenawwe','yan_b','gorillazrockstar','sebastool','arkowy','aguynamedhunter','nikitalomaet','ranger1039','rick750','davidmendes182','carlosmaker','iprolynch','dogcano','mrlatwia','danielelcracero','pleaseplayagain','skeezan','fireknight127','mishanya2712','carl_bruhh','ogcraftedxd','jeffazing1','dubolic','afootfever','westcoast_stagea','themcpixelman','theheits29','petrusxd','chitanwolf','ttritt','zkempachi','steelrodeo','bariizza','itsablackhooooooooole','mmtheman','powerpow98','ryangehauen','bonazzoligta','rafthegrumpycat','eldarbayramukov','gorillazrokstar','alexandre310804','jnets36','mrdubscheckem','afkcrimson','stygianquaker','frostyzzz12','trustix21','zackisxcoolking456','mr_ghoulberry','chiraqtown1','cmajor123','noconviction','celesties','troobo','ohhehhmgehh','fakiiiez','shibbylicious','creeps_1','alexalleck','alex02xx','shmxus','alpoodle','realgamer3','lelucking','ardem_stern','monstrousfps','dougthedog6','slumpedup','theradicalninja','beshar_','nicolasbrgg','kobr24','jonny_man814','datool110','nate4134','mr_dogez','ghaziwarrior','kaiyotee','dyny1','machiavelli1990','haazardee','rdk_13','c4ptnkush','one_piece_sanji','risdasd','thekoolfox','l1htne','bozkurtmaster','crimsonbode','sanya1377','bradabbott123','dropnation1','2fap4u','x420n0sc0per','drew3121','eaglexclaw','silents369','norishun','darkspartan980','winter420','xerebann','legionofcoffee','eagerkey','thepashtika','candypope','theburningpyromaniac','goodnighttttt','lukesnear','darkabbasi24','landon_g55','bosszeus164906real','drsuccyasack','heronix_','doughnut911','ajwazheresometimes','sqezzard','baq1988','tv_zone','sinanozerss','palac12345','mepmeptv','kemalsw','tomhumphreys15','muffler344','paumat','save_us_y2j_','javelinv2','uareanidiotboi','japanesevisa','grizlybread','quttheme','luna0609','froomka11','adequateleaf750','kksteeen','mcwatte','thegtamaster31','tare_321','ruffcouch','blackknightsop','walton71512','equinox_jh','kidwada','slavabud','evil_toadette','slabakabg','bogdahoh','itsthedeadguzma','puretemptation','mthen10','bangers_ca','holysword211','zsz0809','whitewolf_____','pvtbungho','flyingcoyotes','magiczz_modz','tsunami1994','head_shot11501','wheredidthehairgo','j4r3k',
	'orson2','danieliustt','skillfulsheep','suni_b','sinkers93','lord_of_conquest','younessberrada','alex_042203','elodevils','irasz','hoosfoof','th3illumin8tor','theelitesniper7','tyzk38','ricksterthetrickster','xk3nji','infinitezr0','mekro69','drdinglebung','popurla','iiwelshyy','marc_games','taykitty','deathangel1800','scofiledtheking','cristianfromtheh','zeronarukami','seldom_sober','theespion601','imripage_be','eskisabri','hasheemthedreamthabeet','smurfaturf','xoluc0','fikoochooo','lorindes','hipis2','thewocgames','camvia156','gtaman06','piper__','maneceel96','kota1215','nickroggero','lesuperdidou','satanicspeedruns','crolonus','ultimateskygaming','xv53m8','krubiks','hoxiu_','a_lego_jedi','sabermir','thelandstalker','itskeithyboi','pronouncedeasy','v0ras','n0one_joci','ml992','yore25','josheyed','iananimalcrossing','mindblow_','gian008','f0mek','bananzofangered','rockfoxx','dorreean','u1tragato','rasool44','trve_mitch','sindacco77','just_musicltu','strutsirna','smoshlink1','soaringguitar04','mexican_american_','bombdabomber','palachka','xyamiie','the_real_awesomegamer','dario6929','gravarty','bob_181','mryesteryear','zergling66','aceinthe2','sitref','calvinisafuccboi','perseluspiton','clueless1523','wapuwapu','seba5592','burg3rz12','omerv03','xpertgamer7','totoandamigo','steph4life','bottle_of_crack','ramja_','mangosteins','rageex1337','bluewhiteredblack','matejgod','drtrace','cronx94','kastalooza','mrclippyy','nodrugs_here','captainmeow_ger','dvielis360','youtuberbrianplays','neonospoon','finntheh00man','slimsyplayer','390k','meow_u_doin','zero9teen_by','lotusdoctor','haphazardnpc','michelpl3','rubennnotcastro_bot','dok919_yt','razvi103','stilka87','guciofan1','ciauhog','bobbymeister2','sinuxpim','kotato_','hortak','twinez_','glitchkek','leaf003','brodyb06','slaintrax','lukas_3107','geoffreydm','dolphtw','takitotrickerino','eccopn','verloren11','hugo_one','scuttlfish','illuminopti','jacob5664','elvis_mattje','tokujo','xblackproject','xxchrisxbossxx','lilriku','jpt_igor','kozz432','flashignitebard','mahdijemaa','frebergg','grayface123','gamerles77','esparza_48','ipottatto','shlomiee','pureevil263','thebeboszka','voltack123','wusspoppinkids','archjoa','frenchtaylor','vinus_yolo','elmashp24','cereal00','4lanow4','lukedanerd','guardt','juppe_h','bananamaster2442','mesherie','d_ron69','itzleshenka','chinesechefknife','royalgamer373','kazoum92','bjrough1','kondzio0811','stevelord','yasuomain9438','boodreamer17','mikollajczak','thedutchsavage2','superklaas12','kendama165','exently','metropwn1','grovegangsta1992','pikeldeo','koalarific','maxikom','mcphee_','merkydss1','przemonxpompa','saltyvulcan','madameghostly','forcedesupremo','datjackjack','willemisawsome','allstarassassin','cocainepro','stheb12','tedmath1337','chaafeel','skrskrpullitout','killer_doom1','ryhoo1','apock247','jbzonehype','davkata77','joyu963','cyberrouge','serifavc','suppl1cate','simotroid','gabriel_somensi','cowboy11007','pool_of_fears','murdae','thenewscarface','zooky1','haxaar','wildyq','tehb73','mon3yk1ng','bjbweazy2','krazy_tom','chiqi_','draganisdead','avinashbingo','bezenko','mixer_yt','crowbarex','travisc304','elnorden','aindrei4e','gagetaylor16','lihunik','elite_jalapeno','allyhillsfan','giosantii','jsem123','funkyjen','milking_kid_','der_leopard','warrenisen','joelyee','purina_puppy_chow','aurea_carmina','diamonnnd69','krerg0o','bulletvendetta','alonekeybi','darksunsetx','realdzs','gardenixu','ilya_prepizdak','colonelbrownie','farkas210','visuhh','vladimirputin04','jiub2012','molly_style','deadlockabc','cdawgydawg911','carbine_rifles','billyzapato','mlgvaldomero','bmorexchaos89','p0okr','eferrorfile','fodbeni','hkforym','kaopoke','ultrakantum','nghtk1ng','vitormouraa','fastandfur','im2quick4u2','psychoman86','reese_mcnabb','coolberktr','mr_matt18','iwanttodomysister666','luckysevendenis','aerovsurge','fodlios','lumao55','lordkabab','thesquishyone','thegarey','syk00z','itskarbon','krysk9001','avionixalness','czar_163','misscolourz','mercury_5953','woozeye','stapmann','rafau999','ipidgeotto','donerkebabjj','rivolff','rattems','ahmetjusy','xninjapotato','dedgyblazer','chkns','nanohgamer','blastmehfirefield','teestow','mromarmiroo','the_gamer_brony_yt','zentrom','dankeyfist','fly1zombie','magicalthingz','shrimpleader','max__rolls','zproskiliz','sahrey','driontin','lathandaen','dazeldageek','stunnera12','dijabolarunner','1mrshelman1','felaino','kingofhalloween','aykfen','mainmastery','lukkash','brkyksl','adorotelobo','hoppaxzu','mixikola','joaquimpxopt','reinbotforce','butteredpotato23','darklord20050','festivesquid','neruisan','blrfishy','darkpandazhdxd_','frickfrack15','yaezakura_sala','goingtotallyham','oguzhan1415','flying_hydra','gtakrustyy2','convict_tv','naepfus','zpawzmobile','lelowis_kekato','erhan_57_','larshimself','shadowstorm2195','kyattsu404','thegodishere1','mp_loiro','avocoda','llamagamer01','zaczacattack','busta_og_loc','guywholied','erica_bby','qune303030300','xwafelek','ollabear','davidkacpertu_or_dawid','iiinventory','gpkapitany','mareodez','sam_gta1','mohaaroma','rodimusprime1984','seaweeeeed','flippytronix','iambennguin','topleader2','klawss','waaaassssiiiiliiii','borisszoro','shadowofsorrow','greencrushs','deezgoodnutz','djdonat','jakqc','guychen1998','yeti_97','tommyforelli','finestaa','parickwinner','crackex488','mustang_fan9','parlov_mateo','baroku','mirksstuff','lortshmagool','donttouc1','shinyumbreon0190','mrmiroooo1','harskyli','weebus1','coldzerabrazil','vitality001','mrr0b0tt','cavernv9','bl2master2748','thegreatderperer','sh3r11f','n_pal','grizzly04_','nathan3412','big_smowk','lokialbertros','totallymalk','vilepenance','tostibis','happykid11','illuminati7777','chnkyd12316','whitecudron','jungjang1234','deathbeckons','superfox7','fanus1','jerzeys_girl30','michael2365','tosters_in','mackdanny','charlie0gamer','bendertf','chuta1234','phpmayan','endiny','nameisnicock','iainsr','shinsujin','hugo_vietnam_fanboy','nessnesmayhem','uselessnewb1','vxspac','tezad','azekas','mmger','minatob','eat_more_fruits','makovonmako','blackout0308','korkybuchek1488','makeitpls','eazyplayz','gurton3','vinuscar','joshua1234frogslol','kingmclovin27','gimmeanickname','jake_wicha_21','hugo_is_hell','nnicclaas','kamatoznek','daann19','imickro','justdancho','nater5533','warren003','quitelongman','moneyrich2601','icantswimjbp','carelessgrin','tomzar_','budderbruh16','metal_boy97','niewiemcopowiedziecziom','marinesharks','eichiviech1990','ectm_sharky','dadybosma10','long37gaming','c00kie1337','th0ny57800','arkmger2','ahmed_warface','overcooler_69','daydricoldsmith','morton_g91','ookeys','powerbetapl','spidertwitch21','razza420','koblue','trouserguy','zestyrelish','fantikprogame','jhunter1324','cjabusta','vnonvmousx','mrpandatm','theradioactive4','drmustard','larsthesheep','mandarinaa21','ado99921','bittles793','vitycent','tkmachine','sausage_original','zayerbayer2','drunkpeoplewithfirearms','poik_777','lukeyluke444','soaddave','jumpman0000','spicyoctopustaco','haiimjacob','r4m1z0r','gta5lover109','francis877','pokusiek','tigershark96','zt34rz_911','yohnerfang','aident1990','barnyardcuck','pan_jezus_xd','ananascaesar835','dlwp1989dk','pizzabouy','onlyalettershor','theteemocrusher','dahaka94','stealthywolfxli','kappa579','emveekay','whisperbr','greddyr34','stevenfre','mortymo','kamiks0320','baconpocalypse','freekyytofficial','deniscurea','bone67','musicbyphantom','yangateio','mitch_at','holgadovic1991','sectionmp','go6o_turboto','reinforce__zwei','jellyndfish','sailaser01','james5869','flare_blitz_101','strengthryan23','newbikscube','wolverine19322','shawtactics','mpex2006km','flyfrok','melomuevoatwitch','robertficosmerslovakia','alphahelioz','karacameu123','sixhundertsixtysix','cubox_10','lost_e','goosetmx','xquantumforcex','joceeelol','flyingfox305','dontaskaboutcake','skii2py','ps3_hasnogames','itzoj','marcingb7','l0stmindd','kiske123','totopiaa12','aidanc279','csgounlive','karluschi','kzaminer20','jsut_cs','thebulapsycho','joe7s','ahmetjust','super_piter_','lara1503','hazar_2nbumber9','3ngag3','lima0naise','theblacksoviet','bybyku','3ooo3','spongebobsqear','jake_galla_07','ncarolina_910','tonelovesdomee','synced78','ncv614','agentpandacraft','emperorrambo','itsmenoraway','enesbey458','teentitan42','callmedaddy80','erzmagiertv','sweaterman_','thejockelp','pejnismiggle','carbontom','gertplz','robidable','lowqualitychips','dartglow','llavish','bigbrotherdevil','sadpotato__','andreaslag','gscout1','muffinkisses','terreldabest1','paulsack97','lastazura','jensenerher','dontstarvefan001','lust_in_space','dtlizbeast','gialloertv','kuruh_','gbt_sky','untechgonerblx','catzisdead','darklightsds','minimeham1lton','juhoblaa','bigv10','foolmetwice007','sajtosarc','androidies','purrets','gledsonol','losradinos','69kajakas69','hiddosdosdos','ostach12','classic1102','stradaboy','tenteens','zoton2','alongso14','superovechka','xdaniel369','jedroi420','blackheart304','drugrixh_marty','andreasfc99','edsonbf1','plsgiveusername','hthhbfvbghjkhgfv','luidzil','bigfatwhale','butterscotchthehardcandy','novatec_','dbratchell','winnin83','brony4ever23','a_brazilian_guy','black_weeaboo','darkorkid3','fenova','agsysheep6600','richpoootis','fefo112','migueldp01','vflow01','playwithverins','lilhomieaka','woodzthewall','flyhighpizza','xephycs','flying_lizardd','cjprezas','llandroll','sparhu','warlordshenpai','clubloose','restlessfist','0r4ngenm4ul','thebigjakester02','jewerfyr','turtle2910','jugadoravanzado','ryder654','maketsi','dominik336','torsep','ninmarlo','apap04','mat2011ki','mikas_123','pippelipeikko','randomusername1035','wopay','kawaiibunn','mr_springford','thebulidingduck','phant0mdanc3r','knifeedge3','ionkozmos','nurkje','itzsyntrax69','jamfdcola','erykgaming','biogamer555','cyberboter','kresh42','vengefoolone','theschoolnerd','jtmonie29445','hizzax1','tikal93','evrathesnake1','bennaber','chasetheracer','ikexero','ruksak2k6','hanakotobai','zealcoition','quicksilverpro','lexbahnic','64thshadow','iluminatskanadvlada','tadzio21','senzx',
	'odakab','bernd_beispiel','ricardosanchezinthehouse','darkshadownice','beastie_23','titusde','yomalolu','serpentron','zloynord','hammerofwrath','popperik','felipezgz','felipe794','tipunitedcreator','aydenpato','dunlopmzg123','vova7777','reuess48','lucariaa','feels64','mydickcostalatenightfee','davis11129','peterhawthorne','thenumber1intheworld','chosen_bacon122','therealkonq','kino21','giantfart777','genkidot','aidenwilkin','devilwasbad1','pugglerocker','atm4life79','rolex282','chaossaii','exxiety','galaxymods2016','mainbreach99','jamie86htid','gintoki530d','tokyo_ghoul_9','diegobellinzonalucapeppe','wentatt','itsdende','vck29ed','gokulove23','crunged','gigihz123','freshfluffybuns','jamtagee','xghost_dustx','mexicodancer','t_echet','ileftforvacation','brandelium','mauserek','hazard67','russian_mafia1376','fobosus','we_love_kebab','maciek10545791','supermax1993','der_fugen','znx1337','kingblacky13','samsheff','little_hecto','dreamusic23','anthonycool12','yub33','kyborgy','nemanja01nikic','bluntside','jamboytheone','drylant','xaciyatmaz','west__1','sgtjethro2287','krandles89','monkeycando','omegacorpse38','ilnicari','vali_fuv','meme25337','rem_weeb','halfhort','sup12421','piglet13337','ptkr0','komiksti','vaultboyy','rxicgaming','swegumbre74','khyrin1','guigodalm','techno671','irandyjg','thearmandas','mickster1995','mrghuss','opxsmiley','fissfortune','scarfhead1400','ithro','pureblue8','bence555','tony_aj','p1ttbwl','oraclexo','whynogood','bigsmokey420','sugwu123','exju','majdoofus','likelv123','cripledjunky','thevolkywalker','kami1178','klevente','xxdodogamerxx231','munitis1','karowojtyla','rrjust1k','ruroshaggy','robert_ml','badboy50087','screwurmom5218','tjw4rd85','nickcheese','vibuthi','fryslanterp23','mrdoggydogg','clarkr16','inhumanvesayi','slwchoppa','therealmikasaackerman','itsluismane','ghaith_yt','who_needs_names_amirite','josu___','georgevets','roycekrispies','grandson_gary','betallion','tueffective','josephvillavicencio','marquitosbr88','luckysr20','leek04','nnothinggg','kazaidani','teahustler','zappsimon','velocitydezignz','foxshot01','poini94','flyingduckog','yox_yox','tamas227465','relenax','darkbonesgx','taylor65123','mista101uk','poormillionaire','seroux98','depressed_gu','woodcutlvl','mafaka_228','mrrealitygamer','nr1bodybuilder','thefenii','collegeblock580','chopper64','fitzelele','bebeto1324','nesimow','koopatroopa34_','agunheadpanpa','rauchverbot','c0f1','pete_7952','arceus_bot0','johnplaysgames1234','loldogs15246','mammoth673','reaperactualxv','ocambridge','mjester7','lowstanse','stephaniegf','ideluxie','likonteno','fandestroyera2','kbaha38','the18k','khulatej','pipewildo','apostlethal','dayn_c_chata','milkman_33','amordeculo','dermannderkann2','jmstyles','retribution386','slyon16','reallykcapp','amgking','zarduin','h1n69','maarkcsizmas','welshy4493','plasma000001','james6990','moduki1','drawingwolf','bloodarcher43','gerikember','rober2002','atmos_alt','overflow_1911','deniglitsch121','frytki15','silverfoo805','danika0809','sipan_krgl00','djbigmack','wrboismb','runescaper68','gallamaster','bambusinho11','nolifer42','nickboy44','whiteowl7890','elmashp23','ltbuster','petarrandjelovic','cappy_ru','daniel_arsenal4lyf','robensate','dooplicated','mc_nudelwasser','shorty__27','gamingburrito27','nath_mac','sannu_____','mtbeatz','cilleyperson','heelnate','dale98anderson','zygis644','drozzzze','mellow____','jamikiller19','rushsoundz','misterpost','kotei_0qi','whosthaaboss','gaylude','anthonyb244','azn5','cg_adam','friisky213','shift__xd','basedfrosty','rouslan_86','unknownboy922','thelurkerer','artimusthered','m1n1m4l_gaming','aidanquinn2003','nezoflife','arvinace','ice__cube100','3hraad','t0m3r','sublime25','twofiv','splaxest','namesledavid','informer3gg','letspachon','xnikobelico95x','endipls','haksu','karmadee','30cents','eatveg','noxtuk','meynameisjefferson','amarion23','gamerguymike','bobvargas','proxykiller23','swan2745','lowsosa0','fomekk','itz_boss44','berke466','jasfacef','fattymatty1996','shockbladebg','schmooodz','m00ng00u_kl','omega3rd','plsdiealready','gamemaniac1233','trevormontoya','pacifistuk','bynor1','irazerjd','cleooon','callmebarney','dylangettys007','tetraxz','westhiemertor','averagegamer002','dacabbage700','headcheeseeater','matmcelfreshh','megadiga2','m00ng00u','rain_csgo','dentistguba','szx_xzs','sheepgamer8','ajv171','psyqomassiva','g_mancz','xtragedy','mulv9','sweetpotato33','ohchetlol','deft_player','dadoodle27','ma19m','pmrox529','nowhales','konmar19','d34th3r','lukipaluki','alwaysyobrother','pleb_games','swoopaehl','totopiaaa12','decently_playing_games','realgamer888','sadboyfluff','craigtallica','veliens','kiko185','geto_m1ntty','the_actual_bbogz','trilldabs','doctordanger','chel5e4','nxberry','tayz_bunny','rexxtard','ludacroustv','kkona_niffy','jino1988','santiagorozo145','jessec78','sftwbnah','dvvbs','dead_gamingtv','csiapok','fssx','mcmuffinii','tuongdinhnguyen','joshisswiftor_one','arceusczech','mryellowducky','i_luv_smol_doggo','megamiloszek','meowstrosity','trollpotato96','gunslinger2319','blackjesus79','notsosuperhero','ado9992','russian__bias','bpev','eltarrodemiel','psychocreepers2','kokoaxe','sleeper4lyf','king_swizz_','psychelegy','matuzu','buragoz7','tr3nk0','oxu24','doinstreams','sawyer_tom','suphax','lil_tiki286','vicheli_','timmymca','thanasaras585','wopgopprivet','burakman122','mauzis','struming188','mrsupermanakamartis','i_was_banned_here','mr_mariuus','waypoint2','heliscooper0312','yurilowell1','whitetaur','fuflijniy','reece210','ewan_russell','huntspikeontwitch','jiksanbg','mightypootisfish','bonusxbox','canthandlethesekappas','mrmatiz2','delvakiin','lochnessmonsterr','wingwalker56','chomikpl7','dicksmaster','gustavosooker','andrethaprodigy','thekenmatax','foxyvd','jaketheviking01','d3f3nd3r113','thasolidjake','jhin__','skellyhell','eldin69','kerm66','popofosho113','loyka32','punstartracer','bootymenace','x_el_chapo_x','roryjosh','tonicka','jdjdbbdbdjeke','cluster616','snake_797','palitomendez','scottynoakes99','pilosh','drezandrez','marksmanpw','cashwaster','wendkarrz','sans_theskeleton1','masterseiko','brka222','mrbasswarrior1','begus001','miigues','king_of_silvers','al162','niohz','doggi1337','mezzlehh','x_meme_','berkaycihan','naroidgamer','whaaam8','razvan587','glodstrat','randomgamessk','bluecard03','suprasonic1','relampago_markinhos','menace2society20','masonmckinney520','alexarcs_','deverienq','realcanyongaming','shino332','mikeey94','two_number_9','xraygamesxx','turkroyal','slayerwithcheese','mixerlv','ohkeys_','bloodlove12','remecist','tombyrne85','marccusb','joelmakern7','juanpotato300','ireol','havin_a_boondoggle','cwestpro','trutopdog','pinkdarkmagiciangirl','arckmad','shaii_scorpio17_17','deadbunn','frankwhite0000','corvettebrostreaming','mitins','calcetinvolador','sousaa17','folieadeu','yusuftheman','jezkk','tribunosdievas','steamedxd','wraethous','illuminati130400','jasondogham','mamasugarback','vladaspirit','romanpearce69','supernovafalcon','soulstriker15','lisabadcat','queryhell','sooslikz','jakeisgr8talt','byakuya41','somi00','axe2pl','klereex','nitzgo','cybeeworld','denederlandsetrucker','sp1zz','ixon_666','notedpenguin668','hunter1536','thinnedringo','dopeeeeeeeeeeeeeeeeee','mufango','lazylegend77635','krutais05','marfu999','mrpoka07','project2001','pseol','f493fh348f','cadlerr','sidneyrl','adil7mansour','bloess1337','superfino666','anthonyg_97','suksi123','josh2k2','philm2291','sconlin_','duskete','froomkar','visanero','elonrogolofoi','yarchikoz','samejacobtbh','aleksi420','barneymk','itsshannonnx3','mousyfin','lukeklutz','thehazzahazza','killer_zomben','bumsikas','sevalentine','roflmaster45t','shadz76','restlesssheep','mustiraikkonen','arcanine878','chrisog__','xdjbatteryx','remierb','andrej_is_the_guy','commistance','maikelheberle','leshenka228','zerrakor','juubeithehoobae','olut_makkara','rafarastafarii','hypez_7','edgarsip','o0xman0o','kawaii_agro','twits1234','iceimglas','flyin_high72','comrade_michael','diesl123','notcreativebush','krut514','y2jj3000','bataori','imjeflol','horizononfire','wucko07','ssbmkymatic','ardiddy','danrullez','bladesoulx','coalchris','le_ninjaaj','iicelerium','fluorumm','heyandreww','impdevimpdev','wychu_','lukazas1945','niklebust','kevinbeshiri1','j0rdiath','seroyale','junsdolphin','jshepperd','unknown_loco','bxx88','berone56','cruz_wide','rumundo','luccccaa','paqoloo','jarsko2','illuminati_confirmedd123','jaco9862','fx__enzet_krul_kalisty','swiftydeal','eternal_beginner','tazzeiros','fillefloow9898','kingsc7','flametrowler','selteeck','naimadeoo','officialrayder','daniksz','expensivedirt','savage_will','zsh1015186813','danika68','manucow','shaun107','nerkec','everdreen','letspl','strykie','dogor_97','reflexstyle','machinistnick','savage24444','n0thsa','englishsnowdropz','dr_____zoidberg','vengiz1','thegrimness','superpypok','elgrando_smokio','dooba97','ssteel_','akiyama_wataru','cool4ewer','vujke22','megatron990','t1nkerman','cavsgm2','missnohand','flyingfireturtle','thisisbarelyalive','knicksquad','skwte','mercer69','maktaro','stimpack__','cnayuoraedtihs','throne28','uhad2dowasfolowdamtraincj','evolutionofwaffles','lzzygura','moothing','nebraska034','luckydicepl','saadjilani','duifjeroekoe','zaldarf','neverwinterosu','423r07','mentallychallangedpanda','ro257','fernandoribss','gigercounter','23banzaj','denny223','fckyou_hugo_iloveyou','gustavokmargos','mrsam18','hamashcimann','diegotellez24','fadedcartoonz','taison13','blacksalami01','avex76','nicklovesjapan','kingdomofrust','etzadla','sbytschkow1','dedeleedo','halo222222','lucidme','pawejax1','alpine_q','grinleinvaat','dym_ma','el_spinz','aboloftzeke','xxyournamsxx','villas15','unsedelement','igethornywhenieatdonuts','yeezus_10','goni_d_greek','sethirek','rollhiminsomepigsheet','dejjwidd','mckeown9919','schurik124','lisannart','jakubgrelaisaniguana','nix559','wiidragon','bu11etuk','buddhastoop','domino29022','igarmarosnivy','woozie_one','bikepf','thewaterlord27','speedfast12','gvasian','sprayosnickers','rash808',
	'victorphone','oininja','i3u77er','strongwitherwin_was_taken','prabhu007','thebucketochum','happyenderr','takun112','master1427','dingomypingo','thaossss','brotato2525','czosnekdopalenia','thegoodrng','bastiq_','ascarx90','xwunderbar8','ocelotluvzyew','battleaxe854','fuzrawry','samuelczxl','redeemed_killa','hobocode','also_know_a','yokapl','durszlaczek','trxvis_scott','idocologist','fluffykelda','k_rd','emmet_jatszik','its_exclusivetv_','root_of_all_evil','tomika5201','alexpain24','sons_of_liberty_75','nowlf','ping_boi','hypernoova','mr_haraa','thebassdroper','dziomal666','mrsnicegrl','random1zer','derwahrelude','dragoka','terrtail','goofirng','balorpunk','munche_','e09119271','bornasmidlanerx','monkey2402','pterms','kurtisxax','wolfneck179','smorgassbord','frontier_psy_chiatrist','ppredatorek','tarek5314','fox7394','pettcrouch','itzryda','terasss2','neeoksis','golf_waang','p1x3l_g4m3r','dakyccc','khenks','grizzzlybob','nobsqaudrblx','game_king_1905','johnny329','sabriyialibobaskan','zadonkilluminati','monztay','noskillznokillz','gamerstudietlive','bengil12','insane_insanity_official','theonlysphinx','choihry','nykstr_gg','dutchplayer1985','emre311905','reddoik','dovakill59390','unzengasfumes','fr_yoki','sippinteainyahood','setw88','casperthegodcat','iiroar','the_uwe','jesusofrice','guanfacin24','bomgamerjunior','big_dog_stretch','tryhardbd','omeletedufromago','gitarasiemanowicz','xxlaingyxx','adornan98','roman7275','lasertrentgaming','andriy53','theroca25','the_friendly_beastyt','iliketurtles0505','yapedr','vantheman11','mmaguro','undertheskin13','hollerboys9702','cozmicpanda','hunterhearsthelmsleyhhh','ludaisni_99','libmar96','jacobn56','xin_konchiru','gtasasasa','rottenzefir','rambo0070','poopsinspace','joannathegirlgamer3','xxtactlckzzxx','maxcoins','putzeimer20','warlockemci','maderfakerek','duco_hilt','mynameisjeff1375','zam_wow','basanaruga','vectralpb','ayy_jpeg','yourboyugwu','y6uballko','maldamba69','rivenin_pipisi','jurkoking','nemko111','badbessie','rhaynz','mahir2529','carmain2k17','expertzgamer','uriel1313','pudglet','ryderr22','keeperr_bot','pnordahl','tryykimies','damaggioo','rhi4999','22222pac','jooman_','gungnirze','budd1227','pesa_','plugs_not_drugs','swissnorsk','monopolypl','khoi7895','skullkid344','mausmanno','icyyaf','satanspeedruns','thetwitchtdm','burningbiird','randallskillz','chris_long_jack_and_hike','1saby','wwcerberusww','mrscreen99','lima0_','nikkigames11','bauer_613','jakeasd96','gunswordandshieldx','awsumone12','k0rra__','vixtor666damn','spottedrc89','xxx_markus_cz','realjerryseinfeld','darksoulforever1','saymon321','megaearthquake','drag0nrose','unknownflight','marauder_boy','nightlibragamingyt','trix_mag','lordsynot','mewrius','armoredbasher','ellisix','ghgplayzs','the_ice_2017','itsmelesto','lkkoukis00','itouchhd','romaa4445','luminousfuture','elpacheco_7890','perikiyoxd','phanty133','sanehrhardt','slimrizlaplease','ta72','latreal223','sfriniks','snehansh','killerz197','laamicat','hatory777','memedreamteam1','john_p13','rogergabor','gamingimage','pavstro','bubeyo','tokimustaine','hadenboggess','cptmccoolfish','the_pac119','pufedu','baksiu58','tincho_13l','notsosilentkilla','gamesslav','itscheezehead','ebordelo','jbradders','whatdaahel','zapaled','jeeeraaa','metinemirozcan','blakebladeson','simplemovez','kinder_joys','exp400','grizliuko','suprasocks','totalbudderepicness','dovla19','ayaakyahh','sirhc85','nightmaredranz','veekay515','ac15_','windsofkappa','ethanneru','akzzzo','buckel_lp','matrix735735735','ax3l1','starxdefuze','derflashun_','the_5th_rider','pearsquared','vanter_','ass_technician','deroesifloo','razor52hun','meme_sauce_','spitfirefam','akuma_23','kermit_frog530','searchinator308','voiceless7','nosupermaan'];

	console.log(arr.length);

	var i;
	
	//lifetime stats
	for (i = 0; i < arr.length; ++i) {
		(function(i){
			red.lrange([arr[i] + ":last", 0, -1], function (err, reply) {
				if (err) {
					result = "!! Error accessing cache";
					console.log(err);
				} else {
					if (reply.length > 0) {
						var total_wins = 0, j, nick = arr[i];
	
						//lifetime stats
						for (j = 0; j < reply.length; ++j) {
							var value = parseInt(reply[j]);
							if (value > 0) total_wins++;
						}
	
						//store spinking
						if (total_wins > 0){
							red.zincrby(["!spinking", total_wins, nick], function (err, reply) {
								if (err) console.log(err);
							});
						}
	
						console.log(nick+ ' ' + total_wins.toString());
						//result += nick + ' ' + total_wins.toString() + '\n';
	
					} 
				} // end if err
				//console.log(result);
			}); //end lrange
		})(i);
	}
			
	//console.log(result);
	res.send('hotovo');

};