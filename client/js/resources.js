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
				return rest.patch("downloads/" + id, { action: "pause" });
			},

			resume: function(id) {
				return rest.patch("downloads/" + id, { action: "resume" });
			},

			cancel: function(id) {
				return rest.del("downloads/" + id);
			}
		},

		stats: {
			get: function() {
				return rest.get("downloads/stats");
			}
		}
	};
});