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
    var branchSrc = this.argv.branchSrc;
    var branchDest = this.argv.branchDest;

    // Failsafe: do not allow direct commits / anything to master.
    if (branchDest === "master") {
      this._fail("Cannot commit use `master` as destination branch");
    }

    if (action === "read" || action === "commit") {
      if (!this.argv.files || this.argv.files.length === EMPTY_ARRAY) {
        this._fail("Must specify 1+ `--files`");
      }
    }

    if (action === "commit") {
      if (!this.argv.msg) {
        this._fail("Commit requires `--msg=<message>`");
      }
    }

    if (action === "branch") {
      if (!branchDest) {
        this._fail("Must specify `--branch-dest` name for `branch` action");
      }

      if (branchSrc === branchDest) {
        this._fail("`--branch-dest` and `--branch-src` cannot be the same");
      }
    }

    if (action === "pull-request") {
      if (!this.argv.msg) {
        this._fail("PR requires `--msg=<message>`");
      }

      // Default title to first line of message.
      if (!this.argv.title) {
        this.argv.title = this.argv.msg.split("\n", 1)[0]; // eslint-disable-line no-magic-numbers
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
        choices: ["read", "branch", "commit", "pull-request"],
        default: "read"
      })
      .example(
        "$0 --action=read --gh-token=TOKEN --org FormidableLabs --repos repo1 repo2 " +
        "--files README.md",
        "Display the README file of multibot from GitHub"
      )
      .example(
        "$0 --action=branch --gh-token=TOKEN --org FormidableLabs --repos repo1 repo2 " +
        "--branch-dest=feature-foo",
        "Create new `feature-foo` branch"
      )
      .example(
        "$0 --action=commit --gh-token=TOKEN --org FormidableLabs --repos repo1 repo2 " +
        "--files README.md --transform=/PATH/TO/transform.js --msg='commit bot'",
        "Add transform of README as commit to branch `feature-foo`"
      )
      .example(
        "$0 --action=pull-request --gh-token=TOKEN --org FormidableLabs --repos repo1 repo2 " +
        "--branch-dest=feature-foo --title='PR from Bot' --msg='BotBot'",
        "Create pull request for `feature-foo` branch"
      )
      // TODO(2): `branch-to-pr` example.

      // Branches
      .option("branch-src", {
        describe: "Source branch to start from / target for pull request",
        type: "string",
        default: "master"
      })
      .option("branch-dest", {
        describe: "Destination branch to create / commit / open in a pull request",
        type: "string"
      })
      .option("allow-existing", {
        describe: "Allow existing destination branches / PRs for `--action=branch|pull-request`?",
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
      .option("msg", {
        describe: "Commit message / pull request description",
        type: "string"
      })
      .option("title", {
        describe: "Title for pull request (fallback to first line of `--msg`)",
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
