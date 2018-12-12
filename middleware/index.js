'use strict'
const { exec, fork } = require('child_process')
const files = require('../common/files')
const fileStore = require('./file-store')
const fs = require('fs')
const path = require('path')
const tempDir = require('os').tmpdir()
const { zip, unzip } = require('../common/zip')

module.exports = Challenge

function Challenge (options) {
  options = Object.assign({}, options)
  if (!options.challengePath || typeof options.challengePath !== 'string') throw Error('You must specify a non empty string for the challengePath')
  if (typeof options.getUserId !== 'function') throw Error('Option getUserId must be a function')
  if (!options.store || typeof options.store !== 'object' || typeof options.store.save !== 'function' || typeof options.store.load !== 'function') throw Error('Invalid store provided')
  if (!options.hasOwnProperty('sessionCookieName')) options.sessionCookieName = 'connect.sid'

  this.config = options
  this.store = options.store
}

Challenge.prototype.downloadChallenge = async function (req, res, challenge) {
  const { isChallenge, hasStarter, hasStarterZip } = await this.getChallengeDetails(challenge)
  try {
    if (!isChallenge || !hasStarter) {
      res.sendStatus(404)
    } else {
      if (!hasStarterZip) await this.prepare(challenge)
      res.sendFile(path.resolve(this.config.challengePath, challenge, challenge + '.zip'))
    }
  } catch (err) {
    console.error(err.stack)
    res.sendStatus(500)
  }
}

Challenge.prototype.getChallengeDetails = async function (challenge) {
  const fullPath = path.resolve(this.config.challengePath, challenge)
  let data = [ false, false, false, false, false ]

  // check if the path points to a directory, otherwise resolve to undefined
  const isChallenge = await files.isDirectory(fullPath)

  // get challenge details
  if (isChallenge) {
    data = await Promise.all([
      files.isFile(path.resolve(fullPath, 'before-test-runner.js')),
      files.isFile(path.resolve(fullPath, 'ignore.txt')),
      files.isDirectory(path.resolve(fullPath, 'overwrite')),
      files.isDirectory(path.resolve(fullPath, 'starter')),
      files.isFile(path.resolve(fullPath, challenge + '.zip')),
      files.isFile(path.resolve(fullPath, 'test-runner.' + (process.platform === 'win32' ? 'bat' : 'sh')))
    ])
  }

  return {
    hasBeforeRunner: data[0],
    hasIgnore: data[1],
    hasOverwrites: data[2],
    hasStarter: data[3],
    hasStarterZip: data[4],
    hasTestRunner: data[5],
    isChallenge
  }
}

/**
 * Get a list of all challenge names.
 * @returns {Promise<string[]>}
 */
Challenge.prototype.getChallengesList = async function () {
  const directories = await files.readDir(this.config.challengePath)

  const promises = []
  directories.forEach(fileName => {
    const fullPath = path.resolve(this.config.challengePath, fileName)
    promises.push(files.isDirectory(fullPath))
  })

  const results = await Promise.all(promises)
  return directories.filter((fileName, index) => results[index])
}

Challenge.prototype.getLoginCommand = function (req) {
  return 'challenge login "' + this.config.challengeUrl + '" "' + this.getSessionId(req) + '"'
}

Challenge.prototype.getSessionId = function (req) {
  if (!req.headers.cookie) return ''
  const rxCookie = RegExp('' + this.config.sessionCookieName + '[^;]+')
  const match = rxCookie.exec(req.headers.cookie)
  const value = match
    ? match[0].toString().replace(/^[^=]+./, '')
    : ''
  return decodeURIComponent(value)
}

Challenge.prototype.getStatus = async function (req) {
  const user = await this.getUserId(req)
  if (!user) return null

  const challenges = {};
  (await this.getChallengesList()).forEach(challenge => {
    challenges[challenge] = []
  })

  const add = function (challenge, date, score) {
    challenges[challenge].push({ date, score })
  }

  const store = this.config.store
  const promise = store.load.length > 2
    ? new Promise((resolve, reject) => {
      store.load(user.id, add, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    : Promise.resolve(store.load(user.id, add))

  await promise
  return {
    user,
    challenges
  }
}

Challenge.prototype.getUserId = async function (req) {
  const sessionId = this.getSessionId(req)
  if (!sessionId) return

  const promise = this.config.getUserId.length > 1
    ? new Promise((resolve, reject) => {
      this.config.getUserId(req, function (err, data) {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
    : Promise.resolve(this.config.getUserId(req))

  const data = await promise
  if (data) {
    if (!data.hasOwnProperty('id')) throw Error('Invalid object returned from getUserId()')
    if (!data.hasOwnProperty('username')) throw Error('Invalid object returned from getUserId()')
  }
  return data
}

Challenge.prototype.middleware = function () {
  return async (req, res) => {
    const method = req.method.toUpperCase()
    const user = await this.getUserId(req)

    if (method === 'GET' && req.path === '/info') {
      res.json({
        sessionKey: this.config.sessionCookieName,
        user
      })
      return
    }

    if (!user) return res.sendStatus(401)

    try {
      // download a challenge
      if (method === 'GET' && req.path.startsWith('/download/')) {
        const challenge = req.path.substr(10)
        this.downloadChallenge(req, res, challenge)

      // get the login command
      } else if (method === 'GET' && req.path === '/login-command') {
        res.status(200)
          .set('content-type', 'text/plain')
          .send(this.getLoginCommand(req))

      // get the status of all challenges for the user
      } else if (method === 'GET' && req.path === '/status') {
        const status = await this.getStatus(req)
        res.json(status)

      // allow the user to upload a challenge for remote testing
      } else if (method === 'POST' && req.path.startsWith('/upload/')) {
        const challenge = req.path.substr(8)
        this.submitChallenge(req, res, user, challenge)

      // invalid path
      } else {
        res.sendStatus(404)
      }
    } catch (err) {
      console.error(err.stack)
      res.sendStatus(500)
    }
  }
}

// take a challenge's starter directory and create a zip file
Challenge.prototype.prepare = async function (challenge) {
  const { isChallenge, hasStarter, hasIgnore } = await this.getChallengeDetails(challenge)
  if (!isChallenge || !hasStarter) throw Error('Unable to prepare challenge without required starter directory')

  const challengeDirectory = path.resolve(this.config.challengePath, challenge)
  const starterDirectory = path.resolve(challengeDirectory, 'starter')
  const zipPath = path.resolve(challengeDirectory, challenge + '.zip')

  let ignored = []
  if (hasIgnore) {
    const ignorePath = path.resolve(challengeDirectory, 'ignore.txt')
    const content = await files.readFile(ignorePath, 'utf8')
    ignored = content
      .split(/\r\n|\r|\n/)
      .map(v => v.trim())
      .filter(v => v.length > 0)
  }

  // start zipping the specified path
  const archive = zip(starterDirectory, ignored)

  // pipe the zip stream to a zip file
  const output = fs.createWriteStream(zipPath)
  archive.pipe(output)

  return new Promise((resolve, reject) => {
    output.on('error', reject)
    output.on('close', resolve)
  })
}

Challenge.prototype.submitChallenge = async function (req, res, user, challenge) {
  // TODO: throttling

  const details = this.getChallengeDetails(challenge)
  const challengeDir = path.resolve(this.config.challengePath, challenge)
  const key = challenge + '_' + user.username + '_' + Date.now()
  const filesPath = path.resolve(tempDir, key)

  try {
    // unzip the upload into the temp directory
    await unzip(req, filesPath)

    // copy overwrite files into temp directory

    // run test runner and capture the output
    const runnerScript = path.resolve(challengeDir, 'test-runner.' + (process.platform === 'win32' ? 'bat' : 'sh'))
    const execOptions = { timeout: 30000 }
    const result = await runExec(runnerScript + ' ' + filesPath, execOptions)

    // parse the output

    // delete temporary directory
  } catch (err) {

  }


}

Challenge.fileStore = fileStore

function runExec (command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, function (err, stdout, stderr) {
      if (err) reject(err)
      resolve({ stdout, stderr })
    })
  })
}

function stopDocker (name) {

}