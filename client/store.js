
const files = require('./files')
const path = require('path')
const tempDir = require('os').tmpdir()

const appDataPath = path.resolve(tempDir, 'remote-code-challenge.dat')

exports.write = function (data) {
  data = Object.assign({}, data, {
    created: Date.now()
  })
  return files.writeFile(appDataPath, JSON.stringify(data))
}

exports.read = async function () {
  try {
    let data = await files.readFile(appDataPath, 'utf8')
    data = JSON.parse(data)
    if (data.created) {
      // TODO: check if session on server is still valid
    }
  } catch (e) {}
  return {
    created: null,
    remoteUrl: ''
  }
}