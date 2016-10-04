[![Travis Status][trav_img]][trav_site]
<!--[![Coverage Status][cov_img]][cov_site]-->

multibot
========

A programmatic multi-repository helper.

Multibot allows you to invoke actions (`read`, etc.) on 1+ files in 1+
repositories concurrently. It is meant to be a helper tool for multi-project
updates, branches, pull requests, etc.

## Install

```sh
$ npm install multibot
```

## Usage

```
A friendly multi-repository robot.

Usage: multibot --action=<string> [options]

Options:
  --action          Actions to take
    [string] [choices: "read", "branch", "commit", "pull-request", "branch-to-pr"] [default: "read"]
  --branch-src      Source branch to start from / target for pull request
                                                                        [string] [default: "master"]
  --branch-dest     Destination branch to create / commit / open in a pull request          [string]
  --allow-existing  Allow existing destination branches / PRs for `--action=branch|pull-request`?
                                                                          [boolean] [default: false]
  --files           List of files (space delimited) to read / transform                      [array]
  --org             GitHub organization for repos (can be instead specified on repos)       [string]
  --repos           GitHub repositories (space delimited) of form `repo` or `org/repo`
                                                                                  [array] [required]
  --gh-user         GitHub user name (needs user + pass)                                    [string]
  --gh-pass         GitHub password (needs user + pass)                                     [string]
  --gh-token        GitHub token                                                            [string]
  --auth            Use authentication (limited functionality without)     [boolean] [default: true]
  --gh-host         GitHub host URL (for enterprise)                                        [string]
  --gh-path-prefix  GitHub path prefix (for enterprise). E.g., '/api/v3'                    [string]
  --transform       Path to transform JS file                                               [string]
  --format          Display output format
                                        [string] [choices: "json", "text", "diff"] [default: "diff"]
  --msg             Commit message / pull request description                               [string]
  --title           Title for pull request (fallback to first line of `--msg`)              [string]
  --dry-run         Skip / simulate all mutating actions                  [boolean] [default: false]
  -h, --help        Show help                                                              [boolean]
  -v, --version     Show version number                                                    [boolean]

Examples:
  multibot --action=branch-to-pr --gh-token=TOKEN     Create branch, commits, and PR for new
  --org FormidableLabs --repos repo1 repo2 --files    `feature-foo` branch
  README.md --transform=/PATH/TO/transform.js
  --branch-dest=feature-foo --title='PR from Bot'
  --msg='BotBot'
```

## Transforms

The bread and butter of Multibot is actually _changing_ files across many
projects in a sensible and predictable way. A "transform" is really just a JS
file exporting a method with the following signature:

```js
/**
 * Transform contents of file to new format.
 *
 * @param {Object}    obj           File object.
 * @param {String}    obj.repo      Repository name
 * @param {String}    obj.file      File path
 * @param {String}    obj.contents  UTF8 content of file (or `null` if doesn't exist)
 * @param {Function}  callback      Send transformed contents to `(err, newContents)`
 * @returns {void}
 */
module.exports = function (obj, callback) {
  callback(null, obj.contents.replace("multibot", "MULTIBOT ROCKS!!!"));
};
```

A transform is hooked into a multibot action with the option:
`--transform=PATH/TO/file.js` (absolute or relative paths work).

The `repo` and `file` fields are passed in the case that you wish to have
conditional transform logic, while still operating over a lot of files.

The `contents` field will be `null` if the source file does not presently exist
in the repository.

There are four things a transform can really do:

* Update an existing file. `contents` is non-null, and called back with a
  string that is different from the original.
* Do nothing with an existing file, if the contents do not change.
* Create a new file. `contents` is `null`, called back with a string.
* Delete an existing file. `contents` is non-null, called back with `null`.

These are obviously very powerful features, and should be thoroughly tested
with `--action=read` which provides essentially a dry-run of a real commit
action.

Note that a file cannot be both created (source is `null`) and deleted
(transform produces `null`) at the same time.

Also note that all files passed into a string and transformed **must be
strings**. Do not allow a transform to process anything that is not UTF8 string
data. (We could refactor `multibot` in the future to accomodate non-string
formats.)

### Note - Repeated Transforms

Be very careful to inspect and watch your transforms for repeated runs if a
`--action=commit` fails for some, but not all, repositories and you're
retrying. The reason is that for repositories that _succeeeded_ the first time,
the transform will get applied _again_ with potentially negative results unless
you plan for this.

For example, if you have a situation like:

```js
// --transform=rocks.js
module.exports = function (obj, callback) {
  callback(null, obj.contents.replace("multibot", "multibot ROCKS!!!"));
};
```

```
// --files README.md
Woah, multibot
```

A sucessful transform would produce:

```
// --files README.md
Woah, multibot ROCKS!!!
```

However, if that transform was run again (say this repo succeed first time
but others failed, so you're running the same commit command again):

```
// --files README.md
Woah, multibot ROCKS!!! ROCKS!!!
```

which is probably not what we want. The remedy for this specific situation is
to either, adjust the repositories passed to `--repos` on the command line to
remove the success, or to refactor the transform to be able to run repeatedly.
Here, that may just be detecting that `ROCKS!!!` doesn't already occur, or
allowing it to, then squashing it.

```js
// --transform=rocks.js
module.exports = function (obj, callback) {
  callback(null, obj.contents
    .replace("multibot", "multibot ROCKS!!!") // Add the rocks
    .replace("ROCKS!!! ROCKS!!!", "ROCKS!!!") // Squash the rocks if 2
  );
};
```

## Actions

Multibot can initiate various read-only and repository-mutating actions. A
basic workflow for initiating a change across multiple repositories via a PR
would look like:

First, check the transform looks good without changing anything:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --action=read \
  --format=diff
```

If that looks good, then create a branch, commit the transform, and open a PR:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch-src=master \
  --branch-dest=feature-foo \
  --action=branch \
  --format=text

$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --branch-dest=feature-foo \
  --action=commit \
  --format=diff

$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch-dest=feature-foo \
  --msg=$'A big change\nfrom a bot.' \ # Note use of bash ANSI C parsing of newline
  --action=pull-request \
  --format=text
```

or all as a single command:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --branch-src=master \
  --branch-dest=feature-foo \
  --msg=$'A big change\nfrom a bot.' \
  --action=branch-to-pr
```

### `read`

Read files from repositories, optionally applying a `--transform`. Does not
mutate the underlying repositories. Great for doing a test run of the future
mutating actions with `multibot`.

Example:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --action=read \
  --format=diff
```

Flags:

* `--action=read`
* `--branch-src`: (Optional, default: `master`) Source branch to read from.
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--files`: List of files (space delimited) to read / transform
* `--transform`: (Optional) Path to transform JS file
* `--format`: (Optional) Output report as `json`, `text`, or `diff`

Note that because we do one shot HTTP requests for existing contents to a
repository, `multibot` can't distinguish a single file not being found (normal,
means you'd create one) with a non-existent repo which will error in other
commands.

### `branch`

Create a branch in repositories.

Example:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch-src=master \
  --branch-dest=branch-o-doom \
  --action=branch \
  --format=text
```

Flags:

* `--action=branch`
* `--branch-src`: (Optional, default: `master`) Source to branch from.
* `--branch-dest`: Non-`master` new branch to create.
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--format`: (Optional) Output report as `json`, `text`, or `diff`
* `--allow-existing`: (Optional, default: `false`) Allow existing destination branches?
* `--dry-run`: (Optional) Simulate mutating actions.

### `commit`

Commit changes from a transform to a non-`master` branch in a repository.
Typically, you will create a new branch first with `--action=branch` and then
fill it with 1+ commits using `--action=commit` here.

Example:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch-dest=branch-o-doom \
  --files README.md LICENSE docs/DANGER.md \
  --action=commit \
  --transform="PATH/TO/transformify.js" \
  --msg="Add some DANGER to the repo files." \
  --format=diff
```

With a transform file: `PATH/TO/transformify.js`

```js
module.exports = function (obj, callback) {
  // CREATE a new file if none exists. Here `obj.file === "docs/DANGER.md"`
  if (obj.contents === null) {
    callback(null, "DANGER! DANGER!\n");
    return;
  }

  // DELETE a specific file by file path.
  if (obj.file === "LICENSE") {
    callback(null, null);
    return;
  }

  // UPDATE everything else to emphasize danger.
  callback(null, obj.contents.replace(/danger/g, "DANGER"));
};
```

Will create a new tree with the updates, deletes, and creates. If the operation
on a specific repository is a noop, no actual mutation actions are performed.

Flags:

* `--action=commit`
* `--branch-dest`: Non-`master` target branch to update with commit. (Also the
  source branch to read current files from.)
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--files`: List of files (space delimited) to read / transform
* `--msg`: Commit message
* `--transform`: (Optional) Path to transform JS file
* `--format`: (Optional) Output report as `json`, `text`, or `diff`
* `--dry-run`: (Optional) Simulate mutating actions.

Note that if a specific repository has no actual changes, no commit will be
created. (E.g., `multibot` won't create an empty commit.)

#### Commit API Notes

Creating commits with the GitHub API (and well, git) is a tad complex. We
actually have two separate scenarios for a commit based on whether or not
there is a file deletion (from a `null` transform contents value).

**If there are no deletes**, then `multibot` gets posts new blobs for all the
existing / new files, then _updates_ the current branch tree reference off
of the [base tree](https://developer.github.com/v3/git/trees/#create-a-tree).

**If there are deletes**, then we have to retrieve the entire existing tree
first. This runs the risk of
[truncated results](https://developer.github.com/v3/git/trees/#get-a-tree-recursively)
if a tree is too large for the GitHub API is returned. If we have truncated
results in any tree in a commit action, then `multibot` simply fails without
having performed any mutations. If we get the entire tree without truncation,
then `multibot` continues.

Once we have the full tree, then we can actually perform deletes by _removing_
existing blob references while splicing in our updates / creates and creating
a new tree _without_ a base tree reference, which completely replaces the
entire former tree.

### `pull-request`

Create a pull request from a branch in repositories.

Example:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch-src=master \
  --branch-dest=branch-o-doom \
  --action=pull-request \
  --title="The Bots have arrived" \
  --msg="...and are making mischief" \
  --format=text
```

Flags:

* `--action=pull-request`
* `--branch-src`: Base branch for pull request against
* `--branch-dest`: Non-`master` target branch to create pull request for
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--title`: Title for pull request (fallback to first line of `--msg`)
* `--msg`: Pull request description
* `--format`: (Optional) Output report as `json`, `text`, or `diff`
* `--allow-existing`: (Optional, default: `false`) Allow existing pull requests?
* `--dry-run`: (Optional) Simulate mutating actions.


### `branch-to-pr`

Create a branch, add commits, open a PR. An "all-in-one" aggregator for a common
use case for multibot.

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch-src=master \
  --branch-dest=branch-o-doom \
  --files README.md LICENSE docs/DANGER.md \
  --transform="PATH/TO/transformify.js" \
  --action=branch-to-pr \
  --title="The Bots have arrived" \
  --msg="...and are making mischief" \
  --format=diff
```
Flags:

* `--action=pull-request`
* `--branch-src`: Base branch for pull request against
* `--branch-dest`: Non-`master` target branch to create pull request for
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--files`: List of files (space delimited) to read / transform
* `--transform`: Path to transform JS file
* `--title`: Title for pull request (fallback to first line of `--msg`)
* `--msg`: Pull request description
* `--format`: (Optional) Output report as `json`, `text`, or `diff`
* `--dry-run`: (Optional) Simulate mutating actions.

Note that we _disallow_ the following flags here:

* `--allow-existing`


## GitHub API

`multibot` has the convenient feature that it never touches disk to perform any
repository / branch operations. This is done by relying entirely on the
[GitHub API](https://developer.github.com/v3/) for operations.

This also means that `multibot` must stay within the
[API rate limits](https://developer.github.com/v3/rate_limit/). If you go
beyond the limit, you will most likely encounter 403 HTTP error codes. If this
happens, check your rate limit with:

```sh
$ curl -H "Authorization: token OAUTH-TOKEN" https://api.github.com/rate_limit
```

Look at the `remaining` field to see how many requests you have left for the
hour. GitHub currently allows authenticated users to make up to 5,000 requests
per hour.

### Enterprise GitHub

`multibot` supports GitHub enterprise installations that use the `v3` API. The
relevant options that you may need to use include:

* `--gh-host`: The GitHub API host to use. By default, public GitHub is used
  (`api.github.com`). Switch to your enterprise host like:
  `my-github.my-company.com`.
* `--gh-path-prefix`: Some GitHub enterprise instances need an extra prefix to
  the API URLs, which is usually `"/api/v3"` if omitting this option doesn't
  work. Public GitHub does not need this option.

Put together, a full-fledged command for GitHub enterprise might look like:

```sh
$ multibot \
  --gh-token=<SNIPPED> \
  --gh-host=my-github.my-company.com \
  --gh-path-prefix="/api/v3" \
  --org EnterpriseGHOrg --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --action=read \
  --format=diff
```

[trav_img]: https://api.travis-ci.org/FormidableLabs/multibot.svg
[trav_site]: https://travis-ci.org/FormidableLabs/multibot
[cov]: https://coveralls.io
[cov_img]: https://img.shields.io/coveralls/FormidableLabs/multibot.svg
[cov_site]: https://coveralls.io/r/FormidableLabs/multibot
