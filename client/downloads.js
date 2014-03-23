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

		root: {
			template: downloadlistTemplate,
			selector: ".downloadlist",
			childrenArray: "downloads",
			childrenConfig: "download",
			childSelector: ".download, .content-box-actions",
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

		var addView = ui.view("new-download");
		var addForm = ui.helpers.form({
			title: "Add new download",
			submitLabel: "Add",
			cancelLabel: "Cancel",

			onSubmit: function(values) {
				resources.downloads.download(values.uri);
				addView.hide();
			},

			onCancel: function() {
				addView.hide();
			},

			fields: [
				{
					type: "text", name: "uri", label: "Download URL",  value: "",
					validate: function(value) {
						if (!value.match(/^(https?|magnet):/)) {
							return "Invalid URL";
						}
					}
				}
			]
		});

		addView.appendChild(addForm);
		addView.displayed.add(function() { addForm.focus(); });

		router.on("!add", function(err, req, next) {
			addView.show();
			addView.resize();

			addForm.setValues({ uri: "" });

			next();
		});
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
			},

			"new-download": {
				type: "popup"
			}
		}
	};
});