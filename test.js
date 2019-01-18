var wait = require('wait.for');



var mysql = require('mysql');
var conn = {
	host	 : 'db.mis.kuas.edu.tw',
	user	 : 's1103137124',
	password : 'T124714679',
	database : 's1103137124'
};
var connection = mysql.createConnection(conn);
connection.connect();

/*
function foo(callback) {
	callback();
}

function bar() {
	var A = 1;
	foo(function() {
		A = 2;
	});
	console.log(A);
}
bar();
*/
/*
for (var i = 0; i < 100; i++) {
	var post = {
	id: null,
	name: 'Hello',
	amount: 102,
	date: '1996-05-18'
	};
	var query = connection.query('INSERT INTO test SET ?', post, function(err, result) {
		
	});
	console.log(query.sql);
};
*/





function runQuery() {
	console.log('start');
	var d = wait.forMethod(connection, 'query', 'SELECT * FROM test ORDER BY id DESC', function(err, rows, fields) {
		if (err) throw err;
		var i = 0;
		rows.forEach(function(row) {
			//console.log(i++, row.name);
		});
	});
	console.log(d);
}
wait.launchFiber(runQuery);


//console.log("OK");
//connection.end();




