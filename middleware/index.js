'use strict'
const { exec } = require('child_process')
const files = require('../common/files')
const fileStore = require('./file-store')
const fs = require('fs')
const path = require('path')
const Meter = require('./stream-meter')
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
      files.isFile(path.resolve(fullPath, 'test-runner-hooks.js')),
      files.isDirectory(path.resolve(fullPath, 'overwrite')),
      files.isDirectory(path.resolve(fullPath, 'starter')),
      files.isFile(path.resolve(fullPath, challenge + '.zip')),
      files.isFile(path.resolve(fullPath, 'test-runner.' + (process.platform === 'win32' ? 'bat' : 'sh')))
    ])
  }

  return {
    hasHooks: data[0],
    hasOverwrites: data[1],
    hasStarter: data[2],
    hasStarterZip: data[3],
    hasTestRunner: data[4],
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

Challenge.prototype.middleware = function (options = {}) {
  return async (req, res) => {
    const method = req.method.toUpperCase()
    const user = await this.getUserId(req)

    if (method === 'GET' && req.path === '/info') {
      res.json({
        loginCommand: this.getLoginCommand(req),
        sessionKey: this.config.sessionCookieName,
        sessionValue: this.getSessionId(req),
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
        this.submitChallenge(req, res, options, user, challenge)

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
  const { isChallenge, hasStarter } = await this.getChallengeDetails(challenge)
  if (!isChallenge || !hasStarter) throw Error('Unable to prepare challenge without required starter directory')

  const challengeDirectory = path.resolve(this.config.challengePath, challenge)
  const starterDirectory = path.resolve(challengeDirectory, 'starter')
  const zipPath = path.resolve(challengeDirectory, challenge + '.zip')

  // start zipping the specified path
  const archive = zip(starterDirectory)

  // pipe the zip stream to a zip file
  const output = fs.createWriteStream(zipPath)
  archive.pipe(output)

  return new Promise((resolve, reject) => {
    output.on('error', reject)
    output.on('close', resolve)
  })
}

Challenge.prototype.submitChallenge = async function (req, res, options = {}, user, challenge) {
  if (!options.hasOwnProperty('uploadMaxSize')) options.uploadMaxSize = '2M'

  if (typeof options.uploadMaxSize === 'string') {
    const rx = /^(\d+)([kmg])$/
    const match = rx.exec(options.uploadMaxSize.toLocaleLowerCase())
    if (match) {
      let num = +match[1]
      switch (match[2]) {
        case 'k':
          num = num * 1000
          break
        case 'm':
          num = num * 1000000
          break
        case 'g':
          num = num * 1000000000
          break
      }
      options.uploadMaxSize = num
    }
  }

  if (typeof options.uploadMaxSize !== 'number' || isNaN(options.uploadMaxSize) || options.uploadMaxSize <= 0) {
    throw Error('Option uploadMaxSize must be a positive number or a string indicating size. Ex: 2M')
  }

  // TODO: throttling

  const details = await this.getChallengeDetails(challenge)
  const challengeDir = path.resolve(this.config.challengePath, challenge)
  const key = challenge + '_' + user.username + '_' + Date.now()
  const uploadedFilesPath = path.resolve(tempDir, key)

  // attempt to load the hooks file
  let hooks
  try {
    if (details.hasHooks) {
      const hooksPath = path.resolve(challengeDir, 'test-runner-hooks.js')
      hooks = require(hooksPath)
      delete require.cache[hooksPath]
    }
  } catch (err) {
    console.error('Error loading hooks file for challenge: ' + challenge + '\n' + err.stack)
  }

  let output
  let error
  try {
    // unzip the upload into the temp directory
    const meter = new Meter(options.uploadMaxSize)
    await unzip(req.pipe(meter), uploadedFilesPath)

    // copy overwrite files into temp directory
    if (details.hasOverwrites) {
      const source = path.resolve(challengeDir, 'overwrite')
      if (hooks && hooks.beforeOverwrite) {
        await Promise.resolve(hooks.beforeOverwrite(uploadedFilesPath, source))
      }
      await files.overwrite(source, uploadedFilesPath)
      if (hooks && hooks.afterOverwrite) {
        await Promise.resolve(hooks.afterOverwrite(uploadedFilesPath, source))
      }
    }

    // run test runner and capture the output
    const runnerScript = path.resolve(challengeDir, 'test-runner.' + (process.platform === 'win32' ? 'bat' : 'sh'))
    const execOptions = { timeout: 30000 }
    const execOut = await runExec(runnerScript + ' ' + uploadedFilesPath, execOptions)

    // parse the output
    if (hooks && hooks.parseResults) {
      output = await Promise.resolve(hooks.parseResults(execOut))
    }
  } catch (err) {
    error = err
  }

  // delete temporary directory
  await files.rmDir(uploadedFilesPath)

  return { error, output }
}

Challenge.fileStore = fileStore

function runExec (command, options = {}) {
  return new Promise((resolve, reject) => {
    let output = ''
    const child = exec(command, options, function (err, stdout, stderr) {
      if (err) reject(err)
      resolve({ output, stdout, stderr })
    })
    child.stdout.on('data', d => { output += d.toString() })
    child.stderr.on('data', d => { output += d.toString() })
  })
}