/*jshint node:true */

var registry = require("nestor-plugin-registry");
var downloads = require("./downloads");

registry.add(downloads.manifest, downloads.init);
