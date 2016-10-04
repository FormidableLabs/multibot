"use strict";
/*eslint no-magic-numbers: [2, { "ignore": [0] }]*/

var async = require("async");
var jsdiff = require("diff");
var chalk = require("chalk");

var Github = require("github");

var TEXT_PADDING_CHAR = "#";
var DIFF_HEADER_LINES = 4; // number of lines in a diff output header.
var FORBIDDEN = 403;
var NOT_FOUND = 404;
var GH_API_VERSION = "3.0.0";

/**
 * Create a multi-repository client.
 *
 * @param {Object} opts       options
 * @param {object} opts.argv  Command line args
 * @returns {void}
 */
// eslint-disable-next-line max-statements
var Repos = module.exports = function (opts) {
  var argv = opts.argv || {};

  this._client = new Github({
    version: GH_API_VERSION,
    host: argv.ghHost,
    pathPrefix: argv.ghPathPrefix
  });

  // Authenticate.
  if (argv.ghUser && argv.ghPass) {
    this._client.authenticate({
      username: argv.ghUser,
      password: argv.ghPass,
      type: "basic"
    });
  } else if (argv.ghToken) {
    this._client.authenticate({
      token: argv.ghToken,
      type: "oauth"
    });
  } else {
    throw new Error("Must specify ghUser+ghPass or ghToken");
  }

  // Member state.
  this._branchSrc = argv.branchSrc;
  this._branchDest = argv.branchDest;
  this._allowExisting = argv.allowExisting;
  this._files = argv.files;
  this._repos = argv.repos;
  this._repoParts = this._repos.reduce(function (memo, repo) {
    var parts = repo.split("/");
    memo[repo] = { org: parts[0], repo: parts[1] }; // eslint-disable-line no-magic-numbers
    return memo;
  }, {});
  this._format = argv.format;
  this._transform = argv.transform;
  this._msg = argv.msg;
  this._title = argv.title;
  this._dryRun = argv.dryRun;
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
// eslint-disable-next-line complexity
Repos.prototype._repoMetaText = function (data) {
  // Repo header.
  var repo = this._repoPathText(data);
  var padding = 5; // length of repo path + extra padding.
  var line = new Array(repo.length + padding).join(TEXT_PADDING_CHAR);

  // Branch, commit information for other data formats.
  var content = data.content || {};
  var branch = data.branch || {};
  var commit = data.commit || {};
  var pr = data.pullRequest || {};
  var branchAction = typeof branch.destExists === "undefined" ? null :
    branch.destExists && "Noop (exists)" || "Create";
  var blobAction =
    content.create && "Create" ||
    content.update && "Update" ||
    content.delete && "Delete" ||
    null;

  return [
    line,
    [TEXT_PADDING_CHAR, repo, TEXT_PADDING_CHAR].join(" "),
    line,
    branch.src ? "# - Branch Source: " + branch.src : null,
    branch.dest ? "# - Branch Dest:   " + branch.dest : null,
    branchAction ? "# - Branch Action: " + branchAction : null,
    blobAction ? "# - Blob Action:   " + blobAction : null,
    pr.url ? "# - PR URL:        " + pr.url : null,
    typeof pr.exists !== "undefined" ? "# - PR Exists:     " + pr.exists : null,
    commit.sha ? "# - Git SHA:       " + commit.sha : null
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
 *   create
 *   update
 *   delete
 * branch
 *   src
 *   dest
 *   destExists
 * pullRequest
 *   url
 *   exists
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
    // eslint-disable-next-line complexity
    return data.map(function (obj) {
      // Create diff header.
      var repo = self._repoPathText(obj);
      var header = chalk.grey(self._repoMetaText(obj));
      var branch = obj.branch || {};

      // Only display diff if have old and new content.
      var content = obj.content || {};

      // Not a blob action.
      if (typeof content.orig === "undefined" && typeof content.new === "undefined") {
        return header;
      }

      // Check diff.
      var output = jsdiff.createPatch(
        repo,
        content.orig || "",
        content.new || "",
        branch.src || "<original>",
        branch.dest || (
          content.create && "<created>" ||
          content.update && "<updated>" ||
          content.delete && "<deleted>" ||
          "<unknown>"
        )
      );

      // Empty diff
      if (content.orig === content.new) {
        return header + chalk.bold("\n<noop>");
      }

      // Color the diff like git does.
      return header + "\n" + output.split("\n").map(function (line, i) {
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

  // If we're handed an API error object, translate it.
  if (!err.message && err.code) {
    // TODO: Can infer rate limit violations better looking at returned header
    // with: `X-RateLimit-Remaining`
    // https://github.com/FormidableLabs/multibot/issues/9
    if (err.code === FORBIDDEN) {
      err.message = "GitHub API FORBIDDEN Error (likely over rate limit): " + JSON.stringify(err);
    } else {
      err.message = "GitHub API Error: " + JSON.stringify(err);
    }
  }

  // Upgrade to new error here if upstream doesn't give us a stack.
  if (!err.stack) {
    err = new Error(err.message);
  }

  // Add path information for errors.
  if (msg) {
    err.stack = err.stack.replace("\n", " - (" + msg + ")\n");
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
  this._read(self._branchSrc, function (err, results) {
    callback(err, err ? null : self._toDisplay(results));
  });
};

/**
 * Read files from repositories (internal).
 *
 * @param {String}    branchSrc Branch to read from
 * @param {Function}  callback  Form `(err, data)`
 * @returns {void}
 */
Repos.prototype._read = function (branchSrc, callback) {
  var self = this;

  // Generate permutations of repos + files and read each.
  var lookups = self._repos.reduce(function (memo, repo) {
    return memo.concat(self._files.map(function (file) {
      return { repo: repo, file: file };
    }));
  }, []);

  async.map(lookups, function (obj, cb) {
    self._client.repos.getContent({
      user: self._repoParts[obj.repo].org,
      repo: self._repoParts[obj.repo].repo,
      path: obj.file,
      ref: branchSrc
    }, function (err, res) {
      res = res || {};
      var repoPath = [obj.repo, obj.file].join("/");

      // Check errors, infer existing or not content.
      var origContent;
      if (err && err.code === NOT_FOUND) {
        // Signal "doesn't exist" with `null`
        origContent = null;
      } else if (self._checkAndHandleError(err, repoPath, cb)) {
        // Other, real error;
        return;
      } else {
        // Have existing content.
        origContent = new Buffer(res.content, "base64").toString("utf8");
      }

      // Apply transform.
      self._transform({
        repo: obj.repo,
        file: obj.file,
        contents: origContent
      }, function (transformErr, newContent) {
        if (origContent === null && newContent === null) {
          self._checkAndHandleError(new Error("Cannot have both create + delete"), repoPath, cb);
          return;
        }

        // Valid transform.
        cb(transformErr, {
          repo: obj.repo,
          file: obj.file,
          branch: {
            src: branchSrc
          },
          content: {
            orig: origContent,
            new: newContent,
            create: origContent === null,
            update: origContent !== null && newContent !== null && origContent !== newContent,
            delete: newContent === null
          },
          commit: {
            sha: res.sha || null
          }
        });
      });
    });
  }, callback);
};

/**
 * Create a branch in a remote repository (internal).
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype.branch = function (callback) {
  var self = this;
  this._branch(function (err, results) {
    callback(err, err ? null : self._toDisplay(results));
  });
};

/**
 * Create a branch in a remote repository.
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype._branch = function (callback) {
  var self = this;
  var branchSrc = self._branchSrc;
  var branchDest = self._branchDest;

  // References are typically: `refs/(heads|tags)/<name>`
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
        self._client.gitdata.getReference({
          user: self._repoParts[repo].org,
          repo: self._repoParts[repo].repo,
          ref: branchSrcFull
        }, function (err, res) {
          if (self._checkAndHandleError(err, repo, repoCb)) { return; }
          repoCb(null, {
            repo: repo,
            sha: res.object.sha
          });
        });
      }, cb);
    },

    // Check if the destination branches exist.
    getDestRefs: function (cb) {
      async.map(self._repos, function (repo, repoCb) {
        self._client.gitdata.getReference({
          user: self._repoParts[repo].org,
          repo: self._repoParts[repo].repo,
          ref: branchDestFull
        }, function (err, res) {
          // Allow not found.
          if (err && err.code === NOT_FOUND) {
            repoCb(null, {
              repo: repo,
              exists: false,
              sha: null
            });
            return;
          }

          // Real error.
          if (self._checkAndHandleError(err, "branch.getDestRefs - " + repo, repoCb)) {
            return;
          }

          // Error if existing branches are not allowed.
          var sha = res.object.sha;
          if (!self._allowExisting) {
            self._checkAndHandleError(
              new Error("Found existing dest branch in repo: " + repo + " with sha: " + sha),
              null,
              repoCb);
            return;
          }

          // Have an allowed, existing branch.
          repoCb(null, {
            repo: repo,
            exists: true,
            sha: sha
          });
        });
      }, cb);
    },

    // MUTATION: Create a new branch of head ref of source branch.
    createDestRefs: ["getSrcRefs", "getDestRefs", function (results, cb) {
      // Data helper
      var mkData = function (repo, destExists, sha) {
        return {
          repo: repo,
          branch: {
            src: branchSrc,
            dest: branchDest,
            destExists: destExists
          },
          commit: {
            sha: sha
          }
        };
      };

      // Create new refs if needed.
      // eslint-disable-next-line max-statements
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
          repoCb(null, mkData(repo, true, destObj.sha));
          return;
        }

        // Dry run.
        if (self._dryRun) {
          repoCb(null, mkData(repo, false, "DRY_RUN_CREATE_BRANCH_REF_SHA"));
          return;
        }

        // Get information for create, starting with source commit to base off.
        var sha = srcObj.sha;
        // Destination branch ref needs extra `refs/` prefix.
        var branchDestRef = "refs/" + branchDestFull;

        // Create the branch.
        self._client.gitdata.createReference({
          user: self._repoParts[repo].org,
          repo: self._repoParts[repo].repo,
          ref: branchDestRef,
          sha: sha
        }, function (err, res) {
          if (self._checkAndHandleError(err, repo, repoCb)) { return; }
          repoCb(null, mkData(repo, false, res.object.sha));
        });
      }, cb);
    }]
  }, function (err, results) {
    // Last transform has data in final format.
    var data = (results || {}).createDestRefs;

    callback(err, err ? null : data);
  });
};

// Helper to convert our blob object to a form ready for a tree post.
Repos.prototype._blobToPostForm = function (blobObj) {
  return {
    path: blobObj.blob.file,
    mode: "100644", // Assume normal file.
    type: "blob",
    sha: blobObj.posted.sha
  };
};

// Helper to update an existing tree.
Repos.prototype._updateTree = function (destBlobs, srcTree, callback) {
  var self = this;
  var repo = srcTree.repo;

  // Get our list of just the blobs to update / create.
  var updateTree = destBlobs
    // Filter to blobs at issue in repo that were _posted_ or are creates.
    .filter(function (b) { return b.blob.repo === repo && b.posted.created; })
    // Map to update format.
    .map(function (b) { return self._blobToPostForm(b); });

  // Check if there are no actual changes (this can only happen in
  // the "no deletes" conditional branch because a delete is a change).
  var isNoop = updateTree.length === 0; // eslint-disable-line no-magic-numbers
  if (isNoop) {
    callback(null, {
      repo: repo,
      updateTree: updateTree,
      parentSha: srcTree.ref,
      sha: null,
      isNoop: isNoop
    });
    return;
  }

  // Dry run.
  if (self._dryRun) {
    callback(null, {
      repo: repo,
      updateTree: updateTree,
      parentSha: srcTree.ref,
      sha: "DRY_RUN_UPDATE_TREE_SHA",
      isNoop: isNoop
    });
    return;
  }

  // Actual update.
  // MUTATION: Post the tree update.
  self._client.gitdata.createTree({
    user: self._repoParts[repo].org,
    repo: self._repoParts[repo].repo,
    tree: updateTree,
    base_tree: srcTree.ref // eslint-disable-line camelcase
  }, function (err, res) {
    if (self._checkAndHandleError(err, repo, callback)) { return; }
    callback(null, {
      repo: repo,
      updateTree: updateTree,
      parentSha: srcTree.ref,
      sha: res.sha,
      isNoop: isNoop
    });
  });
};

// Helper to create a new tree.
Repos.prototype._createTree = function (destBlobs, srcTree, callback) {
  var self = this;
  var repo = srcTree.repo;

  // We have deletes, which means we have to rewrite the entire tree.
  //
  // Filter to current tree's blobs and create lookup table.
  var treeBlobs = destBlobs
    // Filter to blobs at issue in repo that were _posted_ or are deletes.
    .filter(function (b) {
      return b.blob.repo === repo && (b.blob.content.update || b.blob.content.delete);
    })
    // Create lookup object.
    .reduce(function (memo, b) {
      memo[b.blob.file] = b;
      return memo;
    }, {});

  // Prepare all the "create" additions to tree.
  var createBlobs = destBlobs
    // Filter to creates.
    .filter(function (b) { return b.blob.repo === repo && b.blob.content.create; })
    // Convert into tree post format.
    .map(function (b) { return self._blobToPostForm(b); });

  // Check for mismatches in tree vs. content.
  var mismatches = [];

  // Create a shallow array copy mutated for any tree blobs we _update_.
  var createTree = srcTree.tree
    // Filter to non-deleted blobs (so we delete from the tree).
    .filter(function (srcBlob) {
      var destBlob = treeBlobs[srcBlob.path];

      if (destBlob && destBlob.blob.content.delete) {
        // DELETE: Mark mutated and omit from final tree.
        return false;
      }

      // Otherwise keep - create, update, unchanged.
      return true;
    })

    // Map to proper POST-ing format.
    .map(function (srcBlob) {
      var destBlob = treeBlobs[srcBlob.path];

      // Tracking.
      if (destBlob && destBlob.commit && destBlob.commit.sha !== srcBlob.sha) {
        mismatches.push({
          srcBlob: srcBlob,
          destBlob: destBlob
        });
      }

      return !destBlob ? srcBlob : {
        path: srcBlob.path,
        mode: srcBlob.mode,
        type: srcBlob.type,
        sha: destBlob.posted.sha
      };
    })

    // Add in creates.
    .concat(createBlobs);

  // Validate no mismatches before we start any mutation.
  //
  // This could happen in between the time of getting the tree and the
  // specific contents.
  if (mismatches.length) {
    self._checkAndHandleError(
      new Error("Detected blob sha mismatches in " + repo + ": " + JSON.stringify(mismatches)),
      null,
      callback);
    return;
  }

  // Dry run.
  if (self._dryRun) {
    callback(null, {
      repo: repo,
      isNoop: false,
      createTree: createTree,
      parentSha: srcTree.ref,
      sha: "DRY_RUN_CREATE_TREE_SHA"
    });
    return;
  }

  // Actual create.
  // MUTATION: Post the tree create.
  self._client.gitdata.createTree({
    user: self._repoParts[repo].org,
    repo: self._repoParts[repo].repo,
    tree: createTree,
    base_tree: null // eslint-disable-line camelcase
  }, function (err, res) {
    if (self._checkAndHandleError(err, repo, callback)) { return; }
    callback(null, {
      repo: repo,
      isNoop: false,
      createTree: createTree,
      parentSha: srcTree.ref,
      sha: res.sha
    });
  });
};

/**
 * Create a commit in branch and push.
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype.commit = function (callback) {
  var self = this;
  this._commit(self._branchDest, function (err, results) {
    callback(err, err ? null : self._toDisplay(results));
  });
};

/**
 * Create a commit in branch and push (internal).
 *
 * We do these the "real" way using https://developer.github.com/v3/git/
 * with the following steps for each repo and 1+ files:
 *
 * - Get head ref and tree for repo
 * - Get contents of blob objects for the tree for our 1+ files
 * - Apply transforms to blob contents
 * - Post new blob objects after transforms
 * - Post new tree with new blob objects
 * - Create new commit from new tree
 * - Upate the branch reference to the new commit
 *
 * @param {String}    branchDest  Branch to read from _and_ target
 * @param {Function}  callback    Form `(err, data)`
 * @returns {void}
 */
Repos.prototype._commit = function (branchDest, callback) {
  var self = this;
  var branchDestFull = "heads/" + branchDest;

  // Although not the most efficient thing to do, we perform all read operations
  // first to detect and stop on any errors in any branches.
  async.auto({
    // Get all file contents from straight read.
    //
    // Note: We're typically reading from the _destination_ branch and ignoring
    // the `--branch-src` param because we want to keep updating the branch, not
    // overwrite it repeatedly from original source if multiple commits.
    //
    // However, for dry runs of `branch-to-pr` this switches back to
    // `--branch-src` because the destination branch doesn't exist.
    getSrcContents: self._read.bind(self, branchDest),

    // MUTATION: Now correlate updates and create new blobs.
    postDestBlobs: ["getSrcContents", function (results, cb) {
      var srcBlobs = results.getSrcContents;

      // MUTATION: POST blobs.
      async.map(srcBlobs, function (blob, blobCb) {
        // POST a new blob if creating / updating.
        // https://developer.github.com/v3/git/blobs/#create-a-blob
        if (blob.content.create || blob.content.update) {
          // Dry run.
          if (self._dryRun) {
            blobCb(null, {
              blob: blob,
              posted: {
                created: true,
                sha: "DRY_RUN_POST_BLOB_SHA"
              }
            });
            return;
          }

          // Actual POST.
          var repoPath = [blob.repo, blob.file].join("/");
          self._client.gitdata.createBlob({
            user: self._repoParts[blob.repo].org,
            repo: self._repoParts[blob.repo].repo,
            content: blob.content.new,
            encoding: "utf-8" // Hard code UTF8
          }, function (err, res) {
            if (self._checkAndHandleError(err, "commit.postDestBlobs - " + repoPath, blobCb)) {
              return;
            }

            blobCb(null, {
              blob: blob,
              posted: {
                created: true,
                sha: res.sha
              }
            });
          });
          return;
        }

        // NOOP: Not posting if unchanged or delete.
        blobCb(null, {
          blob: blob,
          posted: {
            created: false,
            sha: null
          }
        });
      }, cb);
    }],

    // Get the most recent refs + trees of the source branch.
    getSrcTrees: ["getSrcContents", function (results, cb) {
      var srcBlobs = results.getSrcContents;

      async.map(self._repos, function (repo, repoCb) {
        // We need to determine if we have a delete.
        // - If yes, we must get the entire non-truncated tree or error out.
        // - If yes, we just need to return the tree base reference.
        var hasDelete = srcBlobs.filter(function (b) {
          // Filter to just this repo's blobs with a delete.
          return b.repo === repo && b.content.delete === true;
        }).length > 0; // eslint-disable-line no-magic-numbers

        // Get destination reference.
        self._client.gitdata.getReference({
          user: self._repoParts[repo].org,
          repo: self._repoParts[repo].repo,
          ref: branchDestFull
        }, function (refErr, refRes) {
          if (self._checkAndHandleError(refErr, repo, repoCb)) { return; }

          // Destination ref SHA object.
          var ref = refRes.object.sha;

          // NO DELETES - Just return the tree sha.
          if (!hasDelete) {
            // Just send ref without a tree.
            repoCb(null, {
              repo: repo,
              ref: ref,
              tree: null,
              hasDelete: false
            });
            return;
          }

          // HAVE DELETES - Get tree recursively and ensure we're not truncated.
          self._client.gitdata.getTree({
            user: self._repoParts[repo].org,
            repo: self._repoParts[repo].repo,
            sha: ref,
            recursive: true
          }, function (treeErr, treeRes) {
            // GET error.
            if (self._checkAndHandleError(treeErr, repo, repoCb)) { return; }

            // We got truncated results. Right now we don't handle this
            // as the API suggests manually recursing trees / git cloning
            // locally.
            //
            // https://developer.github.com/v3/git/trees
            if (treeRes.truncated === true) {
              self._checkAndHandleError(
                new Error("Received truncated tree for: " + repo + " - " + JSON.stringify(treeRes)),
                null,
                repoCb
              );
              return;
            }

            // Capture ref + tree in object.
            repoCb(null, {
              repo: repo,
              ref: ref,
              tree: treeRes.tree,
              hasDelete: true
            });
          });
        });
      }, cb);
    }],

    // MUTATION: Create a new tree with updates, creates, deletes.
    postDestTrees: ["getSrcTrees", "postDestBlobs", function (results, cb) {
      var destBlobs = results.postDestBlobs;
      var srcTrees = results.getSrcTrees;

      // Create new destination trees by correlating the blobs.
      async.map(srcTrees, function (srcTree, treeCb) {
        if (srcTree.hasDelete) {
          // We have deletes. Get full tree and rewrite everything.
          self._createTree(destBlobs, srcTree, treeCb);
        } else {
          // No deletes. Simply update the tree.
          self._updateTree(destBlobs, srcTree, treeCb);
        }
      }, cb);
    }],

    // MUTATION: Post commit for each new tree.
    postDestCommits: ["postDestTrees", function (results, cb) {
      var destTrees = results.postDestTrees;

      // Create new commit for each new (non-noop) tree.
      async.map(destTrees, function (destTree, commitCb) {
        var repo = destTree.repo;

        // Noop.
        if (destTree.isNoop) {
          commitCb(null, {
            repo: repo,
            parentSha: destTree.parentSha,
            sha: null,
            isNoop: destTree.isNoop
          });
          return;
        }

        // Dry-run.
        if (self._dryRun) {
          commitCb(null, {
            repo: repo,
            parentSha: destTree.parentSha,
            sha: "DRY_RUN_POST_COMMIT_SHA",
            isNoop: destTree.isNoop
          });
          return;
        }

        // Actual commit.
        self._client.gitdata.createCommit({
          user: self._repoParts[repo].org,
          repo: self._repoParts[repo].repo,
          message: self._msg,
          tree: destTree.sha,
          parents: [destTree.parentSha]
        }, function (err, res) {
          if (self._checkAndHandleError(err, "commit.postCommit - " + repo, commitCb)) { return; }
          commitCb(null, {
            repo: repo,
            parentSha: destTree.parentSha,
            sha: res.sha,
            isNoop: destTree.isNoop
          });
        });
      }, cb);
    }],

    // MUTATION: Update branch to new commit sha.
    updateBranch: ["postDestCommits", function (results, cb) {
      var destCommits = results.postDestCommits;

      // Update branches for every non-noop commit.
      async.map(destCommits, function (destCommit, branchCb) {
        var repo = destCommit.repo;

        // Noop.
        if (destCommit.isNoop) {
          branchCb(null, {
            repo: repo,
            data: null,
            isNoop: destCommit.isNoop
          });
          return;
        }

        // Dry-run.
        if (self._dryRun) {
          branchCb(null, {
            repo: repo,
            data: "DRY_RUN_UPDATE_BRANCH_DATA",
            isNoop: destCommit.isNoop
          });
          return;
        }

        // Actual commit.
        self._client.gitdata.updateReference({
          user: self._repoParts[repo].org,
          repo: self._repoParts[repo].repo,
          ref: branchDestFull,
          sha: destCommit.sha,
          force: false
        }, function (err, res) {
          if (self._checkAndHandleError(err, "commit.postRef - " + repo, branchCb)) { return; }
          branchCb(null, {
            repo: repo,
            data: res,
            isNoop: destCommit.isNoop
          });
        });
      }, cb);
    }]
  }, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    // Mutate the contained blob with the new sha and destination branch.
    var data = (results || {}).postDestBlobs.map(function (blobObj) {
      var blob = blobObj.blob;
      blob.branch.dest = blob.branch.src;
      blob.commit.sha = blobObj.posted.sha;

      return blob;
    });

    callback(null, data);
  });
};

/**
 * Create a branch in a remote repository (internal).
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype.pullRequest = function (callback) {
  var self = this;
  this._pullRequest(function (err, results) {
    callback(err, err ? null : self._toDisplay(results));
  });
};

/**
 * Create a pull request in a remote repository.
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype._pullRequest = function (callback) {
  var self = this;
  var branchSrc = self._branchSrc;
  var branchDest = self._branchDest;
  var allowExisting = self._allowExisting;

  async.map(self._repos, function (repo, prCb) {
    // Dry run.
    if (self._dryRun) {
      prCb(null, {
        repo: repo,
        branch: {
          src: branchSrc,
          dest: branchDest
        },
        pullRequest: {
          url: "DRY_RUN_CREATE_PR_HTML_URL",
          exists: false
        },
        commit: {
          sha: "DRY_RUN_CREATE_PR_SHA"
        }
      });
      return;
    }

    // MUTATION: Create a pull request.
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    self._client.pullRequests.create({
      user: self._repoParts[repo].org,
      repo: self._repoParts[repo].repo,
      title: self._title,
      body: self._msg,
      base: branchSrc,
      head: branchDest
    }, function (err, res) {
      res = res || {};
      var prExists = false;

      // Error handling: parse up error object.
      if (err) {
        var errObj = null;
        try {
          errObj = JSON.parse(err.message);
        } catch (jsonErr) { /* ignore JSON parse error */ }

        // First check if allow existing PR.
        if (allowExisting && errObj && errObj.errors && errObj.errors[0] &&
          errObj.errors[0].message.indexOf("A pull request already exists for") === 0) {
          prExists = true;

        // Fallback to normal error handling.
        } else if (self._checkAndHandleError(
          err, "pullRequest.createPullRequest - " + repo, prCb)) {
          return;
        }
      }

      prCb(null, {
        repo: repo,
        branch: {
          src: branchSrc,
          dest: branchDest
        },
        pullRequest: {
          url: res.html_url,
          exists: prExists
        },
        commit: {
          sha: (res.head || {}).sha
        }
      });
    });
  }, callback); // Data is in final form already.
};

/**
 * Create full flow of branch through pull request.
 *
 * @param {Function} callback Form `(err, data)`
 * @returns {void}
 */
Repos.prototype.branchToPr = function (callback) {
  var self = this;
  // If dry run, destination branch won't exist.
  var branchDest = self._dryRun ? self._branchSrc : self._branchDest;

  async.auto({
    branch: self._branch.bind(self),

    commit: ["branch", function (results, cb) { self._commit(branchDest, cb); }],

    pullRequest: ["commit", function (results, cb) { self._pullRequest(cb); }]
  }, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    // Get maps for `branch` and `pulRequest` info.
    var branchMap = results.branch.reduce(function (memo, obj) {
      memo[obj.repo] = obj;
      return memo;
    }, {});
    var pullRequestMap = results.pullRequest.reduce(function (memo, obj) {
      memo[obj.repo] = obj;
      return memo;
    }, {});

    // Mutate and splice in branch and PR information to each file at issue.
    var data = results.commit.map(function (obj) {
      obj.branch = branchMap[obj.repo].branch;
      obj.pullRequest = pullRequestMap[obj.repo].pullRequest;
      return obj;
    });

    callback(null, self._toDisplay(data));
  });
};
