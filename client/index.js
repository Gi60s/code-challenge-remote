#!/usr/bin/env node
'use strict'
const Client = require('./client')
const path = require('path')

const args = Array.from(process.argv).slice(2)

;(async function () {
  const command = args[0]

  // check for login
  if (command === 'login') {
    const url = args[1]
    const sessionId = args[2]
    const client = await Client.login(url, sessionId)
    if (client) help(client)

  // if local cache has login info...
  } else {
    const client = Client.load()

    if (!client) {
      help(null)

    // validate that the client session is valid
    } else if (!(await client.validateSession())) {
      console.log('Credentials have expired. Please log in again.')

    // init command
    } else if (command === 'init') {
      const challenge = args[1]
      const outputDir = args[2] ? path.resolve(process.cwd(), args[2]) : process.cwd()
      client.initChallenge(challenge, outputDir)

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
              console.log('  ' + (new Date(v.date)).toString() + '  ' + v.score)
            })
          } else {
            console.log('  Not submitted')
          }
        })
      }

    // submit an assignment
    } else if (command === 'submit') {
      const challenge = args[1]
      const contentDir = args[2] ? path.resolve(process.cwd(), args[2]) : process.cwd()
      client.submit(challenge, contentDir)

    // unknown command
    } else if (command) {
      console.log('Invalid command: ' + command + '\n')
      help(client)

    // get help
    } else {
      help(client)
    }
  }

  function help (client) {
    const message = []
    message.push('Usage:', '  challenge <command>', '', 'Status:')
    if (client) {
      message.push('  Logged in to ' + client.url)
      message.push('  Logged in as ' + client.user)
      message.push('')
      message.push('Commands:')
      message.push('  help                       Output this help')
      message.push('  init <name> <output_dir>   Download a challenge to your computer')
      message.push('  logout                     Log out of the client')
      message.push('  status                     See challenges and completion status')
      message.push('  submit <name> [dir]        Submit a challenge to the server')
    } else {
      message.push('  Please log in')
      message.push('')
      message.push('Commands:')
      message.push('  help                       Output this help')
      message.push('  login <remote_url> <sid>   Log in to the challenge server')
    }
    message.push('')

    while (message.length) {
      console.log(message.shift())
    }
  }
})()
