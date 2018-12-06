'use strict'
const fs = require('fs')
const { promisify } = require('util')

exports.readDir = promisify(fs.readdir)
exports.readFile = promisify(fs.readFile)
exports.writeFile = promisify(fs.writeFile)
exports.stat = promisify(fs.stat)
