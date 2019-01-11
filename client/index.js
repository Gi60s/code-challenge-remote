#!/usr/bin/env node
'use strict'
const Client = require('./client')
const path = require('path')
const { request } = require('./request')

const args = Array.from(process.argv).slice(2)

;(async function () {
  const command = args[0]

  // check for login
  if (command === 'login') {
    const url = args[1]
    const sessionId = args[2]
    const client = await Client.login(url, sessionId)
    if (client) help(client)

  // request for help
  } else if (command === 'help') {
    help(Client.load(), args[1])

  // if local cache has login info...
  } else {
    const client = Client.load()

    if (!client) {
      help(null)

    // validate that the client session is valid
    } else if (!(await client.validateSession())) {
      console.log('Credentials have expired. Please log in again.\n')
      help(null)

    // init command
    } else if (command === 'init') {
      const challenge = args[1]
      const outputDir = args[2] ? path.resolve(process.cwd(), args[2]) : process.cwd()
      if (challenge) {
        client.initChallenge(challenge, outputDir)
          .then(() => console.log('Downloaded challenge to ' + path.resolve(outputDir, challenge)))
          .catch(err => { console.error(err.message) })
      } else {
        console.log('Missing required <challenge> input\n')
        help(client, 'init')
      }

    // clear the client session
    } else if (command === 'logout') {
      client.logout()

    // get assignment status
    } else if (command === 'status') {
      const status = await client.getStatus()
      if (status) {
        const challenges = status.challenges
        const keys = Object.keys(challenges)
        if (!keys.length) console.log('No challenges exist on the server')
        keys.forEach((key, index) => {
          const value = challenges[key]
          if (index > 0) console.log('')
          console.log(key)
          if (value.length) {
            value.forEach(v => {
              let score = String(Math.round(100 * v.score))
              score = ' '.repeat(3 - score.length) + score
              console.log('  ' + (new Date(v.date)).toLocaleString() + '    ' + score + '%')
            })
          } else {
            console.log('  Not submitted')
          }
        })
      } else {
        console.log('Unable to get status information')
      }

    // submit an assignment
    } else if (command === 'submit') {
      const challenge = args[1]
      const contentDir = args[2] ? path.resolve(process.cwd(), args[2]) : process.cwd()
      if (challenge) {
        client.submit(challenge, contentDir)
          .then(res => {
            if (res.body && res.body.body) {
              console.log(res.body.body)
            } else if (res.body) {
              console.log(res.body)
            } else {
              console.log(res)
            }
          })
          .catch(err => console.log(err.message))
      } else {
        console.log('Missing required <challenge> input\n')
        help(client, 'submit')
      }

    // unknown command
    } else if (command) {
      console.log('Invalid command: ' + command + '\n')
      help(client)

    // get help
    } else {
      help(client)
    }
  }

  async function help (client, command) {
    const message = []
    if (!command || command === 'help') {
      message.push('Usage:', '', '  challenge <command>', '', 'Status:', '')
      if (client) {
        message.push('  Logged in to ' + client.url)
        message.push('  Logged in as ' + client.user)
        message.push('')
        message.push('Commands:', '')
        message.push('  help [command]                 Output help')
        message.push('  init <challenge> [output_dir]  Download a challenge from the challenger server')
        message.push('  logout                         Log out of the client')
        message.push('  status                         See challenges and completion status')
        message.push('  submit <challenge> [dir]       Submit a challenge to the server')
      } else {
        message.push('  Please log in')
        message.push('')
        message.push('Commands:', '')
        message.push('  help [command]                 Output help')
        message.push('  login <remote_url> <sid>   Log in to the challenge server')
      }

      try {
        const { body: json } = await request({ url: 'https://api.npms.io/v2/package/code-challenge-remote' })
        const rx = /^(\d+)\.(\d+)\.(\d+)$/
        const latest = rx.exec(json.collected.metadata.version)
        const current = rx.exec(require(path.resolve(__dirname, '../package.json')).version)
        if ((+latest[1] > +current[1]) || (+latest[1] === +current[1] && +latest[2] > +current[2]) || (+latest[1] === +current[1] && +latest[2] === +current[2] && +latest[3] > +current[3])) {
          message.push('', 'Update available for code-challenge-remote', '')
          message.push('  Your version: ' + current[0])
          message.push('  Latest version: ' + latest[0])
          message.push('  Update command: npm install -g code-challenge-remote')
        }
      } catch (err) { }
    } else if (client) {
      switch (command) {
        case 'init':
          //           '123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 '
          message.push('Synopsis:', '', '  Download a challenge from the challenger server', '')
          message.push('Usage:', '', '  challenge init <challenge> [dir]', '', 'Arguments:', '')
          message.push('  challenge    The name of the challenge to download')
          message.push('  dir          The directory to download to (defaults to current directory)')
          break
        case 'logout':
          message.push('Synopsis:', '', '  Log out of the client', '')
          message.push('Usage:', '', '  challenge logout')
          break
        case 'status':
          message.push('Synopsis:', '', '  See challenges and completion status', '')
          message.push('Usage:', '', '  challenge status')
          break
        case 'submit':
          message.push('Synopsis:', '', '  Submit a challenge to the server', '')
          message.push('Usage:', '', '  submit <challenge> [dir]', '', 'Arguments:', '')
          message.push('  challenge    The name of the challenge to upload')
          message.push('  dir          The directory upload from (defaults to current directory)')
          break
        default:
          message.push('Command does not exist: ' + command)
          break
      }
    } else {
      switch (command) {
        case 'login':
          message.push('Usage:', '  challenge login <remote_url> <sid>', '', 'Arguments:')
          message.push('  remote_url   The URL to use to communicate with the challenge server.')
          message.push('  sid          The session id to log into the challenge server with')
          message.push('', 'The website hosting the challenge server should have this information on it')
          break
      }
    }

    message.push('')
    while (message.length) {
      console.log(message.shift())
    }
  }
})().catch(err => {
  console.error(err)
})
