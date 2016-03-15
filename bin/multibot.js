#!/usr/bin/env node
"use strict";

var pkg = require("../package.json");
var yargs = require("yargs");

var Repos = require("../lib").Repos;

var TERMINAL_CHARS = 100;
var EXIT_ERROR = 1;
var NOT_FOUND = -1;

// Let's get argumentative.
var parseArgs = function () {
  return yargs
    .usage(pkg.description + "\n\nUsage: $0 --action=<string> [options]")

    // Actions
    .option("action", {
      describe: "Actions to take",
      type: "string",
      choices: ["read"],
      demand: true
    })
    .example(
      "$0 --action=read --gh-token=TOKEN --org FormidableLabs --repos multibot --files README.md",
      "Display the README file of multibot from GitHub"
    )

    // Branches
    .option("branch-src", {
      describe: "Source git branch to read from",
      type: "string",
      default: "master"
    })
    .option("branch-dst", {
      describe: "Destination git branch to write to",
      type: "string"
    })

    // Files
    .option("files", {
      describe: "List of files (space delimited) to read / transform",
      type: "array",
      demand: 1
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

    // Logistical
    .help("h").alias("h", "help")
    .version("v").alias("v", "version")
    .wrap(Math.min(TERMINAL_CHARS, yargs.terminalWidth()))
    .strict();
};

var validateArgs = function (parser) { // eslint-disable-line max-statements
  var argv = parser.argv;

  var fail = function (msg) {
    parser.showHelp();
    console.error("Error: " + msg); // eslint-disable-line no-console
    return false;
  };

  // Authentication
  if (!argv.ghUser && !argv.ghToken) {
    return fail("Must specify `--gh-user` + `--gh-pass` or `--gh-token`");
  }
  if (argv.ghUser && argv.ghToken) {
    return fail("Must specify either `--gh-user` + `--gh-pass` or `--gh-token`, not both");
  }

  // Repositories
  var org = argv.org;
  argv.repos = (argv.repos || []).map(function (repo) {
    // Return org-designated repos unchanged.
    if (repo.indexOf("/") > NOT_FOUND) {
      return repo;
    }

    if (!org) {
      throw new Error("Must specify org in `--org` or repo name. Found: " + repo);
    }

    return [org, repo].join("/");
  });

  // Transform
  var transform = argv.transform;
  if (transform) {
    try {
      argv.transform = require(transform); // eslint-disable-line global-require
    } catch (err) {
      console.error("Unable to import transform: " + transform); // eslint-disable-line no-console
      throw err;
    }
  } else {
    // Default to no-op transform.
    argv.transform = function (repo, file, contents, callback) { // eslint-disable-line max-params
      callback(null, contents);
    };
  }

  return argv;
};

// The main event.
var main = function () {
  var parser = parseArgs();
  var argv = validateArgs(parser);
  if (!argv) {
    process.exit(EXIT_ERROR); // eslint-disable-line no-process-exit
  }

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
