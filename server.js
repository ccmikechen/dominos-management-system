var express = require('express');
var app = express();
var http = require('http').Server(app);
//var io = require('socket.io')(http);
var c = console;

var busboy = require('connect-busboy');
var fs = require('fs-extra');
var session = require('express-session');
var bodyParser = require('body-parser');
var rightPad = require('right-pad');
var dateFormat = require('dateformat');
var regex = require('./regex');
var ms = require('./ms');

var mysql = require('mysql');

var conn = {
	host	 : 'db.mis.kuas.edu.tw',
	user	 : 's1103137124',
	password : 'T124714679',
	database : 's1103137124'
};

var debug_mode = 0;

var query = function(sql, callback) {
	var connection = mysql.createConnection(conn);
	connection.connect();
	connection.query(sql, callback);
	connection.end();
};

var insert = function(sql, post, callback) {
	var connection = mysql.createConnection(conn);
	connection.connect();
	var sql = connection.query(sql, post, callback).sql;
	if (debug_mode == 1) {
		console.log(sql);
	}
	connection.end();
}

var createSingleFieldError = function(name, status) {
	return {
		fieldErrors: [
			{
				name: name,
				status: status
			}
		],
		data: []
	};
};

app.use(busboy());
//app.set('trust proxy', 1);
app.use(session({ secret: 'keyboard cat', cookie: { maxAge: 600000 }}));

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function(req, res, next) {
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	var date = new Date().toISOString().
				replace(/T/, ' ').
				replace(/\..+/, '');
	c.log(date + ' ' + rightPad(ip, 22) + ' > ' + req.method + ' ' + req.url);
	next();
});

// 轉址
app.use(function(req, res, next) {
	var url = req.url.split('?')[0];
	if (regex.dataUrl(url) != null) {
		next();
		return;
	}
	switch (url) {
		case '/login':
		case '/auth/login':
			if (req.session.account) {
				res.redirect('/index');
			} else {
				next();
			}
			return;
		case '/register':
		case '/auth/register':
		case '/fb':
		case '/auth/fb/login':
			next();
			return;
	}
	if (req.session.account) {
		next();
	} else {
		res.redirect('/login');
		return;
	}
});

var errorMap = {
	1: '請輸入帳號', 
	2: '請輸入密碼',
	3: '無此帳號',
	4: '密碼輸入錯誤',
	5: '帳號不可為空',
	6: '帳號長度不可多於20個字元',
	7: '密碼不可為空',
	8: '密碼長度不可少於8個字元',
	9: '帳號已被使用',
	10: '帳號不可包含特殊字元'
};

var productTypeMap = {
	little: '小',
	middle: '中',
	big: '大',
	set: '套餐'
};

// 網頁

app.get('/', function(req, res) {
	res.redirect('/login');
});

app.get('/fb', function(req, res) {
	res.render('pages/fbtest');
});

// 系統登入
app.get('/login', function(req, res) {
	var errMsg = errorMap[req.query.errorCode];
	res.render('pages/login', {
		errorMessage: errMsg || ''
	});
});

// 登入
app.post('/auth/login', function(req, res) {
	ms.verifyLoginInfo(req.body, function(id) {
		req.session.account = id;
		ms.queryAccount(id, function(err, rows, fields) {
			if (err) throw err;
			if (rows.length > 0) {
				req.session.employeeId = rows[0].employee_id;
				req.session.employeeStdId = rows[0].employee_std_id
			}
			res.redirect('/index');
		});
	}, function(code) {
		res.redirect('/login?errorCode=' + code);
	});
});

// Facebook登入
app.post('/auth/fb/login', function(req, res) {
	ms.verifyFacebookId(req.body.userID, req.body.accessToken, function(data) {
		ms.verifyFacebookLoginInfo(data.id, function(id) {
			req.session.account = id;
			ms.queryAccount(id, function(err, rows, fields) {
				if (err) throw err;
				if (rows.length > 0) {
					req.session.employeeId = rows[0].employee_id;
					req.session.employeeStdId = rows[0].employee_std_id
				}
				res.redirect('/index');
			});
		}, function() {
		});
	}, function() {
		c.log('error : ' + req.body.userId);
	});
});

// 登出
app.get('/logout', function(req, res) {
	req.session.account = undefined;
	res.redirect('/login');
});

// 註冊帳號
app.get('/register', function(req, res) {
	var errMsg = errorMap[req.query.errorCode];
	res.render('pages/register', {
		errorMessage: errMsg || ''
	});
});

// 註冊帳號
app.post('/auth/register', function(req, res) {
	ms.verifyRegisterInfo(req.body, function() {
		res.redirect('/login');
	}, function(code) {
		res.redirect('/register?errorCode=' + code);
	});
});

// 首頁
app.get('/index', function(req, res) {
	checkPermission(req, res, 0, function(data) {
		res.render('pages/index', {
			title: '首頁',
			username: data.name || '訪客'
		});
	});
});

// 存貨資料
app.get('/stock', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/stock', {
			title: "存貨資料",
			username: data.name || '訪客'
		});		
	}, '/');
});

// 進貨管理
app.get('/stock/purchase', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/purchase', {
			title: "進貨管理",
			username: data.name || '訪客'
		});	
	}, '/stock');
});

// 進貨單
app.get('/stock/purchase/order', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/purchase-order', {
			title: "進貨單",
			id: req.query.id,
			username: data.name || '訪客'
		});
	}, '/stock/purchase');

});

// 新增進貨單
app.get('/stock/purchase/create', function(req, res) {
	checkPermission(req, res, 200, function(data) {
		res.render('pages/purchase-create', {
			title: "新增進貨單",
			username: data.name || '訪客',
			employeeId: req.session.employeeStdId
		});
	}, '/stock/purchase');
});

// 存貨盤點
app.get('/stock/inventory', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/inventory', {
			title: "庫存盤點",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 盤點單
app.get('/stock/inventory/order', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/inventory-order', {
			title: "盤點單",
			id: req.query.id,
			username: data.name || '訪客'
		});	
	}, '/stock/inventory');

});

// 新增盤點單
app.get('/stock/inventory/create', function(req, res) {
	checkPermission(req, res, 200, function(data) {
		res.render('pages/inventory-create', {
			title: "新增盤點單",
			username: data.name || '訪客',
			employeeId: req.session.employeeStdId
		});	
	}, '/stock/inventory');

});

// 商品管理
app.get('/stock/product', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/product', {
			title: "商品管理",
			username: data.name || '訪客'
		});	
	}, '/');

});

// 新增商品
app.get('/stock/product/create', function(req, res) {
	checkPermission(req, res, 200, function(data) {
		res.render('pages/product-create', {
			title: "新增商品",
			username: data.name || '訪客'
		});	
	}, '/stock/product');

});

// 商品成分
app.get('/stock/product/ingredient', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		ms.queryProductImageUrl(req.query.id, function(err, rows, fields) {
			var imageUrl = rows[0].image_url || '/images/no-image.gif';
			res.render('pages/product-ingredient', {
				title: "商品成分",
				id: req.query.id,
				username: data.name || '訪客',
				imageUrl: imageUrl
			});	
		});

	}, '/');
});

// 新增套餐
app.get('/stock/product/set/create', function(req, res) {
	checkPermission(req, res, 200, function(data) {
		res.render('pages/product-set-create', {
			title: "新增套餐",
			username: data.name || '訪客'
		});			
	}, '/stock/product/set');
});

// 套餐組合
app.get('/stock/product/set', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		ms.queryProductImageUrl(req.query.id, function(err, rows, fields) {	
			var imageUrl = rows[0].image_url || '/images/no-image.gif';		
			res.render('pages/product-set', {
				title: "套餐組合",
				id: req.query.id,
				username: data.name || '訪客',
				imageUrl: imageUrl
			});
		});
	}, '/');
});

// 供應商管理
app.get('/stock/supplier', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/supplier', {
			title: "供應商管理",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 員工資料
app.get('/employee', function(req, res) {
	checkPermission(req, res, 200, function(data) {
		res.render('pages/employee', {
			title: "員工資料",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 員工排班
app.get('/employee/schedule', function(req, res) {
	checkPermission(req, res, 300, function(data) {
		res.render('pages/employee-schedule', {
			title: "員工排班",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 員工排班表
app.get('/employee/schedule/table', function(req, res) {
	checkPermission(req, res, 300, function(data) {
		res.render('pages/employee-schedule-table', {
			title: "員工排班表",
			username: data.name || '訪客',
			scheduleId: req.query.id
		});	
	}, '/');
});

// 客戶資料
app.get('/customer', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/customer', {
			title: "客戶資料",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 外帶訂單
app.get('/order/takeout', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/order-takeout', {
			title: "外帶訂單",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 新增外帶訂單
app.get('/order/takeout/create', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/order-takeout-create', {
			title: "新增外帶訂單",
			username: data.name || '訪客',
			employeeId: req.session.employeeStdId
		});	
	}, '/order/takeout');
});

// 查詢外帶訂單
app.get('/order/takeout/order', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		ms.queryTakeoutOrderInfo(req.query.id, function(err, rows, fields) {
			res.render('pages/order-takeout-order', {
				title: "外帶訂單查詢",
				id: req.query.id,
				isFinished: rows[0].finish_time != null,
				username: data.name || '訪客',
				employeeId: req.session.employeeStdId
			});
		});	
	}, '/order/takeout');
});

// 外送訂單
app.get('/order/deliver', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/order-deliver', {
			title: "外送訂單",
			username: data.name || '訪客'
		});	
	}, '/');
});

// 新增外送訂單
app.get('/order/deliver/create', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		res.render('pages/order-deliver-create', {
			title: "新增外送訂單",
			username: data.name || '訪客',
			employeeId: req.session.employeeStdId
		});	
	}, '/order/deliver');
});

// 查詢外送訂單
app.get('/order/deliver/order', function(req, res) {
	checkPermission(req, res, 100, function(data) {
		ms.queryDeliverOrderInfo(req.query.id, function(err, rows, fields) {
			res.render('pages/order-deliver-order', {
				title: "外送訂單查詢",
				id: req.query.id,
				isFinished: rows[0].finish_time != null,
				username: data.name || '訪客',
				employeeId: req.session.employeeStdId
			});
		});	
	}, '/order/deliver');
});


// 資料存取


// 存貨

app.get('/data/stock', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryStock(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});

app.post('/data/stock/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyStock(data, function(post) {
				insert('INSERT INTO material SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.queryStock(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}		
	});
});

app.put('/data/stock/edit', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyStock(data, function(post) {
				ms.updateStock(data.id, post, function(err, result) {
					ms.queryStock(data.id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}
	});
});

app.delete('/data/stock/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteStock(data.id, function(err, result) {
				res.send(output);
			});
		}
	});
});


//進貨

app.get('/data/purchase', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryPurchase(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				row.link = '<a href="/stock/purchase/order?id=' + row.id + '">' + row.std_id + '</a>';
				output.data.push(row);
			});
			res.send(output);
		});
	});
});

app.delete('/data/purchase/remove', function(req, res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deletePurchase(data.id, function(err, result) {
				res.send(output);
			});
		}
	});
});

app.post('/data/purchase/check', function(req, res) {
	var output = { data: [] };
	if (req.body.action === 'create' ||
	    req.body.action === 'edit') {
			
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyPurchaseElement(data, function(post) {
				output.data.push(post);
				res.send(output);
			}, function(err) {
				res.send(err);
			});
		}
	} else {
		res.send(output);
	}
});

app.post('/data/purchase/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var count = 0;
		insert('INSERT INTO purchase_order SET ?', {
			purchase_date: dateFormat(new Date(), "yyyy-mm-dd"),
			employee_id: req.session.employeeId
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			for (var i in req.body.data) {
				var data = req.body.data[i];
				ms.addPurchaseOrderDetail(id, data, function(err, result) {
					count++;
					if (count == req.body.data.length) {
						res.send({ status: 'success' });
					}
				});
			}
		});	
	});

});

// 進貨單

app.get('/data/purchase/order', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryPurchaseOrder(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
});

app.get('/data/purchase/order/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryPurchaseOrderInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
	
});

// 盤點

app.get('/data/inventory', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryInventory(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				row.link = '<a href="/stock/inventory/order?id=' + row.id + '">' + row.std_id + '</a>';
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});

app.delete('/data/inventory/remove', function(req, res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteInventory(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});

});

app.post('/data/inventory/check', function(req, res) {
	var output = { data: [] };
	if (req.body.action === 'create' ||
	    req.body.action === 'edit') {
			
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyInventoryElement(data, function(post) {
				output.data.push(post);
				res.send(output);
			}, function(err) {
				res.send(err);
			});
		}
	} else {
		res.send(output);
	}
});

app.post('/data/inventory/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var count = 0;
		insert('INSERT INTO inventory_order SET ?', {
			inventory_date: dateFormat(new Date(), "yyyy-mm-dd"),
			employee_id: req.session.employeeId
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			for (var i in req.body.data) {
				var data = req.body.data[i];
				ms.addInventoryOrderDetail(id, data, function(err, result) {
					count++;
					if (count == req.body.data.length) {
						res.send({ status: 'success' });
					}
				});			
			}
		});	
	});
});

// 盤點單

app.get('/data/inventory/order', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryInventoryOrder(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
});

app.get('/data/inventory/order/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryInventoryOrderInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});			
	});
});

// 商品

app.get('/data/product', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryProduct(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				if (row.type == 'set') {
					row.link = '<a href="/stock/product/set?id=' + row.id + '">' + row.std_id + '</a>';
				} else {
					row.link = '<a href="/stock/product/ingredient?id=' + row.id + '">' + row.std_id + '</a>';
				}
				row.type = productTypeMap[row.type];
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});

app.delete('/data/product/remove', function(req, res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteProduct(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});
});

app.get('/data/product/image', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		ms.queryProductImageUrl(req.query.id, function(err, rows, fields) {
			if (err) throw err;
			var url = rows[0].image_url;
			res.send({ imageUrl: url });
		});
	});
});

app.post('/data/product/image/upload/:id', function(req, res) {
	
	var id = req.params.id;
	var fstream;
    req.pipe(req.busboy);
	req.busboy.on('file', function (fieldname, file, filename) {
		var dirpath = __dirname + '/public/images/product/' + id;
		var filepath = dirpath + '/' + filename;
		c.log('Upload path:' + filepath);
		
		if (!fs.existsSync(dirpath)) {
			fs.mkdir(dirpath);
		}
		fstream = fs.createWriteStream(filepath);
		file.pipe(fstream);
		fstream.on('close', function () {    
			console.log("Upload Finished of " + filename);
			
			var imageUrl = '/images/product/' + id + '/' + filename;
			ms.updateProductImageUrl(id, imageUrl, function(err, result) {
				if (err) throw err;
				res.redirect('/stock/product');
			});
		});
	});
	
});

// 商品成分

app.post('/data/product/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var count = 0;
		insert('INSERT INTO product SET ?', {
			name: req.body.name,
			type: req.body.type,
			price: req.body.price
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			for (var i in req.body.data) {
				var data = req.body.data[i];
				ms.addProductIngredient(id, data, function(err, result) {
					if (err) throw err;
					count++;
					if (count == req.body.data.length) {
						res.send({ status: 'success' });
					}
				});
			}
		});	
	});
});

app.post('/data/product/check', function(req, res) {
	var output = { data: [] };
	if (req.body.action === 'create' ||
	    req.body.action === 'edit') {
			
		for (var key in req.body.data) {
			var data = req.body.data[key];

			ms.verifyProductElement(data, function(post) {
				output.data.push(post);
				res.send(output);
			}, function(err) {
				res.send(err);
			});
		}
	} else {
		res.send(output);
	}
});

app.get('/data/product/ingredient', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryProductIngredient(req.query.id, function(err, rows, fields) {
			if (err) throw err;
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
});

app.post('/data/product/ingredient/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyProductIngredient(data, function(post) {
			
				insert('INSERT INTO product_ingredient SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.queryIngredient(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/product/ingredient/edit', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyProductIngredient(data, function(post) {
				ms.updateProductIngredient(data.id, post, function(err, result) {
					ms.queryIngredient(data.id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.delete('/data/product/ingredient/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteProductIngredient(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});
});

app.get('/data/product/ingredient/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryProductIngredientInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});	
});

// 套餐組合

app.post('/data/set/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var count = 0;
		insert('INSERT INTO product SET ?', {
			name: req.body.name,
			type: req.body.type,
			price: req.body.price
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			for (var i in req.body.data) {
				var data = req.body.data[i];
				ms.addProductSetMeal(id, data, function(err, result) {
					if (err) throw err;
					count++;
					if (count == req.body.data.length) {
						res.send({ status: 'success' });
					}
				});
			}
		});		
	});
});

app.post('/data/product/set/check', function(req, res) {
	var output = { data: [] };
	if (req.body.action === 'create' ||
	    req.body.action === 'edit') {
			
		for (var key in req.body.data) {
			var data = req.body.data[key];

			ms.verifyProductSetMealElement(data, function(post) {
				output.data.push(post);
				res.send(output);
			}, function(err) {
				res.send(err);
			});
		}
	} else {
		res.send(output);
	}
});

app.get('/data/product/set', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryProductSetMeal(req.query.id, function(err, rows, fields) {
			if (err) throw err;
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});			
	});
});

app.post('/data/product/set/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyProductSetMeal(data, function(post) {
			
				insert('INSERT INTO set_meal_details SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.querySetMeal(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/product/set/edit', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyProductSetMeal(data, function(post) {
				ms.updateProductSetMeal(data.id, post, function(err, result) {
					ms.querySetMeal(data.id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.delete('/data/product/set/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteProductSetMeal(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});

});

app.get('/data/product/set/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryProductSetMealInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
});

// 供應商

app.get('/data/supplier', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.querySupplier(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);		
		});	
	});
});

app.post('/data/supplier/create', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifySupplier(data, function(post) {
				insert('INSERT INTO supplier SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.querySupplier(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/supplier/edit', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifySupplier(data, function(post) {
				ms.updateSupplier(data.id, post, function(err, result) {
					ms.querySupplier(data.id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});

});

app.delete('/data/supplier/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteSupplier(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});

});

// 員工

app.get('/data/employee', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryEmployee(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});

app.post('/data/employee/create', function(req, res) {
	checkDataPermission(req, res, 250, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyEmployee(data, function(post) {
				
				insert('INSERT INTO employee SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					
					insert('INSERT INTO position_details SET ?', {
						start_date: dateFormat(new Date(), "yyyy-mm-dd"),
						employee_id: id,
						position_id: data.position
					}, function(err, result) {
						ms.queryEmployee(id, function(err, rows, fields) {
							output.data.push(rows[0]);
							res.send(output);
						});
					})
					
				});
				
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/employee/edit', function(req, res) {
	checkDataPermission(req, res, 250, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyEmployee(data, function(post) {
				ms.updateEmployee(data.id, data.position, post, function(err, result) {
					if (err) throw err;
					ms.queryEmployee(data.id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});

});

app.delete('/data/employee/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteEmployee(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});

});

// 員工排班

app.get('/data/employee/schedule', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryEmployeeSchedule(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				row.employee_std_id = '<a href="/employee/schedule/table?id=' + row.id + '">' + row.employee_std_id +'</a>';
				row.start_time = regex.timeWithOutSecond(row.start_time);
				row.finish_time = regex.timeWithOutSecond(row.finish_time);
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});

app.post('/data/employee/schedule/create', function(req, res) {
	checkDataPermission(req, res, 250, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyEmployeeSchedule(data, function(post) {
				
				insert('INSERT INTO schedule SET ?', post, function(err, result) {
					var id = result.insertId;
					if (err) throw err;
					ms.queryEmployeeSchedule(id, function(err, rows, fields) {
						var row = rows[0];
						row.employee_std_id = '<a href="/employee/schedule/table?id=' + row.id + '">' + row.employee_std_id +'</a>';
						row.start_time = regex.timeWithOutSecond(row.start_time);
						row.finish_time = regex.timeWithOutSecond(row.finish_time);							
						output.data.push(row);
						res.send(output);
					});
				});
				
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/employee/schedule/edit', function(req, res) {
	checkDataPermission(req, res, 250, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyEmployeeSchedule(data, function(post) {
				ms.updateEmployeeSchedule(data.id, post, function(err, result) {
					if (err) throw err;
					ms.queryEmployeeSchedule(data.id, function(err, rows, fields) {
						var row = rows[0];
						row.start_time = regex.timeWithOutSecond(row.start_time);
						row.finish_time = regex.timeWithOutSecond(row.finish_time);							
						output.data.push(row);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});

});

app.delete('/data/employee/schedule/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
	var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteEmployeeSchedule(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});
});

app.get('/data/schedule/time', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryScheduleTimes(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				row.start_time = regex.timeWithOutSecond(row.start_time);
				row.finish_time = regex.timeWithOutSecond(row.finish_time);				
				output.data.push(row);
			});
			res.send(output);
		});
	});
});


// 員工排班表

app.get('/data/employee/schedule/table', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		if (req.query.id == undefined) {
			res.send({ error: 'schedule id is required'});
			return;
		}
		var output = { data: [] };
		ms.queryEmployeeScheduleTable(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});	
	});	
});

app.get('/data/employee/schedule/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryEmployeeScheduleInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});


// 職位

app.get('/data/position', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		query('SELECT `position_id`, `name` FROM `position`', function(err, rows, fields) {
			var output = { data: [] };
			rows.forEach(function(row) {
				output.data.push({
					id: row.position_id,
					name: row.name
				})
			});
			res.send(output);
		});	
	});
});

// 客戶

app.get('/data/customer', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryCustomer(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);		
		});		
	});
});

app.post('/data/customer/create', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyCustomer(data, function(post) {
				insert('INSERT INTO customer SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.queryCustomer(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/customer/edit', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyCustomer(data, function(post) {
				ms.updateCustomer(data.id, post, function(err, result) {
					if (err) throw err;
					ms.queryCustomer(data.id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}		
	});
});

app.delete('/data/customer/remove', function(req,res) {
	checkDataPermission(req, res, 300, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteCustomer(data.id, function(err, result) {
				res.send(output);
			});
		}		
	});
});

// 外帶訂單

app.get('/data/order/takeout', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryTakeoutOrder(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				row.link = '<a href="/order/takeout/order?id=' + row.id + '">' + row.std_id + '</a>';
				if (row.finish_time == null) {
					row.status = '未處理';
				} else  {
					row.status = row.finish_time;
				} 
				output.data.push(row);
			});
			res.send(output);
		});	
	});
});

app.delete('/data/order/takeout/remove', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteTakeoutOrder(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});
});

app.post('/data/order/takeout/check', function(req, res) {
	var output = { data: [] };
	if (req.body.action === 'create' ||
	    req.body.action === 'edit') {
			
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyTakeoutOrderElement(data, function(post) {
				output.data.push(post);
				res.send(output);
			}, function(err) {
				res.send(err);
			});
		}
	} else {
		res.send(output);
	}
});

app.post('/data/order/takeout/create', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var count = 0;
		insert('INSERT INTO `order` SET ?', {
			order_time: dateFormat(new Date(), "yyyy-mm-dd HH:mm:ss"),
			reservation_time: req.body.reservation_time,
			employee_id: req.session.employeeId,
			customer_id: req.body.customer_id,
			order_type: 'takeout'
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			for (var i in req.body.data) {
				var data = req.body.data[i];
				ms.addTakeoutOrderDetail(id, data, function(err, result) {
					if (err) throw err;
					count++;
					if (count == req.body.data.length) {
						res.send({ status: 'success' });
					}
				});
			}
		});	
	});
});

// 外帶訂單詳細

app.get('/data/order/takeout/order', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryTakeoutOrderDetails(req.query.id, function(err, rows, fields) {
			if (err) throw err;
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
});

app.post('/data/order/takeout/order/create', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyTakeoutOrderDetail(data, function(post) {
			
				insert('INSERT INTO order_details SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.queryTakeoutOrderDetail(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.put('/data/order/takeout/order/edit', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyTakeoutOrderDetail(data, function(post) {
				ms.updateTakeoutOrderDetail(data.id, post, function(err, result) {
					if (err) throw err;
					ms.queryTakeoutOrderDetail(data.id, function(err, rows, fields) {
						if (err) throw err;
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});
});

app.delete('/data/order/takeout/order/remove', function(req,res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteTakeoutOrderDetail(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});
});

app.get('/data/order/takeout/order/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryTakeoutOrderInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				if (row.finish_time == null) {
					row.status = '未處理';
				} else {
					row.status = row.finish_time;
				}
				output.data.push(row);
			});
			res.send(output);
		});		
	});
});

app.put('/data/order/takeout/order/finish', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.updateTakeoutOrderFinishTime(req.body.id, function(err, result) {
			if (err) throw err;
			res.send(output);
		});	
	});
});

// 外送訂單

app.get('/data/order/deliver', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryDeliverOrder(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				row.link = '<a href="/order/deliver/order?id=' + row.id + '">' + row.std_id + '</a>';
				if (row.finish_time == null) {
					row.status = '未處理';
				} else  {
					row.status = row.finish_time;
				} 
				output.data.push(row);
			});
			res.send(output);
		});	
	});

});

app.delete('/data/order/deliver/remove', function(req, res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteDeliverOrder(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});

});

app.post('/data/order/deliver/check', function(req, res) {
	var output = { data: [] };
	if (req.body.action === 'create' ||
	    req.body.action === 'edit') {
			
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyDeliverOrderElement(data, function(post) {
				output.data.push(post);
				res.send(output);
			}, function(err) {
				res.send(err);
			});
		}
	} else {
		res.send(output);
	}
});

app.post('/data/order/deliver/create', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var count = 0;
		insert('INSERT INTO `order` SET ?', {
			order_time: dateFormat(new Date(), "yyyy-mm-dd HH:mm:ss"),
			reservation_time: req.body.reservation_time,
			employee_id: req.session.employeeId,
			customer_id: req.body.customer_id,
			delivery_address: req.body.address,
			order_type: 'deliver'
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			for (var i in req.body.data) {
				var data = req.body.data[i];
				ms.addDeliverOrderDetail(id, data, function(err, result) {
					if (err) throw err;
					count++;
					if (count == req.body.data.length) {
						res.send({ status: 'success' });
					}
				});
			}
		});	
	});

});

// 外送訂單詳細

app.get('/data/order/deliver/order', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryDeliverOrderDetails(req.query.id, function(err, rows, fields) {
			if (err) throw err;
			rows.forEach(function(row) {
				output.data.push(row);
			});
			res.send(output);
		});		
	});
	
});

app.post('/data/order/deliver/order/create', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			
			ms.verifyDeliverOrderDetail(data, function(post) {
			
				insert('INSERT INTO order_details SET ?', post, function(err, result) {
					if (err) throw err;
					var id = result.insertId;
					ms.queryDeliverOrderDetail(id, function(err, rows, fields) {
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});

});

app.put('/data/order/deliver/order/edit', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		for (var key in req.body.data) {
			var data = req.body.data[key];
			ms.verifyDeliverOrderDetail(data, function(post) {
				ms.updateDeliverOrderDetail(data.id, post, function(err, result) {
					if (err) throw err;
					ms.queryDeliverOrderDetail(data.id, function(err, rows, fields) {
						if (err) throw err;
						output.data.push(rows[0]);
						res.send(output);
					});
				});
			}, function(err) {
				res.send(err);
			});
		}	
	});

});

app.delete('/data/order/deliver/order/remove', function(req,res) {
	checkDataPermission(req, res, 200, function(data) {
		var output = { data: [] };
		for (var key in req.query.data) {
			var data = req.query.data[key];
			ms.deleteDeliverOrderDetail(data.id, function(err, result) {
				res.send(output);
			});
		}	
	});

});

app.get('/data/order/deliver/order/info', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.queryDeliverOrderInfo(req.query.id, function(err, rows, fields) {
			rows.forEach(function(row) {
				if (row.finish_time == null) {
					row.status = '未處理';
				} else {
					row.status = row.finish_time;
				}
				output.data.push(row);
			});
			res.send(output);
		});		
	});
		
});

app.put('/data/order/deliver/order/finish', function(req, res) {
	checkDataPermission(req, res, 100, function(data) {
		var output = { data: [] };
		ms.updateDeliverOrderFinishTime(req.body.id, function(err, result) {
			if (err) throw err;
			res.send(output);
		});	
	});

});



// 其他功能

var checkPermission = function(req, res, allowLevel, success, redirectTo) {
	if (req.session.account == undefined) {
		res.redirect(redirectTo);
		return;
	}
	ms.queryAccount(req.session.account, function(err, rows, fields) {
		if (err) throw err;
		var data = rows[0];
		if (data.permission < allowLevel) {
			res.redirect(redirectTo);
			return;
		}
		success(data);
	});
};

var checkDataPermission = function(req, res, allowLevel, success, errorMessage) {
	if (req.session.account == undefined) {
		res.send({ error: '權限不足' });
		return;
	}
	ms.queryAccount(req.session.account, function(err, rows, fields) {
		if (err) throw err;
		var data = rows[0];
		if (data.permission < allowLevel) {
			res.send({ error: '權限不足' });
			return;
		}
		success(data);
	});
};
// Server

http.listen(3000);
c.log("Started server on port 3000");
