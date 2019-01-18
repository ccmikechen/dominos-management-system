module.exports = {
	phone: function(s) {
		var r = s.match(/^(09\d\d)-*(\d\d\d)-*(\d\d\d)$/) ||
				s.match(/^\(*(\d\d)\)*(\d\d\d)-*(\d\d\d\d)$/) ||
				s.match(/^\(*(\d\d)\)*(\d\d\d\d)-*(\d\d\d\d)$/);
		if (r == null) {
			return null;
		}
		r.shift();
		return r.join('');
	},
	email: function(s) {
		var r = s.match(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
		if (r == null) {
			return null;
		}
		return s;
	},
	positive: function(s) {
		var r = s.match(/^[0-9]\d*$/);
		if (r == null) {
			return null;
		}
		return s;
	},
	username: function(s) {
		var r = s.match(/\W/);
		if (r != null) {
			return null;
		}
		return s;
	},
	dataUrl: function(s) {
		var r = s.match(/^\/data\//);
		if (r == null) {
			return null;
		}
		return s;
	},
	timeWithOutSecond: function(s) {
		var r = s.match(/^(\d\d:\d\d).*$/);
		if (r == null) {
			return null;
		}
		return r[1];
	}
}