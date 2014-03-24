/*jshint node:true*/
"use strict";

var spawn = require("child_process").spawn;
var fs = require("fs");
var path = require("path");


function spawnHandler(command, args, options, regex, callback) {
	var child = spawn(command, args, options);
	var output = "";
	var exited = false;
	var closed = false;
	var error;

	child.on("error", function(err) {
		callback(err);
	});

	function handleEnd(err) {
		if (err) {
			error = err;
		}

		if (exited && closed) {
			if (error) {
				callback(error);
				return;
			}

			callback(
				null,
				output.split("\n").reduce(function(names, line) {
					var match = line.match(regex);

					if (match) {
						names.push(match[1]);
					}

					return names;
				}, [])
			);
		}
	}

	child.stdout.on("data", function(chunk) {
		output += chunk.toString();
	});

	child.stdout.on("close", function() {
		closed = true;
		handleEnd();
	});

	child.on("exit", function(code, signal) {
		exited = true;

		if (code) {
			handleEnd(new Error(command + " exited with code " + code));
		} else if (signal) {
			handleEnd(new Error(command + " was killed with signal " + signal));
		} else {
			handleEnd();
		}
	});
}


var handlers = {
	"application/x-rar": function(file, source, callback) {
		spawnHandler(
			"unrar",
			["x", "y", file],
			{ cwd: path.dirname(file) },
			/^Extracting  (.+)\s+OK$/,
			function(err, files) {
				if (!err) {
					fs.unlink(file);
				}

				callback(err, files);
			}
		);
	},

	"application/zip": function(file, source, callback) {
		spawnHandler(
			"unzip",
			[file],
			{ cwd: path.dirname(file) },
			/^  inflating: (.+)$/,
			function(err, files) {
				if (!err) {
					fs.unlink(file);
				}

				callback(err, files);
			}
		);
	},

	"application/x-tar": function(file, source, callback) {
		spawnHandler(
			"tar",
			["xvf", file],
			{ cwd: path.dirname(file) },
			/^(.+)$/,
			function(err, files) {
				if (!err) {
					fs.unlink(file);
				}

				callback(err, files);
			}
		);
	},

	"application/x-gzip": function(file, source, callback) {
		spawnHandler(
			"gunzip",
			["-v"],
			{ cwd: path.dirname(file) },
			/replaced with (.+)$/,
			callback
		);
	},

	"application/x-bzip2": function(file, source, callback) {
		spawnHandler(
			"bunzip2",
			["-v"],
			{ cwd: path.dirname(file) },
			/^  (.+): done$/,
			callback
		);
	}
};


exports.register = function(mimetype, handler) {
	handlers[mimetype] = handler;
};

exports.canHandle = function(mimetype) {
	return mimetype in handlers;
};

exports.handle = function(path, mimetype, source, callback) {
	if (mimetype in handlers) {
		handlers[mimetype](path, source, callback);
	}
};
