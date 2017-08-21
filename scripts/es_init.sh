curl --user "elastic":"changeme" -XPUT 'localhost:9200/twitch_test?pretty' -H 'Content-Type: application/json' --data-binary "@es_init.json"

curl --user "elastic":"changeme" -XPOST 'localhost:9200/_aliases?pretty' -H 'Content-Type: application/json' -d'
{
    "actions" : [
        { "add" : { "index" : "twitch_v3", "alias" : "twitch" } }
    ]
}
'
