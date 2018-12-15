const { Transform } = require('stream')
const { inherits } = require('util')

module.exports = StreamMeter

function StreamMeter (maxBytes) {
  Transform.call(this)
  this.bytes = 0
  this.maxBytes = maxBytes
}
inherits(StreamMeter, Transform)

StreamMeter.prototype._transform = function (chunk, encoding, cb) {
  this.bytes += chunk.length
  this.push(chunk)
  if (this.bytes > this.maxBytes) {
    const err = Error('Stream size exceeded maximum allowed')
    err.code = 'ECLIENTREQ'
    return cb(err)
  }
  cb()
}
