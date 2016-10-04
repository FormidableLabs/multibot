History
=======

## Unreleased

* Add `--no-auth` flag for dry run simple automation tests.

## 0.4.0

* Allow relative or absolute paths for `--transform`. ( [@iamdustan][] )

## 0.3.1

* Fix `bin` to actually create `multibot`.

## 0.3.0

* Add GitHub Enterprise support.

## 0.2.0

* Implements `--action=branch-to-pr` to create branch, commit, and PR.
* Implements `--action=pull-request` to create pull requests.
* Implements `--action=commit` to create commits in repositories.
* Replace `octonode` client with `github`.
* Add `--dry-run` option to skip all mutating actions.
* Allow `--action=read` to process non-existing files.
* _Breaking Changes_:
    * `--allow-existing=false` by default. (Error if existing branch / PR).
    * `--branch|branch-new` flags are replaced with `--branch-src|branch-dest`.
    * `--action=commit` uses target branch flag `--branch-dest` now.
    * `--commit-msg` is now `--msg`.
    * `null` source means "create" file.
    * `null` transform output means "delete" file.
    * Change signature of transforms to `(obj, callback)`.

## 0.1.0

* Implements `--action=branch` to create branches in repositories.
* Add README.md documentation for scenarios.
* Refactor args out to separate file.
* Unify the output display format for all actions.

## 0.0.1

* Implements `--action=read` to read / transform files from repositories.
* Implements `--transform` function options.
* Implements display output formats of json, text, colored diff.

[@iamdustan]: https://github.com/iamdustan
[@ryan-roemer]: https://github.com/ryan-roemer
