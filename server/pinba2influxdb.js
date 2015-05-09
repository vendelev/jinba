
var tpl = require('./tpl');
var prettyMs = require('pretty-ms');

var INSERT_BUCKET_SIZE = 10000;

function debuglog(msg)
{
    console.error(new Date().toISOString() + ' ' + msg);
}

function convertStructure(table, tags, values, row, result)
{
	var name = [], i;
	for (i = 0; i < tags.length; i++) {
		name.push(tags[i]);
		name.push(row[tags[i]]);
	}
	var strName = name.join('.');

	for (i = 0; i < values.length; i++) {
		result.push({
			"name" : strName + '.' + values[i],
			"columns" : ["value"],
			"points" : [
				[row[values[i]]]
			]
		});
	}

	return result;
}

function insertData(influxClient, table, rows)
{
    influxClient.setDatabase(table);

    var sequence = Promise.resolve();

    var i = 0;

    while (i < rows.length) {
        var series = {};
        for (var j = 0; j < INSERT_BUCKET_SIZE && i < rows.length; i++, j++) {
            series[rows[i].name] = [{value: rows[i].points[0][0]}];
        }

        sequence = sequence.then((function(series) {
            return new Promise(function(resolve, reject) {
                influxClient.writeSeries(series, function (err, body) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(rows.length);
                });
            });
        }).bind(null, series));
    }

    return sequence;
}

function selectData(mysqlClient, table, tags, callback)
{
    return new Promise(function(resolve, reject) {
        var select_data = "SELECT {#tag}{.}{@sep}, {/sep}{/tag}, hit_per_sec, timer_value/hit_count as timer_avg, timer_median, p75, p95 from {table_prefix}{table}";
        var query = tpl(select_data, {
            table: table,
            tag: tags
        });

        var values = ['hit_per_sec', 'timer_avg', 'timer_median', 'p75', 'p95'];

        mysqlClient.query(query, function(err, rows, fields) {
            if (err) {
                reject(err);
                return;
            }

            var result = [];
            for (var i = 0; i < rows.length; i++) {
                convertStructure(table, tags, values, rows[i], result);
            }

            resolve(result);
        });
    });
}

function createDB(influxClient, dbName){
    return new Promise(function(resolve, reject) {
        console.log('% create db=' + dbName);
        influxClient.createDatabase(dbName, {}, function (err) {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

function createInfluxDatabases(influxClient, reports)
{
    return new Promise(function(resolve, reject) {
        influxClient.getDatabaseNames(function(err, dbNames) {
            if (err) {
                reject(err);
                return;
            }

            resolve(dbNames);
        });
    }).then(function(dbNames) {
        var sequence = Promise.resolve();

        for (var name in reports.tables) {
            var dbName = name ? reports.table_prefix + '_' + name : reports.table_prefix;
            if (dbNames.indexOf(dbName) === -1) {
                sequence = sequence.then(createDB.bind(null, influxClient, dbName));
            }
        }
        return sequence;
    });
}

function exportJob(mysqlClient, influxClient, dbName, tags) {
    var job_start = Date.now();
    process.stdout.write('% ' + dbName);
    return selectData(mysqlClient, dbName, tags).then(function(result) {
        return insertData(influxClient, dbName, result);
    }).then(function(n) {
        process.stdout.write(' ' + n + ' points in ' + prettyMs(Date.now() - job_start) + '\n');
        return n;
    });
}

function exportData(mysqlClient, influxClient, reports)
{
    var sequence = Promise.resolve();

    var total = 0;

    for (var name in reports.tables) {
        var tags = reports.tables[name].tags;
        var dbName = name ? reports.table_prefix + '_' + name : reports.table_prefix;
        sequence = sequence.then(exportJob.bind(null, mysqlClient, influxClient, dbName, tags)).then(function(n) {
            total += n;
        });
    }

    return sequence.then(function(){
        return Promise.resolve(total);
    });
}

module.exports = {
    createInfluxDatabases: createInfluxDatabases,
    exportData: exportData
};
