/*jshint node:true */
"use strict";

var url = require("url"),
	Client = require("node-torrent"),
	Torrent = require("node-torrent/lib/torrent"),

	client,
	incoming,
	sequence = 0,
	torrents = [];


function getFileTree(base, files) {
	var tree = {};

	if (base.charAt(base.length - 1) !== "/") {
		base = base + "/";
	}

	files.forEach(function(file) {
		var paths = file.path.substr(base.length).split("/"),
			name = paths.pop(),
			dir = tree;

		paths.forEach(function(path) {
			if (!(path in dir)) {
				dir[path] = {};
			}

			dir = dir[path];
		});

		dir[name] = file.length;
	});

	return tree;
}


function TorrentDownload(url, id) {
	var self = this;

	this.id = id;
	this.state = "initializing";
	this._hasInfo = false;
	this._torrent = client.addTorrent(url);

	this._torrent.on(Torrent.READY, function() {
		self._hasInfo = true;
		self.state = "ready";
	});

	this._torrent.on(Torrent.ERROR, function() {
		self.state = "error";
	});

	this._torrent.on(Torrent.COMPLETE, function() {
		self.state = "complete";
	});

	this._torrent.on(Torrent.PROGRESS, function() {
		self.state = "downloading";
	});
}


TorrentDownload.prototype = {
	cancel: function() {

	},

	pause: function() {
		return false;
	},

	resume: function() {
		return false;
	},

	buildSharedFile: function(builder, callback) {
		callback(new Error("Not implemented yet"));
	},

	get name() {
		return this._hasInfo ? this._torrent.name : "<unknown>";
	},

	get size() {
		return this._hasInfo ? this._torrent.size : -1;
	},

	get files() {
		return this.state === "initializing" ? {} : getFileTree(incoming, this._torrent.files);
	},

	get downloaded() {
		return this._torrent.stats.downloaded;
	},

	get downloadRate() {
		return this._torrent.stats.downloadRate;
	},

	get seeders() {
		return this._torrent.trackers.reduce(function(sum, tracker) {
			return sum + tracker.seeders;
		}, 0);
	},

	get uploaded() {
		return this._torrent.stats.uploaded;
	},

	get uploadRate() {
		return this._torrent.stats.uploadRate;
	},

	get leechers() {
		return this._torrent.trackers.reduce(function(sum, tracker) {
			return sum + tracker.leechers;
		}, 0);
	}
};


module.exports = {
	init: function(mongoose, logger, config) {
		/*incoming = config.incoming || ".";

		client = new Client({
			logLevel: "DEBUG",
			id: "-NS0001-",
			downloadPath: incoming
		});*/
	},

	get downloadCount() {
		return torrents.length;
	},

	get downloads() {
		return torrents;
	},

	get stats() {
		return torrents.reduce(function(stats, torrent) {
			if (torrent.state !== "complete" && torrent.state !== "error") {
				stats.active++;
			}

			stats.uploadRate += torrent.uploadRate;
			stats.downloadRate += torrent.downloadRate;

			return stats;
		}, { active: 0, uploadRate: 0, downloadRate: 0 });
	},

	getDownload: function(id) {
		return torrents.filter(function(torrent) {
			return torrent.id == id;
		})[0];
	},

	addDownload: function(uri) {
		var id = ++sequence;
		torrents.push(new TorrentDownload(uri, id));
	},

	canDownload: function(uri) {
		var parsed = url.parse(uri, true);

		if (parsed.protocol === "magnet:") {
			var urns = parsed.query.xt;

			if (!Array.isArray(urns)) {
				urns = [urns];
			}

			return urns.some(function(urn) {
				if (urn.match(/^urn:btih:/)) {
					return true;
				}
			});
		}

		return false;
	}
};