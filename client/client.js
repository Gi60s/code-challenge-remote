'use strict'
const fs = require('fs')
const files = require('../common/files')
const path = require('path')
const { download, request, upload } = require('./request')
const store = require('./store')
const streamPromise = require('../common/stream-promise')
const tempDir = require('os').tmpdir()
const { zip, unzip } = require('../common/zip')

exports.load = function () {
  const data = store.read()
  const { info, sessionId, status, url } = data
  if (!info || !sessionId || !status || !url) return null
  return new CodeChallengeClient(info, sessionId, status, url)
}

exports.login = async function (url, sessionId) {
  const info = await request({ url: url + '/info' })

  if (info.statusCode === 404) {
    store.write({})
    console.log('Invalid login path')
    return null
  } else if (info.statusCode >= 400 && info.statusCode < 500) {
    store.write({})
    console.log('Invalid request')
    return null
  } else if (info.statusCode !== 200) {
    store.write({})
    console.log('Unable to communicate with challenge server')
    return null
  }

  const status = await request({
    headers: { cookie: info.body.sessionKey + '=' + sessionId },
    url: url + '/status'
  })

  if (status.statusCode === 401) {
    store.write({})
    console.log('Login failed')
    return null
  }

  if (status.statusCode !== 200) {
    store.write({})
    console.log('Login failed')
    return null
  }

  const client = new CodeChallengeClient(info.body, sessionId, status.body, url)
  client.save()
  return client
}

/**
 * @param {object} info
 * @param {object} status
 * @param {string} sessionId
 * @param {string} url The URL that the code challenge server will respond to.
 * @constructor
 */
function CodeChallengeClient (info, sessionId, status, url) {
  this.cookie = info.sessionKey + '=' + sessionId
  this.info = info
  this.status = status
  this.sessionId = sessionId
  this.url = url
  this.user = status.user.username
  this.userId = status.user.userId
}

CodeChallengeClient.prototype.getStatus = async function () {
  const res = await request({
    headers: { cookie: this.cookie },
    url: this.url + '/status'
  })
  return res.statusCode === 200
    ? res.body
    : null
}

CodeChallengeClient.prototype.initChallenge = async function (challenge, outputDirectory) {
  const outputDir = path.resolve(outputDirectory, challenge)

  const dirExists = await files.isDirectory(outputDir)
  if (dirExists) throw Error('Could not download files because a directory already exists at the location: ' + outputDir)

  const res = await download(this, challenge)
  if (res.statusCode !== 200) throw Error(res.body)

  await unzip(res, outputDir)
}

/**
 * Destroy temporary login file
 */
CodeChallengeClient.prototype.logout = function () {
  store.write({})
}

/**
 * Save the temporary file
 */
CodeChallengeClient.prototype.save = function () {
  store.write({
    info: this.info,
    status: this.status,
    sessionId: this.sessionId,
    url: this.url
  })
}

/**
 * Submit a challenge for testing
 * @param challenge
 * @param directory
 */
CodeChallengeClient.prototype.submit = async function (challenge, directory) {
  const ignored = await request({
    headers: { cookie: this.cookie },
    url: this.url + '/ignored/' + challenge
  })

  const archive = zip(directory, ignored)
  const zipFilePath = path.resolve(tempDir, challenge + '_' + Date.now() + '.zip')

  // pipe the zip stream to a zip file
  const output = fs.createWriteStream(zipFilePath)
  archive.pipe(output)
  await streamPromise(output)

  const readable = fs.createReadStream(zipFilePath)
  const res = await upload(this, challenge, readable)
  return {
    body: res.body,
    statusCode: res.statusCode
  }
}

CodeChallengeClient.prototype.validateSession = async function () {
  const info = await request({
    headers: { cookie: this.cookie },
    url: this.url + '/info'
  })

  if (info.statusCode !== 200) {
    store.write({})
    return false
  } else {
    this.cookie = info.body.sessionKey + '=' + this.sessionId
    this.info = info.body
    store.write({
      info: info.body,
      status: this.status,
      sessionId: this.sessionId,
      url: this.url
    })
    return true
  }
}
