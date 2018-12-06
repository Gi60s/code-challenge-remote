'use strict'
const express = require('express')
const session = require('express-session')
const Challenge = require('../middleware')
const path = require('path')

const app = express()
const cookieName = 'my-cookie'

app.use(session({
  name: cookieName,
  secret: 'secret',
  resave: false,
  saveUninitialized: false
}))

const challenge = new Challenge({
  challengePath: 'http://localhost:3000/challenge',
  getUserName: req => {
    return {
      id: req.session.user,
      username: req.session.user
    }
  },
  sessionCookieName: cookieName,
  store: Challenge.fileStore(path.resolve(__dirname, 'store'))
})
app.use('/challenge', challenge.middleware)

app.get('/login', (req, res) => {
  const user = req.query.user
  if (user) {
    req.session.user = user
    req.session.save()
    res.sendStatus(200)
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
  res.send(user ? 'Logged in as: ' + user : 'Not logged in')
})

app.listen(3000, function (err) {
  if (err) {
    console.error(err)
  } else {
    console.log('Listening on port 3000')
  }
})