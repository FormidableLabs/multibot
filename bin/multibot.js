#!/usr/bin/env node
"use strict";

var args = require("../lib").args;
var Repos = require("../lib").Repos;

// The main event.
var main = function () {
  var parser = args.parse();
  var argv = args.validate(parser);

  // Set up repositories wrapper and action.
  var repos = new Repos({ argv: argv });
  var action = argv.action;

  // Validate: would be a programming error if hit this.
  if (!repos[action]) {
    throw new Error("Invalid action: " + action);
  }

  // Call actual action.
  repos[action](function (err, data) {
    if (err) {
      // Try to get full stack, then full string if not.
      console.error(err.stack || err.toString()); // eslint-disable-line no-console
    }

    if (data) {
      console.log(data); // eslint-disable-line no-console,no-magic-numbers
    }
  });
};

if (require.main === module) {
  main();
}
