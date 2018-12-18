'use strict'
const archiver = require('archiver')
const files = require('./files')
const path = require('path')
const unzip = require('unzip')

exports.unzip = function (stream, destination) {
  return new Promise((resolve, reject) => {
    const extract = unzip.Extract({ path: destination })
    extract.on('error', err => {
      reject(err)
    })
    extract.on('close', () => {
      resolve()
    })
    stream.on('error', err => {
      reject(err)
    })
    stream.on('close', () => {
      resolve()
    })
    stream.pipe(extract)
  })
}

/**
 * Convert a directory into a zip file.
 * @param {string} dirPath The directory to zip up.
 * @param {string[]} [ignored] Path match array for files to not include in the archive
 * @returns {Readable} A readable stream that has promise .then and .catch
 */
exports.zip = function (dirPath, ignored = []) {
  // create zip from files
  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  })

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', err => {
    if (err.code === 'ENOENT') {
      console.warn(err.message)
    } else {
      throw err
    }
  })

  // get only file path for files that don't reside within node modules and that are not private
  const ignoredLength = ignored.length
  const filter = filePath => {
    for (let i = 0; i < ignoredLength; i++) {
      if (filePath.includes(ignored[i])) return false
    }
    return true
  }

  files.readDirFiles(dirPath, { filter })
    .then(fullPaths => {
      fullPaths.forEach(fullPath => {
        const relative = path.relative(dirPath, fullPath)
        archive.file(fullPath, { name: relative })
      })

      // finalize the archive (ie we are done appending files but streams have to finish yet)
      archive.finalize()
    })

  return archive
}
