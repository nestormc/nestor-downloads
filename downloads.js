/*jshint node:true */
"use strict";

var providers = {
		"bittorrent": require("./bittorrent"),
		"http": require("./http")
	};


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


function countDownloads(req, cb) {
	process.nextTick(function() {
		cb(null, Object.keys(providers).reduce(function(sum, name) {
			return sum + providers[name].downloadCount;
		}, 0));
	});
}


function listDownloads(req, offset, limit, cb)  {
	var list = Object.keys(providers).reduce(function(downloads, name) {
			return downloads.concat(providers[name].downloads.map(mapDownload.bind(null, name)));
		}, []);

	if (limit > 0) {
		list = list.slice(offset, offset + limit);
	} else {
		list = list.slice(offset);
	}

	process.nextTick(function() { cb(null, list); });
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
	process.nextTick(function() {
		cb(null, Object.keys(providers).reduce(function(stats, name) {
			var pstats = providers[name].stats;

			stats.active += pstats.active;
			stats.uploadRate += pstats.uploadRate;
			stats.downloadRate += pstats.downloadRate;

			return stats;
		}, { active: 0, uploadRate: 0, downloadRate: 0 }));
	});
}


function downloadHook(req, next) {
	var provider = providers[req.params.provider];

	if (!provider) {
		next.notFound();
	} else {
		var download = provider.getDownload(req.params.id);

		if (!download) {
			next.notFound();
		} else {
			req.providerName = req.params.provider;
			req.download = download;
			next();
		}
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
		}

		process.nextTick(function() { cb.badRequest(); });
	}
}


/**
 * Public interface
 */


exports.init = function(nestor) {
	var intents = nestor.intents;

	intents.on("nestor:rest", function(rest) {
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
	});

	Object.keys(providers).forEach(function(name) {
		providers[name].init(nestor.logger, nestor.config.downloads);
	});
};


exports.manifest = {
	name: "downloads",
	description: "Downloads",
	clientDir: __dirname + "/client"
};
