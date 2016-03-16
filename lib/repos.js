"use strict";

var async = require("async");
var github = require("octonode");
var jsdiff = require("diff");
var chalk = require("chalk");

var TEXT_PADDING_CHAR = "*";
var DIFF_HEADER_LINES = 4; // number of lines in a diff output header.

/**
 * Create a multi-repository client.
 *
 * @param {Object} opts       options
 * @param {object} opts.argv  Command line args
 * @returns {void}
 */
var Repos = module.exports = function (opts) {
  var argv = opts.argv || {};

  // Authenticate.
  this._client = null;
  if (argv.ghUser && argv.ghPass) {
    this._client = github.client({
      username: argv.ghUser,
      password: argv.ghPass
    });
  } else if (argv.ghToken) {
    this._client = github.client(argv.ghToken);
  } else {
    throw new Error("Must specify ghUser+ghPass or ghToken");
  }

  // Member state.
  this._files = argv.files;
  this._repos = argv.repos;
  this._format = argv.format;
  this._transform = argv.transform;
};

/**
 * Format content for display.
 *
 * @param   {Array}   data  Array of `{ file, repo, origContent, content }` objects.
 * @returns {String}        Display-friendly string.
 */
Repos.prototype._toDisplay = function (data) {
  data = data || [];

  if (this._format === "json") {
    return JSON.stringify(data, null, 2); // eslint-disable-line no-magic-numbers
  }

  if (this._format === "text") {
    return data.map(function (obj) {
      var repoPath = [obj.repo, obj.file].join("/");
      var padding = 5; // length of repo path + extra padding.
      var line = new Array(repoPath.length + padding).join(TEXT_PADDING_CHAR);

      return [
        line,
        [TEXT_PADDING_CHAR, repoPath, TEXT_PADDING_CHAR].join(" "),
        line,
        obj.content
      ].join("\n");
    }).join("\n\n");
  }

  if (this._format === "diff") {
    return data.map(function (obj) {
      var repoPath = [obj.repo, obj.file].join("/");
      var diff = jsdiff.createPatch(
        repoPath, obj.origContent, obj.content, "<original>", "<transformed>");

      // Color the diff like git does.
      return diff.split("\n").map(function (line, i) {
        if (i < DIFF_HEADER_LINES) { return chalk.bold(line); }
        if (/^\@/.test(line)) { return chalk.cyan(line); }
        if (/^\-/.test(line)) { return chalk.red(line); }
        if (/^\+/.test(line)) { return chalk.green(line); }
        return line;
      }).join("\n");
    }).join("\n\n");
  }

  // Programming error.
  throw new Error("Unknown format: " + this._format);
};

/**
 * Read files from repositories.
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype.read = function (callback) {
  var self = this;

  // Generate permutations of repos + files and read each.
  var lookups = self._repos.reduce(function (memo, repo) {
    return memo.concat(self._files.map(function (file) { return { repo: repo, file: file }; }));
  }, []);

  async.map(lookups, function (obj, cb) {
    self._client.repo(obj.repo).contents(obj.file, function (err, data) {
      if (err) {
        // Upgrade to new error here if upstream doesn't give us a stack.
        if (!err.stack) {
          err = new Error(err.message);
        }

        // Add path information for errors.
        err.message += " - " + [obj.repo, obj.file].join("/");

        cb(err);
        return;
      }

      // Apply transform.
      var origContent = new Buffer(data.content, "base64").toString("utf8");
      self._transform(obj.repo, obj.file, origContent, function (transformErr, newContent) {
        cb(transformErr, {
          repo: obj.repo,
          file: obj.file,
          origContent: origContent,
          content: newContent
        });
      });
    });
  }, function (err, results) {
    callback(err, err ? null : self._toDisplay(results));
  });
};
