'use strict'
const archiver = require('archiver');
const decompress = require('decompress');
const fs = require('fs');
const http = require('http')
const path = require('path');
const tempDir = require('os').tmpdir();

const appDataPath = path.resolve(tempDir, 'remote-code-challenge.dat');
const zipPath = path.resolve(tempDir, 'remote-code-challenge.zip');

/**
 *
 * @param {string} url The URL that the code challenge server will respond to.
 * @constructor
 */
function CodeChallengeClient (url) {
  if (url[url.length - 1] !== '/') url += '/'
  Object.defineProperty(this, 'url', { value: url })
}

CodeChallengeClient.prototype.getChallenges = function () {

}

CodeChallengeClient.prototype.initChallenge = function (name, outputDirectory) {
  const url = this.url + 'download/' + name
  return new Promise((resolve, reject) => {
    const req = http.request(url, (res) => {
      if (res.statusCode !== 200) return reject(Error(res.body))

      const zipPath = path.resolve(tempDir, 'remote-code-challenge__' + name + '.zip')
      const ws = fs.createWriteStream(zipPath);

      // wait for zip file to finish write before decompress
      ws.on('close', () => {
        const out = path.resolve(outputDirectory, name);
        decompress(zipPath, out)
          .then(files => {
            fs.unlink(zipPath, () => {});
            console.log(`Downloaded ${files.length} files to ${out}`);
          })
          .then(resolve, reject);
      });

      res.pipe(ws)
    })

    req.end()
  })
}

/**
 * Direct the user to open a browser to a specific URL, get a code, and paste it here
 */
CodeChallengeClient.prototype.login = function () {
  const url = this.url + 'login'
}

/**
 * Destroy temporary login file
 */
CodeChallengeClient.prototype.logout = function () {

}

/**
 * Submit a challenge for testing
 * @param name
 * @param directory
 */
CodeChallengeClient.prototype.submit = function (name, directory) {

}

function request({ body, headers, method, url}) {
  return new Promise(function (resolve, reject) {
    const options = {
      headers: headers || {},
      method: method
    }

    if (body && typeof body === 'object') {
      body = JSON.stringify(body)
      options.headers['content-type'] = 'application/json'
    }

    const req = http.request(url, options, function(res) {
      console.log('STATUS: ' + res.statusCode)
      console.log('HEADERS: ' + JSON.stringify(res.headers))
      res.setEncoding('utf8')
      res.on('data', function (chunk) {
        console.log('BODY: ' + chunk)
      })
    })

    req.on('error', reject)

    if (body) req.write(body)

    req.end()
  })
}