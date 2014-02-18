/*jshint browser:true */
/*global define */

define([
	"ui", "router", "dom", "when",

	"resources",

	"ist!templates/downloadlist",
	"ist!templates/applet"
], function(ui, router, dom, when, resources, downloadlistTemplate, appletTemplate) {
	"use strict";
	

	/*!
	 * Applet updater
	 */


	var renderedApplet;
	function updateApplet(done) {
		if (!renderedApplet) {
			renderedApplet = appletTemplate.render({});
			ui.view("applet").appendChild(renderedApplet);
		}
		
		resources.stats.get().then(function(stats) {
			if (renderedApplet) {
				renderedApplet.update(stats);
			}

			done();
		});
	}



	/*!
	 * Download list updater
	 */


	var downloadListBehaviour = {
		"#startnew": {
			"click": function() {
				var input = ui.view("downloads").$("#uri");

				downloadResource.download(input.value)
				.otherwise(function(err) {
					ui.error("Error starting new download", err);
				});

				input.value = "";
			}
		}
	};


	var downloadResource = resources.downloads;
	var renderedDownloads;
	function updateDownloads(done) {
		downloadResource.list()
		.then(function(downloads) {
			var view = ui.view("downloads");

			if (!renderedDownloads) {
				renderedDownloads = downloadlistTemplate.render({ downloads: downloads });
				view.appendChild(renderedDownloads);
			} else {
				renderedDownloads.update({ downloads: downloads });
			}

			view.behave(downloadListBehaviour);

			done();
		})
		.otherwise(function(err) {
			ui.error("Error while updating downloads", err);
		});
	}



	/*!
	 * UI signal handlers
	 */


	ui.started.add(function() {
		ui.view("applet").show();

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
	});


	ui.stopping.add(function() {
		renderedApplet = renderedDownloads = null;
	});



	/*!
	 * Plugin manifest
	 */


	return {
		title: "downloads",
		views: {
			downloads: {
				type: "main",
				link: "downloads",
				icon: "downloads",
				updater: updateDownloads
			},

			applet: {
				type: "applet",
				css: "applet",
				updater: updateApplet
			}
		}
	};
});