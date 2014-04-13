/*jshint browser:true */
/*global define */

define([
	"ui", "router", "dom", "when", "ist",

	"resources",

	"ist!templates/downloadlist",
	"ist!templates/applet",
	"ist!templates/search"
], function(ui, router, dom, when, ist, resources, downloadlistTemplate, appletTemplate, searchTemplate) {
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


	function getDownloadsFetcher() {
		var fetched = false;

		return function() {
			if (fetched) {
				return when.resolve([]);
			} else {
				fetched = true;
				return resources.downloads.list();
			}
		};
	}


	var contentListConfig = {
		resource: resources.downloads,
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

		contentListConfig.fetcher = getDownloadsFetcher();
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

		var searchView = ui.view("search");
		var searchForm;
		var searchContext = {};
		var searchRendered;

		searchView.displayed.add(function() {
			if (!searchForm) {
				resources.searchers()
				.then(function(searcherlist) {
					var searchers = {};
					searcherlist.forEach(function(searcher) {
						searchers[searcher] = searcher;
					});

					searchForm = ui.helpers.form({
						title: "Search for downloads",
						submitLabel: "Search",

						onSubmit: function(values) {
							searchContext.search = { loading: true, searcher: values.searcher, query: values.query };
							searchRendered.update();

							resources.search(values.searcher, values.query)
							.then(function(results) {
								searchContext.search = { loading: false, results: results };
								searchRendered.update();
							});
						},

						fields: [
							{ type: "select", name: "searcher", label: "Search on", value: "", options: searchers },
							{ type: "text", name: "query", label: "Search query", value: "" }
						]
					});

					searchContext = { searchForm: searchForm };
					searchRendered = searchTemplate.render(searchContext);
					searchView.appendChild(searchRendered);
				});
			}
		});


		router.on("!download/:uri", function(err, req, next) {
			resources.downloads.download(req.match.uri);
			next();
		});

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
				icon: "downloads:downloads",
				css: "downloads"
			},

			search: {
				type: "main",
				link: "search",
				icon: "downloads:search"
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
