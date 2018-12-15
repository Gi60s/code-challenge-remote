'use strict'
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

exports.chmod = promisify(fs.chmod)
exports.copyFile = promisify(fs.copyFile)
exports.mkDir = promisify(fs.mkdir)
exports.readDir = promisify(fs.readdir)
exports.readFile = promisify(fs.readFile)
exports.stat = promisify(fs.stat)
exports.unlink = promisify(fs.unlink)
exports.writeFile = promisify(fs.writeFile)

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

exports.rmDir = async function (dirPath) {
  try {
    const filePaths = await exports.readDir(dirPath)
    const promises = filePaths.map(async filePath => {
      const fullPath = path.resolve(dirPath, filePath)
      const stats = await exports.stat(fullPath)
      try {
        await (stats.isDirectory() ? exports.rmDir(fullPath) : exports.unlink(fullPath))
      } catch (err) {
        if (err.code === 'EACCES') {
          await exports.chmod(fullPath, 0o777)
          await (stats.isDirectory() ? exports.rmDir(fullPath) : exports.unlink(fullPath))
        } else {
          throw err
        }
      }
    })
    return Promise.all(promises)
      .then(() => {
        return new Promise((resolve, reject) => {
          fs.rmdir(dirPath, function (err) {
            if (err) return reject(err)
            resolve()
          })
        })
      })
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }
}

exports.overwrite = async function (source, dest) {
  const files = await exports.readDirFiles(source)
  const length = files.length
  const dirMap = {}

  const promises = []
  for (let i = 0; i < length; i++) {
    const sourceFilePath = files[i]
    const relativePath = path.relative(source, sourceFilePath)
    const destFilePath = path.resolve(dest, relativePath)
    const destPathDir = path.dirname(destFilePath)

    // make sure that the copy destination directory exists
    let dirPromise
    if (dirMap[destPathDir]) {
      dirPromise = Promise.resolve()
    } else {
      dirPromise = exports.isDirectory(destPathDir)
        .then(isDir => !isDir ? exports.mkDir(destPathDir, { recursive: true }) : null)
        .then(() => {
          dirMap[destPathDir] = true
        })
    }

    const promise = dirPromise
      .then(() => exports.copyFile(sourceFilePath, destFilePath))

    promises.push(promise)
  }

  await Promise.all(promises)
}
