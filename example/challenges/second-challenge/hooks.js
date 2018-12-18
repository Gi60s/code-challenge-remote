
exports.beforeOverwrite = function (uploadedFilesDir, overwriteFilesDir) {

}

exports.afterOverwrite = function (uploadedFilesDir, overwriteFilesDir) {

}

exports.parseTestResults = function (body) {
  const passed = /^\s*(\d+) passing/m.exec(body)
  const failed = /^\s*(\d+) failing/m.exec(body)
  return {
    body,
    failed: failed ? +failed[1] : 0,
    passed: passed ? +passed[1] : 0
  }
}
