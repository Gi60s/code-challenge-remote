'use strict'
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

exports.readDir = promisify(fs.readdir)
exports.readFile = promisify(fs.readFile)
exports.writeFile = promisify(fs.writeFile)
exports.stat = promisify(fs.stat)

exports.isDirectory = function (filePath) {
  return exports.stat(filePath)
    .then(stats => {
      return stats.isDirectory()
    })
    .catch(err => {
      if (err.code === 'ENOENT') return false
      throw err
    })
}

exports.isFile = function (filePath) {
  return exports.stat(filePath)
    .then(stats => {
      return stats.isFile()
    })
    .catch(err => {
      if (err.code === 'ENOENT') return false
      throw err
    })
}

exports.readDirFiles = async function (dirPath, { recursive = true, filter = () => true } = {}) {
  const files = await exports.readDir(dirPath)
  const fullPaths = files.map(f => path.resolve(dirPath, f))
  const results = []

  const promises = fullPaths.map(async fullPath => {
    const stats = await exports.stat(fullPath)
    if (filter(fullPath)) {
      if (stats.isFile()) {
        results.push(fullPath)
      } else if (stats.isDirectory()) {
        const array = await exports.readDirFiles(fullPath, { recursive, filter })
        array.forEach(item => results.push(item))
      }
    }
  })

  await Promise.all(promises)

  return results
}
