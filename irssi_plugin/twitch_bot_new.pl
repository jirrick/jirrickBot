use warnings;
use strict;
use Irssi;
use Irssi::Irc;
use JSON::Tiny qw(decode_json encode_json);
use HTTP::Tiny;
use Time::HiRes qw(time);
use POSIX qw(strftime floor);

use vars qw($VERSION %IRSSI);

$VERSION = "1.0";
%IRSSI = (
    authors     => "Jirrick",
    contact     => "jirrick\@outlook.cz",
    name        => "twitch_bot",
    description => "Logs chats to an Elasticsearch.",
    license     => "BSD",
    url         => "https://github.com/qbit/irssi_logger",
    );

my $http = HTTP::Tiny->new();
my $api_url;
my $es_url;

sub get_es_url {
    my $value = Irssi::settings_get_str('es_host') . ':' . Irssi::settings_get_str('es_port');
    $value .= '/' . Irssi::settings_get_str('es_index'); 
    $value .= '/' . Irssi::settings_get_str('es_type');

    Irssi::print('Using this ES URL: ' . $value);
    return $value;
}

sub get_api_url {
    my $value = Irssi::settings_get_str('api_host') . ':' . Irssi::settings_get_str('api_port');
 
    Irssi::print('Using this API URL: ' . $value);
    return $value;
}

sub write_es {
    my ($user, $message, $target) = @_;

    my $time = time;
    my $microsecs = floor(($time - int($time)) * 1e3);
    my $timestamp = sprintf("%s.%03.0f", strftime("%Y-%m-%d %H:%M:%S", gmtime($time)), $microsecs);

    $target =~ s/[^[:alnum:]_-]//g;

    $es_url = get_es_url() unless $es_url;
    $api_url = get_api_url() unless $api_url;
    
    my $req_url = $api_url . '/' . Irssi::settings_get_str('api_parse');
	
    my $data = encode_json {
        'channel' => $target ,
        'user'    => $user ,
        'content' => $message ,
        'timestamp'   => $timestamp
    }; 

    #Irssi::print($data);	

    my %options = (
         headers => {'Content-Type' => 'application/json'},
         content => $data 
        );

    my $es_response = $http->request('POST', $es_url, \%options);
    my $api_response = $http->request('POST', $req_url, \%options);
    #Irssi::print($api_response->{content});
}

sub check_mention {
    my ($nick, $message, $user, $target) = @_;

    if ($message =~ /\Q$nick\E/) {
        $message =~ s/[^[:alnum:] ._-]//g;

        my $url = Irssi::settings_get_str('sp_host');
        $url .= '/send/' . Irssi::settings_get_str('sp_key');
        $url .= '/' . $user; 
        $url .= '/' . $message;

        if ($user eq Irssi::settings_get_str('bot_name')) {
                $url .= '/event/spin';
            } else {
                $url .= '/event/mention';
            }

        #Irssi::print($url);
        $http->get($url);
    }
}

sub command {
    my ($server, $message, $user, $target) = @_;
    if ($target eq '#hugo_one'){
    if (($message =~ /^!last10/igm) || ($message =~ /^!oceans10/igm)) {
	$api_url = get_api_url() unless $api_url;
	
	my $nick = $user;	
	my $cmd;

	my @parts = split(/ /,$message);
	my $size = @parts;
	if ($size >= 1) {
		$cmd = $parts[0];
	}
	if ($size > 1){
		$nick = $parts[1];
	}
	
	my $req_url = $api_url . '/' . Irssi::settings_get_str('api_cmd');	
	$req_url .= '/'. $cmd . '/' . $nick;
	#Irssi::print($req_url);	

	my $api_response = $http->get($req_url);
	#Irssi::print($api_response->{content});	

	if ($user eq "jirrick"){
	   sleep(1);
	}
	
	my $witem = Irssi::window_item_find($target);
    	$witem->{server}->command('MSG '.$target.' '.$api_response->{content});
    	}
    }
}

sub log_me {
    my ($server, $message, $target) = @_;
    write_es($server->{nick}, $message, $target);

    command($server, $message, $server->{nick}, $target);
}

sub log {
    my ($server, $message, $user, $address, $target) = @_;
    write_es($user, $message, $target);

    #check_mention($server->{nick}, $message, $user, $target);
    command($server, $message, $user, $target);
}

Irssi::signal_add_last('message public', 'log');
Irssi::signal_add_last('message irc action', 'log');
Irssi::signal_add_last('message own_public', 'log_me');
Irssi::signal_add_last('message irc own_action', 'log_me');

Irssi::settings_add_str('twitch_bot', 'es_host', 'http://192.168.1.2');
Irssi::settings_add_str('twitch_bot', 'es_port', '9200');
Irssi::settings_add_str('twitch_bot', 'es_index', 'twitch');
Irssi::settings_add_str('twitch_bot', 'es_type', 'public_chat');
Irssi::settings_add_str('twitch_bot', 'sp_host', 'http://api.simplepush.io');
Irssi::settings_add_str('twitch_bot', 'sp_key', 'dsPtwi');
Irssi::settings_add_str('twitch_bot', 'bot_name', 'hugo__bot');
Irssi::settings_add_str('twitch_bot', 'api_host', 'http://192.168.1.2');
Irssi::settings_add_str('twitch_bot', 'api_port', '3000');
Irssi::settings_add_str('twitch_bot', 'api_cmd', 'command');
Irssi::settings_add_str('twitch_bot', 'api_parse', 'parse');