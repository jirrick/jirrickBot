IRSSI is used to connect to twitch chat (and select which channels to follow)
PERL plugin intercepts every message and directly logs them to Elastic Search v1.7 running on port 9200
Plugin also parse messages and if detects a command then forwards request to Node.js app runing on port 3000
Node app is using Redis 3 cache running on port 6379 to speed up responses (no direct requests to ES)
Response is returned to IRSSI and posted

Some custom code was used to iterate over ES chat history and process all messages to fill in Redis cache (now probably lost)
