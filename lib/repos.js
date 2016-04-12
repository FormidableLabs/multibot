"use strict";

var async = require("async");
var github = require("octonode");
var jsdiff = require("diff");
var chalk = require("chalk");

var TEXT_PADDING_CHAR = "#";
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
  this._branch = argv.branch;
  this._branchNew = argv.branchNew;
  this._branchAllowExisting = argv.allowExisting;
  this._files = argv.files;
  this._repos = argv.repos;
  this._format = argv.format;
  this._transform = argv.transform;
};

/**
 * Format single repo path for text display.
 *
 * @param   {Array}   data  Repo data object
 * @returns {String}        Display-friendly string
 */
Repos.prototype._repoPathText = function (data) {
  return data.file ? [data.repo, data.file].join("/") : data.repo;
};

/**
 * Format meta information for a single repo for text/diff display.
 *
 * @param   {Array}   data  Repo data object
 * @returns {String}        Display-friendly string
 */
Repos.prototype._repoMetaText = function (data) {
  // Repo header.
  var repo = this._repoPathText(data);
  var padding = 5; // length of repo path + extra padding.
  var line = new Array(repo.length + padding).join(TEXT_PADDING_CHAR);

  // Branch, commit information for other data formats.
  var branch = data.branch || {};
  var commit = data.commit || {};

  return [
    line,
    [TEXT_PADDING_CHAR, repo, TEXT_PADDING_CHAR].join(" "),
    line,
    branch.src ? "# - Source Branch: " + branch.src : null,
    branch.dest ? "# - Dest Branch:   " + branch.dest : null,
    typeof branch.destExists !== "undefined" ? "# - Dest Exists?:  " + branch.destExists : null,
    commit.sha ? "# - Commit SHA:    " + commit.sha : null
  ].filter(function (o) { return !!o; }).join("\n");
};

/**
 * Format content for display.
 *
 * Data object format:
 *
 * ```
 * repo
 * file
 * content
 *   orig
 *   new
 * branch
 *   src
 *   dest
 *   destExists
 * commit
 *   sha
 * ```
 *
 * @param   {Array}   data  Array of data objects
 * @returns {String}        Display-friendly string
 */
Repos.prototype._toDisplay = function (data) {
  data = data || [];
  var self = this;

  if (this._format === "json") {
    return JSON.stringify(data, null, 2); // eslint-disable-line no-magic-numbers
  }

  if (this._format === "text") {
    return data.map(function (obj) {
      return [
        self._repoMetaText(obj),
        (obj.content || {}).new || ""
      ].join("\n");
    }).join("\n\n");
  }

  if (this._format === "diff") {
    return data.map(function (obj) {
      // Create diff header.
      var repo = self._repoPathText(obj);
      var header = self._repoMetaText(obj);
      var branch = obj.branch || {};

      // Only display diff if have old and new content.
      var content = obj.content || {};
      var output = "";
      if (typeof content.orig !== "undefined" && typeof content.new !== "undefined") {
        output = jsdiff.createPatch(repo, content.orig, content.new,
          branch.src || "<original>",
          branch.dest || "<transformed>"
        );
      }

      // Empty diff
      if (!output) {
        return header + "\n<no diff>";
      }

      // Color the diff like git does.
      return chalk.grey(header + "\n") + output.split("\n").map(function (line, i) {
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
 * Enhances error object and calls callback if error
 *
 * @param {Object}        err       Error object or falsy
 * @param {String}        msg       Message information to add to error.
 * @param {Function}      callback  Calls error callback if error `(err)`
 * @returns {Object|null}           Error if error, otherwise `null`.
 */
Repos.prototype._checkAndHandleError = function (err, msg, callback) {
  if (!err) { return null; }

  // Upgrade to new error here if upstream doesn't give us a stack.
  if (!err.stack) {
    err = new Error(err.message);
  }

  // Add path information for errors.
  if (msg) {
    err.message += " - " + msg;
  }

  // Callback
  callback(err);

  return err;
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
    self._client.repo(obj.repo).contents(obj.file, self._branch, function (err, data) {
      if (self._checkAndHandleError(err, [obj.repo, obj.file].join("/"), cb)) { return; }

      // Apply transform.
      var origContent = new Buffer(data.content, "base64").toString("utf8");
      self._transform(obj.repo, obj.file, origContent, function (transformErr, newContent) {
        cb(transformErr, {
          repo: obj.repo,
          file: obj.file,
          branch: {
            src: self._branch
          },
          content: {
            orig: origContent,
            new: newContent
          },
          commit: {
            sha: data.sha
          }
        });
      });
    });
  }, function (err, results) {
    callback(err, err ? null : self._toDisplay(results));
  });
};

/**
 * Create a branch in a remote repository.
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype.branch = function (callback) {
  var self = this;
  var branchSrc = self._branch;
  var branchDest = self._branchNew;

  // References are typically:
  //
  // - `refs/heads/<branch-name>`
  // - `refs/tags/<tag-name>`
  //
  // See: https://developer.github.com/v3/git/refs/#get-a-reference
  var branchSrcFull = "heads/" + branchSrc;
  // See: https://developer.github.com/v3/git/refs/#create-a-reference
  var branchDestFull = "heads/" + branchDest;

  // Although not the most efficient thing to do, we perform all read operations
  // first to detect and stop on any errors in any branches.
  async.auto({
    // Get the most recent commit of the source branch.
    getSrcRefs: function (cb) {
      async.map(self._repos, function (repo, repoCb) {
        self._client.repo(repo).ref(branchSrcFull, function (err, data) {
          if (self._checkAndHandleError(err, repo, repoCb)) { return; }
          repoCb(null, {
            repo: repo,
            data: data
          });
        });
      }, cb);
    },

    // Check if the destination branches exist.
    getDestRefs: function (cb) {
      async.map(self._repos, function (repo, repoCb) {
        self._client.repo(repo).ref(branchDestFull, function (err, data) {
          // Allow not found.
          var NOT_FOUND = 404;
          if (err && err.statusCode === NOT_FOUND) {
            repoCb(null, {
              repo: repo,
              exists: false,
              data: null
            });
            return;
          }

          // Real error.
          if (self._checkAndHandleError(err, repo, repoCb)) {
            return;
          }

          // Error if existing branches are not allowed.
          if (!self._branchAllowExisting) {
            repoCb(new Error(
              "Found existing dest branch in repo: " + repo + " with data: " +
              JSON.stringify(data)
            ));
            return;
          }

          // Have an allowed, existing branch.
          repoCb(null, {
            repo: repo,
            exists: true,
            data: data
          });
        });
      }, cb);
    },

    // Create a new branch of head ref of source branch.
    createDestRefs: ["getSrcRefs", "getDestRefs", function (cb, results) {
      async.map(self._repos, function (repo, repoCb) {
        var FIRST = 0;
        var srcObj = results.getSrcRefs.filter(function (o) { return o.repo === repo; })[FIRST];
        if (!srcObj) {
          repoCb(new Error("No source object for repo: " + repo)); // Programming error
          return;
        }

        var destObj = results.getDestRefs.filter(function (o) { return o.repo === repo; })[FIRST];
        if (!destObj) {
          repoCb(new Error("No destination object for repo: " + repo)); // Programming error
          return;
        }

        // Check if branch already exists and we allow that.
        if (destObj.exists) {
          repoCb(null, {
            repo: repo,
            branch: {
              src: branchSrc,
              dest: branchDest,
              destExists: true
            },
            commit: {
              sha: destObj.data.object.sha
            }
          });
          return;
        }

        // Get information for create, starting with source commit to base off.
        var sha = srcObj.data.object.sha;
        // Destination branch ref needs extra `refs/` prefix.
        var branchDestRef = "refs/" + branchDestFull;

        // Create the branch.
        self._client.repo(repo).createRef(branchDestRef, sha, function (err, data) {
          if (self._checkAndHandleError(err, repo, repoCb)) { return; }
          repoCb(null, {
            repo: repo,
            branch: {
              src: branchSrc,
              dest: branchDest,
              destExists: false
            },
            commit: {
              sha: data.object.sha
            }
          });
        });
      }, cb);
    }]
  }, function (err, results) {
    // Last transform has data in final format.
    var data = (results || {}).createDestRefs;

    callback(err, err ? null : self._toDisplay(data));
  });
};
