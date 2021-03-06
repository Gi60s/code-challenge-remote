const { expect } = require('chai')
const { exec } = require('child_process')
const Client = require('../client/client')
const files = require('../common/files')
const path = require('path')
const request = require('request-promise-native')
const server = require('../example/server')

/* globals describe after beforeEach afterEach it */
describe('code-challenge', function () {
  const port = 3000
  const urlPrefix = 'http://localhost:' + port
  let listener
  this.timeout(15000)

  beforeEach(async () => {
    listener = await server(port)
  })

  afterEach(done => {
    listener.close(done)
  })

  it('can get info without being logged in', async () => {
    const res = await request({
      json: true,
      url: urlPrefix + '/challenge/info'
    })
    expect(res).to.haveOwnProperty('sessionKey')
    expect(res).not.to.haveOwnProperty('user')
  })

  it('can get info being logged in', async () => {
    const jar = await login('bob')
    const res = await request({
      jar,
      json: true,
      url: urlPrefix + '/challenge/info'
    })
    expect(res).to.haveOwnProperty('sessionKey')
    expect(res.user.username).to.equal('bob')
  })

  it('can have two users logged in', async () => {
    const jar1 = await login('bob')
    const jar2 = await login('alice')
    const res1 = await request({
      jar: jar1,
      json: true,
      url: urlPrefix + '/challenge/info'
    })
    const res2 = await request({
      jar: jar2,
      json: true,
      url: urlPrefix + '/challenge/info'
    })
    expect(res1.user.username).to.equal('bob')
    expect(res2.user.username).to.equal('alice')
    expect(res1.sessionValue).not.to.equal(res2.sessionValue)
  })

  describe('client', () => {
    const clientChallengeDir = path.resolve(__dirname, '../temp')

    beforeEach(async () => {
      const jar = await login('bob')
      const res = await request({
        jar,
        json: true,
        url: urlPrefix + '/challenge/info'
      })
      await client(res.loginCommand.substr(10))

      // delete the server's store directory
      await files.rmDir(path.resolve(__dirname, '../example/store'))

      // delete and recreate the temp directory
      await files.rmDir(clientChallengeDir)
      await files.mkDir(clientChallengeDir)
    })

    afterEach(async () => {
      await client('logout')
    })

    after(async () => {
      const rx = /\.zip$/
      const filter = filePath => rx.test(filePath)
      const zipFiles = await files.readDirFiles(path.resolve(__dirname, '../example/challenges'), { filter })
      const promises = zipFiles.map(filePath => files.unlink(filePath))
      await Promise.all(promises)
      await files.rmDir(path.resolve(__dirname, '../example/store'))
      await files.rmDir(clientChallengeDir)
    })

    it('is logged in', async () => {
      const { stdout } = await client('help')
      expect(stdout).to.match(/Logged in as bob/)
    })

    it('can get status', async () => {
      const { stdout } = await client('status')
      expect(stdout).to.match(/second-challenge\s+Not submitted/)
    })

    describe('init', () => {
      it('can get challenge into current working directory', async () => {
        const client = Client.load()
        await client.initChallenge('second-challenge', clientChallengeDir)
      })

      describe('cli', () => {
        it('requires the challenge name', async () => {
          const { stdout } = await client('init', { cwd: clientChallengeDir })
          expect(stdout).to.match(/Missing required <challenge> input/)
        })

        it('can get challenge into current working directory', async () => {
          const { stdout } = await client('init second-challenge', { cwd: clientChallengeDir })
          expect(stdout).to.match(/Downloaded challenge to/)
          const filePaths = await files.readDirFiles(clientChallengeDir)
          expect(filePaths.length).to.be.greaterThan(0)
        })

        it('can get challenge into specified directory', async () => {
          const { stdout } = await client('init second-challenge ' + clientChallengeDir)
          expect(stdout).to.match(/Downloaded challenge to/)
          const filePaths = await files.readDirFiles(clientChallengeDir)
          expect(filePaths.length).to.be.greaterThan(0)
        })

        it('will not overwrite existing challenge directory', async () => {
          let out = await client('init second-challenge ' + clientChallengeDir)
          expect(out.stdout).to.match(/Downloaded challenge to/)
          out = await client('init second-challenge ' + clientChallengeDir)
          expect(out.stderr).to.match(/Could not download files because a directory already exists at the location/)
        })
      })
    })

    describe('submit', () => {
      const secondChallengeDir = path.resolve(clientChallengeDir, 'second-challenge')

      it('can submit challenge to run Dockerfile', async () => {
        const client = Client.load()
        await client.initChallenge('second-challenge', clientChallengeDir)
        const res = await client.submit('second-challenge', secondChallengeDir)
        expect(res.body).to.have.ownProperty('failed')
        expect(res.body).to.have.ownProperty('passed')
      })

      it('can submit challenge to run docker-compose', async () => {
        const firstChallengeDir = path.resolve(clientChallengeDir, 'first-challenge')
        const client = Client.load()
        await client.initChallenge('first-challenge', clientChallengeDir)
        const res = await client.submit('first-challenge', firstChallengeDir)
        expect(res.body).to.have.ownProperty('failed')
        expect(res.body).to.have.ownProperty('passed')
      })

      describe('cli', () => {
        beforeEach(async () => {
          await client('init second-challenge ' + clientChallengeDir)
        })

        it('requires the challenge name', async () => {
          let { stdout } = await client('submit')
          expect(stdout).to.match(/Missing required <challenge> input/)
        })

        it('can upload challenge from current working directory', async () => {
          let { stdout } = await client('submit second-challenge', { cwd: secondChallengeDir })
          expect(stdout).to.match(/test suite/)
          expect(stdout).not.to.match(/passed/)
        })

        it('can upload challenge from specified directory', async () => {
          let { stdout } = await client('submit second-challenge ' + secondChallengeDir)
          expect(stdout).to.match(/test suite/)
          expect(stdout).not.to.match(/passed/)
        })

        it('cannot upload an overly large directory', async () => {
          const largeFilePath = path.resolve(secondChallengeDir, 'large.txt')
          let str = ''
          for (let i = 0; i < 2000000; i++) {
            const index = Math.floor(Math.random() * 94) + 32
            str += String.fromCharCode(index)
          }
          await files.writeFile(largeFilePath, str)

          const client = Client.load()
          const res = await client.submit('second-challenge', secondChallengeDir)
          expect(res.statusCode).to.equal(400)
          expect(res.body).to.equal('Upload size too large')
        })

        it('cannot upload an overly large directory (cli)', async () => {
          const largeFilePath = path.resolve(secondChallengeDir, 'large.txt')
          let str = ''
          for (let i = 0; i < 2000000; i++) {
            const index = Math.floor(Math.random() * 94) + 32
            str += String.fromCharCode(index)
          }
          await files.writeFile(largeFilePath, str)
          const { stdout } = await client('submit second-challenge ' + secondChallengeDir)
          expect(stdout).to.match(/Upload size too large/)
        })
      })
    })

    describe('status', () => {
      const secondChallengeDir = path.resolve(clientChallengeDir, 'second-challenge')

      beforeEach(async () => {
        await client('init second-challenge ' + clientChallengeDir)
      })

      it('can list status of no submits', async () => {
        const output = await client('status')
        expect(output.stdout).to.match(/second-challenge\s+Not submitted/)
      })

      it('can list status of one submit', async () => {
        await client('submit second-challenge ' + secondChallengeDir)
        const output = await client('status')
        expect(output.stdout).not.to.match(/second-challenge\s+Not submitted/)
        expect(output.stdout).to.match(/second-challenge\s+[\s\S]+?0%\n$/)
      })

      it('can list status of multiple submits', async function () {
        await client('submit second-challenge ' + secondChallengeDir)

        const indexFilePath = path.resolve(secondChallengeDir, 'index.js')
        await files.writeFile(indexFilePath, 'exports.addTwoNumbers = function (a, b) { return a + b }', 'utf8')
        await client('submit second-challenge ' + secondChallengeDir)

        const output = await client('status')
        expect(output.stdout).not.to.match(/second-challenge\s+Not submitted/)
        expect(output.stdout).to.match(/second-challenge\s+\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M\s+0%\s+\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M\s+75%\s+$/)
      })
    })
  })

  async function login (username) {
    const jar = request.jar()
    const res = await request({
      jar,
      resolveWithFullResponse: true,
      url: urlPrefix + '/login?user=' + username
    })

    if (res.statusCode !== 200) throw Error('Could not log in')

    return jar
  }

  async function client (command, options = {}) {
    const nodePath = process.argv[0]
    const clientPath = path.resolve(__dirname, '../client/index')
    return new Promise((resolve, reject) => {
      const fullCommand = '"' + nodePath + '" "' + clientPath + '" ' + command
      exec(fullCommand, options, function (err, stdout, stderr) {
        if (err) {
          console.log('Error executing command: ' + fullCommand)
          reject(err)
        } else {
          resolve({ stdout, stderr })
        }
      })
    })
  }
})
