'use strict'
const express = require('express')
const session = require('express-session')
const Challenge = require('../middleware')
const path = require('path')

module.exports = function (port) {
  const app = express()
  const cookieName = 'my-cookie'

  const challenge = new Challenge({
    challengePath: path.resolve(__dirname, 'challenges'),
    challengeUrl: 'http://localhost:' + port + '/challenge',
    getUserId: req => {
      if (!req.session || !req.session.user) return null
      return {
        id: req.session.user,
        username: req.session.user
      }
    },
    sessionCookieName: cookieName,
    store: Challenge.fileStore(path.resolve(__dirname, 'store'))
  })

  app.use(session({
    name: cookieName,
    secret: 'secret',
    resave: false,
    saveUninitialized: false
  }))

  app.use('/challenge', challenge.middleware())

  app.get('/login', (req, res) => {
    const user = req.query.user
    if (user) {
      req.session.user = user
      req.session.save()
      res.status(200)
      res.send(challenge.getLoginCommand(req))
    } else {
      res.sendStatus(403)
    }
  })

  app.get('/logout', (req, res) => {
    req.session.destroy(function (err) {
      if (err) {
        console.error(err.stack)
        res.sendStatus(500)
      } else {
        res.sendStatus(200)
      }
    })
  })

  app.get('/status', (req, res) => {
    const user = req.session.user
    res.set('content-type', 'text/plain')
    if (user) {
      res.send('Logged in as ' + user + '\n\n' + challenge.getLoginCommand(req))
    } else {
      res.send('Not logged in')
    }
  })

  return new Promise((resolve, reject) => {
    const listener = app.listen(port, function (err) {
      if (err) {
        reject(err)
      } else {
        resolve(listener)
      }
    })
  })
}
