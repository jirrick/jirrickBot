use warnings;
use strict;
use Irssi;
use Irssi::Irc;
use Search::Elasticsearch;
use LWP::UserAgent;
use Time::HiRes qw(time);
use POSIX qw(strftime);

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

my $es;
my $ua=LWP::UserAgent->new;

sub connect_es {
    my $host = Irssi::settings_get_str('es_host');
    my $port = Irssi::settings_get_str('es_port');
    my $node = $host . ':' . $port;

    Irssi::print("Connecting to ES: " . $node);

    return Search::Elasticsearch->new( nodes => $node) || Irssi::print("Can't connect to ES!");
}

sub write_es {
    my ($user, $message, $target) = @_;

    my $time = time;
    my $microsecs = ($time - int($time)) * 1e3;
    my $timestamp = sprintf("%s.%03.0f", strftime("%Y-%m-%d %H:%M:%S", gmtime($time)), $microsecs);

    $es = connect_es() unless $es;
    $target =~ s/[^[:alnum:]_-]//g;

    $es->index(
    index   => 'twitch',
    type    => 'public_chat' ,
    body    => {
        channel => $target ,
        user    => $user ,
        content => $message ,
        timestamp   => $timestamp
    }) || Irssi::print("Can't log to ES!");
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
        $ua->get($url);
        #my $res = $ua->get($url);
        #Irssi::print($res->content);
    }
}

sub log_me {
    my ($server, $message, $target) = @_;
    write_es($server->{nick}, $message, $target);
}

sub log {
    my ($server, $message, $user, $address, $target) = @_;
    write_es($user, $message, $target);
    check_mention($server->{nick}, $message, $user, $target);
}

Irssi::signal_add_last('message public', 'log');
Irssi::signal_add_last('message irc action', 'log');
Irssi::signal_add_last('message own_public', 'log_me');
Irssi::signal_add_last('message irc own_action', 'log_me');

Irssi::settings_add_str('twitch_bot', 'es_host', '192.168.1.2');
Irssi::settings_add_str('twitch_bot', 'es_port', '9200');
Irssi::settings_add_str('twitch_bot', 'sp_host', 'http://api.simplepush.io');
Irssi::settings_add_str('twitch_bot', 'sp_key', 'dsPtwi');
Irssi::settings_add_str('twitch_bot', 'bot_name', 'hugo__bot');
