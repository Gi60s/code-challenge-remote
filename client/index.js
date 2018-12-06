#!/usr/bin/env node
'use strict'
const store = require('./store')

const args = Array.from(process.argv).slice(2)

;(async function () {
  const data = await store.read()
  if (data.remoteUrl) {

  } else {
    help()
  }

  function help () {
    const message = []
    message.push('Usage:', '  challenge <command>', '', 'Status:')
    if (data.remoteUrl) {
      message.push('  Logged in to ' + data.remoteUrl)
      message.push('  Logged in as ' + data.user)
      message.push('')
      message.push('Commands:')
      message.push('  help                       Output this help')
      message.push('  init <name> <output_dir>   Download a challenge to your computer')
      message.push('  logout                     Log out of the client')
      message.push('  status                     See challenges and completion status')
      message.push('  submit [challenge_dir]     Submit a challenge to the server')
      message.push('  test [challenge_dir]       Test a challenge locally')
    } else {
      message.push('  Please log in')
      message.push('')
      message.push('Commands:')
      message.push('  help                       Output this help')
      message.push('  login <remote_url>         Log in to the challenge server')
    }
    message.push('')

    while (message.length) {
      console.log(message.shift())
    }
  }
})()
