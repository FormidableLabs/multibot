"use strict";

/**
 * Thin wrapper around `github-api` to provide some missing features.
 */
var Github = require("github-api");

// Better version of fundamentals in `github-api`.
//
// Callbacks: `(err, res, xhr)`

// Unfortunately, `github-api` removes the `truncated` field from the get
// response, so we have to rewrite the method and keep all the data.
var getTree = function (repo, treeSha, callback) {
  callback = callback || function () {};
  return Github._request("GET", "/repos/" + repo + "/git/trees/" + treeSha, null, callback);
};

// For the post, we need want to allow an array to push
var postTree = function (repo, tree, baseTree, callback) { // eslint-disable-line max-params
  var data = {
    tree: tree
  };

  // Add base tree to force "update".
  if (baseTree) {
    data.base_tree = baseTree; // eslint-disable-line camelcase
  }

  callback = callback || function () {};
  return Github._request("POST", "/repos/" + repo + "/git/trees", data, callback);
};

// Raw commit (without user lookup, etc. in library).
// eslint-disable-next-line max-params
var postCommit = function (repo, parent, tree, message, callback) {
  var data = {
    message: message,
    parents: [parent],
    tree: tree
  };

  callback = callback || function () {};
  return Github._request("POST", "/repos/" + repo + "/git/commits", data, callback);
};

// Raw reference POST (doesn't exist in library).
// eslint-disable-next-line max-params
var postRef = function (repo, ref, sha, callback) {
  var data = {
    sha: sha,
    force: false // Disallow force pushes.
  };

  callback = callback || function () {};
  return Github._request("POST", "/repos/" + repo + "/git/refs/" + ref, data, callback);
};

// Want full error object passed back to us, so expose request promise.
var postPullRequest = function (repo, options, callback) {
  callback = callback || function () {};
  return Github._request("POST", repo + "/pulls", options, callback);
};

module.exports = {
  Github: Github,
  getTree: getTree,
  postTree: postTree,
  postCommit: postCommit,
  postRef: postRef,
  postPullRequest: postPullRequest
};
