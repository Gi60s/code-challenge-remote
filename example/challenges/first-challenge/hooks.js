
exports.beforeOverwrite = function (uploadedFilesDir, overwriteFilesDir) {

}

exports.afterOverwrite = function (uploadedFilesDir, overwriteFilesDir) {

}

exports.parseTestResults = function (output) {
  const ar = output.split('== BEGIN TESTS ==')
  if (ar[1]) {
    const content = ar[1]
      .split(/\r\n|\r|\n/)
      .filter(v => v.startsWith('app_1'))
      .map(v => {
        const ar = v.split('|')
        ar.shift()
        return ar.join('|')
      })
      .join('\n')

    const passed = /^\s*(\d+) passing/m.exec(content)
    const failed = /^\s*(\d+) failing/m.exec(content)
    return {
      body: content,
      failed: failed ? +failed[1] : 0,
      passed: passed ? +passed[1] : 0
    }
  } else {
    return {
      body: 'Tests failed to run',
      failed: 0,
      passed: 0
    }
  }
}
