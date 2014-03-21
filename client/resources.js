/*jshint browser:true */
/*global define */

define(["rest", "io"], function(rest, io) {
	"use strict";

	return {
		downloads: {
			list: function() {
				return rest.list("downloads", { limit: 0 });
			},

			watch: function() {
				return io.watch("downloads");
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

			retry: function(id) {
				return rest.patch("downloads/" + id.replace(/:/g, "/"), { action: "retry" });
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