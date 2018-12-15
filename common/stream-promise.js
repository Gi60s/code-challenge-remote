'use strict'

module.exports = function (stream) {
  return new Promise((resolve, reject) => {
    stream.on('error', err => {
      reject(err)
    })

    stream.on('close', () => {
      resolve()
    })

    stream.on('end', () => {
      resolve()
    })
  })
}