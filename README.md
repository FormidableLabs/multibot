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
  --action       Actions to take                               [string] [required] [choices: "read"]
  --branch-src   Source git branch to read from                         [string] [default: "master"]
  --branch-dst   Destination git branch to write to [NOT IMPLEMENTED]                       [string]
  --files        List of files (space delimited) to read / transform              [array] [required]
  --org          GitHub organization for repos (can be instead specified on repos)          [string]
  --repos        GitHub repositories (space delimited) of form `repo` or `org/repo`
                                                                                  [array] [required]
  --gh-user      GitHub user name (needs user + pass)                                       [string]
  --gh-pass      GitHub password (needs user + pass)                                        [string]
  --gh-token     GitHub token                                                               [string]
  --transform    Path to transform JS file                                                  [string]
  --format       Display output format  [string] [choices: "json", "text", "diff"] [default: "json"]
  -h, --help     Show help                                                                 [boolean]
  -v, --version  Show version number                                                       [boolean]

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

Multibot can initiate various read-only and repository-mutating actions.

### `read`

Read files from repositories, optionally applying a `--transform`. Does not
mutate the underlying repositories.


[trav_img]: https://api.travis-ci.org/FormidableLabs/multibot.svg
[trav_site]: https://travis-ci.org/FormidableLabs/multibot
[cov]: https://coveralls.io
[cov_img]: https://img.shields.io/coveralls/FormidableLabs/multibot.svg
[cov_site]: https://coveralls.io/r/FormidableLabs/multibot
