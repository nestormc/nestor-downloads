/*jshint node:true */
"use strict";

var httpProvider = require("./http");
var when = require("when");

var providers = {};
var mapDownloadProperties = [
		"name", "state", "size", "error",
		"downloaded", "downloadRate", "seeders",
		"uploaded", "uploadRate", "leechers",
		"files"
	];


function mapDownload(providerName, download) {
	var data = { _id: providerName + ":" + download.id, type: providerName };

	mapDownloadProperties.forEach(function(key) {
		data[key] = download[key];
	});

	return data;
}


/**
 * REST handlers
 */


function getAllDownloads(cb) {
	when.map(Object.keys(providers), function(name) {
		return when(providers[name].downloads).then(function(downloads) {
			return downloads.map(mapDownload.bind(null, name));
		});
	}).then(function(downloads) {
		cb(null, downloads.reduce(function(lst, providerDownloads) {
			return lst.concat(providerDownloads);
		}, []));
	}).otherwise(function(err) {
		cb(err);
	});
}


function countDownloads(req, cb) {
	function sendResponse() {
		cb(null, req._allDownloads.length);
	}

	if (!req._allDownloads) {
		getAllDownloads(function(err, downloads) {
			if (err) {
				return cb(err);
			}

			req._allDownloads = downloads;
			sendResponse();
		});
	} else {
		sendResponse();
	}
}


function listDownloads(req, offset, limit, cb)  {
	function sendResponse() {
		var list;

		if (limit > 0) {
			list = req._allDownloads.slice(offset, offset + limit);
		} else {
			list = req._allDownloads.slice(offset);
		}

		cb(null, list);
	}

	if (!req._allDownloads) {
		getAllDownloads(function(err, downloads) {
			if (err) {
				return cb(err);
			}

			req._allDownloads = downloads;
			sendResponse();
		});
	} else {
		sendResponse();
	}
}


function postDownload(req, cb) {
	var downloadUrl = req.body.url;
	var handled = Object.keys(providers).reduce(function(handled, name) {
			if (!handled) {
				if (providers[name].canDownload(downloadUrl)) {
					providers[name].addDownload(downloadUrl);
					return true;
				}
			}

			return false;
		}, false);

	if (handled) {
		process.nextTick(function() { cb(); });
	} else {
		process.nextTick(function() { cb.badRequest(); });
	}
}


function getStats(req, cb) {
	when.map(Object.keys(providers), function(name) {
		return providers[name].stats;
	}).then(function(pstats) {
		cb(null, pstats.reduce(function(stats, pstat) {
			stats.active += pstat.active;
			stats.uploadRate += pstat.uploadRate;
			stats.downloadRate += pstat.downloadRate;

			return stats;
		}, { active: 0, uploadRate: 0, downloadRate: 0 }));
	}).otherwise(function(err) {
		cb(err);
	});
}


function downloadHook(req, next) {
	var provider = providers[req.params.provider];

	if (!provider) {
		next.notFound();
	} else {
		when(provider.getDownload(req.params.id))
		.then(function(download) {
			if (!download) {
				next.notFound();
			} else {
				req.providerName = req.params.provider;
				req.download = download;
				next();
			}
		})
		.otherwise(function(err) {
			next(err);
		});
	}
}


function getDownload(req, cb) {
	process.nextTick(function() {
		cb(null, mapDownload(req.providerName, req.download));
	});
}


function deleteDownload(req, cb) {
	req.download.cancel();
	process.nextTick(function() { cb(); });
}


function putDownload(req, isPatch, cb) {
	if (!isPatch) {
		process.nextTick(function() {
			cb.methodNotAllowed();
		});
	} else {
		if ("action" in req.body) {
			if (req.body.action === "pause") {
				req.download.pause();
				return process.nextTick(function() { cb(); });
			}

			if (req.body.action === "resume") {
				req.download.resume();
				return process.nextTick(function() { cb(); });
			}

			if (req.body.action === "retry") {
				req.download.retry();
				return process.nextTick(function() { cb(); });
			}
		}

		process.nextTick(function() { cb.badRequest(); });
	}
}


/*!
 * Plugin interface
 */


function downloadsPlugin(nestor) {
	var logger = nestor.logger;
	var rest = nestor.rest;
	var mongoose = nestor.mongoose;
	var config = nestor.config;
	var intents = nestor.intents;
	var startup_done = false;

	var downloadsResource = rest.resource("downloads")
		.count(countDownloads)
		.list(listDownloads)
		.post(postDownload);

	downloadsResource.sub("stats")
		.get(getStats);

	downloadsResource.sub(":provider/:id")
		.hook(downloadHook)
		.get(getDownload)
		.del(deleteDownload)
		.put(putDownload);

	intents.on("downloads:provider", function(name, provider) {
		providers[name] = provider;

		provider.on("remove", function(download) {
			intents.emit("nestor:watchable:remove", "downloads", mapDownload(name, download));
		});

		provider.on("update", function(download) {
			intents.emit("nestor:watchable:save", "downloads", mapDownload(name, download));
		});

		if (startup_done && !provider.__initialized) {
			// Provider was declared after nestor:startup, initialize it
			provider.__initialized = true;
			provider.init(mongoose, logger, config);
		}
	});

	intents.on("nestor:startup", function() {
		intents.emit("nestor:watchable", "downloads");

		intents.emit("share:provider", "downloads", function(id, builder, callback) {
			var parts = id.split(":");
			var name = parts[0];
			var downloadId = parts[1];

			if (!(name in providers)) {
				return callback(new Error("Invalid resource id: " + id));
			}

			when(providers[name].getDownload(downloadId))
			.then(function(download) {
				if (!download) {
					return callback(new Error("Unknown download: " + id));
				}

				if (download.state !== "complete") {
					return callback(new Error("Download not yet complete: " + id));
				}

				download.buildSharedFile(builder, callback);
			})
			.otherwise(function(err) {
				callback(err);
			});
		});

		// Register built-in HTTP provider
		intents.emit("downloads:provider", "http", httpProvider);

		// Initialize providers
		startup_done = true;
		Object.keys(providers).forEach(function(name) {
			var provider = providers[name];

			if (!provider.__initialized) {
				provider.__initialized = true;
				provider.init(mongoose, logger, config);
			}
		});
	});
}


downloadsPlugin.manifest = {
	name: "downloads",
	description: "Downloads",
	client: {
		public: __dirname + "/client/public",
		build: {
			base: __dirname + "/client"
		}
	}
};


module.exports = downloadsPlugin;
