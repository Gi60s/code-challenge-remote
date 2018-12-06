'use strict'
const debug = require('code-challenge:file-store')
const fs = require('fs')
const path = require('path')
const util = require('util')

const mkdir = util.promisify(fs.mkdir)
const readFile = util.promisify(fs.readFile)
const stat = util.promisify(fs.stat)
const writeFile = util.promisify(fs.writeFile)

module.exports = function (directory) {
  if (!directory || typeof directory !== 'string') throw Error('Required property "directory" must be a non empty string')

  const directoryExists = ensureDirectoryExists(directory)

  async function save (userId, challengeName, date, score) {
    await directoryExists

    const filePath = getFileName(directory, userId)
    const data = await getContent(filePath)
    if (!data[challengeName]) data[challengeName] = []
    data[challengeName].push({
      date: date.toISOString(),
      score
    })

    writeFile(filePath, JSON.stringify(data))
  }

  function load (userId) {
    const filePath = getFileName(directory, userId)
    return getContent(filePath)
  }

  return { save, load }
}

async function ensureDirectoryExists (directory) {
  debug('creating directory')
  try {
    mkdir(directory)
    debug('created directory')
  } catch (err) {
    if (err.code === 'EEXIST') {
      debug('file already exists')
      const stats = await stat(directory)
      if (stats.isDirectory()) {
        debug('file is directory')
      } else {
        throw Error('Could not create store')
      }
    }
  }
}

function getContent (filePath) {
  let content = '{}'
  try {
    content = readFile(filePath, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  return JSON.parse(content)
}

function getFileName (directory, userId) {
  return path.resolve(directory, 'd_' + userId)
}
