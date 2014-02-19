/*jshint browser:true */
/*global define */

define(["when", "rest"], function(when, rest) {
	"use strict";
	
	return {
		downloads: {
			list: function() {
				return rest.list("downloads", { limit: 50 });
			},

			download: function(url) {
				return rest.post("downloads", { url: url });
			},

			pause: function(id) {
				return rest.patch("downloads/" + id.replace(/:/g, "/"), { action: "pause" });
			},

			resume: function(id) {
				return rest.patch("downloads/" + id.replace(/:/g, "/"), { action: "resume" });
			},

			cancel: function(id) {
				return rest.del("downloads/" + id.replace(/:/g, "/"));
			}
		},

		stats: {
			get: function() {
				return rest.get("downloads/stats");
			}
		}
	};
});