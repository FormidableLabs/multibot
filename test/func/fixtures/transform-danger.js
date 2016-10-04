"use strict";

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
  // CREATE if doesn't exist
  if (obj.contents === null) {
    callback(null, "DANGER! DANGER!\n");
    return;
  }

  // DELETE the LICENSE
  if (obj.file === "LICENSE") {
    callback(null, null);
    return;
  }

  // UPDATE any other existing files
  // Emphasize danger in existing files.
  callback(null, obj.contents.replace(/danger/g, "DANGER"));
};
