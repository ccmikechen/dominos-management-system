var dateFormat = require('dateformat');
var sha256 = require('sha256');
var request = require('request');
var regex = require('./regex');
var mysql = require('mysql');

var debug_mode = 0;

var conn = {
	host	 : 'db.mis.kuas.edu.tw',
	user	 : 's1103137124',
	password : 'T124714679',
	database : 's1103137124'
};

var query = function(sql, callback) {
	var connection = mysql.createConnection(conn);
	connection.connect();
	var sql = connection.query(sql, callback).sql;
	if (debug_mode == 1) {
		console.log(sql);
	}
	connection.end();
};

var insert = function(sql, post, callback) {
	var connection = mysql.createConnection(conn);
	connection.connect();
	connection.query(sql, post, callback);
	connection.end();
};

var update = function(sql, post, callback) {
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

var ms = {
	
	// 普通帳號
	
	verifyLoginInfo: function(data, success, error) {
		if (data.username == undefined || data.username.length == 0) {
			error(1);
			return;
		}
		if (data.password == undefined || data.password.length == 0) {
			error(2);
			return;
		}
		
		if (regex.username(data.username) == null) {
			error(10);
			return;
		}
		
		query('SELECT account_id, username, password FROM normal_account WHERE username = "' + data.username + '"', function(err, rows, field) {
			if (err) throw err;
			if (rows.length == 0) {
				error(3);
				return;
			}
			if (sha256(data.password) != rows[0].password) {
				error(4);
				return;
			}
			success(rows[0].account_id);
		});
	},
	
	verifyRegisterInfo: function(data, success, error) {
		if (data.username == undefined || data.username.length == 0) {
			error(5);
			return;
		}
		if (data.username.length > 20) {
			error(6);
			return;
		}
		
		if (data.password == undefined || data.password.length == 0) {
			error(7);
			return;
		}
		
		if (data.password.length < 8) {
			error(8);
			return;
		}
		
		if (regex.username(data.username) == null) {
			error(10);
			return;
		}
		
		query('SELECT account_id FROM normal_account WHERE username = "' + data.username + '"', function(err, rows, fields) {
			if (err) throw err;
			
			if (rows.length > 0) {
				error(9);
				return;
			}
	
			insert('INSERT INTO account SET ?', {
				type: 'normal',
				permission: 0
			}, function(err, result) {
				if (err) throw err;
				var id = result.insertId;
				insert('INSERT INTO normal_account SET ?', {
					account_id: id,
					username: data.username,
					password: sha256(data.password)
				}, function(err, result) {
					if (err) throw err;					
					success();
				});
			});
		});
	},
	
	// Facebook帳號
	
	verifyFacebookId: function(fid, accessToken, success, error) {
		var options = {
			method: 'GET',
			url: 'https://graph.facebook.com/v2.6/me',
			qs: {
				access_token: accessToken
			}
		};
		request(options, function (err, response, body) {
			if (err) {
				error();
			}
			var json = JSON.parse(body);
			if (json.id == fid) {
				success(json);
			} else {
				console.log(json.id + " and " + fid);
				error();
			}
		});
	},
	
	verifyFacebookLoginInfo: function(fid, success, error) {
		query('SELECT account_id FROM facebook_account WHERE facebook_id = ' + fid, function(err, rows, fields) {
			if (rows.length == 0) {
				ms.verifyFacebookRegisterInfo(fid, success, error);
			} else {
				success(rows[0].account_id);
			}
		});
	},
	
	verifyFacebookRegisterInfo: function(fid, success, error) {
		insert('INSERT INTO account SET ?', {
			type: 'facebook',
			permission: 0
		}, function(err, result) {
			if (err) throw err;
			var id = result.insertId;
			insert('INSERT INTO facebook_account SET ?', {
				account_id: id,
				facebook_id: fid
			}, function(err, result) {
				if (err) throw err;
				success(id);
			});
		});
	},
	
	// 帳號查詢
	queryAccount: function(id, callback) {
		var sql = 'SELECT a.employee_id, b.name, a.permission, a.type ' +
				'FROM account a LEFT JOIN employee b ON a.employee_id = b.employee_id ' +
				'WHERE a.account_id = ' + id;
		query(sql, callback);
	},

	// 存貨
	
	queryStock: function(id, callback) {
		var sql = 'SELECT a.material_id as "id", CONCAT("MT", LPAD(a.material_id, 5, 0)) as "std_id", a.name, a.quantity, a.supplier_id, CONCAT("SP", LPAD(a.supplier_id, 5, 0)) as "std_supplier_id", DATE_FORMAT(b.inventory_date,  "%Y-%m-%d") as "inventory_date" ' + 
				'FROM material a LEFT JOIN inventory_order b ON b.inventory_order_id = (SELECT inventory_order_id FROM inventory_order_details c WHERE c.material_id = a.material_id ORDER BY inventory_order_details_id DESC LIMIT 0, 1) ';
		if (id > 0) {
			sql += 'WHERE material_id = ' + id;
		}
		query(sql, callback);
	},	
	
	updateStock: function(id, data, callback) {
		update('UPDATE material SET ? WHERE material_id = ' + id, data, callback);
	},	
	
	addStockQuantity: function(id, quantity, callback) {
		update('UPDATE material SET quantity = quantity + ' + quantity + ' WHERE material_id = ' + id, callback);
	},
	
	updateStockQuantity: function(id, quantity, callback) {
		update('UPDATE material SET quantity = ' + quantity + ' WHERE material_id = ' + id, callback);
	},
	
	deleteStock: function(id, callback) {
		query('DELETE FROM material WHERE material_id = ' + id, callback);
	},
	
	verifyStock: function(data, success, error) {
		var r;
		var post = {};
		
		// name
		post.name = data.name;
		// quantity
		post.quantity = data.quantity;
		// supplier
		post.supplier_id = data.supplier_id;
		
		success(post);
	},
	
	// 進貨
	
	verifyPurchaseElement: function(data, success, error) {
		
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		
		var price = regex.positive(data.price);
		if (price == null) {
			error(createSingleFieldError('price', '價格必須為正整數'));
			return;
		}
		
		this.queryStock(data.stock_id, function(err, rows, fields) {
			success({
				id: data.id || Date.now(),
				stock_id: rows[0].id,
				stock_std_id: rows[0].std_id,
				name: rows[0].name,
				quantity: quantity,
				after: rows[0].quantity * 1 + quantity * 1,
				price: price,
				total: quantity * price
			});
		});
	},
	
	addPurchaseOrderDetail: function(id, data, callback) {
		this.queryStock(data.stock_id, function(err, rows, fields) {
			var quantity = rows[0].quantity;
			insert('INSERT INTO purchase_order_details SET ?', {
				material_id: data.stock_id,
				purchase_order_id: id,
				quantity: data.quantity,
				price: data.price
			}, function(err, result) {
				if (err) throw err;
				ms.addStockQuantity(data.stock_id, data.quantity, callback);
			});
		});
	},
	
	queryPurchase: function(id, callback) {
		var sql = 'SELECT a.purchase_order_id as "id", CONCAT("PS", LPAD(a.purchase_order_id, 7, 0)) as "std_id", DATE_FORMAT(a.purchase_date, "%Y-%m-%d") as "date", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_id", sum(b.quantity * b.price) as "total" ' + 
				'FROM purchase_order a JOIN purchase_order_details b ON a.purchase_order_id = b.purchase_order_id ';
		if (id > 0) {
			sql += 'WHERE a.purchase_order_id = ' + id + ' ';
		}
		sql += 'GROUP BY a.purchase_order_id, a.purchase_date, a.employee_id';
		query(sql, callback);
	},
	
	deletePurchase: function(id, callback) {
		query('DELETE FROM purchase_order WHERE purchase_order_id = ' + id, callback);
	},
	
	// 進貨單
	
	queryPurchaseOrder: function(id, callback) {
		var sql = 'SELECT CONCAT("MT", LPAD(a.material_id, 5, 0)) as "stock_std_id", b.name, a.quantity, a.price, (a.quantity * a.price) as "total" ' +
				'FROM purchase_order_details a LEFT JOIN material b ON a.material_id = b.material_id ' +
				'WHERE a.purchase_order_id = ' + id;
		query(sql, callback);
	},
	
	queryPurchaseOrderInfo: function(id, callback) {
		var sql = 'SELECT CONCAT("PS", LPAD(a.purchase_order_id, 7, 0)) as "std_id", DATE_FORMAT(a.purchase_date, "%Y-%m-%d") as "date", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_id", sum(b.quantity * b.price) as "total" ' +
				'FROM purchase_order a JOIN purchase_order_details b ON a.purchase_order_id = b.purchase_order_id ' +
				'WHERE a.purchase_order_id = ' + id + ' ' +
				'GROUP BY a.purchase_order_id, a.purchase_date, a.employee_id';
		query(sql, callback);
	},
	
	// 盤點
	
	verifyInventoryElement: function(data, success, error) {
		
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		
		this.queryStock(data.stock_id, function(err, rows, fields) {
			success({
				id: data.id || Date.now(),
				stock_id: rows[0].id,
				stock_std_id: rows[0].std_id,
				name: rows[0].name,
				profit: quantity - rows[0].quantity,
				quantity: quantity
			});
		});		
	},
	
	addInventoryOrderDetail: function(id, data, callback) {
		this.queryStock(data.stock_id, function(err, rows, fields) {
			var quantity = rows[0].quantity;
			insert('INSERT INTO inventory_order_details SET ?', {
				material_id: data.stock_id,
				inventory_order_id: id,
				quantity: data.quantity,
				profit: data.quantity - quantity
			}, function(err, result) {
				if (err) throw err;
				ms.updateStockQuantity(data.stock_id, data.quantity, callback);
			});
		});
	},
	
	queryInventory: function(id, callback) {
		var sql = 'SELECT a.inventory_order_id as "id", CONCAT("INV", LPAD(a.inventory_order_id, 7, 0)) as "std_id", DATE_FORMAT(a.inventory_date, "%Y-%m-%d") as "date", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_id" ' + 
				'FROM inventory_order a JOIN inventory_order_details b ON a.inventory_order_id = b.inventory_order_id ';
		if (id > 0) {
			sql += 'WHERE a.inventory_order_id = ' + id + ' ';
		}
		sql += 'GROUP BY a.inventory_order_id, a.inventory_date, a.employee_id';
		query(sql, callback);
	},
	
	deleteInventory: function(id, callback) {
		query('DELETE FROM inventory_order WHERE inventory_order_id = ' + id, callback);
	},
	
	// 盤點單
	
	queryInventoryOrder: function(id, callback) {
		var sql = 'SELECT CONCAT("MT", LPAD(a.material_id, 5, 0)) as "stock_std_id", b.name, a.quantity ' +
				'FROM inventory_order_details a LEFT JOIN material b ON a.material_id = b.material_id ' +
				'WHERE a.inventory_order_id = ' + id;
		query(sql, callback);
	},
	
	queryInventoryOrderInfo: function(id, callback) {
		var sql = 'SELECT CONCAT("INV", LPAD(a.inventory_order_id, 7, 0)) as "std_id", DATE_FORMAT(a.inventory_date, "%Y-%m-%d") as "date", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_id" ' +
				'FROM inventory_order a JOIN inventory_order_details b ON a.inventory_order_id = b.inventory_order_id ' +
				'WHERE a.inventory_order_id = ' + id + ' ' +
				'GROUP BY a.inventory_order_id, a.inventory_date, a.employee_id';
		query(sql, callback);
	},
	
	// 商品
	
	queryProduct: function(id, callback) {
		var sqlA = 'SELECT product_id as "id", CONCAT("PD", LPAD(product_id, 7, 0)) as "std_id", name, price, type ' +
				'FROM product WHERE type != "set" ';
		var sqlB = 'SELECT product_id as "id", CONCAT("SM", LPAD(product_id, 7, 0)) as "std_id", name, price, type ' +
				'FROM product WHERE type = "set" ';
		if (id > 0) {
			sqlA += 'AND product_id = ' + id + ' ';
			sqlB += 'AND product_id = ' + id + ' ';
		}
		query(sqlA + ' UNION ' + sqlB, callback);
	},
	
	deleteProduct: function(id, callback) {
		query('DELETE FROM product WHERE product_id = ' + id, callback);
	},
	
	queryProductImageUrl: function(id, callback) {
		query('SELECT image_url FROM product WHERE product_id = ' + id, callback);
	},
	
	updateProductImageUrl: function(id, url, callback) {
		update('UPDATE product SET ? WHERE product_id = ' + id, {
			image_url: url
		}, callback);
	},
	
	// 商品成分
	
	verifyProductElement: function(data, success, error) {
		
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		
		this.queryStock(data.stock_id, function(err, rows, fields) {
			success({
				id: data.id || Date.now(),
				stock_id: rows[0].id,
				stock_std_id: rows[0].std_id,
				name: rows[0].name,
				quantity: quantity
			});
		});
	},
	
	addProductIngredient: function(id, data, callback) {
		insert('INSERT INTO product_ingredient SET ?', {
			material_id: data.stock_id,
			product_id: id,
			material_quantity: data.quantity
		}, callback);
	},
	
	updateProductIngredient: function(id, data, callback) {
		update('UPDATE product_ingredient SET ? WHERE product_ingredient_id = ' + id, data, callback);
		
	},
	
	deleteProductIngredient: function(id, callback) {
		query('DELETE FROM product_ingredient WHERE product_id = ' + id, callback);
	},
	
	queryProductIngredient: function(id, callback) {
		var sql = 'SELECT product_ingredient_id as "id", a.product_id, a.material_id as "stock_id", CONCAT("MT", LPAD(a.material_id, 5, 0)) as "stock_std_id", b.name, a.material_quantity as "quantity" ' +
				'FROM product_ingredient a LEFT JOIN material b ON a.material_id = b.material_id ' +
				'WHERE a.product_id = ' + id;
		
		query(sql, callback);		
	},
	
	queryIngredient: function(id, callback) {
		var sql = 'SELECT product_ingredient_id as "id", a.product_id, a.material_id as "stock_id", CONCAT("MT", LPAD(a.material_id, 5, 0)) as "stock_std_id", b.name, a.material_quantity as "quantity" ' +
				'FROM product_ingredient a LEFT JOIN material b ON a.material_id = b.material_id ' +
				'WHERE a.product_ingredient_id = ' + id;
		
		query(sql, callback);		
	},
	
	queryProductIngredientInfo: function(id, callback) {
		var types = {
			little: '小',
			middle: '中',
			big: '大',
			set: '套餐'
		}
		var sql = 'SELECT product_id, CONCAT("PD", LPAD(product_id, 5, 0)) as "std_id", type, price, name ' +
				'FROM product ' +
				'WHERE product_id = ' + id;
		query(sql, function(err, rows, fields) {
			rows[0].std_type = types[rows[0].type];
			callback(err, rows, fields);
		});
	},
	
	verifyProductIngredient: function(data, success, error) {
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		success({
			material_id: data.stock_id,
			product_id: data.product_id,
			material_quantity: data.quantity
		});
	},
	
	// 套餐組合
	
	verifyProductSetMealElement: function(data, success, error) {
		
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		
		this.queryProduct(data.product_id, function(err, rows, fields) {
			if (err) throw err;
			success({
				id: data.id || Date.now(),
				product_id: rows[0].id,
				product_std_id: rows[0].std_id,
				name: rows[0].name,
				quantity: quantity
			});
		});
	},
	
	addProductSetMeal: function(id, data, callback) {
		insert('INSERT INTO set_meal_details SET ?', {
			set_meal_id: id,
			product_id: data.product_id,
			quantity: data.quantity
		}, callback);
	},
	
	updateProductSetMeal: function(id, data, callback) {
		update('UPDATE set_meal_details SET ? WHERE set_meal_details_id = ' + id, data, callback);
		
	},
	
	deleteProductSetMeal: function(id, callback) {
		query('DELETE FROM set_meal_details WHERE set_meal_details_id = ' + id, callback);
	},
	
	queryProductSetMeal: function(id, callback) {
		var sql = 'SELECT set_meal_details_id as "id", a.set_meal_id, a.product_id, CONCAT("PD", LPAD(a.product_id, 5, 0)) as "product_std_id", b.name, a.quantity ' +
				'FROM set_meal_details a LEFT JOIN product b ON a.product_id = b.product_id ' +
				'WHERE a.set_meal_id = ' + id;
		query(sql, callback);		
	},
	
	querySetMeal: function(id, callback) {
		var sql = 'SELECT set_meal_details_id as "id", a.set_meal_id, a.product_id, CONCAT("PD", LPAD(a.product_id, 5, 0)) as "product_std_id", b.name, a.quantity ' +
				'FROM set_meal_details a LEFT JOIN product b ON a.product_id = b.product_id ' +
				'WHERE a.set_meal_details_id = ' + id;		
		query(sql, callback);		
	},
	
	queryProductSetMealInfo: function(id, callback) {
		var sql = 'SELECT product_id, CONCAT("SM", LPAD(product_id, 5, 0)) as "std_id", price, name ' +
				'FROM product ' +
				'WHERE product_id = ' + id;
		query(sql, callback);
	},
	
	verifyProductSetMeal: function(data, success, error) {
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		success({
			set_meal_id: data.set_meal_id,
			product_id: data.product_id,
			quantity: data.quantity
		});
	},
	
	
	// 供應商
	
	querySupplier: function(id, callback) {
		var sql = 'SELECT supplier_id as "id", CONCAT("SP", LPAD(supplier_id, 5, 0)) as "std_id", name, address, phone FROM supplier ';
		if (id > 0) {
			sql += 'WHERE supplier_id = ' + id;
		}
		query(sql, callback);
	},
	
	updateSupplier: function(id, data, callback) {
		update('UPDATE supplier SET ? WHERE supplier_id = ' + id, data, callback);
	},
	
	deleteSupplier: function(id, callback) {
		query('DELETE FROM supplier WHERE supplier_id = ' + id, callback);
	},
	
	verifySupplier: function(data, success, error) {
		var post = {};
		// name
		post.name = data.name;
		// phone
		var phone = regex.phone(data.phone);
		if (phone == null) {
			error(createSingleFieldError('phone', '電話格式錯誤(EX:0912-345-678)'));
			return;
		}
		post.phone = phone;
		// address
		post.address = data.address;
		
		success(post);
	},
	
	// 員工
	
	queryEmployee: function(id, callback) {
		var sql = 'SELECT a.employee_id as "id", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "std_id", a.name, DATE_FORMAT(a.birthday,  "%Y-%m-%d") AS "birthday", a.gender, a.hourly as "salary", a.phone, a.email, a.address, b.name as "position"' +
			  'FROM employee a JOIN position b ON b.position_id = (SELECT position_id FROM position_details WHERE employee_id = a.employee_id ORDER BY position_details_id DESC LIMIT 0, 1) ';
		if (id > 0) {
			sql += 'WHERE a.employee_id = ' + id;
		}
		query(sql, callback);
	},
	
	updateEmployee: function(id, position, data, callback) {
		this.queryLastPosition(id, function(err, rows, fields) {
			if (rows[0].position_id != position) {
				update('UPDATE position_details SET ? WHERE position_details_id = ' + rows[0].position_details_id, { 
					finish_date: dateFormat(new Date(), "yyyy-mm-dd")
				}, function(err, result) {
					insert('INSERT INTO position_details SET ?', {
						start_date: dateFormat(new Date(), "yyyy-mm-dd"),
						employee_id: id,
						position_id: position
					}, function(err, result) {
						update('UPDATE employee SET ? WHERE employee_id = ' + id, data, callback);
					})
				});
			} else {
				update('UPDATE employee SET ? WHERE employee_id = ' + id, data, callback);
			}
			
		});
	},
	
	queryLastPosition(id, callback) {
		var sql = 'SELECT * FROM position_details WHERE employee_id = ' + id + ' ORDER BY position_details_id DESC LIMIT 0, 1';
		query(sql, callback);
	},
	
	deleteEmployee: function(id, callback) {
		query('DELETE FROM employee WHERE employee_id = ' + id, callback);
	},
	
	verifyEmployee: function(data, success, error) {
		var r;
		var post = {};
		
		// name
		post.name = data.name;
		
		// gender
		post.gender = data.gender;
		
		// birthday
		post.birthday = data.birthday;
		
		// phone
		var phone = regex.phone(data.phone);
		if (phone == null) {
			error(createSingleFieldError('phone', '電話格式錯誤(EX:0912-345-678)'));
			return;
		}
		post.phone = phone;
		
		// email
		var email = regex.email(data.email);
		if (email == null) {
			error(createSingleFieldError('email', 'E-mail格式錯誤'));
			return;
		}
		post.email = email;
		
		// address
		post.address = data.address;
		
		// hourly
		var hourly = regex.positive(data.salary);
		if (hourly == null) {
			error(createSingleFieldError('salary', '時薪必須為正整數'));
			return;
		}
		post.hourly = hourly;
		success(post);
	},
		
	// 員工排班
	
	queryEmployeeSchedule: function(id, callback) {
		var sql = 'SELECT a.schedule_id as "id", c.employee_id, CONCAT("EMP", LPAD(c.employee_id, 5, 0)) as "employee_std_id", c.name, DATE_FORMAT(a.date, "%Y-%m-%d") as "date", d.start_time, ADDTIME(e.start_time, "00:30") as "finish_time", a.type ' +
			  'FROM schedule a JOIN employee c ON a.employee_id = c.employee_id JOIN schedule_time d ON a.start_time_id = d.schedule_time_id JOIN schedule_time e ON a.finish_time_id = e.schedule_time_id ';
		if (id > 0) {
			sql += 'WHERE a.schedule_id = ' + id;
		}
		query(sql, callback);
	},
	
	updateEmployeeSchedule: function(id, data, callback) {
		update('UPDATE schedule SET ? WHERE schedule_id = ' + id, data, callback);
	},
	
	deleteEmployeeSchedule: function(id, callback) {
		query('DELETE FROM schedule WHERE schedule_id = ' + id, callback);
	},
	
	verifyEmployeeSchedule: function(data, success, error) {
		var r;
		var post = {};
		
		if (data.date == '') {
			error(createSingleFieldError('date', '日期不可為空'));
		}
		post.date = data.date;
		
		post.type = data.type;
		
		post.start_time_id = data.start_time;
		
		post.finish_time_id = data.finish_time;	
		
		post.employee_id = data.employee_id;
		
		ms.queryScheduleTimes(data.start_time, function(err, rows, fields) {
			if (err) throw err;
			var startTime = new Date('1990-01-01 ' + rows[0].start_time);
			ms.queryScheduleTimes(data.finish_time, function(err, rows, fields) {
				var finishTime = new Date('1990-01-01 ' + rows[0].finish_time);
				if (startTime < finishTime) {
					success(post);
				} else {
					error(createSingleFieldError('start_time', '開始時間不可小於結束時間'));
				}
			});
		});
		
	},
	
	queryScheduleTimes: function(id, callback) {
		var sql = 'SELECT schedule_time_id as "id", start_time, ADDTIME(start_time, "00:30") as "finish_time" ' +
				'FROM schedule_time WHERE start_time >= "10:00" AND start_time <= "20:30" ';
		if (id > 0) {
			sql += 'AND schedule_time_id = ' + id + ' ';
		}
		sql += 'ORDER BY start_time';
		query(sql, callback);
	},
	
	// 員工排班表
	
	queryEmployeeScheduleTable: function(id, callback) {
		var sql = 'SELECT DAYOFWEEK(a.date) - 1 as "day_of_week", a.start_time_id, a.finish_time_id, a.type, a.schedule_id ' +
				'FROM schedule a WHERE a.employee_id = ( SELECT employee_id FROM schedule WHERE schedule_id = ' + id + ' ) ' +
				'GROUP BY a.date, a.start_time_id, a.finish_time_id, a.type ' +
				'HAVING WEEK(a.date) = ( SELECT WEEK(b.date) FROM schedule b WHERE b.schedule_id = ' + id + ' )';
		query(sql, callback);
	},

	queryEmployeeScheduleInfo: function(id, callback) {
		query('SELECT CONCAT("EMP", LPAD(employee_id, 5, 0)) as "employee_std_id", date FROM schedule WHERE schedule_id = ' + id, callback);
	},
	
	// 客戶
	
	queryCustomer: function(id, callback) {
		var sql = 'SELECT customer_id as "id", CONCAT("CT", LPAD(customer_id, 5, 0)) as "std_id", name, address, phone FROM customer ';
		if (id > 0) {
			sql += 'WHERE customer_id = ' + id;
		}
		query(sql, callback);
	},
	
	updateCustomer: function(id, data, callback) {
		update('UPDATE customer SET ? WHERE customer_id = ' + id, data, callback);
	},
	
	deleteCustomer: function(id, callback) {
		query('DELETE FROM customer WHERE customer_id = ' + id, callback);
	},
	
	verifyCustomer: function(data, success, error) {
		var r;
		var post = {};
		
		// name
		post.name = data.name;
		// phone
		if (data.phone != '') {
			var phone = regex.phone(data.phone);
			if (phone == null) {
				error(createSingleFieldError('phone', '電話格式錯誤(EX:0912-345-678)'));
				return;
			}
			post.phone = phone;			
		}

		// address
		post.address = data.address;
		
		success(post);		
	},

	// 外帶訂單
	
	verifyTakeoutOrderElement: function(data, success, error) {
		
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		
		this.queryProduct(data.product_id, function(err, rows, fields) {
			success({
				id: data.id || Date.now(),
				product_id: rows[0].id,
				product_std_id: rows[0].std_id,
				product_name: rows[0].name,
				product_type: rows[0].type,
				quantity: quantity,
				product_price: rows[0].price,
				total: quantity * rows[0].price
			});
		});
	},
	
	addTakeoutOrderDetail: function(id, data, callback) {
		insert('INSERT INTO order_details SET ?', {
			product_id: data.product_id,
			order_id: id,
			quantity: data.quantity
		}, callback);
	},
	
	queryTakeoutOrder: function(id, callback) {
		var sql = 'SELECT a.order_id as "id", CONCAT("T", LPAD(a.order_id, 7, 0)) as "std_id", DATE_FORMAT(a.order_time, "%Y-%m-%d %T") as "order_time", DATE_FORMAT(a.reservation_time, "%Y-%m-%d %T") as "reservation_time",  DATE_FORMAT(a.finish_time, "%Y-%m-%d %T") as "finish_time", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_id", CONCAT("CT", LPAD(a.customer_id, 5, 0)) as "customer_id", sum(b.quantity * c.price) as "total" ' + 
				'FROM `order` a LEFT JOIN order_details b ON a.order_id = b.order_id LEFT JOIN product c ON b.product_id = c.product_id ' +
				'WHERE a.order_type = "takeout" ';
		if (id > 0) {
			sql += 'AND a.order_id = ' + id + ' ';
		}
		sql += 'GROUP BY a.order_id, a.order_time, a.reservation_time, a.employee_id, a.customer_id';
		query(sql, callback);
	},
	
	deleteTakeoutOrder: function(id, callback) {
		query('DELETE FROM `order` WHERE order_id = ' + id, callback);
	},
	
	updateTakeoutOrderDetail: function(id, data, callback) {
		update('UPDATE order_details SET ? WHERE order_details_id = ' + id, data, callback);
	},
	
	deleteTakeoutOrderDetail: function(id, callback) {
		query('DELETE FROM order_details WHERE order_details_id = ' + id, callback);
	},
	
	queryTakeoutOrderDetails: function(id, callback) {
		var sql = 'SELECT order_details_id as "id", a.product_id, CONCAT("PD", LPAD(a.product_id, 5, 0)) as "product_std_id", b.name, b.type, b.price, a.quantity, (b.price * a.quantity) as "total" ' +
				'FROM order_details a JOIN product b ON a.product_id = b.product_id ' +
				'WHERE a.order_id = ' + id;
		query(sql, callback);		
	},
	
	queryTakeoutOrderDetail: function(id, callback) {
		var sql = 'SELECT order_details_id as "id", a.product_id, CONCAT("PD", LPAD(a.product_id, 5, 0)) as "product_std_id", b.name, b.type, b.price, a.quantity, (b.price * a.quantity) as "total" ' +
				'FROM order_details a JOIN product b ON a.product_id = b.product_id ' +
				'WHERE a.order_details_id = ' + id;		
		query(sql, callback);		
	},
	
	queryTakeoutOrderInfo: function(id, callback) {
		var sql = 'SELECT CONCAT("T", LPAD(a.order_id, 7, 0)) as "order_std_id", CONCAT("CT", LPAD(a.customer_id, 5, 0)) as "customer_std_id", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_std_id", SUM(b.quantity * c.price) as "total", DATE_FORMAT(a.order_time, "%Y-%m-%d %T") as "order_time", DATE_FORMAT(a.reservation_time, "%Y-%m-%d %T") as "reservation_time", DATE_FORMAT(a.finish_time, "%Y-%m-%d %T") as "finish_time" ' +
				'FROM `order` a JOIN order_details b ON a.order_id = b.order_id JOIN product c ON b.product_id = c.product_id ' +
				'WHERE a.order_id = ' + id + ' ' +
				'GROUP BY a.order_id, a.customer_id, a.employee_id, a.order_time, a.reservation_time, a.finish_time';
		query(sql, callback);
	},
	
	verifyTakeoutOrderDetail: function(data, success, error) {
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		success({
			product_id: data.product_id,
			quantity: data.quantity
		});
	},
	
	updateTakeoutOrderFinishTime: function(id, callback) {
		update('UPDATE `order` SET finish_time = NOW() WHERE order_id = ' + id, callback);
	},
	
	// 外帶訂單
	
	verifyDeliverOrderElement: function(data, success, error) {
		
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		
		this.queryProduct(data.product_id, function(err, rows, fields) {
			success({
				id: data.id || Date.now(),
				product_id: rows[0].id,
				product_std_id: rows[0].std_id,
				product_name: rows[0].name,
				product_type: rows[0].type,
				quantity: quantity,
				product_price: rows[0].price,
				total: quantity * rows[0].price
			});
		});
	},
	
	addDeliverOrderDetail: function(id, data, callback) {
		insert('INSERT INTO order_details SET ?', {
			product_id: data.product_id,
			order_id: id,
			quantity: data.quantity
		}, callback);
	},
	
	queryDeliverOrder: function(id, callback) {
		var sql = 'SELECT a.order_id as "id", CONCAT("D", LPAD(a.order_id, 7, 0)) as "std_id", DATE_FORMAT(a.order_time, "%Y-%m-%d %T") as "order_time", DATE_FORMAT(a.reservation_time, "%Y-%m-%d %T") as "reservation_time",  DATE_FORMAT(a.finish_time, "%Y-%m-%d %T") as "finish_time", CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_id", CONCAT("CT", LPAD(a.customer_id, 5, 0)) as "customer_id", sum(b.quantity * c.price) as "total" ' + 
				'FROM `order` a LEFT JOIN order_details b ON a.order_id = b.order_id LEFT JOIN product c ON b.product_id = c.product_id ' +
				'WHERE a.order_type = "deliver" ';
		if (id > 0) {
			sql += 'AND a.order_id = ' + id + ' ';
		}
		sql += 'GROUP BY a.order_id, a.order_time, a.reservation_time, a.employee_id, a.customer_id';
		query(sql, callback);
	},
	
	deleteDeliverOrder: function(id, callback) {
		query('DELETE FROM `order` WHERE order_id = ' + id, callback);
	},
	
	updateDeliverOrderDetail: function(id, data, callback) {
		update('UPDATE order_details SET ? WHERE order_details_id = ' + id, data, callback);
	},
	
	deleteDeliverOrderDetail: function(id, callback) {
		query('DELETE FROM order_details WHERE order_details_id = ' + id, callback);
	},
	
	queryDeliverOrderDetails: function(id, callback) {
		var sql = 'SELECT order_details_id as "id", a.product_id, CONCAT("PD", LPAD(a.product_id, 5, 0)) as "product_std_id", b.name, b.type, b.price, a.quantity, (b.price * a.quantity) as "total" ' +
				'FROM order_details a JOIN product b ON a.product_id = b.product_id ' +
				'WHERE a.order_id = ' + id;
		query(sql, callback);		
	},
	
	queryDeliverOrderDetail: function(id, callback) {
		var sql = 'SELECT order_details_id as "id", a.product_id, CONCAT("PD", LPAD(a.product_id, 5, 0)) as "product_std_id", b.name, b.type, b.price, a.quantity, (b.price * a.quantity) as "total" ' +
				'FROM order_details a JOIN product b ON a.product_id = b.product_id ' +
				'WHERE a.order_details_id = ' + id;		
		query(sql, callback);		
	},
	
	queryDeliverOrderInfo: function(id, callback) {
		var sql = 'SELECT CONCAT("T", LPAD(a.order_id, 7, 0)) as "order_std_id", CONCAT("CT", LPAD(a.customer_id, 5, 0)) as "customer_std_id", a.delivery_address, CONCAT("EMP", LPAD(a.employee_id, 5, 0)) as "employee_std_id", SUM(b.quantity * c.price) as "total", DATE_FORMAT(a.order_time, "%Y-%m-%d %T") as "order_time", DATE_FORMAT(a.reservation_time, "%Y-%m-%d %T") as "reservation_time", DATE_FORMAT(a.finish_time, "%Y-%m-%d %T") as "finish_time" ' +
				'FROM `order` a JOIN order_details b ON a.order_id = b.order_id JOIN product c ON b.product_id = c.product_id ' +
				'WHERE a.order_id = ' + id + ' ' +
				'GROUP BY a.order_id, a.customer_id, a.employee_id, a.order_time, a.reservation_time, a.finish_time';
		query(sql, callback);
	},
	
	verifyDeliverOrderDetail: function(data, success, error) {
		var quantity = regex.positive(data.quantity);
		if (quantity == null) {
			error(createSingleFieldError('quantity', '數量必須為正整數'));
			return;
		}
		success({
			product_id: data.product_id,
			quantity: data.quantity
		});
	},
	
	updateDeliverOrderFinishTime: function(id, callback) {
		update('UPDATE `order` SET finish_time = NOW() WHERE order_id = ' + id, callback);
	},
	
};

module.exports = ms;