const fs = require('fs')
const path = require('path')
const tempDir = require('os').tmpdir()

const appDataPath = path.resolve(tempDir, 'remote-code-challenge.dat')

exports.write = function (data) {
  fs.writeFileSync(appDataPath, JSON.stringify(data))
}

exports.read = function () {
  try {
    let data = fs.readFileSync(appDataPath, 'utf8')
    data = JSON.parse(data)
    if (data.info && data.sessionId && data.status && data.url) return data
  } catch (e) {}
  return {}
}
