/*jshint node:true */
"use strict";

var when = require("when"),
	url = require("url"),
	path = require("path"),
	fs = require("fs"),
	http = require("http"),
	https = require("https"),
	EventEmitter = require("events").EventEmitter,

	downloads,
	HTTPDownload;


/* Download rate computing interval in msecs */
var RATE_INTERVAL = 1000;


var errors = {
	"getaddrinfo ENOTFOUND": "Unknown host name",
	"connect ECONNREFUSED": "Connection refused",
	"DEPTH_ZERO_SELF_SIGNED_CERT": "Rejected certificate, retry to force download",
	"HTTP error 404": "File not found"
};


var httpProvider = module.exports = new EventEmitter();


Object.defineProperties(httpProvider, {
	"downloads": {
		get: function() { return downloads; }
	},

	"stats": {
		get: function() {
			return downloads.reduce(function(stats, download) {
				if (["complete", "error", "paused"].indexOf(download._state) === -1) {
					stats.active++;
					stats.downloadRate += download.downloadRate;
				}

				return stats;
			}, { active: 0, uploadRate: 0, downloadRate: 0 });
		}
	}
});

httpProvider.init = function(mongoose, logger, config) {
	var incoming = config.incoming || ".";
	downloads = [];

	var HTTPDownloadSchema = new mongoose.Schema({
		uri: String,
		paused: { type: Boolean, default: false },
		complete: { type: Boolean, default: false },
		size: { type: Number, default: -1 },
		downloaded: { type: Number, default: 0 },
		path: { type: String, default: "" }
	});


	HTTPDownloadSchema.methods._init = function() {
		this._parsed = url.parse(this.uri);
		this._buffers = [];

		if (this.path.length) {
			this.name = path.basename(this.path);
		} else {
			if (path.basename(this._parsed.pathname).length) {
				this.name = path.basename(this._parsed.pathname);
			} else {
				this.name = this.uri.replace(/[:\/]/g, "_");
			}

			this.path = path.join(incoming, this.name);
		}

		this._downloadRate = 0;
		this.seeders = 1;
		this.uploaded = 0;
		this.uploadRate = 0;
		this.leechers = 0;
		this.error = "";
		this._insecureSSL = null;

		this._flushing = false;
		this._rateStartTime = 0;
		this._rateLength = 0;

		if (this.paused) {
			this._setState("paused");
		} else if (this.complete) {
			this._setState("complete");
		} else {
			this._download();
		}
	};


	HTTPDownloadSchema.methods._setState = function(state, msg) {
		this._state = state;
		this.error = state === "error" ? (errors[msg] || msg) : "";

		if (state === "error" || state === "paused" || state === "complete") {
			this._downloadRate = 0;
		}

		if (state === "error") {
			this._abortDownload();

			if (msg === "DEPTH_ZERO_SELF_SIGNED_CERT") {
				// Self signed cert, mark it as such
				this._insecureSSL = false;
			}

			logger.error("Error downloading %s: %s", this.uri, msg);
		}

		if (state === "paused") {
			this._abortDownload();

			this.paused = true;
			this.save();
		}

		if (state === "complete") {
			delete this._response;
			delete this._request;

			this.complete = true;
			this.save();
		}

		httpProvider.emit("update", this);
	};


	HTTPDownloadSchema.methods._computeRate = function(buffer) {
		var now = Date.now();

		this._rateLength += buffer.length;

		if (now - this._rateStartTime > RATE_INTERVAL) {
			this._downloadRate = 1000 * this._rateLength / (now - this._rateStartTime);
			this._rateStartTime = now;
			this._rateLength = 0;

			httpProvider.emit("update", this);
		}
	};


	HTTPDownloadSchema.methods._writeBuffer = (function() {
		function flushNext(download) {
			download._flushing = true;

			if (download._buffers.length === 0) {
				if (download.size === download.downloaded) {
					logger.info("Completed %s", download.uri);
					download._setState("complete");
				}

				download._flushing = false;
			} else {
				var buf = download._buffers.shift();
				fs.appendFile(download.path, buf, function(err) {
					if (err) {
						download._setState("error", "Cannot append data to local file: " + err.message);
						return;
					}

					download.downloaded += buf.length;
					flushNext(download);
				});
			}
		}

		return function(buffer) {
			this._computeRate(buffer);
			this._buffers.push(buffer);

			if (!this._flushing) {
				flushNext(this);
			}
		};
	}());

	HTTPDownloadSchema.methods._download = function(uri) {
		var download = this,
			request;

		logger.info("Starting download for %s", this.uri);
		this._setState("initializing");

		var parsed = uri ? url.parse(uri) : this._parsed;

		if (this._parsed.protocol === "http:") {
			request = http;
		} else {
			request = https;
			this._parsed.rejectUnauthorized = !this._insecureSSL;
		}

		function checkDownloadedSize() {
			var deferred = when.defer();

			fs.stat(download.path, function(err, stat) {
				download.downloaded = (stat && stat.isFile()) ? stat.size : 0;
				download.save(function() {
					deferred.resolve();
				});
			});

			return deferred.promise;
		}

		function restartFromScratch() {
			fs.truncate(download.path, 0, function(err) {
				if (err) {
					download._setState("error", "Error truncating local file: " + err.message);
				} else {
					download._request.abort();
					delete download._request;
					delete download._response;

					download._download();
				}
			});
		}

		function doRequest() {
			if (download.downloaded > 0) {
				logger.debug("Requesting range %d- for %s", download.downloaded, download.uri);

				download._parsed.headers = {
					"Range": "bytes=" + download.downloaded + "-"
				};
			}

			download._request = request.get(download._parsed, function(response) {
				download._response = response;

				if (response.statusCode === 301 || response.statusCode === 302) {
					if (!("location" in response.headers)) {
						logger.warn("Redirect without location for %s", download.uri);
					} else {
						logger.warn("Redirect %s to %s", download.uri, response.headers.location);
						download._download(response.headers.location);
					}

					return;
				}

				if ([200, 206, 416].indexOf(response.statusCode) === -1) {
					download._setState("error", "HTTP status " + response.statusCode);
					return;
				}

				if (download.downloaded > 0) {
					// Range requested
					if (response.statusCode === 416) {
						logger.warn("Got HTTP 416 for %s, restarting from scratch", download.uri);
						restartFromScratch();
						return;
					}

					if (!("content-range" in response.headers)) {
						logger.warn("Server ignored range for %s, restarting from scratch", download.uri);
						restartFromScratch();
						return;
					}
				} else {
					download.size = parseInt(response.headers["content-length"], 10);
					download.save();
				}

				response.on("data", function(chunk) {
					download._setState("downloading");
					download._writeBuffer(chunk);
				});
			});

			download._request.on("error", function(e) {
				download._setState("error", e.message);
			});
		}

		checkDownloadedSize().then(doRequest);
	};


	HTTPDownloadSchema.methods._abortDownload = function() {
		if (this._response) {
			this._response.pause();
			delete this._response;
		}

		if (this._request) {
			this._request.abort();
			delete this._request;
		}
	};


	HTTPDownloadSchema.methods.cancel = function() {
		var download = this;

		function remove() {
			httpProvider.emit("remove", download);

			downloads.splice(downloads.indexOf(download), 1);
			download.remove();
		}

		if (this._state !== "complete") {
			this._abortDownload();
			fs.unlink(this.path, function() {
				remove();
			});
		} else {
			remove();
		}
	};


	HTTPDownloadSchema.methods.pause = function() {
		this._setState("paused");
	};


	HTTPDownloadSchema.methods.resume = function() {
		if (this._state === "paused") {
			this._download();
		}
	};


	HTTPDownloadSchema.methods.retry = function() {
		if (this._state === "error") {
			// Accept self signed certs when it was the cause of the error
			if (this._insecureSSL === false) {
				this._insecureSSL = true;
			}

			this._download();
		}
	};


	HTTPDownloadSchema.methods.buildSharedFile = function(builder, callback) {
		builder.addFile(path.basename(this.path), this.path);
		callback();
	};


	HTTPDownloadSchema.virtual("files").get(function() {
		var files = {};
		files[this.name] = this.size;
		return files;
	});


	HTTPDownloadSchema.virtual("state").get(function() {
		return this._state;
	});


	HTTPDownloadSchema.virtual("downloadRate").get(function() {
		return this._downloadRate;
	});

	HTTPDownload = mongoose.model("httpDownload", HTTPDownloadSchema);

	// Load and restart saved downloads
	HTTPDownload.find({}, function(err, items) {
		downloads = items || [];

		items.forEach(function(item) {
			item._init();
		});
	});
};


httpProvider.getDownload = function(id) {
	return downloads.filter(function(download) {
		return download.id == id;
	})[0];
};

httpProvider.addDownload = function(uri) {
	var download = new HTTPDownload({ uri: uri });
	download._init();
	downloads.push(download);

	httpProvider.emit("update", download);
};

httpProvider.canDownload = function(uri) {
	var parsed = url.parse(uri, true);

	if (parsed.protocol === "http:" || parsed.protocol === "https:") {
		return true;
	}

	return false;
};

httpProvider.pause = function() {
	downloads.forEach(function(download) {
		download.pause();
	});
};

httpProvider.resume = function() {
	downloads.forEach(function(download) {
		download.resume();
	});
};

