
var mysql = require('mysql');

var pinbaSchema = require('../utils/pinbaSchema');
var schema = require('./schema.json');

pinbaSchema.setPercentiles(
    schema.reports.percentile1,
    schema.reports.percentile2
);

var mysqlClient = mysql.createConnection({
    host: 'pinbajs.mlan',
    user: 'pinba',
    password: 'pinbapass7',
    database: 'pinba'
});

var sequence = Promise.resolve();

for (var name in schema.reports.tables) {
    sequence = sequence.then(pinbaSchema.createReport.bind(null, {
            mysqlClient: mysqlClient,
            tablePrefix: schema.reports.table_prefix,
            name: name,
            tags: schema.reports.tables[name].tags
        }))
        .then(function (name) {
            console.log('created', name);
        });
}

sequence.catch(function (err) {
    console.error('failed', err);
}).then(function () {
    mysqlClient.end();
});
