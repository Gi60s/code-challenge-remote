'use strict'
const { exec, spawn } = require('child_process')
const debug = require('debug')('code-challenge')
const files = require('../common/files')
const fileStore = require('./file-store')
const fs = require('fs')
const path = require('path')
const Meter = require('./stream-meter')
const streamPromise = require('../common/stream-promise')
const stripAnsi = require('strip-ansi')
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
  const { isChallenge, hasStarterZip } = await this.getChallengeDetails(challenge)
  try {
    if (!isChallenge) {
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
  const isDirectory = await files.isDirectory(fullPath)

  // get challenge details
  if (isDirectory) {
    const [ hasConfig, hasHooks, hasOverwrites, hasStarter, hasStarterZip, hasDockerfile, hasDockerCompose ] = await Promise.all([
      files.isFile(path.resolve(fullPath, 'config.json')),
      files.isFile(path.resolve(fullPath, 'hooks.js')),
      files.isDirectory(path.resolve(fullPath, 'overwrite')),
      files.isDirectory(path.resolve(fullPath, 'starter')),
      files.isFile(path.resolve(fullPath, challenge + '.zip')),
      files.isFile(path.resolve(fullPath, 'Dockerfile')),
      files.isFile(path.resolve(fullPath, 'docker-compose.yml'))
    ])
    const isChallenge = hasStarter && (hasDockerfile || hasDockerCompose)
    return {
      hasConfig,
      hasHooks,
      hasOverwrites,
      hasStarterZip,
      hasDockerfile,
      hasDockerCompose,
      isChallenge
    }
  } else {
    return {
      hasHooks: false,
      hasOverwrites: false,
      hasStarterZip: false,
      hasDockerfile: false,
      hasDockerCompose: false,
      isChallenge: false
    }
  }
}

/**
 * Get a list of all challenge names.
 * @returns {Promise<string[]>}
 */
Challenge.prototype.getChallengesList = async function () {
  const directories = await files.readDir(this.config.challengePath)
  const results = []

  const promises = directories.map(async fileName => {
    const details = await this.getChallengeDetails(fileName)
    if (details.isChallenge) results.push(fileName)
  })

  await Promise.all(promises)
  return results
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
  const { isChallenge } = await this.getChallengeDetails(challenge)
  if (isChallenge) throw Error('Cannot prepare challenge due to missing starter directory or missing Dockerfile / docker-compose.yml')

  const challengeDirectory = path.resolve(this.config.challengePath, challenge)
  const starterDirectory = path.resolve(challengeDirectory, 'starter')
  const zipPath = path.resolve(challengeDirectory, challenge + '.zip')

  // start zipping the specified path
  const archive = zip(starterDirectory)

  // pipe the zip stream to a zip file
  const output = fs.createWriteStream(zipPath)
  archive.pipe(output)
  await streamPromise(output)
}

Challenge.prototype.submitChallenge = async function (req, res, user, challenge) {
  const details = await this.getChallengeDetails(challenge)
  const challengeDir = path.resolve(this.config.challengePath, challenge)
  const key = challenge + '_' + user.username + '_' + Date.now()
  const uploadedFilesPath = path.resolve(tempDir, key)

  let meter

  try {
    // TODO: throttling

    // load configuration
    const options = {
      maxUploadSize: '2M',
      maxRunTime: 30000
    }
    if (details.hasConfig) {
      const content = await files.readFile(path.resolve(challengeDir, 'config.json'))
      const obj = JSON.parse(content)
      Object.assign(options, obj)
    }
    options.maxUploadSize = extractNumber(options.maxUploadSize)

    // attempt to load the hooks file
    let hooks
    if (details.hasHooks) {
      const hooksPath = path.resolve(challengeDir, 'hooks.js')
      hooks = require(hooksPath)
      delete require.cache[hooksPath]
    }

    let output

    // unzip the upload into the temp directory
    meter = new Meter(options.maxUploadSize)
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

    if (details.hasDockerfile) {
      const dockerTagName = 'code_challenge__' + challenge

      // build the image
      const build = await runExec('docker build --tag ' + dockerTagName + ' .', { cwd: challengeDir })
      debug(build.output)

      // run the container
      const child = spawn('docker', ['run', '--rm', '-t', '-v', uploadedFilesPath + ':/root/challenge', dockerTagName])
      const timeoutId = setTimeout(function () { child.kill() }, options.maxRunTime)

      // capture container output
      output = ''
      child.stdout.on('data', data => { output += data.toString() })
      child.stderr.on('data', data => { output += data.toString() })

      // wait for the container to be done
      await new Promise((resolve) => { child.on('close', resolve) })
      clearTimeout(timeoutId)

      if (hooks && hooks.parseTestResults) {
        output = await Promise.resolve(hooks.parseTestResults(stripAnsi(output)))
        const passed = output.passed
        const failed = output.failed

        const store = this.config.store
        await store.save(user.id, challenge, new Date(), passed / (passed + failed))
      }
    } else if (details.hasDockerCompose) {
      // TODO: docker-compose
    }

    res.status(200)
    res[typeof output === 'object' ? 'json' : 'send'](output)
  } catch (err) {
    // TODO: meter works, but this message isn't sent back. Need to fix this
    if (meter && meter.bytes > meter.maxBytes) {
      res.status(400).send('Upload size too large')
    } else {
      console.error(err.stack)
      res.sendStatus(500)
    }
  }

  // delete temporary directory
  try {
    await files.rmDir(uploadedFilesPath)
  } catch (err) {
    console.error(err.stack)
  }
}

Challenge.fileStore = fileStore

function extractNumber (value) {
  const rx = /^(\d+)([kmg])$/
  const match = rx.exec(value.toLocaleLowerCase())
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
    return num
  }
  return value
}

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

function runSpawn (command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let output = ''
    const child = exec(command, args, options)
    child.stdout.on('data', d => { output += d.toString() })
    child.stderr.on('data', d => { output += d.toString() })
  })
}
