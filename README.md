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
  --action          Actions to take           [string] [choices: "read", "branch"] [default: "read"]
  --branch          Target branch to use for operations                 [string] [default: "master"]
  --branch-new      New branch to create for `--action=branch`                              [string]
  --allow-existing  Allow existing destination branches for `--action=branch`?
                                                                           [boolean] [default: true]
  --files           List of files (space delimited) to read / transform                      [array]
  --org             GitHub organization for repos (can be instead specified on repos)       [string]
  --repos           GitHub repositories (space delimited) of form `repo` or `org/repo`
                                                                                  [array] [required]
  --gh-user         GitHub user name (needs user + pass)                                    [string]
  --gh-pass         GitHub password (needs user + pass)                                     [string]
  --gh-token        GitHub token                                                            [string]
  --transform       Path to transform JS file                                               [string]
  --format          Display output format
                                        [string] [choices: "json", "text", "diff"] [default: "json"]
  -h, --help        Show help                                                              [boolean]
  -v, --version     Show version number                                                    [boolean]

Examples:
  multibot --action=read --gh-token=TOKEN             Display the README file of multibot from
  --org FormidableLabs --repos multibot --files       GitHub
  README.md
```

## Transforms

The bread and butter of Multibot is actually _changing_ files across many
projects in a sensible and predictable way. A "transform" is really just a JS
file exporting a method with the following signature:

```js
/**
 * Transform contents of file to new format.
 *
 * @param {String}    repo     Repository name
 * @param {String}    file     File path
 * @param {String}    contents UTF8 content of file
 * @param {Function}  callback Send transformed contents to `(err, newContents)`
 * @returns {void}
 */
module.exports = function (repo, file, contents, callback) {
  callback(null, contents.replace("multibot", "MULTIBOT ROCKS!!!"));
};
```

The `repo` and `file` parameters are passed in the case that you wish to have
conditional transform logic, while still operating over a lot of files.

A transform is hooked into a multibot action with the option:
`--transform=PATH/TO/file.js`.

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

<!--
TODO: Add section

If that looks good, then create a branch, commit the transform, and open a PR:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch=master \
  --branch-new=feature-foo \
  --action=branch

$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --branch=feature-foo \
  --action=commit \
  --format=diff

$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch=feature-foo \
  --action=pull-request
```

or all as a single command:

```sh
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --branch=master \
  --branch-new=feature-foo \
  --action=open-pr \
  --format=diff
```
-->

### `read`

Read files from repositories, optionally applying a `--transform`. Does not
mutate the underlying repositories. Great for doing a test run of the future
mutating actions with `multibot`.

Example:

```
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --transform=foo.js --files README.md \
  --action=read \
  --format=diff
```

Flags:

* `--action=read`
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--files`: List of files (space delimited) to read / transform
* `--transform`: (Optional) Path to transform JS file
* `--format`: (Optional) Output report as `json`, `text`, or `diff`

<!--
### TODO `commit`

Commit changes from a transform to a non-`master` branch in a repository.

* TODO: Error if `master` is `branch`.
* TODO: Diff report (diff vs. current head).
* TODO: Report notes
-->

### `branch`

Create a branch in repositories

Example:

```
$ multibot \
  --org FormidableLabs --repos repo1 repo2 repo3 \
  --branch=master \
  --branch-new=branch-o-doom \
  --action=branch \
  --format=text
```

Flags:

* `--action=branch`
* `--org`: (Optional) GitHub organization for repos
* `--repos`: GitHub repositories (space delimited) of form `repo` or `org/repo`
* `--format`: (Optional) Output report as `json`, `text`, or `diff`
* `--allow-existing`: (Optional, default: `true`) Allow existing destination branches?

<!--
### TODO `pull-request`

Create a pull request from a branch in repositories

* TODO: Error if `master` is `branch`.
* TODO: Files not required here.
* TODO: Flag to error if branch already PR-ed.
* TODO: Diff report (diff vs. master).
* TODO: Report notes

### TODO `full-pr`

Create a branch, add commits, open a PR. An "all-in-one" aggregator for a common
use case for multibot.

* TODO: Note different/changing use of `branch` and `branch-new` in this action.

-->

[trav_img]: https://api.travis-ci.org/FormidableLabs/multibot.svg
[trav_site]: https://travis-ci.org/FormidableLabs/multibot
[cov]: https://coveralls.io
[cov_img]: https://img.shields.io/coveralls/FormidableLabs/multibot.svg
[cov_site]: https://coveralls.io/r/FormidableLabs/multibot
