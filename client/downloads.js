/*jshint browser:true */
/*global define */

define([
	"ui", "router", "dom", "when", "ist",

	"resources",

	"ist!templates/downloadlist",
	"ist!templates/applet"
], function(ui, router, dom, when, ist, resources, downloadlistTemplate, appletTemplate) {
	"use strict";


	/*!
	 * Applet updater
	 */


	var renderedApplet;
	var appletWatcher;

	function renderApplet(view) {
		if (!renderedApplet) {
			renderedApplet = appletTemplate.render({});
			view.appendChild(renderedApplet);
		}

		resources.stats.get()
		.then(function(stats) {
			renderedApplet.update(stats);

			appletWatcher = resources.stats.watch();
			appletWatcher.updated.add(function(stats) {
				renderedApplet.update(stats);
			});
		});
	}



	/*!
	 * Download list config
	 */


	var contentListConfig = {
		resource: resources.downloads,
		fetcher: function() { return resources.downloads.list(); },
		dataMapper: function(downloads) {
			return { downloads: downloads };
		},

		behaviour: {
			"#startnew": {
				"click": function() {
					var input = ui.view("downloads").$("#uri");

					resources.downloads.download(input.value)
					.otherwise(function(err) {
						ui.error("Error starting new download", err);
					});

					input.value = "";
				}
			}
		},

		root: {
			template: downloadlistTemplate,
			selector: ".downloadlist",
			childrenArray: "downloads",
			childrenConfig: "download",
			childSelector: ".download, #startnew",
		},

		download: {
			template: ist("@use 'downloads-download'"),
			key: "_id",
			selector: ".download[data-id='%s']"
		},

		routes: {
			"!pause/:id": function(view, err, req, next) {
				resources.downloads.pause(req.match.id);
				next();
			},

			"!resume/:id": function(view, err, req, next) {
				resources.downloads.resume(req.match.id);
				next();
			},

			"!retry/:id": function(view, err, req, next) {
				resources.downloads.retry(req.match.id);
				next();
			},

			"!cancel/:id": function(view, err, req, next) {
				resources.downloads.cancel(req.match.id);
				next();
			}
		}
	};


	/*!
	 * UI signal handlers
	 */


	ui.started.add(function() {
		var appletView = ui.view("applet");
		appletView.show();
		renderApplet(appletView);

		var downloadsView = ui.view("downloads");
		ui.helpers.setupContentList(downloadsView, contentListConfig);
	});


	ui.stopping.add(function() {
		renderedApplet = null;

		if (appletWatcher) {
			appletWatcher.dispose();
			appletWatcher = null;
		}
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
				css: "downloads"
			},

			applet: {
				type: "applet",
				css: "applet"
			}
		}
	};
});