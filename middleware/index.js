'use strict'
const fileStore = require('./file-store')

module.exports = Challenge

function Challenge (options) {
  options = Object.assign({}, options)
  if (!options.challengePath || typeof options.challengePath !== 'string') throw Error('You must specify a non empty string for the challengePath')
  if (typeof options.getUserName !== 'function') throw Error('Option getUserName must be a function that gets the user\'s name')
  if (!options.store || typeof options.store !== 'object' || typeof options.store.save !== 'function' || typeof options.store.load !== 'function') throw Error('Invalid store provided')
  if (!options.hasOwnProperty('sessionCookieName')) options.sessionCookieName = 'connect.sid'

  this.config = options
  this.store = options.store
}

Challenge.prototype.getLoginCommand = function (req) {
  return 'code-challenge login "' + this.config.challengePath + '/login" "' + this.getSessionId(req) + '"'
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

Challenge.prototype.middleware = function (req, res) {
  const value = this.getSessionId(req)
  if (!value) return res.sendStatus(401)

  switch (req.path) {
    case '/login':
      // call getUserName with callback paradigm
      if (this.config.getUserName.length > 1) {
        this.config.getUserName(req, function (err, username) {
          if (err) {
            console.error(err.stack)
            res.sendStatus(500)
          } else {
            res.status(200).send(username)
          }
        })

        // call getUserName with promise paradigm
      } else {
        Promise.resolve(this.config.getUserName(req))
          .then(function (username) {
            res.status(200).send(username)
          })
          .catch(function (err) {
            console.error(err.stack)
            res.sendStatus(500)
          })
      }
      break

    case '/login-command':
      res.status(200)
        .set('content-type', 'text/plain')
        .send(this.getLoginCommand(req))
      break

    case '/session-id':
      res.status(200).send(value)
      break

    default:
      res.sendStatus(404)
  }
}

Challenge.fileStore = fileStore
