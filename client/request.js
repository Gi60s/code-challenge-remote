'use strict'
const http = require('http')
const https = require('https')

const rxUrl = /^(https?:)\/\/([^:/]+)(?::(\d+))?(\/.*)?$/

exports.download = function (client, challenge) {
  return new Promise((resolve, reject) => {
    const options = getUrlParts('GET', client.url + '/download/' + challenge)
    options.headers = { cookie: client.cookie }
    const mode = options.protocol === 'http:' ? http : https

    const req = mode.request(options, res => {
      resolve(res)
    })

    req.on('error', reject)

    req.end()
  })
}

exports.request = function ({ body, headers = {}, method = 'GET', url }) {
  return new Promise((resolve, reject) => {
    const options = getUrlParts(method, url)
    options.method = method.toUpperCase()
    options.headers = headers
    const mode = options.protocol === 'http:' ? http : https

    if (body) {
      if (typeof body === 'object') body = JSON.stringify(body)
      headers['content-type'] = 'application/json'
    }

    const req = mode.request(options, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        if (res.headers['content-type'].startsWith('application/json')) {
          try {
            data = JSON.parse(data)
          } catch (err) {}
        }
        res.body = data
        resolve(res)
      })
    })

    req.on('error', reject)

    if (body) req.write(body)
    req.end()
  })
}

exports.upload = function (client, challenge, readable) {
  return new Promise((resolve, reject) => {
    const options = getUrlParts('POST', client.url + '/upload/' + challenge)
    options.headers = {
      'content-type': 'application/octet',
      cookie: client.cookie
    }
    const mode = options.protocol === 'http:' ? http : https

    const req = mode.request(options, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        if (res.headers && res.headers['content-type'] && res.headers['content-type'].startsWith('application/json')) {
          try {
            data = JSON.parse(data)
          } catch (err) {}
        }
        res.body = data
        resolve(res)
      })
    })

    req.on('error', reject)

    readable.pipe(req)
  })
}

function getUrlParts (method, url) {
  const match = rxUrl.exec(url)
  if (!match) throw Error('Invalid URL')
  const protocol = match[1]
  const hostname = match[2]
  const port = +(match[3] || (protocol === 'http' ? 80 : 443))
  const path = match[4]

  return {
    method,
    protocol,
    hostname,
    path,
    port
  }
}
