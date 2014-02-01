/*jshint browser:true */
/*global define */

define([
	"ui", "router", "dom", "when",

	"resources",

	"ist!templates/downloadlist",
	"ist!templates/applet"
], function(ui, router, dom, when, resources, downloadlistTemplate, appletTemplate) {
	"use strict";

	var downloadResource = resources.downloads,
		downloadsContainer,
		renderedApplet,
		renderedDownloads;

	window.humanSize = function(size, suffix) {
		var suffixes = ["", "k", "M", "G", "T"];
		size = Math.floor(size);

		while (size > 1024) {
			size = size / 1024;
			suffixes.shift();
		}

		return (Math.floor(size * 10) / 10) + " " + suffixes[0] + suffix;
	};

	var downloadListBehaviour = {
		"#startnew": {
			"click": function() {
				var input = downloadsContainer.$("#uri");

				downloadResource.download(input.value)
				.otherwise(function(err) {
					ui.error("Error starting new download", err);
				});

				input.value = "";
			}
		}
	};

	function updateDownloads(done) {
		downloadResource.list()
		.then(function(downloads) {
			if (!renderedDownloads) {
				renderedDownloads = downloadlistTemplate.render({ downloads: downloads });
				downloadsContainer.appendChild(renderedDownloads);
			} else {
				renderedDownloads.update({ downloads: downloads });
			}

			downloadsContainer.behave(downloadListBehaviour);

			done();
		})
		.otherwise(function(err) {
			ui.error("Error while updating downloads", err);
		});
	}
	
	return {
		manifest: {
			"title": "downloads",
			"pages": {
				"downloads": { icon: "downloads" },
				"search": { icon: "search" }
			}
		},
		
		init: function() {
			ui.loadCSS("applet");

			router.on("downloads", function(err, req, next) {
				if (!downloadsContainer) {
					downloadsContainer = ui.container("downloads");
					downloadsContainer.setUpdater(updateDownloads, 1000);
				}

				downloadsContainer.show();
				next();
			});

			router.on("!pause/:id", function(err, req, next) {
				downloadResource.pause(req.match.id);
				next();
			});

			router.on("!resume/:id", function(err, req, next) {
				downloadResource.resume(req.match.id);
				next();
			});

			router.on("!cancel/:id", function(err, req, next) {
				downloadResource.cancel(req.match.id);
				next();
			});

			ui.stopping.add(function() {
				downloadsContainer = renderedApplet = renderedDownloads = null;
			});

			return when.resolve();
		},
		
		renderApplet: function() {
			renderedApplet = appletTemplate.render({});
			return renderedApplet;
		},

		updateApplet: function() {
			return resources.stats.get().then(function(stats) { renderedApplet.update(stats); });
		}
	};
});