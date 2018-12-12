'use strict'
const fs = require('fs')
const http = require('http')
const path = require('path')
const { download, request, upload } = require('./request')
const store = require('./store')
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

  if (info.statusCode !== 200) {
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

CodeChallengeClient.prototype.initChallenge = function (challenge, outputDirectory) {
  return new Promise(async (resolve, reject) => {
    const res = await download(this, challenge)

    if (res.statusCode !== 200) return reject(Error(res.body))

    const zipPath = path.resolve(tempDir, 'remote-code-challenge_' + Date.now() + '.zip')
    const ws = fs.createWriteStream(zipPath)

    // wait for zip file to finish write before decompress
    ws.on('close', () => {
      const out = path.resolve(outputDirectory, challenge)
      unzip(zipPath, out)
        .then(files => {
          fs.unlink(zipPath, () => {})
          console.log(`Downloaded ${files.length} files to ${out}`)
        })
        .then(resolve, reject)
    })

    res.pipe(ws)
  })
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
  const readable = zip(directory)
  const res = await upload(this, challenge, readable)
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
