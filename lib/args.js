"use strict";

var pkg = require("../package.json");
var yargs = require("yargs");

var TERMINAL_CHARS = 100;
var NOT_FOUND = -1;
var EMPTY_ARRAY = 0;

/**
 * Validation wrapper
 *
 * @param {Object} parser yargs parser object
 * @returns {void}
 */
var Validate = function Validate(parser) {
  this.parser = parser;
  this.argv = parser.argv;
};

Validate.prototype = {
  _fail: function (msgOrErr) {
    this.parser.showHelp();
    var err = msgOrErr instanceof Error ? msgOrErr : new Error(msgOrErr);
    throw err;
  },

  authentication: function () {
    if (!this.argv.ghUser && !this.argv.ghToken) {
      this._fail("Must specify `--gh-user` + `--gh-pass` or `--gh-token`");
    }
    if (this.argv.ghUser && this.argv.ghToken) {
      this._fail("Must specify either `--gh-user` + `--gh-pass` or `--gh-token`, not both");
    }

    return this;
  },

  repos: function () {
    var org = this.argv.org;
    this.argv.repos = (this.argv.repos || []).map(function (repo) {
      // Return org-designated repos unchanged.
      if (repo.indexOf("/") > NOT_FOUND) {
        return repo;
      }

      if (!org) {
        this._fail("Must specify org in `--org` or repo name. Found: " + repo);
      }

      return [org, repo].join("/");
    }.bind(this));

    return this;
  },

  transform: function () {
    var transform = this.argv.transform;
    if (transform) {
      try {
        this.argv.transform = require(transform); // eslint-disable-line global-require
      } catch (err) {
        this._fail("Unable to import transform: " + transform + " with error: " + err.message);
      }
    } else {
      // Default to no-op transform.
      this.argv.transform = function (opts, callback) {
        callback(null, opts.contents);
      };
    }

    return this;
  },

  /*eslint-disable complexity,max-statements*/
  action: function () {
    var action = this.argv.action;
    var branch = this.argv.branch;
    var branchNew = this.argv.branchNew;

    if (action === "read" || action === "commit") {
      if (!this.argv.files || this.argv.files.length === EMPTY_ARRAY) {
        this._fail("Must specify 1+ `--files`");
      }
    }

    if (action === "commit") {
      if (branch === "master") {
        this._fail("Cannot commit directly to `master` branch");
      }

      if (!this.argv.commitMsg) {
        this._fail("Commit requires `--commit-msg=<message>`");
      }
    }

    if (action === "branch") {
      if (!branchNew) {
        this._fail("Must specify `--branch-new` name for `branch` action");
      }

      if (branchNew === "master") {
        this._fail("`--branch-new` cannot be `master`");
      }

      if (branch === branchNew) {
        this._fail("`--branch-new` and `--branch` cannot be the same");
      }
    }

    if (action === "pull-request") {
      if (branch === "master") {
        this._fail("Cannot create a pull request from `master` branch");
      }
    }

    return this;
  }
  /*eslint-enable complexity,max-statements*/
};

// Args wrapper.
module.exports = {
  parse: function () {
    return yargs
      .usage(pkg.description + "\n\nUsage: $0 --action=<string> [options]")

      // Actions
      .option("action", {
        describe: "Actions to take",
        type: "string",
        choices: ["read", "branch", "commit"],
        default: "read"
      })
      .example(
        "$0 --action=read --gh-token=TOKEN --org FormidableLabs --repos multibot --files README.md",
        "Display the README file of multibot from GitHub"
      )
      // TODO: `full-pr` example.

      // Branches
      .option("branch", {
        describe: "Target branch to use for operations",
        type: "string",
        default: "master"
      })
      .option("branch-new", {
        describe: "New branch to create for `--action=branch`",
        type: "string"
      })
      .option("allow-existing", {
        describe: "Allow existing destination branches for `--action=branch`?",
        type: "boolean",
        default: true
      })

      // Files
      .option("files", {
        describe: "List of files (space delimited) to read / transform",
        type: "array"
      })

      // Respositories
      .option("org", {
        describe: "GitHub organization for repos (can be instead specified on repos)",
        type: "string"
      })
      .option("repos", {
        describe: "GitHub repositories (space delimited) of form `repo` or `org/repo`",
        type: "array",
        demand: 1,
        global: true
      })

      // Authentication: user + pass
      .option("gh-user", {
        describe: "GitHub user name (needs user + pass)",
        type: "string"
      })
      .implies("gh-user", "gh-pass")
      .option("gh-pass", {
        describe: "GitHub password (needs user + pass)",
        type: "string"
      })
      .implies("gh-pass", "gh-user")

      // Authentication: token
      .option("gh-token", {
        describe: "GitHub token",
        type: "string"
      })

      // Transform
      .option("transform", {
        describe: "Path to transform JS file",
        type: "string"
      })

      // Display
      .option("format", {
        describe: "Display output format",
        type: "string",
        choices: ["json", "text", "diff"],
        default: "json"
      })

      // Misc.
      .option("commit-msg", {
        describe: "A commit message for the transform",
        type: "string"
      })
      .option("dry-run", {
        describe: "Skip / simulate all mutating actions",
        type: "boolean",
        default: false
      })

      // Logistical
      .help().alias("h", "help")
      .version().alias("v", "version")
      .wrap(Math.min(TERMINAL_CHARS, yargs.terminalWidth()))
      .strict();
  },

  validate: function (parser) {
    return new Validate(parser)
      .authentication()
      .repos()
      .transform()
      .action()
      .argv;
  }
};
